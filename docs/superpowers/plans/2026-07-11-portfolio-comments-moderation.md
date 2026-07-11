# Portfolio Comments & Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add teacher/admin content moderation (soft-hide + reason + notify) and a per-piece comment thread (owner + inviting teacher + school admin) to the Student Portfolio feature, on a role-agnostic foundation ready for future peer commenting.

**Architecture:** New `portfolio_comments` + `portfolio_comment_reads` tables and moderation columns on `portfolio_items`. A single `resolveAccess(db, viewer, itemId)` gate governs every comment read/post/delete (the extensible seam). Comments live under a new `/api/portfolio-comments` mount (verifyToken, NOT the STUDENT-gated `/api/portfolio`). Moderation extends the teacher-gated `/api/teacher` router. UIs add a thread panel + moderation controls.

**Tech Stack:** Node/Express, PostgreSQL (`pg`), vanilla multi-page frontend, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-07-11-portfolio-comments-moderation-design.md`

## Global Constraints

- `npm run lint` must exit 0 errors (baseline ~181 warnings — do not add errors).
- `npm test` must stay green (baseline 795 passing) — every backend task adds tests and keeps the suite green.
- DB stores DECIMAL(10,2) dollars — never divide/multiply by 100. (No money paths change here.)
- Comment `body` is stored raw; NEVER `validator.escape()` on API input; the client renders it via `textContent` (never `innerHTML`).
- Comment/moderation data is NEVER exposed on any public/unauthenticated route.
- Comments are text-only, trimmed, length 1–2000 chars.
- `moderation_status` values: exactly `VISIBLE`, `REMOVED`. `author_role` values: `STUDENT`, `TEACHER`, `SCHOOL_ADMIN`.
- Access rule (`resolveAccess`): owner student (`piece.student_user_id === viewer.id`) OR inviting TEACHER (`registration_tokens` row: `teacher_id = viewer.id` AND `LOWER(student_email) = LOWER(student.email)`, student `role='STUDENT'` and not deleted) OR same-school SCHOOL_ADMIN (`viewer.schoolId === piece.school_id`). Moderation requires inviting-teacher or same-school-admin; **restore is SCHOOL_ADMIN only**.
- Every removal, restore, and comment delete writes an `audit_logs` row.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Test harness (read once)

Two integration patterns exist. **db-injected** routes (`portfolioRoutes`, and the new `portfolioCommentRoutes`) run through `createTestApp()` (which calls `createApp(mockDb)`); stub with `mockDb.query.mockResolvedValueOnce(...)` in call order (canonical: `tests/integration/routes/portfolioIntegrationTest.spec.js`). **module-level pool** routes (`teacherController`) use `jest.mock('../../../src/models/index')` + `mockPool` (canonical: `tests/integration/routes/teacherPortfolioIntegrationTest.spec.js`). Auth: a JWT payload `{ userId, role, schoolId, twoFaEnabled: true }` signed with `process.env.JWT_ACCESS_SECRET` populates `req.user` with `id/role/schoolId`. IMPORTANT ORDERING: for a **SCHOOL_ADMIN** request, `authMiddleware` issues ONE leading `pool.query` (school-id hydration) before the controller; a TEACHER/STUDENT request issues none.

## File Structure

- Create: `db/migrations/20260711000000_add_portfolio_comments_and_moderation.{up,down}.sql` — new tables + moderation columns.
- Modify: `schema.sql` — mirror the migration.
- Modify: `src/index.js` — add idempotent DDL to the startup-migration block (the mechanism prod uses).
- Create: `src/routes/portfolioCommentRoutes.js` — db-injected comment router + exported `resolveAccess`.
- Modify: `src/app.js` — mount comment router at `/api/portfolio-comments` (verifyToken only).
- Modify: `src/routes/portfolioRoutes.js` — exclude REMOVED from the student list; add `commentCount`/`unreadCount` to the list; add `GET /removed`.
- Modify: `src/controllers/teacherController.js` — `removePortfolioItem`, `restorePortfolioItem`; add comment metadata to `getStudentPortfolio`.
- Modify: `src/routes/teacherRoutes.js` — mount the two moderation routes.
- Modify: `public/portfolio.html` + `public/js/portfolio.js` — comment thread, unread badges, removed-pieces notice.
- Modify: `public/teacher-portfolios.html` + `public/js/teacher-portfolios.js` — comment thread, moderation controls.
- Modify: `public/css/main.css` + `public/css/responsive.css` — thread/badge/notice styles.
- Tests: `tests/integration/routes/portfolioCommentsIntegrationTest.spec.js` (new); extend `teacherPortfolioIntegrationTest.spec.js`, `portfolioIntegrationTest.spec.js`, `portfolioPublicExposureTest.spec.js`.

---

### Task 1: Migration + schema — comments, reads, moderation columns

**Files:**
- Create: `db/migrations/20260711000000_add_portfolio_comments_and_moderation.up.sql`
- Create: `db/migrations/20260711000000_add_portfolio_comments_and_moderation.down.sql`
- Modify: `schema.sql` (append the new tables after `portfolio_items`; add the four moderation columns to the `portfolio_items` definition)
- Modify: `src/index.js` (add idempotent DDL to the "Portfolio schema ready" startup block)

**Interfaces:**
- Produces: table `portfolio_comments(id, portfolio_item_id, school_id, author_user_id, author_role, body, parent_comment_id, created_at, updated_at, deleted_at, deleted_by_user_id)`; table `portfolio_comment_reads(user_id, portfolio_item_id, last_read_at)`; columns `portfolio_items.moderation_status/moderated_by_user_id/moderated_at/moderation_reason`.

- [ ] **Step 1: Write the up-migration**

`db/migrations/20260711000000_add_portfolio_comments_and_moderation.up.sql`:
```sql
-- Moderation fields on portfolio_items
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE'
  CHECK (moderation_status IN ('VISIBLE','REMOVED'));
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

