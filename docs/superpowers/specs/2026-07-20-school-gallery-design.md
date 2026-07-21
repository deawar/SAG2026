# School Gallery — Design Spec (multi-tenant, invitation-gated)

**Date:** 2026-07-20  **Status:** Approved design (Phase 1 + Phase 2 threat model). Next: writing-plans.

## Goal
Expand the single per-student portfolio into a **per-school gallery** with strict multi-tenant
access control and a two-way cross-school invitation workflow, safe for minors' data (COPPA/FERPA).

## Confirmed decisions (from brainstorming)
- **One gallery per school**, independent of auctions.
- **Content = student opt-in per piece** (+ a per-piece allow/deny-comments toggle). Teacher manages a
  **current, mutable roster** (add/drop; no archived past semesters in v1). Teacher decides to **share
  the gallery** externally.
- **Same-school students + teachers** view by default. Same-school students may comment (owner-gated).
- **Cross-school sharing:** only a **teacher** invites, by **email**, an external **teacher or school
  admin** who must be **registered** to accept. Students are never invited/accepters. After acceptance,
  the invited teacher **enables their own students** (least-privilege) to view.
- **Band gate on the grant, at grade band:** inviting/accepting a **different-band** school **errors with
  an explicit explanation**. Bands: `ELEMENTARY`, `MIDDLE`, `HIGH`.
- **Comments are pre-moderated:** a comment is logged and held **PENDING**; not visible until a **host-school**
  teacher/admin approves. Approval authority = **host school**.
- **Deny-by-default** authorization matrix (role × same-school × band × grant-state). **All access audited;
  all cross-school interactions logged.** **Revocation withdraws all access immediately.**
- **Transfer/drop:** shared items **leave immediately** (view keys off current school + roster). On transfer,
  items become **eligible** for the new school's gallery but **share opt-in resets** (re-consent required).

## Architecture — hybrid (view for content, tables for state)
Gallery content is a **query**, never stored rows:
> items where `moderation_status='VISIBLE'` AND `deleted_at IS NULL` AND `shared_to_gallery=true`
> AND the owner's **current** `users.school_id` = gallery's school AND owner ∈ current `gallery_roster`.

`portfolio_items.school_id` is a creation snapshot and is **NOT** used as the gallery filter key — the
owner's live `users.school_id` + roster are. This makes transfer/drop automatic and prevents content drift.
State a view can't hold (grants, roster, comment approvals) lives in real tables.

## Data model

### Additions to existing tables (also add idempotent ALTERs to `src/index.js` startup DDL — schema-drift rule)
- `schools.grade_band VARCHAR(20) CHECK (grade_band IN ('ELEMENTARY','MIDDLE','HIGH'))` — **nullable**; a
  school with NULL band **cannot invite or accept** cross-school grants (guarded in code with a clear error).
- `portfolio_items.shared_to_gallery BOOLEAN NOT NULL DEFAULT false` — student opt-in.
- `portfolio_items.gallery_comments_allowed BOOLEAN NOT NULL DEFAULT false` — student per-piece comment toggle.

### New tables
```sql
CREATE TABLE gallery_roster (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, student_user_id)
);

CREATE TABLE gallery_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  host_band VARCHAR(20) NOT NULL,                 -- snapshot of host school band at invite time
  invited_email CITEXT NOT NULL,
  invited_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,      -- resolved at acceptance
  invited_teacher_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- resolved at acceptance
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,       -- host teacher
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
         CHECK (status IN ('PENDING','ACCEPTED','DECLINED','REVOKED')),
  invite_token_hash VARCHAR(64) NOT NULL,          -- sha256 of raw token (raw only in the email)
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE gallery_grant_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id UUID NOT NULL REFERENCES gallery_grants(id) ON DELETE CASCADE,   -- revoke cascades here
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (grant_id, student_user_id)
);

CREATE TABLE gallery_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gallery_comment_body_check CHECK (length(trim(body)) > 0)
);
```
Indexes: `gallery_roster(school_id)`, `gallery_grants(host_school_id, status)`,
`gallery_grants(invited_teacher_user_id)`, partial `gallery_grants(invite_token_hash) WHERE status='PENDING'`,
`gallery_grant_members(student_user_id)`, `gallery_comments(portfolio_item_id, status)`.

