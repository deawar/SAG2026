# School Gallery — Plan B: Cross-School Grants, Enablement, Revocation & Transfer Cascade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the cross-school invitation workflow on top of the merged Plan A foundation — a teacher invites an external teacher/admin by email, band-checked; acceptance binds the grant; the invited teacher enables their own students; revocation and student transfer withdraw access immediately — all deny-by-default and audited.

**Architecture:** New `gallery_grants` + `gallery_grant_members` tables and a `GalleryGrantModel`. Grant orchestration (band checks, hashed token, best-effort email, audit) lives in `galleryController` static methods (matching the teacher/gallery pattern — no new service layer). The existing `requireGalleryAccess` guard gains ONE new branch (its documented `else` insertion point) that consults the grant model. Transfer/drop cascade hooks into `adminService.updateUserProfile` where `school_id` changes.

**Tech Stack:** Node/Express, PostgreSQL via `pool`, Jest+supertest (module-mocked `pool`, local JWT), CommonJS.

**Spec:** `docs/superpowers/specs/2026-07-20-school-gallery-design.md`. **Builds on Plan A** (merged, HEAD 4bfa15e): `src/models/galleryModel.js`, `src/middleware/galleryAccess.js` (`requireGalleryAccess`, `auditGallery`, exported `model`), `src/controllers/galleryController.js`, `src/routes/galleryRoutes.js`.

