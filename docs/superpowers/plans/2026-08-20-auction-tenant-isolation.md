# Auction Tenant Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a SCHOOL_ADMIN from acting on another school's auctions (start/end/extend/delete), from creating auctions inside another tenant, and from re-parenting another school's artwork.

**Architecture:** A pure `schoolCanManage(actorRole, actorSchoolId, auctionSchoolId)` helper enforces the SITE_ADMIN-all / SCHOOL_ADMIN-own rule. The four unguarded public `auctionController` actions load the auction's `school_id` and apply it; `createAuction` pins the school to the actor's tenant; `auctionService.createAuction` filters client `artworkIds` to the auction's school and fails closed. The parallel `/api/admin/auctions/*` methods already enforce this in `adminService` and are left untouched.

**Tech Stack:** Node/Express, `pg` (`pool` from `src/models/index`), Jest + supertest. Tests mock `src/models/index`'s `pool` (pattern already used in `tests/integration/routes/auctionRoutesIntegrationTest.spec.js`) and authenticate via the `access_token` cookie (`tests/helpers/authCookie.js`).

**Spec:** `docs/superpowers/specs/2026-08-20-auction-tenant-isolation-design.md`

## Global Constraints

- `schoolCanManage(actorRole, actorSchoolId, auctionSchoolId)`: `SITE_ADMIN` → always `true`; otherwise `true` iff `actorSchoolId` is truthy AND strictly `=== auctionSchoolId`.
- Cross-tenant SCHOOL_ADMIN action → HTTP **403**; auction not found → **404**; cross-school/ineligible artwork on create → **400** with the transaction rolled back (no auction persisted).
- Only SITE_ADMIN may create an auction for a school other than their own; TEACHER and SCHOOL_ADMIN are pinned to `req.user.schoolId`.
- **Do NOT modify `src/services/adminService.js`** — its 7 auction methods already enforce `CROSS_SCHOOL_ACCESS_DENIED`.
- Keep the full suite green (`npm test` → 0 failures) and lint at baseline (`npm run lint` → exit 0) at every commit.

---

### Task 1: `schoolCanManage` tenancy helper

**Files:**
- Create: `src/utils/auctionTenancy.js`
- Test: `tests/unit/utils/auctionTenancy.test.js`

**Interfaces:**
- Produces: `schoolCanManage(actorRole: string, actorSchoolId: string|null, auctionSchoolId: string|null): boolean`.

- [ ] **Step 1: Write the failing test**

```js
const { schoolCanManage } = require('../../../src/utils/auctionTenancy');

describe('schoolCanManage', () => {
  test('SITE_ADMIN can manage any school (even with null own school)', () => {
    expect(schoolCanManage('SITE_ADMIN', null, 'school-B')).toBe(true);
    expect(schoolCanManage('SITE_ADMIN', 'school-A', 'school-B')).toBe(true);
  });
  test('SCHOOL_ADMIN can manage only their own school', () => {
    expect(schoolCanManage('SCHOOL_ADMIN', 'school-A', 'school-A')).toBe(true);
    expect(schoolCanManage('SCHOOL_ADMIN', 'school-A', 'school-B')).toBe(false);
  });
  test('SCHOOL_ADMIN with no school never matches', () => {
    expect(schoolCanManage('SCHOOL_ADMIN', null, 'school-A')).toBe(false);
    expect(schoolCanManage('SCHOOL_ADMIN', undefined, undefined)).toBe(false);
  });
  test('other roles cannot manage', () => {
    expect(schoolCanManage('TEACHER', 'school-A', 'school-A')).toBe(false);
    expect(schoolCanManage('STUDENT', 'school-A', 'school-A')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/utils/auctionTenancy.test.js`
Expected: FAIL — cannot find module `auctionTenancy`.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * Tenant-isolation predicate for auction management.
 * SITE_ADMIN manages every school; SCHOOL_ADMIN manages only their own.
 * Pure — the caller loads the auction's school_id and passes it in.
 * @param {string} actorRole
 * @param {string|null|undefined} actorSchoolId
 * @param {string|null|undefined} auctionSchoolId
 * @returns {boolean}
 */
function schoolCanManage(actorRole, actorSchoolId, auctionSchoolId) {
  if (actorRole === 'SITE_ADMIN') { return true; }
  if (actorRole === 'SCHOOL_ADMIN') {
    return !!actorSchoolId && actorSchoolId === auctionSchoolId;
  }
  return false;
}

