# Silent Auction Gallery — Session Primer
**Last updated:** 2026-06-12
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
| 4 | Payment Processing | Complete — PayPal gateway wired end-to-end |
| 5 | Auction Management API | Complete |
| 6 | Frontend Development | Complete — responsive layout, lightbox, card preview overlay, QR print labels |
| 7 | Notification System | Complete — email wired for outbid, won, artwork status, shipped |
| 8 | Admin Dashboard | Partial — fulfillment tab added; other sections backend complete |
| 9 | Deployment & Testing | Partial — Playwright installed; live test pending server redeploy + seed |
| 10 | Data Migration | Pending |
| 11 | Security Audit | Partial — G1–G19 applied + 7 more fixes (2026-06-11) |
| 12 | UI/UX Testing | Pending |
| 13 | API Documentation | Pending |
| 14 | Monitoring & Logging | Pending |

---

## Test Suite Status

| Suites | Tests |
|--------|-------|
| 52 pass, 4 skipped | 705 pass, 0 fail, 124 skipped, 48 todo |

No failures. The "force exiting Jest" warning is pre-existing (open handles in backend tests). The 4 skipped suites are pre-existing.

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
| G17 | Mandatory 2FA for admin accounts |
| G18 | Delete empty bidRoutes.js dead file |
| G19 | Concurrent session limiting (MAX_SESSIONS_PER_USER) |
| QR  | Artwork QR labels + authenticated bidding UI fixes (6 bugs, ?artwork= param, labels page) |
| PP  | PayPal gateway — full payment flow, webhook, order capture, checkout UI |

---

## What Was Done Session 2026-06-12 — Frontend Responsive + Lightbox + Card Preview

Plan at `docs/superpowers/plans/2026-06-12-frontend-responsive-lightbox.md`. 12 commits on main (b9ce6b8 → b844185). 8 files changed, ~515 insertions.

### Task 1 — CSS Lightbox + Card Preview Overlay (main.css)
Added `.artwork-lightbox` (z-index:9000) and `.card-preview-overlay` (z-index:8500) as `position:fixed` full-screen overlays toggled with HTML `hidden` attribute. Key details:
- `[hidden]` rules use `display: none !important` to override `display: flex` parent
- `.card-preview-close:focus` has `outline: 2px solid var(--color-focus, #1565c0)` (WCAG keyboard focus)
- `.card-preview-title` uses `font-family: var(--font-heading, 'Cormorant Garant', serif)`
- `.auction-card-image` global rules (aspect-ratio 4/3, cursor:zoom-in, hover scale 1.04) in main.css

### Task 2 — Responsive Layout Fixes (responsive.css)
Mobile breakpoints (max-width:640px):
- `.artwork-image-wrapper` — max-height:55vw, flex centering
- `.artwork-image` — max-height:55vw, object-fit:contain
- `.artwork-thumbnails` — horizontal scroll (flex-wrap:nowrap, overflow-x:auto)
- `.filters-sidebar` — max-height:200px, overflow-y:auto (collapsed sidebar on mobile)
- `.card-preview-box` mobile — padding:1rem, border-radius:8px

### Task 3 — Lightbox JS (auction-detail.js)
Replaced native `requestFullscreen()` (unreliable on iOS Safari) with CSS `position:fixed` overlay. Removed `toggleFullscreen()` and dead `showArtworkModal(piece)`. Added `openLightbox(piece)` and `closeLightbox()` with full ARIA focus management:
- Saves `document.activeElement` as `_lightboxOpener`; restores on close
- Saves `document.body.style.overflow` as `_bodyOverflow`; restores on close
- Tab trap via `keydown` handler on the `<dialog>`; removed on close
- Escape handler guarded: only fires when `!lb.hidden`

### Task 4 — Card Preview JS (auctions-page.js)
Added `openCardPreview(auction)` and `closeCardPreview()` with same focus management pattern as lightbox. Event delegation on `.auction-card-image` click (looks up auction data via `this.auctions.find()`). URL validation: `img.src` set via regex `/^https?:\/\/|^\//.test(url)` (not `escapeHtml()`, which is ineffective on DOM `.src`). Overlay uses `aria-labelledby="card-preview-title"` (not static `aria-label`).

### Task 5 — QR Print Labels (auction-labels.css + auction-labels.js)
- QR code size: 100×100 → 160×160 pixels
- Print layout: `.label-card` is `display:grid; grid-template-columns:1fr 180px`; QR goes in right column via `.label-piece-header`'s nested grid
- `.label-specs`, `.label-description`, `.label-pricing` get `grid-column: 1/-1` so they span full card width in print
- `.label-description` uses `-webkit-line-clamp: 2` in print

