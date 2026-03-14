# Silent Auction Gallery — Session Primer
**Last updated:** <!-- date -->
**Project path:** `c:\Users\dwarren\OneDrive\projects\SAG2026\Silent-Auction-Gallery\`

---

## What This Project Is
A production-grade, PCI-DSS / WCAG 2.1 AA compliant school-based charity art auction platform.
Stack: Node.js + Express, PostgreSQL, Vanilla HTML/CSS/JS, WebSocket.
Start date: 2026-01-26 | Target: Q2 2026

---

## Current Project Status
<!-- Update this section every session -->

| Section | Name | Status |
|---------|------|--------|
| 1 | Database Schema | ✅ Complete |
| 2 | Core Models & Services | ✅ Complete |
| 3 | Authentication & Authorization | ✅ Complete |
| 4 | Payment Processing | ✅ Complete |
| 5 | Auction Management API | <!-- status --> |
| 6 | Frontend Development | <!-- status --> |
| 7 | Notification System | <!-- status --> |
| 8 | Admin Dashboard | <!-- status --> |
| 9 | Deployment & Testing | <!-- status --> |
| 10 | Data Migration | <!-- status --> |
| 11 | Security Audit | <!-- status --> |
| 12 | UI/UX Testing | <!-- status --> |
| 13 | API Documentation | <!-- status --> |
| 14 | Monitoring & Logging | <!-- status --> |

---

## What Was Done Last Session
<!-- Replace entirely each session — be specific -->
-
-
-

---

## Active Work / In Progress
<!-- What is currently mid-flight or partially complete -->
-

---

## Known Issues / Blockers
<!-- Bugs, broken tests, pending decisions, external dependencies -->
-

---

## Key Files Changed Recently
<!-- List files modified in the last 1-2 sessions with a one-line note -->
| File | Change |
|------|--------|
| <!-- path --> | <!-- what changed --> |

---

## Architecture Snapshot
- **Entry point:** `src/index.js`
- **Frontend pages:** index, auctions, auction-detail, login, register, user-dashboard, teacher-dashboard, admin-dashboard, password-reset, 2fa-setup, 2fa-verify
- **CSS load order:** `theme.css → main.css → responsive.css → accessibility.css`
- **JS convention:** `theme-manager.js` loads first on every page
- **API base:** `/api/v1/`
- **Auth flow:** JWT (15min) + refresh token (7 days) + TOTP 2FA
- **Role hierarchy:** SITE_ADMIN > SCHOOL_ADMIN > TEACHER > STUDENT > BIDDER

---

## Theming System
- Fonts: Cormorant Garant (headings) + DM Sans (body)
- School color vars: `--school-primary` / `--school-secondary` in `:root`
- `ThemeManager.apply(school)` / `.reset()` / `.getCurrent()` — persists to localStorage
- Custom event: `schoolThemeChanged`

---

## Test Coverage
- Framework: Jest
- Run: `npm test` | unit: `npm run test:unit` | integration: `npm run test:integration`
- Target: 80%+ overall, 100% security-critical paths
- <!-- Current passing/failing count if known -->

---

## Environment & Infra
- Dev: `npm run dev` (nodemon)
- DB: PostgreSQL — schema in `schema.sql`, seeds in `seeds.sql`
- Docker: `docker-compose.yml` (dev) / `docker-compose.prod.yml` (prod)
- Payments: Stripe + Square integrated; no card data stored locally

---

## What To Do Next Session
<!-- Top 3 priorities, in order -->
1.
2.
3.

---

## Decisions Made / Conventions To Remember
<!-- Architectural or stylistic decisions that aren't obvious from the code -->
-
