# Frontend: Responsive Polish + Lightbox + Card Preview + QR Labels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the SAG frontend for mobile/tablet/desktop screens; replace unreliable native fullscreen with a CSS lightbox on auction detail; add a quick-preview overlay on auction cards; and enhance printable QR artwork labels.

**Architecture:** Pure CSS + vanilla JS — no new dependencies. Lightbox and card preview are CSS `position:fixed` overlays added to existing HTML files. Responsive fixes are additive tweaks to existing CSS files. QR label improvements are CSS + a one-line JS change to increase QR size.

**Tech Stack:** Vanilla HTML/CSS/JS, `qrcodejs@1.0.0` CDN (already loaded), Cormorant Garant + DM Sans fonts (already loaded), existing `UIComponents`, `AuctionDetail`, and `AuctionsPage` classes.

---

## File Map

| File | Change |
|------|--------|
| `public/css/main.css` | Add `.artwork-lightbox`, `.lightbox-img`, `.lightbox-close`, `.card-preview-overlay` styles |
| `public/css/responsive.css` | Responsive fixes: filters sidebar collapsible hint on mobile, auction-detail image max-height on mobile, thumbnail strip wrapping |
| `public/css/auction-labels.css` | Larger QR container (160×160), improved card layout for print, 1-column print option |
| `public/auction-detail.html` | Add `#artwork-lightbox` div before `</body>` |
| `public/auctions.html` | Add `#card-preview-overlay` div before `</body>` |
| `public/js/auction-detail.js` | Replace `toggleFullscreen()` with `openLightbox()` / `closeLightbox()`; wire `artworkWrapper` click to `openLightbox()` instead of `showArtworkModal()` |
| `public/js/auctions-page.js` | Add `openCardPreview()` / `closeCardPreview()` methods; wire delegated click on `.auction-card-image` |
| `public/js/auction-labels.js` | Change `width`/`height` in `generateQRCodes()` from 100 to 160 |

---

## Task 1: CSS Lightbox Styles

**Files:**
- Modify: `public/css/main.css`

Add these styles at the end of `public/css/main.css`. The lightbox is a `position:fixed` overlay that covers the entire viewport with a near-black backdrop and centers the image.

- [ ] **Step 1: Append lightbox CSS to main.css**

Open `public/css/main.css` and append the following block at the very end of the file:

```css
/* ===== Artwork Lightbox ===== */
.artwork-lightbox {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.93);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}

.artwork-lightbox[hidden] {
  display: none;
}

.lightbox-img {
  max-width: 95vw;
  max-height: 93vh;
  object-fit: contain;
  border-radius: 4px;
  cursor: default;
  user-select: none;
}

.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1.25rem;
  background: none;
  border: none;
  color: #fff;
  font-size: 2.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  opacity: 0.8;
  transition: opacity 0.15s;
  z-index: 9001;
}

.lightbox-close:hover,
.lightbox-close:focus {
  opacity: 1;
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* Hint cursor on clickable artwork images */
.artwork-image-wrapper {
  cursor: zoom-in;
}

/* ===== Auction Card Preview Overlay ===== */
.card-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 8500;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.card-preview-overlay[hidden] {
  display: none;
}

.card-preview-box {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  max-width: 640px;
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  position: relative;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-preview-close {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted, #888);
  padding: 0.25rem;
}

.card-preview-close:hover {
  color: var(--color-text, #111);
}

.card-preview-img {
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  border-radius: 8px;
  background: var(--color-bg-muted, #f5f5f5);
}

.card-preview-title {
  font-family: 'Cormorant Garant', serif;
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0;
}

.card-preview-school {
  color: var(--color-text-muted, #666);
  font-size: 0.9rem;
  margin: 0;
}

.card-preview-stats {
  display: flex;
  gap: 1.5rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.card-preview-bid {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--color-primary, #1565c0);
}

.card-preview-count {
  font-size: 0.9rem;
  color: var(--color-text-muted, #666);
}

.card-preview-time {
  font-size: 0.85rem;
  color: var(--color-text-muted, #666);
}

.card-preview-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.card-preview-actions .btn {
  flex: 1;
}
```

- [ ] **Step 2: Verify no syntax errors**

Open a browser (or run `node -e "require('fs').readFileSync('public/css/main.css','utf8')"` in the project root) to confirm the file has no obvious syntax issues. No automated test needed — CSS parse errors show in DevTools.