### HTML Changes
- `public/auction-detail.html` — added `#artwork-lightbox` dialog before alert container
- `public/auctions.html` — added `#card-preview-overlay` dialog before alert container

---

## What Was Done Session 2026-06-11 — Bug Fixes + Security Hardening

Seven fixes committed. Plan at `docs/superpowers/plans/2026-06-11-bug-and-security-fixes.md`.

### Bug Fix 1 — `validateBid()` cents logic (bidController.js)
`minIncrement` was `100` (treated as cents), `bidAmount * 100` converted to "cents" for comparison, and response values divided by 100. A $50 current bid produced a "$1.50" minimum instead of "$60.00".

**Fixed:** `minIncrement = 10` (dollars), direct `bidAmount < minimumBid` comparison, no `/100` divisions in response.

### Bug Fix 2 — Winner email bid amount (auctionService.js:620)
`winningBidDollars: parseFloat(winner.winningBid) / 100` showed winners 1/100th of their bid.

**Fixed:** Removed `/ 100`.

### Bug Fix 3 — `closeAuction()` one winner across all artwork (biddingService.js)
`ORDER BY b.bid_amount DESC LIMIT 1` selected a single highest bid across the whole auction. Multi-artwork auctions left all non-top bids stuck in `ACTIVE` forever.

**Fixed:** `SELECT DISTINCT ON (b.artwork_id) ... ORDER BY b.artwork_id, b.bid_amount DESC` — one winner per artwork piece. Return value now includes `winners` array alongside backward-compatible `winner` (first winner).

### Security Fix 4 — Unauthenticated bid endpoints (biddingRoutes.js)
`GET /artwork/:artworkId/history`, `GET /artwork/:artworkId/state`, and `GET /auction/:auctionId/winner` had no auth middleware.

**Fixed:** `authMiddleware.verifyToken` added to all three routes.

### Security Fix 5 — Hardcoded JWT fallback secrets (authRoutes.js + userRoutes.js) — CRITICAL
Both files had `|| 'dev-secret'` fallback. Removed; app now throws `FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment` at startup.

### Security Fix 6 — loginLimiter never mounted (authRoutes.js)
`loginLimiter` defined but never imported or applied. **Fixed:** Applied to `POST /login` and `POST /verify-2fa`.

### Security Fix 7 — CORS wildcard + credentials conflict (app.js)
`origin: '*'` with `credentials: true` is browser-rejected. **Fixed:** Non-wildcard callback; production origins from `ALLOWED_ORIGINS` env var; dev: localhost:3000/3001.

### Known Remaining Issues (not fixed)
1. **`validateBid()` is dead code** — `BidController` is never imported by any route file.
2. **Winner PII exposure** — `GET /auction/:auctionId/winner` returns winner email to any authenticated user; no role check.
3. **`POST /api/auth/register` has no rate limiter** — enables email enumeration.
4. **Second auction-close path in `auctionService.js` (~line 540)** — uses `ORDER BY ... LIMIT 1` inside an `UPDATE` (non-standard SQL).

---

## What Was Done Session 2026-06-xx — PayPal Gateway (PP)

Eight commits pushed to `origin/main`. Full PayPal payment flow:
- PayPal order creation, capture, webhook verification
- Checkout UI wired end-to-end
- Bid-to-payment lifecycle connected

---

## What Was Done Session ~2026-05-xx — Mobile Token Fix + Bid Display Fix

### Mobile "Invalid Token" on QR scan (auction-detail.js)
**Fixed:** `loadAuction()` now intercepts 401 responses, calls `authManager.clearAuth()`, and falls back to `_loadPublicPreview()`.

### Carousel current bid off by 100× (artwork-carousel.js + auctionService.js)
**Fixed:** Removed `/ 100` from `currentBid` mapping in `listAuctions`. Removed `Math.round(bidAmount * 100)` from `bidController.placeBid`.

---

## What Was Done Session 2026-05-05 — Bidding Fixes + Artwork Seeding

### Bidding Bug Fix — biddingService.js cents/dollars mismatch
**Fixed 5 locations:** `minimumBid = currentBid + 100` → `currentBid + 10`; removed `/100` divisions from error messages and `newBidDollars`.

### Client-side min-bid guard fix — auction-detail.js `submitBid()`
**Fixed:** `const currentBid = this.currentPiece?.currentBid ?? 0; const minBid = currentBid + 10;`

