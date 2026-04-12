# Silent Auction Gallery — Session Primer
**Last updated:** 2026-04-12
**Project path:** `c:\Users\dwarren\OneDrive\projects\SAG2026\Silent-Auction-Gallery\`

---

## What This Project Is
A production-grade, PCI-DSS / WCAG 2.1 AA compliant school-based charity art auction platform.
Stack: Node.js + Express, PostgreSQL, Vanilla HTML/CSS/JS, WebSocket.
Start date: 2026-01-26 | Target: Q2 2026

---

## Current Project Status

| Section | Name | Status |
|---------|------|--------|
| 1 | Database Schema | Complete |
| 2 | Core Models & Services | Complete |
| 3 | Authentication & Authorization | Complete |
| 4 | Payment Processing | Complete |
| 5 | Auction Management API | Complete |
| 6 | Frontend Development | Partial - auctions list wired, detail/teacher stubs remain |
| 7 | Notification System | Complete - email wired for outbid, won, artwork status |
| 8 | Admin Dashboard | Partial - HTML/CSS/JS exists, backend incomplete |
| 9 | Deployment & Testing | Pending |
| 10 | Data Migration | Pending |
| 11 | Security Audit | Partial - G1–G17, G19, G13 applied |
| 12 | UI/UX Testing | Pending |
| 13 | API Documentation | Pending |
| 14 | Monitoring & Logging | Pending |

---

## Grading Fixes Completed (Prompt Series)

| Fix | Description |
|-----|-------------|
| G7  | GET /api/admin/auctions/search |
| G8  | GET /api/admin/reports summary endpoint |
| G9  | Replace PaymentController(null) with NullPaymentService stub |
| G10 | Checkout page + payment UI end-to-end |
| G11 | Require email verification before login |
| G12 | COPPA parental consent flow |
| G13 | Wire email notifications (outbid, auction won, artwork status) |
| G17 | Mandatory 2FA for admin accounts |
| G19 | Concurrent session limiting (MAX_SESSIONS_PER_USER) |

---

## What Was Done This Session (2026-04-12)

### G13 — Email Notifications Not Wired

**Goal:** Wire `notificationService` into the bid placement, auction close, and artwork approval flows so users actually receive emails.

---

#### `src/services/notificationService.js` changes

**New template** — `EmailTemplateService.artworkStatusChangedTemplate(data)`:
- Takes `{ firstName, artworkTitle, newStatus, reason }`
- Renders a distinct "approved" vs "not approved" email
- Registered in `generateTemplate` as `'artwork-status-changed'`

**New `provider: 'json'` transport** in `EmailProvider.initializeTransporter()`:
- Uses `nodemailer.createTransport({ jsonTransport: true })`
- Logs `[Email dev transport] to=... subject=...` to stdout
- Used automatically in dev/test so no SMTP server is required

**`EmailProvider.send()` updated** to log when using json transport.

**New exports at the bottom of the file:**

```js
// createEmailProvider() — factory from env vars
// - Production: requires SMTP_HOST (throws if missing), uses SMTP_PORT/USER/PASS/FROM
// - Dev/test: json transport (no real SMTP)
createEmailProvider()

// getSharedEmailProvider() — lazy singleton used by services
getSharedEmailProvider()

