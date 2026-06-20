# SAG Mosaic Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SAG interface with The Mosaic — near-black (#1A1A2E) + coral-red (#FF4136) editorial design, Fraunces + Bricolage Grotesque typography, and hybrid school theming where school colors appear only in auction context, never in global nav or hero.

**Architecture:** Multi-page HTML/CSS app. All changes are targeted CSS additions/replacements + HTML structure edits + minor index.js additions. No new routes, no new API endpoints, no new JS files.

**Tech Stack:** Vanilla HTML, CSS custom properties, Vanilla JS. Google Fonts CDN for Fraunces, Bricolage Grotesque, JetBrains Mono.

## Global Constraints

- CRITICAL: DB stores DECIMAL(10,2) dollars — NEVER divide bid amounts by 100
- `npm run lint` must exit 0 errors (baseline: 0 errors, 154 warnings)
- `npm test` must exit with 705 tests passing
- Fonts: Fraunces (display), Bricolage Grotesque (body), JetBrains Mono (mono) — NO Inter/Roboto/Arial/DM Sans/Cormorant Garant
- Weight extremes only: 200 vs 800 — never 400 vs 600 for emphasis
- Size jumps of 3× minimum between display and body text
- No purple-to-blue gradients on white backgrounds
- School theming: always use `var(--school-primary, var(--color-platform-dark, #1A1A2E))` as fallback in school-color slots — never naked `var(--school-primary)` without fallback
- Global nav and hero NEVER use `var(--color-primary)` or `var(--school-primary)` — platform colors only
- Dev server: `npm run dev` (nodemon, auto-reload) or `npm start` (one-shot) — app at http://localhost:3000

---

## File Map

| File | Role in this plan |
|---|---|
| `public/css/theme.css` | Font var update (Cormorant → Fraunces, DM Sans → Bricolage, Courier → JetBrains) |
| `public/css/main.css` | Platform color vars; nav rewrite; hero rewrite; card styles; page-header dark; auth split; filter bar; teacher hero; animations |
| `public/css/responsive.css` | Mobile breakpoints for hero, art strip, auth split, teacher stats |
| `public/index.html` | Font link; logo text; dark banner hero; art strip section |
| `public/auctions.html` | Font link; logo text; filter bar markup |
| `public/auction-detail.html` | Font link; logo text; school context bar |
| `public/bidder-welcome.html` | Font link; logo text; hero h1; inline style overrides |
| `public/login.html` | Font link; logo text; split layout wrapper |
| `public/register.html` | Font link; logo text; split layout wrapper |
| `public/2fa-verify.html` | Font link; logo text; split layout wrapper |
| `public/teacher-dashboard.html` | Font link; logo text; teacher hero section; stats row |
| `public/js/index.js` | `initArtStrip()` function; `initArtStripReveal()` Intersection Observer |
| `public/js/auction-detail.js` | Populate school context bar |
| `public/js/teacher-dashboard.js` | Populate teacher hero name + school badge + stats |

---

### Task 1: Foundation — Font System + Platform Colors

**Files:**
- Modify: `public/css/theme.css` (lines 6–33 — font vars + typography application)
- Modify: `public/css/main.css` (inside `:root` block before closing `}` ~line 118 — add platform colors)
- Modify: 8 HTML files (replace Google Fonts `<link>` in `<head>`)

**Interfaces:**
- Produces: CSS vars `--font-display`, `--font-body`, `--font-mono`, `--color-platform-dark`, `--color-platform-coral`, `--color-canvas`, `--color-surface`, `--color-teacher-hero` — consumed by every subsequent task

- [ ] **Step 1: Update font variables in `public/css/theme.css`**

Find and replace the Font Variables `:root` block and Typography Application section (lines 6–33):

Old:
```css
/* ===== Font Variables ===== */
/* Fonts are loaded via <link> in HTML for performance. */
/* Fallback stacks ensure graceful degradation. */
:root {
    --font-display: 'Cormorant Garant', Georgia, 'Times New Roman', serif;
    --font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
    --font-mono: 'Courier New', Courier, monospace;
}

/* ===== Typography Application ===== */
/* Apply display font to headings for a refined gallery aesthetic */
h1, h2, h3 {
    font-family: var(--font-display);
    letter-spacing: -0.01em;
}

.logo-text {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.05em;
}

.hero h1,
.auth-header h1,
.page-header h1 {
    font-family: var(--font-display);
    font-style: italic;
}
```

New:
```css
/* ===== Font Variables ===== */
/* Fonts are loaded via <link> in HTML for performance. */
/* Fallback stacks ensure graceful degradation. */
:root {
    --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
    --font-body:    'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
    --font-mono:    'JetBrains Mono', 'Courier New', Courier, monospace;
}

/* ===== Typography Application ===== */
h1, h2, h3 {
    font-family: var(--font-display);
    letter-spacing: -0.02em;
}

.logo-text {
    font-family: var(--font-body);
    font-weight: 800;
    letter-spacing: -0.02em;
    text-transform: uppercase;
}

.hero h1,
.auth-header h1,
.page-header h1 {
    font-family: var(--font-display);
    font-style: italic;
}
```

- [ ] **Step 2: Add platform color variables to `public/css/main.css`**

Find the closing `}` of the `:root` block (the line after `--z-tooltip: 1002;`, around line 118). Insert these lines immediately BEFORE that closing `}`:

```css
    /* ---- Platform Brand Colors (never overridden by school theme) ---- */
    --color-platform-dark:  #1A1A2E;
    --color-platform-coral: #FF4136;
    --color-platform-white: #FFFFFF;
    --color-canvas:         #F4F4F4;
    --color-surface:        #FFFFFF;
    --color-teacher-hero:   #2A3550;
```

- [ ] **Step 3: Replace Google Fonts `<link>` in all 8 HTML files**

In each of these files: `index.html`, `auctions.html`, `auction-detail.html`, `bidder-welcome.html`, `login.html`, `register.html`, `2fa-verify.html`, `teacher-dashboard.html` —

