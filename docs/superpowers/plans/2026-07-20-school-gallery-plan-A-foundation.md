# School Gallery — Plan A: Foundation & Same-School Gallery + Deny-by-Default Guard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the school-gallery foundation — schema, student per-piece opt-in, teacher-managed roster, the same-school gallery view, and the single `requireGalleryAccess` deny-by-default guard — as working, tested software that later plans (B cross-school, C comments, D frontend) extend.

**Architecture:** Hybrid — gallery *content* is a live query over `portfolio_items` (never stored rows), keyed on the owner's **current** `users.school_id` + `gallery_roster`; *state* lives in real tables. One guard (`requireGalleryAccess`) is the sole authorization path and denies by default; Plan B adds the accepted-grant branch inside it.

**Tech Stack:** Node/Express, PostgreSQL via `pool` (module `src/models/index.js`), Jest + supertest integration tests (module-mocked `pool`, locally-signed JWT), CommonJS.

**Spec:** `docs/superpowers/specs/2026-07-20-school-gallery-design.md` (read it — this plan implements its "same-school" subset).

## Global Constraints
- Gallery content query keys on the owner's **current** `users.school_id` + `gallery_roster` — **never** `portfolio_items.school_id` (a creation snapshot). This is what makes transfer/drop immediate.
- Deny-by-default: any path not explicitly allowed returns **403** and is audited.
- `audit_logs.action_category` CHECK allows only: `AUTH, USER, AUCTION, BID, PAYMENT, ADMIN, COMPLIANCE, SECURITY`. Use `COMPLIANCE` for access events, `SECURITY` for denials.
- Grade bands: exactly `ELEMENTARY`, `MIDDLE`, `HIGH`.
- Schema-drift rule: every `schema.sql` change is ALSO added as an idempotent statement in the `src/index.js` startup DDL block; mocked tests can't catch drift, so add a `RUN_DB_TESTS` real-DB assertion.
- The gallery guard resolves the viewer's **live** `school_id`/`role` from the DB (JWT `schoolId` is stale after transfer) — do not trust the JWT claim for gallery authorization.
- Render any user value in the DOM via `textContent` (frontend is Plan D; N/A here).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Baseline before starting: `npm run lint` exits 0, `npx jest` green (852 passing). New security-lint rules are enforced on new code (no `eval`, no weak randomness, etc.) — see `eslint-suppressions.json` ratchet.

## File Structure
- `schema.sql` — MODIFY: 3 column additions + `gallery_roster` table + indexes.
- `src/index.js` — MODIFY: startup DDL (idempotent ALTER/CREATE mirroring schema.sql).
- `src/models/galleryModel.js` — CREATE: all gallery SQL (content query, roster, item flags, viewer resolution).
- `src/middleware/galleryAccess.js` — CREATE: `requireGalleryAccess` guard + `auditGallery` helper.
- `src/controllers/galleryController.js` — CREATE: HTTP handlers (static methods, mirrors `teacherController`).
- `src/routes/galleryRoutes.js` — CREATE: router mounted at `/api/gallery`.
- `src/app.js` — MODIFY: mount gallery routes behind `verifyToken`.
- `tests/integration/routes/galleryAccessMatrix.spec.js` — CREATE: deny-by-default matrix.
- `tests/integration/routes/gallerySameSchool.spec.js` — CREATE: content + roster + opt-in.
- `tests/integration/database/schema.test.js` — MODIFY: real-DB assertions for the new schema.

---

## Task 1: Schema foundation (columns, roster table, startup DDL, real-DB test)

**Files:**
- Modify: `schema.sql` (schools, portfolio_items, users; new gallery_roster near other portfolio tables)
- Modify: `src/index.js` (startup DDL block — same place the existing `ALTER TABLE users ...` idempotent statements live)
- Test: `tests/integration/database/schema.test.js`

**Interfaces:**
- Produces (DB): `schools.grade_band`, `portfolio_items.shared_to_gallery`, `portfolio_items.gallery_comments_allowed`, `users.grade_level`, table `gallery_roster(id, school_id, student_user_id, added_by_user_id, created_at, UNIQUE(school_id, student_user_id))`.