## Global Constraints
- **Band gate is on the grant, at grade band** (`ELEMENTARY`/`MIDDLE`/`HIGH`): invite records `host_band = host school's grade_band`; **acceptance rejects** (4xx, explicit message) unless the invited teacher's school `grade_band` equals `host_band`. A host school with NULL `grade_band` cannot invite (explicit 4xx).
- **Least-privilege "invited party":** after acceptance, cross-school VIEW access is limited to (a) the bound accepter (`gallery_grants.invited_teacher_user_id`) and (b) students with a `gallery_grant_members` row. NOT all staff of the invited school. *(This is the spec's "they are the grant's invited party" — flagged here for review.)*
- **Deny-by-default:** the guard's grant branch only ever grants on an `ACCEPTED` grant with a matching bound user / member row; everything else falls through to the existing audited 403.
- **Enablement scope:** the invited teacher may only enable students whose live `users.school_id` == the grant's `invited_school_id` AND `role='STUDENT'` (else 403 `CROSS_SCHOOL_DENIED`).
- **Revocation = either side, immediate:** host TEACHER/SCHOOL_ADMIN OR the bound invited teacher/their SCHOOL_ADMIN may revoke; sets `status='REVOKED'`; `gallery_grant_members` rows are removed via `ON DELETE CASCADE`; access is gone on the next request (guard re-checks live).
- **Transfer/drop cascade (immediate):** when a student's `users.school_id` changes, in the same transaction delete their `gallery_roster` rows, delete their `gallery_grant_members` rows, and reset `shared_to_gallery=false` on their `portfolio_items` (re-consent at the new school).
- **Token:** crypto-random (`crypto.randomBytes(32).toString('hex')`), stored only as `sha256` hash (`invite_token_hash`), single-use, 14-day expiry; raw token only in the email link.
- **Audit** (`audit_logs`, CHECK-valid categories only): `COMPLIANCE` for invite/accept/revoke/enable/disable/cross-school-view/transfer-cleanup, `SECURITY` for denials. `resource_type` literal `'SCHOOL_GALLERY'`. Category strings must be literals (security-lint).
- **PII projection already satisfied:** Plan A's `getSchoolGalleryItems` already selects only `id,title,medium,imageUrl,artistGrade,artistFirstName,commentsAllowed,createdAt` — no email/DOB/last name. Cross-school viewers reuse this exact query; **no separate serializer needed** (YAGNI).
- **Comments are Plan C** — not in this plan.
- Schema-drift rule: schema.sql changes also go in `src/index.js` startup DDL; add a `RUN_DB_TESTS` assertion.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Baseline: 882 tests, lint 0 (security ratchet on new code).

## File Structure
- `schema.sql`, `src/index.js` — MODIFY: `gallery_grants` + `gallery_grant_members` + indexes + startup DDL.
- `src/models/galleryGrantModel.js` — CREATE: all grant/member SQL incl. the guard lookup `getViewerGrantAccess`.
- `src/controllers/galleryController.js` — MODIFY: add `invite`, `acceptGrant`, `revokeGrant`, `listGrants`, `enableMember`, `disableMember`.
- `src/routes/galleryRoutes.js` — MODIFY: add the grant/member routes.
- `src/middleware/galleryAccess.js` — MODIFY: insert the accepted-grant branch at the documented `else` point.
- `src/services/adminService.js` — MODIFY: call the transfer cascade in `updateUserProfile` when `school_id` changes.
- `src/models/galleryModel.js` — MODIFY: add `cascadeStudentSchoolChange(studentUserId)` (used by the transfer hook).
- Tests: `tests/integration/database/schema.test.js` (+grants), `tests/integration/routes/galleryGrants.spec.js` (CREATE), extend `tests/integration/routes/galleryAccessMatrix.spec.js`, `tests/unit/models/galleryGrantModel.test.js` (CREATE).

---

## Task 1: Schema — `gallery_grants` + `gallery_grant_members`

**Files:** Modify `schema.sql`, `src/index.js`; Test `tests/integration/database/schema.test.js`.

**Interfaces — Produces (DB):** tables per the spec DDL (see spec §Data model). `gallery_grant_members.grant_id` REFERENCES `gallery_grants(id) ON DELETE CASCADE`.

- [ ] **Step 1: Add real-DB failing test** (in the existing `RUN_DB_TESTS` describe):
```js
test('cross-school grant tables exist', async () => {
  const g = await db.query("SELECT to_regclass('public.gallery_grants') AS a, to_regclass('public.gallery_grant_members') AS b");
  expect(g.rows[0].a).toBe('gallery_grants');
  expect(g.rows[0].b).toBe('gallery_grant_members');
});
```
- [ ] **Step 2: Run — expect FAIL** (`RUN_DB_TESTS=true npx jest ... -t "cross-school grant tables"`; skipped w/o DB → verify by inspection).
- [ ] **Step 3: Add to `schema.sql`** (after `gallery_roster`):
```sql
CREATE TABLE gallery_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  host_band VARCHAR(20) NOT NULL,
  invited_email CITEXT NOT NULL,
  invited_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  invited_teacher_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','REVOKED')),
  invite_token_hash VARCHAR(64) NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_gallery_grants_host ON gallery_grants(host_school_id, status);
CREATE INDEX idx_gallery_grants_invited_teacher ON gallery_grants(invited_teacher_user_id);
CREATE INDEX idx_gallery_grants_token ON gallery_grants(invite_token_hash) WHERE status = 'PENDING';

CREATE TABLE gallery_grant_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id UUID NOT NULL REFERENCES gallery_grants(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (grant_id, student_user_id)
);
CREATE INDEX idx_gallery_grant_members_student ON gallery_grant_members(student_user_id);
```
- [ ] **Step 4: Add idempotent startup DDL** in `src/index.js` (next to the Plan A gallery block): the same two `CREATE TABLE IF NOT EXISTS` statements + `CREATE INDEX IF NOT EXISTS` for all four indexes (copy the DDL above, swapping `CREATE TABLE`→`CREATE TABLE IF NOT EXISTS` and `CREATE INDEX`→`CREATE INDEX IF NOT EXISTS`).
- [ ] **Step 5: Run real-DB test → PASS; `npx jest` green; lint 0.**
- [ ] **Step 6: Commit** `feat(gallery): schema — gallery_grants + gallery_grant_members`.

---

## Task 2: `GalleryGrantModel`

**Files:** Create `src/models/galleryGrantModel.js`; Test `tests/unit/models/galleryGrantModel.test.js`.

**Interfaces — Produces** (`new GalleryGrantModel(pool)`):
- `createGrant({ hostSchoolId, hostBand, invitedEmail, invitedByUserId, tokenHash, expiresAt })` → `Promise<{id}>`
- `getPendingByTokenHash(tokenHash)` → `Promise<grantRow|null>` (status PENDING, not expired)
- `acceptGrant(grantId, { invitedSchoolId, invitedTeacherUserId })` → `Promise<{id,status}>` (guards `status='PENDING'` in WHERE)
- `revokeGrant(grantId, revokedByUserId)` → `Promise<{id,status}|null>` (WHERE status='ACCEPTED' OR 'PENDING')
- `listGrantsForHost(hostSchoolId)` / `listGrantsForInvitedTeacher(userId)` → `Promise<Array>`
- `getGrantForRevoker(grantId)` → `Promise<{id,host_school_id,invited_school_id,invited_teacher_user_id,status}|null>` (for authz)
- `addMember(grantId, studentUserId, enabledByUserId)` → `Promise<void>` (ON CONFLICT DO NOTHING)
- `removeMember(grantId, studentUserId)` → `Promise<number>`
- `getViewerGrantAccess(viewer, hostSchoolId)` → `Promise<{allowed:boolean, via?:'invited_teacher'|'enabled_student', grantId?}>` — **the guard lookup**

- [ ] **Step 1: Write `src/models/galleryGrantModel.js`:**
```js
'use strict';
class GalleryGrantModel {
  constructor(db) { this.db = db; }

  async createGrant({ hostSchoolId, hostBand, invitedEmail, invitedByUserId, tokenHash, expiresAt }) {
    const r = await this.db.query(
      `INSERT INTO gallery_grants (host_school_id, host_band, invited_email, invited_by_user_id, invite_token_hash, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [hostSchoolId, hostBand, invitedEmail, invitedByUserId, tokenHash, expiresAt]
    );
    return r.rows[0];
  }

  async getPendingByTokenHash(tokenHash) {
    const r = await this.db.query(
      `SELECT * FROM gallery_grants
        WHERE invite_token_hash = $1 AND status = 'PENDING' AND token_expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    return r.rows[0] || null;
  }

  async acceptGrant(grantId, { invitedSchoolId, invitedTeacherUserId }) {
    const r = await this.db.query(
      `UPDATE gallery_grants
          SET status='ACCEPTED', invited_school_id=$2, invited_teacher_user_id=$3, accepted_at=NOW()
        WHERE id=$1 AND status='PENDING'
        RETURNING id, status`,
      [grantId, invitedSchoolId, invitedTeacherUserId]
    );
    return r.rows[0] || null;
  }

  async revokeGrant(grantId, revokedByUserId) {
    const r = await this.db.query(
      `UPDATE gallery_grants
          SET status='REVOKED', revoked_at=NOW(), revoked_by_user_id=$2
        WHERE id=$1 AND status IN ('PENDING','ACCEPTED')
        RETURNING id, status`,
      [grantId, revokedByUserId]
    );
    return r.rows[0] || null;
  }

  async getGrantForRevoker(grantId) {
    const r = await this.db.query(
      'SELECT id, host_school_id, invited_school_id, invited_teacher_user_id, status FROM gallery_grants WHERE id=$1',
      [grantId]
    );
    return r.rows[0] || null;
  }

  async listGrantsForHost(hostSchoolId) {
    const r = await this.db.query(
      `SELECT id, invited_email, invited_school_id, invited_teacher_user_id, status, created_at, accepted_at
         FROM gallery_grants WHERE host_school_id=$1 ORDER BY created_at DESC`, [hostSchoolId]);
    return r.rows;
  }

  async listGrantsForInvitedTeacher(userId) {
    const r = await this.db.query(
      `SELECT id, host_school_id, status, accepted_at FROM gallery_grants
        WHERE invited_teacher_user_id=$1 AND status='ACCEPTED' ORDER BY accepted_at DESC`, [userId]);
    return r.rows;
  }

  async addMember(grantId, studentUserId, enabledByUserId) {
    await this.db.query(
      `INSERT INTO gallery_grant_members (grant_id, student_user_id, enabled_by_user_id)
       VALUES ($1,$2,$3) ON CONFLICT (grant_id, student_user_id) DO NOTHING`,
      [grantId, studentUserId, enabledByUserId]);
  }

  async removeMember(grantId, studentUserId) {
    const r = await this.db.query('DELETE FROM gallery_grant_members WHERE grant_id=$1 AND student_user_id=$2', [grantId, studentUserId]);
    return r.rowCount;
  }

  // THE guard lookup. Deny-by-default: returns allowed:false unless a live ACCEPTED grant matches.
  async getViewerGrantAccess(viewer, hostSchoolId) {
    if (['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role)) {
      const r = await this.db.query(
        `SELECT id FROM gallery_grants
          WHERE host_school_id=$1 AND invited_teacher_user_id=$2 AND status='ACCEPTED' LIMIT 1`,
        [hostSchoolId, viewer.id]);
      if (r.rows[0]) { return { allowed: true, via: 'invited_teacher', grantId: r.rows[0].id }; }
    }
    if (viewer.role === 'STUDENT' && viewer.school_id) {
      const r = await this.db.query(
        `SELECT g.id FROM gallery_grants g
           JOIN gallery_grant_members m ON m.grant_id = g.id AND m.student_user_id = $2
          WHERE g.host_school_id=$1 AND g.invited_school_id=$3 AND g.status='ACCEPTED' LIMIT 1`,
        [hostSchoolId, viewer.id, viewer.school_id]);
      if (r.rows[0]) { return { allowed: true, via: 'enabled_student', grantId: r.rows[0].id }; }
    }
    return { allowed: false };
  }
}
module.exports = GalleryGrantModel;
```
- [ ] **Step 2: Unit-test `getViewerGrantAccess`** (fake db): teacher with matching ACCEPTED grant → `{allowed:true, via:'invited_teacher'}`; teacher with no grant (db returns `{rows:[]}`) → `{allowed:false}`; student with member row → `{allowed:true, via:'enabled_student'}`; student without → `{allowed:false}`. Assert each branch queries with the right params and returns the right shape. Run → PASS.
- [ ] **Step 3: Commit** `feat(gallery): GalleryGrantModel — grants, members, guard access lookup`.

---

## Task 3: Grant endpoints — invite / accept / revoke / list / enable / disable

**Files:** Modify `src/controllers/galleryController.js`, `src/routes/galleryRoutes.js`; Create `tests/integration/routes/galleryGrants.spec.js`.

**Interfaces — Consumes:** `GalleryGrantModel` (Task 2), `GalleryModel.resolveViewer` (Plan A), `auditGallery` (Plan A). **Produces routes** (all behind `/api/gallery`, `verifyToken`):
- `POST /grants` (TEACHER) — `{ invitedEmail }`
- `POST /grants/:id/accept` (TEACHER, SCHOOL_ADMIN) — `{ token }`
- `POST /grants/:id/revoke` (TEACHER, SCHOOL_ADMIN)
- `GET /grants` (TEACHER, SCHOOL_ADMIN)
- `POST /grants/:id/members` (TEACHER) — `{ studentUserId }`
- `DELETE /grants/:id/members/:studentUserId` (TEACHER)

- [ ] **Step 1: Write `tests/integration/routes/galleryGrants.spec.js`** (module-mock pool + local JWT harness, mirroring `galleryAccessMatrix.spec.js`). Cover:
  1. host TEACHER invites → 201 (mocks: resolveViewer host teacher w/ school+band via a `schools` band lookup; INSERT grant; audit). Assert `res.body.success` and that a grant INSERT ran.
  2. invite when host `grade_band` IS NULL → 400 `SCHOOL_BAND_NOT_SET`.
  3. accept with matching band → 200 (mocks: getPendingByTokenHash returns grant w/ host_band='HIGH'; resolveViewer invited teacher school; band lookup 'HIGH'; acceptGrant returns ACCEPTED).
  4. accept with band mismatch (invited 'MIDDLE' vs host 'HIGH') → 409 `BAND_MISMATCH` with explicit message.
  5. accept bad/expired token → 404 `INVALID_TOKEN`.
  6. enable member: invited teacher enables a student of the invited school → 201; enabling a student of ANOTHER school → 403 `CROSS_SCHOOL_DENIED`.
  7. revoke by host → 200; revoke by unrelated user → 403.
  (Follow the mock-sequence discipline: queue exactly the queries each handler runs, in order.)
- [ ] **Step 2: Run — expect FAIL** (routes 404).
- [ ] **Step 3: Add controller methods to `src/controllers/galleryController.js`** (static; reuse module-level `pool`, `GalleryModel`, `auditGallery`; add `const GalleryGrantModel = require('../models/galleryGrantModel'); const grants = new GalleryGrantModel(pool);` and a module-level `EmailProvider` instance mirroring `teacherController.js` lines 13-22). Add a private helper to read a school's band:
```js
static async _schoolBand(schoolId) {
  const r = await pool.query('SELECT grade_band FROM schools WHERE id=$1', [schoolId]);
  return r.rows[0] ? r.rows[0].grade_band : null;
}

// POST /api/gallery/grants  (host TEACHER)  { invitedEmail }
static async invite(req, res, next) {
  try {
    const viewer = await model.resolveViewer(req.user.id);
    if (!viewer || viewer.role !== 'TEACHER' || !viewer.school_id) {
      return res.status(403).json({ success:false, message:'Only a teacher can share the gallery.' });
    }
    const { invitedEmail } = req.body;
    if (!invitedEmail || !ValidationUtils.isValidEmail(invitedEmail)) {
      return res.status(400).json({ success:false, error:'INVALID_EMAIL', message:'A valid email is required.' });
    }
    const hostBand = await GalleryController._schoolBand(viewer.school_id);
    if (!hostBand) {
      return res.status(400).json({ success:false, error:'SCHOOL_BAND_NOT_SET',
        message:'Set your school\'s grade band before sharing the gallery.' });
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 14*24*60*60*1000);
    const grant = await grants.createGrant({ hostSchoolId: viewer.school_id, hostBand,
      invitedEmail: invitedEmail.toLowerCase().trim(), invitedByUserId: viewer.id, tokenHash, expiresAt });
    let inviteSent = true;
    try { await GalleryController._sendGrantInvite(invitedEmail, grant.id, rawToken, hostBand); }
    catch (e) { inviteSent = false; logger.error('Gallery invite email failed', { error: e.message }); }
    await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_INVITE_SENT', grant.id, { hostSchoolId: viewer.school_id, hostBand, inviteSent });
    return res.status(201).json({ success:true, grantId: grant.id, inviteSent });
  } catch (e) { return next(e); }
}

static async _sendGrantInvite(toEmail, grantId, rawToken, hostBand) {
  const baseUrl = process.env.FRONTEND_URL || 'https://sag.live';
  const link = `${baseUrl}/gallery-invite.html?grant=${grantId}&token=${rawToken}`;
  const subject = 'You are invited to view a School Gallery';
  const text = `A teacher has invited your school (${hostBand} band) to view their student art gallery. Accept: ${link}`;
  const html = `<p>A teacher has invited your school (<b>${hostBand}</b> band) to view their student art gallery.</p><p><a href="${link}">Accept the invitation</a></p>`;
  await emailProvider.send(toEmail, subject, html, text);
}

// POST /api/gallery/grants/:id/accept  (TEACHER, SCHOOL_ADMIN)  { token }
static async acceptGrant(req, res, next) {
  try {
    const viewer = await model.resolveViewer(req.user.id);
    if (!viewer || !['TEACHER','SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
      return res.status(403).json({ success:false, message:'Only a teacher/school admin can accept.' });
    }
    const { token } = req.body;
    if (!token) { return res.status(400).json({ success:false, message:'token required.' }); }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const grant = await grants.getPendingByTokenHash(tokenHash);
    if (!grant || grant.id !== req.params.id) {
      return res.status(404).json({ success:false, error:'INVALID_TOKEN', message:'Invitation not found or expired.' });
    }
    const invitedBand = await GalleryController._schoolBand(viewer.school_id);
    if (invitedBand !== grant.host_band) {
      await auditGallery(viewer.id, 'SECURITY', 'GALLERY_ACCEPT_BAND_MISMATCH', grant.id, { hostBand: grant.host_band, invitedBand });
      return res.status(409).json({ success:false, error:'BAND_MISMATCH',
        message:`This gallery is for the ${grant.host_band} band; your school is ${invitedBand || 'unset'}. Only same-band schools may be invited.` });
    }
    const upd = await grants.acceptGrant(grant.id, { invitedSchoolId: viewer.school_id, invitedTeacherUserId: viewer.id });
    if (!upd) { return res.status(409).json({ success:false, error:'ALREADY_RESOLVED', message:'This invitation is no longer pending.' }); }
    await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_INVITE_ACCEPTED', grant.id, { hostSchoolId: grant.host_school_id, invitedSchoolId: viewer.school_id });
    return res.json({ success:true, grantId: grant.id, status:'ACCEPTED' });
  } catch (e) { return next(e); }
}

// POST /api/gallery/grants/:id/revoke  (host or invited side)
static async revokeGrant(req, res, next) {
  try {
    const viewer = await model.resolveViewer(req.user.id);
    if (!viewer || !['TEACHER','SCHOOL_ADMIN'].includes(viewer.role)) {
      return res.status(403).json({ success:false, message:'Not permitted.' });
    }
    const g = await grants.getGrantForRevoker(req.params.id);
    if (!g) { return res.status(404).json({ success:false, message:'Grant not found.' }); }
    const isHost = viewer.school_id && viewer.school_id === g.host_school_id;
    const isInvited = viewer.id === g.invited_teacher_user_id || (viewer.school_id && viewer.school_id === g.invited_school_id);
    if (!isHost && !isInvited) { return res.status(403).json({ success:false, error:'NOT_A_PARTY', message:'You are not a party to this grant.' }); }
    const upd = await grants.revokeGrant(req.params.id, viewer.id);
    if (!upd) { return res.status(409).json({ success:false, message:'Grant is not active.' }); }
    await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_GRANT_REVOKED', req.params.id, { by: isHost ? 'host' : 'invited' });
    return res.json({ success:true, status:'REVOKED' });
  } catch (e) { return next(e); }
}

// GET /api/gallery/grants  (host teacher/admin sees host grants; invited teacher sees theirs)
static async listGrants(req, res, next) {
  try {
    const viewer = await model.resolveViewer(req.user.id);
    if (!viewer || !['TEACHER','SCHOOL_ADMIN'].includes(viewer.role)) {
      return res.status(403).json({ success:false, message:'Not permitted.' });
    }
    const host = viewer.school_id ? await grants.listGrantsForHost(viewer.school_id) : [];
    const invited = await grants.listGrantsForInvitedTeacher(viewer.id);
    return res.json({ success:true, host, invited });
  } catch (e) { return next(e); }
}

// POST /api/gallery/grants/:id/members  (invited TEACHER)  { studentUserId }
static async enableMember(req, res, next) {
  try {
    const viewer = await model.resolveViewer(req.user.id);
    const g = await grants.getGrantForRevoker(req.params.id);
    if (!g || g.status !== 'ACCEPTED' || !viewer || viewer.id !== g.invited_teacher_user_id) {
      return res.status(403).json({ success:false, message:'Only the invited teacher can enable students.' });
    }
    const { studentUserId } = req.body;
    if (!studentUserId) { return res.status(400).json({ success:false, message:'studentUserId required.' }); }
    const target = await model.resolveViewer(studentUserId);
    if (!target || target.role !== 'STUDENT' || target.school_id !== g.invited_school_id) {
      return res.status(403).json({ success:false, error:'CROSS_SCHOOL_DENIED', message:'That student is not in your school.' });
    }
    await grants.addMember(g.id, studentUserId, viewer.id);
    await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_MEMBER_ENABLED', studentUserId, { grantId: g.id });
    return res.status(201).json({ success:true });
  } catch (e) { return next(e); }
}

// DELETE /api/gallery/grants/:id/members/:studentUserId  (invited TEACHER)
static async disableMember(req, res, next) {
  try {
    const viewer = await model.resolveViewer(req.user.id);
    const g = await grants.getGrantForRevoker(req.params.id);
    if (!g || !viewer || viewer.id !== g.invited_teacher_user_id) {
      return res.status(403).json({ success:false, message:'Only the invited teacher can disable students.' });
    }
    await grants.removeMember(g.id, req.params.studentUserId);
    await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_MEMBER_DISABLED', req.params.studentUserId, { grantId: g.id });
    return res.json({ success:true });
  } catch (e) { return next(e); }
}
```
Add the imports at the top of the controller if absent: `const crypto = require('crypto'); const logger = require('../utils/logger'); const ValidationUtils = require('../utils/validationUtils');` and the `EmailProvider` instance (copy `teacherController.js:11-22`, variable `emailProvider`). Note: Plan A's `src/controllers/galleryController.js` already has `const model = new GalleryModel(pool)` at module scope — reuse that `model` (do NOT create a second instance).
- [ ] **Step 4: Add routes to `src/routes/galleryRoutes.js`:**
```js
router.get('/grants', verifyRole('TEACHER','SCHOOL_ADMIN'), GalleryController.listGrants);
router.post('/grants', verifyRole('TEACHER'), GalleryController.invite);
router.post('/grants/:id/accept', verifyRole('TEACHER','SCHOOL_ADMIN'), GalleryController.acceptGrant);
router.post('/grants/:id/revoke', verifyRole('TEACHER','SCHOOL_ADMIN'), GalleryController.revokeGrant);
router.post('/grants/:id/members', verifyRole('TEACHER'), GalleryController.enableMember);
router.delete('/grants/:id/members/:studentUserId', verifyRole('TEACHER'), GalleryController.disableMember);
```
(Place BEFORE `router.get('/:schoolId', ...)` so `/grants` isn't captured by the `:schoolId` param.)
- [ ] **Step 5: Run the grants spec → PASS; full suite green; lint 0** (audit category strings are literals; email is best-effort). Commit `feat(gallery): cross-school grant endpoints (invite/accept/revoke/enable/disable)`.

---

## Task 4: Guard extension — accepted-grant + enablement branch

**Files:** Modify `src/middleware/galleryAccess.js`; extend `tests/integration/routes/galleryAccessMatrix.spec.js`.

**Interfaces — Consumes:** `GalleryGrantModel.getViewerGrantAccess(viewer, hostSchoolId)` (Task 2).

- [ ] **Step 1: Add failing matrix cases** to `galleryAccessMatrix.spec.js`:
  - external invited TEACHER with ACCEPTED grant → **200** (mocks: resolveViewer external teacher; `getViewerGrantAccess` grant query returns a row; content query []).
  - external enabled STUDENT (member row) → **200**.
  - external STUDENT of invited school but NO member row → **403** (grant query returns []).
  - external TEACHER after REVOKE (no ACCEPTED grant) → **403**.
  Run → the 200 cases FAIL (guard still denies).
- [ ] **Step 2: Edit `src/middleware/galleryAccess.js`** — add the grant model and replace the Plan-B comment line:
```js
const GalleryGrantModel = require('../models/galleryGrantModel');
const grants = new GalleryGrantModel(pool);
```
Replace `// --- Plan B inserts ... HERE ...` with:
```js
    // External access via an ACCEPTED cross-school grant (deny-by-default: only an
    // ACCEPTED grant with a bound invited teacher or an enablement row grants access).
    const access = await grants.getViewerGrantAccess(viewer, schoolId);
    if (access.allowed) {
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_CROSS_SCHOOL_VIEW', schoolId, { via: access.via, grantId: access.grantId });
      req.galleryViewer = viewer; req.galleryGrant = access; return next();
    }
```
(Leave the existing audited 403 deny immediately after — it stays the default.)
- [ ] **Step 3: Run matrix → PASS (all cases incl. new). Full suite green; lint 0.** Commit `feat(gallery): guard grants cross-school view on accepted grant + enablement`.

---

## Task 5: Transfer / drop cascade

**Files:** Modify `src/models/galleryModel.js` (add cascade), `src/services/adminService.js` (call it on school change); Test: extend `tests/integration/routes/gallerySameSchool.spec.js` or a new `galleryTransferCascade.spec.js`.

**Interfaces — Produces:** `GalleryModel.cascadeStudentSchoolChange(studentUserId)` → `Promise<void>`.

- [ ] **Step 1: Add to `src/models/galleryModel.js`:**
```js
// When a student leaves/changes school: drop them from all rosters, remove all their
// cross-school enablements, and reset their gallery opt-in (re-consent at the new school).
async cascadeStudentSchoolChange(studentUserId) {
  await this.db.query('DELETE FROM gallery_roster WHERE student_user_id = $1', [studentUserId]);
  await this.db.query('DELETE FROM gallery_grant_members WHERE student_user_id = $1', [studentUserId]);
  await this.db.query('UPDATE portfolio_items SET shared_to_gallery = false, updated_at = NOW() WHERE student_user_id = $1', [studentUserId]);
}
```
- [ ] **Step 2: Call it from `adminService.updateUserProfile`** — after the `UPDATE users ... SET ... school_id=$5 ...` (line ~279-284), when the school actually changed:
```js
if (schoolId !== undefined && newSchoolId !== user.school_id) {
  const GalleryModel = require('../models/galleryModel');
  await new GalleryModel(pool).cascadeStudentSchoolChange(userId);
}
```
(`pool` is already required at the top of adminService.js.)
- [ ] **Step 3: Test** (integration, mocked pool): call `PUT /api/admin/users/:id/profile` with a new `schoolId` for a STUDENT and assert the three cascade queries (`DELETE FROM gallery_roster`, `DELETE FROM gallery_grant_members`, `UPDATE portfolio_items SET shared_to_gallery = false`) all fire. Also a model unit test asserting the three statements. Run → PASS.
- [ ] **Step 4: Full suite green; lint 0. Commit** `feat(gallery): transfer/drop cascade — clear roster, enablements, opt-in on school change`.

---

## Self-review (plan vs spec — cross-school subset)
- gallery_grants + gallery_grant_members schema + startup DDL + real-DB test → Task 1. ✅
- Grant lifecycle (invite band-checked+token+email, accept band re-check+bind, revoke either-side+cascade, enable/disable scoped to invited school) → Tasks 2–3. ✅
- Deny-by-default guard branch (bound teacher OR member row only; audited) → Task 4. ✅
- Transfer/drop cascade (roster + members + opt-in reset) → Task 5. ✅
- PII projection: reuses Plan A's already-minimal query — no separate serializer (documented). ✅
- Comments → Plan C (excluded). ✅
- Type consistency: `getViewerGrantAccess` return shape used identically in Task 2 (model) and Task 4 (guard); `_schoolBand`, `grants`, `galleryModel`/`model`, `auditGallery` names consistent across tasks. ✅
- Decision flagged for review: least-privilege "invited party" = bound accepter + enabled students only (not all invited-school staff).

## Roadmap after Plan B
- **Plan C — pre-moderated comments** (`gallery_comments`; same-grade `users.grade_level`==`artist_grade`; host-only approve/reject; APPROVED-only reads).
- **Plan D — frontend** (gallery page, opt-in/comment toggles, invite/accept/roster/enablement/moderation UI).