// Standalone notification functions (each checks prefs, fail-open)
notifyOutbid(emailProvider, db, { userId, email, firstName, artworkTitle, newBidDollars, auctionEndsAt })
notifyAuctionWon(emailProvider, db, { userId, email, firstName, artworkTitle, winningBidDollars })
notifyArtworkStatusChanged(emailProvider, db, { userId, email, firstName, artworkTitle, newStatus, reason })
```

**`_checkEmailPref(db, userId, prefKey)`** — internal helper; queries `notification_preferences`; fails open (returns true) on DB error or missing row. Preference keys: `email_outbid`, `email_winner`, `email_artwork_status`.

---

#### `src/services/biddingService.js` changes

- Imports `{ getSharedEmailProvider, notifyOutbid }` from notificationService
- `placeBid()` UPDATE now uses `RETURNING placed_by_user_id` (safe: `?.` on `.rows`)
- After commit: if previous bidder exists and is not the new bidder, fetch their user row and fire:
  ```js
  setImmediate(() => notifyOutbid(getSharedEmailProvider(), pool, {...}).catch(...))
  ```
- Non-blocking: response is already sent before `setImmediate` fires

---

#### `src/services/auctionService.js` changes

- Imports `{ getSharedEmailProvider, notifyAuctionWon }` from notificationService
- `endAuction()` after commit: iterates `winners` array, fetches each user by id, fires:
  ```js
  setImmediate(async () => {
    for (const winner of winners) { await notifyAuctionWon(...) }
  })
  ```
- Non-blocking; each individual winner error is caught and logged without stopping others

---

#### `src/controllers/teacherController.js` changes

- Adds `{ getSharedEmailProvider, notifyArtworkStatusChanged }` to existing import
- `approveSubmission()`: after successful UPDATE, fires:
  ```js
  setImmediate(async () => {
    // SELECT artwork.title, user.id/email/first_name WHERE artwork.id = $1
    await notifyArtworkStatusChanged(..., { newStatus: 'APPROVED', reason: null })
  })
  ```
- `rejectSubmission()`: same, `{ newStatus: 'REJECTED', reason: rejection_reason }`
- Both use the pool from `models/index` (same pool as the rest of teacherController)

---

#### Tests: `tests/integration/routes/emailNotificationsIntegrationTest.spec.js` — 12 tests

Key patterns:
- `jest.mock('nodemailer', ...)` with `mockSendMail = jest.fn()` captures all `sendMail` calls
- `jest.mock('../../../src/models/index', ...)` provides `mockPool` for tokenBlacklist + teacher pool queries
- Notification function tests: create `new EmailProvider({ provider: 'json' })` and a custom db stub
- Teacher route tests: mock `mockPool.query` in sequence: isRevoked → _resolveSchoolId → UPDATE → (notification)
- Preference disabled: mock db returns `{ rows: [{ email_outbid: false }] }` → `sendMail` NOT called
- Fail-open test: db.query throws → `sendMail` IS called anyway

---

## Test Suite Status

| Suites | Tests |
|--------|-------|
| 42 pass, 4 skipped | 612 pass |

No failures. The pre-existing `owasp-top-10.test.js` ETIMEDOUT resolved this session.

---

## Critical Architecture Notes

### Email Transport Architecture

```
createEmailProvider()
  → NODE_ENV=production: SMTP via nodemailer (requires SMTP_HOST)
  → otherwise: jsonTransport (logs to stdout)

getSharedEmailProvider()
  → lazy singleton, created on first call
  → used by biddingService, auctionService, teacherController

notifyXxx(emailProvider, db, data)
  → checks notification_preferences.email_xxx (fail-open)
  → calls emailProvider.send(to, subject, html, text)
  → caller wraps in setImmediate() to not block HTTP response
```

### Notification Preference Keys (notification_preferences table)

| Event | DB Column |
|-------|-----------|
| Outbid alert | `email_outbid` |
| Auction won | `email_winner` |
| Artwork status changed | `email_artwork_status` |

Default: enabled (true) if no preferences row exists.

### Where Notifications Fire

| Event | Source file | Trigger point |
|-------|-------------|---------------|
| Outbid | `src/services/biddingService.js` | After `placeBid` COMMIT |
| Auction won | `src/services/auctionService.js` | After `endAuction` COMMIT |
| Artwork approved | `src/controllers/teacherController.js` | After `approveSubmission` UPDATE |
| Artwork rejected | `src/controllers/teacherController.js` | After `rejectSubmission` UPDATE |

---

### JWT Token Shapes

**Access token payload:**
```json
{
  "sub": "uuid",
  "email": "...",
  "role": "SITE_ADMIN",
  "schoolId": "uuid|null",
  "twoFaEnabled": true,
  "jti": "uuid",
  "iat": 1234, "exp": 1234,
  "iss": "silent-auction-gallery",
  "aud": "silent-auction-users"
}
```

**Refresh token payload:**
```json
{
  "sub": "uuid",
  "jti": "uuid",
  "type": "refresh",
  "iat": 1234, "exp": 1234,
  "iss": "silent-auction-gallery",
  "aud": "silent-auction-users"
}
```

**Special-purpose tokens:** `purpose: '2fa_force_setup'` or `purpose: '2fa_challenge'`
- Verified with `jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] })` NOT `jwtService.verifyAccessToken` (which enforces issuer/audience)

### Session Tracking (user_sessions table)

- Only `token_type = 'REFRESH'` rows count toward MAX_SESSIONS_PER_USER
- `checkSession` is fail-open: missing row = legacy token = allow
- `last_used_at` updated non-blocking on every token refresh
- `SessionService.createSession` uses PG subquery pattern for eviction (ORDER BY LIMIT in UPDATE is invalid PG)

### Admin 2FA Flow

```
POST /api/auth/login (admin, no 2FA)
  → 200 { requiresTwoFactorSetup: true, setupToken, userId }