## Access-control matrix (deny-by-default) — viewer of school **S**
| Viewer | View S's gallery | Comment (owner-allowed) |
|---|---|---|
| SITE_ADMIN | ✅ global (audited) | — |
| SCHOOL_ADMIN / TEACHER of S | ✅ | — (they moderate) |
| STUDENT of S | ✅ | ✅ (pre-moderated) |
| TEACHER / SCHOOL_ADMIN of external X | ✅ iff ACCEPTED grant S↔X and they are the grant's invited party | — |
| STUDENT of external X | ✅ iff ACCEPTED grant S↔X **and** `gallery_grant_members` row (band guaranteed by grant) | ✅ if owner allows (pre-moderated) |
| anyone else | ❌ 403 | ❌ 403 |

**Single guard** `requireGalleryAccess(req, schoolId)` computes this; there is exactly one code path.
Band equality is verified **at invite** (if the invitee resolves to a known school) and **definitively at
acceptance** (invited teacher's school band must equal `host_band`, else 4xx with an explicit message).
Every cross-school **allow** and **deny** is audited.

## API endpoints (all behind `verifyToken`)
- **Student (own items):** `PATCH /api/portfolio/items/:id/gallery` `{ sharedToGallery?, commentsAllowed? }`.
- **View:** `GET /api/gallery/:schoolId` → guarded; response field-projected by relationship (see threat #2).
- **Roster (host TEACHER/SCHOOL_ADMIN of S):** `POST /api/gallery/roster` `{ studentUserId }` · `DELETE /api/gallery/roster/:studentUserId`.
- **Grants (host TEACHER):** `POST /api/gallery/grants` `{ invitedEmail }` (band-checked, emails token) ·
  `POST /api/gallery/grants/:id/accept` `{ token }` (invited TEACHER/SCHOOL_ADMIN; band re-checked) ·
  `POST /api/gallery/grants/:id/revoke` (either side) · `GET /api/gallery/grants`.
- **Enablement (invited TEACHER):** `POST /api/gallery/grants/:id/members` `{ studentUserId }` ·
  `DELETE /api/gallery/grants/:id/members/:studentUserId` — target student **must belong to the invited
  teacher's own school** (verified).
- **Comments:** `POST /api/gallery/items/:id/comments` `{ body }` → PENDING ·
  `GET /api/gallery/comments/pending` (host) · `POST /api/gallery/comments/:id/approve|reject` (host) ·
  `GET /api/gallery/items/:id/comments` → **APPROVED only**.

## Workflows
- **Invite:** host teacher POSTs email → resolve invitee school if known → band check → create `PENDING`
  grant with a crypto-random token (sha256 hash stored, raw emailed, expiry) → audit `GALLERY_INVITE_SENT`.
- **Accept:** invited teacher (authenticated) presents token → verify hash/expiry/status=PENDING → **their
  school band == host_band** (else 4xx explicit) → bind `invited_school_id`/`invited_teacher_user_id`,
  status=`ACCEPTED` → audit `GALLERY_INVITE_ACCEPTED`.
- **Enable students:** invited teacher adds their own students → `gallery_grant_members` rows.
- **Revoke/leave:** either side → status=`REVOKED`, cascade-delete members → audit `GALLERY_GRANT_REVOKED`.
- **Comment:** eligible viewer POSTs → PENDING → host approves/rejects → only APPROVED render.
- **Transfer/drop (transactional):** remove old `gallery_roster` rows, delete that student's
  `gallery_grant_members` rows, **reset `shared_to_gallery=false`** on their items.

## Security threat model (Phase 2)
1. **Broken object-level auth / IDOR** — external user requests `GET /api/gallery/:schoolId` or a specific
   item they lack a grant for. **Mitigation:** one `requireGalleryAccess` guard, deny-by-default; item
   fetches for cross-school route through the same guard; never trust client `schoolId`/`itemId`.
2. **Minor-PII over-exposure** — cross-school viewers must see **artwork + title + medium + artist_grade +
   first name only**; never email, DOB, or last name. **Mitigation:** a distinct serializer for
   cross-school responses (least-privilege field projection), separate from same-school responses.
3. **Invitation tampering / token replay** — guessing/replaying tokens, accepting for a school you're not in,
   band bypass. **Mitigation:** crypto-random token, **hashed at rest**, single-use, expiring; acceptance
   binds to the authenticated user's real school and re-checks band; status state machine forbids
   re-accept / accept-after-revoke.
4. **Enablement privilege escalation** — invited teacher enabling students who aren't theirs.
   **Mitigation:** `student_user_id.school_id` must equal `invited_school_id`.
5. **Stale access after revoke / transfer** — **Mitigation:** every request re-evaluates live grant + roster
   state; no cached grants; revocation and transfer effective on the next request.
6. **Comment XSS / abuse** — **Mitigation:** body length limit, stored plain, rendered via `textContent`,
   plus the human pre-moderation gate.
7. **Cross-tenant writes** — roster/opt-in/moderation must verify the actor's school owns the target.
8. **Audit gaps** — invite/accept/revoke/cross-school-view/comment-approve are audited (`COMPLIANCE`);
   denied cross-school attempts audited (`SECURITY`).

## Audit events (`audit_logs`, existing CHECK-valid categories)
`COMPLIANCE`: GALLERY_INVITE_SENT, GALLERY_INVITE_ACCEPTED, GALLERY_GRANT_REVOKED, GALLERY_MEMBER_ENABLED,
GALLERY_MEMBER_DISABLED, GALLERY_CROSS_SCHOOL_VIEW, GALLERY_COMMENT_SUBMITTED, GALLERY_COMMENT_APPROVED,
GALLERY_COMMENT_REJECTED, GALLERY_STUDENT_TRANSFER_CLEANUP. `SECURITY`: GALLERY_ACCESS_DENIED.

## Testing strategy (Phase 4 preview)
- **Deny-by-default matrix:** a **403 integration assertion for every cross-school path** lacking an accepted
  grant + enablement (view, item, comment submit, moderate, roster, enablement).
- Band-mismatch invite **and** accept → explicit 4xx. Token replay/expired/after-revoke → 4xx.
- Revocation cascade: revoke → enabled students 403 on next request.
- Transfer/drop: items disappear on next request; opt-in reset; enablement rows gone.
- Comment stays hidden until APPROVED; host-only moderation (guest-school teacher cannot approve).
- Least-privilege: external student without an enablement row is 403 even under an ACCEPTED grant.
- PII projection: cross-school response contains no email/DOB/last name.

## Assumptions & open items (confirm during spec review)
- **Transfer default = reset opt-in** (re-consent at new school). Flip to carry-over only if desired.
- **Band lives on `schools`** (must be set before a school can invite/accept). Existing schools have NULL
  band → they must set it first; guarded with a clear error.
- **"Same grade level" for comments:** commenter grade is **not** a stored `users` field (grade exists only
  as item-level `artist_grade`). v1 enforces **same-band** (already guaranteed by the grant) as the comment
  eligibility gate; exact same-grade matching is deferred until a reliable student-grade field exists. **This
  is the one place the implementation is looser than the literal "same grade level" wording — please confirm.**
- **Comment moderation = host school only** (guest-school teachers see their students' activity via audit,
  not an approval queue).

## Out of scope (v1)
Archived past-semester galleries; cross-school **bidding** (galleries are auction-independent); external
**student**-initiated invites; carry-over of comments onto re-shared transferred items.