-- Per-piece comment thread
CREATE TABLE IF NOT EXISTS portfolio_comments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_item_id  UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  author_role        VARCHAR(20) NOT NULL,
  body               TEXT NOT NULL,
  parent_comment_id  UUID REFERENCES portfolio_comments(id) ON DELETE CASCADE,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at         TIMESTAMP WITH TIME ZONE,
  deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT portfolio_comment_body_check CHECK (length(trim(body)) BETWEEN 1 AND 2000)
);
CREATE INDEX IF NOT EXISTS idx_portfolio_comments_item   ON portfolio_comments(portfolio_item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portfolio_comments_school ON portfolio_comments(school_id);
DROP TRIGGER IF EXISTS portfolio_comments_updated_at ON portfolio_comments;
CREATE TRIGGER portfolio_comments_updated_at BEFORE UPDATE ON portfolio_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Per-user unread tracking
CREATE TABLE IF NOT EXISTS portfolio_comment_reads (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  last_read_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, portfolio_item_id)
);
```

- [ ] **Step 2: Write the down-migration**

`...down.sql`:
```sql
DROP TABLE IF EXISTS portfolio_comment_reads;
DROP TABLE IF EXISTS portfolio_comments;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderation_reason;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderated_at;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderated_by_user_id;
ALTER TABLE portfolio_items DROP COLUMN IF EXISTS moderation_status;
```

- [ ] **Step 3: Mirror in `schema.sql`** — add the four `moderation_*` columns to the `portfolio_items` CREATE TABLE, and append the two new `CREATE TABLE` blocks + indexes + trigger immediately after the `portfolio_items` section (match existing formatting).

- [ ] **Step 4: Add idempotent DDL to `src/index.js` startup block** — inside the existing `try { … console.log('✅ Portfolio schema ready') }` block (added for the base portfolio schema), append the same statements as Step 1 but each guarded with `IF NOT EXISTS` (they already are). Order: `ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS …` (×4), then `CREATE TABLE IF NOT EXISTS portfolio_comments …`, its indexes, the `DROP TRIGGER … / CREATE TRIGGER …`, then `CREATE TABLE IF NOT EXISTS portfolio_comment_reads …`. Keep the existing `console.log('✅ Portfolio schema ready')` after them.

- [ ] **Step 5: Verify idempotency + commit**

Run: `node --check src/index.js` (Expected: OK). There is no jest harness for raw DDL; the migration is reviewed for up/down symmetry and `schema.sql` parity.
```bash
git add db/migrations/20260711000000_add_portfolio_comments_and_moderation.up.sql db/migrations/20260711000000_add_portfolio_comments_and_moderation.down.sql schema.sql src/index.js
git commit -m "feat(portfolio): schema for comments + moderation"
```

---

### Task 2: Comment router — `resolveAccess` + list (mark read) + create

**Files:**
- Create: `src/routes/portfolioCommentRoutes.js`
- Modify: `src/app.js` (mount at `/api/portfolio-comments`, after the `/api/portfolio` block, ~line 165)
- Test: `tests/integration/routes/portfolioCommentsIntegrationTest.spec.js`

**Interfaces:**
- Produces: `module.exports = (db) => router` with also `module.exports.resolveAccess` NOT used cross-file in v1 (kept internal). `GET /api/portfolio-comments/item/:itemId` → `{ success, comments:[{id,body,authorName,authorRole,isOwnByViewer,createdAt}], canModerate }`. `POST /api/portfolio-comments/item/:itemId` body `{ body }` → 201 `{ success, comment }`.
- Consumes: `req.user.{id,role,schoolId}`; tables from Task 1; `registration_tokens`, `users`.

- [ ] **Step 1: Write the failing tests**

`tests/integration/routes/portfolioCommentsIntegrationTest.spec.js` (db-injected harness — copy the header from `portfolioIntegrationTest.spec.js`: `createTestApp`, `mockDb`, `request`, `jwt`, `SECRET`). Add token helpers:
```javascript
function studentToken(id = 'stu-1') { return jwt.sign({ userId: id, role: 'STUDENT', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function teacherToken() { return jwt.sign({ userId: 'tea-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function otherTeacherToken() { return jwt.sign({ userId: 'tea-2', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function adminToken() { return jwt.sign({ userId: 'sa-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
const PIECE = { id: 'pi-1', student_user_id: 'stu-1', school_id: 'school-1' };
```
```javascript
describe('Portfolio comments — list + create', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('owner student lists comments and the read row is upserted', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })                 // load piece (resolveAccess)
      .mockResolvedValueOnce({ rows: [{ id: 'c-1', body: 'Nice work', author_user_id: 'tea-1', author_role: 'TEACHER', created_at: new Date(), first_name: 'Ada', last_name: 'Lee' }], rowCount: 1 }) // comments
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                     // upsert read
    const res = await request(app).get('/api/portfolio-comments/item/pi-1').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.comments[0]).toMatchObject({ id: 'c-1', authorName: 'Ada Lee', authorRole: 'TEACHER', isOwnByViewer: false });
    const upsert = mockDb.query.mock.calls.find(c => /portfolio_comment_reads/.test(c[0]));
    expect(upsert[0]).toMatch(/ON CONFLICT/i);
  });

  test('inviting teacher can post a comment (201)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })                 // load piece
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 })             // registration_tokens inviter check
      .mockResolvedValueOnce({ rows: [{ id: 'c-9', body: 'Add more contrast', author_role: 'TEACHER', created_at: new Date() }], rowCount: 1 }); // insert
    const res = await request(app).post('/api/portfolio-comments/item/pi-1')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ body: 'Add more contrast' });
    expect(res.status).toBe(201);
    const insert = mockDb.query.mock.calls.find(c => /INSERT INTO portfolio_comments/.test(c[0]));
    expect(insert[1]).toEqual(expect.arrayContaining(['pi-1', 'school-1', 'tea-1', 'TEACHER']));
  });

  test('a non-inviting teacher is denied (403)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })                 // load piece
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                     // inviter check fails
    const res = await request(app).post('/api/portfolio-comments/item/pi-1')
      .set('Authorization', `Bearer ${otherTeacherToken()}`).send({ body: 'hi' });
    expect(res.status).toBe(403);
  });

  test('missing piece is 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });           // load piece: none
    const res = await request(app).get('/api/portfolio-comments/item/pi-x').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(404);
  });

  test('empty body is rejected 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 });      // load piece (owner short-circuits access)
    const res = await request(app).post('/api/portfolio-comments/item/pi-1')
      .set('Authorization', `Bearer ${studentToken()}`).send({ body: '   ' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- portfolioCommentsIntegrationTest`
Expected: FAIL (routes 404 — module not mounted).

- [ ] **Step 3: Implement `src/routes/portfolioCommentRoutes.js`**

```javascript
/**
 * Portfolio comment routes — mounted at /api/portfolio-comments behind verifyToken
 * (NOT under the STUDENT-gated /api/portfolio). Access to a piece's thread is
 * governed by resolveAccess: owner student, inviting teacher, or same-school admin.
 */
const express = require('express');

const MAX_BODY = 2000;

// Returns { status: 200|403|404, piece, canModerate } for the viewer against a piece.
async function resolveAccess(db, viewer, itemId) {
  const pieceRes = await db.query(
    `SELECT id, student_user_id, school_id FROM portfolio_items
      WHERE id = $1 AND deleted_at IS NULL`,
    [itemId]
  );
  const piece = pieceRes.rows[0];
  if (!piece) { return { status: 404 }; }

  if (piece.student_user_id === viewer.id) { return { status: 200, piece, canModerate: false }; }

  if (viewer.role === 'SCHOOL_ADMIN' && viewer.schoolId && viewer.schoolId === piece.school_id) {
    return { status: 200, piece, canModerate: true };
  }

  if (viewer.role === 'TEACHER') {
    const scope = await db.query(
      `SELECT 1 FROM registration_tokens rt
         JOIN users u ON LOWER(u.email) = LOWER(rt.student_email)
        WHERE rt.teacher_id = $1 AND u.id = $2 AND u.role = 'STUDENT' AND u.deleted_at IS NULL
        LIMIT 1`,
      [viewer.id, piece.student_user_id]
    );
    if (scope.rowCount > 0) { return { status: 200, piece, canModerate: true }; }
  }
  return { status: 403 };
}

function mapComment(row, viewerId) {
  const name = row.author_user_id
    ? `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'User'
    : 'Removed user';
  return {
    id: row.id,
    body: row.body,
    authorName: name,
    authorRole: row.author_role,
    isOwnByViewer: row.author_user_id === viewerId,
    createdAt: row.created_at
  };
}

module.exports = (db) => {
  const router = express.Router();

  // GET /api/portfolio-comments/item/:itemId — list + mark read
  router.get('/item/:itemId', async (req, res, next) => {
    try {
      const viewer = req.user;
      const access = await resolveAccess(db, viewer, req.params.itemId);
      if (access.status !== 200) { return res.status(access.status).json({ success: false, message: access.status === 404 ? 'Not found' : 'Not permitted' }); }

      const listed = await db.query(
        `SELECT c.id, c.body, c.author_user_id, c.author_role, c.created_at,
                u.first_name, u.last_name
           FROM portfolio_comments c
           LEFT JOIN users u ON u.id = c.author_user_id
          WHERE c.portfolio_item_id = $1 AND c.deleted_at IS NULL
          ORDER BY c.created_at ASC`,
        [req.params.itemId]
      );
      await db.query(
        `INSERT INTO portfolio_comment_reads (user_id, portfolio_item_id, last_read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, portfolio_item_id) DO UPDATE SET last_read_at = NOW()`,
        [viewer.id, req.params.itemId]
      );
      return res.json({
        success: true,
        comments: listed.rows.map(r => mapComment(r, viewer.id)),
        canModerate: access.canModerate
      });
    } catch (err) { return next(err); }
  });

  // POST /api/portfolio-comments/item/:itemId — create
  router.post('/item/:itemId', async (req, res, next) => {
    try {
      const viewer = req.user;
      const body = (req.body.body || '').trim();
      const access = await resolveAccess(db, viewer, req.params.itemId);
      if (access.status !== 200) { return res.status(access.status).json({ success: false, message: access.status === 404 ? 'Not found' : 'Not permitted' }); }
      if (body.length < 1 || body.length > MAX_BODY) {
        return res.status(400).json({ success: false, message: `Comment must be 1–${MAX_BODY} characters` });
      }
      const ins = await db.query(
        `INSERT INTO portfolio_comments (portfolio_item_id, school_id, author_user_id, author_role, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, body, author_role, created_at`,
        [req.params.itemId, access.piece.school_id, viewer.id, viewer.role, body]
      );
      const row = ins.rows[0];
      return res.status(201).json({
        success: true,
        comment: { id: row.id, body: row.body, authorName: 'You', authorRole: row.author_role, isOwnByViewer: true, createdAt: row.created_at }
      });
    } catch (err) { return next(err); }
  });

  return router;
};
```

- [ ] **Step 4: Mount in `src/app.js`** — after the `/api/portfolio` block (~line 165), add:
```javascript
    // Portfolio comment routes — reachable by students AND teachers/admins
    // (relationship enforced in-controller), so NOT under the STUDENT gate.
    const portfolioCommentRoutes = require('./routes/portfolioCommentRoutes')(db);
    app.use('/api/portfolio-comments', authMiddleware.verifyToken);
    app.use('/api/portfolio-comments', portfolioCommentRoutes);
```

- [ ] **Step 5: Run tests, full suite + lint, commit**

Run: `npm test -- portfolioCommentsIntegrationTest` (Expected: PASS, 5 tests). Then `npm test && npm run lint`.
```bash
git add src/routes/portfolioCommentRoutes.js src/app.js tests/integration/routes/portfolioCommentsIntegrationTest.spec.js
git commit -m "feat(portfolio): comment list + create with access gate"
```

---

### Task 3: Comment delete (author or moderator) + audit

**Files:**
- Modify: `src/routes/portfolioCommentRoutes.js` (add `DELETE /:commentId`)
- Test: extend `tests/integration/routes/portfolioCommentsIntegrationTest.spec.js`

**Interfaces:**
- Consumes: `resolveAccess` (already in the module).
- Produces: `DELETE /api/portfolio-comments/:commentId` → 200 `{ success }`. Soft-delete + `audit_logs` row.

- [ ] **Step 1: Write the failing tests**

Append:
```javascript
describe('Portfolio comments — delete', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('author deletes own comment (200) — soft delete + audit', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'c-1', portfolio_item_id: 'pi-1', author_user_id: 'stu-1' }], rowCount: 1 }) // load comment
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })   // resolveAccess: load piece (owner)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })        // UPDATE soft-delete
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });       // INSERT audit_logs
    const res = await request(app).delete('/api/portfolio-comments/c-1').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    const upd = mockDb.query.mock.calls.find(c => /UPDATE portfolio_comments[\s\S]*deleted_at/i.test(c[0]));
    expect(upd).toBeTruthy();
    const audit = mockDb.query.mock.calls.find(c => /INSERT INTO audit_logs/i.test(c[0]));
    expect(audit).toBeTruthy();
  });

  test('inviting teacher moderates (deletes) another user\'s comment (200)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'c-2', portfolio_item_id: 'pi-1', author_user_id: 'stu-1' }], rowCount: 1 }) // load comment
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })   // resolveAccess: piece
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 }) // inviter check -> canModerate
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })        // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });       // audit
    const res = await request(app).delete('/api/portfolio-comments/c-2').set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });

  test('a non-author non-moderator cannot delete (403)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'c-3', portfolio_item_id: 'pi-1', author_user_id: 'tea-1' }], rowCount: 1 }) // comment by teacher
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-9', school_id: 'school-1' }], rowCount: 1 })   // piece owned by someone else
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });       // inviter check fails
    const res = await request(app).delete('/api/portfolio-comments/c-3').set('Authorization', `Bearer ${otherTeacherToken()}`);
    expect(res.status).toBe(403);
  });

  test('missing comment is 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).delete('/api/portfolio-comments/c-x').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- portfolioCommentsIntegrationTest` (Expected: the 4 new delete tests FAIL — 404).

- [ ] **Step 3: Implement `DELETE /:commentId`** (add before `return router;`):
```javascript
  // DELETE /api/portfolio-comments/:commentId — author or moderator
  router.delete('/:commentId', async (req, res, next) => {
    try {
      const viewer = req.user;
      const cRes = await db.query(
        `SELECT id, portfolio_item_id, author_user_id FROM portfolio_comments
          WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.commentId]
      );
      const comment = cRes.rows[0];
      if (!comment) { return res.status(404).json({ success: false, message: 'Not found' }); }

      const access = await resolveAccess(db, viewer, comment.portfolio_item_id);
      if (access.status !== 200) { return res.status(access.status).json({ success: false, message: 'Not permitted' }); }

      const isAuthor = comment.author_user_id === viewer.id;
      if (!isAuthor && !access.canModerate) { return res.status(403).json({ success: false, message: 'Not permitted' }); }

      await db.query(
        `UPDATE portfolio_comments SET deleted_at = NOW(), deleted_by_user_id = $2, updated_at = NOW()
          WHERE id = $1`,
        [comment.id, viewer.id]
      );
      await db.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1,$2,$3,$4,$5)`,
        ['PORTFOLIO', 'comment_deleted', 'portfolio_comment', comment.id,
         JSON.stringify({ deletedBy: viewer.id, moderated: !isAuthor })]
      );
      return res.json({ success: true });
    } catch (err) { return next(err); }
  });
```

- [ ] **Step 4: Run tests, full suite + lint, commit**

Run: `npm test -- portfolioCommentsIntegrationTest` (Expected: PASS). Then `npm test && npm run lint`.
```bash
git add src/routes/portfolioCommentRoutes.js tests/integration/routes/portfolioCommentsIntegrationTest.spec.js
git commit -m "feat(portfolio): comment delete with author/moderator rule + audit"
```

---

### Task 4: Moderation remove/restore + student list excludes REMOVED + removed-notices endpoint

**Files:**
- Modify: `src/controllers/teacherController.js` (add `removePortfolioItem`, `restorePortfolioItem`)
- Modify: `src/routes/teacherRoutes.js` (mount the two routes)
- Modify: `src/routes/portfolioRoutes.js` (list WHERE adds `AND moderation_status = 'VISIBLE'`; add `GET /removed`)
- Test: extend `tests/integration/routes/teacherPortfolioIntegrationTest.spec.js` (moderation) and `tests/integration/routes/portfolioIntegrationTest.spec.js` (removed endpoint + list filter)

**Interfaces:**
- Consumes: teacher scope (reuse `getStudentPortfolio`'s check via `registration_tokens` for TEACHER, `viewer.schoolId` for SCHOOL_ADMIN); `req.user`.
- Produces: `POST /api/teacher/portfolios/:studentId/items/:itemId/remove {reason}` → 200; `POST …/restore` → 200 (admin only); `GET /api/portfolio/removed` → `{ success, removed:[{id,title,moderationReason,moderatedAt}] }`.

- [ ] **Step 1: Write the failing moderation tests** (pool-mock harness in `teacherPortfolioIntegrationTest.spec.js`; remember a SCHOOL_ADMIN request makes a leading auth `pool.query`):
```javascript
describe('Portfolio moderation — remove / restore', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('inviting teacher removes a VISIBLE piece with a reason (200) + audit', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 })   // teacher inviter scope check
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', submission_state: 'COMPLETED' }], rowCount: 1 }) // UPDATE portfolio_items -> REMOVED RETURNING
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });           // audit
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ reason: 'Contains personal info' });
    expect(res.status).toBe(200);
    const upd = mockPool.query.mock.calls.find(c => /UPDATE portfolio_items[\s\S]*REMOVED/i.test(c[0]));
    expect(upd[1]).toEqual(expect.arrayContaining(['Contains personal info']));
  });

  test('remove requires a reason (400)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 }); // scope ok
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ reason: '  ' });
    expect(res.status).toBe(400);
  });

  test('a teacher cannot restore — 403 (admin only)', async () => {
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/restore')
      .set('Authorization', `Bearer ${teacherToken()}`).send();
    expect(res.status).toBe(403);
  });

  test('same-school admin restores (200)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // (auth) admin school hydration
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // student school lookup (scope)
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 })            // UPDATE -> VISIBLE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                         // audit
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/restore')
      .set('Authorization', `Bearer ${adminToken()}`).send();
    expect(res.status).toBe(200);
  });
});
```
(Uses the file's existing `teacherToken`/`adminToken` helpers; add `adminToken` if absent, mirroring `schoolAdminToken`.)

- [ ] **Step 2: Run to verify fail** — `npm test -- teacherPortfolioIntegrationTest` (Expected: FAIL, routes 404).

- [ ] **Step 3: Implement the controller methods** in `src/controllers/teacherController.js` (append near `getStudentPortfolio`). Reuse the existing scope pattern: TEACHER → `registration_tokens` inviter check; SCHOOL_ADMIN → compare student's school to `req.user.schoolId`.
```javascript
  static async removePortfolioItem(req, res) {
    try {
      const viewer = req.user;
      const { studentId, itemId } = req.params;
      const reason = (req.body.reason || '').trim();
      if (!reason) { return res.status(400).json({ success: false, message: 'A reason is required' }); }

      const ok = await TeacherController._canModerateStudent(viewer, studentId);
      if (!ok) { return res.status(403).json({ success: false, message: 'Not permitted' }); }

      const upd = await pool.query(
        `UPDATE portfolio_items
            SET moderation_status = 'REMOVED', moderated_by_user_id = $1,
                moderated_at = NOW(), moderation_reason = $2, updated_at = NOW()
          WHERE id = $3 AND student_user_id = $4 AND deleted_at IS NULL
          RETURNING id, submission_state`,
        [viewer.id, reason, itemId, studentId]
      );
      if (upd.rowCount === 0) { return res.status(404).json({ success: false, message: 'Item not found' }); }

      // If live in an auction, withdraw the linked artwork.
      if (upd.rows[0].submission_state === 'IN_AUCTION') {
        await pool.query(
          `UPDATE artwork SET deleted_at = NOW(), updated_at = NOW()
            WHERE portfolio_item_id = $1 AND artwork_status IN ('SUBMITTED','APPROVED') AND deleted_at IS NULL`,
          [itemId]
        );
        await pool.query(
          `UPDATE portfolio_items SET submission_state = 'WITHDRAWN', updated_at = NOW() WHERE id = $1`,
          [itemId]
        );
      }
      await pool.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1,$2,$3,$4,$5)`,
        ['PORTFOLIO', 'item_removed', 'portfolio_item', itemId,
         JSON.stringify({ removedBy: viewer.id, studentId, reason })]
      );
      return res.json({ success: true, message: 'Item removed' });
    } catch (error) {
      logger.error('Remove portfolio item error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error removing item' });
    }
  }

  static async restorePortfolioItem(req, res) {
    try {
      const viewer = req.user;
      if (viewer.role !== 'SCHOOL_ADMIN') { return res.status(403).json({ success: false, message: 'Only a school admin can restore' }); }
      const { studentId, itemId } = req.params;

      const s = await pool.query(`SELECT school_id FROM users WHERE id = $1 AND role = 'STUDENT' AND deleted_at IS NULL`, [studentId]);
      if (s.rowCount === 0 || s.rows[0].school_id !== viewer.schoolId) {
        return res.status(403).json({ success: false, message: 'Not permitted' });
      }
      const upd = await pool.query(
        `UPDATE portfolio_items
            SET moderation_status = 'VISIBLE', moderated_by_user_id = NULL,
                moderated_at = NULL, moderation_reason = NULL, updated_at = NOW()
          WHERE id = $1 AND student_user_id = $2
          RETURNING id`,
        [itemId, studentId]
      );
      if (upd.rowCount === 0) { return res.status(404).json({ success: false, message: 'Item not found' }); }
      await pool.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1,$2,$3,$4,$5)`,
        ['PORTFOLIO', 'item_restored', 'portfolio_item', itemId, JSON.stringify({ restoredBy: viewer.id, studentId })]
      );
      return res.json({ success: true, message: 'Item restored' });
    } catch (error) {
      logger.error('Restore portfolio item error', { error: error.message, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error restoring item' });
    }
  }

  // Shared moderation scope: inviting teacher OR same-school admin.
  static async _canModerateStudent(viewer, studentId) {
    if (viewer.role === 'SCHOOL_ADMIN') {
      const s = await pool.query(`SELECT school_id FROM users WHERE id = $1 AND role = 'STUDENT' AND deleted_at IS NULL`, [studentId]);
      return s.rowCount > 0 && s.rows[0].school_id === viewer.schoolId;
    }
    if (viewer.role === 'TEACHER') {
      const scope = await pool.query(
        `SELECT 1 FROM registration_tokens rt
           JOIN users u ON LOWER(u.email) = LOWER(rt.student_email)
          WHERE rt.teacher_id = $1 AND u.id = $2 AND u.role = 'STUDENT' AND u.deleted_at IS NULL
          LIMIT 1`,
        [viewer.id, studentId]
      );
      return scope.rowCount > 0;
    }
    return false;
  }
```
NOTE: the `remove` test stubs the scope check as the FIRST pool.query for a TEACHER (no auth hydration). For the admin `restore` test the FIRST pool.query is the auth school-hydration, then the student lookup — order the mocks accordingly (already reflected in Step 1).

- [ ] **Step 4: Mount routes** in `src/routes/teacherRoutes.js` (below the Task 7 portfolio routes):
```javascript
router.post('/portfolios/:studentId/items/:itemId/remove', async (req, res, next) => {
  try { return await TeacherController.removePortfolioItem(req, res); } catch (e) { return next(e); }
});
router.post('/portfolios/:studentId/items/:itemId/restore', async (req, res, next) => {
  try { return await TeacherController.restorePortfolioItem(req, res); } catch (e) { return next(e); }
});
```

- [ ] **Step 5: Student list excludes REMOVED + add `GET /removed`** in `src/routes/portfolioRoutes.js`.
Change the list query WHERE (in `router.get('/')`) from `WHERE student_user_id = $1 AND deleted_at IS NULL` to:
```javascript
         WHERE student_user_id = $1 AND deleted_at IS NULL AND moderation_status = 'VISIBLE'
```
Add a new route (before the `/:id` routes to avoid param capture):
```javascript
  // GET /api/portfolio/removed — the student's own removed pieces (in-app notice)
  router.get('/removed', async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, title, moderation_reason, moderated_at
           FROM portfolio_items
          WHERE student_user_id = $1 AND moderation_status = 'REMOVED' AND deleted_at IS NULL
          ORDER BY moderated_at DESC`,
        [req.user?.id]
      );
      return res.json({
        success: true,
        removed: result.rows.map(r => ({ id: r.id, title: r.title, moderationReason: r.moderation_reason, moderatedAt: r.moderated_at }))
      });
    } catch (err) { return next(err); }
  });