- [ ] **Step 1: Add a real-DB failing test** (`tests/integration/database/schema.test.js`, inside the existing `RUN_DB_TESTS` describe):

```js
test('school-gallery schema: columns + gallery_roster exist', async () => {
  const cols = await db.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name='schools' AND column_name='grade_band')
       OR (table_name='portfolio_items' AND column_name IN ('shared_to_gallery','gallery_comments_allowed'))
       OR (table_name='users' AND column_name='grade_level')`);
  const got = cols.rows.map(r => `${r.table_name}.${r.column_name}`);
  expect(got).toEqual(expect.arrayContaining([
    'schools.grade_band', 'portfolio_items.shared_to_gallery',
    'portfolio_items.gallery_comments_allowed', 'users.grade_level'
  ]));
  const t = await db.query(`SELECT to_regclass('public.gallery_roster') AS t`);
  expect(t.rows[0].t).toBe('gallery_roster');
});
```

- [ ] **Step 2: Run it — expect FAIL** (columns/table absent).
Run: `RUN_DB_TESTS=true npx jest tests/integration/database/schema.test.js -t "school-gallery schema"` → FAIL (skipped if no DB; if so, verify manually in Step 4).

- [ ] **Step 3: Edit `schema.sql`.** Under the `schools` table add `grade_band VARCHAR(20) CHECK (grade_band IN ('ELEMENTARY','MIDDLE','HIGH'))`; under `users` add `grade_level VARCHAR(20)`; under `portfolio_items` add `shared_to_gallery BOOLEAN NOT NULL DEFAULT false` and `gallery_comments_allowed BOOLEAN NOT NULL DEFAULT false`. After the portfolio tables add:

```sql
CREATE TABLE gallery_roster (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, student_user_id)
);
CREATE INDEX idx_gallery_roster_school ON gallery_roster(school_id);
```

- [ ] **Step 4: Add idempotent startup DDL** in `src/index.js` (next to the existing `ALTER TABLE users ...` block):

```js
await db.query("ALTER TABLE schools ADD COLUMN IF NOT EXISTS grade_band VARCHAR(20)");
await db.query("ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_grade_band_check");
await db.query("ALTER TABLE schools ADD CONSTRAINT schools_grade_band_check CHECK (grade_band IS NULL OR grade_band IN ('ELEMENTARY','MIDDLE','HIGH'))");
await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_level VARCHAR(20)");
await db.query("ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS shared_to_gallery BOOLEAN NOT NULL DEFAULT false");
await db.query("ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS gallery_comments_allowed BOOLEAN NOT NULL DEFAULT false");
await db.query(`CREATE TABLE IF NOT EXISTS gallery_roster (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, student_user_id))`);
await db.query("CREATE INDEX IF NOT EXISTS idx_gallery_roster_school ON gallery_roster(school_id)");
```

- [ ] **Step 5: Run the real-DB test — expect PASS** (`RUN_DB_TESTS=true`), and `npx jest` stays green. Lint clean.
- [ ] **Step 6: Commit** (`git add schema.sql src/index.js tests/integration/database/schema.test.js`; message `feat(gallery): schema foundation — grade_band, opt-in flags, grade_level, gallery_roster`).

---

## Task 2: GalleryModel + student opt-in toggle + roster + same-school content query

**Files:**
- Create: `src/models/galleryModel.js`
- Test: `tests/integration/routes/gallerySameSchool.spec.js` (drives model via the routes from Task 3 — so write the model here, its HTTP coverage lands in Task 3; unit-test the query shape here)

**Interfaces:**
- Consumes: `pool` from `src/models/index.js`; DB schema from Task 1.
- Produces (all on a `GalleryModel` instance `new GalleryModel(pool)`):
  - `getSchoolGalleryItems(schoolId)` → `Promise<Array<{id,title,medium,imageUrl,artistGrade,artistFirstName,commentsAllowed,createdAt}>>`
  - `setItemGalleryFlags(itemId, studentUserId, { sharedToGallery, commentsAllowed })` → `Promise<{id,shared_to_gallery,gallery_comments_allowed} | null>` (null when the item isn't the student's)
  - `addToRoster(schoolId, studentUserId, addedByUserId)` → `Promise<void>` (idempotent via ON CONFLICT)
  - `removeFromRoster(schoolId, studentUserId)` → `Promise<number>` (rows removed)
  - `resolveViewer(userId)` → `Promise<{id, role, school_id} | null>` (LIVE role + school_id)

- [ ] **Step 1: Write `src/models/galleryModel.js`:**

```js
'use strict';
class GalleryModel {
  constructor(db) { this.db = db; }

