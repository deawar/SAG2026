# Refresh Token → httpOnly Cookie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 7-day refresh token out of `localStorage` into an `HttpOnly` cookie so JavaScript (and therefore XSS) can no longer read it, eliminating persistent account takeover.

**Architecture:** A shared server helper sets/clears a single `refresh_token` cookie (`HttpOnly`, `Secure` in prod, `SameSite=Strict`, `Path=/api/auth`, 7-day). The four session-minting endpoints set the cookie and stop returning the refresh token in the JSON body; `/refresh` reads it from the cookie only; `/logout` clears it. The frontend stops storing/reading `refresh_token` and sends `credentials: 'include'` on the auth requests. The 15-minute access token is unchanged (still `localStorage` + Bearer) — that is Phase 2.

**Tech Stack:** Node/Express, `cookie-parser` (already a dependency), `jsonwebtoken`, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-08-13-refresh-token-httponly-cookie-design.md`

## Global Constraints

- Cookie attributes (exact, verbatim): name `refresh_token`; `HttpOnly` always; `Secure` only when `process.env.NODE_ENV === 'production'`; `SameSite=Strict`; `Path=/api/auth`; `Max-Age` = 7 days (604800 seconds / `7 * 24 * 60 * 60 * 1000` ms).
- Clean-cut rollout: `/refresh` reads the token from the cookie **only** — no request-body fallback.
- The refresh token must **not** appear in any JSON response body after this change.
- The access token, `Authorization: Bearer` flow, and WebSocket auth are **unchanged**.
- No CSRF tokens in this phase (Bearer still guards all state-changing endpoints).
- Follow existing test patterns: `tests/security/*` use `require('../helpers/createTestApp')`; `tests/integration/routes/*` use `supertest` + `src/app` + `tests/helpers/mockDb` + locally-signed JWTs (`jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' })`).

**TEST-STRATEGY AMENDMENT (governs over any supertest test code below):** The
default `mockDb.query` returns `{ rows: [], rowCount: 0 }`, so login/refresh
never reach a 200 under supertest — a `Set-Cookie` assertion behind an
`if (res.status === 200)` guard would never run. Therefore the cookie behavior
for `login`, `verify2FA`, `refreshToken`, and `logout` is verified with
**direct controller unit tests** (`tests/unit/controllers/refreshTokenCookie.test.js`):
construct `new UserController(mockUserModel, mockAuthService)`, call the handler
with a fake `req` (cookies/body/headers/user) and a fake `res` that captures
`.cookie()`, `.clearCookie()`, `.status()`, and `.json()`, and assert
unconditionally. The `/2fa/force-verify` inline route handler (not a controller
method) is covered by the Task 1 helper unit test plus the manual checklist
(no brittle db-sequence mock). Use this fake-`res` throughout:

```javascript
function fakeRes() {
  const res = {
    statusCode: 200,
    cookies: [], cleared: [], body: null,
    status(c) { this.statusCode = c; return this; },
    cookie(name, val, opts) { this.cookies.push({ name, val, opts }); return this; },
    clearCookie(name, opts) { this.cleared.push({ name, opts }); return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}
```

## File Structure

- **Create** `src/utils/refreshCookie.js` — single source of truth for cookie name/attributes; exports `REFRESH_COOKIE_NAME`, `setRefreshCookie(res, token)`, `clearRefreshCookie(res)`.
- **Modify** `src/app.js` — wire `cookie-parser`.
- **Modify** `src/controllers/userController.js` — `login`, `verify2FA`, `refreshToken`, `logout`.
- **Modify** `src/routes/authRoutes.js` — `/2fa/force-verify` inline handler.
- **Modify** `public/js/auth-manager.js` — stop reading/writing `refresh_token`.
- **Modify** `public/js/auth-pages.js` — stop storing `refresh_token`; add `credentials` to login fetch.
- **Modify** `public/js/2fa-verify.js` — add `credentials` to verify-2fa fetch.
- **Modify** `public/js/api-client.js` — `credentials: 'include'` on every request; `refreshToken()` sends no body.
- **Create** `tests/unit/utils/refreshCookie.test.js` — helper unit tests.
- **Create** `tests/integration/routes/refreshTokenCookieIntegrationTest.spec.js` — endpoint integration tests.
- **Create** `tests/unit/services/passwordResetRevokesSessions.test.js` — regression lock.

---

### Task 1: Refresh-cookie helper

**Files:**
- Create: `src/utils/refreshCookie.js`
- Test: `tests/unit/utils/refreshCookie.test.js`

**Interfaces:**
- Produces: `REFRESH_COOKIE_NAME` (string `'refresh_token'`); `setRefreshCookie(res, token)` → calls `res.cookie(name, token, opts)`; `clearRefreshCookie(res)` → calls `res.clearCookie(name, opts)` with the **same** `path`/`sameSite`/`secure`/`httpOnly` so the browser deletes it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/utils/refreshCookie.test.js`:

```javascript
const { REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie } = require('../../../src/utils/refreshCookie');

function fakeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe('refreshCookie helper', () => {
  const OLD_ENV = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = OLD_ENV; });

  test('name is refresh_token', () => {
    expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
  });

  test('setRefreshCookie sets httpOnly/strict/path/maxAge, secure in production', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    setRefreshCookie(res, 'the-token');
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'the-token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }));
  });

  test('setRefreshCookie omits secure outside production', () => {
    process.env.NODE_ENV = 'test';
    const res = fakeRes();
    setRefreshCookie(res, 'the-token');
    expect(res.cookie.mock.calls[0][2].secure).toBe(false);
  });

  test('clearRefreshCookie clears with matching path/sameSite/httpOnly', () => {
    const res = fakeRes();
    clearRefreshCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/auth'
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/utils/refreshCookie.test.js`
Expected: FAIL — `Cannot find module '../../../src/utils/refreshCookie'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/refreshCookie.js`:

```javascript
/**
 * Single source of truth for the refresh-token cookie.
 * HttpOnly so JS/XSS cannot read it; SameSite=Strict so it is never sent
 * cross-site; Path=/api/auth so it rides along only on auth requests.
 * Secure is enabled only in production (so http://localhost works in dev/test).
 */
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth'
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieOptions(), maxAge: REFRESH_MAX_AGE_MS });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

