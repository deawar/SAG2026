# Artwork QR Labels + Authenticated Bidding UI — Design Spec
**Date:** 2026-05-04  
**Status:** Approved  
**Approach:** Option A — URL param on existing auction-detail page + separate printable label page

---

## Problem Statement

Two related gaps in the auction-detail experience:

1. The authenticated bidding UI is stubbed — the form shows for logged-in users but fails silently due to six bugs (status override, BIDDER 403 on history, wrong min-bid hint, click vs submit event, no winning indicator, misleading payment dropdown).
2. Physical gallery auctions need per-artwork QR code labels so in-person attendees can scan to bid on a specific piece. There is no such feature today.

---

## Goals

- Fix all six authenticated bidding bugs so bidding works end-to-end.
- Add `?artwork={artworkId}` URL support so a QR scan lands on the right piece.
- Show a rich auth wall (artwork image + CTA) when an unauthenticated user scans a per-artwork QR.
- Provide a printable label page (`/auction-labels.html`) that teachers/admins use to generate labels for a full auction — one label per artwork piece, ready for `window.print()`.

---

## Out of Scope

- Backend changes — no new API routes required.
- Teacher/admin dashboard "Print Labels" link — labels page is navigated to directly for now.
- Payment processing at bid time — payment remains at checkout after winning.
- Backend bidding validation bug (`+100` cents-vs-dollars mismatch in `biddingService.js`) — noted but not fixed here; frontend sends and displays values in dollars consistently.

---

## Architecture

### URL Design

Per-artwork QR encodes:
```
/auction-detail.html?id={auctionId}&artwork={artworkId}
```

When `?artwork=` is present, `auction-detail.js` auto-selects that piece after artwork loads and scrolls the bid form into view.

Printable label page:
```
/auction-labels.html?id={auctionId}
```
Auth-gated (TEACHER, SCHOOL_ADMIN, SITE_ADMIN). Renders all labels for the auction.

### Data Flow

```
QR scan
  └─ /auction-detail.html?id=X&artwork=Y
       ├─ Not logged in → enhanced auth wall (artwork image + Login/Register CTAs)
       │    └─ Login → returnTo redirect → back to ?id=X&artwork=Y → piece auto-selected
       └─ Logged in → artwork auto-selected, bid form scrolled into view
```

```
Teacher/Admin
  └─ /auction-labels.html?id=X
       ├─ GET /api/auctions/X          → auction title, school name
       ├─ GET /api/auctions/X/artwork  → all artwork pieces (requires auth)
       └─ Render label grid → window.print()
```

---

## File Changes

| File | Change |
|------|--------|
| `public/auction-detail.html` | Remove `#payment-method` form group; add `#leading-bidder-banner` div |
| `public/js/auction-detail.js` | All 6 bidding fixes + `?artwork=` param handling + enhanced auth wall |
| `public/auction-labels.html` | NEW — printable label page shell |
| `public/js/auction-labels.js` | NEW — fetches data, renders labels, generates QR codes |
| `public/css/auction-labels.css` | NEW — screen layout + print stylesheet for 4×6 label cards |
| `tests/integration/routes/artworkQrBiddingTest.spec.js` | NEW — 15 tests |

---

## Detailed Changes

### 1. `auction-detail.html` — HTML changes

**Remove** the entire `<div class="form-group">` block containing `#payment-method` select and its label.

**Replace** with a single note paragraph inside the `<fieldset>`:
```html
<p class="bid-note" id="payment-note">
  Payment is collected at checkout if you win. No card details needed now.
</p>
```

**Add** a leading-bidder banner above `#bidding-form-container`:
```html
<div id="leading-bidder-banner" class="alert alert-success" role="status" aria-live="polite" hidden>
  <strong>🏆 You are the current high bidder</strong>
  <span id="leading-bidder-piece"></span>
</div>
```

---

### 2. `auction-detail.js` — Six Bidding Fixes

#### Fix 1 — `checkLoginStatus()` respects auction status
```
Only show #bidding-form-container when:
  - Token present AND
  - this.auction.status === 'LIVE' AND
  - new Date(this.auction.endTime) > new Date()
Otherwise hide form; disableBidding() result is preserved.
```

