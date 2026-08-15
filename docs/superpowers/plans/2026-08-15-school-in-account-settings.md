# Show Registered School in Account Settings (+ time-aware greeting) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each user's registered school (read-only) in Account Settings, keep the teacher header school badge working, and make the teacher greeting reflect the local time of day.

**Architecture:** One backend change adds `schoolName` to the shared `GET /api/user/profile` response. A tiny shared frontend helper (`applySchoolRow`) renders a read-only "School" row that hides when there's no school; the user dashboard (students/teachers) and admin dashboard both use it. The teacher dashboard gets a pure `pickGreeting(hour)` for the greeting word and a badge fix so it never sticks on "Loading…".

**Tech Stack:** Node/Express, vanilla JS (browser), Jest (+ jsdom for frontend units), PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-08-15-school-in-account-settings-design.md`

## Global Constraints

- `getProfile` adds `schoolName`: the school's `name` when the user has a `school_id`, otherwise `null`. No other profile field changes.
- The School display is **read-only** everywhere — static text, never an `<input>`, never part of a form submit; **hidden entirely when there is no school**.
- Access token (`auth_token`) + `Authorization: Bearer` flow unchanged.
- Greeting word by local hour: `05:00–11:59` → "Good morning"; `12:00–16:59` → "Good afternoon"; `17:00–04:59` → "Good evening".
- Follow existing patterns: Jest + supertest; frontend units use `/** @jest-environment jsdom */` and live in `tests/unit/public/` (see `tests/unit/public/authManagerRefresh.test.js`).

## File Structure

- **Modify** `src/controllers/userController.js` — `getProfile` returns `schoolName`.
- **Create** `public/js/school-display.js` — shared `applySchoolRow(rowEl, valueEl, schoolName)` helper (browser global + CommonJS export).
- **Modify** `public/user-dashboard.html` — read-only School row + script include.
- **Modify** `public/js/user-dashboard.js` — populate the School row.
- **Modify** `public/admin-dashboard.html` — read-only School row + script include.
- **Modify** `public/js/admin-dashboard.js` — populate the School row.
- **Modify** `public/teacher-dashboard.html` — wrap the greeting word in a span.
- **Modify** `public/js/teacher-dashboard.js` — `pickGreeting` + greeting/badge render.
- **Create** tests: `tests/unit/controllers/getProfileSchoolName.test.js`, `tests/unit/public/schoolDisplay.test.js`, `tests/unit/public/teacherGreeting.test.js`.

---

### Task 1: Backend — `getProfile` returns `schoolName`

**Files:**
- Modify: `src/controllers/userController.js` (`getProfile`, return block ~710-726)
- Test: `tests/unit/controllers/getProfileSchoolName.test.js`

**Interfaces:**
- Consumes: `UserController(userModel, authenticationService)`; `this.authService.db.query(sql, params)`; `this.userModel.getById(userId, false)`.
- Produces: `GET /api/user/profile` → `data.schoolName` = school name (string) when the user has a `school_id`, else `null`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/controllers/getProfileSchoolName.test.js`:

```javascript
process.env.NODE_ENV = 'test';

const UserController = require('../../../src/controllers/userController');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

describe('UserController.getProfile — schoolName', () => {
  test('returns the school name when the user has a school_id', async () => {
    const userModel = { getById: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', first_name: 'A', last_name: 'B', phone_number: null, role: 'TEACHER', school_id: 'school-1', account_status: 'ACTIVE', two_fa_enabled: false, last_login: null, created_at: null }) };
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ name: 'Northview High School' }] }) };
    const ctrl = new UserController(userModel, { db });
    const res = fakeRes();

    await ctrl.getProfile({ user: { id: 'u1' } }, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.schoolName).toBe('Northview High School');
    expect(db.query).toHaveBeenCalledWith('SELECT name FROM schools WHERE id = $1', ['school-1']);
  });

  test('returns schoolName null and does not query when there is no school_id', async () => {
    const userModel = { getById: jest.fn().mockResolvedValue({ id: 'u2', email: 'x@y.z', first_name: 'X', last_name: 'Y', phone_number: null, role: 'BIDDER', school_id: null, account_status: 'ACTIVE', two_fa_enabled: false, last_login: null, created_at: null }) };
    const db = { query: jest.fn() };
    const ctrl = new UserController(userModel, { db });
    const res = fakeRes();

    await ctrl.getProfile({ user: { id: 'u2' } }, res, jest.fn());

    expect(res.body.data.schoolName).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/controllers/getProfileSchoolName.test.js`
Expected: FAIL — `res.body.data.schoolName` is `undefined` (field not returned yet).

- [ ] **Step 3: Implement `schoolName` in `getProfile`**

In `src/controllers/userController.js`, replace the return block in `getProfile` (currently):

