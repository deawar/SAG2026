# Move JWT access token to an httpOnly cookie (Phase 2)

**Date:** 2026-08-14
**Status:** Design approved (chat), pending spec review

## Problem

The JWT **access token** (15m, HS256) is stored in `localStorage.auth_token`
and sent as `Authorization: Bearer`. localStorage is readable by any script,
so an XSS foothold can exfiltrate a live access token. Phase 1 already moved
the **refresh token** to an httpOnly cookie (`src/utils/refreshCookie.js`,
`SameSite=Strict`, `Path=/api/auth`). This phase does the same for the access
token, removing the last bearer token from JavaScript.

## Goal

The browser holds the access token only as an httpOnly cookie. No JWT is
readable by JavaScript. Requests authenticate via the cookie; state-changing
requests are protected from CSRF. No user-visible behavior change.

**Non-goals:** rotating the JWT signing scheme, changing token TTLs, changing
roles/claims, or the broader localStorage cleanup of non-token values (`user`
object stays — it is not a credential).

## Decisions (from brainstorming)

1. **CSRF defense:** `SameSite=Strict` on the access cookie **plus** a required
   custom header (`X-Requested-With: XMLHttpRequest`) on all state-changing
   `/api` requests. A cross-site page cannot set a custom header without a CORS
   preflight the server never approves; the same-origin SPA always sends it.
2. **Transition:** **hard cut to cookie-only.** The middleware reads the cookie
   only; the `Authorization: Bearer` read path is deleted. (Clients running the
   old cached bundle re-authenticate on reload after deploy.)
3. **2FA temp token:** the `2fa_challenge` / `2fa_force_setup` pre-auth token
   also moves to a short-lived httpOnly cookie; `/verify-2fa` reads it from the
   cookie, not the `Authorization` header.

## Current state (verified)

- **Access token:** `localStorage.auth_token`; attached as `Authorization:
  Bearer` in `public/js/api-client.js:28`; decoded client-side in
  `public/js/auth-manager.js` (`decodeToken`/`isTokenExpired`) for
  `isAuthenticated()` and the refresh loop.
- **Middleware** `src/middleware/authMiddleware.js` — both `verifyToken` and
  `optionalVerifyToken` read the `Authorization` header only. Claim checks:
  reject `type==='refresh'`, reject any `purpose` token, blacklist check,
  SCHOOL_ADMIN `school_id` DB hydration.
- **Token issuance** in `src/controllers/userController.js`: `login` (~402),
  `refreshToken` (~562), `verify2FA` (~677) each `setRefreshCookie(res, ...)`
  and return `{ accessToken, expiresIn }` in the body.
- **`verify2FA`** reads the temp token from `req.headers.authorization`
  (`userController.js:595`).
- **`register`** never issues tokens — every path returns
  `requiresVerification`/email-verify first. No access cookie on register.
- **WebSocket:** `public/js/websocket-client.js:68` reads
  `localStorage.auth_token` and sends it in an `authenticate` message;
  `src/services/realtimeService.js:113` verifies the payload token.
- **`cookie-parser`** is installed and mounted (`src/app.js:114`). **No CSRF
  library.**
- **Frontend surface:** ~13 files under `public/js/` read `auth_token`; ~86
  `fetch()` calls; ~70 hand-built `Authorization: Bearer` headers; multiple
  `const token = localStorage.getItem('auth_token')` guards that drive
  redirect-to-login. Only 3 files set `credentials:'include'` (unnecessary for
  same-origin — cookies ride same-origin `fetch` by default).

## Design

### 1. Access-token cookie helper — `src/utils/accessCookie.js`

Mirrors `refreshCookie.js`:

```
ACCESS_COOKIE_NAME = 'access_token'
ACCESS_MAX_AGE_MS  = 15 * 60 * 1000
cookieOptions() = { httpOnly: true, secure: NODE_ENV==='production',
                    sameSite: 'strict', path: '/' }   // path '/', not /api/auth
setAccessCookie(res, token)   // res.cookie(NAME, token, {...opts, maxAge})
clearAccessCookie(res)        // res.clearCookie(NAME, opts)
```

`path:'/'` because the access cookie must be sent to every API route
(`/api/auctions`, `/api/bidding`, …), unlike the refresh cookie scoped to
`/api/auth`.

### 2. Issue the cookie; drop the token from bodies

In `login`, `refreshToken`, `verify2FA` (and the `2fa/force-verify` path that
issues a full access token), call `setAccessCookie(res, accessTokenResult.token)`
next to the existing `setRefreshCookie`. **Remove the `accessToken` field from
every response body.** Bodies keep `expiresIn` (drives the client refresh hint)
and the existing user fields (`userId`, `email`, `role`, `firstName`,
`lastName`, `schoolId`).

### 3. Temp-token cookie — `src/utils/twofaCookie.js`

For the 2FA pre-auth token:

```
TWOFA_COOKIE_NAME = 'twofa_token'
TWOFA_MAX_AGE_MS  = 10 * 60 * 1000   // matches the temp-token TTL
cookieOptions() = { httpOnly: true, secure: prod, sameSite: 'strict',
                    path: '/api/auth' }
setTwofaCookie / clearTwofaCookie
```

`login` sets this cookie when 2FA is required (instead of / in addition to the
current body `tempToken`; the body `tempToken` is removed). `verify2FA` reads
`req.cookies.twofa_token`; on success it clears the cookie. `logout` clears it
too.

### 4. Middleware — cookie-only read

`verifyToken`: replace the `Authorization`-header extraction with
`const token = req.cookies?.access_token;` → `401` if absent. All downstream
claim checks are unchanged. `optionalVerifyToken`: same source; still populates
`req.user` when a valid cookie is present and no-ops otherwise. Delete the
`Bearer` parsing in both.

### 5. CSRF middleware — `src/middleware/csrfMiddleware.js`

```
requireCsrfHeader(req, res, next):
  if method in {GET, HEAD, OPTIONS}: next()          // safe methods
  else if !req.cookies?.access_token: next()          // no ambient credential → nothing to protect
  else if req.get('X-Requested-With') present: next()
  else: 403 { success:false, message:'CSRF check failed' }
```

The `!access_token cookie → next()` clause is the key scoping: CSRF only
matters when the browser auto-attaches an ambient credential. A forged
cross-site request necessarily carries the cookie (that is the whole point of
the attack) and so hits the header check and is blocked; a request with no
cookie is unauthenticated and 401s at the auth middleware regardless. This also
means credential-less mutations (register, login, forgot/reset-password) never
need the header.

Mounted on the `/api` router **before** route handlers. **Exemptions:**
machine-to-machine callers that cannot send the header — the **Stripe/PayPal
webhook** route `POST /api/payments/webhooks/payment` (already
signature-verified) and any other server-to-server webhook. Those requests
never carry the `access_token` cookie, so the scoping clause above already
exempts them; no path allow-list is required.

### 6. Global client fetch wrapper — `public/js/fetch-guard.js`

Loaded **before** every other app script. Wraps `window.fetch` so that for
**same-origin** requests it:
- adds `X-Requested-With: XMLHttpRequest`,
- deletes any `Authorization` header (no bearer token in JS anymore — this
  neutralizes the ~70 legacy header sites without editing them),
- leaves body/credentials otherwise intact (same-origin cookies ride by
  default).

Cross-origin requests (e.g. Stripe.js) are passed through untouched. This single
module makes all 86 call sites cookie-authenticated and CSRF-correct.

### 7. Client auth state — hint, not token

`auth-manager.js`:
- Remove `this.token`, `setToken`, `getToken`, `decodeToken`,
  `isTokenExpired`, `getTokenExpiration`, and all `localStorage.auth_token`
  access.
- Store a **non-sensitive hint**: `auth_expires_at` (epoch ms) computed from the
  body `expiresIn` on login/verify2FA/refresh. Keep the `user` object (already
  persisted) for role-based UI.
- `isAuthenticated()` = `!!this.user && Date.now() < authExpiresAt`. This is a
  UI hint only; the httpOnly cookie is the real gate. A stale hint just means
  the next API call returns 401 → refresh or redirect.
- `refreshAccessToken()` gates on the hint/`user` (not the removed token),
  updates `auth_expires_at` from the response `expiresIn`.
- `setupTokenRefresh()` unchanged in cadence (14 min); condition becomes
  "have a user / hint" instead of "have a token".
- Cross-tab `storage` listener watches `user` (or a dedicated `auth_state` key)
  instead of `auth_token`.

`api-client.js`: remove `getToken`/`setToken` and the `Authorization` header
block; keep `credentials:'include'`. (The CSRF header is added globally by
fetch-guard, so api-client needs no per-call change.)

### 8. Auth-gate guards migration

Every site that gates rendering/redirect on `auth_token` truthiness
(`const token = localStorage.getItem('auth_token'); if (!token) redirect`) is
migrated to `window.authManager.isAuthenticated()` (hint-based). Files with such
guards: `admin-dashboard.js`, `auction-detail.js`, `auction-labels.js`,
`auctions-page.js`, `artwork-carousel.js`, `teacher-dashboard.js`,
`user-dashboard.js`, `checkout.js`, `2fa-setup.js`, `ui-components.js`
(exact lines enumerated during planning). Header-construction sites that are
*not* guards need no edit — fetch-guard strips the dead `Authorization` header.

### 9. WebSocket auth via handshake cookie

