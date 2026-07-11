# Student Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a private portfolio (In Progress / Completed buckets) with add/edit/remove, submittable into a teacher's auction, viewable by the student's inviting teacher and school admins.

**Architecture:** Approach B — a new `portfolio_items` table holds pieces independent of any auction. Submitting a completed piece copies it into a new `artwork` snapshot row linked via `artwork.portfolio_item_id`; the existing teacher submissions-review flow prices and approves it. Backend follows existing patterns: student routes in a db-injected `portfolioRoutes.js` (like `userRoutes.js`), teacher-viewing in `teacherController`/`teacherRoutes` (module-level `pool`).

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), Jest (mock-DB integration harness), vanilla HTML/CSS/JS frontend.

**Spec:** `docs/superpowers/specs/2026-07-04-student-portfolio-design.md`

## Global Constraints

- `npm run lint` must exit 0 errors (baseline ~157 warnings — do not add errors).
- `npm test` must stay green (baseline 764 passing) — every task adds tests and keeps the suite green.
- DB stores DECIMAL(10,2) dollars — never divide by 100.
- Images are validated base64 data URLs stored directly in the DB (`data:image/(jpeg|png|gif|webp);base64,...`), 10 MB body cap — never write to the filesystem.
- Never use `validator.escape()` on API input.
- Portfolio items + images are NEVER exposed on any public/unauthenticated route.
- `portfolio_status` values: exactly `IN_PROGRESS`, `COMPLETED`.
- `submission_state` values: exactly `NOT_SUBMITTED`, `PENDING_REVIEW`, `IN_AUCTION`, `SOLD`, `UNSOLD`, `REJECTED`, `WITHDRAWN`.
- Teacher view scope: a TEACHER may view student S iff a `registration_tokens` row exists with `teacher_id = viewer.id` and `LOWER(student_email) = LOWER(S.email)`; a SCHOOL_ADMIN may view any student with `school_id = admin.school_id`.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Test harness (read once)

Integration tests mock the DB and self-sign JWTs. `portfolioRoutes` is db-injected, so `createTestApp()` (which calls `createApp(mockDb)`) routes its queries through `mockDb.query`; stub with `mockDb.query.mockResolvedValueOnce(...)` in call order. Teacher routes call the module-level `pool` from `src/models/index`, so those tests `jest.mock('../../../src/models/index')` and stub `mockPool.query`. Canonical patterns live in `tests/integration/routes/userRoutesIntegrationTest.spec.js` (db-injected) and `tests/integration/routes/adminReportsSummaryIntegrationTest.spec.js` (pool). Auth: `verifyToken` reads a JWT signed with `process.env.JWT_ACCESS_SECRET`; a token payload `{ userId, role, schoolId, twoFaEnabled: true }` populates `req.user` with `id/role/schoolId`.

## File Structure

- Create: `db/migrations/20260704000000_add_portfolio_items.up.sql` / `.down.sql` — new table + `artwork.portfolio_item_id`.
- Modify: `schema.sql` — mirror the migration.
- Create: `src/utils/imageUtils.js` — `validateImageDataUrl(imageData)` shared image validator.
- Create: `src/routes/portfolioRoutes.js` — student portfolio CRUD + submit/withdraw (db-injected).
- Modify: `src/app.js` — mount `/api/portfolio` with `verifyToken`.
- Modify: `src/controllers/teacherController.js` — `listPortfolios`, `getStudentPortfolio`, extend `approveSubmission` for pricing + portfolio propagation, `rejectSubmission` propagation.
- Modify: `src/routes/teacherRoutes.js` — `GET /portfolios`, `GET /portfolios/:studentId`.
- Modify: `src/services/biddingService.js` (auction close) — propagate SOLD/UNSOLD to linked portfolio items.
- Create: `public/portfolio.html`, `public/js/portfolio.js` — student UI (incl. full-screen image lightbox).
- Create: `public/teacher-portfolios.html`, `public/js/teacher-portfolios.js` — teacher viewing UI.
- Tests: `tests/integration/routes/portfolioIntegrationTest.spec.js`, `tests/integration/routes/teacherPortfolioIntegrationTest.spec.js`, `tests/unit/utils/imageUtils.test.js`, `tests/integration/routes/portfolioPublicExposureTest.spec.js`.

---

### Task 1: Migration + schema for `portfolio_items`

**Files:**
- Create: `db/migrations/20260704000000_add_portfolio_items.up.sql`
- Create: `db/migrations/20260704000000_add_portfolio_items.down.sql`
- Modify: `schema.sql` (append the new table after `artwork`; add the `portfolio_item_id` column to the `artwork` CREATE TABLE)

**Interfaces:**
- Produces: table `portfolio_items` and column `artwork.portfolio_item_id` used by all later tasks.

- [ ] **Step 1: Write the up-migration**

`db/migrations/20260704000000_add_portfolio_items.up.sql`:

```sql
-- Student portfolio: pieces that live independently of any auction.
CREATE TABLE IF NOT EXISTS portfolio_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  medium               VARCHAR(100),
  artist_grade         VARCHAR(20),
  dimensions_width_cm  DECIMAL(10, 2),
  dimensions_height_cm DECIMAL(10, 2),
  dimensions_depth_cm  DECIMAL(10, 2),
  estimated_value      DECIMAL(10, 2),
  image_url            VARCHAR(2083),
  image_storage_key    VARCHAR(500),
  portfolio_status     VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
                       CHECK (portfolio_status IN ('IN_PROGRESS', 'COMPLETED')),
  submission_state     VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED'
                       CHECK (submission_state IN ('NOT_SUBMITTED','PENDING_REVIEW','IN_AUCTION','SOLD','UNSOLD','REJECTED','WITHDRAWN')),
  rejection_reason     TEXT,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at           TIMESTAMP WITH TIME ZONE,
  CONSTRAINT portfolio_title_check CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_student ON portfolio_items(student_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portfolio_items_school  ON portfolio_items(school_id)        WHERE deleted_at IS NULL;

ALTER TABLE artwork ADD COLUMN IF NOT EXISTS portfolio_item_id UUID NULL REFERENCES portfolio_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artwork_portfolio_item ON artwork(portfolio_item_id);
```

- [ ] **Step 2: Write the down-migration**

`db/migrations/20260704000000_add_portfolio_items.down.sql`:

```sql
DROP INDEX IF EXISTS idx_artwork_portfolio_item;
ALTER TABLE artwork DROP COLUMN IF EXISTS portfolio_item_id;
DROP INDEX IF EXISTS idx_portfolio_items_school;
DROP INDEX IF EXISTS idx_portfolio_items_student;
DROP TABLE IF EXISTS portfolio_items;
```

