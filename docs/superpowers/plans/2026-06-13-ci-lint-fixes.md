# CI + Lint Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all GitHub Actions annotation errors and ESLint warnings that represent security weaknesses, functional risk, or tech debt — achieving zero `npm run lint` errors and unbroken `npm test` (705 tests).

**Architecture:** Seven independent fix tasks applied sequentially. Tasks 1–2 touch infrastructure/config files only. Tasks 3–6 make targeted source-code edits. Task 7 verifies the final state. No new dependencies are introduced.

**Tech Stack:** GitHub Actions YAML, ESLint flat config (eslint.config.js), Node.js / Express, CommonJS modules

**Critical constraints (DO NOT VIOLATE):**
- DB stores DECIMAL(10,2) **dollars**. Never divide bid amounts by 100.
- `authRoutes.js` and `userRoutes.js` throw at startup if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are missing — no fallback added.
- Do not modify tests. Do not add or remove npm packages.

---

### Task 1: Fix `.github/workflows/deploy.yml`

**Files:**
- Modify: `.github/workflows/deploy.yml`

Two changes needed:

**Change A — Node.js 20 deprecation warning:** Actions built on Node 20 runtime will be forced to Node 24 on 2026-06-16. Adding `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` opts in early and silences the deprecation annotation.

**Change B — Grype SARIF upload guard:** `anchore/scan-action` has a 13-week-old bundled Grype vulnerability DB (max allowed: 5 days). Grype exits with error → produces empty `results.sarif` → CodeQL upload fails with "Invalid SARIF / Unexpected end of JSON input". The upload condition `if: steps.grype.outputs.sarif != ''` is **always true** regardless of scan success; the correct guard is `if: steps.grype.outcome == 'success'`.

- [ ] **Step 1: Add FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 to the `build` job**

Open `.github/workflows/deploy.yml`. The `build` job currently has no `env:` block at the job level. Add one immediately after `timeout-minutes: 30` and before `outputs:`:

```yaml
jobs:
  build:
    name: Build Docker Image
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'

    outputs:
```

- [ ] **Step 2: Add FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 to the `scan` job**

The `scan` job currently starts with:
```yaml
  scan:
    name: Scan Docker Image
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: build
    if: github.event_name != 'pull_request'
```

Add `env:` after `timeout-minutes: 20`:
```yaml
  scan:
    name: Scan Docker Image
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: build
    if: github.event_name != 'pull_request'
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'
```

- [ ] **Step 3: Fix the Grype SARIF upload condition**

Find this step (currently at line ~123):
```yaml
      - name: Upload Grype results
        uses: github/codeql-action/upload-sarif@8aad20d150bbac5944a9f9d289da16a4b0d87c1e # v4
        if: steps.grype.outputs.sarif != ''
        with:
          sarif_file: ${{ steps.grype.outputs.sarif }}
```

Change the `if:` condition:
```yaml
      - name: Upload Grype results
        uses: github/codeql-action/upload-sarif@8aad20d150bbac5944a9f9d289da16a4b0d87c1e # v4
        if: steps.grype.outcome == 'success'
        with:
          sarif_file: ${{ steps.grype.outputs.sarif }}
```

- [ ] **Step 4: Verify YAML syntax**

Run:
```powershell
Get-Content .github/workflows/deploy.yml | Select-String "FORCE_JAVASCRIPT"
Get-Content .github/workflows/deploy.yml | Select-String "grype.outcome"
```

Expected output: two matches, one each.

- [ ] **Step 5: Commit**

```powershell
git add .github/workflows/deploy.yml
git commit -m "ci: opt into Node24 actions runtime, guard Grype SARIF upload on scan success"
```

---

### Task 2: Fix `eslint.config.js`

**Files:**
- Modify: `eslint.config.js`

Three gaps in the current ESLint flat config:

**Gap A — `db/` and `scripts/` files have no config block.** `eslint .` lints ALL JS files including `db/migrations.js`, `db/seeds/seed-artwork.js`, and `scripts/import-nces-schools.js`. These use Node.js CommonJS globals (`require`, `process`, `__dirname`, `module`, `console`) but no config block specifies those globals → false `no-undef` errors.

**Gap B — Test files missing browser globals.** Tests using `@jest-environment jsdom` access `document`, `window`, etc. at runtime. The test config has `globals.node` and `globals.jest` but not `globals.browser` → false `document is not defined` errors in jsdom tests.

