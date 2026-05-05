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
