# Silent Auction Gallery — Session Primer
**Last updated:** 2026-05-05
**Project path:** `c:\Users\Dean.SSCCBISHOP.000\OneDrive\projects\SAG2026\Silent-Auction-Gallery\`

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
| 6 | Frontend Development | Complete — auction-detail fully wired, labels page added |
| 7 | Notification System | Complete - email wired for outbid, won, artwork status, shipped |
| 8 | Admin Dashboard | Partial - fulfillment tab added; other sections backend complete |
| 9 | Deployment & Testing | Partial — Playwright installed; live test pending server redeploy + seed |
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
| QR  | Artwork QR labels + authenticated bidding UI fixes (6 bugs, ?artwork= param, labels page) |

---

## Test Suite Status

| Suites | Tests |
|--------|-------|
| 45 pass, 4 skipped | 650 pass |

No failures. The "force exiting Jest" warning is pre-existing (open handles in backend tests) and unrelated to the frontend unit tests.

---

## What Was Done Last Session (2026-05-05) — Bidding Fixes + Artwork Seeding

### Two Bidding Bug Fixes

#### Bug 1 — Cents/Dollars Mismatch in `src/services/biddingService.js`
Service was written expecting cents but `biddingRoutes.js` passes raw dollar amounts from the frontend. After the first bid, `currentBid + 100` (e.g. $50 + $100 = $150 minimum) blocked all subsequent bids.

**Fixed 4 locations:**
- Line ~62: `minimumBid = currentBid + 100` → `currentBid + 10` ($10 minimum increment)
- Line ~65: error message removed `/100` divisions (`.toFixed(2)` on dollar value directly)
- Line ~70: reserve price error message removed `/100` division
- Line ~133: `newBidDollars: bidAmount / 100` → `bidAmount`
- Line ~145: success message removed `/100` division

**Currency convention (non-obvious, do not revert):** DB stores DECIMAL(10,2) dollars. `biddingRoutes.js` passes `bidAmount` as dollars directly. Do NOT divide by 100 anywhere in biddingService.

#### Bug 2 — Client-Side Min-Bid Guard in `public/js/auction-detail.js` `submitBid()`
`this.auction.currentBid` is always undefined — `this.auction` is the auction object, not the current artwork piece. Min-bid guard was always 0 + 10 = $10, never updating.

**Fixed:**
```js
// Before:
const currentBid = this.auction.currentBid ?? 0;
const minBid = currentBid + (this.auction.minBidIncrement || 10);
// After:
const currentBid = this.currentPiece?.currentBid ?? 0;
const minBid = currentBid + 10;
```

**Updated test** in `tests/unit/services/biddingService.test.js` "should reject bid that is below minimum increment": old values were cents (`bidAmount: 40050`, `current_bid: 40000`). Updated to dollar values (`bidAmount: 55`, `current_bid: 50`) so `55 < 50+10=60` correctly triggers rejection.

---

### Artwork Images + Seed Script

**6 JPGs added** to `public/images/auction-items/` (copied from `C:\Users\Dean.SSCCBISHOP.000\OneDrive\Artwork\`):

| Filename | Title | Medium | Dimensions | Starting Bid |
|----------|-------|--------|------------|--------------|
| BeachRooster.jpg | Beach Rooster | Watercolor | 20×28cm | $5 |
| BurgerCat.jpg | Burger Cat | Acrylic on Board | 30×30cm | $5 |
| RainbowSky.jpg | Rainbow Sky | Acrylic on Canvas | 30×30cm | $8 |
| Roostertude.jpg | Roostertude | Acrylic and Marker | 38×28cm | $8 |
| UGASmiling.jpg | UGA Smiling | Acrylic on Canvas | 40×32cm | $10 |
| SeaLife.jpg | Sea Life | Watercolor and Ink | 38×50cm | $15 |

**`db/seeds/seed-artwork.js`** — new Node.js seed script:
- Reads `DATABASE_*` env vars (same as main app)
- Finds teacher account by `TEACHER_EMAIL` env var (default: `dean.ed.warren@gmail.com`)
- Finds most recent non-ended auction for that school, or creates a new LIVE auction (7-day window)
- Inserts artwork as APPROVED with `image_url: /images/auction-items/<filename>`
- Idempotent: skips pieces whose title already exists in the target auction

**To run on production server:**
```bash
docker exec sag-app-prod node db/seeds/seed-artwork.js
```
Port 5432 is NOT exposed publicly in `docker-compose.prod.yml` — must run inside the container.

---

### Browse Auctions Button Fix (`public/index.html` line 94)

`<button class="btn btn-large" id="browse-auctions-btn">Browse Auctions</button>` had no JS handler and no href — clicked nothing. Converted to an anchor:
```html
<a href="/auctions.html" class="btn btn-large" id="browse-auctions-btn">Browse Auctions</a>
```

---

### Live Testing Setup (SAG-Live_MCP)

SAG-Live_MCP is a Python-based Playwright MCP (not Node). Ran `python -m playwright install chromium` from `SAG-Live_MCP/` (172MB Chrome + 108MB Headless Shell). Playwright is now installed and ready.

**Pending live test workflow (once server is redeployed):**
1. `docker exec sag-app-prod node db/seeds/seed-artwork.js`
2. Login as teacher → verify 6 artwork pieces appear
3. Login as bidder → place bid on artwork
4. Login as second bidder → outbid, verify outbid banner and email notification
5. Verify bid history, min-increment enforcement, and auction-detail UI

---

## What Was Done Session 2026-05-04 — Artwork QR Labels + Bidding UI Fixes

### 6 Bidding Fixes in `public/js/auction-detail.js`

1. **`checkLoginStatus()` respects auction status** — now only shows `#bidding-form-container` when `auction.status === 'LIVE'` and `endTime > now`.
2. **`loadBidHistory()` uses per-artwork endpoint** — calls `GET /api/bidding/artwork/:artworkId/history` (BIDDER role compatible, no school restriction).
3. **Min-bid hint is correct** — `displayArtworkPiece()` computes `piece.currentBid + 10`. Removed stale block in `updateBidInfo()`.
4. **Form submit event** — `attachEventListeners()` listens to `form.addEventListener('submit', ...)`. Enter-key submit now works.
5. **Leading-bidder banner** — `#leading-bidder-banner` (green, `role="status"`, `aria-live="polite"`) shows after successful bid. Hidden by: outbid WebSocket, auction end.
6. **Payment method removed** — `#payment-method` select removed; replaced with `<p class="bid-note">` explaining payment at checkout.