POST /api/auth/2fa/force-setup (body: { setupToken })
  → 200 { qrCodeUrl, secret, backupCodes }

POST /api/auth/2fa/force-verify (body: { setupToken, code })
  → 200 { accessToken, refreshToken, user }
```

Frontend stores `force_2fa_setup_token` in `sessionStorage`, redirects to `/force-2fa-setup.html`.

### Middleware Chain for Admin Routes

```
verifyToken → requireAdmin2fa → verifyRole([...]) → handler
```

`requireAdmin2fa` returns 403 `admin_2fa_required` if `req.user.role` is admin but `req.user.twoFaEnabled` is falsy.

### TokenBlacklist / Pool in Tests

- `TokenBlacklistService` lazily loads `pool` from `require('../models/index').pool`
- `pool` is `null` in test mode (`NODE_ENV=test`) unless mocked
- Admin route tests and teacher route tests that need `pool.query` mocked must use:
  ```js
  jest.mock('../../../src/models/index', () => ({
    ...jest.requireActual('../../../src/models/index'),
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  }));
  const { pool: mockPool } = require('../../../src/models/index');
  ```
- **Mock query order matters:** `tokenBlacklist.isRevoked` (in `verifyToken`) fires BEFORE handler queries — put its mock FIRST in `mockPool.query` sequence

### Routes Architecture

| Route module | Factory? | DB source |
|---|---|---|
| `authRoutes(db)` | Yes | injected `db` (mockDb in tests) |
| `userRoutes(db)` | Yes | injected `db` + pool via SessionService |
| `adminRoutes` | No | lazy pool from `models/index` |
| `teacherRoutes` | No | pool from `models/index` |

### Schema Column Naming (key pitfalls)

- `users.account_status` (not `status`)
- `auctions.auction_status`, `starts_at`/`ends_at`, `created_by_user_id`
- `bids.bid_status`, `bid_amount`, `placed_by_user_id`, `placed_at`
- `artwork.artwork_status`, `starting_bid_amount`, `reserve_bid_amount`, `created_by_user_id`
- `transactions` table (not `payments`): `transaction_status`, `hammer_amount`, `buyer_user_id`
- Status values are UPPERCASE: ACTIVE, DRAFT, LIVE, ENDED, CANCELLED, OUTBID, ACCEPTED

---

## Key File Map

| File | Role |
|------|------|
| `src/services/notificationService.js` | Email templates, EmailProvider, notification functions, createEmailProvider |
| `src/services/biddingService.js` | Bid placement with outbid notification |
| `src/services/auctionService.js` | Auction lifecycle with winner notification |
| `src/controllers/teacherController.js` | Artwork approve/reject with status notifications |
| `src/services/authenticationService.js` | JWTService, TwoFactorService, RBACService, SessionService, AuthenticationService, TokenBlacklistService |
| `src/controllers/userController.js` | Login, logout, register, 2FA verify, refresh, password, profile |
| `src/middleware/authMiddleware.js` | verifyToken, optionalVerifyToken, requireAdmin2fa, verifyRole |
| `src/routes/authRoutes.js` | /api/auth/* including /2fa/force-setup and /2fa/force-verify |
| `src/routes/userRoutes.js` | /api/user/* including /sessions endpoints |
| `src/routes/adminRoutes.js` | /api/admin/* including /users/:id/sessions force-logout |
| `public/force-2fa-setup.html` | Forced admin 2FA setup UI |
| `public/user-dashboard.html` | User dashboard with sessions management in Account tab |
| `db/migrations/` | All schema migrations |
| `tests/integration/routes/` | Integration tests (mock DB) |
| `tests/helpers/createTestApp.js` | Creates Express app with mockDb |
| `tests/helpers/mockDb.js` | jest.fn() mock for injected db |
