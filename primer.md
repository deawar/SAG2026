# Silent Auction Gallery — Session Primer
**Last updated:** 2026-03-13
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
| 7 | Notification System | Pending - service file exists, no email wired |
| 8 | Admin Dashboard | Partial - HTML/CSS/JS exists, backend incomplete |
| 9 | Deployment & Testing | Pending |
| 10 | Data Migration | Pending |
| 11 | Security Audit | Pending |
| 12 | UI/UX Testing | Pending |
| 13 | API Documentation | Pending |
| 14 | Monitoring & Logging | Pending |

---

## What Was Done Last Session (2026-03-13)

### Commit 81c051f — Hamburger menu fix
- responsive.css: .menu-toggle was display:flex with no flex-direction, causing 3 spans
  to lay out side-by-side (single thin line). Fixed with flex-direction:column; gap:5px.
- main.css: span height bumped to 3px, border-radius:2px, margin removed (gap handles spacing).

### Commit fcd2a3d — P2 Responsive polish + ESLint + Auction card wiring

**ESLint setup:**
- Created eslint.config.js (flat config for ESLint v9 — no .eslintrc needed)
- Covers src/**/*.js (node globals), public/js/**/*.js (browser globals + UIComponents etc.),
  tests/**/*.js (jest globals)
- varsIgnorePattern: ^_ so _prefixed vars do not trigger no-unused-vars
- Fixed all 70 lint errors: dead imports removed, unused destructured vars prefixed with _,
  no-useless-escape fixed in 5 files, intentional control-char regex suppressed,
  incomplete test stubs suppressed with file-level eslint-disable

**CSS P2 fixes:**
- Mobile .btn width:100% scoped to .form-actions/.card-actions/.page-actions only
- .hero gets display:flex on desktop (content + image side-by-side), collapses to
  flex-direction:column on mobile with hero-image capped at 180px
- Added .hero-content, .hero-image, .hero-img baseline styles

**Auction list API + card rendering:**
- auctionService.listAuctions: query now LEFT JOINs schools, adds subqueries for
  current_bid, bid_count, and cover_image (first approved artwork per auction)
- Response fields changed: now returns id (was auctionId), school (name), currentBid,
  bidCount, image
- auctions-page.js: added normaliseStatus() mapping LIVE to active, DRAFT to draft,
  ENDED/CANCELLED to ended; status filter compares normalised values;
  image falls back to /images/placeholder-art.svg

**index.js cleanup:**
- handleVerify2FA exposed on globalThis for HTML onsubmit handlers
- Dead functions (handleLogout, show2FAForm) removed; updateAuthUI bug eliminated

---

## Active Work / In Progress
Nothing mid-flight. All P2 priorities addressed and pushed.

---

## Known Issues / Blockers (Prioritised)

P2 - Homepage Re-engineering (index.html)
- The homepage body content (Featured Auctions, How It Works, CTA section) renders as
  plain unstyled text — no hero gradient, no cards, no branded colours or spacing
- "Failed to load auctions" error showing in Featured Auctions section (API call failing
  or no active auctions seeded in live DB)
- How It Works step numbers (1-4) are unstyled — should use .step-number styled circles
- "Get Started" CTA button renders full-width grey — should be btn-primary with correct width
- Root cause is likely a combination of: missing CSS classes on index.html elements,
  loadFeaturedAuctions() calling a different endpoint than /api/auctions/active/list,
  and the page not inheriting the site theme correctly
- ENTIRE homepage sections need a design audit against auctions.html as the reference page

P2 - Frontend Wiring (remaining)
- auction-detail.js - bidding flow needs end-to-end test against live API
- teacher-dashboard.js - artwork submission and student management are stubs

P3 - Dark Mode Breaks Theming
- responsive.css:559+ dark mode uses hardcoded hex values, bypassing CSS variable school-theme system