module.exports = { REFRESH_COOKIE_NAME, REFRESH_MAX_AGE_MS, setRefreshCookie, clearRefreshCookie };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/utils/refreshCookie.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/refreshCookie.js tests/unit/utils/refreshCookie.test.js
git commit -m "feat(auth): add refresh-token cookie helper (httpOnly/strict/path-scoped)"
```

---

### Task 2: Wire cookie-parser + `/refresh` reads the cookie only

**Files:**
- Modify: `src/app.js` (after body parsing, ~line 112)
- Modify: `src/controllers/userController.js:470-479` (`refreshToken`)
- Test: `tests/unit/controllers/refreshTokenCookie.test.js`

**Interfaces:**
- Consumes: `REFRESH_COOKIE_NAME`, `setRefreshCookie` from Task 1.
- Produces: `refreshToken(req, res, next)` reads `req.cookies.refresh_token`, returns `401` when absent, otherwise sets a rotated `refresh_token` cookie (via `res.cookie`) and returns `res.json({ data: { accessToken, expiresIn } })` with **no** `refreshToken` in the body.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/controllers/refreshTokenCookie.test.js` (uses the `fakeRes` from the amendment):

```javascript
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const UserController = require('../../../src/controllers/userController');

function fakeRes() {
  const res = {
    statusCode: 200,
    cookies: [], cleared: [], body: null,
    status(c) { this.statusCode = c; return this; },
    cookie(name, val, opts) { this.cookies.push({ name, val, opts }); return this; },
    clearCookie(name, opts) { this.cleared.push({ name, opts }); return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}

// Minimal authService + userModel doubles for the refresh happy path.
function makeController() {
  const authService = {
    jwtService: {
      verifyRefreshToken: jest.fn(() => ({ sub: 'user-1', jti: 'old-jti', exp: Math.floor(Date.now() / 1000) + 3600 })),
      generateAccessToken: jest.fn(() => ({ token: 'new-access', expiresIn: '15m' })),
      generateRefreshToken: jest.fn(() => ({ token: 'new-refresh', jti: 'new-jti' }))
    },
    sessionService: {
      checkSession: jest.fn().mockResolvedValue(null),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
      revokeSession: jest.fn().mockResolvedValue(undefined)
    }
  };
  const userModel = { getById: jest.fn().mockResolvedValue({ id: 'user-1', email: 'u@e.com', role: 'STUDENT', school_id: null, two_fa_enabled: false }) };
  const ctrl = new UserController(userModel, authService);
  ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
  return ctrl;
}

describe('UserController.refreshToken — cookie-based', () => {
  test('401 when no refresh cookie is present', async () => {
    const ctrl = makeController();
    const res = fakeRes();
    await ctrl.refreshToken({ cookies: {}, body: {} }, res, jest.fn());
    expect(res.statusCode).toBe(401);
  });

  test('reads the cookie, sets a rotated cookie, and returns no refresh token in the body', async () => {
    const ctrl = makeController();
    const res = fakeRes();
    await ctrl.refreshToken({ cookies: { refresh_token: 'the-cookie-token' }, body: {} }, res, jest.fn());

    expect(ctrl.authService.jwtService.verifyRefreshToken).toHaveBeenCalledWith('the-cookie-token');
    expect(res.body.data.accessToken).toBe('new-access');
    expect(res.body.data.refreshToken).toBeUndefined();
    const set = res.cookies.find(c => c.name === 'refresh_token');
    expect(set).toBeTruthy();
    expect(set.val).toBe('new-refresh');
    expect(set.opts).toEqual(expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/controllers/refreshTokenCookie.test.js`