- [ ] **Step 3: Mirror into `schema.sql`**

In `schema.sql`, add `portfolio_item_id UUID NULL REFERENCES portfolio_items(id) ON DELETE SET NULL,` to the `artwork` table definition (after `image_storage_key`), and add the full `CREATE TABLE portfolio_items (...)` block (copy the columns/constraints from Step 1, minus `IF NOT EXISTS`) immediately after the `artwork` table and its indexes. Note: `portfolio_items` must be created AFTER `artwork` is defined? No — `artwork.portfolio_item_id` references `portfolio_items`, so in a fresh `schema.sql` build, `portfolio_items` must be created BEFORE `artwork`, OR the FK added via `ALTER TABLE` after both exist. Use the `ALTER TABLE artwork ADD COLUMN portfolio_item_id ...` form at the end of `schema.sql` (after both tables) to avoid ordering issues. Place the `CREATE TABLE portfolio_items` block after the `schools` and `users` tables (its FKs) but the `ALTER TABLE artwork` at the end.

- [ ] **Step 4: Verify SQL is syntactically valid and suite still boots**

Run: `npm test -- adminReportsSummary`
Expected: PASS (no schema is executed in tests, but this confirms nothing else broke from the file edits). Also visually confirm the constraint names and enum values match the Global Constraints exactly.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/20260704000000_add_portfolio_items.up.sql db/migrations/20260704000000_add_portfolio_items.down.sql schema.sql
git commit -m "feat(portfolio): migration + schema for portfolio_items and artwork.portfolio_item_id"
```

---

### Task 2: Shared image-validation util

**Files:**
- Create: `src/utils/imageUtils.js`
- Test: `tests/unit/utils/imageUtils.test.js`

**Interfaces:**
- Produces: `validateImageDataUrl(imageData) -> string | null` — returns the data URL if it is a valid `data:image/(jpeg|png|gif|webp);base64,...`, else `null`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

`tests/unit/utils/imageUtils.test.js`:

```javascript
const { validateImageDataUrl } = require('../../../src/utils/imageUtils');

describe('validateImageDataUrl', () => {
  test('accepts a valid png data URL', () => {
    const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect(validateImageDataUrl(url)).toBe(url);
  });
  test('accepts jpeg/gif/webp', () => {
    expect(validateImageDataUrl('data:image/jpeg;base64,/9j/4AAQ==')).toMatch(/^data:image\/jpeg/);
    expect(validateImageDataUrl('data:image/gif;base64,R0lGOD==')).toMatch(/^data:image\/gif/);
    expect(validateImageDataUrl('data:image/webp;base64,UklGRg==')).toMatch(/^data:image\/webp/);
  });
  test('rejects svg (stored-XSS vector), missing data, and non-image', () => {
    expect(validateImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(validateImageDataUrl(null)).toBeNull();
    expect(validateImageDataUrl('')).toBeNull();
    expect(validateImageDataUrl('not-a-data-url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- imageUtils`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/utils/imageUtils.js`:

```javascript
'use strict';

/**
 * Validate a base64 image data URL for direct DB storage. Returns the URL if it
 * is a recognised raster image type, else null. SVG is intentionally excluded
 * (stored-XSS vector). Mirrors the validator used in userRoutes.saveBase64Image.
 */
function validateImageDataUrl(imageData) {
  if (!imageData) { return null; }
  const valid = /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageData);
  return valid ? imageData : null;
}

module.exports = { validateImageDataUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- imageUtils`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/imageUtils.js tests/unit/utils/imageUtils.test.js
git commit -m "feat(portfolio): shared base64 image validator"
```

---

### Task 3: Portfolio create + list API

**Files:**
- Create: `src/routes/portfolioRoutes.js`
- Modify: `src/app.js:157-159` area (mount `/api/portfolio`)
- Test: `tests/integration/routes/portfolioIntegrationTest.spec.js`

**Interfaces:**
- Consumes: `validateImageDataUrl` (Task 2); `db.query`; `req.user.{id,schoolId,role}`.
- Produces: `POST /api/portfolio` (create) and `GET /api/portfolio` (list) used by the UI (Task 8) and later tasks. Item shape returned: `{ id, title, description, medium, artistGrade, imageUrl, portfolioStatus, submissionState, createdAt }`.

- [ ] **Step 1: Write the failing tests**

`tests/integration/routes/portfolioIntegrationTest.spec.js`:

```javascript
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

const SECRET = process.env.JWT_ACCESS_SECRET;
function studentToken() {
  return jwt.sign({ userId: 'stu-1', role: 'STUDENT', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' });
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Portfolio create + list', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('POST /api/portfolio creates a piece for the current student', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'pi-1', title: 'Sunset', portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED', created_at: new Date() }],
      rowCount: 1
    });
    const res = await request(app).post('/api/portfolio')
      .set('Authorization', `Bearer ${studentToken()}`)
      .send({ title: 'Sunset', description: 'sky', medium: 'Oil', artistGrade: '9', imageData: PNG });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ id: 'pi-1', title: 'Sunset', portfolioStatus: 'IN_PROGRESS', submissionState: 'NOT_SUBMITTED' });
    // INSERT bound student_user_id + school_id from the token
    const insert = mockDb.query.mock.calls.find(c => /INSERT INTO portfolio_items/.test(c[0]));
    expect(insert[1]).toEqual(expect.arrayContaining(['stu-1', 'school-1', 'Sunset']));
  });

  test('POST /api/portfolio rejects a missing title with 400', async () => {
    const res = await request(app).post('/api/portfolio')
      .set('Authorization', `Bearer ${studentToken()}`).send({ description: 'no title' });
    expect(res.status).toBe(400);
  });

  test('GET /api/portfolio lists only the current student\'s pieces', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 'pi-1', title: 'Sunset', description: null, medium: 'Oil', artist_grade: '9', image_url: PNG, portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED', created_at: new Date() }
      ], rowCount: 1
    });
    const res = await request(app).get('/api/portfolio').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ id: 'pi-1', portfolioStatus: 'IN_PROGRESS', submissionState: 'NOT_SUBMITTED' });
    const select = mockDb.query.mock.calls.find(c => /FROM portfolio_items/.test(c[0]));
    expect(select[1]).toContain('stu-1');
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/portfolio');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- portfolioIntegrationTest`
Expected: FAIL — `/api/portfolio` returns 404 (route not mounted).

- [ ] **Step 3: Implement the route module**

`src/routes/portfolioRoutes.js`:

