# SAG2026 — The Mosaic Redesign Primer

**Last updated:** 2026-06-20
**Project path:** `c:\Users\Dean.SSCCBISHOP.000\OneDrive\projects\SAG2026\Silent-Auction-Gallery\`

---

## Project Overview

Silent Auction Gallery (SAG2026) — Node.js/Express multi-page HTML app, vanilla HTML/CSS/JS, no React. All 9 tasks of the "Mosaic" interface redesign are **complete and committed**.

---

## CRITICAL Rules (Never Violate)

- **DB stores DECIMAL(10,2) dollars** — NEVER divide bid amounts by 100
- **`npm run lint` must exit 0 errors** (baseline: 0 errors, ~154 warnings)
- **`npm test` must pass with 705 tests**
- **XSS prevention**: Use DOM APIs (createElement/textContent) — never innerHTML for user data
- **School theming fallback**: always `var(--school-primary, var(--color-platform-dark, #1A1A2E))` — never naked `var(--school-primary)`

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

## Key Files Modified

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

---

## Known Tech Debt (Deferred)

- Dead `initCarousel()` call in `initializePage()` in `public/js/index.js` — makes a phantom `GET /api/auctions/carousel` on every home page load. The art strip replaced the carousel; `initCarousel()` should eventually be removed.

---

## Session Rule

At the end of every session, rewrite primer.md completely (this file).