```

- [ ] **Step 6: Failing tests for the list filter + removed endpoint** in `portfolioIntegrationTest.spec.js`:
```javascript
test('GET /removed lists the student\'s removed pieces', async () => {
  mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-9', title: 'Old', moderation_reason: 'PII', moderated_at: new Date() }], rowCount: 1 });
  const res = await request(app).get('/api/portfolio/removed').set('Authorization', `Bearer ${studentToken()}`);
  expect(res.status).toBe(200);
  expect(res.body.removed[0]).toMatchObject({ id: 'pi-9', moderationReason: 'PII' });
});
test('list query filters to VISIBLE', async () => {
  mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
  await request(app).get('/api/portfolio').set('Authorization', `Bearer ${studentToken()}`);
  const listCall = mockDb.query.mock.calls.find(c => /FROM portfolio_items[\s\S]*ORDER BY created_at/i.test(c[0]));
  expect(listCall[0]).toMatch(/moderation_status = 'VISIBLE'/);
});
```
(Add `studentToken` to that file if not present.)

- [ ] **Step 7: Run all, full suite + lint, commit**

Run: `npm test -- teacherPortfolioIntegrationTest portfolioIntegrationTest` (Expected: PASS). Then `npm test && npm run lint`.
```bash
git add src/controllers/teacherController.js src/routes/teacherRoutes.js src/routes/portfolioRoutes.js tests/integration/routes/teacherPortfolioIntegrationTest.spec.js tests/integration/routes/portfolioIntegrationTest.spec.js
git commit -m "feat(portfolio): moderation remove/restore + removed-notice endpoint"
```

---

### Task 5: Comment metadata (commentCount / unreadCount) on both list endpoints

**Files:**
- Modify: `src/routes/portfolioRoutes.js` (student list — add counts for the owner)
- Modify: `src/controllers/teacherController.js` (`getStudentPortfolio` — add counts for the staff viewer)
- Test: extend `portfolioIntegrationTest.spec.js` and `teacherPortfolioIntegrationTest.spec.js`

**Interfaces:**
- Produces: each item in `GET /api/portfolio` and `GET /api/teacher/portfolios/:studentId` gains `commentCount` (int) and `unreadCount` (int, comments newer than the viewer's read row and not authored by the viewer).

- [ ] **Step 1: Write failing tests**

`portfolioIntegrationTest.spec.js`:
```javascript
test('list items include commentCount and unreadCount', async () => {
  mockDb.query.mockResolvedValueOnce({ rows: [{
    id: 'pi-1', title: 'A', description: null, medium: null, artist_grade: null, image_url: null,
    portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED', rejection_reason: null, created_at: new Date(),
    comment_count: '2', unread_count: '1'
  }], rowCount: 1 });
  const res = await request(app).get('/api/portfolio').set('Authorization', `Bearer ${studentToken()}`);
  expect(res.body.items[0]).toMatchObject({ commentCount: 2, unreadCount: 1 });
});
```
`teacherPortfolioIntegrationTest.spec.js` (in the existing `viewStudent` describe): assert an item includes `commentCount`/`unreadCount` when the row carries `comment_count`/`unread_count`.

- [ ] **Step 2: Run to verify fail** — Expected: FAIL (mapItem lacks the fields).

- [ ] **Step 3: Implement**

In `src/routes/portfolioRoutes.js`, extend `mapItem` to include the counts, and add correlated subqueries to the list SELECT (viewer is the owner, `$1`):
```javascript
// mapItem: add these two lines to the returned object
    commentCount: Number.parseInt(row.comment_count, 10) || 0,
    unreadCount: Number.parseInt(row.unread_count, 10) || 0