  // Content = VISIBLE + shared + non-deleted items of students whose CURRENT school = schoolId
  // AND who are on that school's roster. Never keys on portfolio_items.school_id (a snapshot).
  async getSchoolGalleryItems(schoolId) {
    const r = await this.db.query(
      `SELECT pi.id, pi.title, pi.medium, pi.image_url AS "imageUrl",
              pi.artist_grade AS "artistGrade", u.first_name AS "artistFirstName",
              pi.gallery_comments_allowed AS "commentsAllowed", pi.created_at AS "createdAt"
         FROM portfolio_items pi
         JOIN users u ON u.id = pi.student_user_id AND u.deleted_at IS NULL
         JOIN gallery_roster gr ON gr.student_user_id = pi.student_user_id AND gr.school_id = $1
        WHERE u.school_id = $1
          AND pi.shared_to_gallery = true
          AND pi.moderation_status = 'VISIBLE'
          AND pi.deleted_at IS NULL
        ORDER BY pi.created_at DESC`,
      [schoolId]
    );
    return r.rows;
  }

  async setItemGalleryFlags(itemId, studentUserId, { sharedToGallery, commentsAllowed }) {
    const r = await this.db.query(
      `UPDATE portfolio_items
          SET shared_to_gallery = COALESCE($3, shared_to_gallery),
              gallery_comments_allowed = COALESCE($4, gallery_comments_allowed),
              updated_at = NOW()
        WHERE id = $1 AND student_user_id = $2 AND deleted_at IS NULL
        RETURNING id, shared_to_gallery, gallery_comments_allowed`,
      [itemId, studentUserId,
       sharedToGallery === undefined ? null : sharedToGallery,
       commentsAllowed === undefined ? null : commentsAllowed]
    );
    return r.rows[0] || null;
  }

  async addToRoster(schoolId, studentUserId, addedByUserId) {
    await this.db.query(
      `INSERT INTO gallery_roster (school_id, student_user_id, added_by_user_id)
       VALUES ($1, $2, $3) ON CONFLICT (school_id, student_user_id) DO NOTHING`,
      [schoolId, studentUserId, addedByUserId]
    );
  }

  async removeFromRoster(schoolId, studentUserId) {
    const r = await this.db.query(
      'DELETE FROM gallery_roster WHERE school_id = $1 AND student_user_id = $2',
      [schoolId, studentUserId]
    );
    return r.rowCount;
  }

