# Teacher: Add Individual Student — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher add one student at a time (name + email) from the teacher dashboard, creating an invite and sending the invite email immediately — alongside the existing CSV bulk upload.

**Architecture:** New `POST /api/teacher/students` endpoint inserts a single `registration_tokens` row (same model as CSV) with duplicate detection, then sends the `student-registration-invite` email best-effort via a helper shared with `send-invites`. The student self-registers through the unchanged COPPA-aware flow. Frontend adds an "Add a Student" form beside the CSV upload.

**Tech Stack:** Node/Express, PostgreSQL (`pg` via `pool`), Jest + supertest integration tests (module-mocked `pool`, locally-signed JWT), vanilla JS frontend (no build step).

## Global Constraints

- Render any user-supplied value in the DOM via `textContent` or the existing `this.escapeHtml(...)` — never via `innerHTML` string interpolation.
- `audit_logs.action_category` has a DB CHECK constraint; only these are valid: `AUTH, USER, AUCTION, BID, PAYMENT, ADMIN, COMPLIANCE, SECURITY`. Use `USER` for this feature.
- Email is best-effort: an SMTP failure must NOT fail the add (return `inviteSent:false`).
- Teacher routes are already gated by `verifyToken` + `verifyRole('TEACHER','SCHOOL_ADMIN','SITE_ADMIN')` in `src/routes/teacherRoutes.js` — do not add per-handler role checks for the happy path.
- Email address column `registration_tokens.student_email` is CITEXT; compare with `LOWER(...)` in application queries for clarity and store lowercased.
- Commit trailer for all commits: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Baseline before starting: full suite green (`npx jest`), `npx eslint` reports 0 errors (warnings acceptable).

---

## File Structure

- `src/controllers/teacherController.js` — MODIFY: add two static helpers (`_getTeacherInviteIdentity`, `_sendRegistrationInvite`), refactor `sendInvites` to use them (behavior-preserving), add `addStudent`.
- `src/routes/teacherRoutes.js` — MODIFY: add `POST /students` route.
- `tests/integration/routes/teacherAddStudentIntegrationTest.spec.js` — CREATE: integration tests for the new endpoint.
- `public/teacher-dashboard.html` — MODIFY: add "Add a Student" form card.
- `public/js/teacher-dashboard.js` — MODIFY: wire the form to a new `handleAddStudent` method.

---

## Task 1: Backend — `POST /api/teacher/students` (add individual student)

**Files:**
- Modify: `src/controllers/teacherController.js` (add helpers ~after `_resolveSchoolId` at line 33; refactor `sendInvites` at lines ~504–564; add `addStudent`)
- Modify: `src/routes/teacherRoutes.js` (add route after the `/csv-upload` route, ~line 28)
- Test: `tests/integration/routes/teacherAddStudentIntegrationTest.spec.js`

**Interfaces:**
- Consumes: existing module singletons in `teacherController.js` — `pool` (from `../models/index`), `uuidv4`, `logger`, `ValidationUtils` (has `isValidEmail`), `EmailTemplateService`, `emailProvider` (module-level instance). All already imported at the top of the file.
- Produces:
  - `TeacherController._getTeacherInviteIdentity(userId)` → `Promise<{ teacherName: string, schoolName: string }>`
  - `TeacherController._sendRegistrationInvite({ teacherName, schoolName, token, studentEmail, studentName })` → `Promise<void>` (throws on send failure)
  - `TeacherController.addStudent(req, res)` → Express handler; body `{ name, email }`; responds `201 { success, message, inviteSent, student: { id, token, studentName, studentEmail, used:false, invitedAt } }`, or `400 { success:false, error:'INVALID_NAME'|'INVALID_EMAIL' }`, or `409 { success:false, error:'ALREADY_INVITED'|'ALREADY_REGISTERED' }`.
  - Route `POST /api/teacher/students`.

