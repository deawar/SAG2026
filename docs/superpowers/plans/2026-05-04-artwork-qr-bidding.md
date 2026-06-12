# Artwork QR Labels + Authenticated Bidding UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 authenticated bidding UI bugs on the auction-detail page, add `?artwork=` QR deep-link param with an enhanced auth wall for unauthenticated gallery visitors, and ship a new printable `/auction-labels.html` page for physical gallery use.

**Architecture:** All changes are frontend-only. `auction-detail.js` holds the `AuctionDetail` class that owns all bidding logic; three new files (`auction-labels.html/js/css`) provide the printable label feature. Tests use `jest-environment-jsdom` with `Object.create(Prototype)` to unit-test class methods against a minimal DOM without triggering the constructor.

**Tech Stack:** Vanilla JS (ES6 classes), Jest 29, `jest-environment-jsdom`, `qrcodejs` (CDN, already on page)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `public/auction-detail.html` | Modify | Remove `#payment-method` select; add `#leading-bidder-banner`; change `#bid-history-container` to `<ul>` |
| `public/js/auction-detail.js` | Modify | All 6 bidding fixes + `?artwork=` param + `_focusArtwork()` + `_activateThumbnail()` + `_renderEnhancedAuthWall()` |
| `public/auction-labels.html` | Create | Printable label page shell |
| `public/js/auction-labels.js` | Create | `AuctionLabels` class — fetch artwork, render label cards, generate QR codes |
| `public/css/auction-labels.css` | Create | Screen layout + `@media print` stylesheet |
| `tests/integration/routes/artworkQrBiddingTest.spec.js` | Create | 15 frontend unit tests |

---

## Task 1: HTML changes to auction-detail.html + install jsdom

**Files:**
- Modify: `public/auction-detail.html:187-196` (remove payment-method group)
- Modify: `public/auction-detail.html:162` (add leading-bidder banner)
- Modify: `public/auction-detail.html:230-233` (div → ul for bid history)

- [ ] **Step 1: Install jest-environment-jsdom**

```bash
npm install --save-dev jest-environment-jsdom
```

Expected: `added 1 package` (or similar). Required for all `@jest-environment jsdom` test files.

- [ ] **Step 2: Remove the payment-method form group from auction-detail.html**

In `public/auction-detail.html`, find and replace the entire 10-line `<div class="form-group">` block that contains `id="payment-method"`:

Old (lines 187–196):
```html
                                        <div class="form-group">
                                            <label for="payment-method">Payment Method <span aria-label="required">*</span></label>
                                            <select id="payment-method" class="form-control" required aria-required="true" aria-describedby="payment-help">
                                                <option value="">Select payment method</option>
                                                <option value="credit_card">Credit Card</option>
                                                <option value="debit_card">Debit Card</option>
                                                <option value="bank_transfer">Bank Transfer</option>
                                            </select>
                                            <small id="payment-help" class="help-text">Required to finalize purchase if you win</small>
                                        </div>
```

New:
```html
                                        <p class="bid-note" id="payment-note">
                                          Payment is collected at checkout if you win. No card details needed now.
                                        </p>
```

- [ ] **Step 3: Add leading-bidder banner before bidding-form-container**

Immediately before the line `<div id="bidding-form-container" style="display:none;">` (currently line 162), insert:

```html
                            <div id="leading-bidder-banner" class="alert alert-success" role="status" aria-live="polite" hidden>
                              <strong>You are the current high bidder</strong>
                              <span id="leading-bidder-piece"></span>
                            </div>
```

- [ ] **Step 4: Change #bid-history-container from div to ul**

Lines 230–233 currently read:
```html
                    <div id="bid-history-container" class="bid-history-list" role="list" aria-live="polite" aria-atomic="false">
                        <p class="loading-message">Loading bid history...</p>
                    </div>
```

Replace with:
```html
                    <ul id="bid-history-container" class="bid-history-list" aria-live="polite" aria-atomic="false">
                        <li class="loading-message">Loading bid history...</li>
                    </ul>
```

- [ ] **Step 5: Commit**

```bash
git add public/auction-detail.html package.json package-lock.json
git commit -m "feat: add leading-bidder banner, remove payment-method select, fix bid-history ul"
```

---

## Task 2: Fix checkLoginStatus() — tests 5, 6, 7

**Files:**
- Create: `tests/integration/routes/artworkQrBiddingTest.spec.js` (scaffold + tests 5, 6, 7)
- Modify: `public/js/auction-detail.js:295-309`

**The bug:** `checkLoginStatus()` runs after `updateAuctionStatus()` which calls `disableBidding()` for ENDED/DRAFT/expired auctions. The current code then re-shows the form for any logged-in user, overriding `disableBidding()`.

- [ ] **Step 1: Create the test file with scaffold and failing tests 5, 6, 7**

Create `tests/integration/routes/artworkQrBiddingTest.spec.js`:

