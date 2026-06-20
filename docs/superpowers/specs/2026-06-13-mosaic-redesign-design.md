# SAG Mosaic Redesign — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` to produce the implementation plan from this spec.

**Goal:** Replace the current generic blue/green SAG interface with The Mosaic — a bold editorial design using near-black + coral-red as the platform brand, Fraunces + Bricolage Grotesque typography, and a hybrid school-theming model where school colors appear in auction context but never override the global platform identity.

**Scope:** Public-facing pages (home, auctions list, auction detail, bidder welcome, login, register, 2FA) plus the teacher dashboard home tab. Deep admin, user-settings, and checkout pages are out of scope.

**Architecture:** Multi-page HTML/CSS app. CSS-only animations. No React. School color-theming via CSS custom properties set at runtime by `theme-manager.js`.

---

## 1. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Visual direction | The Mosaic | Near-black + coral-red, bold editorial, maximum bidder clarity |
| Hero layout | Dark Banner | Full-width dark hero → art strip → featured cards |
| School theming | Hybrid | Platform nav/hero always coral; school colors on cards/headers/borders |
| Audience priority | Community-first, easy for bidders | Teachers feel at home; bidders face zero friction |
| Typography | Fraunces + Bricolage Grotesque | Per CLAUDE.md — no Inter/Roboto/system fonts |

---

## 2. Typography System

Replace all existing font references. Load via Google Fonts `<link>` in every HTML file.

### Font Stack

| Role | Font | Weights used |
|---|---|---|
| Display / headings | Fraunces | 200 (light), 800 (black); italic variants of both |
| Body / UI | Bricolage Grotesque | 200 (thin), 400 (regular), 800 (black) |
| Monospace / data | JetBrains Mono | 400 — used for lot numbers, bid amounts in the bid panel, timestamps |