---

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/routes/teacherAddStudentIntegrationTest.spec.js`:

```js
/**
 * Teacher Add Individual Student — Integration Tests
 *
 * POST /api/teacher/students creates one registration_tokens invite (same model as CSV),
 * with duplicate detection, and sends the invite email immediately (best-effort).
 *
 * Harness mirrors teacherApprovalIntegrationTest.spec.js:
 *  - pool.query mocked at module level
 *  - Auth via locally-signed JWT
 *  - The controller's emailProvider is a real SMTP transport (host undefined in test),
 *    so any path that sends spies TeacherController._sendRegistrationInvite to avoid a
 *    live SMTP attempt and keep inviteSent deterministic.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return {
    ...actual,
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const TeacherController = require('../../../src/controllers/teacherController');

const SECRET = process.env.JWT_ACCESS_SECRET;
function makeToken(payload) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256' });
}

const TEACHER = { userId: 'teacher-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: false };

describe('Teacher add individual student (POST /api/teacher/students)', () => {
  let app;

  beforeAll(() => {
    mockDb.reset();
    app = createApp(mockDb);
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
    jest.restoreAllMocks();
  });

  test('teacher adds a student — 201, invite created and sent', async () => {
    const token = makeToken(TEACHER);
    jest.spyOn(TeacherController, '_sendRegistrationInvite').mockResolvedValue(); // avoid live SMTP
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // pending-dup check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // registered-dup check
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1', created_at: new Date('2026-07-12') }], rowCount: 1 }) // INSERT token
      .mockResolvedValueOnce({ rows: [{ first_name: 'Pat', last_name: 'Teacher', school_name: 'Test School' }], rowCount: 1 }) // identity
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                   // audit log

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'Jordan@Example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteSent).toBe(true);
    expect(res.body.student.studentEmail).toBe('jordan@example.com'); // lowercased
    expect(res.body.student.studentName).toBe('Jordan Lee');
    expect(res.body.student.used).toBe(false);
  });

  test('duplicate pending invite — 409 ALREADY_INVITED', async () => {
    const token = makeToken(TEACHER);
    mockPool.query.mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 }); // pending-dup found

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_INVITED');
  });

  test('already-registered student — 409 ALREADY_REGISTERED', async () => {
    const token = makeToken(TEACHER);
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // pending-dup: none
      .mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 }); // registered-dup: found

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_REGISTERED');
  });

  test('invalid email — 400', async () => {
    const token = makeToken(TEACHER);
    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_EMAIL');
  });

  test('missing name — 400', async () => {
    const token = makeToken(TEACHER);
    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ', email: 'jordan@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_NAME');
  });

  test('non-teacher token is rejected — 403', async () => {
    const token = makeToken({ userId: 'student-1', role: 'STUDENT', twoFaEnabled: false });
    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(403);
  });

  test('SMTP failure still adds the student — 201 with inviteSent:false', async () => {
    const token = makeToken(TEACHER);
    jest.spyOn(TeacherController, '_sendRegistrationInvite').mockRejectedValueOnce(new Error('SMTP down'));
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // pending-dup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // registered-dup
      .mockResolvedValueOnce({ rows: [{ id: 'tok-2', created_at: new Date('2026-07-12') }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [{ first_name: 'Pat', last_name: 'Teacher', school_name: 'Test School' }], rowCount: 1 }) // identity
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                   // audit

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteSent).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/integration/routes/teacherAddStudentIntegrationTest.spec.js`
Expected: FAIL — most cases return 404 (route not defined); the non-teacher case may already 403.

- [ ] **Step 3: Add the two shared helpers to `teacherController.js`**

Insert immediately after the `_resolveSchoolId` method (after line 33, before the `uploadCSV` doc comment):

```js
  /**
   * Fetch the teacher's display name + school name for invite-email attribution.
   */
  static async _getTeacherInviteIdentity(userId) {
    const r = await pool.query(
      `SELECT u.first_name, u.last_name, s.name AS school_name
         FROM users u
         LEFT JOIN schools s ON s.id = u.school_id
        WHERE u.id = $1`,
      [userId]
    );
    const t = r.rows[0] || {};
    return {
      teacherName: `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'Your Teacher',
      schoolName: t.school_name || 'Your School'
    };
  }

  /**
   * Send one student-registration-invite email. Throws on send failure so callers
   * can decide whether the failure is fatal.
   */
  static async _sendRegistrationInvite({ teacherName, schoolName, token, studentEmail, studentName }) {
    const baseUrl = process.env.FRONTEND_URL || 'https://sag.live';
    const registrationLink = `${baseUrl}/register.html?token=${token}&email=${encodeURIComponent(studentEmail)}`;
    const emailContent = EmailTemplateService.generateTemplate('student-registration-invite', {
      studentName: studentName || 'Student',
      teacherName,
      schoolName,
      registrationLink
    });
    await emailProvider.send(studentEmail, emailContent.subject, emailContent.html, emailContent.text);
  }
```

- [ ] **Step 4: Refactor `sendInvites` to use the helpers (behavior-preserving)**

In `sendInvites`, replace the teacher-identity block AND the per-token email block. Find this existing code (lines ~513–553):

```js
      // Fetch teacher name + school name
      const teacherResult = await pool.query(
        `SELECT u.first_name, u.last_name, s.name AS school_name
                 FROM users u
                 LEFT JOIN schools s ON s.id = u.school_id
                 WHERE u.id = $1`,
        [userId]
      );
      const teacher = teacherResult.rows[0] || {};
      const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || 'Your Teacher';
      const schoolName = teacher.school_name || 'Your School';

      // Fetch only tokens that belong to this teacher
      const placeholders = tokenIds.map((_, i) => `$${i + 2}`).join(', ');
      const tokensResult = await pool.query(
        `SELECT id, token, student_email, student_name
                 FROM registration_tokens
                 WHERE id IN (${placeholders}) AND teacher_id = $1`,
        [userId, ...tokenIds]
      );

      const baseUrl = process.env.FRONTEND_URL || 'https://sag.live';
      let sent = 0;
      const errors = [];

      for (const row of tokensResult.rows) {
        const registrationLink = `${baseUrl}/register.html?token=${row.token}&email=${encodeURIComponent(row.student_email)}`;
        try {
          const emailContent = EmailTemplateService.generateTemplate('student-registration-invite', {
            studentName: row.student_name || 'Student',
            teacherName,
            schoolName,
            registrationLink
          });
          await emailProvider.send(row.student_email, emailContent.subject, emailContent.html, emailContent.text);
          sent++;
        } catch (err) {
          logger.error('Send invite email failed', { error: err.message, studentEmail: row.student_email });
          errors.push(`${row.student_email}: ${err.message}`);
        }
      }
```

Replace it with:

```js
      // Fetch teacher name + school name (shared with addStudent)
      const { teacherName, schoolName } = await TeacherController._getTeacherInviteIdentity(userId);

      // Fetch only tokens that belong to this teacher
      const placeholders = tokenIds.map((_, i) => `$${i + 2}`).join(', ');
      const tokensResult = await pool.query(
        `SELECT id, token, student_email, student_name
                 FROM registration_tokens
                 WHERE id IN (${placeholders}) AND teacher_id = $1`,
        [userId, ...tokenIds]
      );

      let sent = 0;
      const errors = [];

      for (const row of tokensResult.rows) {
        try {
          await TeacherController._sendRegistrationInvite({
            teacherName,
            schoolName,
            token: row.token,
            studentEmail: row.student_email,
            studentName: row.student_name
          });
          sent++;
        } catch (err) {
          logger.error('Send invite email failed', { error: err.message, studentEmail: row.student_email });
          errors.push(`${row.student_email}: ${err.message}`);
        }
      }
```

- [ ] **Step 5: Add the `addStudent` handler to `teacherController.js`**

Insert a new static method (place it directly after `uploadCSV` ends, ~line 152, before `getSubmissions`):

```js
  /**
   * Add a single student to the teacher's roster: create one registration_tokens
   * invite (same model as CSV) and send the invite email immediately (best-effort).
   * Body: { name, email }
   */
  static async addStudent(req, res) {
    try {
      const userId = req.user.id;
      const { name, email } = req.body;

      // Validate name
      if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 200) {
        return res.status(400).json({
          success: false, error: 'INVALID_NAME',
          message: 'A student name is required (max 200 characters).'
        });
      }
      // Validate email
      if (!email || !ValidationUtils.isValidEmail(email)) {
        return res.status(400).json({
          success: false, error: 'INVALID_EMAIL',
          message: 'A valid email address is required.'
        });
      }

      const studentName = name.trim();
      const studentEmail = email.toLowerCase().trim();

      // Duplicate: unused, unexpired pending invite for this teacher
      const pendingDup = await pool.query(
        `SELECT 1 FROM registration_tokens
          WHERE teacher_id = $1 AND LOWER(student_email) = $2
            AND used_at IS NULL AND token_expires_at > NOW()
          LIMIT 1`,
        [userId, studentEmail]
      );
      if (pendingDup.rowCount > 0) {
        return res.status(409).json({
          success: false, error: 'ALREADY_INVITED',
          message: 'That student already has a pending invite.'
        });
      }

      // Duplicate: already-registered student with this email under this teacher
      const registeredDup = await pool.query(
        `SELECT 1 FROM registration_tokens rt
           JOIN users u ON LOWER(u.email) = LOWER(rt.student_email)
                       AND u.deleted_at IS NULL AND u.role = 'STUDENT'
          WHERE rt.teacher_id = $1 AND LOWER(rt.student_email) = $2
          LIMIT 1`,
        [userId, studentEmail]
      );
      if (registeredDup.rowCount > 0) {
        return res.status(409).json({
          success: false, error: 'ALREADY_REGISTERED',
          message: 'That student is already registered.'
        });
      }

      // Create the invite token (same INSERT shape as uploadCSV)
      const token = uuidv4();
      const insert = await pool.query(
        `INSERT INTO registration_tokens
              (token, teacher_id, student_email, student_name, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, created_at`,
        [token, userId, studentEmail, studentName, userId]
      );
      const tokenId = insert.rows[0].id;

      // Send invite immediately (best-effort — a send failure must not fail the add)
      let inviteSent = true;
      try {
        const identity = await TeacherController._getTeacherInviteIdentity(userId);
        await TeacherController._sendRegistrationInvite({
          teacherName: identity.teacherName,
          schoolName: identity.schoolName,
          token, studentEmail, studentName
        });
      } catch (err) {
        inviteSent = false;
        logger.error('Add-student invite email failed', { error: err.message, studentEmail });
      }

      // Audit log (best-effort)
      await pool.query(
        `INSERT INTO audit_logs (user_id, action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userId, 'USER', 'student_invited', 'registration_token', tokenId,
          JSON.stringify({ studentEmail, studentName, inviteSent })]
      ).catch((err) => logger.error('Add-student audit log failed', { error: err.message }));

      return res.status(201).json({
        success: true,
        message: inviteSent ? `Invited ${studentName}` : `Added ${studentName} — invite email could not be sent`,
        inviteSent,
        student: {
          id: tokenId,
          token,
          studentName,
          studentEmail,
          used: false,
          invitedAt: insert.rows[0].created_at
        }
      });
    } catch (error) {
      logger.error('Add student error', { error: error.message, stack: error.stack, userId: req.user?.id });
      return res.status(500).json({ success: false, message: 'Error adding student' });
    }
  }