### Artwork seed script
`db/seeds/seed-artwork.js` — idempotent. 6 JPGs in `public/images/auction-items/`.
Run: `docker exec sag-app-prod node db/seeds/seed-artwork.js`

### Browse Auctions button
`public/index.html` — converted from `<button>` to `<a href="/auctions.html">`.

---

## What Was Done Session 2026-05-04 — Artwork QR Labels + Bidding UI Fixes (QR)

### 6 Bidding Fixes in auction-detail.js
1. `checkLoginStatus()` only shows bid form when auction is LIVE and not ended
2. `loadBidHistory()` uses per-artwork endpoint
3. Min-bid hint correct — `piece.currentBid + 10`
4. Form submit event wired to `form.addEventListener('submit', ...)`
5. Leading-bidder banner (`#leading-bidder-banner`, `aria-live="polite"`)
6. Payment method select removed; replaced with `<p class="bid-note">`

### `?artwork=` QR Deep-Link
`this.focusArtworkId` from URL → `_focusArtwork()` selects piece, scrolls to form, shows enhanced auth wall for visitors.

### New Files (2026-05-04)
- `public/auction-labels.html` + `public/css/auction-labels.css` + `public/js/auction-labels.js`
- `tests/integration/routes/artworkQrBiddingTest.spec.js` (15 jsdom unit tests)

---

## Critical Architecture Notes

### Currency Convention (CRITICAL — do not break)
**DB stores DECIMAL(10,2) dollars. All bid amounts are dollars throughout.**
- `biddingRoutes.js` passes raw dollar `bidAmount` from request body
- `biddingService.js` works in dollars — do NOT divide by 100, minimum increment is `+ 10` ($10)
- `UIComponents.formatCurrency(n)` expects dollars
- `auctionService.listAuctions` returns `currentBid` as dollar float (no `/100`)
- `bidController.validateBid()` compares in dollars, returns dollar values in response

### JWT Secrets — Fail Fast (CRITICAL — do not revert)
`authRoutes.js` and `userRoutes.js` throw at startup if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are missing. There is NO fallback. Test env vars are in `tests/setup.env.js` (loaded via `jest.config.js` `setupFiles`).

### Rate Limiting
- `apiLimiter` (100/min) — applied globally to all API routes
- `loginLimiter` (5/15min) — applied to `POST /login` and `POST /verify-2fa`
- `bidLimiter` (30/min) — applied to bid placement
- `paymentLimiter` (10/min) — applied to payment routes
- `authLimiter` (20/min) — applied to registration and password reset

### CORS
Non-wildcard callback. Production: `ALLOWED_ORIGINS` env var (default `https://sag.live,https://www.sag.live`). Dev: `localhost:3000/3001`, `127.0.0.1:3000`. No-origin requests (server-to-server) are allowed.

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
- Only `token_type = 'REFRESH'` rows count toward `MAX_SESSIONS_PER_USER`
- `checkSession` is fail-open: missing row = legacy token = allow
- `SessionService.createSession` uses PG subquery pattern for eviction (not `ORDER BY` in `UPDATE`)

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

### CSS Overlay Pattern (lightbox / card preview)
- Both overlays use HTML `hidden` attribute for toggle; never use `.hidden` class or `display:none` inline
- `[hidden]` rules MUST use `display: none !important` to override `display: flex` on parent
- Focus management: save `document.activeElement`, save `document.body.style.overflow`, focus close button, attach Tab trap handler, restore all on close
- Escape key guard: check `!overlay.hidden` before calling close — prevents firing when closed

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
| `GET /api/bidding/artwork/:artworkId/history` | **Required** | Per-artwork bid history — added verifyToken 2026-06-11 |
| `GET /api/bidding/artwork/:artworkId/state` | **Required** | Current bid state — added verifyToken 2026-06-11 |
| `GET /api/bidding/auction/:auctionId/winner` | **Required** | Winner info — added verifyToken 2026-06-11; returns email to any auth user (known issue) |
| `POST /api/bidding/place` | Required | Body: `{ artworkId, bidAmount }` — dollars, not cents |

---

## Key File Map