### `?artwork=` QR Deep-Link

Constructor reads `this.focusArtworkId` from URL. `_focusArtwork()` selects piece, activates thumbnail, scrolls form into view, shows enhanced auth wall for visitors. Both `loadArtwork()` and `_loadPublicPreview()` call `_focusArtwork()` after `renderArtworkGallery()`.

### Enhanced Auth Wall

`_renderEnhancedAuthWall(artwork)`: artwork image + title + artist + starting price + Login/Register CTAs. Only rendered when `focusArtworkId` is set AND visitor. `returnTo` encodes full path including `?id=...&artwork=...`.

### New Files (2026-05-04)

- `public/auction-labels.html` — printable label page (auth-gated: TEACHER, SCHOOL_ADMIN, SITE_ADMIN)
- `public/css/auction-labels.css` — `.labels-grid`, `.label-card`, `@media print` (letter size, 0.5in margins)
- `public/js/auction-labels.js` — `AuctionLabels` class: auth check, parallel fetch, `renderLabel()`, `generateQRCodes()`
- `tests/integration/routes/artworkQrBiddingTest.spec.js` — 15 frontend unit tests (`@jest-environment jsdom`)
- `package.json`: added `jest-environment-jsdom@29`

---

## What Was Done Session 2026-04-12

### G16 — BIDDER Role Onboarding