```js
/**
 * @jest-environment jsdom
 */
'use strict';

// --- Global stubs (set up before require so module loads cleanly) ---

const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage });

globalThis.UIComponents = {
  initializeNavbar: jest.fn(),
  formatCurrency: (n) => `$${Number(n).toFixed(2)}`,
  formatDateTime: () => 'some time',
  showAlert: jest.fn(),
  showLoading: jest.fn(() => null),
  hideLoading: jest.fn(),
  createToast: jest.fn(),
  showModal: jest.fn(),
};

globalThis.ThemeManager = { apply: jest.fn() };
globalThis.WebSocket = jest.fn().mockImplementation(() => ({
  addEventListener: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
}));
globalThis.QRCode = jest.fn();
globalThis.fetch = jest.fn().mockResolvedValue({
  ok: false,
  json: async () => ({}),
});

const AuctionDetail = require('../../../public/js/auction-detail.js');

/**
 * Create an AuctionDetail instance without triggering init().
 * Tests set only the properties they need via overrides.
 */
function makeInstance(overrides = {}) {
  const inst = Object.create(AuctionDetail.prototype);
  inst.auctionId = 'auction-1';
  inst.auction = null;
  inst.bidHistory = [];
  inst.isUserLoggedIn = false;
  inst.isVisitor = false;
  inst.currentPiece = null;
  inst.artworks = [];
  inst.focusArtworkId = null;
  Object.assign(inst, overrides);
  return inst;
}

// =================== TASK 2: checkLoginStatus() ===================

describe('checkLoginStatus()', () => {
  beforeEach(() => {
    // Simulate post-disableBidding state: form is already hidden
    document.body.innerHTML = `
      <div id="auth-required" style="display:none;"></div>
      <div id="bidding-form-container" style="display:none;"></div>
    `;
    mockLocalStorage.clear();
  });

  test('5 — keeps form hidden when auction status is ENDED', () => {
    mockLocalStorage.setItem('auth_token', 'tok');
    const inst = makeInstance({
      auction: { status: 'ENDED', endTime: new Date(Date.now() + 60_000).toISOString() },
    });
    inst.checkLoginStatus();
    expect(document.getElementById('bidding-form-container').style.display).toBe('none');
  });

  test('6 — keeps form hidden when end time is in the past', () => {
    mockLocalStorage.setItem('auth_token', 'tok');
    const inst = makeInstance({
      auction: { status: 'LIVE', endTime: new Date(Date.now() - 1000).toISOString() },
    });
    inst.checkLoginStatus();
    expect(document.getElementById('bidding-form-container').style.display).toBe('none');
  });

  test('7 — shows form when LIVE and end time is in the future', () => {
    mockLocalStorage.setItem('auth_token', 'tok');
    const inst = makeInstance({
      auction: { status: 'LIVE', endTime: new Date(Date.now() + 60_000).toISOString() },
    });
    inst.checkLoginStatus();
    expect(document.getElementById('bidding-form-container').style.display).toBe('block');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 5 and 6 fail — old code sets `display:block` unconditionally for logged-in users.

- [ ] **Step 3: Fix checkLoginStatus() in auction-detail.js**

Replace the entire `checkLoginStatus()` method (lines 295–309):

Old:
```js
  checkLoginStatus() {
    const token = localStorage.getItem('auth_token');
    this.isUserLoggedIn = !!token;

    const authRequired = document.getElementById('auth-required');
    const biddingForm = document.getElementById('bidding-form-container');

    if (this.isUserLoggedIn) {
      if (authRequired) {authRequired.style.display = 'none';}
      if (biddingForm) {biddingForm.style.display = 'block';}
    } else {
      if (authRequired) {authRequired.style.display = 'block';}
      if (biddingForm) {biddingForm.style.display = 'none';}
    }
  }
```

New:
```js
  checkLoginStatus() {
    const token = localStorage.getItem('auth_token');
    this.isUserLoggedIn = !!token;

    const authRequired = document.getElementById('auth-required');
    const biddingForm = document.getElementById('bidding-form-container');

    if (!this.isUserLoggedIn) {
      if (authRequired) { authRequired.style.display = 'block'; }
      if (biddingForm) { biddingForm.style.display = 'none'; }
      return;
    }

    // Logged in — always hide the auth wall
    if (authRequired) { authRequired.style.display = 'none'; }

    // Only show bid form when auction is actively live — preserves disableBidding() for ENDED/DRAFT/etc.
    if (
      this.auction?.status === 'LIVE' &&
      new Date(this.auction?.endTime) > new Date()
    ) {
      if (biddingForm) { biddingForm.style.display = 'block'; }
    }
  }
```

- [ ] **Step 4: Run tests to confirm 5, 6, 7 pass**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add public/js/auction-detail.js tests/integration/routes/artworkQrBiddingTest.spec.js
git commit -m "fix: checkLoginStatus respects auction status and end time before showing bid form"
```

---

## Task 3: Fix loadBidHistory() — test 11

**Files:**
- Modify: `tests/integration/routes/artworkQrBiddingTest.spec.js` (add test 11)
- Modify: `public/js/auction-detail.js:247-290` (loadBidHistory + displayBidHistory empty states + _loadPublicPreview)

**The bug:** `loadBidHistory()` calls `GET /api/auctions/:id/bids` which is school-scoped and returns 403 for BIDDER role. Must use `GET /api/bidding/artwork/:id/history` instead.

- [ ] **Step 1: Add failing test 11 to the test file**

Append this `describe` block to `tests/integration/routes/artworkQrBiddingTest.spec.js`:

```js
// =================== TASK 3: loadBidHistory() ===================

describe('loadBidHistory()', () => {
  beforeEach(() => {
    document.body.innerHTML = `<ul id="bid-history-container"></ul>`;
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  test('11 — calls per-artwork history endpoint', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { bidder: { displayName: 'Alice' }, amount: 150, timestamp: '2026-01-01T00:00:00Z', status: 'ACTIVE' },
        ],
      }),
    });

    const inst = makeInstance({ currentPiece: { id: 'art-42' } });
    await inst.loadBidHistory();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/bidding/artwork/art-42/history',
      expect.any(Object)
    );
    expect(inst.bidHistory[0].bidderName).toBe('Alice');
    expect(inst.bidHistory[0].amount).toBe(150);
  });
});
```

- [ ] **Step 2: Run test 11 to confirm it fails**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: test 11 fails — current code calls `/api/auctions/auction-1/bids`.

- [ ] **Step 3: Replace loadBidHistory() in auction-detail.js**

Replace lines 247–262:

Old:
```js
  async loadBidHistory() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/auctions/${this.auctionId}/bids`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();

      if (response.ok) {
        this.bidHistory = data.bids || [];
        this.displayBidHistory();
      }
    } catch (error) {
      console.error('Load bid history error:', error);
    }
  }
```

New:
```js
  async loadBidHistory() {
    if (!this.currentPiece) {
      const list = document.getElementById('bid-history-container');
      if (list) { list.innerHTML = '<li class="text-muted">No bids yet</li>'; }
      return;
    }
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/bidding/artwork/${this.currentPiece.id}/history`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();

      if (response.ok) {
        this.bidHistory = (data.data || []).map(b => ({
          bidderName: b.bidder?.displayName ?? 'Anonymous',
          amount: b.amount,
          createdAt: b.timestamp,
        }));
        this.displayBidHistory();
      }
    } catch (error) {
      console.error('Load bid history error:', error);
    }
  }
```

- [ ] **Step 4: Fix displayBidHistory() empty-state from `<p>` to `<li>`**

In `displayBidHistory()` (lines 267–276), change:
```js
    if (this.bidHistory.length === 0) {
      list.innerHTML = '<p class="text-muted">No bids yet</p>';
      return;
    }
```
To:
```js
    if (this.bidHistory.length === 0) {
      list.innerHTML = '<li class="text-muted">No bids yet</li>';
      return;
    }
```

- [ ] **Step 5: Fix _loadPublicPreview() auth message from `<p>` to `<li>`**

In `_loadPublicPreview()` (around line 98), change:
```js
        historyContainer.innerHTML = '<p class="text-muted">Log in to see bid history</p>';
```
To:
```js
        historyContainer.innerHTML = '<li class="text-muted">Log in to see bid history</li>';
```

- [ ] **Step 6: Run tests to confirm test 11 passes**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 5, 6, 7, 11 pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/auction-detail.js tests/integration/routes/artworkQrBiddingTest.spec.js
git commit -m "fix: loadBidHistory uses per-artwork endpoint — works for BIDDER role (no school restriction)"
```

---

## Task 4: Form submit event, remove paymentMethod, leading-bidder banner — tests 8, 9, 10

**Files:**
- Modify: `tests/integration/routes/artworkQrBiddingTest.spec.js` (add tests 8, 9, 10)
- Modify: `public/js/auction-detail.js:314-319` (attachEventListeners)
- Modify: `public/js/auction-detail.js:400-466` (submitBid)
- Modify: `public/js/auction-detail.js:895-913` (handleNewBid)

- [ ] **Step 1: Add failing tests 8, 9, 10 to the test file**

Append this `describe` block:

```js
// =================== TASK 4: submit event + banner ===================

describe('attachEventListeners() and submitBid()', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="bidding-form">
        <input id="bid-amount" type="number" value="150">
        <button type="submit" id="place-bid-btn">Place Bid</button>
      </form>
      <div id="leading-bidder-banner" hidden>
        <span id="leading-bidder-piece"></span>
      </div>
    `;
    mockLocalStorage.setItem('auth_token', 'tok');
    jest.clearAllMocks();
  });

  test('8 — submitBid fires on form submit event, not just button click', () => {
    const inst = makeInstance({
      auction: { status: 'LIVE', endTime: new Date(Date.now() + 60_000).toISOString(), currentBid: 100 },
      currentPiece: { id: 'art-1', title: 'Sunset' },
    });
    const submitSpy = jest.spyOn(inst, 'submitBid').mockImplementation((e) => e.preventDefault());
    inst.attachEventListeners();

    document.getElementById('bidding-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  test('9 — successful submitBid shows leading-bidder banner with piece title', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ biddingState: { currentBid: 150, totalBids: 3 } }),
    });

    const inst = makeInstance({
      auction: { status: 'LIVE', endTime: new Date(Date.now() + 60_000).toISOString(), currentBid: 100 },
      currentPiece: { id: 'art-1', title: 'Sunset' },
    });
    inst.updateBidInfo = jest.fn();
    inst.loadBidHistory = jest.fn().mockResolvedValue(undefined);

    const form = document.getElementById('bidding-form');
    await inst.submitBid(new Event('submit', { cancelable: true }), form);

    expect(document.getElementById('leading-bidder-banner').hidden).toBe(false);
    expect(document.getElementById('leading-bidder-piece').textContent).toContain('Sunset');
  });

  test('10 — handleNewBid with outbidCurrentUser:true hides leading-bidder banner', () => {
    document.getElementById('leading-bidder-banner').hidden = false;

    const inst = makeInstance();
    inst.displayBidHistory = jest.fn();
    inst.handleNewBid({ bidderName: 'Bob', amount: 200, outbidCurrentUser: true });

    expect(document.getElementById('leading-bidder-banner').hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests 8, 9, 10 to confirm they fail**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 8 and 9 fail. Test 10 may fail (no banner-hide in handleNewBid).

- [ ] **Step 3: Fix attachEventListeners() — listen on form submit, not button click**

Replace the bid form listener block (lines 315–319):

Old:
```js
    const biddingForm = document.getElementById('bidding-form');
    if (biddingForm) {
      const submitBtn = biddingForm.querySelector('button[type="submit"]');
      submitBtn?.addEventListener('click', (e) => this.submitBid(e, biddingForm));
    }
```

New:
```js
    const biddingForm = document.getElementById('bidding-form');
    if (biddingForm) {
      biddingForm.addEventListener('submit', (e) => this.submitBid(e, biddingForm));
    }
```

- [ ] **Step 4: Remove paymentMethod from submitBid() + add leading-bidder banner**

**a)** Remove the `paymentMethod` line from `submitBid()` (line 404). Change:

```js
    const bidAmount = form.querySelector('#bid-amount')?.value;
    const paymentMethod = form.querySelector('#payment-method')?.value;
```

To:

```js
    const bidAmount = form.querySelector('#bid-amount')?.value;
```

**b)** After `form.reset();` and before `this.loadBidHistory();` (around line 455), insert the banner logic:

```js
      // Show leading-bidder banner
      const banner = document.getElementById('leading-bidder-banner');
      const pieceEl = document.getElementById('leading-bidder-piece');
      if (banner && pieceEl) {
        pieceEl.textContent = this.currentPiece?.title ? ` on "${this.currentPiece.title}"` : '';
        banner.hidden = false;
      }
```

- [ ] **Step 5: Hide banner in handleNewBid() when current user is outbid**

In `handleNewBid()` (around lines 906–912), replace:

```js
    if (data.outbidCurrentUser) {
      UIComponents.createToast({
        message: 'You have been outbid!',
        type: 'warning',
        duration: 5000
      });
    }
```

With:

```js
    if (data.outbidCurrentUser) {
      UIComponents.createToast({
        message: 'You have been outbid!',
        type: 'warning',
        duration: 5000
      });
      const banner = document.getElementById('leading-bidder-banner');
      if (banner) { banner.hidden = true; }
    }
```

- [ ] **Step 6: Run tests to confirm 8, 9, 10 pass**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 5, 6, 7, 8, 9, 10, 11 pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/auction-detail.js tests/integration/routes/artworkQrBiddingTest.spec.js
git commit -m "fix: form submit event, remove payment field, add leading-bidder banner on bid success"
```

---

## Task 5: Min-bid hint fix — test 12

**Files:**
- Modify: `tests/integration/routes/artworkQrBiddingTest.spec.js` (add test 12)
- Modify: `public/js/auction-detail.js:192-197` (remove stale block from updateBidInfo)

**The bug:** `displayArtworkPiece()` correctly sets `#min-bid-amount` using per-artwork `currentBid`. But `updateBidInfo()` also sets `#min-bid-amount` using `this.auction.currentBid` (which doesn't exist — it's per-artwork), clobbering the correct value.

- [ ] **Step 1: Add test 12 to the test file**

Append this `describe` block:

```js
// =================== TASK 5: min-bid hint ===================

describe('displayArtworkPiece() min-bid hint', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <img id="artwork-image">
      <p id="artwork-artist"></p>
      <p id="artwork-artist-small"></p>
      <dd id="artwork-medium"></dd>
      <dd id="artwork-dimensions"></dd>
      <span id="display-opening-bid"></span>
      <span id="display-current-bid"></span>
      <span id="display-bid-count"></span>
      <span id="min-bid-amount"></span>
    `;
  });

  test('12 — min-bid hint equals currentBid + $10 increment', () => {
    const inst = makeInstance();
    inst.displayArtworkPiece({
      id: 'art-1', title: 'Sunset', artistName: 'Alice',
      imageUrl: '', startingPrice: 100, currentBid: 200,
      bidCount: 3, medium: 'Oil', dimensions: '10x10',
    });
    expect(document.getElementById('min-bid-amount').textContent).toBe('$210.00');
  });
});
```

- [ ] **Step 2: Run test 12 — it may already pass**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

`displayArtworkPiece` already uses `current + 10` correctly. Test 12 should pass. The remaining fix is to prevent `updateBidInfo()` from clobbering it.

- [ ] **Step 3: Remove #min-bid-amount block from updateBidInfo()**

In `updateBidInfo()` (lines 192–197), remove these 5 lines entirely:

```js
    const minBidHelpEl = document.getElementById('min-bid-amount');
    if (minBidHelpEl) {
      const current = this.auction.currentBid ?? 0;
      const increment = this.auction.minBidIncrement ?? 10;
      minBidHelpEl.textContent = UIComponents.formatCurrency(current + increment);
    }
