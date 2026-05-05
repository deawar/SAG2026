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