**Gap C — `artwork-carousel.js` flagged as unused.** `class ArtworkCarousel` is declared but has no `module.exports`. ESLint cannot see cross-file HTML usage. Fix: add a dedicated config block with `no-unused-vars: 'off'` for this file.

- [ ] **Step 1: Read the current eslint.config.js**

Read `eslint.config.js` lines 1–206 to confirm the exact structure before editing.

- [ ] **Step 2: Add `db/` and `scripts/` config block**

The current file ends the array with the test-files block, then closes `];`. Insert a new config object **before** the closing `];`, after the test-files block (after line ~204):

```js
  // ── db/ and scripts/ (Node.js CommonJS, run directly with node) ─────────────
  {
    files: ['db/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'off'
    }
  },

  // ── artwork-carousel.js: class exposed as browser global via <script> tag ───
  {
    files: ['public/js/artwork-carousel.js'],
    rules: {
      'no-unused-vars': 'off'
    }
  }
```

- [ ] **Step 3: Add `globals.browser` to the test-files block**

Find the test-files block (currently around lines 185–204):
```js
  // ── Test files ────────────────────────────────────────────────────────────
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
```

Change `globals` to:
```js
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser
      }
```

- [ ] **Step 4: Verify the config parses**

Run:
```powershell
npx eslint --print-config db/migrations.js | Select-String "no-undef" | Select-Object -First 3
```

Expected: the config is printed without errors, showing `no-undef` rule present.

- [ ] **Step 5: Commit**

```powershell
git add eslint.config.js
git commit -m "lint: add ESLint globals for db/, scripts/, jsdom tests, and artwork-carousel"
```

---

### Task 3: Auto-fix curly and style rules

**Files:**
- Auto-modified: `src/controllers/userController.js` (lines ~113, ~794), `src/controllers/notificationController.js` (line ~113), and any other files with auto-fixable violations.

The `curly: ['error', 'all']` rule requires braces around ALL `if` bodies, even single-line ones. ESLint's `--fix` flag handles this automatically. Other auto-fixable rules (spacing, quotes, semicolons) are also cleaned up here.

- [ ] **Step 1: Run lint:fix**

```powershell
npm run lint:fix
```

Expected: ESLint auto-fixes curly braces and style violations. Command exits without error (warnings OK).

- [ ] **Step 2: Check what changed**

```powershell
git diff --stat
```

Inspect changed files. Confirm no logic was altered — only brace/spacing additions.

- [ ] **Step 3: Run tests to confirm nothing broke**

```powershell
npm test -- --testTimeout=30000 2>&1 | Select-String -Pattern "Tests:|Test Suites:|passed|failed" | Select-Object -Last 5
```

Expected: all tests pass (approximately 705 passing, 0 failing).

- [ ] **Step 4: Commit**

```powershell
git add -u
git commit -m "lint: auto-fix curly braces and formatting violations"
```

---

### Task 4: Fix `no-shadow` violations

**Files:**
- Modify: `public/js/auctions-page.js`
- Modify: `public/js/auth-manager.js`
- Modify: `public/js/teacher-dashboard.js`
- Modify: `src/services/notificationService.js`

`no-shadow` catches inner-scope variable declarations that silently shadow an outer-scope variable with the same name, causing the wrong value to be read.

- [ ] **Step 1: Fix `auctions-page.js` — remove shadowing `overlay` redeclaration**

File: `public/js/auctions-page.js`

Context — outer scope (line ~112) declares:
```js
const overlay = document.getElementById('card-preview-overlay');
```

Inside the keydown listener (line ~122–125), the same variable is unnecessarily redeclared:
```js
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('card-preview-overlay');
  if (e.key === 'Escape' && overlay && !overlay.hidden) { this.closeCardPreview(); }
});
```

The outer `overlay` is already accessible via closure. Remove the inner redeclaration:
```js
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay && !overlay.hidden) { this.closeCardPreview(); }
});
```

- [ ] **Step 2: Fix `auth-manager.js` — rename shadowing rest spread**

File: `public/js/auth-manager.js`

The `register` method (line ~22) has parameter `userData`. Inside the method body (line ~35), a destructuring rest spread is also named `userData`, shadowing the parameter:

