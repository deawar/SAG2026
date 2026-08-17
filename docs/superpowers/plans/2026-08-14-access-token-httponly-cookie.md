# Access Token → httpOnly Cookie (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the JWT access token out of `localStorage` into an httpOnly cookie, protect the now cookie-authenticated API against CSRF, and remove every bearer token from JavaScript.

**Architecture:** Server issues the access token as an httpOnly `access_token` cookie (and the 2FA pre-auth token as a short-lived `twofa_token` cookie); middleware reads the cookie only (hard cut — no `Authorization` fallback); a CSRF middleware requires `X-Requested-With` on cookie-authenticated mutations; a global client `fetch-guard.js` adds that header and strips dead `Authorization` headers; the WebSocket authenticates from the handshake cookie; client auth state becomes a non-sensitive expiry hint.

**Tech Stack:** Node/Express, `cookie-parser`, `jsonwebtoken`, `ws`; Jest + supertest with `tests/helpers/mockDb` (server) and jsdom `tests/unit/public/` (client). Cookie helper template: `src/utils/refreshCookie.js`. Controller cookie-test template: `tests/unit/controllers/refreshTokenCookie.test.js`.

**Spec:** `docs/superpowers/specs/2026-08-14-access-token-httponly-cookie-design.md`

## Global Constraints

- **Access cookie:** name `access_token`; `{ httpOnly: true, secure: NODE_ENV==='production', sameSite: 'strict', path: '/' }`; `maxAge` 15 min (`15 * 60 * 1000`). Path is `/` (every API route), NOT `/api/auth`.
- **2FA temp cookie:** name `twofa_token`; `{ httpOnly: true, secure: prod, sameSite: 'strict', path: '/api/auth' }`; `maxAge` 10 min (`10 * 60 * 1000`).
- **Hard cut:** middleware reads the cookie ONLY. Delete all `Authorization: Bearer` reading in `authMiddleware.js`. Response bodies MUST NOT contain `accessToken`, `tempToken`, or `setupToken`.
- **CSRF:** required header is `X-Requested-With` (any value). Enforced on `POST/PUT/PATCH/DELETE` ONLY when `req.cookies.access_token` is present. `GET/HEAD/OPTIONS` and credential-less requests pass. Reject with `403 { success:false, message:'CSRF check failed' }`.
- **`register` issues no tokens** — do not set any auth cookie in `register`.
- **Client auth hint:** non-sensitive; `user` object (already persisted) + `auth_expires_at` (epoch ms) in localStorage. No JWT is ever stored or decoded in JS.
- Follow existing patterns; keep the full suite green at every commit.

---

### Task 1: `access_token` cookie helper

**Files:**
- Create: `src/utils/accessCookie.js`
- Test: `tests/unit/utils/accessCookie.test.js`

**Interfaces:**
- Produces: `ACCESS_COOKIE_NAME` (`'access_token'`), `ACCESS_MAX_AGE_MS` (`900000`), `setAccessCookie(res, token)`, `clearAccessCookie(res)`.

- [ ] **Step 1: Write the failing test**

```js
const { ACCESS_COOKIE_NAME, setAccessCookie, clearAccessCookie } = require('../../../src/utils/accessCookie');

function fakeRes() {
  return { set: [], cleared: [],
    cookie(n, v, o) { this.set.push({ n, v, o }); return this; },
    clearCookie(n, o) { this.cleared.push({ n, o }); return this; } };
}

describe('accessCookie', () => {
  test('setAccessCookie sets httpOnly/strict/path-root cookie with 15m maxAge', () => {
    const res = fakeRes();
    setAccessCookie(res, 'jwt-abc');
    expect(res.set[0]).toEqual({ n: 'access_token', v: 'jwt-abc',
      o: expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/', maxAge: 900000 }) });
  });
  test('secure is false outside production', () => {
    const res = fakeRes(); setAccessCookie(res, 't');
    expect(res.set[0].o.secure).toBe(false);
  });
  test('clearAccessCookie clears with matching options', () => {
    const res = fakeRes(); clearAccessCookie(res);
    expect(res.cleared[0]).toEqual({ n: 'access_token',
      o: expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/' }) });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/utils/accessCookie.test.js`
Expected: FAIL — cannot find module `accessCookie`.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * Single source of truth for the access-token cookie.
 * HttpOnly so JS/XSS cannot read it; SameSite=Strict so it is never sent
 * cross-site; Path=/ so it rides every API route (unlike the refresh cookie's
 * /api/auth). Secure only in production so http://localhost works in dev/test.
 */
const ACCESS_COOKIE_NAME = 'access_token';
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  };
}

function setAccessCookie(res, token) {
  res.cookie(ACCESS_COOKIE_NAME, token, { ...cookieOptions(), maxAge: ACCESS_MAX_AGE_MS });
}

function clearAccessCookie(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, cookieOptions());
}