  async resolveViewer(userId) {
    const r = await this.db.query(
      'SELECT id, role, school_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    return r.rows[0] || null;
  }
}
module.exports = GalleryModel;
```

- [ ] **Step 2: Unit-test the query builder** (`tests/unit/models/galleryModel.test.js`): inject a fake db (`{ query: jest.fn().mockResolvedValue({ rows: [] }) }`), call `getSchoolGalleryItems('s1')`, and assert the SQL text matches `/u\.school_id = \$1/` and `/shared_to_gallery = true/` and `/moderation_status = 'VISIBLE'/` and does **not** match `/pi\.school_id/`. Run → PASS. (This locks the transfer-safety invariant.)
- [ ] **Step 3: Commit** (`feat(gallery): GalleryModel — content query, roster, item flags, live viewer resolve`).

---

## Task 3: `requireGalleryAccess` guard + routes/controller + deny-by-default matrix test

**Files:**
- Create: `src/middleware/galleryAccess.js`, `src/controllers/galleryController.js`, `src/routes/galleryRoutes.js`
- Modify: `src/app.js` (mount)
- Test: `tests/integration/routes/galleryAccessMatrix.spec.js`, and extend `tests/integration/routes/gallerySameSchool.spec.js`

**Interfaces:**
- Consumes: `GalleryModel` (Task 2); `authMiddleware.verifyToken`, `authMiddleware.verifyRole` (`src/middleware/authMiddleware.js`); `pool` from models.
- Produces:
  - `requireGalleryAccess(req, res, next)` — reads `req.params.schoolId`, resolves viewer LIVE, allows SITE_ADMIN (global) and same-school members, else 403. **Extension point for Plan B** is the single `else` branch (accepted-grant check goes there before the final deny).
  - `auditGallery(actorId, category, actionType, resourceId, details)` → `Promise<void>` (best-effort).
  - Routes at `/api/gallery`: `GET /:schoolId`, `PATCH /items/:id/share`, `POST /roster`, `DELETE /roster/:studentUserId`.

- [ ] **Step 1: Write the failing matrix test** (`tests/integration/routes/galleryAccessMatrix.spec.js`) — mirrors the proven harness (module-mocked `pool`, local JWT):

```js
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const tok = (p) => jwt.sign(p, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });

describe('Gallery access matrix (deny-by-default)', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); mockDb.reset(); });

  // viewer-resolution query returns this row, then the content query returns []
  const asViewer = (row) => mockPool.query
    .mockResolvedValueOnce({ rows: [row], rowCount: 1 })   // resolveViewer
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });     // getSchoolGalleryItems

  test('same-school STUDENT → 200', async () => {
    asViewer({ id: 'stu-1', role: 'STUDENT', school_id: 'school-1' });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'stu-1', role: 'STUDENT', schoolId: 'school-1' })}`);
    expect(res.status).toBe(200);
  });
  test('same-school TEACHER → 200', async () => {
    asViewer({ id: 't-1', role: 'TEACHER', school_id: 'school-1' });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 't-1', role: 'TEACHER', schoolId: 'school-1' })}`);
    expect(res.status).toBe(200);
  });
  test('SITE_ADMIN → 200 (global)', async () => {
    asViewer({ id: 'sa-1', role: 'SITE_ADMIN', school_id: null });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'sa-1', role: 'SITE_ADMIN' })}`);
    expect(res.status).toBe(200);
  });
  test('OTHER-school STUDENT → 403 (deny-by-default)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'x-1', role: 'STUDENT', school_id: 'school-2' }], rowCount: 1 }); // resolveViewer only
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'x-1', role: 'STUDENT', schoolId: 'school-2' })}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GALLERY_ACCESS_DENIED');
  });
  test('OTHER-school TEACHER → 403', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'x-2', role: 'TEACHER', school_id: 'school-2' }], rowCount: 1 });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'x-2', role: 'TEACHER', schoolId: 'school-2' })}`);
    expect(res.status).toBe(403);
  });
  test('no token → 401', async () => {
    const res = await request(app).get('/api/gallery/school-1');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (route 404/no guard). Run: `npx jest tests/integration/routes/galleryAccessMatrix.spec.js`.

- [ ] **Step 3: Write `src/middleware/galleryAccess.js`:**

```js
'use strict';
const { pool } = require('../models/index');
const GalleryModel = require('../models/galleryModel');
const model = new GalleryModel(pool);

async function auditGallery(actorId, category, actionType, resourceId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action_category, action_type, resource_type, resource_id, action_details)
       VALUES ($1,$2,$3,'SCHOOL_GALLERY',$4,$5)`,
      [actorId, category, actionType, resourceId, details ? JSON.stringify(details) : null]
    );
  } catch (e) { /* best-effort audit; never block the request */ }
}