```

The `#min-bid-amount` element is now exclusively managed by `displayArtworkPiece()`.

- [ ] **Step 4: Run all tests to confirm nothing regressed**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 5–12 all pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/auction-detail.js tests/integration/routes/artworkQrBiddingTest.spec.js
git commit -m "fix: remove stale updateBidInfo min-bid block that clobbered per-artwork hint"
```

---

## Task 6: ?artwork= param + _focusArtwork() + _activateThumbnail() — tests 1, 2

**Files:**
- Modify: `tests/integration/routes/artworkQrBiddingTest.spec.js` (add tests 1, 2)
- Modify: `public/js/auction-detail.js:8` (constructor — add focusArtworkId)
- Modify: `public/js/auction-detail.js:635-639` (loadArtwork — call _focusArtwork)
- Modify: `public/js/auction-detail.js:90-94` (_loadPublicPreview — call _focusArtwork)
- Modify: `public/js/auction-detail.js:985` (add three new private methods before destroy)

- [ ] **Step 1: Add failing tests 1, 2 to the test file**

Append this `describe` block (place before or after other describes — order doesn't matter):

```js
// =================== TASK 6: ?artwork= param ===================

describe('_focusArtwork()', () => {
  const artworks = [
    { id: 'art-1', title: 'First', artistName: 'Alice', imageUrl: '', startingPrice: 100, currentBid: null, bidCount: 0, medium: '', dimensions: '' },
    { id: 'art-2', title: 'Second', artistName: 'Bob', imageUrl: '', startingPrice: 200, currentBid: null, bidCount: 0, medium: '', dimensions: '' },
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <img id="artwork-image">
      <p id="artwork-artist"></p>
      <p id="artwork-artist-small"></p>
      <dd id="artwork-medium"></dd>
      <dd id="artwork-dimensions"></dd>
      <span id="display-opening-bid"></span>
      <span id="display-current-bid"></span>
      <span id="display-bid-count"></span>
      <span id="min-bid-amount"></span>
      <div id="artwork-thumbnails"></div>
      <div id="bidding-form-container" style="display:block;"></div>
      <div id="auth-required" style="display:none;"></div>
    `;
  });

  test('1 — selects the artwork matching focusArtworkId', () => {
    const inst = makeInstance({ artworks, focusArtworkId: 'art-2', isVisitor: false });
    inst.renderArtworkGallery(artworks);
    inst._focusArtwork();
    expect(inst.currentPiece.id).toBe('art-2');
  });

  test('2 — falls back to first artwork when focusArtworkId does not match', () => {
    const inst = makeInstance({ artworks, focusArtworkId: 'nonexistent', isVisitor: false });
    inst.renderArtworkGallery(artworks);
    inst._focusArtwork();
    expect(inst.currentPiece.id).toBe('art-1');
  });
});
```

- [ ] **Step 2: Run tests 1, 2 to confirm they fail**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 1 and 2 fail with `inst._focusArtwork is not a function`.

- [ ] **Step 3: Add focusArtworkId to constructor**

In `auction-detail.js` constructor (line 8), add after `this.auctionId = ...`:

```js
    this.focusArtworkId = new URLSearchParams(globalThis.location.search).get('artwork');
```

- [ ] **Step 4: Add three new private methods before destroy()**

Insert the following three methods immediately before the `destroy()` method (around line 985):

```js
  /**
   * Select and display the piece targeted by ?artwork= param (or first piece).
   * Logged-in users with a focus ID get the bid form scrolled into view.
   * Visitors with a focus ID get the enhanced auth wall.
   */
  _focusArtwork() {
    if (!this.artworks?.length) { return; }

    const target = this.focusArtworkId
      ? (this.artworks.find(a => String(a.id) === String(this.focusArtworkId)) ?? this.artworks[0])
      : this.artworks[0];

    this.displayArtworkPiece(target);
    this._activateThumbnail(target.id);

    if (this.isVisitor && this.focusArtworkId) {
      this._renderEnhancedAuthWall(target);
    } else if (!this.isVisitor && this.focusArtworkId) {
      document.getElementById('bidding-form-container')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Activate the thumbnail button for the given artworkId.
   */
  _activateThumbnail(artworkId) {
    const container = document.getElementById('artwork-thumbnails');
    if (!container) { return; }
    const idx = this.artworks.findIndex(a => String(a.id) === String(artworkId));
    container.querySelectorAll('.artwork-thumb').forEach(b => b.classList.remove('artwork-thumb-active'));
    container.querySelector(`.artwork-thumb[data-index="${idx}"]`)?.classList.add('artwork-thumb-active');
  }

  /**
   * Replace the generic auth wall with an artwork-specific image + bid CTA.
   * Only called when an unauthenticated visitor scans a per-artwork QR (?artwork= set).
   */
  _renderEnhancedAuthWall(artwork) {
    const authEl = document.getElementById('auth-required');
    if (!authEl) { return; }
    const returnTo = encodeURIComponent(globalThis.location.pathname + globalThis.location.search);
    authEl.innerHTML = `
      <div class="auth-wall-artwork">
        <img src="${this.escapeHtml(artwork.imageUrl || '')}" alt="${this.escapeHtml(artwork.title || 'Artwork')}" class="auth-wall-img">
        <div class="auth-wall-body">
          <h2>Log in to bid on &ldquo;${this.escapeHtml(artwork.title || 'this artwork')}&rdquo;</h2>
          <p class="artist-name">${this.escapeHtml(artwork.artistName || '')}</p>
          <p class="auth-wall-price">Starting at ${UIComponents.formatCurrency(Number(artwork.startingPrice ?? 0))}</p>
          <div class="auth-wall-actions">
            <a href="/login.html?returnTo=${returnTo}" class="btn btn-primary btn-large">Log in</a>
            <a href="/register.html?returnTo=${returnTo}" class="btn btn-secondary">Create account</a>
          </div>
        </div>
      </div>
    `;
    authEl.style.display = 'block';
  }
```

- [ ] **Step 5: Update loadArtwork() to use _focusArtwork()**

In `loadArtwork()` (lines 635–639), change:

```js
      if (data.artwork && data.artwork.length > 0) {
        this.artworks = data.artwork;
        this.displayArtworkPiece(data.artwork[0]);
        this.renderArtworkGallery(data.artwork);
      }
```

To:

```js
      if (data.artwork && data.artwork.length > 0) {
        this.artworks = data.artwork;
        this.renderArtworkGallery(data.artwork);
        this._focusArtwork();
      }
```

- [ ] **Step 6: Update _loadPublicPreview() to use _focusArtwork()**

In `_loadPublicPreview()` (lines 90–94), change:

```js
      if (data.artworks && data.artworks.length > 0) {
        this.artworks = data.artworks;
        this.displayArtworkPiece(data.artworks[0]);
        this.renderArtworkGallery(data.artworks);
      }
```

To:

```js
      if (data.artworks && data.artworks.length > 0) {
        this.artworks = data.artworks;
        this.renderArtworkGallery(data.artworks);
        this._focusArtwork();
      }
```

- [ ] **Step 7: Run tests to confirm 1, 2 pass**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 1, 2, 5, 6, 7, 8, 9, 10, 11, 12 all pass.

- [ ] **Step 8: Commit**

```bash
git add public/js/auction-detail.js tests/integration/routes/artworkQrBiddingTest.spec.js
git commit -m "feat: add ?artwork= QR deep-link — auto-selects piece, scrolls bid form into view"
```

---

## Task 7: Enhanced auth wall — tests 3, 4

**Files:**
- Modify: `tests/integration/routes/artworkQrBiddingTest.spec.js` (add tests 3, 4)

The `_renderEnhancedAuthWall()` implementation was added in Task 6. This task only adds tests to verify the behaviour.

- [ ] **Step 1: Add tests 3, 4 to the test file**

Append this `describe` block:

```js
// =================== TASK 7: enhanced auth wall ===================

describe('_renderEnhancedAuthWall()', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="auth-required" style="display:none;"></div>
      <div id="artwork-thumbnails"></div>
      <img id="artwork-image">
      <p id="artwork-artist"></p>
      <p id="artwork-artist-small"></p>
      <dd id="artwork-medium"></dd>
      <dd id="artwork-dimensions"></dd>
      <span id="display-opening-bid"></span>
      <span id="display-current-bid"></span>
      <span id="display-bid-count"></span>
      <span id="min-bid-amount"></span>
    `;
  });

  test('3 — enhanced auth wall shown when visitor + focusArtworkId is set', () => {
    const artwork = {
      id: 'art-1', title: 'Sunset', artistName: 'Alice',
      imageUrl: '/img/1.jpg', startingPrice: 100,
      currentBid: null, bidCount: 0, medium: '', dimensions: '',
    };
    const inst = makeInstance({ artworks: [artwork], focusArtworkId: 'art-1', isVisitor: true });
    inst.renderArtworkGallery = jest.fn();
    inst._focusArtwork();

    const authEl = document.getElementById('auth-required');
    expect(authEl.style.display).toBe('block');
    expect(authEl.innerHTML).toContain('Log in to bid on');
    expect(authEl.innerHTML).toContain('Sunset');
    expect(authEl.innerHTML).toContain('/login.html?returnTo=');
  });

  test('4 — generic auth wall unchanged when no focusArtworkId', () => {
    document.body.innerHTML = `
      <div id="auth-required" style="display:block;">
        <p><strong>Want to place a bid?</strong></p>
      </div>
      <div id="artwork-thumbnails"></div>
      <img id="artwork-image">
      <p id="artwork-artist"></p>
      <p id="artwork-artist-small"></p>
      <dd id="artwork-medium"></dd>
      <dd id="artwork-dimensions"></dd>
      <span id="display-opening-bid"></span>
      <span id="display-current-bid"></span>
      <span id="display-bid-count"></span>
      <span id="min-bid-amount"></span>
    `;
    const artwork = {
      id: 'art-1', title: 'Sunset', artistName: 'Alice',
      imageUrl: '', startingPrice: 100,
      currentBid: null, bidCount: 0, medium: '', dimensions: '',
    };
    const inst = makeInstance({ artworks: [artwork], focusArtworkId: null, isVisitor: true });
    inst.renderArtworkGallery = jest.fn();
    inst._focusArtwork();

    const authEl = document.getElementById('auth-required');
    expect(authEl.innerHTML).not.toContain('Log in to bid on');
    expect(authEl.innerHTML).toContain('Want to place a bid?');
  });
});
```

- [ ] **Step 2: Run tests 3, 4 to confirm they pass**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: all 12 tests (1–12) pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/routes/artworkQrBiddingTest.spec.js
git commit -m "test: add enhanced auth wall tests (3, 4)"
```