Expected: FAIL — current `refreshToken` reads `req.body.refreshToken` (so the no-cookie case returns 400, not 401), and on success sets no cookie and returns `data.refreshToken` in the body.

- [ ] **Step 3a: Wire cookie-parser in `src/app.js`**

Add the require near the other top-level requires (after line 16 `const path = ...`):

```javascript
const cookieParser = require('cookie-parser');
```

Add the middleware immediately after `app.use(express.urlencoded(...))` (currently line 112):

```javascript
  app.use(cookieParser());
```

- [ ] **Step 3b: Update `refreshToken` to read from the cookie**

In `src/controllers/userController.js`, add the helper import at the top of the file (near the other requires):

```javascript
const { setRefreshCookie, clearRefreshCookie } = require('../utils/refreshCookie');
```

Replace the token-extraction block at `refreshToken` (lines 471-479):

```javascript
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token required'
        });
      }
```

with (clean-cut: cookie only):

```javascript
      const refreshToken = req.cookies && req.cookies.refresh_token;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token required'
        });
      }
```

Replace the response block (lines 544-553) so the rotated token goes to the cookie, not the body:

```javascript
      // 6. Return both new tokens
      return res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: accessTokenResult.token,
          refreshToken: newRefreshTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
```

with:

```javascript
      // 6. Rotated refresh token → cookie; only the access token is returned.
      setRefreshCookie(res, newRefreshTokenResult.token);
      return res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: accessTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/controllers/refreshTokenCookie.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/controllers/userController.js tests/unit/controllers/refreshTokenCookie.test.js
git commit -m "feat(auth): /refresh reads refresh token from httpOnly cookie (rotates via cookie)"
```

---

### Task 3: Session-minting endpoints set the cookie and drop the refresh token from the body

**Files:**
- Modify: `src/controllers/userController.js` — `login` (386-400), `verify2FA` (659-673)
- Modify: `src/routes/authRoutes.js` — `/2fa/force-verify` (502-516)
- Test: append to `tests/unit/controllers/refreshTokenCookie.test.js`

