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
| 7 | Notification System | Complete - email wired for outbid, won, artwork status, shipped |
| 8 | Admin Dashboard | Partial - fulfillment tab added; other sections backend complete |
| 9 | Deployment & Testing | Pending |
| 10 | Data Migration | Pending |
| 11 | Security Audit | Partial - G1–G17, G19, G13–G16 applied |
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
| G14 | Artwork fulfillment loop (shipped/tracking/delivered) |
| G15 | Visitor auth wall on auction detail page (public preview + returnTo login) |
| G16 | BIDDER role onboarding (bidder-welcome.html, register BIDDER path, nav link) |
| G18 | Delete empty bidRoutes.js dead file |
| G17 | Mandatory 2FA for admin accounts |
| G19 | Concurrent session limiting (MAX_SESSIONS_PER_USER) |

---

## Test Suite Status

| Suites | Tests |
|--------|-------|
| 44 pass, 4 skipped | 635 pass |

No failures.

---

## What Was Done Last Session (2026-04-12) — continued

### G16 — BIDDER Role Onboarding

**Backend — `src/controllers/userController.js`:**
- Added `accountType === 'bidder'` branch: creates BIDDER role user, skips COPPA/DOB/schoolId requirements, still sends verification email

**New page — `public/bidder-welcome.html`:**
- Hero: "Support student artists. Bid on art that matters."
- 3-step explainer: Browse → Bid → Pay
- Can/cannot do cards
- Primary CTA → `/register.html?role=BIDDER`
- "For Bidders" nav link active on this page

**`public/register.html` changes:**
- Added `#role-mode-input` hidden input (value: `student` or `bidder`)
- Added `#role-chooser` two-card section (Student/Teacher vs Parent/Collector) — shown when no `?role=` param
- Added `id="dob-group"` wrapper on DOB field group
- Added `id="school-fields-group"` wrapper around school search + school select
- Added `id="age-confirmation-group"` with 18+ checkbox (hidden by default, shown for BIDDER)
- Added `id="step1-heading"` and `id="step1-subtitle"` for dynamic copy update

**`public/js/auth-pages.js` changes:**
- `initRegister()` reads `?role=BIDDER` (case-insensitive); if present calls `_applyBidderMode()` directly
- Shows `#role-chooser` for neutral flow; "Parent/Collector" card calls `_applyBidderMode()`
- `_applyBidderMode(form)`: hides school/DOB groups, removes required attrs, shows age-confirmation checkbox, updates heading/subtitle, sets `this.isBidderMode = true`
- `validateRegisterStep()`: when `isBidderMode`, requires age-confirmation checkbox instead of DOB + school
- `submitRegister()`: when `isBidderMode`, sets `accountType: 'bidder'`, omits `dateOfBirth` and `schoolId`

**Nav link added to:** `index.html`, `auctions.html`, `login.html`, `register.html`, `auction-detail.html`

**Tests — `tests/integration/routes/bidderRegistrationIntegrationTest.spec.js` (12 tests):**
- Backend: BIDDER creates 201, no schoolId required, no DOB required, missing fields → 400, duplicate → 409, student still works
- Frontend unit: `?role=BIDDER` detection (case-insensitive), hidden fields list, required fields list

---

### G15 — Visitor Auth Wall on Auction Detail Page

**Problem:** Unauthenticated visitors clicking an auction tile saw a blank page (silent 401).

**Solution:** Option A — public read-only preview.

- `src/routes/auctionRoutes.js` — added `GET /api/auctions/:auctionId/public` (no auth) before `/:auctionId`
- `src/controllers/auctionController.js` — added `getAuctionPublic()`: queries auction + approved artworks, returns safe projection (no bidder identities, no bid history, current high bid only)
- `public/js/auction-detail.js` — `loadAuction()` branches on token presence; visitors call `_loadPublicPreview()` which uses the public endpoint, sets `this.isVisitor = true`, renders auction + first artwork, shows "Log in to see bid history" placeholder. Login/register buttons include `?returnTo=<currentPath>`
- `public/auction-detail.html` — `#auth-required` banner now has both "Log in" and "create a free account" buttons
- `public/js/auth-pages.js` — after successful login, reads `?returnTo`, validates it's a same-origin path (`/^\/[^/\\]/`), redirects there; falls back to dashboard otherwise

**Security note:** `returnTo` validation uses `/^\/[^/\\]/` — rejects `//evil.com` (double-slash protocol-relative), `\/evil.com` (backslash bypass), and anything without a leading `/`.

---

## What Was Done Earlier Last Session (2026-04-12)

### G19 — Concurrent Session Limiting

- `db/migrations/20260412130000_add_session_last_used.up.sql` — adds `last_used_at` to `user_sessions`
- `src/routes/userRoutes.js` — fixed `authenticationService` undefined (now builds `authService` object properly)
- `src/routes/userRoutes.js` — fixed stray `authenticationService.tokenBlacklist.revoke` → `tokenBlacklist.revoke`
- `public/user-dashboard.html` — sessions management UI in Account tab (list, per-session revoke, sign out all others)
- `tests/integration/routes/sessionLimitingIntegrationTest.spec.js` — 14 tests covering eviction, refresh revocation, admin force-logout

### G13 — Email Notifications Not Wired