- `src/controllers/userController.js`: `accountType === 'bidder'` branch creates BIDDER role user, skips COPPA/DOB/schoolId
- `public/bidder-welcome.html`: hero + 3-step explainer + CTA → `/register.html?role=BIDDER`
- `public/register.html`: `#role-chooser`, `#role-mode-input`, `#dob-group`, `#school-fields-group`, `#age-confirmation-group`
- `public/js/auth-pages.js`: `_applyBidderMode()`, `?role=BIDDER` detection, isBidderMode flow
- Nav link "For Bidders" added to: `index.html`, `auctions.html`, `login.html`, `register.html`, `auction-detail.html`

### G15 — Visitor Auth Wall

- `GET /api/auctions/:auctionId/public` (no auth) — safe projection, no bidder identities
- `public/js/auction-detail.js`: visitors call `_loadPublicPreview()`, sets `this.isVisitor = true`
- `returnTo` validation: `/^\/[^/\\]/` — rejects `//evil.com` and backslash bypasses

### G19 — Concurrent Session Limiting

- `db/migrations/20260412130000_add_session_last_used.up.sql`: adds `last_used_at` to `user_sessions`
- `SessionService.createSession`: PG subquery pattern for eviction (ORDER BY LIMIT invalid in PG UPDATE)

### G13 — Email Notifications

- `src/services/notificationService.js`: `createEmailProvider()` (SMTP prod / jsonTransport dev), `getSharedEmailProvider()` (lazy singleton), `notifyOutbid`, `notifyAuctionWon`, `notifyArtworkStatusChanged`, `notifyArtworkShipped`
- Callers wrap in `setImmediate()` to not block HTTP response

### G14 — Artwork Fulfillment Loop

- `db/migrations/20260412140000_add_fulfillment_columns.up.sql`: adds `shipped_at`, `tracking_carrier`, `tracking_number`, `delivered_at`, `fulfillment_notes` to `bids`
- `PATCH /api/admin/wins/:id/fulfillment`: dynamic SET clause, school enforcement, fires `notifyArtworkShipped`

---

## Critical Architecture Notes

### Currency Convention (CRITICAL)

**DB stores DECIMAL(10,2) dollars. All bid amounts are dollars throughout.**
- `biddingRoutes.js` passes raw dollar `bidAmount` from request body to `biddingService.placeBid()`
- `biddingService.js` works in dollars — do NOT divide by 100, do NOT add 100 for increment (add 10)
- `UIComponents.formatCurrency(n)` expects dollars
- Minimum bid increment: **$10**

### Email Transport Architecture

```
createEmailProvider()
  → NODE_ENV=production: SMTP via nodemailer (requires SMTP_HOST)
  → otherwise: jsonTransport (logs to stdout, no real SMTP)

getSharedEmailProvider() → lazy singleton
```

### JWT Token Shapes

**Access token:** `{ sub, email, role, schoolId, twoFaEnabled, jti, iat, exp, iss, aud }`
**Refresh token:** `{ sub, jti, type: 'refresh', iat, exp, iss, aud }`
**Special:** `purpose: '2fa_force_setup'` or `purpose: '2fa_challenge'`

### Session Tracking

- Only `token_type = 'REFRESH'` rows count toward MAX_SESSIONS_PER_USER
- `checkSession` is fail-open: missing row = legacy token = allow
- `SessionService.createSession` uses PG subquery pattern for eviction

### Admin 2FA Flow

```
POST /api/auth/login (admin, no 2FA)
  → 200 { requiresTwoFactorSetup: true, setupToken, userId }
POST /api/auth/2fa/force-setup → { qrCodeUrl, secret, backupCodes }
POST /api/auth/2fa/force-verify → { accessToken, refreshToken, user }
```

### Middleware Chain for Admin Routes

```
verifyToken → requireAdmin2fa → verifyRole([...]) → handler
```

### TokenBlacklist / Pool in Tests

- `pool` is `null` in test mode unless mocked
- **Mock query order:** `tokenBlacklist.isRevoked` fires BEFORE handler queries — put mock FIRST
- **`jti` required in test tokens:** Without `jti`, `isRevoked` returns early without calling `pool.query`

### Frontend Unit Test Pattern (jest-environment-jsdom)

- `@jest-environment jsdom` docblock
- `Object.create(ClassName.prototype)` — no constructor
- All `globalThis` stubs set BEFORE `require()`
- `jest-environment-jsdom` must match jest major version (both `@29`)