Find the Google Fonts stylesheet link (the `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garant...">` line) and replace it with:

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,200;0,9..144,800;1,9..144,200;1,9..144,800&family=Bricolage+Grotesque:opsz,wght@12..96,200;12..96,400;12..96,800&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
```

Also update the HTML comment above the preconnects (where it exists) from:
`<!-- Google Fonts: Cormorant Garant (headings) + DM Sans (body) -->`
to:
`<!-- Google Fonts: Fraunces (display) + Bricolage Grotesque (body) + JetBrains Mono (mono) -->`

In `bidder-welcome.html` only: also find the `<style>` block that hardcodes `font-family: 'Cormorant Garant', serif` and replace those occurrences with `var(--font-display)`. (Search for `'Cormorant Garant'` in that file.)

- [ ] **Step 4: Test Task 1**

```
npm run dev
```

Open http://localhost:3000. Open DevTools → select the `<h1>` → Computed tab → confirm `font-family` starts with `Fraunces`. Open http://localhost:3000/login.html → select body text → confirm `font-family` starts with `Bricolage Grotesque`. If fonts don't load (offline), fallback to `Georgia`/`-apple-system` is acceptable.

- [ ] **Step 5: Lint + test**

```
npm run lint
npm test
```

Expected: 0 lint errors, 705 tests passing. (No logic changed — font links and CSS vars only.)

- [ ] **Step 6: Commit**

```bash
git add public/css/theme.css public/css/main.css public/index.html public/auctions.html public/auction-detail.html public/bidder-welcome.html public/login.html public/register.html public/2fa-verify.html public/teacher-dashboard.html
git commit -m "feat: mosaic T1 - Fraunces/Bricolage font system + platform color vars"
```

---

### Task 2: Global Navigation — Mosaic Nav Styling

**Files:**
- Modify: `public/css/main.css` (`.navbar`, `.logo`, `.logo-img`, `.nav-link`, `.btn-primary`, `.btn-secondary` blocks)
- Modify: 8 HTML files (logo text `SAG` → `SAG·LIVE` in all in-scope pages)

**Interfaces:**
- Consumes: `--color-platform-dark`, `--color-platform-coral`, `--font-body` from Task 1
- Produces: Mosaic nav visible on every page; coral CTAs; dark-bordered nav

- [ ] **Step 1: Update logo text HTML in all 8 in-scope files**

In each of the 8 HTML files, find:
```html
<span class="logo-text">SAG</span>
```
Replace with:
```html
<span class="logo-text">SAG<span class="logo-dot" aria-hidden="true">·</span>LIVE</span>
```

- [ ] **Step 2: Update `.navbar` in `public/css/main.css`**

Find:
```css
.navbar {
    background-color: var(--color-white);
    border-bottom: 1px solid var(--color-lighter-gray);
    box-shadow: var(--shadow-sm);
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
}
```
Replace with:
```css
.navbar {
    background-color: var(--color-platform-white, #fff);
    border-bottom: 3px solid var(--color-platform-dark, #1A1A2E);
    box-shadow: none;
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
}
```

- [ ] **Step 3: Update `.logo` and `.logo-img` in `public/css/main.css`**

Find:
```css
.logo {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--color-primary);
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
}
```
Replace with:
```css
.logo {
    font-size: var(--font-size-2xl);
    font-weight: 800;
    color: var(--color-platform-dark, #1A1A2E);
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
}
```

Find:
```css
.logo-img {
    height: 100px;
    width: auto;
    max-width: 150px;
    object-fit: contain;
    border-radius: 50%;
}
```
Replace with:
```css
.logo-img {
    display: none;
}
```

After the `.logo-text` rule in main.css (around line 268), add:
```css
.logo-dot {
    color: var(--color-platform-coral, #FF4136);
}
```

- [ ] **Step 4: Update `.nav-link` styles in `public/css/main.css`**

Find:
```css
.nav-link {
    color: var(--color-dark-gray);
    text-decoration: none;
    font-weight: 500;
    font-size: 14px;
    padding: 7px 15px;
    border-radius: 8px;
    border: 1.5px solid transparent;
    display: inline-flex;
    align-items: center;
    backface-visibility: hidden;
    transform: translate3d(0, 0, 0);
    transition: all .3s;
    letter-spacing: 0.01em;
    white-space: nowrap;
    cursor: pointer;
}
```
Replace with:
```css
.nav-link {
    color: var(--color-platform-dark, #1A1A2E);
    text-decoration: none;
    font-family: var(--font-body);
    font-weight: 200;
    font-size: 13px;
    padding: 7px 15px;
    border-radius: 0;
    border: 1.5px solid transparent;
    display: inline-flex;
    align-items: center;
    backface-visibility: hidden;
    transform: translate3d(0, 0, 0);
    transition: all .3s;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
}
```

Find:
```css
.nav-link:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
    background-color: transparent;
    text-decoration: none;
    transform: translate3d(0, -1px, 0);
}
```
Replace with:
```css
.nav-link:hover {
    color: var(--color-platform-coral, #FF4136);
    border-color: var(--color-platform-coral, #FF4136);
    background-color: transparent;
    text-decoration: none;
    transform: translate3d(0, -1px, 0);
}
```

Find:
```css
.nav-link.active {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
    font-weight: 600;
}
```
Replace with:
```css
.nav-link.active {
    background-color: var(--color-platform-dark, #1A1A2E);
    border-color: var(--color-platform-dark, #1A1A2E);
    color: #fff;
    font-weight: 800;
}
```

- [ ] **Step 5: Update `.btn-primary` and `.btn-secondary` in `public/css/main.css`**

Find:
```css
/* Primary Button */
.btn-primary {
    background-color: var(--color-primary);
    color: #fff;
}

.btn-primary:hover {
    background-color: var(--color-primary-dark);
    opacity: 0.92;
    transform: translate3d(0, -2px, 0);
    text-decoration: none;
    color: #fff;
}
```
Replace with:
```css
/* Primary Button — Mosaic coral */
.btn-primary {
    background-color: var(--color-platform-coral, #FF4136);
    color: #fff;
    border-radius: 0;
    font-family: var(--font-body);
    font-weight: 800;
}

.btn-primary:hover {
    background-color: var(--color-platform-coral, #FF4136);
    filter: brightness(0.88);
    opacity: 1;
    transform: translate3d(0, -2px, 0);
    text-decoration: none;
    color: #fff;
}
```

Find the `.btn-secondary {` block and replace its body:
```css
/* Secondary Button — Mosaic ghost */
.btn-secondary {
    background-color: transparent;
    color: var(--color-platform-dark, #1A1A2E);
    border: 1.5px solid var(--color-platform-dark, #1A1A2E);
    border-radius: 0;
    font-family: var(--font-body);
    font-weight: 200;
}

.btn-secondary:hover {
    background-color: var(--color-platform-dark, #1A1A2E);
    color: #fff;
    border-color: var(--color-platform-dark, #1A1A2E);
    transform: translate3d(0, -2px, 0);
    text-decoration: none;
    filter: none;
}
```

- [ ] **Step 6: Test Task 2**

```
npm run dev
```

Open http://localhost:3000. Verify:
- Nav has white background with 3px `#1A1A2E` bottom border, no shadow
- Logo shows `SAG·LIVE` — dot is coral, "SAG" and "LIVE" are dark. Logo image is hidden.
- Nav links are thin (200 weight), uppercase, 0.08em letter-spacing
- Hovering a nav link turns it coral
- "Sign Up" / "Browse Auctions" buttons are coral with sharp (0) corners
- "Login" / "Sign In" buttons are dark ghost with sharp corners

- [ ] **Step 7: Commit**

```bash
git add public/css/main.css public/index.html public/auctions.html public/auction-detail.html public/bidder-welcome.html public/login.html public/register.html public/2fa-verify.html public/teacher-dashboard.html
git commit -m "feat: mosaic T2 - nav rewrite: dark border, SAG·LIVE logo, coral CTAs, ghost secondary"
```

---

### Task 3: Home Page — Dark Banner Hero + Art Strip

**Files:**
- Modify: `public/index.html` (hero section HTML; add art strip section; remove dead lightbox markup)
- Modify: `public/css/main.css` (replace `.hero` block; add art strip CSS; fix `.main-content` padding)
- Modify: `public/js/index.js` (add `initArtStrip()`; add `initArtStripReveal()` stub called from init)

**Interfaces:**
- Consumes: `--color-platform-dark`, `--color-platform-coral`, `--font-display`, `--font-body` from Task 1; `.btn-primary`, `.btn-hero-ghost` from this task
- Produces: `initArtStrip()` populates `#art-strip-track` from `/api/auctions/carousel`; clicking navigates to `/auction-detail.html?id={auctionId}`

- [ ] **Step 1: Replace hero section HTML in `public/index.html`**

Find the entire hero section (starting with `<!-- Hero Section -->`, ending with `</section>`):
```html
        <!-- Hero Section -->
        <section class="hero" role="region" aria-label="Hero Section">
            <div class="hero-content">
                <h1>Silent Auction Gallery</h1>
                <p class="hero-subtitle">Supporting Education Through Art</p>
                <div class="hero-image" style="margin-bottom:50px;">
                    <div class="hero-carousel" id="hero-carousel" aria-label="Artwork showcase">
                        <div class="carousel-track" id="carousel-track"></div>
                        <button class="carousel-btn carousel-prev" id="carousel-prev" aria-label="Previous artwork" style="display:none">&#8249;</button>
                        <button class="carousel-btn carousel-next" id="carousel-next" aria-label="Next artwork">&#8250;</button>
                        <div class="carousel-dots" id="carousel-dots"></div>
                        <div class="carousel-info" id="carousel-info"></div>
                    </div>
                </div>
                <a href="/auctions.html" class="btn btn-large" id="browse-auctions-btn">Browse Auctions</a>
            </div>
        </section>
```

Replace with:
```html
        <!-- Hero Section — Mosaic Dark Banner -->
        <section class="hero" role="region" aria-label="Home hero">
            <div class="hero-inner">
                <span class="hero-eyebrow">Spring 2026 · Student Art Showcase</span>
                <h1 class="hero-headline">Art that <em class="hero-accent">changes</em> everything.</h1>
                <p class="hero-sub">Original student artwork. Every bid funds school programs.</p>
                <div class="hero-ctas">
                    <a href="/auctions.html" class="btn btn-primary" id="browse-auctions-btn">Browse Auctions</a>
                    <a href="/bidder-welcome.html" class="btn btn-hero-ghost">How it works</a>
                </div>
            </div>
        </section>

        <!-- Art Strip -->
        <section class="art-strip" role="region" aria-label="Featured artworks">
            <div class="art-strip-track" id="art-strip-track">
                <!-- Populated by initArtStrip() in index.js from /api/auctions/carousel -->
            </div>
        </section>
```

Also remove the existing lightbox markup block (if present — added in a previous session, now dead code since art strip navigates directly). Find and delete the `<div id="artwork-lightbox-home" class="artwork-lightbox-home"...>` block through its closing `</div>`.

- [ ] **Step 2: Fix `.main-content` top padding on home page in `public/css/main.css`**

Find the `.main-content` rule (around line 213):
```css
.main-content {
    padding-top: var(--spacing-2xl);
    padding-bottom: var(--spacing-2xl);
    flex: 1;
}
```

After that block, add:
```css
/* Home page: hero is flush to nav, no container padding */
.main-content:has(.hero) {
    padding-top: 0;
    padding-bottom: 0;
}
```

- [ ] **Step 3: Replace `.hero` CSS block in `public/css/main.css`**

Find the `/* ===== Hero Section ===== */` comment and the following `.hero`, `.hero-content`, `.hero-image`, `.hero-img` rules (lines ~886–916). Replace all four rules with:

```css
/* ===== Hero Section — Mosaic Dark Banner ===== */
.hero {
    background: var(--color-platform-dark, #1A1A2E);
    color: #fff;
    padding: clamp(3rem, 8vw, 6rem) 2rem clamp(2.5rem, 6vw, 5rem);
    position: relative;
    overflow: hidden;
    margin-bottom: 0;
    border-radius: 0;
}

.hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 85% 50%, rgba(255, 65, 54, 0.07), transparent 60%);
    pointer-events: none;
}

.hero-inner {
    position: relative;
    z-index: 1;
    max-width: 900px;
}

.hero-eyebrow {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-platform-coral, #FF4136);
    margin-bottom: 1.5rem;
}

.hero-eyebrow::before {
    content: '';
    display: inline-block;
    width: 2rem;
    height: 1.5px;
    background: var(--color-platform-coral, #FF4136);
    flex-shrink: 0;
}

.hero-headline {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    font-size: clamp(4rem, 10vw, 8rem);
    line-height: 0.95;
    color: #fff;
    margin-bottom: 2rem;
    letter-spacing: -0.03em;
}

.hero-accent {
    color: var(--color-platform-coral, #FF4136);
    font-style: italic;
}

.hero-sub {
    font-family: var(--font-body);
    font-weight: 200;
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 2.5rem;
    max-width: 480px;
    line-height: 1.6;
}

.hero-ctas {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
}

.btn-hero-ghost {
    background: transparent;
    border: 1.5px solid rgba(255, 255, 255, 0.45);
    color: #fff;
    border-radius: 0;
    padding: 14px 30px;
    font-family: var(--font-body);
    font-weight: 200;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: border-color 200ms ease, background 200ms ease;
    height: 50px;
    white-space: nowrap;
    cursor: pointer;
    font-size: 15px;
}

.btn-hero-ghost:hover {
    border-color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    text-decoration: none;
}
```

- [ ] **Step 4: Remove old lightbox CSS from `public/css/main.css`**

Search for the `.artwork-lightbox-home` CSS block (added in a prior session). Remove the entire block — from `.artwork-lightbox-home {` through the end of the associated rules (`.lightbox-home-img`, `.lightbox-home-info`, `.lightbox-home-title`, `.lightbox-home-meta`, `.lightbox-home-close`). These are dead rules now.

- [ ] **Step 5: Add art strip CSS to `public/css/main.css`**

Append to the end of `main.css`:

```css
/* ===== Art Strip (Home Page) ===== */
.art-strip {
    background: #fff;
    border-top: 3px solid var(--color-platform-dark, #1A1A2E);
    border-bottom: 3px solid var(--color-platform-dark, #1A1A2E);
    overflow: hidden;
}

.art-strip-track {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}

.art-strip-track::-webkit-scrollbar { display: none; }

.art-strip-thumb {
    flex: 0 0 200px;
    height: 160px;
    position: relative;
    cursor: pointer;
    scroll-snap-align: start;
    border-right: 1px solid var(--color-platform-dark, #1A1A2E);
    overflow: hidden;
}

.art-strip-thumb:last-child { border-right: none; }

.art-strip-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 200ms ease;
}

.art-strip-thumb:hover img { transform: scale(1.04); }

.art-strip-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.5rem 0.75rem;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
    opacity: 0;
    transition: opacity 200ms ease;
}

.art-strip-thumb:hover .art-strip-overlay { opacity: 1; }

.art-strip-price {
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.875rem;
    color: #fff;
}
```

- [ ] **Step 6: Add `initArtStrip()` to `public/js/index.js`**

Near the end of `index.js` (after the existing `_closeHomeLightbox` function or equivalent), add:

```js
async function initArtStrip() {
    const track = document.getElementById('art-strip-track');
    if (!track) { return; }
    let items;
    try {
        const res = await fetch('/api/auctions/carousel');
        if (!res.ok) { return; }
        items = await res.json();
    } catch (_) {
        return; // fail silently — art strip is non-critical
    }
    if (!Array.isArray(items) || items.length === 0) { return; }
    track.innerHTML = '';
    items.slice(0, 8).forEach(item => {
        if (!item.imageUrl || !/^(https?:|\/|data:image\/)/.test(item.imageUrl)) { return; }
        const thumb = document.createElement('div');
        thumb.className = 'art-strip-thumb';
        thumb.setAttribute('role', 'button');
        thumb.setAttribute('tabindex', '0');
        thumb.setAttribute('aria-label', `${item.title || 'Artwork'} — view auction`);
        const bid = item.currentBid != null
            ? `<span class="art-strip-price">$${Number(item.currentBid).toFixed(2)}</span>`
            : '';
        const imgAlt = (item.title || 'Student artwork').replace(/"/g, '&quot;');
        thumb.innerHTML =
            `<img src="${item.imageUrl}" alt="${imgAlt}" loading="lazy">` +
            `<div class="art-strip-overlay">${bid}</div>`;
        const navigate = () => {
            if (item.auctionId) {
                window.location.href = `/auction-detail.html?id=${encodeURIComponent(item.auctionId)}`;
            }
        };
        thumb.addEventListener('click', navigate);
        thumb.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(); }
        });
        track.appendChild(thumb);
    });
}
```

- [ ] **Step 7: Call `initArtStrip()` from the init entry point in `public/js/index.js`**

Find the `DOMContentLoaded` event listener or the `init()` call that runs on page load. Add `initArtStrip();` there. The existing `initCarousel()` call will do nothing (its DOM element `#hero-carousel` no longer exists) — leave it in place, no change needed.

- [ ] **Step 8: Test Task 3**

```
npm run dev
```

Open http://localhost:3000. Verify:
- Hero is dark (#1A1A2E), flush to the nav (no gap above)
- Eyebrow "SPRING 2026 · STUDENT ART SHOWCASE" appears in coral with a leading dash line
- Headline "Art that changes everything." in Fraunces italic 800 — "changes" in coral
- Subtitle text is faded white (50% opacity) Bricolage 200
- "Browse Auctions" button is coral, "How it works" is white ghost border
- Art strip below: row of 200px-wide artwork thumbnails, horizontally scrollable
- Clicking a thumbnail navigates to `/auction-detail.html?id=…`
- No JS errors in DevTools console

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/css/main.css public/js/index.js
git commit -m "feat: mosaic T3 - dark banner hero + art strip (replaces carousel)"
```

---

### Task 4: Home Page — Featured Grid + Auction Cards

**Files:**
- Modify: `public/css/main.css` (`.auction-card`, `.featured-auctions`, `.how-it-works`, `.step`, `.step-number`)

**Interfaces:**
- Consumes: `--color-platform-dark`, `--color-platform-coral`, `--color-canvas`, `--font-display`, `--font-body` from Task 1; `--school-primary` from existing `theme-manager.js` (unchanged)
- Produces: `.auction-card` Mosaic style consumed by every page with cards; `.card-school-name`, `.card-title-mosaic`, `.card-bid-mosaic` utility classes

- [ ] **Step 1: Rewrite `.auction-card` border + shape in `public/css/main.css`**

Find:
```css
.auction-card {
    background-color: white;
    border: 1px solid var(--color-lighter-gray);
```

Replace just those two opening property lines (keep the rest of the `.auction-card` block intact):
```css
.auction-card {
    background: var(--color-surface, #fff);
    border: 2px solid var(--school-primary, var(--color-platform-dark, #1A1A2E));
    border-radius: 0;
```

Find the existing `.auction-card:hover` rule (if present). Replace or add:
```css
.auction-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(26, 26, 46, 0.15);
    border-color: var(--school-primary, var(--color-platform-dark, #1A1A2E));
}
```

- [ ] **Step 2: Add card typography utility classes to `public/css/main.css`**

After the `.auction-card` block, add:

```css
/* Auction card Mosaic typography utilities */
.card-school-name {
    color: var(--school-primary, var(--color-platform-dark, #1A1A2E));
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.card-title-mosaic {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 400;
    font-size: 1.1rem;
    color: var(--color-platform-dark, #1A1A2E);
    margin-bottom: 0.25rem;
    line-height: 1.2;
}

.card-bid-mosaic {
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 1.25rem;
    color: var(--color-platform-coral, #FF4136);
}

.card-time-mosaic {
    font-family: var(--font-body);
    font-weight: 200;
    font-size: 0.8rem;
    color: var(--color-gray, #757575);
}

.card-bid-link {
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-platform-coral, #FF4136);
    text-decoration: none;
}

.card-bid-link:hover {
    text-decoration: underline;
    color: var(--color-platform-coral, #FF4136);
}

/* Featured card: larger, left border accent */
.auction-card.auction-card--featured {
    border-left: 4px solid var(--school-primary, var(--color-platform-coral, #FF4136));
}
```

- [ ] **Step 3: Update `.featured-auctions` section in `public/css/main.css`**

Find the `.featured-auctions` rule and update:
```css
.featured-auctions {
    background: var(--color-canvas, #F4F4F4);
    padding: var(--spacing-2xl) 0;
}

.featured-auctions h2 {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    font-size: clamp(2rem, 5vw, 3rem);
    color: var(--color-platform-dark, #1A1A2E);
    margin-bottom: var(--spacing-xl);
    letter-spacing: -0.02em;
}
```

- [ ] **Step 4: Update `.how-it-works` and `.step` in `public/css/main.css`**

Find the `.how-it-works` block and update:
```css
.how-it-works {
    background: var(--color-platform-dark, #1A1A2E);
    color: #fff;
    padding: var(--spacing-2xl) 0;
}

.how-it-works h2 {
    color: #fff;
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    letter-spacing: -0.02em;
}

.step-number {
    color: var(--color-platform-coral, #FF4136);
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    font-size: clamp(3rem, 8vw, 5rem);
    line-height: 1;
}

.step h3 {
    color: #fff;
    font-family: var(--font-body);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
}

.step p {
    color: rgba(255, 255, 255, 0.5);
    font-family: var(--font-body);
    font-weight: 200;
}
```

- [ ] **Step 5: Test Task 4**

```
npm run dev
```

Scroll past the hero on http://localhost:3000. Verify:
- "Featured Auctions" section has off-white (#F4F4F4) background
- Auction cards have 2px dark border (or school-colored when school is active), 0 border-radius
- Card hover lifts card 4px with shadow
- "How It Works" section is dark (#1A1A2E) background with large coral Fraunces numbers, white headings, faded white body

- [ ] **Step 6: Commit**

```bash
git add public/css/main.css
git commit -m "feat: mosaic T4 - auction card Mosaic style, featured grid, how-it-works dark section"
```

---

### Task 5: Auctions List Page

**Files:**
- Modify: `public/auctions.html` (add filter bar HTML after page-header)
- Modify: `public/css/main.css` (rewrite `.page-header`; add `.filter-bar` CSS)

**Interfaces:**
- Consumes: `--color-platform-dark`, `--color-platform-coral`, `--font-body`, `--font-display` from Task 1
- Produces: `.page-header` dark-banner style (also affects teacher-dashboard.html where not replaced by teacher hero in Task 8)

- [ ] **Step 1: Rewrite `.page-header` CSS in `public/css/main.css`**

Find:
```css
/* ===== Page Header ===== */
.page-header {
    background-color: var(--color-lightest-gray);
    padding: var(--spacing-2xl) var(--spacing-lg);
```

Replace the opening lines of `.page-header` (keep the closing `}` and any other properties, just replace those two):
```css
/* ===== Page Header — Mosaic Dark Mini-Banner ===== */
.page-header {
    background-color: var(--color-platform-dark, #1A1A2E);
    color: #fff;
    padding: var(--spacing-xl) var(--spacing-lg);
    max-height: 200px;
```

After the closing `}` of `.page-header`, add:
```css
.page-header h1 {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    font-size: clamp(2rem, 5vw, 3.5rem);
    color: #fff;
    letter-spacing: -0.02em;
    margin-bottom: var(--spacing-xs);
}

.page-header p {
    font-family: var(--font-body);
    font-weight: 200;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 0;
    font-size: var(--font-size-base);
}
```

- [ ] **Step 2: Add filter bar CSS to `public/css/main.css`**

After the `.page-header p` rule, add:

```css
/* ===== Auction Filter Bar ===== */
.filter-bar {
    background: #fff;
    border-bottom: 2px solid var(--color-platform-dark, #1A1A2E);
    padding: var(--spacing-md) var(--spacing-lg);
    position: sticky;
    top: 67px; /* approx navbar height */
    z-index: calc(var(--z-sticky) - 1);
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex-wrap: wrap;
}

.filter-bar label {
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-platform-dark, #1A1A2E);
}

.filter-bar select {
    font-family: var(--font-body);
    font-weight: 200;
    font-size: 0.875rem;
    border: 1.5px solid var(--color-platform-dark, #1A1A2E);
    border-radius: 0;
    padding: 6px 12px;
    background: #fff;
    color: var(--color-platform-dark, #1A1A2E);
    cursor: pointer;
    appearance: auto;
}

.filter-bar select:focus {
    outline: 2px solid var(--color-platform-coral, #FF4136);
    outline-offset: 1px;
}

.filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--color-platform-coral, #FF4136);
    color: #fff;
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 0;
    border: none;
    cursor: pointer;
    transition: filter 200ms ease;
}

.filter-chip:hover { filter: brightness(0.88); }
```

- [ ] **Step 3: Add filter bar HTML to `public/auctions.html`**

In `auctions.html`, find the `<section class="page-header"...>` block. After its closing `</section>`, insert:

```html
        <!-- Filter Bar -->
        <div class="filter-bar" role="search" aria-label="Filter auctions">
            <label for="filter-school">School</label>
            <select id="filter-school" name="school" aria-label="Filter by school">
                <option value="">All Schools</option>
            </select>
            <label for="filter-grade">Grade</label>
            <select id="filter-grade" name="grade" aria-label="Filter by grade">
                <option value="">All Grades</option>
            </select>
            <label for="filter-medium">Medium</label>
            <select id="filter-medium" name="medium" aria-label="Filter by medium">
                <option value="">All Media</option>
            </select>
            <div id="active-filters" aria-label="Active filters" aria-live="polite" style="display:flex;gap:0.5rem;flex-wrap:wrap;"></div>
        </div>
```

Note: Filter options are static placeholders; wiring filter logic is out of this scope.

- [ ] **Step 4: Update form focus to coral in `public/css/main.css`**

Find `.form-control:focus` and update to:
```css
.form-control:focus {
    outline: none;
    border-color: var(--color-platform-coral, #FF4136);
    box-shadow: 0 0 0 3px rgba(255, 65, 54, 0.15);
}
```

- [ ] **Step 5: Test Task 5**

```
npm run dev
```

Open http://localhost:3000/auctions.html. Verify:
- Page header is dark (#1A1A2E) with white Fraunces italic "Browse Auctions" headline and faded subtitle
- Filter bar appears below: white, 2px dark bottom border, select elements with dark border/0 radius
- Auction card grid is Mosaic-styled (sharp corners, school-colored border)
- Focus on a filter select shows coral outline ring

- [ ] **Step 6: Commit**

```bash
git add public/auctions.html public/css/main.css
git commit -m "feat: mosaic T5 - auctions list dark page header + filter bar"
```

---

### Task 6: Auction Detail Page — School Context Bar + Bid Panel

**Files:**
- Modify: `public/auction-detail.html` (add school context bar HTML before artwork image section)
- Modify: `public/css/main.css` (school context bar CSS; dark artwork surround; bid panel mono font)
- Modify: `public/js/auction-detail.js` (populate context bar after auction data loads)

**Interfaces:**
- Consumes: `--school-primary` (set by `ThemeManager.apply()` at runtime), `--color-platform-dark`, `--color-platform-coral`, `--font-display`, `--font-mono` from Task 1
- Produces: `.school-context-bar` updates automatically when school theme changes

- [ ] **Step 1: Add school context bar HTML to `public/auction-detail.html`**

Find:
```html
                    <!-- Artwork Image -->
                    <div class="artwork-image-section">
```

Immediately BEFORE that line, insert:
```html
                    <!-- School Context Bar (school-primary colored; populated by JS) -->
                    <div class="school-context-bar" id="school-context-bar" hidden>
                        <span class="school-context-name" id="school-context-name"></span>
                        <span class="school-context-divider" aria-hidden="true">·</span>
                        <span class="school-context-auction" id="school-context-auction"></span>
                    </div>
```

- [ ] **Step 2: Add auction detail CSS to `public/css/main.css`** (append to end)

```css
/* ===== Auction Detail — Mosaic ===== */
.school-context-bar {
    background: var(--school-primary, var(--color-platform-dark, #1A1A2E));
    color: #fff;
    padding: 0.6rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: background 300ms ease;
}

.school-context-divider {
    opacity: 0.4;
    font-weight: 200;
}

.school-context-auction {
    font-weight: 200;
    opacity: 0.8;
    text-transform: none;
    letter-spacing: 0.02em;
}

.artwork-image-wrapper {
    background: var(--color-platform-dark, #1A1A2E);
}

.artwork-image {
    max-height: 70vh;
    object-fit: contain;
    width: 100%;
    display: block;
}

/* Bid panel school-color left border */
.bid-panel,
.bid-section {
    border-left: 3px solid var(--school-primary, var(--color-platform-dark, #1A1A2E));
}

/* Current bid: Fraunces italic 800, coral (primary display value) */
.bid-panel .current-bid,
.bid-amount,
#current-bid {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    font-size: var(--font-size-3xl);
    color: var(--color-platform-coral, #FF4136);
}

/* Lot numbers, timestamps: JetBrains Mono */
.lot-number,
.bid-timestamp,
.lot-id {
    font-family: var(--font-mono);
    font-weight: 400;
    font-size: 0.875rem;
    color: var(--color-gray, #757575);
}
```

- [ ] **Step 3: Populate school context bar in `public/js/auction-detail.js`**

Find where the loaded auction data is applied to the page (search for `document.title =` or where `artwork-title-small` or similar elements are set after the API response). After the auction name/title is applied, add:

```js
// Mosaic: school context bar
const ctxBar  = document.getElementById('school-context-bar');
const ctxName = document.getElementById('school-context-name');
const ctxAuct = document.getElementById('school-context-auction');
if (ctxBar && ctxName && ctxAuct) {
    ctxName.textContent = auction.schoolName || '';
    ctxAuct.textContent = auction.name || '';
    ctxBar.hidden = !(auction.schoolName || auction.name);
}
```

Verify the field names `auction.schoolName` and `auction.name` match what the API actually returns. Search the existing JS for how `document.getElementById('artwork-title-small')` or the breadcrumb is populated — the auction name field is the same one used there.

- [ ] **Step 4: Test Task 6**

```
npm run dev
```

Navigate to an auction detail page (e.g., click a card on the auctions list or art strip). Verify:
- School context bar appears below nav — colored by school primary color (or dark fallback)
- Bar shows: SCHOOL NAME · Auction Name
- Artwork image has dark (#1A1A2E) background surround (for portraits, non-square art)
- Bid panel has 3px left border in school color (or dark)
- Current bid amount is Fraunces italic 800 coral
- Lot numbers/timestamps (if present) are JetBrains Mono

- [ ] **Step 5: Commit**

```bash
git add public/auction-detail.html public/css/main.css public/js/auction-detail.js
git commit -m "feat: mosaic T6 - auction detail school context bar + dark artwork surround + bid panel"
```

---

### Task 7: Auth Pages — Split Layout

**Files:**
- Modify: `public/login.html` (add split layout wrapper)
- Modify: `public/register.html` (add split layout wrapper)
- Modify: `public/2fa-verify.html` (add split layout wrapper)
- Modify: `public/css/main.css` (auth split layout CSS)

**Interfaces:**
- Consumes: `--color-platform-dark`, `--color-platform-coral`, `--font-display`, `--font-body` from Task 1
- Produces: `.auth-split-left` + `.auth-split-right` layout used by all 3 auth pages

- [ ] **Step 1: Add auth split layout CSS to `public/css/main.css`** (append to end)

```css
/* ===== Auth Pages — Mosaic Split Layout ===== */
.auth-page {
    padding-top: 0;
    padding-bottom: 0;
    min-height: calc(100vh - 67px);
    display: grid;
    grid-template-columns: 1fr;
}

@media (min-width: 768px) {
    .auth-page {
        grid-template-columns: 1fr 1fr;
    }
}

.auth-split-left {
    background: var(--color-platform-dark, #1A1A2E);
    padding: clamp(3rem, 6vw, 5rem) clamp(2rem, 5vw, 4rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    overflow: hidden;
}

.auth-split-left::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 20% 80%, rgba(255, 65, 54, 0.08), transparent 55%);
    pointer-events: none;
}

.auth-split-headline {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    font-size: clamp(2.5rem, 5vw, 4rem);
    color: #fff;
    line-height: 1.0;
    letter-spacing: -0.03em;
    margin-bottom: 1.5rem;
    position: relative;
    z-index: 1;
}

.auth-split-headline em {
    color: var(--color-platform-coral, #FF4136);
    font-style: italic;
}

.auth-split-sub {
    font-family: var(--font-body);
    font-weight: 200;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.5);
    position: relative;
    z-index: 1;
    line-height: 1.6;
    margin-bottom: 0;
}

.auth-split-right {
    background: #fff;
    padding: clamp(2rem, 5vw, 4rem) clamp(1.5rem, 4vw, 3rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
}

/* Override old auth-container / auth-card sizing inside split */
.auth-page .auth-container {
    display: contents;
}

.auth-page .auth-card {
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
    max-width: none;
    width: 100%;
}
```

- [ ] **Step 2: Restructure `public/login.html` with split layout**

Find the `<main id="main-content" class="main-content auth-page">` line. Replace from that line through the `<div class="auth-header">` (first few lines of main):

Old:
```html
    <main id="main-content" class="main-content auth-page">
        <div class="auth-container">
            <div class="auth-card">
                <!-- Card Header -->
                <div class="auth-header">
                    <h1>Welcome Back</h1>
                    <p>Sign in to your Silent Auction Gallery account</p>
                </div>
```

New:
```html
    <main id="main-content" class="main-content auth-page">
        <!-- Split Left Panel -->
        <div class="auth-split-left">
            <h2 class="auth-split-headline">Bid with <em>purpose.</em></h2>
            <p class="auth-split-sub">Every bid funds art programs at schools in your community. Sign in to keep bidding on work that matters.</p>
        </div>

        <!-- Split Right Panel -->
        <div class="auth-split-right">
        <div class="auth-container">
            <div class="auth-card">
                <!-- Card Header -->
                <div class="auth-header">
                    <h1>Welcome Back</h1>
                    <p>Sign in to your Silent Auction Gallery account</p>
                </div>
```

Find the closing tags at the bottom of `<main>` and add the split-right closer:
```html
            </div><!-- /.auth-card -->
        </div><!-- /.auth-container -->
        </div><!-- /.auth-split-right -->
    </main>
```

- [ ] **Step 3: Restructure `public/register.html` with split layout**

Same pattern as login.html. Replace `<main ...>` through first `<div class="auth-header">`:

```html
    <main id="main-content" class="main-content auth-page">
        <div class="auth-split-left">
            <h2 class="auth-split-headline">Art that <em>changes</em> everything.</h2>
            <p class="auth-split-sub">Join thousands of supporters bidding on original student artwork. Create a free account to start bidding.</p>
        </div>
        <div class="auth-split-right">
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-header">
                    <h1>Create Account</h1>
                    <p>Join Silent Auction Gallery to bid on amazing artwork</p>
                </div>
```

Close: add `</div><!-- /.auth-split-right -->` after auth-container close and before `</main>`.

- [ ] **Step 4: Restructure `public/2fa-verify.html` with split layout**

Same pattern. Left panel:
```html
        <div class="auth-split-left">
            <h2 class="auth-split-headline">Almost <em>there.</em></h2>
            <p class="auth-split-sub">Enter the 6-digit code from your authenticator app to complete sign-in.</p>
        </div>
        <div class="auth-split-right">
```

- [ ] **Step 5: Test Task 7**

```
npm run dev
```

Open http://localhost:3000/login.html at ≥ 768px viewport width. Verify:
- Left panel: dark (#1A1A2E) with Fraunces italic 800 headline "Bid with purpose." — "purpose." in coral
- Right panel: white with the existing login form
- At < 768px: left panel stacks above form (single column)
- Existing form validation and submit behavior unchanged

Open http://localhost:3000/register.html and http://localhost:3000/2fa-verify.html — same split layout, different left-panel copy.

- [ ] **Step 6: Commit**

```bash
git add public/login.html public/register.html public/2fa-verify.html public/css/main.css
git commit -m "feat: mosaic T7 - auth pages split layout (login, register, 2FA verify)"
```

---

### Task 8: Bidder Welcome + Teacher Dashboard Home

**Files:**
- Modify: `public/bidder-welcome.html` (replace inline `<style>` block; update hero h1 text; update step card markup)
- Modify: `public/teacher-dashboard.html` (replace page-header section with teacher hero + stats row)
- Modify: `public/css/main.css` (teacher hero CSS; teacher stats row CSS)
- Modify: `public/js/teacher-dashboard.js` (populate teacher hero name, school badge, stats)

**Interfaces:**
- Consumes: `--color-teacher-hero`, `--color-platform-dark`, `--color-platform-coral`, `--school-primary`, `--font-display`, `--font-body` from Task 1
- Produces: `.teacher-hero`, `.teacher-stats-row`, `.teacher-stats-card` components

- [ ] **Step 1: Add teacher hero + stats CSS to `public/css/main.css`** (append to end)

```css
/* ===== Teacher Dashboard Hero ===== */
.teacher-hero {
    background: var(--color-teacher-hero, #2A3550);
    color: #fff;
    padding: clamp(2.5rem, 5vw, 4rem) 1.5rem;
    position: relative;
    overflow: hidden;
}

.teacher-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 90% 10%, rgba(255, 65, 54, 0.06), transparent 50%);
    pointer-events: none;
}

.teacher-hero-inner {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1.5rem;
}

.teacher-hero-greeting {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 200;
    font-size: clamp(1.8rem, 4vw, 3rem);
    color: #fff;
    line-height: 1.1;
    margin-bottom: 0.75rem;
}

.teacher-hero-greeting strong {
    font-weight: 800;
}

.school-badge {
    display: inline-flex;
    align-items: center;
    background: var(--school-primary, var(--color-platform-coral, #FF4136));
    color: #fff;
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.35rem 0.85rem;
    border-radius: 0;
    transition: background 300ms ease;
}

.teacher-quick-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
}

/* ===== Teacher Stats Row ===== */
.teacher-stats-row {
    background: var(--color-canvas, #F4F4F4);
    border-bottom: 2px solid var(--color-platform-dark, #1A1A2E);
    padding: 0 1.5rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.teacher-stats-card {
    padding: 1.25rem 1.5rem;
    border-top: 3px solid var(--school-primary, var(--color-platform-dark, #1A1A2E));
    border-right: 1px solid var(--color-lighter-gray, #e0e0e0);
    background: #fff;
    transition: border-top-color 300ms ease;
}

.teacher-stats-card:last-child { border-right: none; }

.teacher-stat-number {
    font-family: var(--font-body);
    font-weight: 800;
    font-size: 2rem;
    color: var(--color-platform-dark, #1A1A2E);
    line-height: 1;
    margin-bottom: 0.25rem;
    font-variant-numeric: tabular-nums;
}

.teacher-stat-label {
    font-family: var(--font-body);
    font-weight: 200;
    font-size: 0.75rem;
    color: var(--color-gray, #757575);
    text-transform: uppercase;
    letter-spacing: 0.08em;
}
```

- [ ] **Step 2: Replace page-header section in `public/teacher-dashboard.html`**

Find:
```html
    <main id="main-content" class="main-content">
        <!-- Page Header -->
        <section class="page-header" role="region" aria-label="Page Header">
            <div class="container">
                <h1>Teacher Dashboard</h1>
                <p>Manage your students and artwork submissions</p>
            </div>
        </section>
```

Replace with:
```html
    <main id="main-content" class="main-content" style="padding-top:0">
        <!-- Teacher Hero -->
        <section class="teacher-hero" role="region" aria-label="Teacher overview">
            <div class="teacher-hero-inner">
                <div>
                    <p class="teacher-hero-greeting">Good morning, <strong id="teacher-name">Teacher</strong>.</p>
                    <span class="school-badge" id="teacher-school-badge">Loading…</span>
                </div>
                <div class="teacher-quick-actions">
                    <a href="#" class="btn btn-primary" id="create-auction-btn">Create Auction</a>
                    <a href="#" class="btn btn-secondary" id="review-submissions-btn">Review Submissions</a>
                </div>
            </div>
        </section>

        <!-- Stats Row -->
        <div class="teacher-stats-row" role="region" aria-label="Dashboard statistics">
            <div class="teacher-stats-card">
                <div class="teacher-stat-number" id="stat-active-auctions">—</div>
                <div class="teacher-stat-label">Active Auctions</div>
            </div>
            <div class="teacher-stats-card">
                <div class="teacher-stat-number" id="stat-pending-approvals">—</div>
                <div class="teacher-stat-label">Pending Approvals</div>
            </div>
            <div class="teacher-stats-card">
                <div class="teacher-stat-number" id="stat-bids-today">—</div>
                <div class="teacher-stat-label">Bids Today</div>
            </div>
            <div class="teacher-stats-card">
                <div class="teacher-stat-number" id="stat-ends-soon">—</div>
                <div class="teacher-stat-label">Ending Soon</div>
            </div>
        </div>
```

- [ ] **Step 3: Wire teacher hero from `public/js/teacher-dashboard.js`**

Find where user/teacher data is applied after authentication (search for where the user's name or school is currently displayed, e.g., `document.getElementById('user-name')` or similar). Add alongside that code:

```js
// Mosaic teacher hero
const nameEl  = document.getElementById('teacher-name');
const badgeEl = document.getElementById('teacher-school-badge');
if (nameEl && user && user.name) {
    nameEl.textContent = user.name.split(' ')[0]; // first name only
}
if (badgeEl && user && user.schoolName) {
    badgeEl.textContent = user.schoolName;
}

// Stats — set to live values when data loads, or '0' as safe fallback
const setStatEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = val != null ? String(val) : '0'; }
};
// Replace stats?.activeAuctions etc. with the actual properties in this file
setStatEl('stat-active-auctions',   typeof stats !== 'undefined' ? (stats.activeAuctions   ?? 0) : 0);
setStatEl('stat-pending-approvals', typeof stats !== 'undefined' ? (stats.pendingApprovals ?? 0) : 0);
setStatEl('stat-bids-today',        typeof stats !== 'undefined' ? (stats.bidsToday        ?? 0) : 0);
setStatEl('stat-ends-soon',         typeof stats !== 'undefined' ? (stats.endingSoon        ?? 0) : 0);
```

Search `teacher-dashboard.js` for where auction counts or summary data is displayed (look for existing `innerHTML` or `textContent` assignments that show numbers) to find the correct variable names to substitute for `stats.activeAuctions` etc.

- [ ] **Step 4: Replace inline styles in `public/bidder-welcome.html`**

Replace the entire `<style>` block at the top of the file with:

```html
    <style>
        /* Mosaic overrides for bidder-welcome.html */
        .bidder-hero {
            background: var(--color-platform-dark, #1A1A2E);
            color: #fff;
            padding: clamp(3rem, 7vw, 5rem) 1.5rem clamp(2.5rem, 6vw, 4rem);
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .bidder-hero::before {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at 80% 50%, rgba(255,65,54,0.07), transparent 55%);
            pointer-events: none;
        }
        .bidder-hero h1 {
            font-family: var(--font-display);
            font-size: clamp(3rem, 7vw, 6rem);
            font-weight: 800;
            font-style: italic;
            line-height: 0.95;
            margin-bottom: 1.25rem;
            letter-spacing: -0.03em;
            color: #fff;
            position: relative;
            z-index: 1;
        }
        .bidder-hero h1 em {
            color: var(--color-platform-coral, #FF4136);
            font-style: italic;
        }
        .bidder-hero p {
            font-family: var(--font-body);
            font-weight: 200;
            font-size: 1.1rem;
            color: rgba(255,255,255,0.5);
            max-width: 480px;
            margin: 0 auto 2.5rem;
            position: relative;
            z-index: 1;
        }
        .bidder-hero .btn-hero {
            display: inline-flex;
            align-items: center;
            padding: 14px 30px;
            background: var(--color-platform-coral, #FF4136);
            color: #fff;
            font-family: var(--font-body);
            font-weight: 800;
            font-size: 0.9rem;
            border-radius: 0;
            text-decoration: none;
            transition: filter 200ms ease;
            position: relative;
            z-index: 1;
        }
        .bidder-hero .btn-hero:hover { filter: brightness(0.88); }
        .steps-section {
            padding: clamp(3rem, 6vw, 5rem) 1.5rem;
            background: var(--color-canvas, #F4F4F4);
        }
        .steps-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem;
            max-width: 900px;
            margin: 0 auto;
        }
        .step-card {
            background: #fff;
            border: 2px solid var(--color-platform-dark, #1A1A2E);
            border-radius: 0;
            padding: 2rem;
        }
        .step-number-large {
            font-family: var(--font-display);
            font-style: italic;
            font-weight: 800;
            font-size: 4rem;
            color: var(--color-platform-coral, #FF4136);
            line-height: 1;
            margin-bottom: 0.5rem;
        }
        .step-title {
            font-family: var(--font-body);
            font-weight: 800;
            font-size: 0.85rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--color-platform-dark, #1A1A2E);
            margin-bottom: 0.5rem;
        }
        .step-desc {
            font-family: var(--font-body);
            font-weight: 200;
            color: var(--color-gray, #757575);
            font-size: 0.95rem;
            line-height: 1.6;
            margin-bottom: 0;
        }
    </style>
```

- [ ] **Step 5: Update bidder welcome hero headline and step markup**

In `public/bidder-welcome.html`, find the `<h1>` in `.bidder-hero` and update it:
```html
<h1>Art worth <em>bidding on.</em></h1>
```

Find the steps section and replace any step markup to use the new Mosaic card structure. Each step should look like:
```html
<div class="step-card">
    <div class="step-number-large" aria-hidden="true">1</div>
    <div class="step-title">Browse</div>
    <p class="step-desc">Explore original artwork from student artists at schools near you.</p>
</div>
```

Adapt the step content/text from whatever the existing steps say (don't change the meaning, just the HTML structure).

- [ ] **Step 6: Test Task 8**

```
npm run dev
```

Open http://localhost:3000/bidder-welcome.html. Verify:
- Dark hero with Fraunces italic "Art worth bidding on." — "bidding on." in coral
- 3 step cards below on off-white background: dark 2px border, large coral Fraunces number, bold uppercase title, faded body

Open http://localhost:3000/teacher-dashboard.html (requires teacher login). Verify:
- Teacher hero is slate blue (#2A3550) with "Good morning, [FirstName]." in Fraunces italic 200, name in 800
- School badge shows school name, colored in school-primary (or coral fallback)
- Stats row: 4 white cards on off-white background, school-primary top borders, large numbers
- "Create Auction" coral, "Review Submissions" dark ghost

- [ ] **Step 7: Commit**

```bash
git add public/teacher-dashboard.html public/bidder-welcome.html public/css/main.css public/js/teacher-dashboard.js
git commit -m "feat: mosaic T8 - teacher hero + stats row + bidder welcome Mosaic"
```

---

### Task 9: Hybrid Theming + Animation + Responsive Polish

**Files:**
- Modify: `public/css/main.css` (page-load animations; school-primary audit; `prefers-reduced-motion`)
- Modify: `public/css/responsive.css` (mobile breakpoints for hero, art strip, auth split, teacher stats)
- Modify: `public/js/index.js` (add `initArtStripReveal()` Intersection Observer)

**Interfaces:**
- Consumes: all platform color vars from Task 1; all component classes from Tasks 2–8
- Produces: Verified hybrid theming (school colors never bleed into nav/hero); page-load animation; `prefers-reduced-motion` compliance

- [ ] **Step 1: Add page-load reveal animation to `public/css/main.css`** (append to end)

```css
/* ===== Page-Load Reveal Animation ===== */
@keyframes mosaic-fade-up {
    from { opacity: 0; transform: translateY(1rem); }
    to   { opacity: 1; transform: translateY(0); }
}

@keyframes mosaic-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}

.navbar {
    animation: mosaic-fade-in 300ms ease both;
}

.hero-eyebrow {
    animation: mosaic-fade-up 400ms ease both;
    animation-delay: 100ms;
}

.hero-headline {
    animation: mosaic-fade-up 400ms ease both;
    animation-delay: 200ms;
}

.hero-sub {
    animation: mosaic-fade-in 400ms ease both;
    animation-delay: 350ms;
}

.hero-ctas {
    animation: mosaic-fade-in 400ms ease both;
    animation-delay: 450ms;
}

/* Art strip stagger — initial state (JS adds revealed class) */
.art-strip-thumb {
    opacity: 0;
}

.art-strip-thumb--revealed {
    animation: mosaic-fade-up 350ms ease both;
}

/* Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
    .navbar,
    .hero-eyebrow,
    .hero-headline,
    .hero-sub,
    .hero-ctas {
        animation: none;
    }
    .art-strip-thumb {
        opacity: 1;
    }
    .art-strip-thumb--revealed {
        animation: none;
    }
}
```

- [ ] **Step 2: Add `initArtStripReveal()` to `public/js/index.js`**

After `initArtStrip()` in index.js, add:

```js
function initArtStripReveal() {
    const track = document.getElementById('art-strip-track');
    if (!track || !('IntersectionObserver' in window)) {
        // Fallback: make thumbs visible immediately
        track && track.querySelectorAll('.art-strip-thumb').forEach(el => { el.style.opacity = '1'; });
        return;
    }
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) { return; }
            const thumbs = track.querySelectorAll('.art-strip-thumb');
            thumbs.forEach((el, i) => {
                el.style.animationDelay = `${i * 60}ms`;
                el.classList.add('art-strip-thumb--revealed');
            });
            observer.disconnect();
        });
    }, { threshold: 0.1 });
    observer.observe(track);
}
```

Call `initArtStripReveal()` from the init entry point, after `initArtStrip()`.

- [ ] **Step 3: Audit and fix any remaining `var(--color-primary)` in nav/hero**

In `public/css/main.css`, search for `var(--color-primary)` in the following selectors:
- `.navbar`, `.logo`, `.logo:hover`, `.nav-link`, `.nav-link.active`, `.btn-primary`, `.btn-secondary`, `.hero`, `.hero::before`

Replace any remaining `var(--color-primary)` or `var(--school-primary)` in those selectors with the correct platform color:
- Nav/logo contexts → `var(--color-platform-dark, #1A1A2E)`
- Button/CTA contexts → `var(--color-platform-coral, #FF4136)`

To verify isolation: open browser DevTools console on http://localhost:3000 and run:
```js
document.documentElement.style.setProperty('--school-primary', 'red');
```
Confirm nav border stays `#1A1A2E`, nav links stay dark, buttons stay coral. Only auction cards, bid panel, stats row should turn red.

- [ ] **Step 4: Update `public/css/responsive.css` mobile breakpoints**

Read the current `public/css/responsive.css` to understand existing rules, then add or update these breakpoints:

```css
/* ===== Mosaic Responsive ===== */
@media (max-width: 768px) {
    /* Hero */
    .hero-headline {
        font-size: clamp(2.5rem, 10vw, 4rem);
    }
    .hero-ctas {
        flex-direction: column;
        align-items: flex-start;
    }

    /* Art strip */
    .art-strip-thumb {
        flex: 0 0 160px;
        height: 130px;
    }

    /* Auth split */
    .auth-split-left {
        padding: 2rem 1.5rem;
    }
    .auth-split-headline {
        font-size: clamp(1.8rem, 6vw, 2.5rem);
    }

    /* Teacher stats */
    .teacher-stats-row {
        grid-template-columns: 1fr 1fr;
    }

    /* Teacher hero */
    .teacher-hero-inner {
        flex-direction: column;
        align-items: flex-start;
    }
    .teacher-quick-actions {
        width: 100%;
    }

    /* Filter bar */
    .filter-bar {
        top: 64px;
        gap: var(--spacing-sm);
    }
}

@media (max-width: 480px) {
    .teacher-stats-row {
        grid-template-columns: 1fr;
    }
    .teacher-stats-card {
        border-right: none;
        border-bottom: 1px solid var(--color-lighter-gray, #e0e0e0);
    }
    .hero-sub {
        max-width: 100%;
    }
}
```

- [ ] **Step 5: Full lint + test suite**

```bash
npm run lint
npm test
```

Expected: 0 lint errors, 705 tests passing. If lint shows new errors (unusual for HTML/CSS changes), fix them before committing.

- [ ] **Step 6: Visual regression — open all 8 in-scope pages**

```
npm run dev
```

At viewport widths 320px, 768px, and 1200px, confirm each page:

| Page | URL | Key check |
|---|---|---|
| Home | http://localhost:3000 | Hero flush to nav; art strip scrollable; sections visible |
| Auctions | http://localhost:3000/auctions.html | Dark header; filter bar sticky; cards Mosaic-styled |
| Auction detail | http://localhost:3000/auction-detail.html?id=<id> | Context bar; dark art surround; coral bid; bid panel border |
| Bidder welcome | http://localhost:3000/bidder-welcome.html | Dark hero; Mosaic step cards |
| Login | http://localhost:3000/login.html | Split layout at ≥768px; single column at <768px |
| Register | http://localhost:3000/register.html | Same split layout |
| 2FA verify | http://localhost:3000/2fa-verify.html | Same split layout |
| Teacher dashboard | http://localhost:3000/teacher-dashboard.html | Slate hero; stats row; existing tabs functional |

- [ ] **Step 7: Commit**

```bash
git add public/css/main.css public/css/responsive.css public/js/index.js
git commit -m "feat: mosaic T9 - animation, reduced-motion, school-color isolation, responsive polish"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Fraunces + Bricolage Grotesque + JetBrains Mono | T1 |
| Platform color vars (#1A1A2E, #FF4136, #F4F4F4, #2A3550) | T1 |
| Nav 3px dark border, `SAG·LIVE`, thin uppercase links, coral CTA | T2 |
| Hero dark banner, eyebrow, italic 800 headline, coral `<em>`, sub, ctas | T3 |
| Art strip from `/api/auctions/carousel`, click → navigate (not lightbox) | T3 |
| Auction cards: school-primary border, sharp corners, italic title, coral bid | T4 |
| Featured auctions section off-white, How It Works dark | T4 |
| Auctions list dark mini-header, filter bar markup | T5 |
| Auction detail school context bar, dark art surround, bid panel border | T6 |
| Current bid Fraunces italic 800 coral; lot numbers JetBrains Mono | T6 |
| Auth split layout (login, register, 2FA) | T7 |
| Bidder welcome dark hero, Mosaic step cards | T8 |
| Teacher dashboard slate hero, school badge, stats row, quick actions | T8 |
| Hybrid theming: school-primary → card border, context bar, bid panel, stats | T4, T6, T8 |
| School colors never bleed into nav or hero | T9 audit |
| Page-load reveal animation, art strip stagger, `prefers-reduced-motion` | T9 |
| Mobile responsive at 320/768/1200px | T9 |
| Lightbox on auction detail: unchanged (spec says "keep") | No change |
| `ThemeManager.apply()` and `theme-manager.js` unchanged | No change |
| `npm run lint` 0 errors, `npm test` 705 passing | Every task |

**Placeholder scan:** All steps have complete code. No TBDs.

**Type consistency:** `initArtStrip`, `initArtStripReveal`, `art-strip-track`, `art-strip-thumb`, `art-strip-thumb--revealed`, `school-context-bar`, `teacher-hero`, `teacher-stats-card`, `auth-split-left`, `auth-split-right`, `auth-split-headline`, `auth-split-sub`, `hero-eyebrow`, `hero-headline`, `hero-accent`, `hero-sub`, `hero-ctas`, `btn-hero-ghost` — all names consistent across HTML, CSS, and JS steps.