#### Fix 2 — Bid history uses per-artwork endpoint
```
loadBidHistory():
  - If this.currentPiece exists: GET /api/bidding/artwork/{id}/history
  - Response shape: { data: [{ bidder: { displayName }, amount, timestamp, status }] }
  - Map to { bidderName, amount, createdAt } for displayBidHistory()
  - Falls back to "No bids yet" if no currentPiece selected
```

#### Fix 3 — Minimum bid hint correct
```
displayArtworkPiece(piece):
  const current = piece.currentBid != null
    ? Number(piece.currentBid)
    : Number(piece.startingPrice ?? 0);
  const MIN_INCREMENT = 10; // $10 — API does not expose minBidIncrement
  minBidHelpEl.textContent = UIComponents.formatCurrency(current + MIN_INCREMENT);
```

#### Fix 4 — Form submits on submit event
```
attachEventListeners():
  const form = document.getElementById('bidding-form');
  form?.addEventListener('submit', (e) => this.submitBid(e, form));
  // Remove the button click listener
```

#### Fix 5 — Leading bidder banner
```
submitBid() on success:
  const banner = document.getElementById('leading-bidder-banner');
  const pieceEl = document.getElementById('leading-bidder-piece');
  if (banner && pieceEl) {
    pieceEl.textContent = this.currentPiece?.title
      ? ` on "${this.currentPiece.title}"`
      : '';
    banner.hidden = false;
  }

handleNewBid() when outbidCurrentUser === true:
  document.getElementById('leading-bidder-banner')?.setAttribute('hidden', '');
```

#### Fix 6 — Remove payment method from submitBid()
```
submitBid():
  Remove paymentMethod variable and any reference to #payment-method.
  Body sent: { artworkId: this.currentPiece?.id, bidAmount: Number.parseFloat(bidAmount) }
```

---

### 3. `?artwork=` Param Handling in `auction-detail.js`

**Constructor:**
```
this.focusArtworkId = new URLSearchParams(location.search).get('artwork');
```

**After `loadArtwork()` resolves** (authenticated path):
```
if (this.focusArtworkId && this.artworks?.length) {
  const target = this.artworks.find(a => a.id === this.focusArtworkId)
               ?? this.artworks[0];
  this.displayArtworkPiece(target);
  this._activateThumbnail(target.id);
  document.getElementById('bidding-form-container')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

**`_activateThumbnail(artworkId)`** (new private method):
```
Finds the index of artworkId in this.artworks array.
Removes artwork-thumb-active from all thumbnail buttons.
Adds artwork-thumb-active to the button at that index (data-index={i}).
```

---

### 4. Enhanced Auth Wall (`_loadPublicPreview()`)

When `this.focusArtworkId` is set and visitor is not logged in, after rendering the public data, replace the generic `#auth-required` content with:

```html
<div class="auth-wall-artwork">
  <img src="{artwork.imageUrl}" alt="{artwork.title}" class="auth-wall-img">
  <div class="auth-wall-body">
    <h2>Log in to bid on "{artwork.title}"</h2>
    <p class="artist-name">{artwork.artistName}</p>
    <p class="auth-wall-price">Starting at {UIComponents.formatCurrency(artwork.startingPrice)}</p>
    <div class="auth-wall-actions">
      <a href="/login.html?returnTo={returnTo}" class="btn btn-primary btn-large">Log in</a>
      <a href="/register.html?returnTo={returnTo}" class="btn btn-secondary">Create account</a>
    </div>
  </div>
</div>
```

`returnTo` encodes the full current path including `?id=...&artwork=...`.

When `focusArtworkId` is NOT set, the existing generic auth banner is shown unchanged.

---

### 5. `auction-labels.html` — New Page

Standard page shell with:
- Nav header (same as other pages)
- `<main>`: auction title + school name heading, "Print All Labels" button
- `<div id="labels-grid">` — populated by JS
- QR code script: `qrcodejs` (already used project-wide)
- Scripts: `theme-manager.js`, `api-client.js`, `auth-manager.js`, `auction-labels.js`

