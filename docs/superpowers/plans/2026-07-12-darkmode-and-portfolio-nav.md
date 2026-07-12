# Dark-Mode Legibility + Always-Visible Portfolio Nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app legible when the OS is in dark mode, and show a role-appropriate Portfolio link in the navbar on every page.

**Architecture:** Two independent frontend workstreams. (1) Consolidate the scattered `@media (prefers-color-scheme: dark)` CSS into one authoritative block in the last-loaded stylesheet, fixing the bulk via token overrides (esp. the `--color-platform-*`/surface tokens that made nav links and secondary buttons invisible) plus targeted overrides for hardcoded-color components. (2) Inject a role→destination Portfolio link centrally in `UIComponents.initializeNavbar()`, idempotently, so no per-page HTML edits are needed.

**Tech Stack:** Plain browser CSS + vanilla JS (no framework/build step); Jest (jsdom) for one pure helper.

## Global Constraints

- Frontend only. No backend, schema, or per-school-theming changes. Brand hues (coral primary, per-school colors) preserved; dark mode adjusts only neutrals, surfaces, text, borders.
- No manual light/dark toggle — auto-follow the OS `prefers-color-scheme` setting only.
- Light mode must render identically to today (all dark rules live inside `@media (prefers-color-scheme: dark)`).
- CSS load order per page is `theme.css → main.css → responsive.css → accessibility.css`. The consolidated dark block goes in **accessibility.css** (last-loaded) so its component rules win by source order; token (`:root`) overrides are order-independent.
- Render injected nav text via `textContent` — never `innerHTML`.
- Portfolio link role mapping: STUDENT → `{ 'My Portfolio', '/portfolio.html' }`; TEACHER/SCHOOL_ADMIN/SITE_ADMIN → `{ 'Student Portfolios', '/teacher-portfolios.html' }`; BIDDER/unknown → none. Injection is idempotent (skip if a link to that href already exists).
- Lint stays at 0 errors. Full Jest suite stays green (currently 831 on main; this branch starts there).

---

### Task 1: Always-visible Portfolio nav link (JS + unit test)

**Files:**
- Modify: `public/js/ui-components.js` (add two static methods; call one from `updateAuthUI` ~line 949)
- Test: `tests/unit/public/portfolioNav.test.js`

**Interfaces:**
- Produces: `UIComponents.portfolioNavTarget(role: string) => { label: string, href: string } | null`
- Produces: `UIComponents.injectPortfolioLink(role: string) => void` (DOM side effect; idempotent)
- Consumes: existing navbar DOM — `.nav-list` (top nav `<ul>`), `#user-dropdown` (dropdown menu), `#logout-btn` (last dropdown item). `window.location.pathname`.

- [ ] **Step 1: Write the failing unit test for the role mapping**

Create `tests/unit/public/portfolioNav.test.js`:

```js
/** @jest-environment jsdom */
const UIComponents = require('../../../public/js/ui-components.js');

describe('UIComponents.portfolioNavTarget', () => {
  test('STUDENT → My Portfolio', () => {
    expect(UIComponents.portfolioNavTarget('STUDENT'))
      .toEqual({ label: 'My Portfolio', href: '/portfolio.html' });
  });

  test.each(['TEACHER', 'SCHOOL_ADMIN', 'SITE_ADMIN'])('%s → Student Portfolios', (role) => {
    expect(UIComponents.portfolioNavTarget(role))
      .toEqual({ label: 'Student Portfolios', href: '/teacher-portfolios.html' });
  });

  test('BIDDER → null', () => {
    expect(UIComponents.portfolioNavTarget('BIDDER')).toBeNull();
  });

  test('unknown / empty / undefined → null', () => {
    expect(UIComponents.portfolioNavTarget('')).toBeNull();
    expect(UIComponents.portfolioNavTarget(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest tests/unit/public/portfolioNav.test.js`
Expected: FAIL — `UIComponents.portfolioNavTarget is not a function`.

- [ ] **Step 3: Add the two static methods to `public/js/ui-components.js`**

Inside the `class UIComponents { … }` body (place them just before `static initializeNavbar()` at ~line 877), add:

```js
  /**
   * Map a user role to its Portfolio nav destination.
   * @param {string} role
   * @returns {{label:string, href:string}|null}
   */
  static portfolioNavTarget(role) {
    if (role === 'STUDENT') {
      return { label: 'My Portfolio', href: '/portfolio.html' };
    }
    if (role === 'TEACHER' || role === 'SCHOOL_ADMIN' || role === 'SITE_ADMIN') {
      return { label: 'Student Portfolios', href: '/teacher-portfolios.html' };
    }
    return null;
  }

  /**
   * Inject the role-appropriate Portfolio link into the shared navbar (top nav
   * list + user dropdown), on every page. Idempotent: skips insertion if a link
   * to the same href already exists (pages that hardcode it).
   * @param {string} role
   */
  static injectPortfolioLink(role) {
    const target = UIComponents.portfolioNavTarget(role);
    if (!target) { return; }
    const onThisPage = window.location.pathname === target.href;

    // Top nav
    const navList = document.querySelector('.nav-list');
    if (navList && !navList.querySelector('a.nav-link[href="' + target.href + '"]')) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.href = target.href;
      a.textContent = target.label;
      if (onThisPage) { a.setAttribute('aria-current', 'page'); }
      li.appendChild(a);
      navList.appendChild(li);
    }

    // User dropdown menu
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown && !dropdown.querySelector('a.dropdown-item[href="' + target.href + '"]')) {
      const a = document.createElement('a');
      a.className = 'dropdown-item';
      a.setAttribute('role', 'menuitem');
      a.href = target.href;
      a.textContent = target.label;
      const logout = document.getElementById('logout-btn');
      if (logout) { dropdown.insertBefore(a, logout); } else { dropdown.appendChild(a); }
    }
  }
```

- [ ] **Step 4: Call the injector from the authenticated branch of `updateAuthUI`**

In `updateAuthUI` (~line 945–949), immediately after the `my-bids-link` block and before the closing `}` of the `if (authManager && authManager.isAuthenticated() …)` branch, add:

```js
      // Portfolio link — visible on every page for students/teachers/admins
      UIComponents.injectPortfolioLink(user.role);
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx jest tests/unit/public/portfolioNav.test.js`
Expected: PASS (6 test cases).

- [ ] **Step 6: Syntax + lint**

Run: `node --check public/js/ui-components.js`
Expected: OK.

Run: `npx eslint public/js/ui-components.js`
Expected: 0 errors (warnings acceptable). If new eslint errors appear, run `npx eslint --fix public/js/ui-components.js` and re-check — 0 errors is required.

- [ ] **Step 7: Full suite**