**Interfaces:**
- Consumes: `setRefreshCookie` (imported in Task 2 for `userController`; import separately in `authRoutes`).
- Produces: `login` / `verify2FA` success responses set a `refresh_token` cookie and omit `data.refreshToken`. `/2fa/force-verify` also calls `setRefreshCookie` (verified by the Task 1 helper test + manual checklist item 8 — not unit-tested here, as it is an inline route handler needing a full db-sequence mock).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/controllers/refreshTokenCookie.test.js`. Build a controller whose `login` reaches the token-minting branch (active, email-verified, non-2FA user):

```javascript
describe('UserController.login — sets cookie, omits refresh token from body', () => {
  function makeLoginController() {
    const authService = {
      jwtService: {
        generateAccessToken: jest.fn(() => ({ token: 'access-1', expiresIn: '15m' })),
        generateRefreshToken: jest.fn(() => ({ token: 'refresh-1', jti: 'jti-1' }))
      }
    };
    const userModel = {
      getByEmail: jest.fn().mockResolvedValue({
        id: 'user-1', email: 'u@e.com', password_hash: 'hash', role: 'STUDENT',
        school_id: null, first_name: 'U', last_name: 'Ser',
        account_status: 'ACTIVE', email_verified_at: new Date(),
        requires_parental_consent: false, parental_consent_status: 'granted',
        two_fa_enabled: false
      }),
      checkPassword: jest.fn().mockResolvedValue(true),
      updateLastLogin: jest.fn().mockResolvedValue(undefined)
    };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
    return ctrl;
  }

  test('login sets refresh_token cookie and body has no refreshToken', async () => {
    const ctrl = makeLoginController();
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('access-1');
    expect(res.body.data.refreshToken).toBeUndefined();
    const set = res.cookies.find(c => c.name === 'refresh_token');
    expect(set.val).toBe('refresh-1');
    expect(set.opts).toEqual(expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' }));
  });
});

describe('UserController.verify2FA — sets cookie, omits refresh token from body', () => {
  test('verify2FA sets refresh_token cookie and body has no refreshToken', async () => {
    const authService = {
      jwtService: {
        verifyAccessToken: jest.fn(() => ({ sub: 'user-1', purpose: '2fa_challenge' })),
        generateAccessToken: jest.fn(() => ({ token: 'access-2', expiresIn: '15m' })),
        generateRefreshToken: jest.fn(() => ({ token: 'refresh-2', jti: 'jti-2' }))
      },
      twoFactorService: { verifyToken: jest.fn(() => true) }
    };
    const userModel = {
      getById: jest.fn().mockResolvedValue({
        id: 'user-1', email: 'u@e.com', role: 'STUDENT', school_id: null,
        first_name: 'U', last_name: 'Ser', two_fa_enabled: true, two_fa_secret: 'SECRET'
      }),
      updateLastLogin: jest.fn().mockResolvedValue(undefined)
    };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
    const res = fakeRes();
    await ctrl.verify2FA({ body: { code: '123456' }, headers: { authorization: 'Bearer temp' } }, res, jest.fn());

    expect(res.body.data.accessToken).toBe('access-2');
    expect(res.body.data.refreshToken).toBeUndefined();
    const set = res.cookies.find(c => c.name === 'refresh_token');
    expect(set.val).toBe('refresh-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/controllers/refreshTokenCookie.test.js -t "sets cookie"`
Expected: FAIL — `login`/`verify2FA` currently return `data.refreshToken` and set no cookie.

- [ ] **Step 3a: `login` — `src/controllers/userController.js`**

Replace the success response (lines 385-400):

```javascript
      // 9. Return tokens (NO sensitive data)
      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          userId: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null,
          accessToken: accessTokenResult.token,
          refreshToken: refreshTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
```

with:

```javascript
      // 9. Refresh token → httpOnly cookie; only the access token is returned.
      setRefreshCookie(res, refreshTokenResult.token);
      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          userId: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null,
          accessToken: accessTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
```

- [ ] **Step 3b: `verify2FA` — `src/controllers/userController.js`**

Replace the success response (lines 658-673):

```javascript
      // 5. Return tokens with user info for the frontend
      return res.json({
        success: true,
        message: '2FA verification successful',
        data: {
          accessToken: accessTokenResult.token,
          refreshToken: refreshTokenResult.token,
          expiresIn: accessTokenResult.expiresIn,
          userId: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null
        }
      });
```

with:

```javascript
      // 5. Refresh token → httpOnly cookie; return access token + user info.
      setRefreshCookie(res, refreshTokenResult.token);
      return res.json({
        success: true,
        message: '2FA verification successful',
        data: {
          accessToken: accessTokenResult.token,
          expiresIn: accessTokenResult.expiresIn,
          userId: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null
        }
      });
```

- [ ] **Step 3c: `/2fa/force-verify` — `src/routes/authRoutes.js`**

Add the helper import near the top of `authRoutes.js` (with the other requires):

```javascript
const { setRefreshCookie } = require('../utils/refreshCookie');
```

Replace the success response (lines 502-516):

```javascript
      return res.json({
        success: true,
        message: '2FA setup complete. You are now logged in.',
        data: {
          userId: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null,
          accessToken: accessTokenResult.token,
          refreshToken: refreshTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
```

with:

```javascript
      setRefreshCookie(res, refreshTokenResult.token);
      return res.json({
        success: true,
        message: '2FA setup complete. You are now logged in.',
        data: {
          userId: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          role: user.role,
          schoolId: user.school_id || null,
          accessToken: accessTokenResult.token,
          expiresIn: accessTokenResult.expiresIn
        }
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/controllers/refreshTokenCookie.test.js`
Expected: PASS. Also grep to confirm no `refreshToken:` remains in any response body:
Run: `grep -n "refreshToken: .*Result.token" src/controllers/userController.js src/routes/authRoutes.js`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/userController.js src/routes/authRoutes.js tests/unit/controllers/refreshTokenCookie.test.js
git commit -m "feat(auth): login/verify-2fa/force-verify set refresh cookie, omit token from body"
```

---

### Task 4: `/logout` clears the cookie

**Files:**
- Modify: `src/controllers/userController.js` — `logout` (415-460)
- Test: append to `tests/unit/controllers/refreshTokenCookie.test.js`

**Interfaces:**
- Consumes: `clearRefreshCookie` (imported in Task 2).
- Produces: `logout(req, res, next)` calls `res.clearCookie('refresh_token', { path: '/api/auth', ... })` on success.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/controllers/refreshTokenCookie.test.js`:

```javascript
describe('UserController.logout clears the refresh cookie', () => {
  test('logout clears refresh_token with the matching path', async () => {
    const ctrl = new UserController({}, { jwtService: {} });
    const res = fakeRes();
    // req.user carries the access token's jti/exp (set by verifyToken middleware).
    await ctrl.logout({ user: { id: 'user-1', jti: 'access-jti', exp: Math.floor(Date.now() / 1000) + 900 }, body: {} }, res, jest.fn());

    expect(res.body.success).toBe(true);
    const cleared = res.cleared.find(c => c.name === 'refresh_token');
    expect(cleared).toBeTruthy();
    expect(cleared.opts).toEqual(expect.objectContaining({ path: '/api/auth' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/controllers/refreshTokenCookie.test.js -t "logout clears"`
Expected: FAIL — `logout` does not clear any cookie today.

- [ ] **Step 3: Clear the cookie in `logout`**

In `src/controllers/userController.js`, in `logout`, replace the success response (lines 453-456):

```javascript
      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
```

with:

```javascript
      clearRefreshCookie(res);
      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
```

(The `const { refreshToken } = req.body;` line at 418 and its revoke block still work — logout can keep accepting a body token for its server-side revoke; it simply no longer depends on it. Leave that block unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/controllers/refreshTokenCookie.test.js -t "logout clears"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/userController.js tests/unit/controllers/refreshTokenCookie.test.js
git commit -m "feat(auth): clear refresh cookie on logout"
```

---

### Task 5: Regression lock — password reset revokes all sessions

**Files:**
- Test: `tests/unit/services/passwordResetRevokesSessions.test.js` (new; no production code changes)

**Interfaces:**
- Consumes: `AuthenticationService.completePasswordReset(resetToken, newPassword)` and `verifyPasswordResetCode(email, code, newPassword)` — both already call `this.sessionService.revokeAllSessions(userId)`.
- Produces: a failing test if a future change removes session revocation from either reset path.

- [ ] **Step 1: Write the test**

Create `tests/unit/services/passwordResetRevokesSessions.test.js`:

```javascript
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const AuthenticationService = require('../../../src/services/authenticationService');

function makeService(overrides = {}) {
  const revokeAllSessions = jest.fn().mockResolvedValue(undefined);
  const db = {
    query: jest.fn()
      // completePasswordReset: SELECT token → UPDATE password → UPDATE used_at
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
      .mockResolvedValue({ rows: [], rowCount: 1 })
  };
  const svc = new AuthenticationService({
    db,
    sessionService: { revokeAllSessions },
    userModel: { getByEmail: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    ...overrides
  });
  svc._recordAuditLog = jest.fn().mockResolvedValue(undefined);
  return { svc, revokeAllSessions };
}

describe('password reset revokes all sessions (regression lock)', () => {
  test('completePasswordReset calls revokeAllSessions', async () => {
    const { svc, revokeAllSessions } = makeService();
    await svc.completePasswordReset('raw-reset-token', 'NewValidPass123!@#');
    expect(revokeAllSessions).toHaveBeenCalledWith('user-1');
  });
});
```

> **Note for implementer:** `AuthenticationService`'s constructor signature and how it stores `db`/`sessionService`/`userModel` are in `src/services/authenticationService.js` (constructor near the top). Match the real constructor's property names when building `makeService`; adjust the mocked `db.query` sequence to the exact queries in `completePasswordReset` (lines ~944-983). The single assertion — `revokeAllSessions` was called with the user id — is the durable regression lock.

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest tests/unit/services/passwordResetRevokesSessions.test.js`
Expected: PASS (the production code already revokes sessions). If it fails on mock plumbing, fix the mock (not the production code) until the assertion runs and passes.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/services/passwordResetRevokesSessions.test.js
git commit -m "test(auth): lock in that password reset revokes all sessions"
```

---

### Task 6: Frontend — stop storing the refresh token; send credentials on auth requests

**Files:**
- Modify: `public/js/auth-manager.js:300-307` (`setRefreshToken`), `:10` (constructor read)
- Modify: `public/js/auth-pages.js:81` (login fetch), `:121` (remove localStorage set)
- Modify: `public/js/2fa-verify.js:78` (verify-2fa fetch)
- Modify: `public/js/api-client.js:32-40` (request config), `:187-190` (`refreshToken`)

**Interfaces:**
- Consumes: the backend endpoints from Tasks 2-4 (cookie set by server; access token still returned in body).
- Produces: no `refresh_token` key is ever written to `localStorage`; `POST /api/auth/refresh` is sent with `credentials: 'include'` and no body; login and verify-2fa fetches include `credentials: 'include'`.

- [ ] **Step 1: `auth-manager.js` — neutralize `setRefreshToken` and the constructor read**

Replace `setRefreshToken` (lines 300-307):

```javascript
  setRefreshToken(token) {
    this.refreshToken = token;
    if (token) {
      localStorage.setItem('refresh_token', token);
    } else {
      localStorage.removeItem('refresh_token');
    }
  }
```

with (in-memory only; never touches localStorage — the ~8 existing callers become harmless):

```javascript
  setRefreshToken(token) {
    // The refresh token now lives only in an httpOnly cookie set by the server.
    // Keep it in memory for backward compat; never persist to localStorage.
    this.refreshToken = token || null;
  }
```

Replace the constructor read (line 10):

```javascript
    this.refreshToken = localStorage.getItem('refresh_token');
```

with:

```javascript
    this.refreshToken = null; // refresh token is an httpOnly cookie, not JS-readable
```

Leave `clearAuth`'s `localStorage.removeItem('refresh_token')` (line ~456) in place — it purges any stale pre-migration value on logout.

- [ ] **Step 2: `auth-pages.js` — remove the localStorage set, add credentials to login**

Remove line 121 entirely:

```javascript
          if (data.data.refreshToken) {localStorage.setItem('refresh_token', data.data.refreshToken);}
```

In the login fetch (line 81), add `credentials: 'include'`:

```javascript
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe })
      });
```

- [ ] **Step 3: `2fa-verify.js` — add credentials to the verify-2fa fetch**

In the fetch at line 78, add `credentials: 'include'`:

```javascript
      const response = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        credentials: 'include',
        // ...existing headers/body unchanged
```

Also remove the now-dead `authManager.setRefreshToken(data.data.refreshToken)` at line 95 (the body no longer carries it — the call is harmless but misleading). Delete that line.

- [ ] **Step 4: `api-client.js` — credentials on every request; refresh sends no body**

In `request()`, add `credentials: 'include'` to the `config` object (lines 32-36):

```javascript
    const config = {
      method,
      headers,
      credentials: 'include',
      timeout: this.timeout
    };
```

Replace `refreshToken()` (lines 187-190):

```javascript
  refreshToken() {
    const refreshToken = localStorage.getItem('refresh_token');
    return this.request('POST', '/api/auth/refresh', { body: { refreshToken } });
  }
```

with (cookie carries it; no body):

```javascript
  refreshToken() {
    // Refresh token is sent automatically as an httpOnly cookie.
    return this.request('POST', '/api/auth/refresh');
  }
```

- [ ] **Step 5: Verify no `refresh_token` writes remain in the frontend**

Run: `grep -rn "setItem('refresh_token'\|localStorage.getItem('refresh_token')" public/js`
Expected: **no matches** (only the `removeItem` cleanup lines may remain).

- [ ] **Step 6: Commit**

```bash
git add public/js/auth-manager.js public/js/auth-pages.js public/js/2fa-verify.js public/js/api-client.js
git commit -m "feat(auth): stop storing refresh token in localStorage; send credentials on auth requests"
```

---

### Task 7: Full suite + lint

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS (existing auth tests that asserted `data.refreshToken` in login/refresh/verify-2fa bodies must be **updated** to expect the cookie instead — search and fix them):
Run: `grep -rn "refreshToken" tests | grep -iE "toBe|expect|data.refreshToken"`
Update any that assert a refresh token in a response body to assert the `set-cookie` header instead (see Task 2/3 test patterns).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS (no new violations).

- [ ] **Step 3: Commit any test fixups**

```bash
git add tests
git commit -m "test(auth): update expectations for refresh-token cookie migration"
```

---

## Manual verification (run the app)

1. `npm start`, open the site, log in.
2. **DevTools → Application → Cookies**: a `refresh_token` cookie exists with `HttpOnly ✓`, `SameSite=Strict`, `Path=/api/auth`. In prod it also has `Secure ✓`.
3. **Console**: `localStorage.getItem('refresh_token')` → `null`; `document.cookie` does **not** include `refresh_token`.
4. Wait for / force access-token expiry (~15 min) → confirm the app silently refreshes (Network shows `POST /api/auth/refresh` 200 with a new `Set-Cookie`), and stays logged in.
5. **Logout** → the `refresh_token` cookie is gone.
6. **Password reset** (either flow) → a session logged in elsewhere can no longer refresh (next `/refresh` → 401).
7. **2FA account**: log in with a 2FA user → verify-2fa → confirm cookie set, no `refreshToken` in the JSON (Network response).
8. **force-2FA-setup** flow (new staff first login): complete it → confirm the `refresh_token` cookie is set. *(No frontend `refresh_token` handling exists for this page; it relies on the server cookie + `credentials`. If its request is a raw `fetch`, ensure it includes `credentials: 'include'`.)*

## Self-review

- **Spec coverage:** cookie attributes (Task 1) ✓; cookie-parser wiring + `/refresh` cookie-only (Task 2) ✓; four minting endpoints set cookie / drop body token (Tasks 2-3) ✓; logout clears (Task 4) ✓; password-reset/email-verify audited-no-change + revoke-sessions regression lock (Task 5) ✓; frontend localStorage removal + credentials (Task 6) ✓; clean-cut rollout (no body fallback in Task 2) ✓; access token untouched ✓; no CSRF ✓.
- **Placeholder scan:** the two "Note for implementer" blocks point at exact existing files/line ranges to copy mock shapes from (not vague TODOs); all code steps contain real code.
- **Type/name consistency:** `REFRESH_COOKIE_NAME`, `setRefreshCookie(res, token)`, `clearRefreshCookie(res)` used identically across Tasks 1-4.

## Out of scope (future phases)

- **Phase 2:** access token → httpOnly cookie; `authMiddleware` reads cookie (Bearer fallback); remove all `localStorage` token use; add CSRF tokens; WebSocket auth.
- **Phase 3:** remove `script-src 'unsafe-inline'` from the CSP.