Current:
```js
async register(userData) {
  try {
    const response = await apiClient.register({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password,
      school_id: userData.schoolId,
      phone: userData.phone
    });

    if (response.success && response.data) {
      const { accessToken, refreshToken, ...userData } = response.data;
      this.setToken(accessToken);
      if (refreshToken) { this.setRefreshToken(refreshToken); }
      this.setUser(userData);
      return { success: true, user: userData };
    }
```

Change the rest spread name from `userData` to `userInfo` (update ALL three references to the rest spread in that scope):
```js
      const { accessToken, refreshToken, ...userInfo } = response.data;
      this.setToken(accessToken);
      if (refreshToken) { this.setRefreshToken(refreshToken); }
      this.setUser(userInfo);
      return { success: true, user: userInfo };
```

- [ ] **Step 3: Fix `teacher-dashboard.js` — rename shadowing forEach parameter**

File: `public/js/teacher-dashboard.js`

`handleSectionChange` method (line ~882) declares:
```js
const section = e.target.dataset.section;
```

Then on line ~888, the `forEach` callback parameter is also named `section`, shadowing it:
```js
document.querySelectorAll('.dashboard-section').forEach(section => {
  section.style.display = 'none';
  section.classList.remove('active');
});
```

Rename the forEach parameter to `sectionEl`:
```js
document.querySelectorAll('.dashboard-section').forEach(sectionEl => {
  sectionEl.style.display = 'none';
  sectionEl.classList.remove('active');
});
```

- [ ] **Step 4: Fix `notificationService.js` — rename shadowing inner `result`**

File: `src/services/notificationService.js`

The `deliver` method (line ~570) declares at the top:
```js
const result = await this.db.query(
  'SELECT * FROM notifications WHERE id = $1',
  [notificationId]
);
```

Then inside a nested `try` block (line ~592), another `result` is declared:
```js
try {
  let result;

  if (notification.channel === 'email') {
    result = await this.sendEmail(notification);
  } else if (notification.channel === 'sms') {
    result = await this.sendSMS(notification);
  } else if (notification.channel === 'in-app') {
    result = { messageId: 'in-app', status: 'sent' };
  }
```

Rename the inner `result` to `deliveryResult` everywhere in that inner try/catch scope:
- `let result;` → `let deliveryResult;`
- `result = await this.sendEmail(notification)` → `deliveryResult = await this.sendEmail(notification)`
- `result = await this.sendSMS(notification)` → `deliveryResult = await this.sendSMS(notification)`
- `result = { messageId: 'in-app', status: 'sent' }` → `deliveryResult = { messageId: 'in-app', status: 'sent' }`
- Any subsequent use of inner `result` (e.g., `result.messageId`, `result.status`) → `deliveryResult.messageId`, `deliveryResult.status`

Read the full inner try block before editing to find all occurrences.

- [ ] **Step 5: Verify no new lint errors**

```powershell
npx eslint public/js/auctions-page.js public/js/auth-manager.js public/js/teacher-dashboard.js src/services/notificationService.js 2>&1 | Select-String "no-shadow|error"
```

Expected: no `no-shadow` errors in these files.

- [ ] **Step 6: Run tests**

```powershell
npm test -- --testTimeout=30000 2>&1 | Select-String -Pattern "Tests:|passed|failed" | Select-Object -Last 4
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add public/js/auctions-page.js public/js/auth-manager.js public/js/teacher-dashboard.js src/services/notificationService.js
git commit -m "lint: fix no-shadow violations — rename inner-scope variables that shadow outer scope"
```

---

### Task 5: Fix `consistent-return` in controllers

**Files:**
- Modify: `src/controllers/userController.js` (functions at lines 26, 243, 403, 458, 546, 644)
- Modify: `src/controllers/notificationController.js` (functions at lines 21, 57, 80, 100, 144, 165, 200)
- Modify: `src/controllers/paymentController.js` (functions at lines 22, 97, 157)

**Root cause:** Express handler methods use `return res.status(4xx).json({...})` for early exits (returning the Response object) but then call `next(error)` in catch blocks **without** `return`, causing the function to fall off the end with an implicit `undefined` return. ESLint `consistent-return` requires that if ANY `return` statement specifies a value, ALL `return` statements in the function must specify a value.

**Fix pattern** (uniform — apply to every flagged function):
```js
// BEFORE
} catch (error) {
  next(error);
}

// AFTER
} catch (error) {
  return next(error);
}
```

