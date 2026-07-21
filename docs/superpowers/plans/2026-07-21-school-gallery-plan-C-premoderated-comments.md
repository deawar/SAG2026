# School Gallery — Plan C: Pre-Moderated Comments

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Gallery comments that are logged PENDING, invisible until a **host-school** teacher/admin approves; same-school students comment freely (owner-gated), cross-school students only with an enablement **and** exact grade match; reads return APPROVED only.

**Architecture:** New `gallery_comments` table + `GalleryCommentModel` (comment CRUD + school-scoped moderation UPDATE). Item lookup `getCommentableItem` goes on the existing `GalleryModel`. A thin `requireGalleryItemAccess` middleware resolves an item → its host school and **delegates to the existing `requireGalleryAccess`** so authorization stays a single code path. Comment endpoints are `galleryController` static methods (same pattern as grants — no service layer).

**Tech Stack:** Node/Express, PostgreSQL via `pool`, Jest+supertest (module-mocked `pool`, local JWT), CommonJS.

**Spec:** `docs/superpowers/specs/2026-07-20-school-gallery-design.md`. **Builds on Plans A+B (merged, HEAD 7611491):** `src/models/galleryModel.js`, `src/models/galleryGrantModel.js` (`getViewerGrantAccess`), `src/middleware/galleryAccess.js` (`requireGalleryAccess`, `auditGallery`, exported `model`), `src/controllers/galleryController.js`, `src/routes/galleryRoutes.js`.