// Sole authorization path for a school's gallery. Deny-by-default.
async function requireGalleryAccess(req, res, next) {
  try {
    const schoolId = req.params.schoolId;
    const viewer = await model.resolveViewer(req.user.id); // LIVE role + school_id (JWT is stale after transfer)
    if (!viewer) { return res.status(401).json({ success: false, message: 'Account not found' }); }

    if (viewer.role === 'SITE_ADMIN') {
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_CROSS_SCHOOL_VIEW', schoolId, { via: 'site_admin' });
      req.galleryViewer = viewer; return next();
    }
    if (viewer.school_id && viewer.school_id === schoolId) {
      req.galleryViewer = viewer; return next();
    }
    // --- Plan B inserts the accepted-grant + enablement branch HERE, before the deny ---
    await auditGallery(viewer.id, 'SECURITY', 'GALLERY_ACCESS_DENIED', schoolId, { viewerSchool: viewer.school_id, role: viewer.role });
    return res.status(403).json({ success: false, error: 'GALLERY_ACCESS_DENIED', message: "You do not have access to this school's gallery." });
  } catch (err) { return next(err); }
}

module.exports = { requireGalleryAccess, auditGallery, model };
```

- [ ] **Step 4: Write `src/controllers/galleryController.js`:**

```js
'use strict';
const { pool } = require('../models/index');
const GalleryModel = require('../models/galleryModel');
const { auditGallery } = require('../middleware/galleryAccess');
const model = new GalleryModel(pool);

class GalleryController {
  // GET /api/gallery/:schoolId  (behind requireGalleryAccess)
  static async view(req, res, next) {
    try {
      const items = await model.getSchoolGalleryItems(req.params.schoolId);
      return res.json({ success: true, schoolId: req.params.schoolId, items });
    } catch (e) { return next(e); }
  }

  // PATCH /api/gallery/items/:id/share  (STUDENT only; own items)  Body: { sharedToGallery?, commentsAllowed? }
  static async setShare(req, res, next) {
    try {
      const { sharedToGallery, commentsAllowed } = req.body;
      if (sharedToGallery === undefined && commentsAllowed === undefined) {
        return res.status(400).json({ success: false, error: 'NO_FIELDS', message: 'Provide sharedToGallery and/or commentsAllowed.' });
      }
      for (const [k, v] of Object.entries({ sharedToGallery, commentsAllowed })) {
        if (v !== undefined && typeof v !== 'boolean') {
          return res.status(400).json({ success: false, error: 'INVALID_FIELD', message: `${k} must be boolean.` });
        }
      }
      const row = await model.setItemGalleryFlags(req.params.id, req.user.id, { sharedToGallery, commentsAllowed });
      if (!row) { return res.status(404).json({ success: false, error: 'ITEM_NOT_FOUND', message: 'Item not found or not yours.' }); }
      await auditGallery(req.user.id, 'COMPLIANCE', 'GALLERY_ITEM_SHARE_TOGGLED', row.id, { shared: row.shared_to_gallery, commentsAllowed: row.gallery_comments_allowed });
      return res.json({ success: true, item: { id: row.id, sharedToGallery: row.shared_to_gallery, commentsAllowed: row.gallery_comments_allowed } });
    } catch (e) { return next(e); }
  }

  // POST /api/gallery/roster { studentUserId }  (host TEACHER/SCHOOL_ADMIN)
  static async addRoster(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only a teacher/admin can manage the roster.' });
      }
      const { studentUserId } = req.body;
      if (!studentUserId) { return res.status(400).json({ success: false, message: 'studentUserId required.' }); }
      const target = await model.resolveViewer(studentUserId);
      if (!target || target.role !== 'STUDENT' || target.school_id !== viewer.school_id) {
        return res.status(403).json({ success: false, error: 'CROSS_SCHOOL_DENIED', message: 'That student is not in your school.' });
      }
      await model.addToRoster(viewer.school_id, studentUserId, viewer.id);
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_ROSTER_ADD', studentUserId, { schoolId: viewer.school_id });
      return res.status(201).json({ success: true });
    } catch (e) { return next(e); }
  }

  // DELETE /api/gallery/roster/:studentUserId  (host TEACHER/SCHOOL_ADMIN)
  static async removeRoster(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only a teacher/admin can manage the roster.' });
      }
      await model.removeFromRoster(viewer.school_id, req.params.studentUserId);
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_ROSTER_REMOVE', req.params.studentUserId, { schoolId: viewer.school_id });
      return res.json({ success: true });
    } catch (e) { return next(e); }
  }
}
module.exports = GalleryController;
```

- [ ] **Step 5: Write `src/routes/galleryRoutes.js`:**

```js
'use strict';
const express = require('express');
const router = express.Router();
const GalleryController = require('../controllers/galleryController');
const { requireGalleryAccess } = require('../middleware/galleryAccess');
const { verifyRole } = require('../middleware/authMiddleware');