In some handlers the catch block itself has mixed returns (e.g., one branch `return res.status(400).json(...)` for known errors, and a bare `next(error)` for unknown errors). In those cases, also change the bare `next(error)` to `return next(error)`.

In handlers where the success path (end of try block) calls `res.json()` or `res.status().json()` **without** `return` while other branches have `return res.json()`, add `return` to the success-path call as well.

**Safety note:** Adding `return` before `next(error)` or `next()` is completely safe. Express ignores the return value of middleware/handler functions. `return next(error)` is idiomatic Express and prevents any code after the catch from accidentally running.

- [ ] **Step 1: Read each flagged function**

For each of the three controller files, read the functions at the flagged line numbers to identify exactly which calls need `return` added. The functions are large — read from the flagged line number through the closing `}` of the function.

Files and flagged function start lines:
- `src/controllers/userController.js` → 26, 243, 403, 458, 546, 644
- `src/controllers/notificationController.js` → 21, 57, 80, 100, 144, 165, 200
- `src/controllers/paymentController.js` → 22, 97, 157

- [ ] **Step 2: Apply fixes to `notificationController.js`**

The `notificationController.js` functions all follow this pattern — the try block has explicit `return res.json()` but the catch uses `next(error)` without return. Apply `return next(error)` to every catch block in the file (lines ~49, ~72, and all subsequent catch blocks).

- [ ] **Step 3: Apply fixes to `paymentController.js`**

Read and apply the same pattern. Also check whether any success path `res.json()` at the END of a try block is missing `return` (while earlier branches use `return res.status().json()`).

- [ ] **Step 4: Apply fixes to `userController.js`**

`userController.js` is large (~800+ lines). Read each flagged function individually. The `register` method (line 26) has many early-exit `return res.status().json()` calls followed by a catch with `next(error)` — add `return` to the catch. Repeat for all 6 flagged functions.

- [ ] **Step 5: Run lint on controllers only**

```powershell
npx eslint src/controllers/ 2>&1 | Select-String "consistent-return|error"
```

Expected: no `consistent-return` warnings in controllers.

- [ ] **Step 6: Run tests**

```powershell
npm test -- --testTimeout=30000 2>&1 | Select-String -Pattern "Tests:|passed|failed" | Select-Object -Last 4
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/controllers/userController.js src/controllers/notificationController.js src/controllers/paymentController.js
git commit -m "lint: fix consistent-return in controllers — add return before next(error) in catch blocks"
```

---

### Task 6: Fix `consistent-return` in middleware and routes

**Files:**
- Modify: `src/middleware/authMiddleware.js` (functions at lines 14, 117, 161, 179)
- Modify: `src/middleware/securityMiddleware.js` (functions at lines 23, 229, 357)
- Modify: `src/routes/authRoutes.js` (functions at lines 223, 298, 339, 376, 428, 532, 572, 597, 621, 691, 716)
- Modify: `src/routes/biddingRoutes.js` (functions at lines 16, 68)

Same root cause and fix pattern as Task 5. Specific cases noted below.

**`authMiddleware.js` specifics:**

- `verifyToken` (line 14): try block has multiple early `return res.status(401).json()`, then calls `next()` on line 92 without return. Fix: `return next()`.
- `optionalVerifyToken` (line 117): has `return next()` at top for missing token, but final `next()` call (line 153) lacks return. Fix: `return next()`.
- `requireAdmin2fa` (line 161): has `return res.status(403).json()` in the if-branch, but `next()` (line 170) at the end lacks return. Fix: `return next()`.
- `verifyRole` returns an inner arrow function (line 179). Inside that arrow function: two `return res.json()` branches, then `next()` (line 194) without return. Fix: `return next()` on line 194.

**`securityMiddleware.js` specifics:**

- `sanitizeInput` (line 23): success path calls `next()` (line 49) without return; catch block uses `return res.status(400).json()`. Fix: `return next()` on line 49.
- `csrfErrorHandler` (line 229): `if (err.code !== 'EBADCSRFTOKEN') { return next(err); }` with value, then `res.status(403).json(...)` falls through. Fix: add `return` before `res.status(403).json(...)`.
- `idempotencyMiddleware` (line 357): three explicit `return` branches, final `next()` on line 386 lacks return. Fix: `return next()`.

**`authRoutes.js` specifics:**