```javascript
      // Retrieve user profile (exclude sensitive fields)
      const user = await this.userModel.getById(userId, false);

      return res.json({
        success: true,
        message: 'User profile retrieved successfully',
        data: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          role: user.role,
          schoolId: user.school_id,
          accountStatus: user.account_status,
          twoFactorEnabled: !!user.two_fa_enabled,
          lastLogin: user.last_login,
          createdAt: user.created_at
        }
      });
```

with:

```javascript
      // Retrieve user profile (exclude sensitive fields)
      const user = await this.userModel.getById(userId, false);

      // Read-only school name for Account Settings display. Non-fatal: any
      // lookup failure leaves schoolName null so the profile still loads.
      let schoolName = null;
      if (user.school_id && this.authService?.db) {
        try {
          const schoolResult = await this.authService.db.query(
            'SELECT name FROM schools WHERE id = $1',
            [user.school_id]
          );
          schoolName = schoolResult.rows[0]?.name || null;
        } catch (_err) {
          schoolName = null;
        }
      }

      return res.json({
        success: true,
        message: 'User profile retrieved successfully',
        data: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          role: user.role,
          schoolId: user.school_id,
          schoolName,
          accountStatus: user.account_status,
          twoFactorEnabled: !!user.two_fa_enabled,
          lastLogin: user.last_login,
          createdAt: user.created_at
        }
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/controllers/getProfileSchoolName.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/userController.js tests/unit/controllers/getProfileSchoolName.test.js
git commit -m "feat(profile): getProfile returns schoolName (read-only school display)"
```

---

### Task 2: Shared `applySchoolRow` helper

**Files:**
- Create: `public/js/school-display.js`
- Test: `tests/unit/public/schoolDisplay.test.js`

**Interfaces:**
- Produces: `applySchoolRow(rowEl, valueEl, schoolName)` — when `schoolName` is truthy, sets `valueEl.textContent` and shows `rowEl` (`rowEl.hidden = false`); when falsy, clears the text and hides `rowEl` (`rowEl.hidden = true`). No-ops if either element is missing. Exposed as `window.applySchoolRow` (browser) and `module.exports` (tests).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/public/schoolDisplay.test.js`:

```javascript
/** @jest-environment jsdom */
const { applySchoolRow } = require('../../../public/js/school-display');

function setup() {
  document.body.innerHTML = '<div id="row" hidden><span id="val"></span></div>';
  return { row: document.getElementById('row'), val: document.getElementById('val') };
}

