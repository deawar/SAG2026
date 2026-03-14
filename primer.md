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
| 5 | Auction Management API | Routes exist and now mounted |
| 6 | Frontend Development | Partial - HTML/CSS done, JS stubs incomplete |
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

P1 Critical Bug Fixes - pushed as commit ebc5a09

1. Mounted missing API routes (src/index.js): /api/auctions, /api/bidding, /api/payments
   were never registered with Express - all frontend calls returned 404.
   Fixed and paired with correct rate limiters (apiLimiter, bidLimiter, paymentLimiter).

2. Fixed refresh token key mismatch (public/js/auth-manager.js line 40):
   register() was writing 'refreshToken' (camelCase) directly to localStorage but
   the constructor reads 'refresh_token' (snake_case). Changed to this.setRefreshToken().
   Token refresh silently broke for every registered user.

3. Added mobile menu toggle (public/admin-dashboard.html):
   Hamburger button was missing - admin nav tabs unreachable on mobile.
   Root fix applied in UIComponents.setupNavbarEventListeners() so all pages benefit.
   Removed duplicate handler from index.js to prevent double-toggle bug on homepage.

Also created CLAUDE.md (session rule: rewrite primer.md) and primer.md (this file).

---

## Active Work / In Progress
Nothing mid-flight. All P1 fixes complete and pushed.

---

## Known Issues / Blockers (Prioritised)

P2 - Responsive Polish
- responsive.css:334 - .btn { width: 100% } on mobile too aggressive, breaks icon/table/inline buttons. Scope to .form-actions .btn only.
- Hero section has no mobile column-stack rule for .hero-image
- Auth buttons stack awkwardly below hamburger on very small screens

P2 - Frontend Wiring
- auctions-page.js - filter/sort/pagination now calls working /api/auctions but card rendering needs verification
- auction-detail.js - bidding flow needs end-to-end test
- teacher-dashboard.js - artwork submission and student management are stubs

P3 - Dark Mode Breaks Theming
- responsive.css:559 dark mode uses hardcoded hex values, bypassing CSS variable school-theme system

P3 - Housekeeping
- public/test-registration.html - test file is publicly served, should be deleted
- 80+ .md files in project root should move to /docs/
- README.md API docs are stale (lists /users, /auctions - actual routes are /api/auth/*, /api/auctions/*)

P4 - Unimplemented Features
- Section 7 Notifications: notificationService.js exists but no email provider configured
- Payment UI: winner checkout flow has no HTML page
- Admin dashboard backend: user management, reporting, compliance endpoints incomplete

---

## Key Files Changed Recently

| File | Change |
|------|--------|
| src/index.js | Added auction, bidding, payment route mounts with rate limiters (lines 139-179) |
| public/js/auth-manager.js | Fixed refresh token storage key on line 40 |
| public/js/ui-components.js | Added shared mobile menu toggle handler in setupNavbarEventListeners() |
| public/js/index.js | Removed duplicate menu toggle handler |
| public/admin-dashboard.html | Added missing .menu-toggle button to navbar |

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

---

## Environment & Infra
- Dev: npm run dev (nodemon, port 3000)
- DB: PostgreSQL - schema.sql, seeds.sql
- Docker: docker-compose.yml (dev) / docker-compose.prod.yml (prod)
- Payments: Stripe + Square - tokenisation only, no card data stored
- WebSocket: ws library, initialised at server start in realtimeService.js

---

## What To Do Next Session
1. Fix .btn width:100% mobile scoping and hero image mobile layout (P2 responsive)
2. Verify auction list page end-to-end with now-working /api/auctions endpoint
3. Test login > register > page reload to confirm refresh token key fix works in browser

---

## Decisions Made / Conventions To Remember
- Mobile menu toggle handler lives exclusively in UIComponents.setupNavbarEventListeners() -
  never duplicate in page-specific JS files
- Refresh token localStorage key is always refresh_token (snake_case) -
  always call this.setRefreshToken(), never raw localStorage.setItem
- Auction/bidding/payment route files are NOT factory functions - require() directly
  (unlike auth/user/school routes which receive a db param)
- API routes are /api/* not /api/v1/* - README is wrong, do not follow it for route paths