- [ ] **Step 3: Commit**

```bash
git add public/css/main.css
git commit -m "style: add artwork lightbox and card preview overlay CSS"
```

---

## Task 2: Responsive CSS Improvements

**Files:**
- Modify: `public/css/responsive.css`

Mobile pain points to fix:
1. Artwork image takes full viewport height on mobile — add a `max-height` so it doesn't crowd out the bid form
2. Thumbnail strip on mobile should not overflow — ensure it wraps
3. Filters sidebar on mobile renders in full before the grid — hide form fields behind a toggle button (CSS only: use `<details>` in HTML — but we can't change HTML in this task; instead, cap sidebar `max-height` on mobile so it doesn't dominate)
4. `auction-card-image` needs a consistent aspect ratio so cards line up

- [ ] **Step 1: Append responsive fixes to responsive.css**

Append the following at the end of `public/css/responsive.css`:

```css
/* ===== Auction Detail — Mobile Image Height Cap ===== */
@media (max-width: 640px) {
  .artwork-image-wrapper {
    max-height: 55vw;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-muted, #f5f5f5);
    border-radius: var(--radius-lg, 8px);
  }

  .artwork-image {
    max-height: 55vw;
    width: 100%;
    object-fit: contain;
  }

  /* Thumbnail strip — horizontal scroll on mobile */
  .artwork-thumbnails {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 0.5rem;
    padding-bottom: 0.25rem;
    -webkit-overflow-scrolling: touch;
  }

  /* Filters sidebar — cap height with scroll so it doesn't push grid off screen */
  .filters-sidebar {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 8px;
    padding: 0.75rem;
  }
}

/* ===== Auction Card Image — Consistent Aspect Ratio ===== */
.auction-card-image {
  position: relative;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--color-bg-muted, #f5f5f5);
  cursor: zoom-in;
}

.auction-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.25s ease;
}

.auction-card-image:hover img,
.auction-card:focus-within .auction-card-image img {
  transform: scale(1.04);
}

/* ===== Card Preview Overlay — Mobile Adjustments ===== */
@media (max-width: 640px) {
  .card-preview-box {
    padding: 1rem;
    border-radius: 8px;
  }

  .card-preview-img {
    max-height: 240px;
  }

  .card-preview-title {
    font-size: 1.25rem;
  }

  .card-preview-stats {
    gap: 0.75rem;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/responsive.css
git commit -m "style: responsive fixes — mobile image height, card aspect ratio, thumbnail scroll"
```

---

## Task 3: Artwork Lightbox HTML + JS (auction-detail)

**Files:**
- Modify: `public/auction-detail.html`
- Modify: `public/js/auction-detail.js`

The lightbox replaces the native `requestFullscreen()` call. Clicking the artwork image (`.artwork-image-wrapper`) or the fullscreen button (`#fullscreen-btn`) opens the lightbox. Escape key and backdrop click close it. The existing `#artwork-modal` (specs + QR) is untouched and still reachable if desired, but the default image-click now opens the lightbox.

- [ ] **Step 1: Add lightbox HTML to auction-detail.html**

In `public/auction-detail.html`, find the `<!-- Alert Container -->` comment (line 353) and insert the following **immediately before** it:

```html
    <!-- Lightbox: Full-screen artwork image -->
    <div id="artwork-lightbox" class="artwork-lightbox" role="dialog" aria-modal="true" aria-label="Artwork fullscreen view" hidden>
      <button id="lightbox-close" class="lightbox-close" aria-label="Close fullscreen view">&times;</button>
      <img id="lightbox-img" class="lightbox-img" src="" alt="">
    </div>

```

- [ ] **Step 2: Replace `toggleFullscreen()` in auction-detail.js**

Find and replace `toggleFullscreen()` method (lines 813–828) with:

```js
  openLightbox(piece) {
    const lb = document.getElementById('artwork-lightbox');
    const img = document.getElementById('lightbox-img');
    if (!lb || !img) { return; }
    img.src = piece?.imageUrl || document.getElementById('artwork-image')?.src || '';
    img.alt = piece?.title || 'Artwork';
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('lightbox-close')?.focus();
  }

  closeLightbox() {
    const lb = document.getElementById('artwork-lightbox');
    if (!lb) { return; }
    lb.hidden = true;
    document.body.style.overflow = '';
  }
```