```
List SELECT (add to the column list, keeping the existing columns):
```sql
       ,(SELECT COUNT(*) FROM portfolio_comments c
          WHERE c.portfolio_item_id = portfolio_items.id AND c.deleted_at IS NULL) AS comment_count
       ,(SELECT COUNT(*) FROM portfolio_comments c
          LEFT JOIN portfolio_comment_reads r ON r.portfolio_item_id = c.portfolio_item_id AND r.user_id = $1
          WHERE c.portfolio_item_id = portfolio_items.id AND c.deleted_at IS NULL
            AND c.author_user_id <> $1
            AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)) AS unread_count
```
In `getStudentPortfolio` (teacherController), add the same two subqueries to that items SELECT and map `commentCount`/`unreadCount` into each returned item. CRITICAL: here the piece-owner filter uses `studentId`, but the unread subquery's viewer is the **staff viewer** (`req.user.id`), a DIFFERENT bind param — the `r.user_id = $N` join and the `c.author_user_id <> $N` exclusion must both bind `req.user.id`, NOT `studentId`. Add `req.user.id` as a distinct parameter (e.g. `$2`) and keep `studentId` as the owner filter (`$1`).

- [ ] **Step 4: Run, full suite + lint, commit**

Run: `npm test -- portfolioIntegrationTest teacherPortfolioIntegrationTest` (Expected: PASS). Then `npm test && npm run lint`.
```bash
git add src/routes/portfolioRoutes.js src/controllers/teacherController.js tests/integration/routes/portfolioIntegrationTest.spec.js tests/integration/routes/teacherPortfolioIntegrationTest.spec.js
git commit -m "feat(portfolio): comment counts + unread on portfolio lists"
```

---

### Task 6: Public-exposure guard extension

**Files:**
- Modify: `tests/integration/routes/portfolioPublicExposureTest.spec.js`

**Interfaces:** none new — a guard test proving comment/moderation data cannot leak publicly and the new routes require auth.

- [ ] **Step 1: Extend the guard test**

Add to the existing `describe`:
```javascript
test('no public route reads portfolio_comments', async () => {
  await request(app).get('/api/auctions/carousel');
  await request(app).get('/api/auctions');
  await request(app).get('/api/auctions/00000000-0000-0000-0000-000000000001/public');
  const sql = [
    ...mockPool.query.mock.calls,
    ...(mockDb.query && mockDb.query.mock ? mockDb.query.mock.calls : [])
  ].map(c => c[0]).join('\n');
  expect(sql).not.toMatch(/portfolio_comments/i);
});