```javascript
/**
 * Student Portfolio Routes — mounted at /api/portfolio behind verifyToken.
 * A portfolio item belongs to exactly one student (req.user.id). Items are
 * never exposed on any public route.
 */
const express = require('express');
const { validateImageDataUrl } = require('../utils/imageUtils');

function mapItem(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    medium: row.medium ?? null,
    artistGrade: row.artist_grade ?? null,
    imageUrl: row.image_url ?? null,
    portfolioStatus: row.portfolio_status,
    submissionState: row.submission_state,
    rejectionReason: row.rejection_reason ?? null,
    createdAt: row.created_at
  };
}

module.exports = (db) => {
  const router = express.Router();

  // POST /api/portfolio — create a piece for the current student
  router.post('/', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const schoolId = req.user?.schoolId || null;
      const { title, description, medium, artistGrade, width, height, imageData } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'title is required' });
      }
      const imageUrl = validateImageDataUrl(imageData);

      const result = await db.query(
        `INSERT INTO portfolio_items
           (student_user_id, school_id, title, description, medium, artist_grade,
            dimensions_width_cm, dimensions_height_cm, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, title, description, medium, artist_grade, image_url,
                   portfolio_status, submission_state, rejection_reason, created_at`,
        [
          studentId, schoolId, title.trim(),
          description || null, medium || null, artistGrade || null,
          width ? Number.parseFloat(width) : null,
          height ? Number.parseFloat(height) : null,
          imageUrl
        ]
      );
      return res.status(201).json({ success: true, item: mapItem(result.rows[0]) });
    } catch (err) { return next(err); }
  });

  // GET /api/portfolio — list the current student's pieces (both buckets)
  router.get('/', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const result = await db.query(
        `SELECT id, title, description, medium, artist_grade, image_url,
                portfolio_status, submission_state, rejection_reason, created_at
         FROM   portfolio_items
         WHERE  student_user_id = $1 AND deleted_at IS NULL
         ORDER  BY created_at DESC`,
        [studentId]
      );
      return res.json({ success: true, items: result.rows.map(mapItem) });
    } catch (err) { return next(err); }
  });

  return router;
};
```

- [ ] **Step 4: Mount the route in `src/app.js`**

In `src/app.js`, immediately after the `/api/user` block (line ~159), add:

```javascript
    // Student portfolio routes (all require JWT)
    const portfolioRoutes = require('./routes/portfolioRoutes')(db);
    app.use('/api/portfolio', authMiddleware.verifyToken);
    app.use('/api/portfolio', portfolioRoutes);
```

(`authMiddleware` is already required just above at line 156.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- portfolioIntegrationTest`
Expected: PASS (4 tests).

- [ ] **Step 6: Full suite + lint, commit**

Run: `npm test && npm run lint`

```bash
git add src/routes/portfolioRoutes.js src/app.js tests/integration/routes/portfolioIntegrationTest.spec.js
git commit -m "feat(portfolio): student create + list API"
```

---

### Task 4: Portfolio edit, status toggle, delete (with lock rules)

**Files:**
- Modify: `src/routes/portfolioRoutes.js` (add PUT/PATCH/DELETE)
- Test: extend `tests/integration/routes/portfolioIntegrationTest.spec.js`

**Interfaces:**
- Consumes: the `mapItem`/`db` from Task 3.
- Produces: `PUT /api/portfolio/:id`, `PATCH /api/portfolio/:id/status`, `DELETE /api/portfolio/:id`. Lock rule: edit/delete are blocked (409) when `submission_state IN ('PENDING_REVIEW','IN_AUCTION')`.

- [ ] **Step 1: Write the failing tests**

Append to `portfolioIntegrationTest.spec.js`:

```javascript
describe('Portfolio edit / status / delete', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('PUT edits an own, unlocked piece', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 }) // ownership+state lookup
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', title: 'New', description: null, medium: null, artist_grade: null, image_url: null, portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED', created_at: new Date() }], rowCount: 1 }); // update
    const res = await request(app).put('/api/portfolio/pi-1')
      .set('Authorization', `Bearer ${studentToken()}`).send({ title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.item.title).toBe('New');
  });

  test('PUT on another student\'s piece returns 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ownership lookup finds nothing for this student
    const res = await request(app).put('/api/portfolio/pi-x')
      .set('Authorization', `Bearer ${studentToken()}`).send({ title: 'Hack' });
    expect(res.status).toBe(404);
  });

  test('PUT is blocked (409) while PENDING_REVIEW', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'PENDING_REVIEW' }], rowCount: 1 });
    const res = await request(app).put('/api/portfolio/pi-1')
      .set('Authorization', `Bearer ${studentToken()}`).send({ title: 'Nope' });
    expect(res.status).toBe(409);
  });

  test('PATCH status toggles IN_PROGRESS -> COMPLETED', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', title: 'X', description: null, medium: null, artist_grade: null, image_url: null, portfolio_status: 'COMPLETED', submission_state: 'NOT_SUBMITTED', created_at: new Date() }], rowCount: 1 });
    const res = await request(app).patch('/api/portfolio/pi-1/status')
      .set('Authorization', `Bearer ${studentToken()}`).send({ portfolioStatus: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.item.portfolioStatus).toBe('COMPLETED');
  });

  test('PATCH rejects an invalid status with 400', async () => {
    const res = await request(app).patch('/api/portfolio/pi-1/status')
      .set('Authorization', `Bearer ${studentToken()}`).send({ portfolioStatus: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  test('DELETE soft-deletes an own, unlocked piece', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 });
    const res = await request(app).delete('/api/portfolio/pi-1').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
  });

  test('DELETE is blocked (409) while IN_AUCTION', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'IN_AUCTION' }], rowCount: 1 });
    const res = await request(app).delete('/api/portfolio/pi-1').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- portfolioIntegrationTest`
Expected: FAIL — PUT/PATCH/DELETE return 404 (not implemented).

- [ ] **Step 3: Implement**

In `src/routes/portfolioRoutes.js`, add a shared ownership helper and the three routes before `return router;`:

```javascript
  const LOCKED = new Set(['PENDING_REVIEW', 'IN_AUCTION']);

  // Load an own, non-deleted item; returns row or null.
  async function loadOwnItem(db, itemId, studentId) {
    const r = await db.query(
      `SELECT id, student_user_id, submission_state FROM portfolio_items
       WHERE id = $1 AND student_user_id = $2 AND deleted_at IS NULL`,
      [itemId, studentId]
    );
    return r.rows[0] || null;
  }

  // PUT /api/portfolio/:id — edit fields (blocked while locked)
  router.put('/:id', async (req, res, next) => {
    try {
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (LOCKED.has(item.submission_state)) {
        return res.status(409).json({ success: false, message: 'Piece is locked while under review or in an auction' });
      }
      const { title, description, medium, artistGrade, width, height, imageData } = req.body;
      if (title !== undefined && !title.trim()) {
        return res.status(400).json({ success: false, message: 'title cannot be empty' });
      }
      const imageUrl = imageData !== undefined ? validateImageDataUrl(imageData) : undefined;
      const result = await db.query(
        `UPDATE portfolio_items SET
            title       = COALESCE($2, title),
            description = COALESCE($3, description),
            medium      = COALESCE($4, medium),
            artist_grade= COALESCE($5, artist_grade),
            dimensions_width_cm  = COALESCE($6, dimensions_width_cm),
            dimensions_height_cm = COALESCE($7, dimensions_height_cm),
            image_url   = COALESCE($8, image_url),
            updated_at  = NOW()
         WHERE id = $1
         RETURNING id, title, description, medium, artist_grade, image_url,
                   portfolio_status, submission_state, rejection_reason, created_at`,
        [
          req.params.id,
          title !== undefined ? title.trim() : null,
          description !== undefined ? description : null,
          medium !== undefined ? medium : null,
          artistGrade !== undefined ? artistGrade : null,
          width !== undefined ? Number.parseFloat(width) : null,
          height !== undefined ? Number.parseFloat(height) : null,
          imageUrl !== undefined ? imageUrl : null
        ]
      );
      return res.json({ success: true, item: mapItem(result.rows[0]) });
    } catch (err) { return next(err); }
  });

  // PATCH /api/portfolio/:id/status — toggle bucket
  router.patch('/:id/status', async (req, res, next) => {
    try {
      const { portfolioStatus } = req.body;
      if (!['IN_PROGRESS', 'COMPLETED'].includes(portfolioStatus)) {
        return res.status(400).json({ success: false, message: 'portfolioStatus must be IN_PROGRESS or COMPLETED' });
      }
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      const result = await db.query(
        `UPDATE portfolio_items SET portfolio_status = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, title, description, medium, artist_grade, image_url,
                   portfolio_status, submission_state, rejection_reason, created_at`,
        [req.params.id, portfolioStatus]
      );
      return res.json({ success: true, item: mapItem(result.rows[0]) });
    } catch (err) { return next(err); }
  });

  // DELETE /api/portfolio/:id — soft delete (blocked while locked)
  router.delete('/:id', async (req, res, next) => {
    try {
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (LOCKED.has(item.submission_state)) {
        return res.status(409).json({ success: false, message: 'Piece is locked while under review or in an auction' });
      }
      await db.query(`UPDATE portfolio_items SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
      return res.json({ success: true });
    } catch (err) { return next(err); }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- portfolioIntegrationTest`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Full suite + lint, commit**

Run: `npm test && npm run lint`

```bash
git add src/routes/portfolioRoutes.js tests/integration/routes/portfolioIntegrationTest.spec.js
git commit -m "feat(portfolio): edit, status toggle, delete with lock rules"
```

---

### Task 5: Submit-to-auction (snapshot) + withdraw

**Files:**
- Modify: `src/routes/portfolioRoutes.js` (add POST `/:id/submit`, POST `/:id/withdraw`)
- Test: extend `tests/integration/routes/portfolioIntegrationTest.spec.js`

**Interfaces:**
- Consumes: `loadOwnItem`, `db`, `req.user.{id,schoolId}`.
- Produces: `POST /api/portfolio/:id/submit { auctionId }` — copies the item into an `artwork` row (`artwork_status='SUBMITTED'`, `portfolio_item_id` set, `artist_name` = student's full name) and sets the item `submission_state='PENDING_REVIEW'`. `POST /api/portfolio/:id/withdraw` — reverses it (`WITHDRAWN`, linked SUBMITTED artwork soft-deleted). Only `COMPLETED` + non-locked items can be submitted.

- [ ] **Step 1: Write the failing tests**

Append to `portfolioIntegrationTest.spec.js`:

```javascript
describe('Portfolio submit / withdraw', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('submit a COMPLETED piece creates an artwork snapshot and sets PENDING_REVIEW', async () => {
    mockDb.query
      // full item load (own, COMPLETED, NOT_SUBMITTED)
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', portfolio_status: 'COMPLETED', submission_state: 'NOT_SUBMITTED', title: 'Sunset', description: 'sky', medium: 'Oil', artist_grade: '9', dimensions_width_cm: null, dimensions_height_cm: null, image_url: 'data:image/png;base64,iVBOR==' }], rowCount: 1 })
      // auction eligibility (same school, open)
      .mockResolvedValueOnce({ rows: [{ id: 'auc-1' }], rowCount: 1 })
      // student name lookup
      .mockResolvedValueOnce({ rows: [{ first_name: 'Ava', last_name: 'Reed' }], rowCount: 1 })
      // INSERT artwork snapshot
      .mockResolvedValueOnce({ rows: [{ id: 'art-1' }], rowCount: 1 })
      // UPDATE portfolio item -> PENDING_REVIEW
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 });

    const res = await request(app).post('/api/portfolio/pi-1/submit')
      .set('Authorization', `Bearer ${studentToken()}`).send({ auctionId: 'auc-1' });
    expect(res.status).toBe(200);
    expect(res.body.submissionState).toBe('PENDING_REVIEW');
    const insertArt = mockDb.query.mock.calls.find(c => /INSERT INTO artwork/.test(c[0]));
    expect(insertArt[0]).toMatch(/portfolio_item_id/);
    expect(insertArt[1]).toEqual(expect.arrayContaining(['auc-1', 'pi-1', 'stu-1']));
  });

  test('cannot submit an IN_PROGRESS piece (409)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 });
    const res = await request(app).post('/api/portfolio/pi-1/submit')
      .set('Authorization', `Bearer ${studentToken()}`).send({ auctionId: 'auc-1' });
    expect(res.status).toBe(409);
  });

  test('submit to an auction outside the student\'s school returns 403', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', portfolio_status: 'COMPLETED', submission_state: 'NOT_SUBMITTED', title: 'X', image_url: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // auction eligibility fails
    const res = await request(app).post('/api/portfolio/pi-1/submit')
      .set('Authorization', `Bearer ${studentToken()}`).send({ auctionId: 'auc-x' });
    expect(res.status).toBe(403);
  });

  test('withdraw a pending submission returns WITHDRAWN', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'PENDING_REVIEW' }], rowCount: 1 }) // loadOwnItem
      .mockResolvedValueOnce({ rows: [{ id: 'art-1' }], rowCount: 1 }) // soft-delete linked SUBMITTED artwork
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 }); // update item -> WITHDRAWN
    const res = await request(app).post('/api/portfolio/pi-1/withdraw').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.submissionState).toBe('WITHDRAWN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- portfolioIntegrationTest`
Expected: FAIL — submit/withdraw return 404.

- [ ] **Step 3: Implement**

In `src/routes/portfolioRoutes.js`, add before `return router;`:

```javascript
  // POST /api/portfolio/:id/submit — snapshot a COMPLETED piece into an auction
  router.post('/:id/submit', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const schoolId = req.user?.schoolId || null;
      const { auctionId } = req.body;
      if (!auctionId) { return res.status(400).json({ success: false, message: 'auctionId is required' }); }

      const itemRes = await db.query(
        `SELECT id, student_user_id, portfolio_status, submission_state, title, description,
                medium, artist_grade, dimensions_width_cm, dimensions_height_cm, image_url
         FROM portfolio_items WHERE id = $1 AND student_user_id = $2 AND deleted_at IS NULL`,
        [req.params.id, studentId]
      );
      const item = itemRes.rows[0];
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (item.portfolio_status !== 'COMPLETED' || !['NOT_SUBMITTED', 'REJECTED', 'UNSOLD', 'WITHDRAWN'].includes(item.submission_state)) {
        return res.status(409).json({ success: false, message: 'Only a completed, un-submitted piece can be submitted' });
      }

      const auctionRes = await db.query(
        `SELECT id FROM auctions
         WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
           AND auction_status IN ('DRAFT','APPROVED','LIVE')`,
        [auctionId, schoolId]
      );
      if (auctionRes.rowCount === 0) {
        return res.status(403).json({ success: false, message: 'Auction not found or not open for submissions' });
      }

      const nameRes = await db.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [studentId]);
      const artistName = nameRes.rows[0]
        ? `${nameRes.rows[0].first_name} ${nameRes.rows[0].last_name || ''}`.trim()
        : 'Student Artist';

      await db.query(
        `INSERT INTO artwork
           (auction_id, created_by_user_id, portfolio_item_id, title, artist_name, medium,
            artist_grade, dimensions_width_cm, dimensions_height_cm, starting_bid_amount,
            description, image_url, artwork_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,'SUBMITTED')
         RETURNING id`,
        [
          auctionId, studentId, req.params.id, item.title, artistName, item.medium,
          item.artist_grade, item.dimensions_width_cm, item.dimensions_height_cm,
          item.description, item.image_url
        ]
      );

      await db.query(
        `UPDATE portfolio_items SET submission_state = 'PENDING_REVIEW', rejection_reason = NULL, updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      return res.json({ success: true, submissionState: 'PENDING_REVIEW' });
    } catch (err) { return next(err); }
  });

  // POST /api/portfolio/:id/withdraw — pull back a pending submission
  router.post('/:id/withdraw', async (req, res, next) => {
    try {
      const item = await loadOwnItem(db, req.params.id, req.user?.id);
      if (!item) { return res.status(404).json({ success: false, message: 'Not found' }); }
      if (item.submission_state !== 'PENDING_REVIEW') {
        return res.status(409).json({ success: false, message: 'Only a pending submission can be withdrawn' });
      }
      await db.query(
        `UPDATE artwork SET deleted_at = NOW()
         WHERE portfolio_item_id = $1 AND artwork_status = 'SUBMITTED' AND deleted_at IS NULL`,
        [req.params.id]
      );
      await db.query(
        `UPDATE portfolio_items SET submission_state = 'WITHDRAWN', updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      return res.json({ success: true, submissionState: 'WITHDRAWN' });
    } catch (err) { return next(err); }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- portfolioIntegrationTest`
Expected: PASS.

- [ ] **Step 5: Full suite + lint, commit**

Run: `npm test && npm run lint`

```bash
git add src/routes/portfolioRoutes.js tests/integration/routes/portfolioIntegrationTest.spec.js
git commit -m "feat(portfolio): submit-to-auction snapshot and withdraw"
```

---

### Task 6: Teacher pricing on approval + auction-close propagation

**Files:**
- Modify: `src/controllers/teacherController.js` — `approveSubmission` (accept `startingBid`/`reserve`, set item `IN_AUCTION`), `rejectSubmission` (propagate `REJECTED`)
- Modify: `src/services/biddingService.js` — in the auction-close path, set linked portfolio items to `SOLD`/`UNSOLD`
- Test: extend `tests/integration/routes/teacherPortfolioIntegrationTest.spec.js` (created in Task 7) OR add `tests/unit/services/portfolioPropagation.test.js`

**Interfaces:**
- Consumes: existing `PUT /api/teacher/submissions/:id/approve` and `/reject` routes; `artwork.portfolio_item_id`.
- Produces: on approve, artwork gets `starting_bid_amount`/`reserve_bid_amount` and `artwork_status='APPROVED'`, and the linked `portfolio_items.submission_state='IN_AUCTION'`. On reject, item `submission_state='REJECTED'` + `rejection_reason`. On auction close, items become `SOLD`/`UNSOLD` per the linked artwork outcome.

- [ ] **Step 1: Read the current approve/reject + close code**

Read `src/controllers/teacherController.js` `approveSubmission`/`rejectSubmission` and `src/services/biddingService.js` `closeAuction`. Note their exact query sequence so the mock ordering in tests matches. (The submission being approved is an `artwork` row; find where `artwork_status` is set to `APPROVED`.)

- [ ] **Step 2: Write the failing test — approve sets pricing + propagates**

Create `tests/unit/services/portfolioPropagation.test.js` using the pool mock:

```javascript
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const SECRET = process.env.JWT_ACCESS_SECRET;
function teacherToken() { return jwt.sign({ userId: 'tea-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }

describe('Teacher approve sets pricing and propagates IN_AUCTION', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('approve writes starting_bid/reserve and flips linked portfolio item to IN_AUCTION', async () => {
    // Stub the query sequence the handler actually runs (adjust order to match Step 1).
    // Minimal expectation: an UPDATE artwork ... SET starting_bid_amount, reserve_bid_amount, artwork_status='APPROVED'
    // and an UPDATE portfolio_items ... submission_state='IN_AUCTION' WHERE id = (the artwork's portfolio_item_id).
    mockPool.query.mockResolvedValue({ rows: [{ id: 'art-1', portfolio_item_id: 'pi-1' }], rowCount: 1 });

    const res = await request(app).put('/api/teacher/submissions/art-1/approve')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ startingBid: 25, reserve: 50 });

    expect(res.status).toBe(200);
    const sqls = mockPool.query.mock.calls.map(c => c[0]).join('\n');
    expect(sqls).toMatch(/UPDATE artwork[\s\S]*starting_bid_amount/i);
    expect(sqls).toMatch(/UPDATE portfolio_items[\s\S]*IN_AUCTION/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- portfolioPropagation`
Expected: FAIL — no `UPDATE portfolio_items ... IN_AUCTION` is issued.

- [ ] **Step 4: Implement approve/reject changes**

In `teacherController.approveSubmission`: after the existing `UPDATE artwork ... SET artwork_status='APPROVED'`, (a) also set `starting_bid_amount = $startingBid, reserve_bid_amount = $reserve` from `req.body` (validate `startingBid` is a non-negative number; `reserve` optional and, if present, `>= startingBid`, else 400), and (b) add:

```javascript
await pool.query(
  `UPDATE portfolio_items pi SET submission_state = 'IN_AUCTION', updated_at = NOW()
   FROM artwork aw
   WHERE aw.id = $1 AND aw.portfolio_item_id = pi.id`,
  [artworkId]
);
```

In `teacherController.rejectSubmission`: after setting the artwork rejected, add:

```javascript
await pool.query(
  `UPDATE portfolio_items pi SET submission_state = 'REJECTED', rejection_reason = $2, updated_at = NOW()
   FROM artwork aw
   WHERE aw.id = $1 AND aw.portfolio_item_id = pi.id`,
  [artworkId, reason || null]
);
```

Use the real local variable names for the artwork id and reason as found in Step 1.

- [ ] **Step 5: Implement auction-close propagation**

In `biddingService.closeAuction` (or wherever artworks are marked SOLD/UNSOLD at close), after the artwork outcome is written, add one statement that propagates to linked portfolio items:

```javascript
await pool.query(
  `UPDATE portfolio_items pi
     SET submission_state = CASE WHEN aw.artwork_status = 'SOLD' THEN 'SOLD' ELSE 'UNSOLD' END,
         updated_at = NOW()
   FROM artwork aw
   WHERE aw.auction_id = $1 AND aw.portfolio_item_id = pi.id
     AND pi.submission_state = 'IN_AUCTION'`,
  [auctionId]
);
```

(Use the real `pool`/`auctionId` names from that file; if close operates per-artwork, key on `aw.id` instead.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- portfolioPropagation`
Expected: PASS.

- [ ] **Step 7: Full suite + lint, commit**

Run: `npm test && npm run lint`

```bash
git add src/controllers/teacherController.js src/services/biddingService.js tests/unit/services/portfolioPropagation.test.js
git commit -m "feat(portfolio): teacher pricing on approve + auction-close status propagation"
```

---

### Task 7: Teacher / school-admin portfolio viewing API

**Files:**
- Modify: `src/controllers/teacherController.js` (`listPortfolios`, `getStudentPortfolio`)
- Modify: `src/routes/teacherRoutes.js` (`GET /portfolios`, `GET /portfolios/:studentId`)
- Test: `tests/integration/routes/teacherPortfolioIntegrationTest.spec.js`

**Interfaces:**
- Consumes: `pool`, `req.user.{id,role,schoolId}`, `registration_tokens`, `portfolio_items`.
- Produces: `GET /api/teacher/portfolios` → students the viewer may see, each with `{ studentId, studentName, inProgress, completed, inAuction }`. `GET /api/teacher/portfolios/:studentId` → that student's items (read-only), enforcing scope (TEACHER: inviting teacher; SCHOOL_ADMIN: same school).

- [ ] **Step 1: Write the failing tests**

`tests/integration/routes/teacherPortfolioIntegrationTest.spec.js` (pool-mock pattern, `teacherToken()` as in Task 6, plus a `schoolAdminToken()` and `otherTeacherToken()`):

```javascript
// ...harness header identical to Task 6...
function teacherToken() { return jwt.sign({ userId: 'tea-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function otherTeacherToken() { return jwt.sign({ userId: 'tea-2', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function schoolAdminToken() { return jwt.sign({ userId: 'sa-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }

describe('Teacher portfolio viewing', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('GET /portfolios lists the teacher\'s students with counts', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ student_id: 'stu-1', first_name: 'Ava', last_name: 'Reed', in_progress: '3', completed: '2', in_auction: '1' }],
      rowCount: 1
    });
    const res = await request(app).get('/api/teacher/portfolios').set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.students[0]).toMatchObject({ studentId: 'stu-1', inProgress: 3, completed: 2, inAuction: 1 });
  });

  test('GET /portfolios/:studentId returns items when the teacher is the inviting teacher', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 }) // scope check: registration_tokens match
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', title: 'Sunset', image_url: null, portfolio_status: 'COMPLETED', submission_state: 'IN_AUCTION', created_at: new Date() }], rowCount: 1 });
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  test('a different teacher (not the inviter) gets 403', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // scope check fails
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${otherTeacherToken()}`);
    expect(res.status).toBe(403);
  });

  test('a same-school SCHOOL_ADMIN can view any student in the school', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // student school lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // items (empty ok)
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${schoolAdminToken()}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- teacherPortfolioIntegrationTest`
Expected: FAIL — routes 404.

- [ ] **Step 3: Implement controller methods**

In `src/controllers/teacherController.js` add (bind if the file uses instance methods; match the file's existing static/instance style):

```javascript
  static async listPortfolios(req, res) {
    try {
      const viewer = req.user;
      let rows;
      if (viewer.role === 'SCHOOL_ADMIN') {
        rows = (await pool.query(
          `SELECT u.id AS student_id, u.first_name, u.last_name,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='IN_PROGRESS' AND pi.deleted_at IS NULL) AS in_progress,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='COMPLETED'  AND pi.deleted_at IS NULL) AS completed,
                  COUNT(*) FILTER (WHERE pi.submission_state='IN_AUCTION'  AND pi.deleted_at IS NULL) AS in_auction
             FROM users u
             LEFT JOIN portfolio_items pi ON pi.student_user_id = u.id
            WHERE u.role='STUDENT' AND u.school_id=$1 AND u.deleted_at IS NULL
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY u.first_name`,
          [viewer.schoolId]
        )).rows;
      } else {
        rows = (await pool.query(
          `SELECT u.id AS student_id, u.first_name, u.last_name,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='IN_PROGRESS' AND pi.deleted_at IS NULL) AS in_progress,
                  COUNT(*) FILTER (WHERE pi.portfolio_status='COMPLETED'  AND pi.deleted_at IS NULL) AS completed,
                  COUNT(*) FILTER (WHERE pi.submission_state='IN_AUCTION'  AND pi.deleted_at IS NULL) AS in_auction
             FROM registration_tokens rt
             JOIN users u ON LOWER(u.email)=LOWER(rt.student_email) AND u.role='STUDENT' AND u.deleted_at IS NULL
             LEFT JOIN portfolio_items pi ON pi.student_user_id = u.id
            WHERE rt.teacher_id=$1
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY u.first_name`,
          [viewer.id]
        )).rows;
      }
      const students = rows.map(r => ({
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name || ''}`.trim(),
        inProgress: parseInt(r.in_progress, 10) || 0,
        completed: parseInt(r.completed, 10) || 0,
        inAuction: parseInt(r.in_auction, 10) || 0
      }));
      return res.json({ success: true, students });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to list portfolios' });
    }
  }

  static async getStudentPortfolio(req, res) {
    try {
      const viewer = req.user;
      const { studentId } = req.params;

      if (viewer.role === 'SCHOOL_ADMIN') {
        const s = await pool.query(`SELECT school_id FROM users WHERE id=$1 AND role='STUDENT' AND deleted_at IS NULL`, [studentId]);
        if (s.rowCount === 0 || s.rows[0].school_id !== viewer.schoolId) {
          return res.status(403).json({ success: false, message: 'Not permitted' });
        }
      } else if (viewer.role === 'TEACHER') {
        const scope = await pool.query(
          `SELECT 1 FROM registration_tokens rt
             JOIN users u ON LOWER(u.email)=LOWER(rt.student_email)
            WHERE rt.teacher_id=$1 AND u.id=$2 LIMIT 1`,
          [viewer.id, studentId]
        );
        if (scope.rowCount === 0) { return res.status(403).json({ success: false, message: 'Not permitted' }); }
      } else {
        return res.status(403).json({ success: false, message: 'Not permitted' });
      }

      const items = await pool.query(
        `SELECT id, title, description, medium, artist_grade, image_url,
                portfolio_status, submission_state, created_at
           FROM portfolio_items
          WHERE student_user_id=$1 AND deleted_at IS NULL
          ORDER BY created_at DESC`,
        [studentId]
      );
      return res.json({
        success: true,
        items: items.rows.map(r => ({
          id: r.id, title: r.title, description: r.description, medium: r.medium,
          artistGrade: r.artist_grade, imageUrl: r.image_url,
          portfolioStatus: r.portfolio_status, submissionState: r.submission_state, createdAt: r.created_at
        }))
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to load portfolio' });
    }
  }
```

Ensure `pool` is already required at the top of `teacherController.js` (it is — used by `getStudents`).

- [ ] **Step 4: Add the routes**

In `src/routes/teacherRoutes.js`, alongside the existing routes (which already apply the teacher/admin auth guard), add:

```javascript
router.get('/portfolios', async (req, res) => TeacherController.listPortfolios(req, res));
router.get('/portfolios/:studentId', async (req, res) => TeacherController.getStudentPortfolio(req, res));
```

Match the existing handler-invocation style in the file (e.g. `async (req,res,next) => { ... }` wrapping).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- teacherPortfolioIntegrationTest`
Expected: PASS (4 tests).

- [ ] **Step 6: Full suite + lint, commit**

Run: `npm test && npm run lint`

```bash
git add src/controllers/teacherController.js src/routes/teacherRoutes.js tests/integration/routes/teacherPortfolioIntegrationTest.spec.js
git commit -m "feat(portfolio): scoped teacher/school-admin portfolio viewing API"
```

---

### Task 8: Child-safety guard — portfolio never public

**Files:**
- Test: `tests/integration/routes/portfolioPublicExposureTest.spec.js`

**Interfaces:** none new — a guard test proving portfolio data cannot leak through public endpoints.

- [ ] **Step 1: Write the test**

```javascript
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
const request = require('supertest');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

describe('Portfolio is never publicly exposed', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); mockDb.reset(); });

  test('no unauthenticated route reads portfolio_items', async () => {
    // Public carousel + a public auction listing must not query portfolio_items.
    await request(app).get('/api/auctions/carousel');
    await request(app).get('/api/auctions');
    const sql = mockPool.query.mock.calls.map(c => c[0]).join('\n');
    expect(sql).not.toMatch(/portfolio_items/i);
  });

  test('portfolio endpoints require auth', async () => {
    expect((await request(app).get('/api/portfolio')).status).toBe(401);
    expect((await request(app).post('/api/portfolio').send({ title: 'x' })).status).toBe(401);
    expect((await request(app).get('/api/teacher/portfolios')).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (guard should already hold)**

Run: `npm test -- portfolioPublicExposureTest`
Expected: PASS. If any assertion fails, a public endpoint is touching portfolio data — fix that endpoint before proceeding.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/routes/portfolioPublicExposureTest.spec.js
git commit -m "test(portfolio): guard that portfolio data is never publicly exposed"
```

---

### Task 9: Student portfolio UI (`portfolio.html` + `portfolio.js`)

**Files:**
- Create: `public/portfolio.html`
- Create: `public/js/portfolio.js`
- Modify: the shared nav partial/markup used across pages to add a "My Portfolio" link visible to STUDENT (follow how existing pages inject nav — check `public/js/` shared nav code or copy the `<nav>` block from `public/auctions.html`).

**Interfaces:**
- Consumes: `/api/portfolio` (list/create/edit/status/delete/submit/withdraw), `/api/user/artwork/auctions` (eligible auctions).
- Produces: the student-facing page. No backend contract.

- [ ] **Step 1: Create the page skeleton**

`public/portfolio.html` — copy the `<head>`, header/nav, and footer structure from `public/auctions.html` (same CSS/JS includes and auth guard script), with a main region:

```html
<main class="container" id="main-content">
  <div class="page-header"><h1>My Portfolio</h1>
    <button class="btn btn-primary" id="add-piece-btn" type="button">+ Add Artwork</button>
  </div>
  <section aria-labelledby="in-progress-h">
    <h2 id="in-progress-h">In Progress (<span id="in-progress-count">0</span>)</h2>
    <div class="portfolio-grid" id="in-progress-grid"></div>
  </section>
  <section aria-labelledby="completed-h">
    <h2 id="completed-h">Completed (<span id="completed-count">0</span>)</h2>
    <div class="portfolio-grid" id="completed-grid"></div>
  </section>
</main>
<!-- Add/Edit modal + Submit dialog + full-screen lightbox overlay -->
<div class="modal" id="piece-modal" hidden> ... form fields: title, description, medium, grade, image file ... </div>
<div class="modal" id="submit-modal" hidden> ... <select id="submit-auction"></select> ... </div>
<div class="lightbox" id="lightbox" hidden><img id="lightbox-img" alt=""></div>
```

- [ ] **Step 2: Implement `public/js/portfolio.js`**

Implement, using `fetch` with `Authorization: Bearer ${localStorage.getItem('auth_token')}` (match the token key other pages use — verify in `public/js/auctions.js`), and **DOM APIs only (createElement/textContent), never innerHTML for user data** (project XSS rule):

- `loadPortfolio()` → GET `/api/portfolio`; split items by `portfolioStatus`; render cards into the two grids; set counts.
- `renderCard(item)` → builds a card with image (click → `openLightbox(item.imageUrl)`), title, a `submissionState` badge, and action buttons: edit (✎), delete (🗑), mark-complete/mark-in-progress (toggle), and — for `COMPLETED` + submittable states — a "Submit ▸" button.
- `openLightbox(url)` → sets `#lightbox-img.src`, unhides `#lightbox`; click/Escape closes. (This is the full-screen image requirement.)
- Add/Edit modal submit → POST or PUT `/api/portfolio[/:id]` with a FileReader base64 data URL for the image; on success re-load.
- Toggle → PATCH `/api/portfolio/:id/status`.
- Delete → confirm, DELETE `/api/portfolio/:id`; on 409 show "locked" toast.
- Submit → open submit modal, populate `#submit-auction` from GET `/api/user/artwork/auctions`, POST `/api/portfolio/:id/submit { auctionId }`; on success re-load.
- Withdraw (shown when `PENDING_REVIEW`) → POST `/api/portfolio/:id/withdraw`.

Reuse the existing toast/util (`UIComponents`) as other pages do.

- [ ] **Step 3: Add portfolio CSS**

In `public/css/main.css` add `.portfolio-grid` (responsive grid, mirror `.auctions-grid`), `.portfolio-card`, `.portfolio-badge` (color by state), and `.lightbox` (fixed full-screen overlay, centered `img`, dark backdrop). Keep responsive (`public/css/responsive.css`) consistent with existing breakpoints.

- [ ] **Step 4: Manual verification (no unit harness for full page)**

Run the app locally, log in as a STUDENT, and verify: add a piece (image shows), edit, toggle to Completed, click image → full-screen lightbox, submit to an auction (appears as pending), withdraw. Confirm no console errors and that unauthenticated access to `/portfolio.html` redirects to login (existing auth-guard script).

- [ ] **Step 5: Commit**

```bash
git add public/portfolio.html public/js/portfolio.js public/css/main.css public/css/responsive.css
git commit -m "feat(portfolio): student portfolio page with buckets, CRUD, submit, and full-screen lightbox"
```

---

### Task 10: Teacher portfolio-view UI (`teacher-portfolios.html`)

**Files:**
- Create: `public/teacher-portfolios.html`
- Create: `public/js/teacher-portfolios.js`
- Modify: teacher dashboard nav to link "Student Portfolios" (follow the existing teacher-dashboard nav pattern)

**Interfaces:**
- Consumes: `/api/teacher/portfolios`, `/api/teacher/portfolios/:studentId`.
- Produces: teacher-facing read-only viewer.

- [ ] **Step 1: Create the page**

`public/teacher-portfolios.html` — copy the teacher-dashboard shell (same CSS/JS/auth guard), with a students list region `#students-list` and a per-student panel `#student-portfolio` (hidden until a student is selected).

- [ ] **Step 2: Implement `public/js/teacher-portfolios.js`**

- `loadStudents()` → GET `/api/teacher/portfolios`; render each student row with name + counts (In Progress / Completed / In Auction) and a "View ▸" action. DOM APIs only.
- `viewStudent(studentId)` → GET `/api/teacher/portfolios/:studentId`; render a read-only grid of that student's pieces (image click → same lightbox), each with its `submissionState` badge. No edit/delete controls.
- Reuse the lightbox markup/CSS from Task 9 (extract to a shared snippet or copy).

- [ ] **Step 3: Manual verification**

Log in as the inviting TEACHER: see your students + counts, open one, view their pieces read-only, image lightbox works. Confirm a teacher who did not invite a given student cannot reach that student's pieces (the API returns 403; the UI shows an error). Log in as a SCHOOL_ADMIN of the same school: can view any student.

- [ ] **Step 4: Commit**

```bash
git add public/teacher-portfolios.html public/js/teacher-portfolios.js
git commit -m "feat(portfolio): teacher/school-admin read-only portfolio viewer"
```

---

## Self-Review

**Spec coverage:** Buckets + toggle (Task 4). Student CRUD (Tasks 3-4). One image, base64 (Tasks 2-3). Visibility private + teacher/admin scope (Task 7) + public-exposure guard (Task 8). Submit with teacher pricing on approval (Tasks 5-6). Stays-in-portfolio lifecycle incl. SOLD/UNSOLD propagation (Task 6). Migration + schema (Task 1). Full-screen lightbox (Task 9). Teacher viewing UI (Task 10). All spec sections map to a task.

**Placeholder scan:** All code steps contain concrete code. Tasks 6, 9, and 10 direct the implementer to read specific existing code (approve/reject/close handlers; nav injection; token key) before editing, because those exact local names/DOM structures must match the current file — this is deliberate grounding, not a placeholder; the SQL and behavior to add are given in full.

**Type consistency:** `portfolio_status`/`submission_state` enum values are identical across migration, routes, controller, and tests. API item shape (`portfolioStatus`, `submissionState`, `imageUrl`, `artistGrade`) is consistent between `mapItem` (Task 3) and the teacher viewer (Task 7). `validateImageDataUrl` signature is stable (Task 2 → 3/4/5). `portfolio_item_id` column name is consistent across Task 1, Task 5 (INSERT), Task 6 (propagation joins), and Task 8 (guard).

## Known adaptation points (must read code, not guess)

- **Task 6** depends on the exact structure of `teacherController.approveSubmission`/`rejectSubmission` and `biddingService.closeAuction`. The plan gives the SQL to add and the assertions to satisfy; the implementer must slot it in using the real local variable names and mock the real query order.
- **Tasks 9-10** depend on the existing nav injection, auth-guard script, token localStorage key, and `UIComponents` toast API. The implementer must match those by reading `public/js/auctions.js` and `public/js/teacher-dashboard.js`.
