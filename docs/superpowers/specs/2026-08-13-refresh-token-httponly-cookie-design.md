# Phase 1 — Move the refresh token to an httpOnly cookie

**Date:** 2026-08-13
**Status:** Design approved, pending spec review
**Scope:** Phase 1 of the `localStorage` token remediation. Later phases (access
token → cookie, CSRF, CSP hardening) are explicitly **out of scope** here.

## Problem

Both the JWT access token and the 7-day refresh token are stored in
`localStorage` (`auth_token`, `refresh_token`) and read by JavaScript across ~12
frontend files. `localStorage` is readable by any script on the origin, so a
single XSS lets an attacker exfiltrate the tokens. The refresh token is the
worst loss: it is long-lived (7 days), so its theft is **persistent account
takeover**, not a 15-minute window. The production CSP still allows
`script-src 'unsafe-inline'` ([securityMiddleware.js:330](../../../src/middleware/securityMiddleware.js#L330)),
so XSS is not fully mitigated and this is a real, exploitable risk.

The backend reads the access token only from the `Authorization: Bearer` header
([authMiddleware.js:18](../../../src/middleware/authMiddleware.js#L18)); there is
no cookie-based auth anywhere today.

## Goal

Eliminate persistent-takeover risk by making the refresh token **unreadable by
JavaScript**: move it into an `HttpOnly` cookie set by the server. The 15-minute
access token stays in `localStorage` for now (removed in Phase 2) — an accepted,
short-lived residual exposure.

**Non-goals (Phase 2/3):** moving the access token out of `localStorage`, CSRF
tokens, removing `unsafe-inline` from the CSP, WebSocket auth changes.

## Approach (decided)

- **Refresh token → cookie only.** Access token untouched this phase.
- **Clean-cut rollout.** `/refresh` reads the token from the cookie **only** (no
  request-body fallback). On deploy, active users are re-prompted to log in on
  their next refresh (~15 min), which sets the cookie going forward. Simplest,
  most secure server code; no transitional path to clean up later.

## The cookie

| Attribute | Value | Rationale |
|---|---|---|
| name | `refresh_token` | keep the existing name |
| `HttpOnly` | always | JS cannot read it → XSS cannot steal it |
| `Secure` | production only | omitted on `http://localhost` so dev works; gate on `NODE_ENV === 'production'` (or `req.secure`) |
| `SameSite` | `Strict` | browser never sends it cross-site → CSRF-safe for `/refresh` |
| `Path` | `/api/auth` | sent only to auth endpoints, not on every API call |
| `Max-Age` | 7 days (604800 s) | matches the existing refresh-token lifetime |

A single shared helper builds these attributes so every set/clear site is
consistent (e.g. `setRefreshCookie(res, token)` / `clearRefreshCookie(res)`).
`clearRefreshCookie` MUST use the identical `path`/`sameSite`/`secure`
attributes, or the browser will not delete the cookie.

### `Path=/api/auth` consistency (verified — no existing flow breaks)

The auth router is mounted at `/api/auth` ([app.js:155](../../../src/app.js#L155)),
and **every** endpoint that sets, reads, or clears the cookie lives under it:
`/api/auth/login`, `/api/auth/verify-2fa`, `/api/auth/2fa/force-verify`,
`/api/auth/refresh`, `/api/auth/logout`. Therefore:

- **Set** — login / verify-2fa / 2fa-force-verify / refresh responses are all
  under `/api/auth`, so the browser stores the cookie.
- **Sent** — the browser attaches it to `/api/auth/refresh` (which needs it) and
  `/api/auth/logout` (which clears it); it is *not* sent to any other prefix.
- **Not sent / not needed elsewhere** — `/api/user`, `/api/auctions`,
  `/api/bidding`, `/api/payments`, `/api/portfolio`, `/api/admin`,
  `/api/teacher`, `/api/gallery`, `/api/schools` all authenticate with the
  Bearer access token and never read the refresh cookie. Scoping the cookie to
  `/api/auth` changes nothing for them — no existing API or flow breaks.

This scoping is a deliberate least-exposure choice: the refresh token rides
along only on auth requests, not on every API call.

## Backend changes

1. **Wire up `cookie-parser`** in `app.js` (already a dependency) before the auth
   routes so `req.cookies` is populated.
2. **Session-minting endpoints set the cookie and stop returning the refresh
   token in the JSON body.** Returning it in the body would leave it readable by
   `fetch().json()`, defeating the purpose. Affected endpoints (all currently
   return `data.refreshToken`):
   - `POST /api/auth/login` (non-2FA success) — [userController.login](../../../src/controllers/userController.js#L244)
   - `POST /api/auth/verify-2fa` — [userController.verify2FA](../../../src/controllers/userController.js#L573)
   - `POST /api/auth/2fa/force-verify` — [authRoutes.js:429](../../../src/routes/authRoutes.js#L429)
   - `POST /api/auth/refresh` — [userController.refreshToken](../../../src/controllers/userController.js#L470)
   Each keeps returning `accessToken` (+ `expiresIn`) in the body; only
   `refreshToken` moves to the cookie.
3. **`/refresh` reads the token from `req.cookies.refresh_token` only.** If
   absent → `401` (client then routes to login). All existing behavior is
   preserved: server-side `jti`/session validation, and **refresh-token
   rotation** — rotation simply re-sets a fresh cookie each call.
4. **`/logout` clears the cookie** (`clearRefreshCookie`, matching name/path) in
   addition to the existing server-side session invalidation.

## Frontend changes

1. **Remove all `localStorage` handling of `refresh_token`**: the setter/getter
   in [auth-manager.js](../../../public/js/auth-manager.js#L303), the
   login-success store in [auth-pages.js:121](../../../public/js/auth-pages.js#L121),
   and any `removeItem('refresh_token')` in logout/cleanup paths.
2. **`api-client.refreshToken()`** → `POST /api/auth/refresh` with
   `credentials: 'include'` and **no body**; the browser attaches the cookie.
3. **Add `credentials: 'include'`** to the auth `fetch` calls that must receive
   or clear the cookie: login, verify-2fa, 2fa-force-verify, refresh, logout.
   (The raw `fetch`es in `auth-pages.js` need this explicitly; `api-client` can
   set it once in its `request()` wrapper.)
4. **Access token unchanged** — still `localStorage` + `Authorization: Bearer`.

## Password reset & email verification — coverage (audited)

These flows were audited explicitly. **None mint a session (none issue a refresh
token), so none need cookie handling.** They are "complete the action, then log
in" flows — the *subsequent* login is what mints the session and is already
covered above.

| Endpoint | Response | Tokens? |
|---|---|---|
| `POST /api/auth/password-reset` (code) | `{ ok: true }` ([authRoutes.js:554](../../../src/routes/authRoutes.js#L554)) | none |
| `POST /api/auth/password-reset/send-code` | `{ ok: true }` ([:583](../../../src/routes/authRoutes.js#L583)) | none |
| `POST /api/auth/reset-password` (admin link) | success ([:607](../../../src/routes/authRoutes.js#L607)) | none |
| `GET /api/auth/verify-email` | `{ ok: true, "…now log in" }` ([:701](../../../src/routes/authRoutes.js#L701)) | none |
| `POST /api/auth/resend-verification` | 200 | none |
| `POST /api/auth/parental-consent` | `{ ok: true }` | none |

Frontend: the password-reset and email-verify pages redirect to login on
success and never read/write `refresh_token`, so they need **no changes** (not
even `credentials: 'include'`).

**Verified property (strengthens the goal):** both password-reset paths already
call `sessionService.revokeAllSessions(userId)`
([completePasswordReset:979](../../../src/services/authenticationService.js#L979),
[verifyPasswordResetCode:1032](../../../src/services/authenticationService.js#L1032)).
So a password reset invalidates **every** existing refresh token/session
server-side — meaning a stolen refresh token is killed on reset. This is exactly
the "no persistent takeover" defense; it exists today and we will **add a test
to lock it in** rather than write new code.

**Intended consequence:** after this change, a user logged in on another device
keeps working only until their 15-minute access token expires; their next
cookie-based refresh returns 401 (session revoked) and routes them to login.
This is correct behavior.

## Deliberate security decisions

- **No CSRF tokens in Phase 1.** Every state-changing endpoint still
  authenticates via the Bearer **access token** (not a cookie), so it is
  inherently CSRF-immune. The only cookie-authed endpoint is `/refresh`,
  protected by `SameSite=Strict` + server-side `jti` validation, and it only
  re-mints the victim's *own* session (no attacker benefit). CSRF protection
  becomes **required in Phase 2**, when the access token moves to a cookie.
- **WebSocket auth unchanged** — still uses the access token; out of scope.

## Testing

**Automated (extend the existing auth suite):**
- `login` / `verify-2fa` / `2fa/force-verify` set a `refresh_token` cookie with
  `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, and omit `refreshToken` from
  the JSON body.
- `/refresh` succeeds using only the cookie; returns a new access token; 401s
  when the cookie is absent; **rotates** and re-sets the cookie.
- `/logout` clears the cookie.
- Password reset (both paths) revokes all sessions → a previously valid refresh
  token/cookie no longer refreshes (regression lock for the verified property).

**Manual:**
- Full login → confirm in DevTools the cookie is `HttpOnly`/`Secure`/
  `SameSite=Strict` and **not** visible in `document.cookie` or `localStorage`.
- Let the access token expire (~15 min) → confirm silent refresh via cookie.
- Logout → cookie gone. Password reset → other sessions can no longer refresh.

## Rollout

Clean cut. Deploy backend + frontend together. Active users re-login once on
their next refresh; no data migration, no transitional code. Requires HTTPS in
production for the `Secure` cookie (already the case on sag.live).

## Files touched (estimate)

- Backend: `app.js` (cookie-parser), `userController.js` (login, verify2FA,
  refreshToken, logout), `authRoutes.js` (`/2fa/force-verify`), one new small
  cookie helper.
- Frontend: `auth-manager.js`, `auth-pages.js`, `api-client.js`.
- Tests: auth integration suite.

## Out of scope (future phases)

- **Phase 2:** access token → `HttpOnly` cookie; `authMiddleware` reads cookie
  (header fallback for API clients); remove all `localStorage` token use; add
  CSRF tokens; WebSocket auth.
- **Phase 3:** remove `script-src 'unsafe-inline'` from the CSP (migrate inline
  scripts/handlers to files or nonces).