describe('applySchoolRow', () => {
  test('shows the row and sets the name when present', () => {
    const { row, val } = setup();
    applySchoolRow(row, val, 'Northview High School');
    expect(row.hidden).toBe(false);
    expect(val.textContent).toBe('Northview High School');
  });

  test('hides the row when the name is null/empty', () => {
    const { row, val } = setup();
    row.hidden = false;
    applySchoolRow(row, val, null);
    expect(row.hidden).toBe(true);
    expect(val.textContent).toBe('');
  });

  test('no-ops when elements are missing', () => {
    expect(() => applySchoolRow(null, null, 'X')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/public/schoolDisplay.test.js`
Expected: FAIL — `Cannot find module '../../../public/js/school-display'`.

- [ ] **Step 3: Create the helper**

Create `public/js/school-display.js`:

```javascript
/**
 * Populate and toggle a read-only "School" row.
 * Shows the row with the school name when present; hides it entirely otherwise.
 * Display-only — never an input, never submitted.
 * @param {HTMLElement|null} rowEl   - the row container (has `hidden` toggled)
 * @param {HTMLElement|null} valueEl - the element that holds the school name text
 * @param {string|null|undefined} schoolName
 */
function applySchoolRow(rowEl, valueEl, schoolName) {
  if (!rowEl || !valueEl) { return; }
  if (schoolName) {
    valueEl.textContent = schoolName;
    rowEl.hidden = false;
  } else {
    valueEl.textContent = '';
    rowEl.hidden = true;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applySchoolRow };
}
if (typeof window !== 'undefined') {
  window.applySchoolRow = applySchoolRow;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/public/schoolDisplay.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add public/js/school-display.js tests/unit/public/schoolDisplay.test.js
git commit -m "feat(profile): shared applySchoolRow helper for read-only school row"
```

---

### Task 3: Account Settings School row (student + teacher)

**Files:**
- Modify: `public/user-dashboard.html` (Profile Information section ~304; script includes near bottom)
- Modify: `public/js/user-dashboard.js` (`displayUserData` ~59-70)

**Interfaces:**
- Consumes: `applySchoolRow` (Task 2); `this.user.schoolName` from `GET /api/user/profile` (Task 1).

- [ ] **Step 1: Add the read-only School row markup**

In `public/user-dashboard.html`, inside the Profile Information `.settings-section`, immediately after `<h3>Profile Information</h3>` and **before** `<form id="profile-form" ...>`, add:

```html
                        <div class="form-group" id="profile-school-row" hidden>
                            <label>School</label>
                            <p class="form-static" id="profile-school"></p>
                        </div>
```

- [ ] **Step 2: Include the shared helper script**

In `public/user-dashboard.html`, find the script includes near the bottom (the `<script src="/js/...">` block that loads `user-dashboard.js`). Add, **before** the `user-dashboard.js` line:

```html
    <script src="/js/school-display.js"></script>
```

- [ ] **Step 3: Populate the row in `displayUserData`**

In `public/js/user-dashboard.js`, in `displayUserData()`, after the phone input block:

```javascript
    const phoneInput = document.querySelector('input[name="phone"]');
    if (phoneInput) {phoneInput.value = this.user.phoneNumber || '';}
```

add:

```javascript
    // Read-only school (Account Settings); hidden when the user has no school.
    applySchoolRow(
      document.getElementById('profile-school-row'),
      document.getElementById('profile-school'),
      this.user.schoolName
    );
```

- [ ] **Step 4: Manual verification**

The server dashboards require a DB-backed login, so verify in the browser after deploy (or with a stubbed login locally): open Account Settings → Profile Information. A user with a school sees a read-only "School: <name>" row; a bidder (no school) sees no such row. Confirm the school is not an editable field and is absent from the Save Changes payload.

- [ ] **Step 5: Commit**

```bash
git add public/user-dashboard.html public/js/user-dashboard.js
git commit -m "feat(profile): show read-only School in Account Settings (student/teacher)"
```

---

### Task 4: Admin dashboard School row

**Files:**
- Modify: `public/admin-dashboard.html` (My Account section ~202; script includes)
- Modify: `public/js/admin-dashboard.js` (`load2FAStatus` ~1864-1878)

**Interfaces:**
- Consumes: `applySchoolRow` (Task 2); `data.data.schoolName` from `GET /api/user/profile` (Task 1).

- [ ] **Step 1: Add the read-only School row markup**

In `public/admin-dashboard.html`, in the account tab, immediately **before** the `<!-- My Account Security -->` block (the `<div class="section-box"><h3>My Account Security</h3>` at ~202), add:

```html
                    <!-- My School -->
                    <div class="section-box" id="admin-school-row" hidden>
                        <h3>My School</h3>
                        <p id="admin-school"></p>
                    </div>
```

- [ ] **Step 2: Include the shared helper script**

In `public/admin-dashboard.html`, in the bottom script includes, add **before** the `admin-dashboard.js` line:

```html
    <script src="/js/school-display.js"></script>
```

- [ ] **Step 3: Populate the row in `load2FAStatus`**

In `public/js/admin-dashboard.js`, in `load2FAStatus()`, after the admin-name display block (the `if (adminNameEl && data.data) { ... }`), add:

```javascript
      // Read-only school for school-admins; hidden for site-admins (no school).
      applySchoolRow(
        document.getElementById('admin-school-row'),
        document.getElementById('admin-school'),
        data.data?.schoolName
      );
```

- [ ] **Step 4: Manual verification**

After deploy (or stubbed login): as a school-admin, the account tab shows a read-only "My School" box with the school name; as a site-admin (no school), the box is absent.

- [ ] **Step 5: Commit**

```bash
git add public/admin-dashboard.html public/js/admin-dashboard.js
git commit -m "feat(profile): show read-only School on admin dashboard (school-admins)"
```

---

### Task 5: Teacher greeting (time-aware) + badge fix

**Files:**
- Modify: `public/teacher-dashboard.html:73` (greeting span)
- Modify: `public/js/teacher-dashboard.js` (`pickGreeting` + render ~615-625; export guard at bottom)
- Test: `tests/unit/public/teacherGreeting.test.js`

**Interfaces:**
- Produces: `pickGreeting(hour)` → `'Good morning'` for `5 <= hour < 12`, `'Good afternoon'` for `12 <= hour < 17`, else `'Good evening'`. Exposed via `module.exports` for tests.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/public/teacherGreeting.test.js`:

```javascript
/** @jest-environment jsdom */
const { pickGreeting } = require('../../../public/js/teacher-dashboard');

describe('pickGreeting', () => {
  test.each([
    [5, 'Good morning'], [9, 'Good morning'], [11, 'Good morning'],
    [12, 'Good afternoon'], [14, 'Good afternoon'], [16, 'Good afternoon'],
    [17, 'Good evening'], [20, 'Good evening'], [23, 'Good evening'],
    [0, 'Good evening'], [4, 'Good evening']
  ])('hour %i -> %s', (hour, expected) => {
    expect(pickGreeting(hour)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/public/teacherGreeting.test.js`
Expected: FAIL — `pickGreeting` is not exported (module.exports undefined for this file).

- [ ] **Step 3: Add `pickGreeting` and use it in the render + fix the badge**

In `public/js/teacher-dashboard.js`, add this function at module scope, near the top of the file (after the opening comment / before the class declaration):

```javascript
/**
 * Greeting word for a local hour (0-23).
 * 05:00-11:59 morning; 12:00-16:59 afternoon; 17:00-04:59 evening.
 */
function pickGreeting(hour) {
  if (hour >= 5 && hour < 12) { return 'Good morning'; }
  if (hour >= 12 && hour < 17) { return 'Good afternoon'; }
  return 'Good evening';
}
```

In the same file, in the hero render (the block that sets `teacher-name` / `teacher-school-badge`, ~615-625), replace:

```javascript
    // Mosaic teacher hero
    const nameEl  = document.getElementById('teacher-name');
    const badgeEl = document.getElementById('teacher-school-badge');
    if (nameEl && this.teacherName) {
      nameEl.textContent = this.teacherName.split(' ')[0];
    }
    if (badgeEl && this.schoolName) {
      badgeEl.textContent = this.schoolName;
    }
```

with:

```javascript
    // Mosaic teacher hero
    const greetEl = document.getElementById('teacher-greeting');
    if (greetEl) {
      greetEl.textContent = pickGreeting(new Date().getHours());
    }
    const nameEl  = document.getElementById('teacher-name');
    const badgeEl = document.getElementById('teacher-school-badge');
    if (nameEl && this.teacherName) {
      nameEl.textContent = this.teacherName.split(' ')[0];
    }
    // Show the school when present; otherwise clear the "Loading…" default so
    // teachers without a school don't see a stuck placeholder.
    if (badgeEl) {
      badgeEl.textContent = this.schoolName || '';
      badgeEl.hidden = !this.schoolName;
    }
```

At the very bottom of `public/js/teacher-dashboard.js` (after the `document.addEventListener('DOMContentLoaded', …)` block), add the test-only export guard:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pickGreeting };
}
```

- [ ] **Step 4: Wrap the greeting word in the HTML**

In `public/teacher-dashboard.html`, replace line 73:

```html
                    <p class="teacher-hero-greeting">Good morning, <strong id="teacher-name">Teacher</strong>.</p>
```

with:

```html
                    <p class="teacher-hero-greeting"><span id="teacher-greeting">Good morning</span>, <strong id="teacher-name">Teacher</strong>.</p>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/public/teacherGreeting.test.js`
Expected: PASS (11 cases).

- [ ] **Step 6: Commit**

```bash
git add public/teacher-dashboard.html public/js/teacher-dashboard.js tests/unit/public/teacherGreeting.test.js
git commit -m "feat(teacher): time-aware greeting + fix school badge stuck on Loading"
```

---

### Task 6: Full suite + lint

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures (new tests added: 2 backend + 3 helper + 11 greeting cases).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors (pre-existing warnings only).

- [ ] **Step 3: Commit any fixups (if needed)**

```bash
git add -A
git commit -m "chore: lint/test fixups for school-in-account-settings"
```

---

## Manual verification (post-deploy, DB-backed login)

1. **Teacher:** header greeting matches the time of day (morning/afternoon/evening); the school badge shows the school. Account Settings → Profile Information shows a read-only "School" row.
2. **Student:** Account Settings shows the read-only "School" row.
3. **School-admin:** admin dashboard account tab shows the read-only "My School" box.
4. **Bidder / site-admin (no school):** no School row appears anywhere.
5. **Read-only:** the School value cannot be edited and is not sent when saving profile changes.

## Self-review

- **Spec coverage:** backend `schoolName` (Task 1) ✓; Account Settings read-only row students+teachers (Task 3) ✓; admin dashboard row (Task 4) ✓; hide-when-null (Task 2 helper, used by 3/4) ✓; teacher badge polish + time-aware greeting (Task 5) ✓; tests for backend + greeting + row show/hide (Tasks 1,2,5) ✓; access token untouched ✓.
- **Placeholder scan:** every code step contains real code; manual-verification steps are explicit (frontend dashboard classes aren't unit-loaded elsewhere, so the row wiring is verified in-browser while the pure logic — schoolName lookup, applySchoolRow, pickGreeting — carries automated tests).
- **Name consistency:** `applySchoolRow(rowEl, valueEl, schoolName)`, `pickGreeting(hour)`, ids `profile-school-row`/`profile-school`, `admin-school-row`/`admin-school`, `teacher-greeting` used identically across tasks.

## Out of scope

- Editing/switching schools; school chips in the student/admin headers; any other profile field.