### Google Fonts import (replace existing in all HTML `<head>`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,200;0,9..144,800;1,9..144,200;1,9..144,800&family=Bricolage+Grotesque:opsz,wght@12..96,200;12..96,400;12..96,800&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
```

### CSS variable updates (in `theme.css` `:root`)

```css
--font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
--font-body:    'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono:    'JetBrains Mono', 'Courier New', monospace;
```

### Type scale rules (CLAUDE.md)

- Weight extremes only: 200 vs 800 — never 400 vs 600 for emphasis
- Size jumps of 3× minimum between display and body (e.g. 3rem hero vs 1rem body)
- Fraunces italic 800 for all hero H1s
- Fraunces italic 200 for secondary display text (subtitles, captions)
- Bricolage 800 uppercase + wide letter-spacing for labels, eyebrows, badges
- Bricolage 200 for body copy, meta text, descriptions

---

## 3. Color System

### Platform brand (fixed — never overridden by school theme)

```css
/* Add to main.css :root */
--color-platform-dark:  #1A1A2E;   /* near-black: nav border, hero bg, card borders */
--color-platform-coral: #FF4136;   /* accent: CTAs, hero highlights, active states */
--color-platform-white: #FFFFFF;   /* nav background */
--color-canvas:         #F4F4F4;   /* page background off-white */
--color-surface:        #FFFFFF;   /* card backgrounds */
--color-teacher-hero:   #2A3550;   /* teacher dashboard hero — lighter than platform dark */
```

### School theme (context-only — unchanged existing vars)

The existing `--school-primary`, `--school-secondary` etc. set by `theme-manager.js` remain exactly as-is. The change is *where* they're used:

- **Before:** school colors overrode `--color-primary` which was used everywhere  
- **After:** school colors only apply to `.school-context` scoped selectors (card borders, section headings, auction-specific badges)

### Forbidden

Per CLAUDE.md: no purple-to-blue gradients on white. No flat `--color-primary` overrides on global nav or hero.

---

## 4. Component Specifications

### 4.1 Global Navigation

**Applies to:** all in-scope pages.

```
[white bg] [3px #1A1A2E bottom border]
SAG·LIVE      Auctions  Schools  About     [Teacher Login]  [Bid Now ←coral]
```

- Container: `background: #fff; border-bottom: 3px solid var(--color-platform-dark)`
- Logo `SAG·LIVE`: Bricolage 800, `#1A1A2E`, `text-transform: uppercase; letter-spacing: -0.02em`. The `·` dot: `color: var(--color-platform-coral)`
- Nav links: Bricolage 200, `0.08em` letter-spacing, uppercase, `#1A1A2E`
- "Bid Now" CTA: `background: var(--color-platform-coral); color: #fff; font-weight: 800; padding: 6px 16px`; no border-radius (sharp corners)
- "Teacher Login": ghost button with `border: 1.5px solid var(--color-platform-dark); color: var(--color-platform-dark)`
- Mobile: hamburger toggle at ≤768px; nav links collapse into a dark drawer

### 4.2 Dark Banner Hero (home page only)

Three-layer structure stacked vertically:

**Layer 1 — Hero panel**
```
background: var(--color-platform-dark)
padding: clamp(3rem, 8vw, 6rem) 2rem clamp(2.5rem, 6vw, 5rem)

[eyebrow line] ── Spring 2026 · Student Art Showcase
Art that
changes
everything.          ← Fraunces italic 800, clamp(4rem, 10vw, 8rem), white
                       the action/verb word on line 2 in --color-platform-coral
                       e.g. "Art that / <coral>changes</coral> / everything."
                       Copy is fixed — do not make it dynamic or configurable.

[sub] Original student artwork. Every bid funds school programs.
      ← Bricolage 200, 1.1rem, rgba(255,255,255,0.5)

[Browse Auctions] [How it works]
← coral filled    ← ghost white border
```

- Eyebrow: Bricolage 800, 0.75rem, uppercase, `letter-spacing: 0.2em`, coral. Left decoration: `::before` with `width: 2rem; height: 1.5px; background: coral; vertical-align: middle`
- Subtle right-side glow: `radial-gradient(ellipse at 85% 50%, rgba(255,65,54,0.07), transparent 60%)` as a pseudo-element — atmospheric depth per CLAUDE.md

**Layer 2 — Art strip**
```
background: #fff; border-top: 3px solid var(--color-platform-dark)
Horizontal scrollable row of artwork thumbnails, each ~200px wide
Each: artwork image (object-fit: cover) + bid price overlay bottom-left (Bricolage 800, white)
```

- 5–8 thumbnails, auto-populated from `/api/auctions/carousel`
- Clicking a thumbnail navigates to `/auction-detail.html?id={auctionId}` — NOT the lightbox. The existing lightbox carousel (added in the previous session) lives only inside the auction detail page, not in the art strip.
- On mobile: horizontal scroll with `scroll-snap-x`

**Layer 3 — Featured lots grid**
```
background: var(--color-canvas)
3-column grid: [featured lot 1.6fr] [card] [card]

Featured lot: school-colored 2px left border, large Fraunces italic title, bid amount in coral
Side cards: compact, school-colored top border
```

### 4.3 Auction Cards

Used on: home featured section, auctions list page, teacher dashboard.

```
background: var(--color-surface)        ← white
border: 2px solid var(--school-primary) ← school color (context-scoped)
border-radius: 0                        ← sharp corners (Mosaic aesthetic)

[artwork image, aspect-ratio: 4/3, object-fit: cover]

[section-head inside card]
  school name ← Bricolage 800, 0.1em letter-spacing, var(--school-primary)
  | divider
  grade/medium ← Bricolage 200, #888

[artwork title] ← Fraunces italic 400, 1.1rem, #1A1A2E
[artist name]   ← Bricolage 200, 0.9rem, #666
[bid amount]    ← Bricolage 800, 1.25rem, var(--color-platform-coral)
[time left]     ← Bricolage 200, 0.8rem, #888
[Bid Now →]     ← Bricolage 800, uppercase, coral text link
```

The school-color scoping rule: card border and section-head color come from `--school-primary`. When no school theme is active, fall back to `--color-platform-dark`. This is achieved by:

```css
.auction-card {
  border-color: var(--school-primary, var(--color-platform-dark));
}
.auction-card .card-school-name {
  color: var(--school-primary, var(--color-platform-dark));
}
```

### 4.4 Auctions List Page

- Page header: small dark banner (`#1A1A2E`, 200px tall max), Fraunces italic 800 headline "Browse Auctions", Bricolage 200 subtitle
- Filter bar: white, sticky below nav, `border-bottom: 2px solid var(--color-platform-dark)`. Filters: School, Grade, Medium, Price range. Active filter chips: `background: var(--color-platform-coral); color: #fff`
- Grid: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` using auction cards (§4.3)
- Empty state: Fraunces italic "No auctions found." + Bricolage 200 sub

### 4.5 Auction Detail Page

- Artwork image: full-width, `max-height: 70vh`, `object-fit: contain`, `background: var(--color-platform-dark)` (dark surround for any image shape)
- School context bar: `background: var(--school-primary); color: #fff` — 40px strip showing school name + auction name below the image
- Bid panel: white surface, right-aligned on desktop (sticky), `border-left: 3px solid var(--school-primary)`. Current bid in Fraunces italic 800; bid input + button coral
- Artist info: Fraunces italic 200 for title, Bricolage 200 for meta
- Lightbox (existing): keep — already styled dark

### 4.6 Bidder Welcome Page

- Replace current layout with: dark banner hero (same pattern as home but headline "Art worth bidding on."), then 3-column How It Works section using the numbered Mosaic card style (large Fraunces italic number in coral, Bricolage 800 step title)

### 4.7 Login / Register Pages

- Split layout: left panel `background: var(--color-platform-dark)`, right panel white
- Left: Fraunces italic 800 quote or headline + artwork image or abstract gradient pattern
- Right: form with Bricolage labels, coral-bordered focus states, coral submit button
- 2FA page: same split layout

### 4.8 Teacher Dashboard Home

**Only the home/landing tab** — not the deep management tabs.

- Nav: identical to public nav (coral, same logo) — no visual difference for teachers
- Teacher hero: `background: #2A3550` (lighter than platform dark — differentiated from public hero). Fraunces italic 200 "Good morning, [Name]." + school name badge in school primary color
- Stats row: 3–4 cards with `border-top: 3px solid var(--school-primary)`. Bricolage 800 number, Bricolage 200 label. Stats: Active Auctions, Pending Approvals, Total Bids Today, Ends Soon
- Quick actions strip: 2 coral buttons "Create Auction" + "Review Submissions"
- Recent activity feed: timeline with Bricolage 200 entries, school-primary colored dots

---

## 5. Animation & Motion

Per CLAUDE.md: CSS-only (no JS animation library — this is not a React app).

- **Page-load reveal:** single orchestrated sequence. Nav fades in at 0ms; hero eyebrow slides up at 100ms; H1 slides up at 200ms; sub fades at 350ms; CTAs at 450ms. Use `animation-delay` + `opacity: 0 → 1` + `translateY(1rem → 0)`.
- **Art strip:** on scroll into view, thumbnails stagger-fade left to right (Intersection Observer + CSS class toggle)
- **Card hover:** `transform: translateY(-4px)` + `box-shadow` deepens. `transition: 200ms ease`.
- **CTA buttons:** `background` darkens 10% on hover via filter. No color switch.
- No scattered micro-interactions — one well-orchestrated load reveal only.

---

## 6. Responsive Behaviour

| Breakpoint | Changes |
|---|---|
| `≥ 1200px` | 3-col featured grid; full art strip visible |
| `768px–1199px` | 2-col grid; hero H1 clamps down |
| `< 768px` | 1-col grid; nav collapses to hamburger; art strip horizontally scrollable; hero H1 `clamp(2.5rem, 8vw, 4rem)`; split login becomes single column |

---

## 7. Files Modified / Created

### Modified

| File | Change |
|---|---|
| `public/css/theme.css` | Replace `--font-display`/`--font-body` vars; add platform color vars |
| `public/css/main.css` | Rewrite nav, hero, cards, buttons, page headers, auction detail, teacher hero |
| `public/css/responsive.css` | Update breakpoint rules to match new layouts |
| `public/index.html` | New font `<link>`; dark banner hero structure; art strip; featured grid |
| `public/auctions.html` | New font `<link>`; dark mini-header; filter bar markup |
| `public/auction-detail.html` | New font `<link>`; school context bar; bid panel structure |
| `public/bidder-welcome.html` | New font `<link>`; dark banner hero; numbered steps |
| `public/login.html` | New font `<link>`; split layout markup |
| `public/register.html` | New font `<link>`; split layout markup |
| `public/2fa-verify.html` | New font `<link>`; split layout |
| `public/teacher-dashboard.html` | New font `<link>`; teacher hero section; stats row; quick actions |
| `public/js/index.js` | Update hero HTML generation; art strip click navigation |

### Not modified (out of scope)

`admin-dashboard.html`, `user-dashboard.html`, `checkout.html`, `password-reset.html`, `thank-you.html`, `privacy.html`, `terms.html`, `2fa-setup.html`, `force-2fa-setup.html`, `parental-consent.html`

---

## 8. School Theming Integration Rules

The existing `theme-manager.js` and `ThemeManager.apply()` are unchanged. The change is purely in CSS selectors:

1. Remove any use of `var(--color-primary)` in nav, hero, or global button styles — replace with `var(--color-platform-coral)` or `var(--color-platform-dark)`.
2. Add `var(--school-primary, var(--color-platform-dark))` fallback to: `.auction-card` border, `.card-school-name` color, `.school-context-bar` background, `.bid-panel` border-left, `.teacher-stats-card` border-top, `.teacher-hero .school-badge` background.
3. Result: when no school is active, all school-color slots show `#1A1A2E`. When a school theme loads, slots update automatically via existing `ThemeManager.apply()` without any JS changes.

---

## 9. What Is NOT Changing

- Server-side routes, API endpoints, authentication logic — untouched
- `theme-manager.js` logic — untouched
- `accessibility.css` — review for font/color conflicts but no structural changes
- `auction-labels.css` — out of scope
- All JS business logic outside of `index.js` hero section

---

## 10. Success Criteria

- `npm run lint` exits 0 errors (already baseline)
- `npm test` exits with all 705 existing tests passing
- All in-scope pages pass WCAG 2.1 AA contrast checks (coral #FF4136 on white = 4.6:1 — passes AA for large text; use white text on coral for small text)
- Hero H1 visible and fully legible at 320px viewport width
- Art strip scrollable on touch devices without triggering page scroll
- School color theming updates correctly on auction-detail page load
