# Design: Dark-Mode Legibility + Always-Visible Portfolio Nav Link

**Date:** 2026-07-12
**Status:** Approved (design)
**Area:** Frontend theming (CSS) + shared navbar (JS)
**Type:** Frontend-only. No backend/schema changes.

## Problem

1. **Dark mode is broken.** The app has no theme toggle; it only reacts to the OS `prefers-color-scheme: dark` setting. That handling is split across two files and is incomplete, so in dark mode **buttons and menu items are almost impossible to see.**
2. **The Portfolio link is missing on most pages.** The navbar is hardcoded per-page in each HTML file, and the Portfolio link was only added to 4 pages. Students, teachers, and admins need it on every page.

## Goals

- On an OS set to dark, every page renders with legible buttons, nav links, menus, notices, and text at normal contrast. Light mode is visually unchanged.
- A role-appropriate Portfolio link appears exactly once in the navbar on **every** page that renders the shared navbar, for STUDENT / TEACHER / SCHOOL_ADMIN / SITE_ADMIN.

## Non-goals / Scope boundaries

- No manual light/dark toggle. Auto-follow the OS setting only (the user's explicit choice).
- No wholesale semantic-token refactor — only the token additions and component patches needed to fix contrast (YAGNI).
- No backend, schema, or per-school-theming changes. Brand hues (coral primary, per-school colors) are preserved; dark mode only adjusts neutrals, surfaces, text, and borders.
- No per-page HTML nav edits for the Portfolio link — it is injected centrally.

## Root causes (as-is)

**Dark mode:**
- `public/css/responsive.css` (~line 579) has an `@media (prefers-color-scheme: dark)` block that inverts the grayscale tokens (`--color-white → #1e1e1e`, `--color-dark → #f5f5f5`, etc.) and styles `.navbar`.
- `public/css/accessibility.css` (~line 569) has a *separate* dark block styling `body` and `.form-control`.
- These invert the `--color-*` grayscale family but **not** the `--color-platform-*` family. `.nav-link` and `.btn-secondary` set their text/border to `var(--color-platform-dark, #1A1A2E)` (near-black), which stays near-black in dark mode → invisible on the dark navbar/background. `.btn-primary` (coral background + hardcoded `#fff` text) survives.
- Many components use hardcoded hex (e.g. `.removed-notice`, `.portfolio-softcap-notice`, badges, comment UI) that ignore the inversion entirely.

**Portfolio link:**
- `UIComponents.initializeNavbar()` (`public/js/ui-components.js` ~line 877) already does role-based nav manipulation (`isAdmin`, `isTeacher`).
- The Portfolio link is hardcoded only in `portfolio.html`, `user-dashboard.html`, `teacher-dashboard.html`, `teacher-portfolios.html`. Other pages have none.
- Navbars share the structure `<ul class="nav-list"><li><a class="nav-link">…</a></li></ul>` plus a user dropdown menu.

## Design

### Part 1 — Dark mode (CSS)

**1. Consolidate to a single source of truth.** Move all dark-mode rules into ONE `@media (prefers-color-scheme: dark)` block in `public/css/main.css` (loaded by every page), and remove the dark blocks from `responsive.css` and `accessibility.css`. Keep their non-dark rules intact.

**2. Fix at the token layer.** In the consolidated dark block, override the neutral/surface/platform tokens so token-driven components adapt automatically:
- Invert the grayscale family (as today): `--color-white`, `--color-lightest/lighter/light-gray`, `--color-gray`, `--color-dark-gray`, `--color-dark`.
- **Add the missing `--color-platform-*` and surface tokens**: `--color-platform-dark` → a light value (fixes `.nav-link` and `.btn-secondary` text/border in one move), `--color-surface`/`--color-canvas` → dark surfaces, and any `--color-platform-white` used as text.
- Keep `--color-error/warning/success/info` and brand hues; adjust only if contrast fails.

**3. Audit and patch stragglers.** Add dark-mode overrides (or convert to tokens) for components that use hardcoded colors and are visible on the covered pages: the navbar + `.nav-link` hover/active, `.dropdown-menu` surface + `.dropdown-item`, `.btn` variants (verify each variant's contrast), modals, cards, `.removed-notice`, `.portfolio-softcap-notice`, comment-thread UI, badges, and form controls. Each must reach normal text contrast on its dark surface.

**4. Preserve light mode.** All changes live inside the dark media query or add fallbacks that don't alter light rendering.

**Files:** `public/css/main.css` (consolidated dark block + straggler overrides), `public/css/responsive.css` (remove its dark block), `public/css/accessibility.css` (remove its dark block).

### Part 2 — Portfolio nav link (JS)

**Inject centrally in `UIComponents.initializeNavbar()`.** After role detection, build and insert a Portfolio link into the shared navbar so it appears on every page, without editing per-page HTML.

- **Role → destination mapping** (extract as a small pure helper for unit testing):
  - `STUDENT` → `{ label: 'My Portfolio', href: '/portfolio.html' }`
  - `TEACHER`, `SCHOOL_ADMIN`, `SITE_ADMIN` → `{ label: 'Student Portfolios', href: '/teacher-portfolios.html' }`
  - `BIDDER` (or unknown) → `null` (no link).
- **Insertion:** add a `<li><a class="nav-link">` to `.nav-list` and the matching `.dropdown-item` to the user dropdown menu. Render label via `textContent`.
- **Active state:** set `aria-current="page"` when the current path matches the link's href.
- **Idempotent:** if a nav link to that href already exists (the 4 pages that hardcode it), skip insertion — no duplicates. Guard by querying for an existing `.nav-link[href="…"]`.
- Uses the role already resolved from the stored user/token in `initializeNavbar` (same source the existing `isAdmin`/`isTeacher` checks use).

**Files:** `public/js/ui-components.js` (helper + injection in `initializeNavbar`).

## Testing

- No visual/DOM test harness exists; theming and DOM injection are verified by manual QA.
- **Unit test (Jest):** the pure role→{label,href} mapping helper (e.g. `portfolioNavTarget(role)`), covering STUDENT, TEACHER, SCHOOL_ADMIN, SITE_ADMIN, BIDDER, and unknown/empty.
- **Manual QA checklist:**
  - Dark mode: set OS to dark; on index, auctions, auction-detail, register, login, portfolio, teacher-portfolios, and a dashboard — verify buttons (primary + secondary), nav links, the user dropdown menu, notices, badges, form controls, and body text are all legible at normal contrast.
  - Light mode: same pages unchanged from today.
  - Portfolio link: as STUDENT, TEACHER, SCHOOL_ADMIN — the link appears once on every page with the correct label/destination and `aria-current` on the matching page; as BIDDER it does not appear; the 4 pages that already had it show no duplicate.
- Lint stays at 0 errors. Full Jest suite stays green.

## Rollout

Pure frontend (CSS + one JS file). Takes effect on the next deploy of `public/`. No migration, no startup DDL.