Run: `npm test`
Expected: green, 831 + 6 new = 837 passing, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui-components.js tests/unit/public/portfolioNav.test.js
git commit -m "feat(nav): inject role-aware Portfolio link on every page"
```

---

### Task 2: Dark-mode legibility (CSS consolidation + fixes)

**Files:**
- Modify: `public/css/responsive.css` (remove its `@media (prefers-color-scheme: dark)` block, ~lines 579–620)
- Modify: `public/css/accessibility.css` (replace its `@media (prefers-color-scheme: dark)` block, ~lines 569–585, with the consolidated authoritative block below)

**Interfaces:** none (pure CSS). Depends on the token names defined in `public/css/main.css :root` (`--color-dark`, `--color-white`, `--color-platform-dark`, `--color-platform-white`, `--color-surface`, `--color-canvas`, `--color-lighter-gray`, `--color-lightest-gray`, `--color-platform-coral`, `--color-primary-light`).

- [ ] **Step 1: Remove the dark block from `public/css/responsive.css`**

Delete the entire block starting at `@media (prefers-color-scheme: dark) {` (~line 579) through its closing `}` (~line 620, immediately before `/* ===== Reduced Motion ===== */`). Its rules are migrated into accessibility.css in Step 2. Leave the `prefers-reduced-motion` and `print` blocks that follow untouched.

- [ ] **Step 2: Replace the dark block in `public/css/accessibility.css`**

Replace the existing block (~lines 569–585, from `@media (prefers-color-scheme: dark) {` through its closing `}`) with this consolidated block:

```css
@media (prefers-color-scheme: dark) {
    /* ---- Token overrides (order-independent; fix the bulk of components) ---- */
    :root {
        /* Neutrals inverted */
        --color-dark: #f5f5f5;
        --color-dark-gray: #e0e0e0;
        --color-gray: #a0a0a0;
        --color-light-gray: #6b6b6b;
        --color-lighter-gray: #424242;
        --color-lightest-gray: #303030;
        --color-white: #1e1e1e;
        /* Platform/surface tokens — previously NOT inverted, which is why
           .nav-link and .btn-secondary (text/border = --color-platform-dark)
           rendered near-black on a dark background (invisible). */
        --color-platform-dark: #f0f0f0;
        --color-platform-white: #1e1e1e;
        --color-surface: #2a2a2a;
        --color-canvas: #181818;
        --color-disabled: #6b6b6b;
    }

    body {
        background-color: var(--color-canvas);
        color: var(--color-dark);
    }

    /* ---- Navbar + menus ---- */
    .navbar {
        background-color: var(--color-surface);
        border-bottom-color: var(--color-lighter-gray);
    }
    .nav-link:hover,
    .nav-link:focus {
        color: var(--color-platform-coral);
    }
    .user-dropdown {
        background-color: var(--color-surface);
        border-color: var(--color-lighter-gray);
    }
    .dropdown-item {
        color: var(--color-dark);
    }
    .dropdown-item:hover,
    .dropdown-item:focus {
        background-color: var(--color-lightest-gray);
    }

    /* ---- Surfaces ---- */
    .card,
    .auction-card,
    .stat-card,
    .modal-content,
    table {
        background-color: var(--color-surface);
        border-color: var(--color-lighter-gray);
        color: var(--color-dark);
    }
    .page-header {
        background-color: var(--color-lightest-gray);
    }
    thead {
        background-color: var(--color-lighter-gray);
    }
    .hero {
        background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);
    }

    /* ---- Forms ---- */
    .form-control {
        background-color: #2a2a2a;
        color: var(--color-dark);
        border-color: #505050;
    }
    .form-control:focus {
        border-color: var(--color-primary-light);
    }

    /* ---- Straggler components with hardcoded light palettes ---- */
    .removed-notice {
        background: #3a2c12;
        border-color: #6b501e;
        border-left-color: #f0a500;
    }
    .removed-notice__heading {
        color: #ffcc80;
    }
    .portfolio-softcap-notice {
        background: #14243a;
        border-color: #24466b;
        border-left-color: #4c9aff;
        color: #cfe0ff;
    }
    .school-combobox__listbox {
        background-color: var(--color-surface);
        border-color: var(--color-lighter-gray);
    }
    .school-combobox__option.is-active,
    .school-combobox__option:hover {
        background-color: #3a3a3a;
    }
    .comment-thread__list .comment {
        background-color: var(--color-lightest-gray);
    }
}
```

- [ ] **Step 3: Confirm no other `prefers-color-scheme: dark` block remains outside accessibility.css**

Run: `git grep -n "prefers-color-scheme: dark" public/css/`
Expected: exactly ONE match, in `public/css/accessibility.css`. (If `responsive.css` still matches, its block was not fully removed in Step 1 — fix it.)

- [ ] **Step 4: Verify light mode is untouched + lint**

Run: `npx stylelint public/css/accessibility.css public/css/responsive.css 2>/dev/null || echo "no stylelint configured — skip"`
Then: `npm run lint`
Expected: `0 errors` (JS lint unaffected; CSS is not linted by the JS eslint config). All dark rules are inside the media query, so light mode is unchanged by construction.

- [ ] **Step 5: Manual QA (record results) — set the OS to dark mode**

Load these pages and confirm every listed element is legible at normal contrast (dark surfaces, light text; no near-black-on-dark):
1. `index.html`, `auctions.html`, `auction-detail.html` — navbar links, primary + secondary buttons, cards, footer.
2. `login.html`, `register.html` — form controls, buttons, the school combobox dropdown (type ≥2 chars).
3. `portfolio.html` — cards, the "Comments (n)" + action buttons, the removed-pieces notice, the soft-cap notice, the comment thread modal.
4. `teacher-portfolios.html` / a dashboard — student cards, Remove/Restore buttons, tables.
5. Open the **user dropdown menu** on any page — background dark, items legible, hover state visible.
6. Buttons: hover states for `.btn-primary` and `.btn-secondary` are legible.
Then switch the OS back to **light** and spot-check 2–3 of the same pages to confirm they look exactly as before.
If any element is still unreadable, add a token-based override for it inside the same dark block (follow the pattern above: dark surface `var(--color-surface)`/`#2a2a2a`, light text `var(--color-dark)`), then re-verify.

- [ ] **Step 6: Commit**

```bash
git add public/css/accessibility.css public/css/responsive.css
git commit -m "fix(css): consolidate + complete dark-mode so buttons and menus are legible"
```

---

## Notes for the executor

- Tasks are independent; either order works, but do Task 1 first (it carries the automated test).
- After both tasks, run the final whole-branch review (opus) via `scripts/review-package $(git merge-base main HEAD) HEAD`, then `superpowers:finishing-a-development-branch`.
- Pure frontend; effective on the next deploy of `public/`. No migration, no startup DDL.
- Do not push without asking. Base is `main` (pushed at `59e3c72`); branch is `feature/darkmode-and-portfolio-nav`.