## Global Constraints
- **Pre-moderation:** every comment is created `status='PENDING'`; only `APPROVED` rows are ever returned by the read endpoint. Moderation authority = **host school only** (owner's live `users.school_id`); a guest-school teacher gets **404** from approve/reject (school-scoped UPDATE matches no row — no existence oracle).
- **Who may comment:** `STUDENT` role only (teachers/admins moderate; SITE_ADMIN passes the view guard but gets 403 on submit). Owner's per-piece `gallery_comments_allowed` must be true (else 403 `COMMENTS_DISABLED`).
- **Cross-school grade gate (exact match):** a cross-school commenter needs the guard's enablement (ACCEPTED grant + `gallery_grant_members` row — already enforced by `requireGalleryAccess`) **and** `viewer.grade_level === item.artist_grade`, both non-null; else 403 `GRADE_MISMATCH` audited `SECURITY`/`GALLERY_COMMENT_DENIED`. Same-school students have **no** grade check.
- **Single guard:** item routes go through `requireGalleryItemAccess` → sets `req.params.schoolId` = item owner's live school → calls `requireGalleryAccess`. No second authorization path. Item not in the gallery (not shared / not VISIBLE / deleted / owner off-roster or deleted) → **404** `ITEM_NOT_IN_GALLERY`.
- **Body:** trimmed, 1–2000 chars (`MAX_COMMENT_BODY = 2000`, mirrors `portfolioCommentRoutes.js`), stored plain (XSS: frontend renders via `textContent` — Plan D).
- **PII projection:** comment reads expose author **first name only** (never email/DOB/last name) for all viewers — one serializer, least privilege.
- **Audit** (`audit_logs`, literal category strings — security-lint): `COMPLIANCE` → `GALLERY_COMMENT_SUBMITTED`, `GALLERY_COMMENT_APPROVED`, `GALLERY_COMMENT_REJECTED`; `SECURITY` → `GALLERY_COMMENT_DENIED`. `resource_type` stays `'SCHOOL_GALLERY'` via existing `auditGallery`.
- **Schema-drift rule:** `schema.sql` changes are mirrored as idempotent DDL in `src/index.js` startup, plus a `RUN_DB_TESTS` assertion in `tests/integration/database/schema.test.js`.
- Baseline: **913 tests**, lint 0 (security ratchet on new code). Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure
- `schema.sql`, `src/index.js` — MODIFY: `gallery_comments` table + index + startup DDL.
- `src/models/galleryModel.js` — MODIFY: add `getCommentableItem`; add `grade_level` to `resolveViewer`.
- `src/models/galleryCommentModel.js` — CREATE: `createComment`, `listApprovedForItem`, `listPendingForSchool`, `moderateComment`.
- `src/middleware/galleryAccess.js` — MODIFY: add + export `requireGalleryItemAccess`.
- `src/controllers/galleryController.js` — MODIFY: add `submitComment`, `listItemComments`, `pendingComments`, `approveComment`, `rejectComment`.
- `src/routes/galleryRoutes.js` — MODIFY: comment routes (before `/:schoolId`).
- Tests: `tests/integration/database/schema.test.js` (+1), `tests/unit/models/galleryCommentModel.test.js` (CREATE), `tests/integration/routes/galleryComments.spec.js` (CREATE).

---

## Task 1: Schema — `gallery_comments`

**Files:** Modify `schema.sql`, `src/index.js`; Test `tests/integration/database/schema.test.js`.

**Interfaces — Produces (DB):** table `gallery_comments` per spec DDL; index `idx_gallery_comments_item_status (portfolio_item_id, status)`.

- [ ] **Step 1: Add real-DB failing test** in `tests/integration/database/schema.test.js`, directly after the `'cross-school grant tables exist'` test (line ~638, same `RUN_DB_TESTS` describe):
```js
    test('gallery_comments table exists', async () => {
      const c = await db.query("SELECT to_regclass('public.gallery_comments') AS t");
      expect(c.rows[0].t).toBe('gallery_comments');
    });
```
- [ ] **Step 2: Run — expect FAIL** (`$env:RUN_DB_TESTS='true'; npx jest tests/integration/database/schema.test.js -t "gallery_comments"`; without a local DB the describe is skipped → verify by inspection).
- [ ] **Step 3: Add to `schema.sql`** after `idx_gallery_grant_members_student` (line ~209):
```sql
-- Gallery comments (Plan C: pre-moderated; only APPROVED rows are ever rendered)
CREATE TABLE gallery_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gallery_comment_body_check CHECK (length(trim(body)) > 0)
);
CREATE INDEX idx_gallery_comments_item_status ON gallery_comments(portfolio_item_id, status);
```
- [ ] **Step 4: Add idempotent startup DDL** in `src/index.js`, inside a new try/catch after the Plan B grants block (after line ~268 `}` of `grantErr` catch):
```js
      // Gallery comments (Plan C — idempotent, safe every boot).
      try {
        await db.query(`CREATE TABLE IF NOT EXISTS gallery_comments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
          author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          author_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
          body TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
          moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          moderated_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT gallery_comment_body_check CHECK (length(trim(body)) > 0))`);
        await db.query('CREATE INDEX IF NOT EXISTS idx_gallery_comments_item_status ON gallery_comments(portfolio_item_id, status)');
        console.log('✅ Gallery comments schema ready');
      } catch (gcErr) {
        console.warn('⚠️  Gallery comments schema warning:', gcErr.message);
      }
```
- [ ] **Step 5: Run `npx jest` → green (913+1 or skipped-DB unchanged); `npx eslint .` → 0.**
- [ ] **Step 6: Commit** `feat(gallery): schema — gallery_comments (pre-moderated)`.

---

## Task 2: Models — `GalleryCommentModel` + item lookup + viewer grade

**Files:** Create `src/models/galleryCommentModel.js`; Modify `src/models/galleryModel.js`; Test `tests/unit/models/galleryCommentModel.test.js`.