router.get('/:schoolId', requireGalleryAccess, GalleryController.view);
router.patch('/items/:id/share', verifyRole('STUDENT'), GalleryController.setShare);
router.post('/roster', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.addRoster);
router.delete('/roster/:studentUserId', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.removeRoster);

module.exports = router;
```

- [ ] **Step 6: Mount in `src/app.js`** (after the portfolio-comment mount, ~line 173):

```js
const galleryRoutes = require('./routes/galleryRoutes');
app.use('/api/gallery', authMiddleware.verifyToken, galleryRoutes);
```

- [ ] **Step 7: Run the matrix test — expect PASS (6/6).** Run: `npx jest tests/integration/routes/galleryAccessMatrix.spec.js`.

- [ ] **Step 8: Extend `tests/integration/routes/gallerySameSchool.spec.js`** — same-school student toggles `sharedToGallery` (PATCH `/items/:id/share`, mock the UPDATE RETURNING row → 200 + audit) and views the gallery (GET `/:schoolId`, mock resolveViewer + content rows → items returned). Add a cross-school roster-add attempt → 403 `CROSS_SCHOOL_DENIED`. Run → PASS.

- [ ] **Step 9: Full suite + lint.** `npx jest` (expect prior + new specs green), `npm run lint` (0 errors — the module-`pool`/`require` code introduces no security-rule violations; the audit INSERT uses a literal category). Commit (`feat(gallery): requireGalleryAccess guard + same-school view/roster/opt-in endpoints`).

---

## Self-review (this plan vs. spec — same-school subset)
- Schema additions + roster + startup DDL + real-DB test → Task 1. ✅
- Content = live view keyed on current school + roster (transfer-safe), student opt-in, comment-allowed flag → Task 2. ✅
- Deny-by-default single guard, SITE_ADMIN global, same-school members, audited allow/deny, live-school resolution → Task 3. ✅
- Roster add/drop with same-school ownership check → Task 3. ✅
- Deferred to later plans (explicitly out of Plan A): cross-school grants/enablement/revoke + transfer cascade (**Plan B**); pre-moderated same-grade comments (**Plan C**); all UI (**Plan D**). The guard's single `else` branch is the documented insertion point for Plan B.
- Type consistency: `GalleryModel` method names/returns are used identically in the middleware and controller; `requireGalleryAccess`/`auditGallery` exported once and imported where used. ✅

---

## Roadmap — subsequent plans (write each when Plan A merges)
- **Plan B — Cross-school grants:** `gallery_grants` + `gallery_grant_members` tables; invite (band check + hashed token + email) / accept (band re-check, bind school) / revoke (cascade) / enablement (student must belong to invited school); insert the accepted-grant branch into `requireGalleryAccess`; transfer/drop cascade (remove roster rows, delete that student's member rows, reset `shared_to_gallery=false`) wired into the change-school flow; extend the matrix test with external-accepted-grant 200 and no-enablement 403; cross-school **PII projection** serializer (artwork + title + medium + artist_grade + first name only).
- **Plan C — Pre-moderated comments:** `gallery_comments` table; submit (owner allows + same-school OR same-grade cross-school) → PENDING; host-only approve/reject; list APPROVED-only; audit all.
- **Plan D — Frontend:** gallery view page, student opt-in/comment toggles in the portfolio UI, teacher invite + roster + comment-moderation UI (all render user values via `textContent`).