test('comment + moderation routes require auth (401 unauthenticated)', async () => {
  expect((await request(app).get('/api/portfolio-comments/item/pi-1')).status).toBe(401);
  expect((await request(app).post('/api/portfolio-comments/item/pi-1').send({ body: 'x' })).status).toBe(401);
  expect((await request(app).delete('/api/portfolio-comments/c-1')).status).toBe(401);
  expect((await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove').send({ reason: 'x' })).status).toBe(401);
  expect((await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/restore')).status).toBe(401);
  expect((await request(app).get('/api/portfolio/removed')).status).toBe(401);
});
```

- [ ] **Step 2: Run + commit**

Run: `npm test -- portfolioPublicExposureTest` (Expected: PASS — guard already holds). Then `npm test && npm run lint`.
```bash
git add tests/integration/routes/portfolioPublicExposureTest.spec.js
git commit -m "test(portfolio): guard comments/moderation from public exposure"
```

> **CHECKPOINT (backend complete, Tasks 1–6).** Pause for the human before UI tasks 7–8.

---

### Task 7: Student UI — comment thread, unread badges, removed-pieces notice

**Files:**
- Modify: `public/portfolio.html`, `public/js/portfolio.js`, `public/css/main.css`, `public/css/responsive.css`

**Interfaces:** consumes `GET/POST /api/portfolio-comments/item/:id`, `DELETE /api/portfolio-comments/:commentId`, `GET /api/portfolio/removed`, and the new `commentCount`/`unreadCount` on `GET /api/portfolio` items.

- [ ] **Step 1: Read the current page + conventions** — read `public/js/portfolio.js` (card render, `window.apiClient`, `UIComponents`, the existing lightbox) and `public/portfolio.html`. Follow them exactly (DOM-only rendering; `window.apiClient.get/post/delete`; `UIComponents.createToast`/`showConfirmation`).

- [ ] **Step 2: Add a "Removed pieces" notice** — on load, `GET /api/portfolio/removed`; if any, render a dismissible banner listing each `{title}` + `{moderationReason}` + date via `textContent`. This is the student's removal notification.

- [ ] **Step 3: Add a comments affordance per card** — render a "Comments (n)" button showing `commentCount`, with an unread dot when `unreadCount > 0`. Clicking opens a thread panel (a modal or an expanding section) that:
  - `GET /api/portfolio-comments/item/:id` → renders each comment (authorName · authorRole · date · body) via `textContent`; own comments (`isOwnByViewer`) get a delete (🗑) button → `DELETE /api/portfolio-comments/:commentId` then reload the thread.
  - Has a post box (≤2000 chars) → `POST /api/portfolio-comments/item/:id { body }` → append + clear unread dot.
  - Opening the thread clears the card's unread indicator (the GET marks read server-side).

- [ ] **Step 4: CSS** — `.comment-thread`, `.comment`, `.comment-meta`, `.comment-unread-dot`, `.removed-notice`; responsive at existing breakpoints. Keyboard-operable (Escape closes the thread panel), `aria-label`s on icon buttons, `aria-live` on the thread list.

- [ ] **Step 5: Verify + commit**

Run: `node --check public/js/portfolio.js` (OK) and `npm run lint` (0 errors). `npm test` stays 795+ (no backend change). Manual QA on the live site.
```bash
git add public/portfolio.html public/js/portfolio.js public/css/main.css public/css/responsive.css
git commit -m "feat(portfolio): student comment thread + unread + removed notice"
```

---

### Task 8: Teacher UI — comment thread + moderation controls

**Files:**
- Modify: `public/teacher-portfolios.html`, `public/js/teacher-portfolios.js` (+ CSS reuse from Task 7)

**Interfaces:** consumes the comment endpoints, the moderation endpoints (`…/remove`, `…/restore`), and `commentCount`/`unreadCount` on `GET /api/teacher/portfolios/:studentId` items.

- [ ] **Step 1: Read the current viewer** — `public/js/teacher-portfolios.js` (`renderReadOnlyCard`, `viewStudent`, the lightbox). Follow its patterns.

- [ ] **Step 2: Add the comment thread to each piece** — same thread panel as Task 7 (reuse the CSS classes), but the teacher/admin can delete ANY comment (server enforces). Post box posts as the teacher/admin.

- [ ] **Step 3: Add a Remove control** — on each VISIBLE piece, a "Remove" button that prompts for a required reason (`UIComponents` prompt or a small modal) → `POST /api/teacher/portfolios/:studentId/items/:itemId/remove { reason }` → on success show a toast and re-load the student's pieces.

- [ ] **Step 4: Admin restore + show removed** — when the viewer is a SCHOOL_ADMIN, `viewStudent` should also surface `REMOVED` pieces (flagged with reason/moderator) each with a "Restore" button → `POST …/restore` → re-load. (Teachers do not see the Restore control.) NOTE: `getStudentPortfolio` currently returns only non-removed items unless extended; if admin-visibility of removed items requires a query change, include a minimal `includeRemoved` branch for SCHOOL_ADMIN in `getStudentPortfolio` and cover it with one integration test.

- [ ] **Step 5: Verify + commit**

Run: `node --check public/js/teacher-portfolios.js` (OK); `npm run lint` (0 errors); `npm test` unchanged. Manual QA on the live site.
```bash
git add public/teacher-portfolios.html public/js/teacher-portfolios.js public/css/main.css public/css/responsive.css
git commit -m "feat(portfolio): teacher comment thread + moderation controls"
```

---

## Notes for the executor

- After Task 8, run the final whole-branch review (opus) via `scripts/review-package $(git merge-base main HEAD) HEAD`, then `superpowers:finishing-a-development-branch`.
- Deploy note: the schema is provisioned by the `src/index.js` startup block (Task 1 step 4), so a redeploy auto-creates it — no manual migration step on the VPS.
- Task 8 Step 4 flags the one place the plan may need a small backend addition (`includeRemoved` in `getStudentPortfolio`); handle it there with a test rather than guessing earlier.