---

## Task 8: auction-labels.html and auction-labels.css

**Files:**
- Create: `public/auction-labels.html`
- Create: `public/css/auction-labels.css`

- [ ] **Step 1: Create public/auction-labels.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auction Labels - Silent Auction Gallery</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garant:ital,wght@0,500;0,600;0,700;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap">
  <link rel="stylesheet" href="/css/theme.css">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="/css/auction-labels.css">
  <link rel="icon" type="image/x-icon" href="/favicon/favicon.ico">
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
</head>
<body>
  <header class="navbar" role="banner">
    <div class="navbar-container">
      <div class="navbar-brand">
        <a href="/" class="logo" aria-label="Silent Auction Gallery Home">
          <img src="/images/logo/SAGLive.png" alt="Silent Auction Gallery Logo" class="logo-img">
          <span class="logo-text">SAG</span>
        </a>
      </div>
      <div class="navbar-auth">
        <button class="btn btn-secondary" id="login-btn" aria-label="Login">Login</button>
        <button class="btn btn-profile" id="user-menu-btn" aria-label="User menu" style="display:none;">
          <span id="user-name"></span>
          <span class="menu-icon" aria-hidden="true">▼</span>
        </button>
      </div>
    </div>
  </header>

  <main id="main-content" class="main-content">
    <div class="container">
      <div class="labels-header">
        <div>
          <h1 id="auction-title">Loading...</h1>
          <p id="school-name" class="school-name"></p>
        </div>
        <button class="btn btn-primary" id="print-btn" onclick="window.print()">Print All Labels</button>
      </div>
      <div id="alert-container" class="alert-container" role="region" aria-live="polite"></div>
      <div id="labels-grid" class="labels-grid" aria-label="Printable auction labels">
        <!-- Populated by auction-labels.js -->
      </div>
    </div>
  </main>

  <script src="/js/theme-manager.js"></script>
  <script src="/js/api-client.js"></script>
  <script src="/js/auth-manager.js"></script>
  <script src="/js/ui-components.js"></script>
  <script src="/js/auction-labels.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/css/auction-labels.css**

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
  padding: 1rem;
  background: #fff;
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
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.label-title-block { flex: 1; min-width: 0; }