`realtimeService.js`: at the `connection` event, parse `access_token` from
`req.headers.cookie` (the upgrade request carries same-origin cookies), verify
with the existing `jwt.verify(..., { algorithms:['HS256'] })`, and mark the
socket authenticated immediately (setting `ws.userId` etc. exactly as the
current `authenticate` handler does). The `authenticate` message handler no
longer trusts a payload token: it is reduced to a no-op ack (the socket is
already authenticated from the handshake) and ignores any supplied token.
`websocket-client.js`: stop reading `localStorage.auth_token`; connect whenever
`authManager.isAuthenticated()` and stop sending the token in `authenticate`
(the cookie authenticates the handshake).

### 10. Logout

`logout` clears `access_token`, `twofa_token`, and `refresh_token`.
`auth-manager.clearAuth()` removes `user`, `auth_expires_at`, `2fa_*` hints; no
`auth_token` key remains to clear.

## Data flow

```
login (no 2FA):  body{user,expiresIn} + Set-Cookie: access_token, refresh_token
login (2FA):     body{requiresMfa,user} + Set-Cookie: twofa_token
verify-2fa:      reads twofa_token cookie → Set-Cookie: access_token, refresh_token; clears twofa_token
API request:     browser sends access_token cookie; fetch-guard adds X-Requested-With
                 middleware verifies cookie; csrf middleware checks header on mutations
refresh (14m):   refresh_token cookie → new access_token cookie; body{expiresIn} updates client hint
websocket:       upgrade carries access_token cookie → server verifies at connection
logout:          clears access_token + refresh_token + twofa_token
```

## Error / edge handling

- Missing/expired/invalid access cookie → `401` (unchanged messages where
  possible). Client 401 handler triggers refresh; refresh failure → clearAuth +
  redirect to login.
- Mutation without `X-Requested-With` → `403 CSRF check failed`. The SPA always
  sends it via fetch-guard; only forged cross-site requests hit this.
- Stripe webhook and other machine callers are exempt from the CSRF header check.
- Stale client hint (cookie expired, hint not yet) → next call 401 → refresh.
- Same-origin `fetch` sends cookies by default, so no per-call `credentials`
  change is required; fetch-guard does not need to force `include` for
  same-origin.

## Testing

Server (Jest + supertest, `tests/helpers/mockDb`):
- Middleware: valid `access_token` cookie authenticates; missing cookie → 401;
  `refresh`/`purpose` cookie value still rejected; `optionalVerifyToken`
  populates `req.user` from cookie and no-ops without one.
- CSRF: mutation without `X-Requested-With` → 403; with header → passes; GET
  exempt; webhook route exempt.
- `login`/`refreshToken`/`verify2FA` set the `access_token` cookie and **omit
  `accessToken` from the body**; still return `expiresIn`.
- `login` (2FA required) sets `twofa_token` cookie and omits `tempToken` from
  the body; `verify2FA` reads the cookie and clears it on success.
- `logout` clears `access_token`, `refresh_token`, `twofa_token`.
- WebSocket: connection authenticates from the handshake cookie; no cookie →
  unauthenticated.

Frontend (jsdom, `tests/unit/public/`):
- fetch-guard adds `X-Requested-With` and strips `Authorization` on same-origin;
  passes cross-origin through.
- `auth-manager.isAuthenticated()` is hint-based (user + non-expired
  `auth_expires_at`); refresh updates the hint; `clearAuth` wipes hints.

## Files touched (estimate)

- **New:** `src/utils/accessCookie.js`, `src/utils/twofaCookie.js`,
  `src/middleware/csrfMiddleware.js`, `public/js/fetch-guard.js`.
- **Server:** `src/middleware/authMiddleware.js` (cookie read),
  `src/controllers/userController.js` (issue access + twofa cookies, drop body
  tokens, read twofa cookie, clear on logout), `src/app.js` (mount CSRF
  middleware; ensure webhook exemption), `src/services/realtimeService.js` (WS
  cookie auth), route wiring as needed.
- **Client:** `public/js/api-client.js`, `public/js/auth-manager.js`,
  `public/js/websocket-client.js`, plus auth-gate guard migration in the files
  listed in §8. Include `fetch-guard.js` first in the HTML script order across
  pages.
- **Tests:** middleware, CSRF, controller cookie/body, WS, fetch-guard,
  auth-manager.

## Rollout

Deploy is a hard cut: after redeploy, the browser must load the new bundle
(which stops sending Bearer and starts relying on the cookie). Users on the old
cached bundle re-authenticate on next login/reload. No DB migration. Verify:
login sets `access_token` cookie (HttpOnly, Secure in prod), an authenticated
API call succeeds with no `Authorization` header, a mutation without
`X-Requested-With` is 403, WebSocket connects, and Stripe webhooks still POST
successfully.

## Out of scope

- Changing JWT TTLs, signing algorithm, or claims.
- Removing the non-credential `user` object from localStorage.
- Cosmetic cleanup of the ~70 inert `Authorization` header lines (fetch-guard
  strips them at runtime; per-file deletion can be incremental later).