module.exports = { ACCESS_COOKIE_NAME, ACCESS_MAX_AGE_MS, setAccessCookie, clearAccessCookie };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/utils/accessCookie.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/utils/accessCookie.js tests/unit/utils/accessCookie.test.js
git commit -m "feat(auth): access_token cookie helper (httpOnly, SameSite=Strict, path /)"
```

---

### Task 2: `twofa_token` cookie helper

**Files:**
- Create: `src/utils/twofaCookie.js`
- Test: `tests/unit/utils/twofaCookie.test.js`

**Interfaces:**
- Produces: `TWOFA_COOKIE_NAME` (`'twofa_token'`), `TWOFA_MAX_AGE_MS` (`600000`), `setTwofaCookie(res, token)`, `clearTwofaCookie(res)`.

- [ ] **Step 1: Write the failing test**

```js
const { setTwofaCookie, clearTwofaCookie } = require('../../../src/utils/twofaCookie');
function fakeRes() {
  return { set: [], cleared: [],
    cookie(n, v, o) { this.set.push({ n, v, o }); return this; },
    clearCookie(n, o) { this.cleared.push({ n, o }); return this; } };
}
describe('twofaCookie', () => {
  test('sets short-lived httpOnly cookie scoped to /api/auth', () => {
    const res = fakeRes(); setTwofaCookie(res, 'temp-jwt');
    expect(res.set[0]).toEqual({ n: 'twofa_token', v: 'temp-jwt',
      o: expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth', maxAge: 600000 }) });
  });
  test('clear uses matching options', () => {
    const res = fakeRes(); clearTwofaCookie(res);
    expect(res.cleared[0].o).toEqual(expect.objectContaining({ path: '/api/auth', httpOnly: true }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/utils/twofaCookie.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * Short-lived httpOnly cookie carrying the 2FA pre-auth token
 * (purpose '2fa_challenge' or '2fa_force_setup'). Scoped to /api/auth because
 * only the auth endpoints consume it.
 */
const TWOFA_COOKIE_NAME = 'twofa_token';
const TWOFA_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth'
  };
}

function setTwofaCookie(res, token) {
  res.cookie(TWOFA_COOKIE_NAME, token, { ...cookieOptions(), maxAge: TWOFA_MAX_AGE_MS });
}

function clearTwofaCookie(res) {
  res.clearCookie(TWOFA_COOKIE_NAME, cookieOptions());
}

module.exports = { TWOFA_COOKIE_NAME, TWOFA_MAX_AGE_MS, setTwofaCookie, clearTwofaCookie };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/utils/twofaCookie.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/utils/twofaCookie.js tests/unit/utils/twofaCookie.test.js
git commit -m "feat(auth): twofa_token short-lived httpOnly cookie helper"
```

---

### Task 3: CSRF middleware (unmounted)

**Files:**
- Create: `src/middleware/csrfMiddleware.js`
- Test: `tests/unit/middleware/csrfMiddleware.test.js`

**Interfaces:**
- Produces: `requireCsrfHeader(req, res, next)`.

- [ ] **Step 1: Write the failing test**

```js
const { requireCsrfHeader } = require('../../../src/middleware/csrfMiddleware');

function run({ method = 'POST', cookies = {}, xrw } = {}) {
  const req = { method, cookies, get: (h) => (h === 'X-Requested-With' ? xrw : undefined) };
  let status = null, body = null, nextCalled = false;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  requireCsrfHeader(req, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

describe('requireCsrfHeader', () => {
  test('GET passes without header', () => {
    expect(run({ method: 'GET', cookies: { access_token: 't' } }).nextCalled).toBe(true);
  });
  test('mutation WITHOUT access_token cookie passes (no ambient credential)', () => {
    expect(run({ method: 'POST', cookies: {} }).nextCalled).toBe(true);
  });
  test('cookie-authed mutation WITHOUT header is rejected 403', () => {
    const r = run({ method: 'POST', cookies: { access_token: 't' } });
    expect(r.nextCalled).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, message: 'CSRF check failed' });
  });
  test('cookie-authed mutation WITH header passes', () => {
    expect(run({ method: 'POST', cookies: { access_token: 't' }, xrw: 'XMLHttpRequest' }).nextCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/middleware/csrfMiddleware.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * CSRF defense for cookie-authenticated mutations.
 * Only enforced when the request carries the access_token cookie: a forged
 * cross-site request necessarily rides that ambient cookie, so it hits the
 * header check and is blocked; a request without the cookie is unauthenticated
 * and 401s at the auth middleware regardless. Browsers cannot set a custom
 * header cross-site without a CORS preflight the server never approves.
 */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function requireCsrfHeader(req, res, next) {
  if (SAFE_METHODS.includes(req.method)) return next();
  if (!req.cookies || !req.cookies.access_token) return next();
  if (req.get('X-Requested-With')) return next();
  return res.status(403).json({ success: false, message: 'CSRF check failed' });
}

module.exports = { requireCsrfHeader };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/middleware/csrfMiddleware.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/middleware/csrfMiddleware.js tests/unit/middleware/csrfMiddleware.test.js
git commit -m "feat(auth): CSRF middleware requiring X-Requested-With on cookie-authed mutations"
```

---

### Task 4: Shared test auth helper + middleware reads the cookie (hard cut)

This is the atomic hard-cut task: the middleware stops reading `Authorization` and reads `req.cookies.access_token`. Every authenticated test currently sends `Authorization: Bearer` and would break, so the same commit introduces a shared helper and migrates those tests to cookie auth. Keep the suite green.

**Files:**
- Create: `tests/helpers/authCookie.js`
- Modify: `src/middleware/authMiddleware.js` (`verifyToken` steps 1-3; `optionalVerifyToken` header block)
- Test: `tests/unit/middleware/authMiddlewareCookie.test.js` (new)
- Migrate (Bearer → cookie): the 32 test files listed in **Interfaces** below.

**Interfaces:**
- Consumes: nothing from prior tasks (uses cookie name string `access_token`).
- Produces: `authCookie(token)` → `{ Cookie: 'access_token=' + token, 'X-Requested-With': 'XMLHttpRequest' }`; `extractAccessCookie(res)` → the `access_token` value from a response's `set-cookie`.
- Files to migrate (replace every `.set('Authorization', \`Bearer ${X}\`)` with `.set(authCookie(X))`, importing the helper): `tests/integration/routes/adminAuctionSearchIntegrationTest.spec.js`, `adminCreateUserIntegrationTest.spec.js`, `adminReportExportIntegrationTest.spec.js`, `adminReportsSummaryIntegrationTest.spec.js`, `adminTwoFactorIntegrationTest.spec.js`, `auctionPiiExposureIntegrationTest.spec.js`, `auctionRoutesIntegrationTest.spec.js`, `authSafetyIntegrationTest.spec.js`, `emailNotificationsIntegrationTest.spec.js`, `fulfillmentIntegrationTest.spec.js`, `galleryAccessMatrix.spec.js`, `galleryComments.spec.js`, `galleryGrants.spec.js`, `galleryRosterMembers.spec.js`, `gallerySameSchool.spec.js`, `galleryTransferCascade.spec.js`, `portfolioCommentsIntegrationTest.spec.js`, `portfolioIntegrationTest.spec.js`, `sessionLimitingIntegrationTest.spec.js`, `teacherAddStudentIntegrationTest.spec.js`, `teacherApprovalIntegrationTest.spec.js`, `teacherPortfolioIntegrationTest.spec.js`, `twoFactorDisableIntegrationTest.spec.js`, `userSelfDeleteIntegrationTest.spec.js` (all under `tests/integration/routes/`); `tests/integration/services/notificationService.integration.test.js`; `tests/security/authentication.test.js`, `tests/security/owasp-top-10.test.js`, `tests/security/payment-security.test.js`, `tests/security/section-11-security.test.js`; `tests/unit/routes/biddingCloseBroadcastTest.spec.js`, `tests/unit/services/portfolioPropagation.test.js`. (`tests/unit/services/paypalGateway.test.js` uses "Bearer" only in a PayPal API string — do NOT change it; verify before editing.)

- [ ] **Step 1: Write the failing middleware test**

```js
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const jwt = require('jsonwebtoken');
const authMiddleware = require('../../../src/middleware/authMiddleware');

function tokenFor(claims) {
  return jwt.sign({ sub: 'u1', role: 'TEACHER', ...claims }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
}
function mkRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('verifyToken reads the access_token cookie', () => {
  test('valid cookie authenticates and populates req.user', async () => {
    const req = { cookies: { access_token: tokenFor({}) }, headers: {} };
    const res = mkRes(); let nexted = false;
    await authMiddleware.verifyToken(req, res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(req.user.role).toBe('TEACHER');
  });
  test('missing cookie → 401', async () => {
    const req = { cookies: {}, headers: {} };
    const res = mkRes();
    await authMiddleware.verifyToken(req, res, () => {});
    expect(res.statusCode).toBe(401);
  });
  test('Authorization header is IGNORED (no fallback)', async () => {
    const req = { cookies: {}, headers: { authorization: `Bearer ${tokenFor({})}` } };
    const res = mkRes();
    await authMiddleware.verifyToken(req, res, () => {});
    expect(res.statusCode).toBe(401);
  });
  test('optionalVerifyToken populates from cookie, no-ops without it', async () => {
    const req1 = { cookies: { access_token: tokenFor({}) }, headers: {} }; const res1 = mkRes(); let n1 = false;
    await authMiddleware.optionalVerifyToken(req1, res1, () => { n1 = true; });
    expect(n1).toBe(true); expect(req1.user.role).toBe('TEACHER');
    const req2 = { cookies: {}, headers: {} }; const res2 = mkRes(); let n2 = false;
    await authMiddleware.optionalVerifyToken(req2, res2, () => { n2 = true; });
    expect(n2).toBe(true); expect(req2.user).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/middleware/authMiddlewareCookie.test.js`
Expected: FAIL — header still read; the "Authorization ignored" and cookie tests fail.

- [ ] **Step 3: Create the helper**

`tests/helpers/authCookie.js`:
```js
/** Attach a cookie-based access token + the CSRF header to a supertest request. */
function authCookie(token) {
  return { Cookie: `access_token=${token}`, 'X-Requested-With': 'XMLHttpRequest' };
}
/** Read the access_token value from a response's Set-Cookie (for login→call chains). */
function extractAccessCookie(res) {
  const raw = res.headers['set-cookie'] || [];
  const found = raw.find((s) => s.startsWith('access_token='));
  return found ? found.split(';')[0].split('=')[1] : null;
}
module.exports = { authCookie, extractAccessCookie };
```

- [ ] **Step 4: Switch the middleware to cookie read**

In `src/middleware/authMiddleware.js` `verifyToken`, replace steps 1-3 (the `authHeader` extraction and Bearer checks, lines ~17-41) with:
```js
      // 1. Extract the access token from the httpOnly cookie (hard cut — no Bearer).
      const token = req.cookies?.access_token;
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
```
Leave steps 4-9 (verify, type/purpose/claims checks, blacklist, `req.user`, SCHOOL_ADMIN hydration) unchanged.

In `optionalVerifyToken`, replace the `authHeader`/Bearer block (lines ~153-161) with:
```js
    const token = req.cookies?.access_token;
    if (!token) {
      return next();
    }
```
Leave the `try { jwt.verify... }` body unchanged.

- [ ] **Step 5: Migrate the Bearer-auth test files**

In each file listed in **Interfaces**, add `const { authCookie } = require('<relative>/helpers/authCookie');` and replace every `.set('Authorization', \`Bearer ${TOKEN}\`)` with `.set(authCookie(TOKEN))`. For any test that read a token from a login response body (`res.body.data.accessToken`) to authenticate a later call, switch to `extractAccessCookie(loginRes)`.

- [ ] **Step 6: Run the middleware test + full suite**

Run: `npx jest tests/unit/middleware/authMiddlewareCookie.test.js` → PASS (4/4).
Run: `npm test` → all green (migrated files now authenticate via cookie).

- [ ] **Step 7: Commit**

```bash
git add src/middleware/authMiddleware.js tests/helpers/authCookie.js tests/unit/middleware/authMiddlewareCookie.test.js tests/
git commit -m "feat(auth)!: middleware reads access_token cookie only; migrate tests to cookie auth"
```

---

### Task 5: Issue the access cookie; drop access token from bodies; clear on logout

**Files:**
- Modify: `src/controllers/userController.js` — `login` (~386-416), `refreshToken` (~540-570), `verify2FA` (~661-691), `logout` (~469).
- Test: `tests/unit/controllers/accessCookie.controller.test.js` (new); update `tests/unit/controllers/refreshTokenCookie.test.js`.

**Interfaces:**
- Consumes: `setAccessCookie`, `clearAccessCookie` from `src/utils/accessCookie` (Task 1).
- Produces: `login`/`refreshToken`/`verify2FA` set the `access_token` cookie and omit `accessToken` from `data`; `logout` clears it.

- [ ] **Step 1: Write the failing test**

```js
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
const UserController = require('../../../src/controllers/userController');

function fakeRes() {
  return { statusCode: 200, cookies: [], cleared: [], body: null,
    status(c) { this.statusCode = c; return this; },
    cookie(n, v, o) { this.cookies.push({ n, v, o }); return this; },
    clearCookie(n, o) { this.cleared.push({ n, o }); return this; },
    json(b) { this.body = b; return this; } };
}

describe('login sets access_token cookie and omits it from body', () => {
  test('cookie set, body has no accessToken', async () => {
    const authService = { jwtService: {
      generateAccessToken: jest.fn(() => ({ token: 'access-1', expiresIn: '15m' })),
      generateRefreshToken: jest.fn(() => ({ token: 'refresh-1', jti: 'j1' })) } };
    const userModel = {
      getByEmail: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@e.com', password_hash: 'h', role: 'STUDENT',
        school_id: null, first_name: 'U', last_name: 'r', account_status: 'ACTIVE', email_verified_at: new Date(),
        requires_parental_consent: true, parental_consent_status: 'granted', two_fa_enabled: false }),
      checkPassword: jest.fn().mockResolvedValue(true), updateLastLogin: jest.fn().mockResolvedValue() };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue();
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.cookies.find(c => c.n === 'access_token').v).toBe('access-1');
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.expiresIn).toBe('15m');
  });
});

describe('logout clears the access_token cookie', () => {
  test('access_token cleared', async () => {
    const { tokenBlacklist } = require('../../../src/services/authenticationService');
    jest.spyOn(tokenBlacklist, 'revoke').mockResolvedValue();
    const ctrl = new UserController({}, { jwtService: {} });
    const res = fakeRes();
    await ctrl.logout({ user: { id: 'u1', jti: 'a1', exp: Math.floor(Date.now()/1000)+900 }, body: {} }, res, jest.fn());
    expect(res.cleared.find(c => c.n === 'access_token')).toBeTruthy();
    tokenBlacklist.revoke.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/controllers/accessCookie.controller.test.js`
Expected: FAIL — no `access_token` cookie; `data.accessToken` still present.

- [ ] **Step 3: Implement**

At the top of `userController.js`, extend the existing require:
```js
const { setRefreshCookie, clearRefreshCookie } = require('../utils/refreshCookie');
const { setAccessCookie, clearAccessCookie } = require('../utils/accessCookie');
```

In `login` (~401-415): before `return res.json`, add `setAccessCookie(res, accessTokenResult.token);` next to the existing `setRefreshCookie`, and remove the `accessToken: accessTokenResult.token,` line from `data` (keep `expiresIn`).

In `refreshToken` (~561-569): add `setAccessCookie(res, accessTokenResult.token);` next to `setRefreshCookie`, and remove `accessToken: accessTokenResult.token,` from `data` (keep `expiresIn`).

In `verify2FA` (~676-690): add `setAccessCookie(res, accessTokenResult.token);` next to `setRefreshCookie`, and remove `accessToken: accessTokenResult.token,` from `data` (keep `expiresIn` and the user fields).

In `logout` (~469): add `clearAccessCookie(res);` next to `clearRefreshCookie(res);`.

- [ ] **Step 4: Update `refreshTokenCookie.test.js`**

That file asserts `res.body.data.accessToken === 'access-1'` / `'access-2'` / `'new-access'` and refresh-body absence. Change each such assertion to assert the `access_token` cookie value instead and that `res.body.data.accessToken` is `undefined`. (The refresh-cookie assertions stay.)

- [ ] **Step 5: Run tests**

Run: `npx jest tests/unit/controllers/accessCookie.controller.test.js tests/unit/controllers/refreshTokenCookie.test.js` → PASS.
Run: `npm test` — fix any integration test that asserted `data.accessToken` on login/refresh/verify2FA bodies (see `tests/integration/routes/emailVerificationIntegrationTest.spec.js`, `sessionLimitingIntegrationTest.spec.js`, `authSafetyIntegrationTest.spec.js`, `userSelfDeleteIntegrationTest.spec.js`, `tests/security/authentication.test.js`, `tests/security/owasp-top-10.test.js`, `tests/unit/coppa.test.js`): read the token from `extractAccessCookie(res)` instead of the body.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/userController.js tests/
git commit -m "feat(auth)!: issue access token as httpOnly cookie; remove it from response bodies"
```

---

### Task 6: 2FA pre-auth token → `twofa_token` cookie

**Files:**
- Modify: `src/controllers/userController.js` — `login` 2FA branches (~345-361 force-setup, ~367-382 challenge), `verify2FA` (~594-596 token read, ~657 success), `logout`.
- Modify: `src/routes/authRoutes.js` — `/2fa/force-setup` (~380) and `/2fa/force-verify` (~432) read the cookie instead of `req.body.setupToken`.
- Test: `tests/unit/controllers/twofaCookie.controller.test.js` (new).

**Interfaces:**
- Consumes: `setTwofaCookie`, `clearTwofaCookie` from `src/utils/twofaCookie` (Task 2).
- Produces: `login` sets `twofa_token` cookie (challenge or force-setup) and omits `tempToken`/`setupToken` from body; `verify2FA` reads `req.cookies.twofa_token` and clears it on success; `/2fa/force-setup` and `/2fa/force-verify` read `req.cookies.twofa_token`.

- [ ] **Step 1: Write the failing test**

```js
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
const UserController = require('../../../src/controllers/userController');
function fakeRes() {
  return { statusCode: 200, cookies: [], cleared: [], body: null,
    status(c){this.statusCode=c;return this;}, cookie(n,v,o){this.cookies.push({n,v,o});return this;},
    clearCookie(n,o){this.cleared.push({n,o});return this;}, json(b){this.body=b;return this;} };
}
describe('login with 2FA sets twofa_token cookie, not a body token', () => {
  test('challenge branch', async () => {
    const authService = { jwtService: { generateAccessToken: jest.fn(() => ({ token: 'temp-1' })) } };
    const userModel = { getByEmail: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@e.com', password_hash: 'h',
      role: 'TEACHER', school_id: 's1', account_status: 'ACTIVE', email_verified_at: new Date(),
      requires_parental_consent: false, two_fa_enabled: true }), checkPassword: jest.fn().mockResolvedValue(true) };
    const ctrl = new UserController(userModel, authService);
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.cookies.find(c => c.n === 'twofa_token').v).toBe('temp-1');
    expect(res.body.data.tempToken).toBeUndefined();
    expect(res.body.data.requiresMfa).toBe(true);
  });
});
describe('verify2FA reads twofa_token cookie and clears it on success', () => {
  test('reads cookie, clears on success', async () => {
    const jwt = require('jsonwebtoken');
    const temp = jwt.sign({ sub: 'u1', purpose: '2fa_challenge' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
    const authService = { jwtService: {
        verifyAccessToken: jest.fn(() => ({ sub: 'u1', purpose: '2fa_challenge' })),
        generateAccessToken: jest.fn(() => ({ token: 'access-2', expiresIn: '15m' })),
        generateRefreshToken: jest.fn(() => ({ token: 'refresh-2', jti: 'j2' })) },
      twoFactorService: { decryptSecret: jest.fn(s => s), verifyToken: jest.fn(() => true) } };
    const userModel = { getById: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@e.com', role: 'TEACHER',
      school_id: 's1', first_name: 'U', last_name: 'r', two_fa_enabled: true, two_fa_secret: 'SECRET' }),
      updateLastLogin: jest.fn().mockResolvedValue() };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue();
    const res = fakeRes();
    await ctrl.verify2FA({ body: { code: '123456' }, cookies: { twofa_token: temp }, headers: {} }, res, jest.fn());
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.cookies.find(c => c.n === 'access_token').v).toBe('access-2');
    expect(res.cleared.find(c => c.n === 'twofa_token')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/controllers/twofaCookie.controller.test.js`
Expected: FAIL — no `twofa_token` cookie; `verify2FA` still reads the header.

- [ ] **Step 3: Implement**

Add to the top requires of `userController.js`:
```js
const { setTwofaCookie, clearTwofaCookie } = require('../utils/twofaCookie');
```
In `login` force-setup branch (~353-361): before the `return res.status(200).json`, add `setTwofaCookie(res, setupToken.token);` and remove `setupToken: setupToken.token,` from `data` (keep `requiresTwoFactorSetup`, `userId`).
In `login` challenge branch (~374-382): add `setTwofaCookie(res, tempToken.token);` and remove `tempToken: tempToken.token,` from `data` (keep `requiresMfa`, `userId`).
In `verify2FA` (~594-596): replace
```js
      const authHeader = req.headers.authorization;
      const tempToken = authHeader && authHeader.split(' ')[1];
```
with
```js
      const tempToken = req.cookies?.twofa_token;
```
After success (right after `setAccessCookie`/`setRefreshCookie`, ~677): add `clearTwofaCookie(res);`.
In `logout`: add `clearTwofaCookie(res);` next to the other clears.

In `src/routes/authRoutes.js` `/2fa/force-setup` (~380) and `/2fa/force-verify` (~432): replace `const { setupToken } = req.body;` (and `{ setupToken, secret, code }` → keep `secret, code` from body) with `const setupToken = req.cookies?.setupToken || req.cookies?.twofa_token;` — read from the cookie; keep the existing `if (!setupToken)` guard and the `jwt.verify` + `purpose === '2fa_force_setup'` checks unchanged.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/controllers/twofaCookie.controller.test.js` → PASS.
Run: `npm test` — update `tests/integration/routes/adminTwoFactorIntegrationTest.spec.js` and `twoFactorDisableIntegrationTest.spec.js` and any test that sent the temp/setup token in the header/body: send it as `.set('Cookie', 'twofa_token=' + temp)` and read `requiresMfa`/`requiresTwoFactorSetup` from the body (no `tempToken`/`setupToken`).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/userController.js src/routes/authRoutes.js tests/
git commit -m "feat(auth)!: move 2FA pre-auth token to short-lived twofa_token cookie"
```

---

### Task 7: Mount CSRF middleware in the app

**Files:**
- Modify: `src/app.js` (after `app.use(cookieParser());`, ~line 114).
- Test: `tests/integration/routes/csrfIntegrationTest.spec.js` (new).

**Interfaces:**
- Consumes: `requireCsrfHeader` (Task 3); `createTestApp` (`tests/helpers/createTestApp`); `authCookie`/`extractAccessCookie` (Task 4).

- [ ] **Step 1: Write the failing test**

```js
const request = require('supertest');
const createTestApp = require('../../helpers/createTestApp');
const jwt = require('jsonwebtoken');

function accessToken() {
  return jwt.sign({ sub: 'u1', role: 'STUDENT' }, process.env.JWT_ACCESS_SECRET || 'test-access-secret', { algorithm: 'HS256' });
}

describe('CSRF enforcement', () => {
  const app = createTestApp();
  test('cookie-authed POST without X-Requested-With → 403', async () => {
    const res = await request(app).post('/api/portfolio')
      .set('Cookie', `access_token=${accessToken()}`).send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ message: 'CSRF check failed' }));
  });
  test('cookie-authed POST WITH header passes CSRF (not 403)', async () => {
    const res = await request(app).post('/api/portfolio')
      .set('Cookie', `access_token=${accessToken()}`).set('X-Requested-With', 'XMLHttpRequest').send({ title: 'x' });
    expect(res.status).not.toBe(403);
  });
  test('credential-less POST is not CSRF-blocked (401/400, not 403)', async () => {
    const res = await request(app).post('/api/portfolio').send({ title: 'x' });
    expect(res.status).not.toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/integration/routes/csrfIntegrationTest.spec.js`
Expected: FAIL — first test returns 401/400 (no CSRF mounted yet), not 403.

- [ ] **Step 3: Implement**

In `src/app.js`, immediately after `app.use(cookieParser());` (line 114), add:
```js
  // CSRF: block cookie-authenticated mutations that lack the SPA's custom header.
  const { requireCsrfHeader } = require('./middleware/csrfMiddleware');
  app.use('/api', requireCsrfHeader);
```
(The Stripe/PayPal webhook `POST /api/payments/webhooks/payment` carries no `access_token` cookie, so the middleware's scoping clause already lets it through — no allow-list needed.)

- [ ] **Step 4: Run tests**

Run: `npx jest tests/integration/routes/csrfIntegrationTest.spec.js` → PASS (3/3).
Run: `npm test` → green (authed mutation tests already send `X-Requested-With` via `authCookie` from Task 4; credential-less mutation tests carry no access cookie).

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/integration/routes/csrfIntegrationTest.spec.js
git commit -m "feat(auth): mount CSRF header guard on /api"
```

---

### Task 8: WebSocket authenticates from the handshake cookie

**Files:**
- Modify: `src/services/realtimeService.js` — `initializeWebSocketServer` connection handler (~25), `_handleAuthenticate` (~97-175); add a `_authenticateFromToken(ws, token)` helper.
- Test: update `tests/unit/services/realtimeServiceAuth.test.js`.

**Interfaces:**
- Consumes: existing `jwt`, `tokenBlacklist`.
- Produces: sockets authenticated at `connection` from the `access_token` cookie; `authenticate` message no longer trusts a payload token.

- [ ] **Step 1: Write the failing test**

```js
const RealtimeService = require('../../../src/services/realtimeService');
const jwt = require('jsonwebtoken');
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';

function mkWs() { return { sent: [], send(m) { this.sent.push(JSON.parse(m)); }, on() {} }; }

describe('WebSocket cookie auth', () => {
  test('_authenticateFromToken sets ws.userId for a valid token', async () => {
    const svc = new RealtimeService();
    const ws = mkWs();
    const token = jwt.sign({ sub: 'u1', role: 'STUDENT' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
    await svc._authenticateFromToken(ws, token);
    expect(ws.userId).toBe('u1');
    expect(ws.sent.some(m => m.type === 'authenticated')).toBe(true);
  });
  test('authenticate message no longer trusts a payload token', async () => {
    const svc = new RealtimeService();
    const ws = mkWs();
    const token = jwt.sign({ sub: 'u2', role: 'STUDENT' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
    await svc._handleAuthenticate(ws, { type: 'authenticate', payload: { token } });
    expect(ws.userId).toBeUndefined(); // payload token ignored
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/services/realtimeServiceAuth.test.js`
Expected: FAIL — `_authenticateFromToken` undefined; `_handleAuthenticate` still authenticates from payload.

- [ ] **Step 3: Implement**

Rename the body of the current `_handleAuthenticate` (the JWT-verify → blacklist → associate → `ws.userId=...` → send `authenticated`) into a new method `async _authenticateFromToken(ws, token)` that takes the token directly (drop the `data.payload?.token` extraction and the "token required" early send). Keep verify, blacklist, client registration, `ws.userId/userRole/userSchoolId/authenticatedAt`, and the `authenticated` frame.

Replace `_handleAuthenticate` with a no-op ack that does NOT trust a payload token:
```js
  async _handleAuthenticate(ws) {
    // The socket is authenticated at connection time from the httpOnly
    // access_token cookie on the upgrade request. A client authenticate frame
    // is accepted only as a re-ack; any supplied token is ignored.
    if (ws.userId) {
      ws.send(JSON.stringify({ type: 'authenticated', userId: ws.userId, timestamp: new Date() }));
    }
  }
```

In `initializeWebSocketServer`, change the connection handler to capture `req` and authenticate from the cookie:
```js
    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection');
      const cookieHeader = req?.headers?.cookie || '';
      const token = cookieHeader.split(';').map(s => s.trim())
        .find(s => s.startsWith('access_token='))?.slice('access_token='.length);
      if (token) {
        this._authenticateFromToken(ws, token).catch((err) =>
          console.warn('[realtimeService] handshake auth failed:', err.message));
      }
      ws.on('message', (message) => this._handleMessage(ws, message));
      ws.on('close', () => this._handleDisconnect(ws));
      ws.on('error', (error) => console.error('WebSocket error:', error.message));
      ws.send(JSON.stringify({ type: 'connection', status: 'connected', timestamp: new Date(),
        message: 'Welcome to Silent Auction Gallery real-time updates' }));
    });
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/services/realtimeServiceAuth.test.js` → PASS.
Run: `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/services/realtimeService.js tests/unit/services/realtimeServiceAuth.test.js
git commit -m "feat(auth): WebSocket authenticates from the access_token handshake cookie"
```

---

### Task 9: Global client `fetch-guard.js`

**Files:**
- Create: `public/js/fetch-guard.js`
- Test: `tests/unit/public/fetchGuard.test.js`

**Interfaces:**
- Produces: monkey-patched `window.fetch` that, for same-origin requests, adds `X-Requested-With: XMLHttpRequest` and deletes any `Authorization` header. Cross-origin requests pass through untouched.

- [ ] **Step 1: Write the failing test**

```js
/** @jest-environment jsdom */
describe('fetch-guard', () => {
  let nativeFetch;
  beforeEach(() => {
    jest.resetModules();
    nativeFetch = jest.fn().mockResolvedValue({ ok: true });
    window.fetch = nativeFetch;
    // jsdom origin is http://localhost
    require('../../../public/js/fetch-guard.js');
  });
  test('adds X-Requested-With and strips Authorization on same-origin', async () => {
    await window.fetch('/api/x', { method: 'POST', headers: { Authorization: 'Bearer old' } });
    const [, init] = nativeFetch.mock.calls[0];
    const h = new Headers(init.headers);
    expect(h.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(h.get('Authorization')).toBeNull();
  });
  test('passes cross-origin requests through untouched', async () => {
    await window.fetch('https://api.stripe.com/v1/x', { method: 'POST', headers: { Authorization: 'Bearer keep' } });
    const [, init] = nativeFetch.mock.calls[0];
    const h = new Headers(init.headers);
    expect(h.get('X-Requested-With')).toBeNull();
    expect(h.get('Authorization')).toBe('Bearer keep');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/public/fetchGuard.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
/**
 * Global fetch guard. The access token is an httpOnly cookie the browser sends
 * automatically on same-origin requests, so JS never holds a token. For every
 * same-origin request this: (1) adds the X-Requested-With CSRF header the server
 * requires on cookie-authenticated mutations, and (2) strips any stale
 * Authorization header (no bearer token exists anymore). Cross-origin requests
 * (e.g. Stripe.js) pass through untouched. Load this BEFORE any other script.
 */
(function () {
  if (typeof window === 'undefined' || !window.fetch) { return; }
  const nativeFetch = window.fetch.bind(window);
  function sameOrigin(url) {
    try { return new URL(url, window.location.href).origin === window.location.origin; }
    catch (_e) { return false; }
  }
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    if (!sameOrigin(url)) { return nativeFetch(input, init); }
    const opts = init ? { ...init } : {};
    const headers = new Headers(opts.headers || {});
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.delete('Authorization');
    opts.headers = headers;
    return nativeFetch(input, opts);
  };
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/public/fetchGuard.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add public/js/fetch-guard.js tests/unit/public/fetchGuard.test.js
git commit -m "feat(auth): global fetch-guard adds CSRF header and strips Authorization (same-origin)"
```

---

### Task 10: Include `fetch-guard.js` first in every HTML page

**Files:**
- Modify: all 26 files in `public/*.html`.

**Interfaces:**
- Consumes: `public/js/fetch-guard.js` (Task 9).

- [ ] **Step 1: Add the script tag**

In each of these files, insert `<script src="/js/fetch-guard.js"></script>` immediately BEFORE the first `<script src="/js/..."></script>` tag on the page (so it patches `window.fetch` before any app script runs): `2fa-setup.html`, `2fa-verify.html`, `admin-dashboard.html`, `auction-detail.html`, `auction-labels.html`, `auctions.html`, `bidder-welcome.html`, `checkout.html`, `force-2fa-setup.html`, `gallery-invite.html`, `gallery-manage.html`, `gallery.html`, `index.html`, `login.html`, `parental-consent.html`, `password-reset.html`, `portfolio.html`, `privacy.html`, `register.html`, `teacher-dashboard.html`, `teacher-portfolios.html`, `terms.html`, `test-registration.html`, `thank-you.html`, `user-dashboard.html`, `verify-email.html`. (Pages with no `/js/` app script — e.g. static `terms.html`/`privacy.html` if they load none — may be skipped; add it before the first script tag if any API call could run.)

- [ ] **Step 2: Verify inclusion**

Run: `grep -L "fetch-guard.js" public/*.html` (from repo root via the Bash tool) — expected: only pages that legitimately load no scripts remain; every page that includes `/js/api-client.js` MUST list `fetch-guard.js` before it.

- [ ] **Step 3: Commit**

```bash
git add public/*.html
git commit -m "chore(auth): load fetch-guard.js before app scripts on all pages"
```

---

### Task 11: `api-client.js` — drop token methods, keep credentials

**Files:**
- Modify: `public/js/api-client.js` (token methods ~121-139, the Authorization block in `request` ~26-30, `isAuthenticated`/`getAuthHeaders`/`clearStorage` ~529-549).
- Test: `tests/unit/public/apiClientNoToken.test.js` (new).

**Interfaces:**
- Consumes: fetch-guard adds the CSRF header globally (Task 9), so api-client sets no auth headers.
- Produces: `apiClient.request` sends `credentials:'include'` and NO `Authorization` header; `getToken`/`setToken` removed.

- [ ] **Step 1: Write the failing test**

```js
/** @jest-environment jsdom */
global.fetch = jest.fn().mockResolvedValue({
  ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) });
const APIClient = require('../../../public/js/api-client.js');

describe('APIClient sends no Authorization header', () => {
  test('request omits Authorization and includes credentials', async () => {
    const c = new APIClient('http://localhost');
    await c.get('/api/x');
    const [, config] = global.fetch.mock.calls[0];
    expect(config.credentials).toBe('include');
    expect(config.headers.Authorization).toBeUndefined();
  });
  test('getToken/setToken no longer exist', () => {
    const c = new APIClient();
    expect(c.getToken).toBeUndefined();
    expect(c.setToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/public/apiClientNoToken.test.js`
Expected: FAIL — `Authorization` still added; `getToken`/`setToken` exist.

- [ ] **Step 3: Implement**

In `request` (~26-30), delete:
```js
    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
```
Keep `credentials: 'include'` in `config`.
Delete `getToken` (~121-127) and `setToken` (~129-139).
In `logout` (~179-182) remove the `this.setToken(null);` line (keep the POST).
In `isAuthenticated` (~529-531) replace `return !!this.getToken();` with `return !!(window.authManager && window.authManager.isAuthenticated());`.
Delete `getAuthHeaders` (~537-540) — no longer used (verify no callers remain; if any, they are removed in Task 13).
In `clearStorage` (~545-549) remove the `localStorage.removeItem('auth_token');` line; keep `user`/`2fa_required` removals.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/public/apiClientNoToken.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/api-client.js tests/unit/public/apiClientNoToken.test.js
git commit -m "feat(auth): api-client relies on the access_token cookie; drop token methods"
```

---

### Task 12: `auth-manager.js` — hint-based auth state

**Files:**
- Modify: `public/js/auth-manager.js`.
- Test: rewrite `tests/unit/public/authManagerRefresh.test.js`; add `tests/unit/public/authManagerHint.test.js`.

**Interfaces:**
- Consumes: `apiClient.refreshToken()` (returns `{ data: { expiresIn } }`).
- Produces: `authManager.isAuthenticated()` (hint-based), `authManager.user`, `authManager.clearAuth()`; NO `token`/`decodeToken`/`isTokenExpired`/`getTokenExpiration`/`setToken`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/public/authManagerHint.test.js`:
```js
/** @jest-environment jsdom */
const store = {};
Object.defineProperty(global, 'localStorage', { writable: true, value: {
  getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
global.apiClient = { refreshToken: jest.fn() };
const AuthManager = require('../../../public/js/auth-manager.js');

function fresh() { Object.keys(store).forEach(k => delete store[k]); return new AuthManager(); }

describe('AuthManager hint-based state', () => {
  test('isAuthenticated false without a user', () => {
    expect(fresh().isAuthenticated()).toBe(false);
  });
  test('isAuthenticated true with user + future expiry hint', () => {
    const m = fresh();
    m.setUser({ id: 'u1', role: 'STUDENT' });
    m._setAuthExpiry('15m');
    expect(m.isAuthenticated()).toBe(true);
  });
  test('isAuthenticated false when hint expired', () => {
    const m = fresh();
    m.setUser({ id: 'u1' });
    store.auth_expires_at = String(Date.now() - 1000);
    expect(m.isAuthenticated()).toBe(false);
  });
  test('no token API remains', () => {
    const m = fresh();
    expect(m.decodeToken).toBeUndefined();
    expect(m.isTokenExpired).toBeUndefined();
    expect(m.token).toBeUndefined();
  });
  test('clearAuth wipes user + hint', () => {
    const m = fresh(); m.setUser({ id: 'u1' }); m._setAuthExpiry('15m');
    m.clearAuth();
    expect(m.user).toBeNull();
    expect(store.auth_expires_at).toBeUndefined();
  });
});
```

Rewrite `authManagerRefresh.test.js` so it no longer references `mgr.token`/`auth_token`. New behavior: `refreshAccessToken()` gates on `this.user` (or the hint), calls `apiClient.refreshToken()`, and on `{ data: { expiresIn } }` updates the hint and returns `true`; on empty/reject it calls `clearAuth()` and returns `false`.
```js
/** @jest-environment jsdom */
const store = {};
Object.defineProperty(global, 'localStorage', { writable: true, value: {
  getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
global.apiClient = { refreshToken: jest.fn() };
const AuthManager = require('../../../public/js/auth-manager.js');
function fresh() { Object.keys(store).forEach(k => delete store[k]); return new AuthManager(); }

describe('refreshAccessToken (cookie-driven)', () => {
  beforeEach(() => jest.clearAllMocks());
  test('with a user, calls refresh and updates hint on success', async () => {
    const m = fresh(); m.setUser({ id: 'u1' });
    global.apiClient.refreshToken.mockResolvedValueOnce({ data: { expiresIn: '15m' } });
    const ok = await m.refreshAccessToken();
    expect(global.apiClient.refreshToken).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);
    expect(Number(store.auth_expires_at)).toBeGreaterThan(Date.now());
  });
  test('without a user, clears auth and does not call refresh', async () => {
    const m = fresh();
    const ok = await m.refreshAccessToken();
    expect(ok).toBe(false);
    expect(global.apiClient.refreshToken).not.toHaveBeenCalled();
  });
  test('on reject, clears auth', async () => {
    const m = fresh(); m.setUser({ id: 'u1' });
    global.apiClient.refreshToken.mockRejectedValueOnce(new Error('401'));
    const ok = await m.refreshAccessToken();
    expect(ok).toBe(false);
    expect(m.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/public/authManagerHint.test.js tests/unit/public/authManagerRefresh.test.js`
Expected: FAIL — hint methods absent; old token logic present.

- [ ] **Step 3: Implement**

In the constructor (~7-15): remove `this.token = localStorage.getItem('auth_token');`; keep `this.user`, `this.refreshToken = null`, `this.require2FA`; keep `setupTokenRefresh()`.
Add a hint helper and expiry field:
```js
  _setAuthExpiry(expiresIn) {
    // expiresIn may be a number (seconds) or a string like '15m'; default 15m.
    let ms = 15 * 60 * 1000;
    if (typeof expiresIn === 'number') { ms = expiresIn * 1000; }
    this.authExpiresAt = Date.now() + ms;
    localStorage.setItem('auth_expires_at', String(this.authExpiresAt));
  }
  _loadAuthExpiry() {
    const v = Number(localStorage.getItem('auth_expires_at'));
    this.authExpiresAt = Number.isFinite(v) ? v : 0;
    return this.authExpiresAt;
  }
```
Call `this._loadAuthExpiry()` in the constructor.
Replace `setToken` usage: in `login`/`verify2FA`/`register` success handlers, remove `this.setToken(...)`/`this.setRefreshToken(...)` calls and instead call `this._setAuthExpiry(response.data.expiresIn)` and `this.setUser(...)` (keep existing user extraction). Remove references to `response.data.accessToken`/`response.token`.
Delete `setToken`, `getToken`, `decodeToken`, `isTokenExpired`, `getTokenExpiration` (and `setRefreshToken` — the refresh token is never in JS).
`refreshAccessToken`:
```js
  async refreshAccessToken() {
    if (!this.user) { this.clearAuth(); return false; }
    try {
      const response = await apiClient.refreshToken();
      if (response && response.data) {
        this._setAuthExpiry(response.data.expiresIn);
        return true;
      }
      this.clearAuth(); return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearAuth(); return false;
    }
  }
```
`setupTokenRefresh`: change the guard from `if (this.token)` to `if (this.user)`.
`isAuthenticated`:
```js
  isAuthenticated() {
    return !!this.user && Date.now() < (this.authExpiresAt || 0);
  }
```
`clearAuth`: remove `this.token = null;` and `localStorage.removeItem('auth_token'/'refresh_token')`; add `this.authExpiresAt = 0; localStorage.removeItem('auth_expires_at');` (keep user/2fa removals; keep `apiClient` cleanup but drop `apiClient.setToken` — it no longer exists, so remove that call).
Cross-tab listener (~505-508): change `if (event.key === 'auth_token')` to `if (event.key === 'user' || event.key === 'auth_expires_at')`.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/public/authManagerHint.test.js tests/unit/public/authManagerRefresh.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/auth-manager.js tests/unit/public/authManagerHint.test.js tests/unit/public/authManagerRefresh.test.js
git commit -m "feat(auth): auth-manager uses a non-sensitive expiry hint; remove client token handling"
```

---

### Task 13: `websocket-client.js` — connect on hint, stop sending token

**Files:**
- Modify: `public/js/websocket-client.js` (~66-70 authenticate-on-open, ~222-227 `authenticate()`, ~420-423 auto-connect guard).
- Test: `tests/unit/public/websocketClientAuth.test.js` (new, if the client is unit-testable in jsdom; otherwise a focused DOM smoke test).

**Interfaces:**
- Consumes: `window.authManager.isAuthenticated()` (Task 12); the `access_token` cookie authenticates the handshake server-side (Task 8).
- Produces: the client connects without reading or sending any token.

- [ ] **Step 1: Write the failing test**

```js
/** @jest-environment jsdom */
// Minimal: assert the module no longer references localStorage auth_token.
const fs = require('fs');
const path = require('path');
test('websocket-client no longer reads auth_token from localStorage', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../../public/js/websocket-client.js'), 'utf8');
  expect(src).not.toMatch(/localStorage\.getItem\(['"]auth_token['"]\)/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/public/websocketClientAuth.test.js`
Expected: FAIL — the source still reads `auth_token`.

- [ ] **Step 3: Implement**

At connect/open (~66-70): remove
```js
          const token = localStorage.getItem('auth_token');
          if (token) {
            this.authenticate(token);
          }
```
(The server authenticates from the handshake cookie; the client sends nothing.)
`authenticate(token)` (~222-227): either delete it, or reduce it to sending `{ type: 'authenticate' }` with no token (kept only as an optional re-ack). Prefer deleting it and its call sites.
Auto-connect guard (~420-423): change `if (localStorage.getItem('auth_token') && !isAdminPage)` to `if (window.authManager && window.authManager.isAuthenticated() && !isAdminPage)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/public/websocketClientAuth.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/websocket-client.js tests/unit/public/websocketClientAuth.test.js
git commit -m "feat(auth): WebSocket client connects via cookie; stop reading/sending the token"
```

---

### Task 14: Migrate auth-gate guards to the hint

Every page script that gates rendering/redirect on `auth_token` truthiness must use the hint. Header-construction sites that merely build a dead `Authorization` header need NO edit — fetch-guard strips it at runtime.

**Files (guard sites — migrate `const token = localStorage.getItem('auth_token'); if (!token) …redirect…` to `if (!window.authManager || !window.authManager.isAuthenticated()) …redirect…`, and remove now-unused `token` locals):**
- `public/js/admin-dashboard.js` (~26)
- `public/js/auction-detail.js` (~49, ~319, ~681, ~835 — the guard/branch reads; leave header-only reads to fetch-guard)
- `public/js/auction-labels.js` (~23, ~44)
- `public/js/auctions-page.js` (~137)
- `public/js/artwork-carousel.js` (~98)
- `public/js/teacher-dashboard.js` (~785, ~1318, ~1369)
- `public/js/user-dashboard.js` (token-guarded reads)
- `public/js/checkout.js` (~11 `getToken` → use `authManager.isAuthenticated()` for the guard; the fetch itself rides the cookie)
- `public/js/2fa-setup.js` (token-guarded reads)
- `public/js/ui-components.js` (~token-guarded read)

**Interfaces:**
- Consumes: `window.authManager.isAuthenticated()` (Task 12).

- [ ] **Step 1: Inventory each guard**

For each file above, open it and classify every `localStorage.getItem('auth_token')` read as either (a) a **guard** (its truthiness decides render/redirect/early-return) or (b) a **header build** (only used to construct `Authorization`). Migrate (a); delete (b)'s surrounding `token` local if it becomes unused (the `Authorization` header is stripped by fetch-guard, so the fetch still works).

- [ ] **Step 2: Migrate guards**

Replace guard reads, e.g.:
```js
// before
const token = localStorage.getItem('auth_token');
if (!token) { window.location.href = '/login.html'; return; }
// after
if (!window.authManager || !window.authManager.isAuthenticated()) { window.location.href = '/login.html'; return; }
```

- [ ] **Step 3: Add a jsdom guard test for one representative file**

`tests/unit/public/authGuardRedirect.test.js` — load `user-dashboard.js`'s guard (or extract the guard call) and assert that with `window.authManager.isAuthenticated()` returning false the redirect target is `/login.html`, and with true it does not redirect. (If a file is not import-friendly, assert via a source check that no `auth_token` guard remains: `expect(src).not.toMatch(/getItem\(['"]auth_token['"]\)/)` for the guard files where all reads were guards.)

- [ ] **Step 4: Run tests + manual smoke**

Run: `npm test` → green.
Manual (documented for the executor, not automated): after deploy, load each dashboard while logged in and confirm no redirect loop; while logged out confirm redirect to `/login.html`.

- [ ] **Step 5: Commit**

```bash
git add public/js/ tests/unit/public/authGuardRedirect.test.js
git commit -m "feat(auth): auth-gate guards use the authManager hint instead of localStorage token"
```

---

### Task 15: `auth-pages.js` — stop persisting the 2FA token; full-suite + lint sweep

**Files:**
- Modify: `public/js/auth-pages.js` (~106 `sessionStorage.setItem('force_2fa_setup_token', …)` and any `2fa-verify.js`/`auth-pages.js` site that sent the temp/setup token in a header or body).
- Verify: `public/js/2fa-verify.js` (~78 `fetch('/api/auth/verify-2fa', …)`).

**Interfaces:**
- Consumes: the `twofa_token` cookie (Task 6) now carries the pre-auth token; the client sends nothing.

- [ ] **Step 1: Remove client token plumbing**

In `auth-pages.js` (~106), delete `sessionStorage.setItem('force_2fa_setup_token', data.data.setupToken || '');` (the token is an httpOnly cookie now). Remove any subsequent read of `force_2fa_setup_token` and any `setupToken`/`tempToken` sent in a request body or header to `/api/auth/2fa/force-setup`, `/2fa/force-verify`, or `/verify-2fa` — those endpoints read the cookie. In `2fa-verify.js` (~78), ensure the `verify-2fa` POST sends only `{ code }` (no Authorization header; fetch-guard adds the CSRF header, the cookie authenticates).

- [ ] **Step 2: Run the full suite and lint**

Run: `npm test` → all green.
Run: `npm run lint` → no NEW errors beyond the pre-existing baseline (5 errors / ~427 warnings).

- [ ] **Step 3: Grep sweep for leftovers**

Run (Bash tool): `grep -rn "auth_token\|Authorization.*Bearer\|force_2fa_setup_token" public/js/` — expect only inert/removed references; no guard or token-send remains. Fix any stragglers.

- [ ] **Step 4: Commit**

```bash
git add public/js/auth-pages.js public/js/2fa-verify.js
git commit -m "feat(auth): 2FA flow relies on the twofa_token cookie; drop client token storage"
```

---

## Self-Review

**Spec coverage:**
- §1 access cookie → Task 1. §2 issue cookie + drop body token → Task 5. §3 twofa cookie → Tasks 2, 6. §4 middleware cookie read → Task 4. §5 CSRF middleware → Tasks 3, 7. §6 fetch-guard → Tasks 9, 10. §7 client hint → Tasks 11, 12. §8 guard migration → Task 14. §9 WebSocket cookie auth → Task 8. §10 logout clears cookies → Tasks 5, 6. 2FA force-setup consumers → Tasks 6, 15. All spec sections mapped.
- Testing section: server middleware/CSRF/controller/WS covered (Tasks 4-8); client fetch-guard/auth-manager covered (Tasks 9, 12); guard smoke (Task 14).

**Placeholder scan:** No TBD/TODO; each code step has concrete code; test code is concrete. The one non-code judgement step (Task 14 Step 1 inventory) is inherent to a spread-out guard migration and is bounded by an explicit classification rule and a source-grep backstop.

**Type/name consistency:** `access_token`/`twofa_token` cookie names, `setAccessCookie`/`clearAccessCookie`/`setTwofaCookie`/`clearTwofaCookie`, `requireCsrfHeader`, `authCookie`/`extractAccessCookie`, `_authenticateFromToken`, `_setAuthExpiry`/`_loadAuthExpiry`, `auth_expires_at`, `X-Requested-With` — used identically across tasks. `expiresIn` is read but never assumed to be a specific format (`_setAuthExpiry` handles number-or-string).

**Ordering note:** Tasks 1-3 are independent leaf utilities. Task 4 is the atomic hard-cut (middleware + test migration) and must precede Task 7 (CSRF mount) so the migrated tests already carry the header. Tasks 5-6 (controller cookies) are independent of 4 but should land before real-app verification. Tasks 9-13 are client; Task 10 (HTML includes) requires Task 9. Task 14 requires Task 12. Task 15 closes out with a full sweep.