**Interfaces — Produces:**
- `GalleryModel.resolveViewer(userId)` now also returns `grade_level` (additive — existing callers unaffected).
- `GalleryModel.getCommentableItem(itemId)` → `Promise<{id, student_user_id, owner_school_id, gallery_comments_allowed, artist_grade}|null>` — null unless the item is live gallery content (shared + VISIBLE + not deleted + owner not deleted + owner on their current school's roster).
- `new GalleryCommentModel(pool)`:
  - `createComment({ portfolioItemId, authorUserId, authorSchoolId, body })` → `Promise<{id, status, created_at}>`
  - `listApprovedForItem(itemId)` → `Promise<Array<{id, body, createdAt, authorFirstName}>>`
  - `listPendingForSchool(schoolId)` → `Promise<Array>` (PENDING on items whose **owner's live school** = schoolId)
  - `moderateComment(commentId, moderatorSchoolId, status, moderatorUserId)` → `Promise<{id, status}|null>` (school-scoped; only PENDING rows)

- [ ] **Step 1: Modify `src/models/galleryModel.js`** — in `resolveViewer` change the SELECT to include grade:
```js
      'SELECT id, role, school_id, grade_level FROM users WHERE id = $1 AND deleted_at IS NULL',
```
and add after `setItemGalleryFlags`:
```js
  // An item is commentable/readable only while it is live gallery content:
  // shared + VISIBLE + not deleted, owner active and on their CURRENT school's roster.
  async getCommentableItem(itemId) {
    const r = await this.db.query(
      `SELECT pi.id, pi.student_user_id, u.school_id AS owner_school_id,
              pi.gallery_comments_allowed, pi.artist_grade
         FROM portfolio_items pi
         JOIN users u ON u.id = pi.student_user_id AND u.deleted_at IS NULL
         JOIN gallery_roster gr ON gr.student_user_id = pi.student_user_id AND gr.school_id = u.school_id
        WHERE pi.id = $1
          AND pi.shared_to_gallery = true
          AND pi.moderation_status = 'VISIBLE'
          AND pi.deleted_at IS NULL`,
      [itemId]
    );
    return r.rows[0] || null;
  }
```
- [ ] **Step 2: Create `src/models/galleryCommentModel.js`:**
```js
'use strict';

class GalleryCommentModel {
  constructor(db) { this.db = db; }

  async createComment({ portfolioItemId, authorUserId, authorSchoolId, body }) {
    const r = await this.db.query(
      `INSERT INTO gallery_comments (portfolio_item_id, author_user_id, author_school_id, body)
       VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
      [portfolioItemId, authorUserId, authorSchoolId, body]
    );
    return r.rows[0];
  }

  // Read path: APPROVED only, author FIRST NAME only (minor-PII least privilege).
  async listApprovedForItem(itemId) {
    const r = await this.db.query(
      `SELECT c.id, c.body, c.created_at AS "createdAt", u.first_name AS "authorFirstName"
         FROM gallery_comments c
         LEFT JOIN users u ON u.id = c.author_user_id
        WHERE c.portfolio_item_id = $1 AND c.status = 'APPROVED'
        ORDER BY c.created_at ASC`,
      [itemId]
    );
    return r.rows;
  }

  // Moderation queue: PENDING comments on items whose owner's LIVE school = schoolId.
  async listPendingForSchool(schoolId) {
    const r = await this.db.query(
      `SELECT c.id, c.body, c.created_at AS "createdAt", c.portfolio_item_id AS "portfolioItemId",
              pi.title AS "itemTitle", au.first_name AS "authorFirstName",
              CASE WHEN au.school_id = $1 THEN 'SAME_SCHOOL' ELSE 'CROSS_SCHOOL' END AS "authorOrigin"
         FROM gallery_comments c
         JOIN portfolio_items pi ON pi.id = c.portfolio_item_id
         JOIN users owner ON owner.id = pi.student_user_id
         LEFT JOIN users au ON au.id = c.author_user_id
        WHERE c.status = 'PENDING' AND owner.school_id = $1
        ORDER BY c.created_at ASC`,
      [schoolId]
    );
    return r.rows;
  }

  // School-scoped single-statement moderation: no row unless the comment is PENDING
  // AND the item's owner currently belongs to the moderator's school (host-only authority).
  async moderateComment(commentId, moderatorSchoolId, status, moderatorUserId) {
    const r = await this.db.query(
      `UPDATE gallery_comments c
          SET status = $3, moderated_by_user_id = $4, moderated_at = NOW()
         FROM portfolio_items pi
         JOIN users owner ON owner.id = pi.student_user_id
        WHERE c.id = $1 AND c.status = 'PENDING'
          AND pi.id = c.portfolio_item_id
          AND owner.school_id = $2
        RETURNING c.id, c.status`,
      [commentId, moderatorSchoolId, status, moderatorUserId]
    );
    return r.rows[0] || null;
  }
}