Page-level auth check in `auction-labels.js`: redirect to `/login.html?returnTo={currentPath}` if no token present, or if role is not one of TEACHER, SCHOOL_ADMIN, SITE_ADMIN.

---

### 6. `auction-labels.js` — Label Rendering

**On load:**
1. Read `?id=` from URL — redirect to `/auctions.html` if missing
2. Check auth token + role (TEACHER / SCHOOL_ADMIN / SITE_ADMIN only)
3. `GET /api/auctions/{id}` → auction title, school name, endTime
4. `GET /api/auctions/{id}/artwork` → artwork array
5. For each artwork piece, call `renderLabel(piece, index, total, auction)`
6. After all labels rendered, generate QR codes (one `new QRCode(el, {...})` call per label)

**`renderLabel(piece, index, total, auction)` returns HTML string:**
```
┌─────────────────────────────────────────┐
│ [School Name] · [Auction Title]  small  │
│ Piece {index} of {total}                │
│                                         │
│ [Title]                    [QR CODE]    │
│ [Artist Name]              100×100px    │
│                                         │
│ Medium · Dimensions                     │
│ Description (3 lines max)               │
│                                         │
│ Reserve: $X.XX  (shown if exists)       │
│ Starting bid: $X.XX                     │
│ Current bid: $X.XX  (shown if > 0)      │
└─────────────────────────────────────────┘
```

Each label has `data-artwork-id` and `data-auction-id` attributes so QR generation can find the right element.

**QR code content:**
```
{origin}/auction-detail.html?id={auctionId}&artwork={artworkId}
```

---

### 7. `auction-labels.css` — Print Layout

**Screen styles:**
- `.labels-grid`: CSS grid, 2 columns, gap 1.5rem
- `.label-card`: border 1px solid, padding 1rem, border-radius 8px
- `.label-qr`: float right, margin-left 1rem

**Print styles (`@media print`):**
- Hide: `.navbar`, `.footer`, `#print-btn`, `#alert-container`
- `.labels-grid`: 2 columns per row
- `.label-card`: `page-break-inside: avoid`, border, padding
- Font sizes reduced ~10% for label fit
- `@page { size: letter; margin: 0.5in; }`

---

## Test Plan

**File:** `tests/integration/routes/artworkQrBiddingTest.spec.js`

| # | Test | Type |
|---|------|------|
| 1 | `?artwork=` param selects correct piece on load | Frontend unit |
| 2 | `?artwork=` with unknown ID falls back to first piece | Frontend unit |
| 3 | Enhanced auth wall shown when `?artwork=` + no token | Frontend unit |
| 4 | Generic auth wall shown when no `?artwork=` + no token | Frontend unit |
| 5 | `checkLoginStatus()` hides form when status is ENDED | Frontend unit |
| 6 | `checkLoginStatus()` hides form when end time is past | Frontend unit |
| 7 | `checkLoginStatus()` shows form when LIVE + future end time | Frontend unit |
| 8 | `submitBid()` fires on form submit event | Frontend unit |
| 9 | `submitBid()` success shows leading-bidder banner | Frontend unit |
| 10 | `handleNewBid(outbidCurrentUser: true)` hides banner | Frontend unit |
| 11 | `loadBidHistory()` calls artwork-level endpoint | Frontend unit |
| 12 | Min-bid hint = currentBid + increment | Frontend unit |
| 13 | Label page renders correct count for 5-piece auction | Frontend unit |
| 14 | Label QR href contains auctionId + artworkId | Frontend unit |
| 15 | Label page redirects to login if no token | Frontend unit |

---

## Resumption Notes

If context is lost mid-implementation, the full design is saved to memory at:
`C:\Users\Dean.SSCCBISHOP.000\.claude\projects\c--Users-Dean-SSCCBISHOP-000-OneDrive-projects-SAG2026\memory\project_artwork_qr_bidding.md`

Working directory: `c:\Users\Dean.SSCCBISHOP.000\OneDrive\projects\SAG2026\Silent-Auction-Gallery\`

Approved approach: Option A. All 6 bidding fixes + `?artwork=` param + enhanced auth wall + new `/auction-labels.html` page.
