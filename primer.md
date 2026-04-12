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
| 7 | Notification System | Pending - service file exists, no email wired |
| 8 | Admin Dashboard | Partial - HTML/CSS/JS exists, backend incomplete |
| 9 | Deployment & Testing | Pending |
| 10 | Data Migration | Pending |
| 11 | Security Audit | Pending |
| 12 | UI/UX Testing | Pending |
| 13 | API Documentation | Pending |
| 14 | Monitoring & Logging | Pending |

---

## Grading Fixes Completed (Prompt Series G1–G12)

| Fix | Commit | Description |
|-----|--------|-------------|
| G7  | dec8199 | GET /api/admin/auctions/search |
| G8  | fb2fb0d | GET /api/admin/reports summary endpoint |
| G9  | ed9f1d4 | Replace PaymentController(null) with NullPaymentService stub |
| G10 | b0b0f3c | Checkout page + payment UI end-to-end |
| G11 | 20b3726 | Require email verification before login |
| G12 | c0e4c86 | COPPA parental consent flow (see below) |

---

## What Was Done Last Session (2026-04-12)

### Commit c0e4c86 — G12 COPPA compliance

**Migration:** `db/migrations/20260412000000_add_coppa_fields.up.sql`
- Added to `users` table: `requires_parental_consent BOOLEAN DEFAULT FALSE`,
  `parental_consent_status VARCHAR(32) DEFAULT 'not_required'`,
  `parent_email VARCHAR(255) NULL`, `parent_consent_token TEXT NULL`,
  `parent_consent_expires_at TIMESTAMPTZ NULL`, `parent_consent_granted_at TIMESTAMPTZ NULL`
- Made `last_name` nullable (for data minimization on under-13 accounts)
- Index on `parental_consent_status WHERE requires_parental_consent = TRUE`

**Registration flow (src/controllers/userController.js):**
- `dateOfBirth` required for STUDENT and BIDDER paths
- Age computed in controller; if < 13: require `parentEmail`, null `lastName`/`phone` (data minimization),
  create user with `requires_parental_consent=true`, `parental_consent_status='pending'`, store token hash
- Send parental consent email via `_sendParentConsentEmail()` (same SMTP pattern as verify email)
- Return `{ ok: true, requiresParentalConsent: true }` — no JWT

**Login guard (src/controllers/userController.js):**
- If `requires_parental_consent=true AND parental_consent_status != 'granted'` → 403
  `{ error: 'parental_consent_required' }` (checked before email_verified_at guard)

**New endpoint: POST /api/auth/parental-consent (src/routes/authRoutes.js)**
- Body: `{ uid, token, granted: boolean }`
- Verifies sha256 token hash and expiry (7-day window)
- `granted=true`: sets `parental_consent_status='granted'`, activates account (email_verified_at + ACTIVE)
- `granted=false`: sets status='denied', soft-deletes account

**COPPA report rewrite (src/services/adminService.js):**
- `generateCOPPAReport` now queries `users` table directly (was querying non-existent `coppa_verifications`)
- Returns `{ totalUnder13, pending, granted, denied }` in summary

**New page:** `public/parental-consent.html`
- Shows data collection notice (what is collected, how used, third-party sharing)
- Grant and Deny buttons; calls `/api/auth/parental-consent`

**Tests:** `tests/unit/coppa.test.js` (16 tests covering full flow)
- Updated `tests/unit/models/userModel.spec.js` (COPPA now in controller, not model validator)
- Updated `tests/unit/services/adminService.test.js` (new summary shape)

**Key architectural note:** `_validateUserData` no longer throws `COPPA_PARENTAL_CONSENT_REQUIRED`.
The COPPA age check lives in `userController.register()`. The model accepts `null` lastName.

---

## Active Work / In Progress
Nothing mid-flight. G12 committed and tests passing (482/482).

---

## Known Issues / Blockers (Prioritised)

P2 - Homepage Re-engineering (index.html)
- The homepage body content (Featured Auctions, How It Works, CTA section) renders as
  plain unstyled text — no hero gradient, no cards, no branded colours or spacing
- "Failed to load auctions" error showing in Featured Auctions section (API call failing
  or no active auctions seeded in live DB)
- How It Works step numbers (1-4) are unstyled — should use .step-number styled circles
- "Get Started" CTA button renders full-width grey — should be btn-primary with correct width

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
- Admin dashboard backend: user management, reporting, compliance endpoints incomplete
- /images/placeholder-art.svg does not exist yet - needed for auction cards without artwork

---

## Key Files Changed Recently

| File | Change |
|------|--------|
| db/migrations/20260412000000_add_coppa_fields.up/down.sql | New - COPPA DB columns |
| schema.sql | users table: last_name nullable + 6 new COPPA columns |
| src/controllers/userController.js | COPPA age check in register(), login guard, _sendParentConsentEmail |
| src/models/index.js | create() accepts COPPA params; _validateUserData allows null lastName |
| src/routes/authRoutes.js | New POST /api/auth/parental-consent endpoint |
| src/services/adminService.js | generateCOPPAReport uses real users table data |
| public/parental-consent.html | New consent notice + grant/deny UI |
| tests/unit/coppa.test.js | New - 16 COPPA flow tests |
| tests/unit/models/userModel.spec.js | Updated COPPA tests (logic moved to controller) |
| tests/unit/services/adminService.test.js | Updated COPPA report test (new summary shape) |

---

## Architecture Snapshot
- Entry point: src/index.js | App config: src/app.js
- Frontend pages: index, auctions, auction-detail, login, register, user-dashboard,
  teacher-dashboard, admin-dashboard, password-reset, 2fa-setup, 2fa-verify,
  verify-email, parental-consent
- CSS load order: theme.css > main.css > responsive.css > accessibility.css
- JS convention: theme-manager.js loads first; UIComponents.initializeNavbar() called
  in every page DOMContentLoaded
- API base: /api/ - README says /api/v1/ but actual routes do NOT use v1 prefix
- Auth flow: JWT (15min access) + refresh token (7 days)
  localStorage keys: auth_token / refresh_token
- Role hierarchy: SITE_ADMIN > SCHOOL_ADMIN > TEACHER > STUDENT > BIDDER
- Rate limiters: authLimiter (20/min), apiLimiter (100/min), bidLimiter (30/min), paymentLimiter (10/min)

---

## COPPA Account Lifecycle

```
register (STUDENT/BIDDER, age < 13)
  → account_status=PENDING, requires_parental_consent=TRUE, parental_consent_status='pending'
  → parent consent email sent (link expires 7 days)
  → login blocked until consent granted

parent visits /parental-consent.html → POST /api/auth/parental-consent
  grant → parental_consent_status='granted', email_verified_at=NOW(), account_status=ACTIVE
  deny  → parental_consent_status='denied', deleted_at=NOW()
```

Data minimization for under-13: last_name=NULL, phone_number=NULL at registration.

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
- Last known run: 482 unit/security tests passing (2026-04-12)
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
- COPPA logic lives in userController.register(), NOT in UserModel._validateUserData()
- UserModel._validateUserData() allows null lastName (for under-13 data minimization)
- Parental consent token stored as sha256 hash in parent_consent_token column, raw token in email URL