module.exports = { schoolCanManage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/utils/auctionTenancy.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/utils/auctionTenancy.js tests/unit/utils/auctionTenancy.test.js
git commit -m "feat(auth): schoolCanManage tenancy predicate for auction actions"
```

---

### Task 2: Guard the public auction actions + pin create to tenant

**Files:**
- Modify: `src/controllers/auctionController.js` — `createAuction` (line 31), `startAuction` (~296), `endAuction` (~324), `extendAuction` (~352), `deleteAuction` (~381).
- Test: `tests/integration/routes/auctionTenancyIntegrationTest.spec.js` (new)

**Interfaces:**
- Consumes: `schoolCanManage` from `src/utils/auctionTenancy` (Task 1); `pool` (already imported at `auctionController.js:8` as `const { pool } = require('../models/index')`).
- Produces: the four public actions return 403 on cross-tenant, 404 on missing auction; `createAuction` resolves the school to the actor's own unless SITE_ADMIN.

- [ ] **Step 1: Write the failing test**

```js
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

// Intercept pool.query used directly by auctionController + verifyToken.
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const { authCookie } = require('../../helpers/authCookie');

const SECRET = process.env.JWT_ACCESS_SECRET;
const schoolAdminA = () => jwt.sign({ sub: 'admin-A', role: 'SCHOOL_ADMIN', schoolId: 'school-A' }, SECRET, { algorithm: 'HS256' });

// Query-aware pool: verifyToken hydrates SCHOOL_ADMIN school from users; the
// guard reads the auction's school from auctions.
function wirePool(auctionSchoolId) {
  mockPool.query.mockImplementation((sql) => {
    if (/FROM users WHERE id/i.test(sql)) {
      return Promise.resolve({ rows: [{ school_id: 'school-A' }], rowCount: 1 });
    }
    if (/FROM auctions WHERE id/i.test(sql)) {
      return Promise.resolve({ rows: [{ school_id: auctionSchoolId }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

describe('Auction tenant isolation — public actions', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockDb.reset(); });

  const actions = [
    ['post', '/api/auctions/auc-1/start'],
    ['post', '/api/auctions/auc-1/end'],
    ['post', '/api/auctions/auc-1/extend'],
    ['delete', '/api/auctions/auc-1']
  ];

  test.each(actions)('%s %s → 403 when SCHOOL_ADMIN acts on another school', async (method, path) => {
    wirePool('school-B'); // auction belongs to School B
    const res = await request(app)[method](path).set(authCookie(schoolAdminA())).send({});
    expect(res.status).toBe(403);
  });

  test('start → 404 when the auction does not exist', async () => {
    mockPool.query.mockImplementation((sql) =>
      /FROM users WHERE id/i.test(sql)
        ? Promise.resolve({ rows: [{ school_id: 'school-A' }], rowCount: 1 })
        : Promise.resolve({ rows: [], rowCount: 0 }));
    const res = await request(app).post('/api/auctions/nope/start').set(authCookie(schoolAdminA())).send({});
    expect(res.status).toBe(404);
  });

  test('same-school action is NOT blocked by the tenancy guard (not 403/404)', async () => {
    wirePool('school-A'); // auction belongs to School A (same as admin)
    const res = await request(app).post('/api/auctions/auc-1/start').set(authCookie(schoolAdminA())).send({});
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/integration/routes/auctionTenancyIntegrationTest.spec.js`
Expected: FAIL — the 403/404 cases return the service's result/400 because no guard exists yet.

- [ ] **Step 3: Add the import**

At the top of `src/controllers/auctionController.js`, after the existing `pool` import (line 8), add:
```js
const { schoolCanManage } = require('../utils/auctionTenancy');
```

- [ ] **Step 4: Pin `createAuction` to the actor's tenant**

In `createAuction`, replace line 31:
```js
const resolvedSchoolId = req.user.role === 'TEACHER' ? userSchoolId : (schoolId || userSchoolId);
```
with:
```js
// Only SITE_ADMIN may target another school; TEACHER and SCHOOL_ADMIN are
// pinned to their own tenant.
const resolvedSchoolId = req.user.role === 'SITE_ADMIN' ? (schoolId || userSchoolId) : userSchoolId;
```
Also broaden the "no school assigned" guard immediately below it so it fires for a SCHOOL_ADMIN too — change:
```js
if (req.user.role === 'TEACHER' && !resolvedSchoolId) {
```
to:
```js
if (req.user.role !== 'SITE_ADMIN' && !resolvedSchoolId) {
```

- [ ] **Step 5: Add the guard to the four public actions**

In each of `startAuction`, `endAuction`, `extendAuction`, `deleteAuction`, immediately AFTER the existing role-check block (`if (!['SITE_ADMIN','SCHOOL_ADMIN'].includes(req.user?.role)) { ... }`) and BEFORE the `auctionService.*` call, insert:
```js
      // Tenant isolation: a SCHOOL_ADMIN may only act on their own school's auctions.
      const ownerRow = await pool.query(
        'SELECT school_id FROM auctions WHERE id = $1 AND deleted_at IS NULL',
        [auctionId]
      );
      if (ownerRow.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Auction not found' });
      }
      if (!schoolCanManage(req.user.role, req.user.schoolId, ownerRow.rows[0].school_id)) {
        return res.status(403).json({
          success: false,
          message: 'You can only manage auctions for your own school'
        });
      }
```
(`auctionId` is already destructured from `req.params` at the top of each method.)

- [ ] **Step 6: Run the new test + full suite**

Run: `npx jest tests/integration/routes/auctionTenancyIntegrationTest.spec.js` → PASS.
Run: `npm test` → 0 failures. (If any existing auction test now hits the guard, give its mocked `pool.query` a `FROM auctions` branch returning a matching `school_id`, or use a SITE_ADMIN token.)

- [ ] **Step 7: Commit**

```bash
git add src/controllers/auctionController.js tests/integration/routes/auctionTenancyIntegrationTest.spec.js
git commit -m "fix(auth): enforce school ownership on public auction start/end/extend/delete + pin create"
```

---

### Task 3: Reject cross-school artwork on create (fail-closed)

**Files:**
- Modify: `src/services/auctionService.js` — the artwork attach block in `createAuction` (~lines 78-90).
- Test: `tests/unit/services/auctionArtworkTenancy.test.js` (new)

**Interfaces:**
- Consumes: nothing new (uses the resolved `schoolId` already in scope inside `createAuction`).
- Produces: `createAuction` throws `Error('ARTWORK_NOT_IN_SCHOOL')` (rolling back the transaction) when any requested artwork id is not owned by a user in the auction's school.

- [ ] **Step 1: Write the failing test**

```js
process.env.NODE_ENV = 'test';

// Replace pool.connect with a query-aware fake client so we can drive rowCounts.
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { connect: jest.fn() } };
});
const { pool } = require('../../../src/models/index');
const auctionService = require('../../../src/services/auctionService');

function fakeClient(handlers) {
  return {
    query: jest.fn((sql) => {
      if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(sql.trim())) { return Promise.resolve({ rows: [] }); }
      if (/FROM schools WHERE id/i.test(sql)) { return Promise.resolve({ rows: [{ id: 'school-A' }], rowCount: 1 }); }
      if (/INSERT INTO auctions/i.test(sql)) { return Promise.resolve({ rows: [{ id: 'auc-new', title: 'T', description: '', auction_status: 'DRAFT' }], rowCount: 1 }); }
      if (/UPDATE artwork SET auction_id/i.test(sql)) { return Promise.resolve(handlers.artworkUpdate); }
      if (/INSERT INTO audit_logs/i.test(sql)) { return Promise.resolve({ rows: [] }); }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    release: jest.fn()
  };
}

const baseData = {
  title: 'Spring Show', description: 'd', schoolId: 'school-A',
  startTime: new Date(Date.now() + 3600000).toISOString(),
  endTime: new Date(Date.now() + 7200000).toISOString(),
  platformFeePercentage: 3.5, autoExtendMinutes: 0,
  createdByUserId: 'admin-A', paymentGatewayId: 'gw-1'
};

describe('createAuction artwork tenancy', () => {
  beforeEach(() => {
    // _generateQRCode does I/O — stub it.
    jest.spyOn(auctionService, '_generateQRCode').mockResolvedValue('qr://stub');
  });
  afterEach(() => jest.restoreAllMocks());

  test('rejects when a requested artwork is not in the auction school (rowCount < requested)', async () => {
    // 2 ids requested, only 1 owned by school-A → mismatch → reject + rollback
    const client = fakeClient({ artworkUpdate: { rowCount: 1 } });
    pool.connect.mockResolvedValue(client);

    await expect(
      auctionService.createAuction({ ...baseData, artworkIds: ['art-A', 'art-foreign'] })
    ).rejects.toThrow('ARTWORK_NOT_IN_SCHOOL');

    // transaction rolled back, not committed
    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /ROLLBACK/i.test(s))).toBe(true);
    expect(calls.some(s => /COMMIT/i.test(s))).toBe(false);
  });

  test('succeeds when all requested artwork belong to the school (rowCount === requested)', async () => {
    const client = fakeClient({ artworkUpdate: { rowCount: 2 } });
    pool.connect.mockResolvedValue(client);

    const res = await auctionService.createAuction({ ...baseData, artworkIds: ['art-A1', 'art-A2'] });
    expect(res.success).toBe(true);
    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /COMMIT/i.test(s))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/auctionArtworkTenancy.test.js`
Expected: FAIL — the current UPDATE has no school filter and never throws `ARTWORK_NOT_IN_SCHOOL`, so the reject test fails (it commits).

- [ ] **Step 3: Add the school filter + fail-closed check**

In `src/services/auctionService.js` `createAuction`, replace the artwork attach block (currently):
```js
      if (artworkIds && artworkIds.length > 0) {
        const _placeholders = artworkIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(',');

        await client.query(
          `UPDATE artwork SET auction_id = $1 WHERE id IN (${artworkIds
            .map((_, i) => `$${i + 2}`)
            .join(',')})`,
          [auction.id, ...artworkIds]
        );
      }
```
with:
```js
      if (artworkIds && artworkIds.length > 0) {
        // Only attach artwork whose creator belongs to this auction's school.
        // artwork has no school_id, so scope through created_by_user_id.
        // Fail closed: if any requested id is foreign/ineligible, roll back.
        const idParams = artworkIds.map((_, i) => `$${i + 2}`).join(',');
        const attach = await client.query(
          `UPDATE artwork SET auction_id = $1
             WHERE id IN (${idParams})
               AND created_by_user_id IN (SELECT id FROM users WHERE school_id = $${artworkIds.length + 2})`,
          [auction.id, ...artworkIds, schoolId]
        );
        if (attach.rowCount !== artworkIds.length) {
          throw new Error('ARTWORK_NOT_IN_SCHOOL');
        }
      }
```
(`schoolId` is the resolved auction school already destructured at the top of `createAuction`; the `throw` propagates to the existing `catch` which runs `ROLLBACK`.)

- [ ] **Step 4: Map the error to 400 in the controller**

In `src/controllers/auctionController.js` `createAuction`'s `catch`, ensure `ARTWORK_NOT_IN_SCHOOL` returns 400 with a clear message. If the catch already returns `res.status(400)` for thrown errors, add a specific message; otherwise add before the generic handler:
```js
      if (error.message === 'ARTWORK_NOT_IN_SCHOOL') {
        return res.status(400).json({
          success: false,
          message: 'One or more selected artworks do not belong to your school'
        });
      }
```
(Confirm `createAuction`'s catch block shape first; the generic path already yields 400, so this only improves the message.)

- [ ] **Step 5: Run the new test + full suite**

Run: `npx jest tests/unit/services/auctionArtworkTenancy.test.js` → PASS (2/2).
Run: `npm test` → 0 failures. (If an existing createAuction test passes `artworkIds`, update its mocked artwork UPDATE to return `rowCount === artworkIds.length`.)

- [ ] **Step 6: Commit**

```bash
git add src/services/auctionService.js src/controllers/auctionController.js tests/unit/services/auctionArtworkTenancy.test.js
git commit -m "fix(auth): reject cross-school artwork on auction create (fail-closed)"
```

---

## Self-Review

**Spec coverage:**
- §1 shared helper → Task 1. §2 public-action guard → Task 2 (Step 5). §3 create pin → Task 2 (Step 4). §4 artwork fail-closed → Task 3. adminService untouched (Global Constraint) → no task, by design. Error semantics (403/404/400) → Task 2 (guard) + Task 3 (artwork). Testing (helper unit, 4 endpoints, create pin, artwork) → Tasks 1-3.

**Placeholder scan:** No TBD/TODO; every code and test step carries concrete code. Task 3 Step 4 asks the implementer to confirm the existing `createAuction` catch shape before adding the message — that is a read, not a placeholder (the generic 400 path already satisfies the status; the block only improves the message).

**Type/name consistency:** `schoolCanManage(actorRole, actorSchoolId, auctionSchoolId)` is defined in Task 1 and called identically in Task 2 Step 5. `ARTWORK_NOT_IN_SCHOOL` is thrown in Task 3 Step 3 and mapped in Task 3 Step 4. `pool` is the `src/models/index` export mocked the same way in both integration/service tests. `req.user.schoolId` (DB-hydrated for SCHOOL_ADMIN, JWT-claim fallback in test) is the actor school throughout.

**Ordering:** Task 1 (helper) precedes Task 2 (consumes it). Task 3 is independent of Task 2 but shares `auctionController.createAuction` (Task 2 edits line 31; Task 3 Step 4 edits the catch) — no conflict (different regions), and Task 2 lands first.