module.exports = GalleryCommentModel;
```
- [ ] **Step 3: Write `tests/unit/models/galleryCommentModel.test.js`** (fake db, mirroring `tests/unit/models/galleryGrantModel.test.js` style):
```js
'use strict';
const GalleryCommentModel = require('../../../src/models/galleryCommentModel');

const fakeDb = () => ({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) });

describe('GalleryCommentModel', () => {
  test('createComment inserts PENDING and returns the row', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'PENDING', created_at: 't' }], rowCount: 1 });
    const m = new GalleryCommentModel(db);
    const row = await m.createComment({ portfolioItemId: 'i1', authorUserId: 'u1', authorSchoolId: 's1', body: 'nice' });
    expect(row).toEqual({ id: 'c1', status: 'PENDING', created_at: 't' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO gallery_comments');
    expect(params).toEqual(['i1', 'u1', 's1', 'nice']);
  });

  test('listApprovedForItem filters APPROVED and selects first name only', async () => {
    const db = fakeDb();
    const m = new GalleryCommentModel(db);
    await m.listApprovedForItem('i1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("c.status = 'APPROVED'");
    expect(sql).toContain('first_name');
    expect(sql).not.toContain('last_name');
    expect(sql).not.toContain('email');
    expect(params).toEqual(['i1']);
  });

  test('listPendingForSchool keys on the owner live school', async () => {
    const db = fakeDb();
    const m = new GalleryCommentModel(db);
    await m.listPendingForSchool('s1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("c.status = 'PENDING'");
    expect(sql).toContain('owner.school_id = $1');
    expect(params).toEqual(['s1']);
  });

  test('moderateComment is school-scoped and PENDING-only; null when no row', async () => {
    const db = fakeDb();
    const m = new GalleryCommentModel(db);
    const out = await m.moderateComment('c1', 's1', 'APPROVED', 'mod1');
    expect(out).toBeNull();
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("c.status = 'PENDING'");
    expect(sql).toContain('owner.school_id = $2');
    expect(params).toEqual(['c1', 's1', 'APPROVED', 'mod1']);
  });
});
```
- [ ] **Step 4: Run** `npx jest tests/unit/models/galleryCommentModel.test.js -v` → PASS (4 tests). Full `npx jest` → green (resolveViewer change is additive; no existing assertion pins its column list — if one does, update it to include `grade_level`). `npx eslint .` → 0.
- [ ] **Step 5: Commit** `feat(gallery): GalleryCommentModel + commentable-item lookup + viewer grade_level`.

---

## Task 3: Item-level guard — `requireGalleryItemAccess`

**Files:** Modify `src/middleware/galleryAccess.js`; Test cases live in Task 4's spec (the middleware is only reachable via the new routes — deny/404 cases are asserted there; this task just lands the code).

**Interfaces — Consumes:** `GalleryModel.getCommentableItem` (Task 2), existing `requireGalleryAccess`. **Produces:** exported `requireGalleryItemAccess(req,res,next)` which sets `req.galleryItem` (row from `getCommentableItem`) and `req.galleryViewer` (via delegation), keeping authorization single-path.

- [ ] **Step 1: Edit `src/middleware/galleryAccess.js`** — add after `requireGalleryAccess` (before `module.exports`):
```js
// Item-level guard for comment routes: resolve the item's HOST school (owner's
// live school), then delegate to requireGalleryAccess — authorization stays a
// single code path. Items outside live gallery content 404 (no existence oracle).
async function requireGalleryItemAccess(req, res, next) {
  try {
    const item = await model.getCommentableItem(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'ITEM_NOT_IN_GALLERY', message: 'Item not found in any gallery.' });
    }
    req.galleryItem = item;
    req.params.schoolId = item.owner_school_id;
    return requireGalleryAccess(req, res, next);
  } catch (err) { return next(err); }
}
```
and change the export line to:
```js
module.exports = { requireGalleryAccess, requireGalleryItemAccess, auditGallery, model };
```
- [ ] **Step 2: Run `npx jest` → still green (no routes use it yet); `npx eslint .` → 0.**
- [ ] **Step 3: Commit** `feat(gallery): requireGalleryItemAccess — item guard delegating to the single access path`.

---

## Task 4: Submit + read endpoints

**Files:** Modify `src/controllers/galleryController.js`, `src/routes/galleryRoutes.js`; Create `tests/integration/routes/galleryComments.spec.js`.

**Interfaces — Consumes:** `req.galleryItem`/`req.galleryViewer` (Task 3), `GalleryCommentModel` (Task 2), `auditGallery` (Plan A). **Produces routes** (mounted at `/api/gallery` behind `verifyToken`):
- `POST /items/:id/comments` `{ body }` → 201 `{ success, comment: { id, status: 'PENDING' } }`
- `GET /items/:id/comments` → 200 `{ success, comments: [...] }` (APPROVED only)

- [ ] **Step 1: Write `tests/integration/routes/galleryComments.spec.js`** (same harness as `galleryGrants.spec.js`: env secrets, module-mock `pool` + `notificationService`, `createApp(mockDb)`, `tok()` helper, queue exactly the queries each handler runs):
```js
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
jest.mock('../../../src/services/notificationService', () => ({
  EmailProvider: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue(undefined) })),
  EmailTemplateService: jest.fn(),
  getSharedEmailProvider: jest.fn(),
  notifyArtworkStatusChanged: jest.fn()
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const tok = (p) => jwt.sign(p, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });

const HOST_SCHOOL = 'school-host';
const EXT_SCHOOL  = 'school-ext';
const ITEM_ID     = 'item-1';
const COMMENT_ID  = 'comment-1';

const sameStudentTok  = tok({ userId: 'stud-same', role: 'STUDENT', schoolId: HOST_SCHOOL });
const extStudentTok   = tok({ userId: 'stud-ext',  role: 'STUDENT', schoolId: EXT_SCHOOL });
const hostTeacherTok  = tok({ userId: 'teach-host', role: 'TEACHER', schoolId: HOST_SCHOOL });

// getCommentableItem row for a live, comments-allowed HIGH-grade-10 piece
const liveItem = (over = {}) => ({
  id: ITEM_ID, student_user_id: 'artist-1', owner_school_id: HOST_SCHOOL,
  gallery_comments_allowed: true, artist_grade: '10', ...over
});

describe('Gallery comments — submit & read', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('same-school STUDENT comments → 201 PENDING (no grade check)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })                                            // getCommentableItem
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'PENDING', created_at: 't' }], rowCount: 1 }) // createComment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                                     // audit SUBMITTED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: 'Great colors!' });
    expect(res.status).toBe(201);
    expect(res.body.comment).toEqual({ id: COMMENT_ID, status: 'PENDING' });
  });

  test('cross-school enabled STUDENT with matching grade → 201 PENDING', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })                                            // getCommentableItem
      .mockResolvedValueOnce({ rows: [{ id: 'stud-ext', role: 'STUDENT', school_id: EXT_SCHOOL, grade_level: '10' }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: 'grant-1' }], rowCount: 1 })                                     // getViewerGrantAccess (student branch)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                                                      // audit CROSS_SCHOOL_VIEW
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'PENDING', created_at: 't' }], rowCount: 1 }) // createComment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                                     // audit SUBMITTED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${extStudentTok}`).send({ body: 'So cool' });
    expect(res.status).toBe(201);
  });

  test('cross-school STUDENT with grade mismatch → 403 GRADE_MISMATCH', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-ext', role: 'STUDENT', school_id: EXT_SCHOOL, grade_level: '9' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'grant-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // audit CROSS_SCHOOL_VIEW
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // audit SECURITY GALLERY_COMMENT_DENIED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${extStudentTok}`).send({ body: 'hello' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GRADE_MISMATCH');
  });

  test('cross-school STUDENT without enablement → 403 at the guard (deny-by-default)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-ext', role: 'STUDENT', school_id: EXT_SCHOOL, grade_level: '10' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // getViewerGrantAccess → no row
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // audit SECURITY GALLERY_ACCESS_DENIED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${extStudentTok}`).send({ body: 'hello' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GALLERY_ACCESS_DENIED');
  });

  test('TEACHER cannot comment → 403 STUDENTS_ONLY', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${hostTeacherTok}`).send({ body: 'nice work' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('STUDENTS_ONLY');
  });

  test('owner disabled comments → 403 COMMENTS_DISABLED', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem({ gallery_comments_allowed: false })], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: 'hi' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('COMMENTS_DISABLED');
  });

  test('item not in gallery → 404 ITEM_NOT_IN_GALLERY', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getCommentableItem → none
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: 'hi' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ITEM_NOT_IN_GALLERY');
  });

  test('empty / oversized body → 400 INVALID_BODY', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BODY');
  });

  test('GET item comments returns APPROVED list for a gallery viewer', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })  // getCommentableItem
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, body: 'Great colors!', createdAt: 't', authorFirstName: 'Ana' }], rowCount: 1 }); // listApprovedForItem
    const res = await request(app).get(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toEqual([{ id: COMMENT_ID, body: 'Great colors!', createdAt: 't', authorFirstName: 'Ana' }]);
    const listCall = mockPool.query.mock.calls[2][0];
    expect(listCall).toContain("c.status = 'APPROVED'");
  });
});
```
- [ ] **Step 2: Run** `npx jest tests/integration/routes/galleryComments.spec.js -v` → **FAIL** (routes 404).
- [ ] **Step 3: Add controller code** to `src/controllers/galleryController.js`. Top of file, after `const grants = new GalleryGrantModel(pool);`:
```js
const GalleryCommentModel = require('../models/galleryCommentModel');
const comments = new GalleryCommentModel(pool);
const MAX_COMMENT_BODY = 2000;
```
New methods inside the class (after `disableMember`):
```js
  // ── Comments (Plan C: pre-moderated) ─────────────────────────────────────────

  // POST /api/gallery/items/:id/comments  (behind requireGalleryItemAccess)  { body }
  static async submitComment(req, res, next) {
    try {
      const viewer = req.galleryViewer;   // live row incl. grade_level (guard set it)
      const item = req.galleryItem;       // live gallery item (guard set it)
      if (viewer.role !== 'STUDENT') {
        return res.status(403).json({ success: false, error: 'STUDENTS_ONLY', message: 'Only students may comment in the gallery.' });
      }
      if (!item.gallery_comments_allowed) {
        return res.status(403).json({ success: false, error: 'COMMENTS_DISABLED', message: 'The artist has not enabled comments on this piece.' });
      }
      const crossSchool = viewer.school_id !== item.owner_school_id;
      if (crossSchool && (!viewer.grade_level || viewer.grade_level !== item.artist_grade)) {
        await auditGallery(viewer.id, 'SECURITY', 'GALLERY_COMMENT_DENIED', item.id,
          { reason: 'GRADE_MISMATCH', viewerGrade: viewer.grade_level || null, artistGrade: item.artist_grade || null });
        return res.status(403).json({ success: false, error: 'GRADE_MISMATCH',
          message: 'Cross-school comments are limited to students in the same grade as the artist.' });
      }
      const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
      if (body.length < 1 || body.length > MAX_COMMENT_BODY) {
        return res.status(400).json({ success: false, error: 'INVALID_BODY', message: `Comment must be 1–${MAX_COMMENT_BODY} characters.` });
      }
      const row = await comments.createComment({ portfolioItemId: item.id, authorUserId: viewer.id, authorSchoolId: viewer.school_id, body });
      await auditGallery(viewer.id, 'COMPLIANCE', 'GALLERY_COMMENT_SUBMITTED', row.id, { portfolioItemId: item.id, crossSchool });
      return res.status(201).json({ success: true, comment: { id: row.id, status: row.status } });
    } catch (e) { return next(e); }
  }

  // GET /api/gallery/items/:id/comments  (behind requireGalleryItemAccess) — APPROVED only
  static async listItemComments(req, res, next) {
    try {
      const rows = await comments.listApprovedForItem(req.galleryItem.id);
      return res.json({ success: true, comments: rows });
    } catch (e) { return next(e); }
  }
```
- [ ] **Step 4: Add routes** in `src/routes/galleryRoutes.js` — import the item guard and place comment routes with the other pre-`/:schoolId` routes:
```js
const { requireGalleryAccess, requireGalleryItemAccess } = require('../middleware/galleryAccess');
```
and after the grant routes (line ~14), before `router.get('/:schoolId', ...)`:
```js
// Comment routes (Plan C) — item guard resolves the host school then delegates
router.get('/items/:id/comments', requireGalleryItemAccess, GalleryController.listItemComments);
router.post('/items/:id/comments', requireGalleryItemAccess, GalleryController.submitComment);
```
- [ ] **Step 5: Run** the spec → PASS (9 tests); full `npx jest` → green; `npx eslint .` → 0.
- [ ] **Step 6: Commit** `feat(gallery): pre-moderated comment submit + APPROVED-only reads`.

---

## Task 5: Moderation endpoints — pending queue, approve, reject (host-only)

**Files:** Modify `src/controllers/galleryController.js`, `src/routes/galleryRoutes.js`; extend `tests/integration/routes/galleryComments.spec.js`.

**Interfaces — Consumes:** `GalleryCommentModel.listPendingForSchool` / `moderateComment` (Task 2), `model.resolveViewer`, `auditGallery`. **Produces routes:**
- `GET /comments/pending` (TEACHER/SCHOOL_ADMIN) → `{ success, comments }`
- `POST /comments/:id/approve` · `POST /comments/:id/reject` (TEACHER/SCHOOL_ADMIN) → `{ success, status }`

- [ ] **Step 1: Add failing tests** to `galleryComments.spec.js` (new describe in the same file):
```js
describe('Gallery comments — host moderation', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('host TEACHER lists pending queue → 200', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, body: 'hi', createdAt: 't', portfolioItemId: ITEM_ID, itemTitle: 'Sunset', authorFirstName: 'Ana', authorOrigin: 'SAME_SCHOOL' }], rowCount: 1 }); // listPendingForSchool
    const res = await request(app).get('/api/gallery/comments/pending')
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(mockPool.query.mock.calls[1][1]).toEqual([HOST_SCHOOL]);
  });

  test('STUDENT hits pending queue → 403 (role gate)', async () => {
    const res = await request(app).get('/api/gallery/comments/pending')
      .set('Authorization', `Bearer ${sameStudentTok}`);
    expect(res.status).toBe(403);
  });

  test('host TEACHER approves → 200 APPROVED + audit', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'APPROVED' }], rowCount: 1 })  // moderateComment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                        // audit APPROVED
    const res = await request(app).post(`/api/gallery/comments/${COMMENT_ID}/approve`)
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    const modCall = mockPool.query.mock.calls[1];
    expect(modCall[1]).toEqual([COMMENT_ID, HOST_SCHOOL, 'APPROVED', 'teach-host']);
  });

  test('host TEACHER rejects → 200 REJECTED', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'REJECTED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/comments/${COMMENT_ID}/reject`)
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
  });

  test('guest-school TEACHER cannot approve → 404 (school-scoped update matches no row)', async () => {
    const guestTok = tok({ userId: 'teach-guest', role: 'TEACHER', schoolId: EXT_SCHOOL });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-guest', role: 'TEACHER', school_id: EXT_SCHOOL, grade_level: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // moderateComment → no row
    const res = await request(app).post(`/api/gallery/comments/${COMMENT_ID}/approve`)
      .set('Authorization', `Bearer ${guestTok}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('COMMENT_NOT_FOUND');
  });
});
```
(Note: `hostTeacherTok`, `sameStudentTok`, `tok`, ids are defined at file scope in Task 4 — the new describe reuses them.)
- [ ] **Step 2: Run — expect FAIL** (routes 404).
- [ ] **Step 3: Add controller methods** (after `listItemComments`):
```js
  // GET /api/gallery/comments/pending  (host TEACHER/SCHOOL_ADMIN)
  static async pendingComments(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only host-school staff can moderate.' });
      }
      const rows = await comments.listPendingForSchool(viewer.school_id);
      return res.json({ success: true, comments: rows });
    } catch (e) { return next(e); }
  }

  static async _moderateComment(req, res, next, status, actionType) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only host-school staff can moderate.' });
      }
      const row = await comments.moderateComment(req.params.id, viewer.school_id, status, viewer.id);
      if (!row) {
        return res.status(404).json({ success: false, error: 'COMMENT_NOT_FOUND',
          message: 'Comment not found, already moderated, or not in your school.' });
      }
      await auditGallery(viewer.id, 'COMPLIANCE', actionType, row.id, { status: row.status });
      return res.json({ success: true, status: row.status });
    } catch (e) { return next(e); }
  }

  // POST /api/gallery/comments/:id/approve  (host TEACHER/SCHOOL_ADMIN)
  static async approveComment(req, res, next) {
    return GalleryController._moderateComment(req, res, next, 'APPROVED', 'GALLERY_COMMENT_APPROVED');
  }

  // POST /api/gallery/comments/:id/reject  (host TEACHER/SCHOOL_ADMIN)
  static async rejectComment(req, res, next) {
    return GalleryController._moderateComment(req, res, next, 'REJECTED', 'GALLERY_COMMENT_REJECTED');
  }
```
- [ ] **Step 4: Add routes** in `src/routes/galleryRoutes.js`, next to the other comment routes (still before `/:schoolId`):
```js
router.get('/comments/pending', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.pendingComments);
router.post('/comments/:id/approve', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.approveComment);
router.post('/comments/:id/reject', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.rejectComment);
```
- [ ] **Step 5: Run** the spec → PASS (14 tests total in file); full `npx jest` → green; `npx eslint .` → 0.
- [ ] **Step 6: Commit** `feat(gallery): host-only comment moderation — pending queue, approve, reject`.

---

## Self-review (plan vs spec — comments subset)
- `gallery_comments` DDL (incl. body CHECK, item+status index) + startup DDL + real-DB test → Task 1. ✅
- Comment submit → PENDING; owner toggle; STUDENT-only; body 1–2000 → Tasks 2+4. ✅
- Cross-school comment = enablement (existing guard) + exact `grade_level == artist_grade` → Task 4 (`submitComment`), grade from `resolveViewer` (Task 2). ✅
- Reads APPROVED-only; first-name-only projection → Tasks 2+4 (asserted in unit + integration tests). ✅
- Host-only moderation (guest-school teacher cannot approve → 404) via school-scoped UPDATE → Tasks 2+5. ✅
- Single guard path preserved: `requireGalleryItemAccess` delegates to `requireGalleryAccess` → Task 3; deny-by-default 403 asserted for external student without enablement → Task 4 test. ✅
- Audits: SUBMITTED/APPROVED/REJECTED (`COMPLIANCE`), COMMENT_DENIED (`SECURITY`), plus existing ACCESS_DENIED/CROSS_SCHOOL_VIEW from the guard. ✅
- Type consistency: `getCommentableItem` row fields (`owner_school_id`, `gallery_comments_allowed`, `artist_grade`) used identically in Tasks 2/3/4; `moderateComment(commentId, schoolId, status, userId)` param order matches Task 5 assertions. ✅
- Out of scope: comment UI (Plan D), notification emails, comment deletion/editing (not in spec v1).

## Roadmap after Plan C
- **Plan D — frontend:** gallery page (view by school), student share/comments toggles, invite/accept flow page (`gallery-invite.html` — the email already links to it), roster + enablement management, moderation queue UI, comment threads (render via `textContent`).