| File | Role |
|------|------|
| `src/services/biddingService.js` | Bid placement — dollars throughout, $10 min increment; `closeAuction` → one winner per artwork |
| `src/services/auctionService.js` | Auction lifecycle; winner notification; `listAuctions` returns dollar `currentBid` |
| `src/services/notificationService.js` | Email templates, EmailProvider, notification functions |
| `src/services/authenticationService.js` | JWTService, TwoFactorService, RBACService, SessionService, TokenBlacklistService |
| `src/controllers/bidController.js` | `validateBid()` — dead code (not mounted); `placeBid()` — no cents conversion |
| `src/controllers/userController.js` | Login, logout, register, 2FA verify, refresh, password, profile |
| `src/controllers/teacherController.js` | Artwork approve/reject with status notifications |
| `src/middleware/authMiddleware.js` | verifyToken, optionalVerifyToken, requireAdmin2fa, verifyRole |
| `src/middleware/rateLimitMiddleware.js` | loginLimiter, apiLimiter, paymentLimiter, authLimiter, bidLimiter |
| `src/routes/authRoutes.js` | /api/auth/* — has fail-fast JWT secret guard; loginLimiter on /login + /verify-2fa |
| `src/routes/userRoutes.js` | /api/user/* — has fail-fast JWT secret guard |
| `src/routes/biddingRoutes.js` | /api/bidding/* — history/state/winner now require verifyToken |
| `src/routes/adminRoutes.js` | /api/admin/* including /wins (fulfillment list) and /wins/:id/fulfillment (PATCH) |
| `src/routes/teacherRoutes.js` | /api/teacher/* artwork approve/reject |
| `src/app.js` | Express app factory; CORS uses origin allowlist callback (no wildcard) |
| `public/auction-detail.html` | Auction detail page — includes `#artwork-lightbox` dialog |
| `public/auctions.html` | Auctions list page — includes `#card-preview-overlay` dialog |
| `public/js/auction-detail.js` | AuctionDetail class — lightbox open/close, focus trap, Escape guard, QR deep-link |
| `public/js/auctions-page.js` | AuctionsPage class — card preview open/close, URL validation, focus management |
| `public/js/artwork-carousel.js` | Homepage carousel — `currentBid` from `listAuctions` (dollars, no /100) |
| `public/auction-labels.html` | Printable label page — auth-gated (TEACHER/SCHOOL_ADMIN/SITE_ADMIN) |
| `public/css/main.css` | Global styles — lightbox, card preview overlay, card image aspect ratio/hover |
| `public/css/responsive.css` | Mobile/tablet breakpoints — 640px mobile artwork height, sidebar collapse, card preview mobile |
| `public/css/auction-labels.css` | Label card layout (screen 2-col grid) + @media print (CSS grid 1fr/180px) |
| `public/js/auction-labels.js` | AuctionLabels class — fetch, render, QR generation (160×160px) |
| `public/images/auction-items/` | 6 student artwork JPGs: BeachRooster, BurgerCat, RainbowSky, Roostertude, SeaLife, UGASmiling |
| `db/seeds/seed-artwork.js` | Idempotent artwork seed — `docker exec sag-app-prod node db/seeds/seed-artwork.js` |
| `public/index.html` | Home page — Browse Auctions is `<a href="/auctions.html">` |
| `public/force-2fa-setup.html` | Forced admin 2FA setup UI |
| `public/user-dashboard.html` | User dashboard with sessions management |
| `public/admin-dashboard.html` | Admin dashboard with Fulfillment tab |
| `public/bidder-welcome.html` | BIDDER role landing page |
| `tests/setup.env.js` | Sets JWT_ACCESS_SECRET + JWT_REFRESH_SECRET for test env (loaded via jest.config.js setupFiles) |
| `tests/security/bidding.auth.test.js` | Verifies verifyToken on history/state/winner routes |
| `tests/security/jwt.secrets.test.js` | Verifies no 'dev-secret' in authRoutes/userRoutes |
| `tests/security/login.ratelimit.test.js` | Verifies loginLimiter wired on login/verify-2fa |
| `tests/security/cors.config.test.js` | Verifies no CORS wildcard in app.js |
| `docs/superpowers/plans/` | Implementation plans (2026-05-04, 2026-05-10, 2026-06-11, 2026-06-12) |
| `db/migrations/` | All schema migrations |
| `tests/helpers/createTestApp.js` | Creates Express app with mockDb |
| `tests/helpers/mockDb.js` | jest.fn() mock for injected db |

---

## Pending Live Test Workflow (once server is redeployed)
1. `docker exec sag-app-prod node db/seeds/seed-artwork.js`
2. Login as teacher → verify 6 artwork pieces appear
3. Login as bidder → place bid on artwork
4. Login as second bidder → outbid, verify outbid banner and email notification
5. Verify bid history, min-increment enforcement, and auction-detail UI
6. Click artwork image → verify lightbox opens, Escape/click closes, focus returns
7. Click auction card image on /auctions.html → verify card preview opens with correct data
8. Open auction-labels page as TEACHER → click Print, verify QR codes are 160px and layout is 2-column