All 11 flagged functions follow the same pattern: the catch block has one or two branches:
- Some errors: `return res.status(400).json(...)` — with value
- Unknown errors: `next(error)` — no return

Fix: `return next(error)` in the bare `next(error)` line of every catch block in the file. There are no cases in authRoutes.js where the SUCCESS path is missing `return` — all success paths already use `return res.json()`.

**`biddingRoutes.js` specifics:**

`/place` handler (line 16): two early `return res.status(400).json()`, then success path `res.status(200).json()` (no return), then catch `res.status(400).json()` (no return). Fix: add `return` to both.

`/withdraw` handler (line 68): same pattern. Read the full handler to find all missing returns.

- [ ] **Step 1: Fix `authMiddleware.js`**

Read lines 14–199 in full. Apply these exact edits:
- Line 92: `next();` → `return next();`
- Line 153: `next();` → `return next();`
- Line 170: `next();` → `return next();`
- Line 194: `next();` → `return next();`

- [ ] **Step 2: Fix `securityMiddleware.js`**

Read lines 23–57, 229–236, 357–387. Apply:
- Line 49: `next();` → `return next();`
- Line 232–235: `res.status(403).json({...})` → `return res.status(403).json({...})`
- Line 386: `next();` → `return next();`

- [ ] **Step 3: Fix `biddingRoutes.js`**

Read lines 16–100 in full. Apply `return` to `res.status(200).json()` in the success path and `res.status(400).json()` in the catch of both handlers.

- [ ] **Step 4: Fix `authRoutes.js`**

This file has 11 flagged functions. The pattern is uniform: in the catch block, find the bare `next(error)` (without `return`) and change it to `return next(error)`. Read each flagged function to confirm the exact location, then apply.

Flagged function start lines: 223, 298, 339, 376, 428, 532, 572, 597, 621, 691, 716

Read ahead 30–50 lines from each to find the catch block's bare `next(error)`.

- [ ] **Step 5: Run lint on middleware and routes**

```powershell
npx eslint src/middleware/ src/routes/ 2>&1 | Select-String "consistent-return|error"
```

Expected: no `consistent-return` warnings.

- [ ] **Step 6: Run full test suite**

```powershell
npm test -- --testTimeout=30000 2>&1 | Select-String -Pattern "Tests:|passed|failed" | Select-Object -Last 5
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/middleware/authMiddleware.js src/middleware/securityMiddleware.js src/routes/authRoutes.js src/routes/biddingRoutes.js
git commit -m "lint: fix consistent-return in middleware and routes — return next() in all handler exit paths"
```

---

### Task 7: Final verification and push

**Files:** None modified — verification only.

- [ ] **Step 1: Run full lint**

```powershell
npm run lint 2>&1 | Tee-Object -Variable lintOutput; $lintOutput | Select-String "error|warning" | Select-Object -Last 20; Write-Output "--- Exit code: $LASTEXITCODE"
```

Expected: zero `error`-level findings. Remaining `warn`-level output is acceptable. Exit code 0.

- [ ] **Step 2: Run full test suite**

```powershell
npm test -- --testTimeout=30000 2>&1 | Select-String -Pattern "Tests:|Test Suites:|passed|failed" | Select-Object -Last 5
```

Expected: ~705 tests passing, 0 failing.

- [ ] **Step 3: Push to remote**

```powershell
git push origin HEAD
```

Expected: push succeeds, GitHub Actions workflow triggered.

---

## Self-Review

**Spec coverage:**
- ✅ Node.js 20 deprecation → Task 1 (FORCE_JAVASCRIPT_ACTIONS_TO_NODE24)
- ✅ Grype stale DB cascading failure → Task 1 (outcome == 'success' guard)
- ✅ `no-undef` for db/ and scripts/ → Task 2 (node globals block)
- ✅ `document is not defined` in jsdom tests → Task 2 (browser globals in test config)
- ✅ `ArtworkCarousel` unused → Task 2 (no-unused-vars: off for file)
- ✅ `curly` violations → Task 3 (auto-fix)
- ✅ `no-shadow` (4 locations) → Task 4
- ✅ `consistent-return` controllers → Task 5
- ✅ `consistent-return` middleware + routes → Task 6
- ✅ Final zero-error verification → Task 7

**Placeholder scan:** No TBD/TODO/placeholder patterns present.

**Type consistency:** All variable rename targets are self-contained within their files.
