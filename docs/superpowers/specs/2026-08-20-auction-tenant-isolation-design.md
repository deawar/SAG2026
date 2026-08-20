# Auction tenant isolation (cross-school authorization) — Design

**Date:** 2026-08-20
**Status:** Design approved (chat), pending spec review

## Problem

A `SCHOOL_ADMIN` is only authorized over their own school, but several auction
paths enforce **role** without enforcing **school ownership**, so a SCHOOL_ADMIN
at School A can act on School B's auctions and data. Three related gaps:

1. **The public `/api/auctions` action endpoints lack a school check.** Their
   in-controller role check allows SITE_ADMIN and SCHOOL_ADMIN, but they never
   verify the auction's `school_id` matches the actor's, so a SCHOOL_ADMIN can
   act on any school's auction:
   - `POST   /api/auctions/:id/start`  → `auctionController.startAuction`
   - `POST   /api/auctions/:id/end`    → `auctionController.endAuction`
   - `POST   /api/auctions/:id/extend` → `auctionController.extendAuction`
   - `DELETE /api/auctions/:id`        → `auctionController.deleteAuction`

   **NOT affected (verified already safe — do not change):** the parallel
   `/api/admin/auctions/*` actions (approve, activate, reject, fee, extend,
   close, delete) already enforce tenancy in `adminService` — every method runs
   `if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id)
   throw 'CROSS_SCHOOL_ACCESS_DENIED'`. This spec must not touch those working
   methods; it brings the public endpoints up to the same standard.

2. **Create can target another tenant.** `auctionController.js:31`
   `const resolvedSchoolId = req.user.role === 'TEACHER' ? userSchoolId : (schoolId || userSchoolId);`
   TEACHER is pinned to their own school, but SCHOOL_ADMIN (and the fallthrough)
   honors a client-supplied `schoolId`, so a SCHOOL_ADMIN can create an auction
   inside another school.

3. **Artwork can be re-parented across tenants.** `auctionService.js:85`
   `UPDATE artwork SET auction_id = $1 WHERE id IN (<client artworkIds>)` attaches
   client-supplied `artworkIds` with no ownership filter, so a teacher/admin can
   pull another school's student artwork into their own auction.

## Goal

Enforce school ownership on every auction mutation so a SCHOOL_ADMIN can only
act within their own school (SITE_ADMIN keeps cross-school reach), pin auction
creation to the actor's tenant, and reject cross-school artwork attachment.
No behavior change for same-school actions.

## Current state (verified)

- `req.user.schoolId` is reliable for SCHOOL_ADMIN — `authMiddleware.verifyToken`
  DB-hydrates it (does not trust the JWT claim for SCHOOL_ADMIN).
- `auctionController` has `pool` (`require('../models/index')`) and calls the
  service with just the id (e.g. `auctionService.startAuction(auctionId)`), after
  an in-controller role check at lines 301/329/358/386.
- `adminController` auction methods call `adminService.X(auctionId, adminId[, …])`
  and do NOT load/compare school. `adminService` already loads the acting admin
  and applies the SCHOOL_ADMIN school-match pattern elsewhere (adminService.js:45:
  `if (admin.role === 'SCHOOL_ADMIN' && user.school_id !== admin.school_id) → 403`).
- `artwork` has NO `school_id` column; its tenant is via
  `created_by_user_id → users.school_id`. `artwork.auction_id` is `NOT NULL`.
- Auction rows carry `school_id`.

## Design

### 1. Shared tenancy helper

A pure, unit-tested predicate/guard (e.g. `src/utils/auctionTenancy.js`):

```
// Returns true if the actor may manage an auction in auctionSchoolId.
function schoolCanManage(actorRole, actorSchoolId, auctionSchoolId) {
  if (actorRole === 'SITE_ADMIN') return true;      // all schools
  return !!actorSchoolId && actorSchoolId === auctionSchoolId; // SCHOOL_ADMIN: own only
}
```

Semantics when applied at a call site:
- auction not found → **404** (`AUCTION_NOT_FOUND`).
- actor is SCHOOL_ADMIN and schools differ → **403** (`CROSS_TENANT` /
  "You can only manage auctions for your own school").