### Schema Column Naming (key pitfalls)

- `users.account_status` (not `status`)
- `auctions.auction_status`, `starts_at`/`ends_at`, `created_by_user_id`
- `bids.bid_status`, `bid_amount`, `placed_by_user_id`, `placed_at`
- `artwork.artwork_status`, `starting_bid_amount`, `reserve_bid_amount`, `created_by_user_id`
- Status values are UPPERCASE: ACTIVE, DRAFT, LIVE, ENDED, CANCELLED, OUTBID, ACCEPTED

### Bidding API — Key Endpoints

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/auctions/:id/public` | None | Visitor preview — safe projection, no bidder identities |
| `GET /api/auctions/:id/artwork` | Required | Returns artwork with `currentBid`, `startingPrice` in dollars |
| `GET /api/bidding/artwork/:artworkId/history` | Optional | Per-artwork bid history — no school restriction, works for BIDDER |
| `POST /api/bidding/place` | Required | Body: `{ artworkId, bidAmount }` — dollars, not cents |

---

## Key File Map

| File | Role |
|------|------|
| `src/services/notificationService.js` | Email templates, EmailProvider, notification functions |
| `src/services/biddingService.js` | Bid placement — dollars throughout, $10 minimum increment |
| `src/services/auctionService.js` | Auction lifecycle with winner notification |
| `src/controllers/teacherController.js` | Artwork approve/reject with status notifications |
| `src/services/authenticationService.js` | JWTService, TwoFactorService, RBACService, SessionService, TokenBlacklistService |
| `src/controllers/userController.js` | Login, logout, register, 2FA verify, refresh, password, profile |
| `src/middleware/authMiddleware.js` | verifyToken, optionalVerifyToken, requireAdmin2fa, verifyRole |
| `src/routes/authRoutes.js` | /api/auth/* including /2fa/force-setup and /2fa/force-verify |
| `src/routes/userRoutes.js` | /api/user/* including /sessions endpoints and /wins with fulfillment fields |
| `src/routes/adminRoutes.js` | /api/admin/* including /wins (fulfillment list) and /wins/:id/fulfillment (PATCH) |
| `src/routes/teacherRoutes.js` | /api/teacher/* artwork approve/reject |
| `public/auction-detail.html` | Auction detail page — no payment-method select, has leading-bidder-banner, bid-history-container is `<ul>` |
| `public/js/auction-detail.js` | AuctionDetail class — all bidding logic, WebSocket, QR deep-link, auth wall |
| `public/auction-labels.html` | Printable label page — auth-gated (TEACHER/SCHOOL_ADMIN/SITE_ADMIN) |
| `public/css/auction-labels.css` | Label card layout + @media print stylesheet |
| `public/js/auction-labels.js` | AuctionLabels class — fetch, render, QR generation |
| `public/images/auction-items/` | 6 student artwork JPGs: BeachRooster, BurgerCat, RainbowSky, Roostertude, SeaLife, UGASmiling |
| `db/seeds/seed-artwork.js` | Idempotent artwork seed — run via `docker exec sag-app-prod node db/seeds/seed-artwork.js` |
| `public/index.html` | Home page — Browse Auctions is `<a href="/auctions.html">`, not a button |
| `public/force-2fa-setup.html` | Forced admin 2FA setup UI |
| `public/user-dashboard.html` | User dashboard with sessions management in Account tab |
| `public/admin-dashboard.html` | Admin dashboard with Fulfillment tab |
| `public/js/user-dashboard.js` | User dashboard JS including wins/fulfillment display |
| `public/bidder-welcome.html` | BIDDER role landing page |
| `db/migrations/` | All schema migrations |
| `tests/integration/routes/` | Integration tests (mock DB) |
| `tests/integration/routes/artworkQrBiddingTest.spec.js` | 15 frontend unit tests for QR/bidding feature |
| `tests/helpers/createTestApp.js` | Creates Express app with mockDb |
| `tests/helpers/mockDb.js` | jest.fn() mock for injected db |