```

- [ ] **Step 6: Add the route in `teacherRoutes.js`**

Insert directly after the `/csv-upload` route block (after line 28):

```js
/**
 * POST /api/teacher/students
 * Add a single student: create one registration token and send the invite email.
 * Body: { name, email }
 */
router.post('/students', async (req, res, next) => {
  try {
    return await TeacherController.addStudent(req, res);
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 7: Run the new test file to verify it passes**

Run: `npx jest tests/integration/routes/teacherAddStudentIntegrationTest.spec.js`
Expected: PASS — 7/7.

- [ ] **Step 8: Run the full suite + lint (guard the `sendInvites` refactor)**

Run: `npx jest`
Expected: all suites pass; new count = prior passing + 7.
Run: `npx eslint src/controllers/teacherController.js src/routes/teacherRoutes.js tests/integration/routes/teacherAddStudentIntegrationTest.spec.js`
Expected: 0 errors (warnings acceptable).

- [ ] **Step 9: Commit**

```bash
git add src/controllers/teacherController.js src/routes/teacherRoutes.js tests/integration/routes/teacherAddStudentIntegrationTest.spec.js
git commit -m "feat(teacher): add POST /api/teacher/students to invite one student

Creates a single registration_tokens invite (same model as CSV) with duplicate
detection and sends the student-registration-invite email immediately (best-effort,
inviteSent:false on SMTP failure). Extracts a shared invite-email helper reused by
send-invites. 7 integration tests.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Frontend — "Add a Student" form on the teacher dashboard

**Files:**
- Modify: `public/teacher-dashboard.html` (add a card after the CSV upload card, ~line 184)
- Modify: `public/js/teacher-dashboard.js` (wire the form in `setupEventListeners` ~line 79; add `handleAddStudent` method)

**Interfaces:**
- Consumes: `TeacherController.addStudent` via `POST /api/teacher/students` (Task 1). Success body `{ message, inviteSent, student }`; `apiClient.post` throws on non-2xx with `error.status` and `error.data` (see `public/js/api-client.js:93-98`).
- Consumes existing dashboard methods: `this.apiClient` (ApiClient instance), `this.loadStudents()`.
- Produces: a `handleAddStudent(e)` method and an `#add-student-form` in the Students section.

- [ ] **Step 1: Add the form card to `teacher-dashboard.html`**

Immediately after the closing `</div>` of the CSV Upload Form card (the `<!-- CSV Upload Form -->` card ends at line 184) and before the `<!-- Student Registration Links -->` card, insert:

```html
                        <!-- Add Individual Student -->
                        <div class="card">
                            <h3>Add a Student</h3>
                            <p>Add one student at a time. They'll get an email invite to register — a parent completes it for students under 13.</p>
                            <form id="add-student-form" class="form">
                                <div class="form-group">
                                    <label for="add-student-name">Student Name <span aria-label="required">*</span></label>
                                    <input type="text" id="add-student-name" class="form-control" maxlength="200"
                                           required aria-required="true" placeholder="e.g. Jordan Lee">
                                </div>
                                <div class="form-group">
                                    <label for="add-student-email">Email <span aria-label="required">*</span></label>
                                    <input type="email" id="add-student-email" class="form-control"
                                           required aria-required="true" placeholder="student@example.com">
                                </div>
                                <button type="submit" class="btn btn-primary">Add &amp; Invite</button>
                                <div id="add-student-status" class="alert" style="display:none;margin-top:0.75rem;" role="alert"></div>
                            </form>
                        </div>
```

- [ ] **Step 2: Wire the form in `setupEventListeners`**

In `public/js/teacher-dashboard.js`, find (lines 75–79):

```js
    // CSV upload form
    const csvForm = document.getElementById('csv-upload-form');
    if (csvForm) {
      csvForm.addEventListener('submit', (e) => this.handleCSVUpload(e));
    }
```

Add immediately after it:

```js
    // Add-individual-student form
    const addStudentForm = document.getElementById('add-student-form');
    if (addStudentForm) {
      addStudentForm.addEventListener('submit', (e) => this.handleAddStudent(e));
    }
```

- [ ] **Step 3: Add the `handleAddStudent` method**

In `public/js/teacher-dashboard.js`, add this method directly after the `handleCSVUpload` method (which ends at line 310, before `displayStudentTokens`):

```js
  /**
   * Add a single student (name + email) via POST /api/teacher/students,
   * then refresh the roster so the new pending invite appears.
   */
  async handleAddStudent(e) {
    e.preventDefault();
    const nameInput  = document.getElementById('add-student-name');
    const emailInput = document.getElementById('add-student-email');
    const statusDiv  = document.getElementById('add-student-status');

    const showStatus = (msg, type) => {
      if (!statusDiv) { return; }
      statusDiv.style.display = 'block';
      statusDiv.className = `alert alert-${type}`;
      statusDiv.textContent = msg;
    };

    const name  = (nameInput?.value || '').trim();
    const email = (emailInput?.value || '').trim();

    if (!name || !email) {
      showStatus('Please enter both a name and an email.', 'error');
      return;
    }

    try {
      const response = await this.apiClient.post('/api/teacher/students', { name, email });
      showStatus(response.message || `Invited ${name}`, response.inviteSent === false ? 'warning' : 'success');
      if (nameInput)  { nameInput.value = ''; }
      if (emailInput) { emailInput.value = ''; }
      await this.loadStudents();
    } catch (error) {
      const msg = error?.data?.message || error.message || 'Could not add student. Please try again.';
      showStatus(msg, 'error');
    }
  }
```

- [ ] **Step 4: Lint the changed JS**

Run: `npx eslint public/js/teacher-dashboard.js`
Expected: 0 errors (warnings acceptable).

- [ ] **Step 5: Manual browser verification**

(teacher-dashboard.js is browser-only with no Jest harness; verify in-app.)
1. Log in as a teacher, open the dashboard Students section.
2. In "Add a Student", enter a name + a fresh email → "Add & Invite" → expect a green status "Invited {name}", the form clears, and the student appears under pending invites.
3. Submit the same email again → expect a red status "That student already has a pending invite."
4. Submit with a malformed email → the browser's `type="email"` blocks; force via empty name → red "Please enter both a name and an email."

- [ ] **Step 6: Commit**

```bash
git add public/teacher-dashboard.html public/js/teacher-dashboard.js
git commit -m "feat(teacher): 'Add a Student' form on the dashboard

Single-student add beside the CSV upload; posts to /api/teacher/students, shows
status, and refreshes the roster so the new pending invite appears.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes for the reviewer

- The `sendInvites` refactor (Task 1, Step 4) is behavior-preserving: same query, same email template, same per-token error handling — only the identity fetch and the send call are moved into shared helpers. The full suite in Step 8 guards it.
- Duplicate detection is application-level (there is no unique DB constraint on `(teacher_id, student_email)`); this is intentional and mirrors how `getStudents` joins tokens to users.
- Out of scope (unchanged): the CSV path, `/api/auth/register`, and the COPPA/parental-consent self-registration flow.