- SITE_ADMIN → always allowed.

The helper is pure (no DB); each call site loads the auction's `school_id` and
passes it in, so the helper is trivially testable and the DB read stays in the
layer that already has a connection.

### 2. Apply the guard to the public auction actions

**auctionController** (`startAuction`, `endAuction`, `extendAuction`,
`deleteAuction`): after the existing role check, load the auction's `school_id`
via `pool` (`SELECT school_id FROM auctions WHERE id = $1 AND deleted_at IS NULL`);
404 if absent; call `schoolCanManage(req.user.role, req.user.schoolId,
row.school_id)`; 403 if false; otherwise proceed to the existing service call.

**adminService is intentionally NOT modified** — its seven auction methods
already run the equivalent SCHOOL_ADMIN school-match and throw
`CROSS_SCHOOL_ACCESS_DENIED` (403). This design only closes the public-endpoint
gap and reuses that same behavior via the shared helper.

### 3. Pin create to the actor's tenant

`auctionController.createAuction` (line 31):

```
const resolvedSchoolId =
  req.user.role === 'SITE_ADMIN' ? (schoolId || userSchoolId) : userSchoolId;
```

TEACHER and SCHOOL_ADMIN both resolve to their own `userSchoolId`; only
SITE_ADMIN may specify another school's `schoolId`. The existing "TEACHER with no
school assigned" guard extends to SCHOOL_ADMIN (both need a school).

### 4. Reject cross-school artwork (fail-closed)

`auctionService.createAuction` artwork attachment: only attach artwork whose
creator belongs to the auction's school, and reject the whole request if any
requested id does not qualify.

```
const result = await client.query(
  `UPDATE artwork SET auction_id = $1
     WHERE id IN (<ids>)
       AND created_by_user_id IN (SELECT id FROM users WHERE school_id = $schoolId)`,
  [auction.id, ...artworkIds]
);
if (result.rowCount !== artworkIds.length) {
  throw new Error('ARTWORK_NOT_IN_SCHOOL'); // → ROLLBACK → 400
}
```

`schoolId` here is the resolved auction school (already pinned by §3). A mismatch
(foreign, nonexistent, or otherwise ineligible id) rolls back the transaction and
returns **400** ("One or more selected artworks do not belong to this school").
Chosen over silently dropping foreign ids so cross-tenant attempts surface.

## Error / edge handling

- Same-school actions: unchanged behavior.
- Missing auction: 404 (existing behavior for most actions preserved).
- Cross-tenant action: 403 with a clear message; nothing mutated.
- Cross-school / invalid artwork on create: 400; transaction rolled back; no
  auction persisted (the artwork check runs inside the create transaction).
- SITE_ADMIN: unaffected (full cross-school reach retained).

## Testing

Integration (supertest + mockDb, cookie auth via `authCookie` helper):
- For each of the 4 newly guarded public endpoints (start, end, extend, delete):
  a School-A SCHOOL_ADMIN acting on a School-B auction → **403**, and a
  same-school action → not 403 (proceeds).
- `createAuction`: a SCHOOL_ADMIN passing a different `schoolId` creates the
  auction under **their own** school, not the supplied one; SITE_ADMIN may still
  target another school.
- `createAuction`: artworkIds containing a foreign/ineligible id → **400**, no
  auction created; all-same-school ids → success.

Unit:
- `schoolCanManage`: SITE_ADMIN always true; SCHOOL_ADMIN true only on match;
  null/undefined actor school → false.

## Files touched (estimate)

- **New:** `src/utils/auctionTenancy.js` (+ unit test).
- `src/controllers/auctionController.js` — create pin (line 31) + guard in
  start/end/extend/delete.
- `src/services/auctionService.js` — artwork ownership filter + fail-closed check.
- `src/services/adminService.js` — **NOT changed** (already enforces tenancy).
- Tests: unit for the helper; integration for the 4 public endpoints, create pin,
  and artwork rejection.

## Out of scope

- Broader IDOR review of non-auction resources (bids, payments, portfolios).
- Changing the role model or the reports school-scoping (already correct).
- `updateAuction` owner semantics (already owner-scoped; revisit only if the
  final review finds a cross-tenant path).