- `src/services/notificationService.js` — added `provider: 'json'` transport, `artworkStatusChangedTemplate`, `createEmailProvider()`, `getSharedEmailProvider()`, `notifyOutbid`, `notifyAuctionWon`, `notifyArtworkStatusChanged`, `_checkEmailPref`
- `src/services/biddingService.js` — fires `notifyOutbid` via `setImmediate` after `placeBid` commit
- `src/services/auctionService.js` — fires `notifyAuctionWon` via `setImmediate` after `endAuction` commit
- `src/controllers/teacherController.js` — fires `notifyArtworkStatusChanged` via `setImmediate` after approve/reject
- `tests/integration/routes/emailNotificationsIntegrationTest.spec.js` — 12 tests

### G14 — Artwork Delivery / Fulfillment Loop

- `db/migrations/20260412140000_add_fulfillment_columns.up.sql` — adds `shipped_at`, `tracking_carrier`, `tracking_number`, `delivered_at`, `fulfillment_notes` to `bids`
- `src/routes/adminRoutes.js` — `GET /api/admin/wins` (unshipped wins list, school-scoped) and `PATCH /api/admin/wins/:id/fulfillment` (dynamic SET, school enforcement, 2FA required, fires `notifyArtworkShipped`)
- `src/routes/userRoutes.js` — `GET /api/user/wins` returns real fulfillment columns instead of `FALSE AS shipped`
- `src/services/notificationService.js` — `artworkShippedTemplate` + `notifyArtworkShipped` (uses `email_winner` pref)
- `public/admin-dashboard.html` — Fulfillment tab with wins table, tracking inputs, Mark Shipped / Mark Delivered buttons
- `public/js/user-dashboard.js` — `displayWins` shows three states: delivered / shipped (with carrier+tracking) / awaiting shipment
- `tests/integration/routes/fulfillmentIntegrationTest.spec.js` — 11 tests

**Key bug found & fixed:** `makeToken()` in fulfillment tests omitted `jti` claim, so `tokenBlacklist.isRevoked` short-circuited without calling `pool.query`. The bid SELECT consumed mock #1 (empty rows) instead of mock #2 (bid row), causing spurious 404s. Fix: added `jti: uuidv4()` to `makeToken()`.

---

## Critical Architecture Notes

### Email Transport Architecture

```
createEmailProvider()
  → NODE_ENV=production: SMTP via nodemailer (requires SMTP_HOST)
  → otherwise: jsonTransport (logs to stdout, no real SMTP)

getSharedEmailProvider()
  → lazy singleton, created on first call
  → used by biddingService, auctionService, teacherController, adminRoutes

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
| Artwork shipped | `email_winner` |

Default: enabled (true) if no preferences row exists.

### Where Notifications Fire

| Event | Source file | Trigger point |
|-------|-------------|---------------|
| Outbid | `src/services/biddingService.js` | After `placeBid` COMMIT |
| Auction won | `src/services/auctionService.js` | After `endAuction` COMMIT |
| Artwork approved | `src/controllers/teacherController.js` | After `approveSubmission` UPDATE |
| Artwork rejected | `src/controllers/teacherController.js` | After `rejectSubmission` UPDATE |
| Artwork shipped | `src/routes/adminRoutes.js` | After fulfillment PATCH UPDATE |

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

### Fulfillment Endpoint

`PATCH /api/admin/wins/:id/fulfillment`
- Requires `verifyToken → requireAdmin2fa → verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN'])`
- SCHOOL_ADMIN blocked if `bid.school_id !== req.user.schoolId` → 403 `Access denied: not your school`
- Dynamic SET clause: only updates fields present in request body
- Returns 400 if no recognizable fields provided
- Fires `notifyArtworkShipped` via setImmediate when `shipped === true && !bid.shipped_at`

### TokenBlacklist / Pool in Tests

- `TokenBlacklistService` lazily loads `pool` from `require('../models/index').pool`
- `pool` is `null` in test mode (`NODE_ENV=test`) unless mocked
- Admin route tests and teacher route tests must mock pool:
  ```js
  jest.mock('../../../src/models/index', () => ({
    ...jest.requireActual('../../../src/models/index'),
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  }));
  const { pool: mockPool } = require('../../../src/models/index');
  ```
- **Mock query order matters:** `tokenBlacklist.isRevoked` (in `verifyToken`) fires BEFORE handler queries — put its mock FIRST
- **`jti` required in test tokens:** Without `jti`, `isRevoked` returns early without calling pool.query, shifting all subsequent mocks by one position

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
- `bids` fulfillment columns: `shipped_at`, `tracking_carrier`, `tracking_number`, `delivered_at`, `fulfillment_notes`
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
| `src/routes/userRoutes.js` | /api/user/* including /sessions endpoints and /wins with fulfillment fields |
| `src/routes/adminRoutes.js` | /api/admin/* including /wins (fulfillment list) and /wins/:id/fulfillment (PATCH) |
| `src/routes/teacherRoutes.js` | /api/teacher/* artwork approve/reject |
| `public/force-2fa-setup.html` | Forced admin 2FA setup UI |
| `public/user-dashboard.html` | User dashboard with sessions management in Account tab |
| `public/admin-dashboard.html` | Admin dashboard with Fulfillment tab |
| `public/js/user-dashboard.js` | User dashboard JS including wins/fulfillment display |
| `db/migrations/` | All schema migrations |
| `tests/integration/routes/` | Integration tests (mock DB) |
| `tests/helpers/createTestApp.js` | Creates Express app with mockDb |
| `tests/helpers/mockDb.js` | jest.fn() mock for injected db |