P3 - Housekeeping
- public/test-registration.html - test file is publicly served, should be deleted
- 80+ .md files in project root should move to /docs/
- README.md API docs are stale (lists /users, /auctions - actual routes are /api/auth/*, /api/auctions/*)
- main.css has ~7 duplicate selectors (tabs-list, tab-button, text-center, text-muted, text-success)
  at lines 1719+ vs 1125+

P4 - Unimplemented Features
- Section 7 Notifications: notificationService.js exists but no email provider configured
- Payment UI: winner checkout flow has no HTML page
- Admin dashboard backend: user management, reporting, compliance endpoints incomplete
- /images/placeholder-art.svg does not exist yet - needed for auction cards without artwork

---

## Key Files Changed Recently

| File | Change |
|------|--------|
| public/css/responsive.css | Hamburger flex-direction, .btn scoping, hero mobile stack |
| public/css/main.css | .menu-toggle span height/radius, .hero flex layout + image styles |
| public/js/auctions-page.js | normaliseStatus(), field mapping fix, image fallback |
| src/services/auctionService.js | listAuctions extended with school JOIN + bid/image subqueries |
| eslint.config.js | New file - ESLint v9 flat config |
| public/js/index.js | handleVerify2FA on globalThis, dead code removed |
| src/app.js | Dead rate limiter imports removed |
| Multiple src/ files | Dead imports and unused vars cleaned up |

---

## Architecture Snapshot
- Entry point: src/index.js | App config: src/app.js
- Frontend pages: index, auctions, auction-detail, login, register, user-dashboard,
  teacher-dashboard, admin-dashboard, password-reset, 2fa-setup, 2fa-verify
- CSS load order: theme.css > main.css > responsive.css > accessibility.css
- JS convention: theme-manager.js loads first; UIComponents.initializeNavbar() called
  in every page DOMContentLoaded
- API base: /api/ - README says /api/v1/ but actual routes do NOT use v1 prefix
- Auth flow: JWT (15min access) + refresh token (7 days)
  localStorage keys: auth_token / refresh_token
- Role hierarchy: SITE_ADMIN > SCHOOL_ADMIN > TEACHER > STUDENT > BIDDER
- Rate limiters: authLimiter (20/min), apiLimiter (100/min), bidLimiter (30/min), paymentLimiter (10/min)

---

## Theming System
- Fonts: Cormorant Garant (headings) + DM Sans (body) via Google Fonts
- School color vars: --school-primary / --school-secondary in :root (main.css)
- ThemeManager.apply(school) / .reset() / .getCurrent() - persists to localStorage
- Custom event: schoolThemeChanged | Preset classes: .school-theme-navy-gold etc. in theme.css

---

## Responsive Breakpoints
- Mobile base:   0-640px    (.menu-toggle shown, single column)
- Tablet:        641-768px  (2-col grids, auth forms 2-col)
- Tablet Large:  769-1024px (desktop nav shown, sidebar appears)
- Desktop:       1025-1280px (3-col auction grid, sticky filters)
- XL:            1281-1440px (4-col grid, max-width 1280px)
- Ultra-wide:    1440px+    (5-col grid, max-width 1400px)

---

## Test Coverage
- Framework: Jest | npm test | npm run test:unit | npm run test:integration
- Target: 80%+ overall, 100% security-critical
- Last known run: Section 11 security tests passing (Feb 2026)
- Lint: npm run lint (ESLint v9, 0 errors as of fcd2a3d)

---

## Environment & Infra
- Dev: npm run dev (nodemon, port 3000)
- DB: PostgreSQL - schema.sql, seeds.sql
- Docker: docker-compose.yml (dev) / docker-compose.prod.yml (prod)
- Live: https://sag.live (Apache reverse proxy to Node app on VPS 15.204.210.161)
- Payments: Stripe + Square - tokenisation only, no card data stored
- WebSocket: ws library, initialised at server start in realtimeService.js

---

## What To Do Next Session
1. Create /images/placeholder-art.svg so auction cards render cleanly when no artwork exists
2. Test auction list page end-to-end at https://sag.live - verify cards render with bid counts
3. Test auction-detail.js bidding flow end-to-end
4. Fix dark mode hardcoded hex values in responsive.css (P3)
5. Delete public/test-registration.html (P3)

---

## Decisions Made / Conventions To Remember
- Mobile menu toggle handler lives exclusively in UIComponents.setupNavbarEventListeners() -
  never duplicate in page-specific JS files
- Refresh token localStorage key is always refresh_token (snake_case) -
  always call this.setRefreshToken(), never raw localStorage.setItem
- Auction/bidding/payment route files are NOT factory functions - require() directly
  (unlike auth/user/school routes which receive a db param)
- API routes are /api/* not /api/v1/* - README is wrong, do not follow it for route paths
- auctionService.listAuctions returns id (not auctionId) - changed in fcd2a3d
- ESLint config is eslint.config.js (v9 flat config) - do not create .eslintrc files
- Prefix unused-but-intentional variables with _ to satisfy ESLint varsIgnorePattern
- Use Number.parseInt / Number.parseFloat not global parseInt/parseFloat (SonarLint S7773)
- Use globalThis instead of window for cross-env globals (SonarLint S7764)