.label-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.2rem;
  font-family: 'Cormorant Garant', serif;
}

.label-artist {
  font-size: 0.85rem;
  color: var(--color-text-muted, #555);
  margin: 0;
}

.label-qr { flex-shrink: 0; width: 100px; height: 100px; }
.label-qr img, .label-qr canvas { width: 100px !important; height: 100px !important; }

.label-specs {
  font-size: 0.8rem;
  color: var(--color-text-muted, #555);
  margin: 0.4rem 0;
}

.label-description {
  font-size: 0.8rem;
  margin: 0.4rem 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.label-pricing {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border, #eee);
  font-size: 0.8rem;
}

.label-pricing .price-row {
  display: flex;
  justify-content: space-between;
}

.label-reserve { font-style: italic; color: var(--color-text-muted, #888); }

/* Print styles */

@media print {
  @page { size: letter; margin: 0.5in; }

  .navbar, .footer, #print-btn, #alert-container { display: none !important; }

  body { background: white; color: black; font-size: 90%; }

  .main-content { padding: 0; }

  .labels-header { margin-bottom: 1rem; }

  .labels-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .label-card {
    page-break-inside: avoid;
    break-inside: avoid;
    border: 1px solid #999;
    border-radius: 4px;
    padding: 0.75rem;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/auction-labels.html public/css/auction-labels.css
git commit -m "feat: add auction-labels page shell and print-optimized label CSS"
```

---

## Task 9: auction-labels.js + tests 13, 14, 15

**Files:**
- Create: `public/js/auction-labels.js`
- Modify: `tests/integration/routes/artworkQrBiddingTest.spec.js` (add tests 13, 14, 15)

- [ ] **Step 1: Add failing tests 13, 14, 15 to the test file**

Append this `describe` block:

```js
// =================== TASK 9: AuctionLabels ===================

describe('AuctionLabels', () => {
  let AuctionLabels;
  let originalLocation;

  beforeAll(() => {
    originalLocation = globalThis.location;
    AuctionLabels = require('../../../public/js/auction-labels.js');
  });

  afterEach(() => {
    globalThis.location = originalLocation;
  });

  function makeLabelsInstance(overrides = {}) {
    const inst = Object.create(AuctionLabels.prototype);
    inst.auctionId = 'auction-1';
    inst.auction = { title: 'Spring Art Show', schoolName: 'Lincoln Elementary' };
    inst.artworks = [];
    Object.assign(inst, overrides);
    return inst;
  }

  test('13 — renderLabels renders correct card count for a 5-piece auction', () => {
    document.body.innerHTML = `<div id="labels-grid"></div>`;
    const artworks = Array.from({ length: 5 }, (_, i) => ({
      id: `art-${i + 1}`,
      title: `Artwork ${i + 1}`,
      artistName: 'Artist',
      medium: 'Oil',
      dimensions: '10x10',
      description: 'A fine piece',
      startingPrice: 100,
      currentBid: null,
      reservePrice: null,
    }));
    const inst = makeLabelsInstance({ artworks });
    inst.renderLabels();
    expect(document.querySelectorAll('.label-card')).toHaveLength(5);
  });

  test('14 — each label card has correct data-auction-id and data-artwork-id', () => {
    document.body.innerHTML = `<div id="labels-grid"></div>`;
    const artworks = [{
      id: 'art-abc', title: 'Sunset', artistName: 'Alice',
      medium: 'Watercolour', dimensions: '20x30', description: '',
      startingPrice: 75, currentBid: 100, reservePrice: null,
    }];
    const inst = makeLabelsInstance({ artworks });
    inst.renderLabels();
    const card = document.querySelector('.label-card');
    expect(card.dataset.auctionId).toBe('auction-1');
    expect(card.dataset.artworkId).toBe('art-abc');
  });

  test('15 — checkAuth redirects to login when no token present', () => {
    mockLocalStorage.clear();
    const assignSpy = jest.fn();
    delete globalThis.location;
    globalThis.location = {
      assign: assignSpy,
      pathname: '/auction-labels.html',
      search: '?id=auction-1',
      origin: 'http://localhost',
    };

    const inst = makeLabelsInstance();
    inst.checkAuth();

    expect(assignSpy).toHaveBeenCalledWith(
      expect.stringContaining('/login.html?returnTo=')
    );
  });
});
```

- [ ] **Step 2: Run tests 13, 14, 15 to confirm they fail**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: tests 13, 14, 15 fail — `auction-labels.js` does not exist.

- [ ] **Step 3: Create public/js/auction-labels.js**

```js
'use strict';

class AuctionLabels {
  constructor() {
    this.auctionId = new URLSearchParams(globalThis.location.search).get('id');
    this.auction = null;
    this.artworks = [];
    this.init();
  }

  async init() {
    if (!this.auctionId) {
      globalThis.location.assign('/auctions.html');
      return;
    }
    this.checkAuth();
    await this.loadData();
    this.renderLabels();
    this.generateQRCodes();
  }

  checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      const returnTo = encodeURIComponent(globalThis.location.pathname + globalThis.location.search);
      globalThis.location.assign(`/login.html?returnTo=${returnTo}`);
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const allowed = ['TEACHER', 'SCHOOL_ADMIN', 'SITE_ADMIN'];
      if (!allowed.includes(payload.role)) {
        globalThis.location.assign('/auctions.html');
      }
    } catch {
      globalThis.location.assign('/login.html');
    }
  }

  async loadData() {
    const token = localStorage.getItem('auth_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const [auctionRes, artworkRes] = await Promise.all([
        fetch(`/api/auctions/${this.auctionId}`, { headers }),
        fetch(`/api/auctions/${this.auctionId}/artwork`, { headers }),
      ]);

      if (auctionRes.ok) {
        const data = await auctionRes.json();
        this.auction = data.auction;
        const titleEl = document.getElementById('auction-title');
        if (titleEl) { titleEl.textContent = data.auction?.title || 'Auction Labels'; }
        const schoolEl = document.getElementById('school-name');
        if (schoolEl) { schoolEl.textContent = data.auction?.schoolName || ''; }
      }

      if (artworkRes.ok) {
        const data = await artworkRes.json();
        this.artworks = data.artwork || [];
      }
    } catch (err) {
      console.error('AuctionLabels loadData error:', err);
    }
  }

  renderLabels() {
    const grid = document.getElementById('labels-grid');
    if (!grid) { return; }
    const total = this.artworks.length;
    grid.innerHTML = this.artworks.map((piece, i) => this.renderLabel(piece, i + 1, total)).join('');
  }

  renderLabel(piece, index, total) {
    const auctionTitle = this.auction?.title || '';
    const schoolName = this.auction?.schoolName || '';
    const startingPrice = piece.startingPrice != null
      ? UIComponents.formatCurrency(Number(piece.startingPrice)) : '-';
    const currentBidRow = piece.currentBid != null && Number(piece.currentBid) > 0
      ? `<div class="price-row"><span>Current bid:</span><span>${UIComponents.formatCurrency(Number(piece.currentBid))}</span></div>`
      : '';
    const reserveRow = piece.reservePrice != null
      ? `<div class="price-row label-reserve"><span>Reserve:</span><span>${UIComponents.formatCurrency(Number(piece.reservePrice))}</span></div>`
      : '';
    const specsLine = [piece.medium, piece.dimensions].filter(Boolean).map(s => this._esc(s)).join(' · ');

    return `
      <div class="label-card" data-artwork-id="${this._esc(String(piece.id))}" data-auction-id="${this._esc(String(this.auctionId))}">
        <div class="label-meta">${this._esc(schoolName)}${schoolName && auctionTitle ? ' · ' : ''}${this._esc(auctionTitle)} &nbsp;|&nbsp; Piece ${index} of ${total}</div>
        <div class="label-piece-header">
          <div class="label-title-block">
            <p class="label-title">${this._esc(piece.title || 'Untitled')}</p>
            <p class="label-artist">${this._esc(piece.artistName || '')}</p>
          </div>
          <div class="label-qr" data-qr-artwork="${this._esc(String(piece.id))}"></div>
        </div>
        ${specsLine ? `<p class="label-specs">${specsLine}</p>` : ''}
        ${piece.description ? `<p class="label-description">${this._esc(piece.description)}</p>` : ''}
        <div class="label-pricing">
          ${reserveRow}
          <div class="price-row"><span>Starting bid:</span><span>${startingPrice}</span></div>
          ${currentBidRow}
        </div>
      </div>
    `;
  }

  generateQRCodes() {
    const QRCodeLib = globalThis.QRCode;
    if (!QRCodeLib) { return; }
    document.querySelectorAll('[data-qr-artwork]').forEach(el => {
      const artworkId = el.dataset.qrArtwork;
      const url = `${globalThis.location.origin}/auction-detail.html?id=${encodeURIComponent(this.auctionId)}&artwork=${encodeURIComponent(artworkId)}`;
      new QRCodeLib(el, { text: url, width: 100, height: 100 });
    });
  }

  _esc(text) {
    if (!text) { return ''; }
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, c => map[c]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  UIComponents.initializeNavbar();
  globalThis.auctionLabels = new AuctionLabels();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuctionLabels;
}
```

- [ ] **Step 4: Run all 15 tests to confirm they pass**

```bash
npx jest tests/integration/routes/artworkQrBiddingTest.spec.js --no-coverage
```

Expected: all 15 tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: all pre-existing backend tests plus 15 new frontend tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/js/auction-labels.js tests/integration/routes/artworkQrBiddingTest.spec.js
git commit -m "feat: add AuctionLabels — printable per-artwork QR label page for gallery use"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Fix `checkLoginStatus()` respects LIVE + endTime | Task 2 |
| Fix `loadBidHistory()` uses `/artwork/:id/history` (no BIDDER 403) | Task 3 |
| Fix min-bid hint correct per artwork | Task 5 |
| Fix form submit event (not button click) | Task 4 |
| Fix leading-bidder banner after successful bid | Task 4 |
| Fix remove payment method from submitBid | Task 4 |
| Remove `#payment-method` from HTML | Task 1 |
| Add `#leading-bidder-banner` to HTML | Task 1 |
| Fix `#bid-history-container` as `<ul>` | Task 1 |
| `?artwork=` param reads from URL in constructor | Task 6 |
| `_focusArtwork()` selects piece, scrolls form into view | Task 6 |
| `_activateThumbnail()` highlights correct thumbnail | Task 6 |
| `_loadPublicPreview()` and `loadArtwork()` call `_focusArtwork()` | Task 6 |
| Enhanced auth wall (artwork image + CTA) for QR visitors | Task 6 (implementation) + Task 7 (tests) |
| `returnTo` on auth wall links | Task 6 (`_renderEnhancedAuthWall`) |
| `/auction-labels.html` page shell | Task 8 |
| `auction-labels.css` screen + print styles | Task 8 |
| `AuctionLabels` class — fetch, render, QR generation | Task 9 |
| Auth check on label page (TEACHER/SCHOOL_ADMIN/SITE_ADMIN only) | Task 9 (`checkAuth`) |
| All 15 spec-required tests | Tasks 2–7, 9 |

All requirements are covered. No gaps.

### Placeholder scan

No TBD, TODO, or "similar to Task N" references. All code blocks contain complete, runnable code.

### Type/name consistency

- `_focusArtwork()` defined in Task 6, called in `loadArtwork()` and `_loadPublicPreview()` in same task ✓
- `_activateThumbnail(artworkId)` defined and called in Task 6, uses `String(a.id) === String(artworkId)` consistently ✓
- `_renderEnhancedAuthWall(artwork)` defined in Task 6, tested with same signature in Task 7 ✓
- `AuctionLabels.renderLabels()` / `renderLabel()` / `checkAuth()` defined and tested in Task 9 ✓
- `mockLocalStorage` / `makeInstance()` / `makeLabelsInstance()` are defined once in the scaffold (Task 2) and used across all task tests ✓
