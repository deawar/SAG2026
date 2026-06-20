# SAG2026 — Project Primer

**Last updated:** 2026-06-20
**Project path:** `c:\Users\Dean.SSCCBISHOP.000\OneDrive\projects\SAG2026\Silent-Auction-Gallery\`

---

## Project Overview

Silent Auction Gallery (SAG2026) — Node.js/Express multi-page HTML app, vanilla HTML/CSS/JS, no React. All 9 tasks of the "Mosaic" interface redesign are **complete and committed**. A full security audit has been completed; all CRITICAL and HIGH findings are resolved, and MED-1 through MED-4 are resolved.

---

## CRITICAL Rules (Never Violate)

- **DB stores DECIMAL(10,2) dollars** — NEVER divide bid amounts by 100
- **`npm run lint` must exit 0 errors** (baseline: 0 errors, ~154 warnings)
- **`npm test` must pass with 705 tests**
- **XSS prevention**: Use DOM APIs (createElement/textContent) — never innerHTML for user data
- **School theming fallback**: always `var(--school-primary, var(--color-platform-dark, #1A1A2E))` — never naked `var(--school-primary)`
- **`validator.escape()` must NOT be used on API input** — corrupts passwords/emails before bcrypt
- **SessionService constructor**: always `new SessionService({ db })` — NOT `new SessionService(db)`

---

## The Mosaic Design System

### Colors
```css
--color-platform-dark: #1A1A2E   /* global nav, hero, auth pages */
--color-platform-coral: #FF4136  /* accents, CTAs, numbers */
--color-canvas: #F4F4F4          /* off-white page bg */
--color-teacher-hero: #2A3550    /* teacher dashboard hero slate */
```

### Typography
- `--font-display`: Fraunces, italic 800 — display headlines only
- `--font-body`: Bricolage Grotesque, 200 or 800 — NO 400/600
- `--font-mono`: JetBrains Mono — lot numbers, timestamps, IDs
- **Weight rule**: 200 (light) vs 800 (bold) ONLY — never 400/600 for emphasis
- **NO**: Inter, Roboto, Arial, or system fonts
- Font vars live in `public/css/theme.css`, not in main.css `:root`

### Hybrid School Theming
School colors appear ONLY on:
- Auction cards (`.auction-card`)
- School context bar (`.school-context-bar`)
- Teacher stats (`.teacher-stats-card`)
- Section badges (`.school-badge`)

School colors NEVER appear in: global nav, hero, auth pages.

---

## Completed Tasks (T1–T9)

| Task | Description | Status |
|------|-------------|--------|
| T1 | CSS custom properties + Google Fonts wiring | ✅ Done |
| T2 | Nav rewrite — dark border, coral dot, thin uppercase links | ✅ Done |
| T3 | Homepage hero (dark bg, Fraunces headline) + art strip carousel | ✅ Done |
| T4 | Auction cards — Mosaic border/radius, featured section, How It Works | ✅ Done |
| T5 | Auctions page — page-header dark banner + filter bar | ✅ Done |
| T6 | Auction detail — school context bar + bid panel Fraunces coral | ✅ Done |
| T7 | Auth pages (login/register/2fa) — split layout dark/light | ✅ Done |
| T8 | Teacher dashboard hero + 4-card stats; Bidder Welcome rebuild | ✅ Done |
| T9 | Animations (fade-up/fade-in), IntersectionObserver art strip reveal, responsive breakpoints | ✅ Done |

---

## Security Audit — Finding Status

### CRITICAL (all resolved)
| ID | Finding | Status |
|----|---------|--------|
| CRIT-1 | SQL injection via string interpolation in admin wins query | ✅ Fixed — parameterized |
| CRIT-2 | Weak JWT secrets in `.env` | ✅ Fixed — secrets rotated; history purged via `git filter-repo` |
| CRIT-3 | JWT secrets committed to git history | ✅ Fixed — same as CRIT-2 |

### HIGH (all resolved)
| ID | Finding | Status |
|----|---------|--------|
| HIGH-1 | JWT blacklist fail-open on DB outage | ✅ Fixed — in-memory `_revokedCache` Set in `TokenBlacklistService` |
| HIGH-2 | Bid amount not normalized before persistence | ✅ Fixed — `Math.round(bidAmount * 100) / 100` in `biddingRoutes.js` |
| HIGH-3 | SCHOOL_ADMIN could revoke sessions of users at other schools | ✅ Fixed — ownership check added to `adminRoutes.js` |
| HIGH-4 | Backup codes accepted from client at 2FA confirm | ✅ Fixed — always generated server-side in `authRoutes.js` |
| HIGH-5 | Idempotency middleware global scope + no UUID validation | ✅ Fixed — scoped to `/payments`, UUID pattern enforced, 5000-entry cap |
| HIGH-6 | Password change did not revoke existing sessions | ✅ Fixed — `revokeAllExcept(userId, null)` + blacklist all JTIs in `userRoutes.js` |

### MEDIUM (partially resolved)
| ID | Finding | Status |
|----|---------|--------|
| MED-1 | No rate limit on password-reset and 2FA submission endpoints | ✅ Fixed — `loginLimiter` + `passwordResetLimiter` applied in `authRoutes.js` |
| MED-2 | `validator.escape()` used on all API input, corrupting passwords | ✅ Fixed — removed; trim-only for non-sensitive fields; `SENSITIVE_FIELDS` Set |
| MED-3 | Raw `error.message` in 500 responses leaks DB internals | ✅ Fixed — global handler scrubs 5xx in production; inline 500s in `adminRoutes.js` use generic string |
| MED-4 | Dead `csurf` dependency (never wired into any route) | ✅ Fixed — removed `require`, 3 dead functions, exports, and package (−13 transitive deps) |
| MED-5 | WebSocket broadcast fires before DB commit confirmation | ⏳ Pending — `biddingRoutes.js` |
| MED-6 | Winner email visible in non-admin responses | ⏳ Pending — `biddingService.js` ~line 470 |
| MED-7 | Bidder names not anonymized in bid history | ⏳ Pending — `biddingService.js` ~line 262 |
| MED-10 | Reset code logged via `console.log` | ⏳ Pending — `authenticationService.js` ~line 1107 |

### LOW (not yet addressed)
LOW-1 through LOW-7 + LOW-8 — to be addressed in a future session.

---

## Key Security Files Modified

- **`src/routes/adminRoutes.js`** — CRIT-1 parameterized query; HIGH-3 school ownership check; MED-3 inline 500s scrubbed
- **`src/routes/authRoutes.js`** — HIGH-4 server-side backup codes; MED-1 rate limiters applied
- **`src/routes/userRoutes.js`** — HIGH-6 session revocation on password change
- **`src/routes/biddingRoutes.js`** — HIGH-2 bid normalization
- **`src/services/authenticationService.js`** — HIGH-1 in-memory JTI revocation cache
- **`src/middleware/securityMiddleware.js`** — MED-2 sanitizeInput rewrite; MED-4 csurf removed; HIGH-5 idempotency scoped+validated; MED-1 passwordResetLimiter with test skip
- **`src/app.js`** — MED-3 global error handler production message scrubbing

---

## Key Frontend Files Modified (Mosaic)

- **`public/css/main.css`** — All Mosaic CSS (nav, hero, cards, auth, teacher, animations)
- **`public/css/responsive.css`** — Mosaic breakpoints appended (768px + 480px)
- **`public/css/theme.css`** — Font vars (`--font-display`, `--font-body`, `--font-mono`) and color vars
- **`public/js/index.js`** — `initArtStrip()` (carousel fetch + DOM build) + `initArtStripReveal()` (IntersectionObserver stagger)
- **`public/js/auction-detail.js`** — School context bar populated in `displayAuction()`
- **`public/js/teacher-dashboard.js`** — Teacher hero + stats from loaded data
- **`public/index.html`** — Dark hero + art strip section
- **`public/auctions.html`** — Filter bar (IDs: `bar-filter-school`, `bar-filter-grade`, `bar-filter-medium`)
- **`public/auction-detail.html`** — School context bar before artwork image
- **`public/login.html`**, **`public/register.html`**, **`public/2fa-verify.html`** — Split auth layout
- **`public/teacher-dashboard.html`** — Teacher hero + 4-card stats row
- **`public/bidder-welcome.html`** — Mosaic rebuild with step cards

---

## Architecture Notes

- `:has()` CSS selector used for homepage-scoped rules: `.main-content:has(.hero)` and `body:has(.hero) .navbar`
- `IntersectionObserver` drives art strip stagger reveal — thumbs start at `opacity: 0`, `.art-strip-thumb--revealed` added after intersection
- `initArtStripReveal()` is called from inside `initArtStrip()` AFTER all thumbs are appended — NOT from `initializePage()` (was a race condition)
- Navbar fade-in animation scoped to `body:has(.hero) .navbar` — fires only on the homepage
- SQL injection prevention: parameterized queries via `$N` placeholders in `pg pool.query()` throughout
- JWT blacklist: JTI-based revocation in PostgreSQL `token_blacklist` table with in-memory fallback cache
- `isProduction` defined in `src/app.js` line 38: `process.env.NODE_ENV === 'production'`

---

## Known Tech Debt (Deferred)

- Dead `initCarousel()` call in `initializePage()` in `public/js/index.js` — makes a phantom `GET /api/auctions/carousel` on every home page load. The art strip replaced the carousel; `initCarousel()` should eventually be removed.
- MED-5, MED-6, MED-7, MED-10 and all LOW findings from the security audit remain open.

---

## Session Rule

At the end of every session, rewrite primer.md completely (this file).