- [ ] **Step 3: Update attachEventListeners() in auction-detail.js**

In `attachEventListeners()`, find the `fullscreenBtn` listener and the `artworkWrapper` listener and replace them:

Find (lines ~362–374):
```js
    // Fullscreen button
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    // Artwork image — click to open detail modal
    const artworkWrapper = document.querySelector('.artwork-image-wrapper');
    if (artworkWrapper) {
      artworkWrapper.style.cursor = 'pointer';
      artworkWrapper.addEventListener('click', () => {
        if (this.currentPiece) {this.showArtworkModal(this.currentPiece);}
      });
    }
```

Replace with:
```js
    // Fullscreen button and artwork image — open CSS lightbox
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.openLightbox(this.currentPiece));
    }

    const artworkWrapper = document.querySelector('.artwork-image-wrapper');
    if (artworkWrapper) {
      artworkWrapper.addEventListener('click', () => this.openLightbox(this.currentPiece));
    }

    // Lightbox close button and backdrop
    const lightbox = document.getElementById('artwork-lightbox');
    if (lightbox) {
      document.getElementById('lightbox-close')?.addEventListener('click', () => this.closeLightbox());
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) { this.closeLightbox(); }
      });
    }
```

- [ ] **Step 4: Add Escape key handler for lightbox**

In `attachEventListeners()`, find the existing `keydown` listener (search for `keydown` in the file). If one exists, add the lightbox branch inside it. If none exists, append at the end of `attachEventListeners()`:

```js
    // Keyboard: Escape closes lightbox
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.closeLightbox(); }
    });
```

Note: if a `keydown` listener already exists, add the `this.closeLightbox()` call inside its Escape branch instead of adding a second listener.

- [ ] **Step 5: Verify manually**

- Open `auction-detail.html?id=<any>` in a browser
- Click the artwork image → lightbox opens with the image filling the screen
- Click outside the image (dark backdrop) → closes
- Press Escape → closes
- Click ⛶ fullscreen button → same lightbox opens
- Resize to 375px wide — image should still be visible, not overflow

- [ ] **Step 6: Commit**

```bash
git add public/auction-detail.html public/js/auction-detail.js
git commit -m "feat: replace native fullscreen with CSS lightbox on auction detail"
```

---

## Task 4: Auction Card Preview Overlay (auctions)

**Files:**
- Modify: `public/auctions.html`
- Modify: `public/js/auctions-page.js`

Clicking the card image area opens a full-screen preview overlay showing: large artwork image, auction title, school, current bid, bid count, time remaining, and a "View Auction" CTA linking to `auction-detail.html?id=<id>`. Clicking outside the box or pressing Escape closes it.

- [ ] **Step 1: Add overlay HTML to auctions.html**

In `public/auctions.html`, find `<!-- Alert Container -->` (line 184) and insert the following immediately before it:

```html
    <!-- Card Preview Overlay -->
    <div id="card-preview-overlay" class="card-preview-overlay" role="dialog" aria-modal="true" aria-label="Auction preview" hidden>
      <div class="card-preview-box">
        <button id="card-preview-close" class="card-preview-close" aria-label="Close preview">&times;</button>
        <img id="card-preview-img" class="card-preview-img" src="" alt="">
        <div>
          <h2 id="card-preview-title" class="card-preview-title"></h2>
          <p id="card-preview-school" class="card-preview-school"></p>
        </div>
        <div class="card-preview-stats">
          <span id="card-preview-bid" class="card-preview-bid"></span>
          <span id="card-preview-count" class="card-preview-count"></span>
          <span id="card-preview-time" class="card-preview-time"></span>
        </div>
        <div class="card-preview-actions">
          <a id="card-preview-cta" href="#" class="btn btn-primary">View Auction &rarr;</a>
          <button id="card-preview-cancel" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>

```

- [ ] **Step 2: Add openCardPreview() and closeCardPreview() to AuctionsPage**

In `public/js/auctions-page.js`, before the final `}` that closes the `AuctionsPage` class (line ~449), insert:

```js
  openCardPreview(auction) {
    const overlay = document.getElementById('card-preview-overlay');
    if (!overlay) { return; }

    const set = (id, val) => { const el = document.getElementById(id); if (el) { el.textContent = val || ''; } };
    const img = document.getElementById('card-preview-img');
    if (img) {
      img.src = this.escapeHtml(auction.image || '/images/placeholder-art.svg');
      img.alt = this.escapeHtml(auction.title || '');
    }
    set('card-preview-title', auction.title);
    set('card-preview-school', auction.school || '');
    set('card-preview-bid', UIComponents.formatCurrency(auction.currentBid || 0));
    set('card-preview-count', `${auction.bidCount || 0} bids`);
    const remaining = UIComponents.formatTimeRemaining(new Date(auction.endTime) - Date.now());
    set('card-preview-time', remaining);

    const cta = document.getElementById('card-preview-cta');
    if (cta) { cta.href = `/auction-detail.html?id=${encodeURIComponent(auction.id)}`; }

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('card-preview-close')?.focus();
  }

  closeCardPreview() {
    const overlay = document.getElementById('card-preview-overlay');
    if (!overlay) { return; }
    overlay.hidden = true;
    document.body.style.overflow = '';
  }
```

- [ ] **Step 3: Wire click events in attachEventListeners()**

In `AuctionsPage.attachEventListeners()`, after the existing delegated click listener for `.btn-watch` (ends around line 93), add:

```js
    // Card image click → open preview overlay
    document.addEventListener('click', (e) => {
      const imgArea = e.target.closest('.auction-card-image');
      if (imgArea) {
        const card = imgArea.closest('[data-auction-id]');
        if (card) {
          const auction = this.auctions.find(a => String(a.id) === card.dataset.auctionId);
          if (auction) { this.openCardPreview(auction); }
        }
      }
    });

    // Overlay close button, cancel button, and backdrop
    const overlay = document.getElementById('card-preview-overlay');
    if (overlay) {
      document.getElementById('card-preview-close')?.addEventListener('click', () => this.closeCardPreview());
      document.getElementById('card-preview-cancel')?.addEventListener('click', () => this.closeCardPreview());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { this.closeCardPreview(); }
      });
    }

    // Escape key closes overlay
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.closeCardPreview(); }
    });
```

- [ ] **Step 4: Verify manually**

- Open `auctions.html` in a browser
- Click the image area of any auction card → preview overlay opens
- Overlay shows image, title, school, bid amount, bid count, time remaining, "View Auction" link
- Click "Close" button or dark backdrop → overlay closes
- Press Escape → overlay closes
- "View Auction" link navigates to the correct `auction-detail.html?id=<id>` page
- Test on 375px mobile viewport

- [ ] **Step 5: Commit**

```bash
git add public/auctions.html public/js/auctions-page.js
git commit -m "feat: add artwork preview overlay on auction card image click"
```

---

## Task 5: Enhanced QR Labels

**Files:**
- Modify: `public/css/auction-labels.css`
- Modify: `public/js/auction-labels.js`

Goals:
1. Increase QR code size from 100×100 to 160×160 for easier gallery scanning
2. Improve label card layout for print readability
3. Make the print layout use a single-column for maximum label size

- [ ] **Step 1: Increase QR size in auction-labels.js**

In `public/js/auction-labels.js`, find `generateQRCodes()` (line 112). Change the `width` and `height` from `100` to `160`:

Before:
```js
      new QRCodeLib(el, { text: url, width: 100, height: 100 });
```

After:
```js
      new QRCodeLib(el, { text: url, width: 160, height: 160 });
```

- [ ] **Step 2: Update label CSS for larger QR and improved print layout**

In `public/css/auction-labels.css`, replace the entire file content with:

```css
/* Screen layout */

.labels-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 2rem;
}

.labels-header h1 { margin: 0 0 0.25rem; }

.labels-header .school-name {
  color: var(--color-text-muted, #666);
  margin: 0;
}

.labels-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.label-card {
  border: 1px solid var(--color-border, #ddd);
  border-radius: 8px;
  padding: 1.25rem;
  background: var(--color-surface, #fff);
  overflow: hidden;
}

.label-meta {
  font-size: 0.7rem;
  color: var(--color-text-muted, #888);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.label-piece-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.label-title-block { flex: 1; min-width: 0; }

.label-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  font-family: 'Cormorant Garant', serif;
}

.label-artist {
  font-size: 0.9rem;
  color: var(--color-text-muted, #555);
  margin: 0;
}

/* QR container — sized for 160×160 generated code */
.label-qr { flex-shrink: 0; width: 160px; height: 160px; }
.label-qr img, .label-qr canvas { width: 160px !important; height: 160px !important; }

.label-specs {
  font-size: 0.8rem;
  color: var(--color-text-muted, #555);
  margin: 0.4rem 0;
}

.label-description {
  font-size: 0.85rem;
  margin: 0.4rem 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  color: var(--color-text-muted, #444);
}

.label-pricing {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border, #eee);
  font-size: 0.85rem;
}

.label-pricing .price-row {
  display: flex;
  justify-content: space-between;
  padding: 0.1rem 0;
}

.label-reserve { font-style: italic; color: var(--color-text-muted, #888); }

/* Print styles */

@media print {
  @page { size: letter; margin: 0.5in; }

  .navbar, .footer, #print-btn, #alert-container { display: none !important; }

  body { background: white; color: black; font-size: 90%; }

  .main-content { padding: 0; }

  .labels-header { margin-bottom: 0.75rem; }

  /* Single column for print — each label gets maximum space for QR scanning */
  .labels-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .label-card {
    page-break-inside: avoid;
    break-inside: avoid;
    border: 1.5px solid #666;
    border-radius: 6px;
    padding: 1rem;
    display: grid;
    grid-template-columns: 1fr 180px;
    grid-template-rows: auto;
    column-gap: 1rem;
  }

  /* Meta spans full width */
  .label-meta {
    grid-column: 1 / -1;
    font-size: 0.65rem;
  }

  /* Title block in left column, QR in right column */
  .label-piece-header {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 180px;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .label-qr,
  .label-qr img,
  .label-qr canvas {
    width: 160px !important;
    height: 160px !important;
  }

  .label-title { font-size: 1.3rem; }

  .label-pricing { font-size: 0.8rem; }

  .label-description { -webkit-line-clamp: 2; }
}
```

- [ ] **Step 3: Verify manually**

- Open `auction-labels.html?id=<any>` in a browser (must be logged in as TEACHER/ADMIN)
- Verify QR codes render at 160×160
- Click "Print All Labels"
- In print preview: verify each label appears in a single-column layout with the large QR code prominently placed
- Scan a QR code with a phone camera — confirm it resolves to `auction-detail.html?id=X&artwork=Y`

- [ ] **Step 4: Commit**

```bash
git add public/css/auction-labels.css public/js/auction-labels.js
git commit -m "feat: enlarge QR codes to 160px and improve print label layout for gallery use"
```

---

## Self-Review

**Spec coverage:**
- ✅ Responsive mobile/tablet/desktop fixes — Task 2 (image height, thumbnail scroll, card aspect ratio, filter sidebar)
- ✅ Fullscreen/lightbox when clicking artwork image on auction-detail — Task 3
- ✅ Fullscreen/preview when clicking auction cards on auctions list — Task 4
- ✅ Printable per-artwork QR codes (enhanced labels page) — Task 5
- ✅ QR URLs already correct (existing `auction-labels.js` generates `?id=X&artwork=Y`) — no change needed
- ✅ Keep Cormorant Garant + DM Sans (design direction: enhance existing)

**Placeholder scan:** None — all tasks include real CSS and JS code.

**Type consistency:**
- `openLightbox(piece)` — called in Task 3 JS; `piece` is `this.currentPiece` (the current `AuctionDetail` piece object with `.imageUrl` and `.title`)
- `openCardPreview(auction)` — called in Task 4 JS; `auction` is a member of `this.auctions` (from `auctionService.listAuctions`) with `.image`, `.title`, `.school`, `.currentBid`, `.bidCount`, `.endTime`, `.id`
- `UIComponents.formatCurrency()` — already used throughout; takes a dollar float
- `UIComponents.formatTimeRemaining()` — already used in `createAuctionCard()`; takes milliseconds

**Currency:** All bid amounts passed to `formatCurrency()` come directly from the auction objects, which use dollar convention per the critical architecture note.

**No breaking changes:**
- `showArtworkModal()` is still present in `auction-detail.js` and unchanged; the artwork-detail modal (`#artwork-modal`) still exists in the HTML. The only change is the click handler on `.artwork-image-wrapper` and the fullscreen button now call `openLightbox()` instead.
- The `btn-watch` delegated click in `auctions-page.js` is unaffected.
- No backend changes.
- No test files need updating (these are UI-only changes with no unit-testable logic).
