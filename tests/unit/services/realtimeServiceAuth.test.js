'use strict';

/**
 * Unit tests for realtimeService authorization features:
 *  - canSubscribe(user, channel) pure authorization check
 *  - broadcastBidUpdate payload must NOT contain a bidder field
 *  - _authenticateFromToken: valid token sets ws.userId + sends authenticated frame
 *  - _authenticateFromToken: revoked token is rejected
 *  - _handleAuthenticate: no longer trusts a payload token (cookie-auth model)
 */

const realtimeServiceModule = require('../../../src/services/realtimeService');
const RealtimeService = realtimeServiceModule.RealtimeService;
const realtimeService = realtimeServiceModule;
const jwt = require('jsonwebtoken');
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';

// ──────────────────────────────────────────────────────────────────────────────
// canSubscribe — pure authorization logic
// ──────────────────────────────────────────────────────────────────────────────
describe('realtimeService.canSubscribe', () => {
  test('external BIDDER with null schoolId cannot subscribe to a school auction channel', () => {
    const bidder = { id: '5', role: 'BIDDER', schoolId: null };
    expect(realtimeService.canSubscribe(bidder, { schoolId: 'school-1' })).toBe(false);
  });

  test('same-school student can subscribe', () => {
    const student = { id: '4', role: 'STUDENT', schoolId: 'school-1' };
    expect(realtimeService.canSubscribe(student, { schoolId: 'school-1' })).toBe(true);
  });

  test('SITE_ADMIN can subscribe to any school channel', () => {
    const admin = { id: '1', role: 'SITE_ADMIN', schoolId: 'school-9' };
    expect(realtimeService.canSubscribe(admin, { schoolId: 'school-1' })).toBe(true);
  });

  test('channel with no schoolId allows any role (price-only update channel)', () => {
    const bidder = { id: '5', role: 'BIDDER', schoolId: null };
    expect(realtimeService.canSubscribe(bidder, { schoolId: null })).toBe(true);
    expect(realtimeService.canSubscribe(bidder, {})).toBe(true);
    expect(realtimeService.canSubscribe(bidder, null)).toBe(true);
  });

  test('user with no role is rejected', () => {
    expect(realtimeService.canSubscribe(null, { schoolId: 'school-1' })).toBe(false);
    expect(realtimeService.canSubscribe({ id: '5' }, { schoolId: 'school-1' })).toBe(false);
  });

  test('different-school student cannot subscribe to another school channel', () => {
    const student = { id: '4', role: 'STUDENT', schoolId: 'school-2' };
    expect(realtimeService.canSubscribe(student, { schoolId: 'school-1' })).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// broadcastBidUpdate payload — must NOT expose raw bidder userId
// ──────────────────────────────────────────────────────────────────────────────
describe('realtimeService.broadcastBidUpdate payload shape', () => {
  test('emitted event does not contain a bidder field', () => {
    const service = realtimeService;

    // Inject a fake connected client subscribed to 'artwork-99'
    const fakeUserId = 'user-test-payload';
    const sent = [];
    const fakeWs = {
      readyState: 1, // WebSocket.OPEN = 1
      send: (msg) => sent.push(JSON.parse(msg))
    };

    // Directly wire into internal maps (singleton state)
    service.clients.set(fakeUserId, new Set([fakeWs]));
    service.subscriptions.set(fakeUserId, new Set(['artwork-99']));

    service.broadcastBidUpdate('artwork-99', {
      bidId: 'bid-1',
      artworkId: 'artwork-99',
      amount: 150,
      totalBids: 3
      // Note: bidder field intentionally absent here (biddingRoutes no longer sends it)
    });

    // Clean up injected state
    service.clients.delete(fakeUserId);
    service.subscriptions.delete(fakeUserId);
    service.eventHistory.delete('artwork-99');

    expect(sent.length).toBeGreaterThan(0);
    const event = sent[0];
    expect(event.type).toBe('bid_update');
    expect(event.data).not.toHaveProperty('bidder');
    expect(event.data).toHaveProperty('bidId');
    expect(event.data).toHaveProperty('amount');
    expect(event.data).toHaveProperty('totalBids');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Helper: minimal fake WS (matches brief's mkWs pattern)
// ──────────────────────────────────────────────────────────────────────────────
function mkWs() {
  return { sent: [], send(m) { this.sent.push(JSON.parse(m)); }, on() {} };
}

// ──────────────────────────────────────────────────────────────────────────────
// WebSocket cookie auth — _authenticateFromToken
// ──────────────────────────────────────────────────────────────────────────────
describe('WebSocket cookie auth', () => {
  afterEach(() => jest.restoreAllMocks());

  test('_authenticateFromToken sets ws.userId for a valid token', async () => {
    const svc = new RealtimeService();
    const ws = mkWs();
    const token = jwt.sign({ sub: 'u1', role: 'STUDENT' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
    await svc._authenticateFromToken(ws, token);
    expect(ws.userId).toBe('u1');
    expect(ws.sent.some(m => m.type === 'authenticated')).toBe(true);
  });

  test('authenticate message no longer trusts a payload token', async () => {
    const svc = new RealtimeService();
    const ws = mkWs();
    const token = jwt.sign({ sub: 'u2', role: 'STUDENT' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
    await svc._handleAuthenticate(ws, { type: 'authenticate', payload: { token } });
    expect(ws.userId).toBeUndefined(); // payload token ignored
  });

  test('revoked token is rejected by _authenticateFromToken', async () => {
    const svc = new RealtimeService();
    const ws = mkWs();
    const secret = process.env.JWT_ACCESS_SECRET;
    const jti = 'test-jti-revoked-cookie';
    const token = jwt.sign(
      { sub: 'user-revoked', jti, role: 'BIDDER' },
      secret,
      { algorithm: 'HS256', expiresIn: '15m' }
    );

    const authService = require('../../../src/services/authenticationService');
    jest.spyOn(authService.tokenBlacklist, 'isRevoked').mockResolvedValue(true);

    await svc._authenticateFromToken(ws, token);

    expect(ws.userId).toBeUndefined();
    expect(ws.sent.some(m => m.type === 'error')).toBe(true);
    const errorFrame = ws.sent.find(m => m.type === 'error');
    expect(errorFrame.message).toMatch(/revoked/i);
  });

  test('expired token is rejected by _authenticateFromToken', async () => {
    const svc = new RealtimeService();
    const ws = mkWs();
    const secret = process.env.JWT_ACCESS_SECRET;
    // Sign with 0 second expiry so it is already expired
    const token = jwt.sign(
      { sub: 'user-expired', role: 'BIDDER' },
      secret,
      { algorithm: 'HS256', expiresIn: 0 }
    );

    await svc._authenticateFromToken(ws, token);

    expect(ws.userId).toBeUndefined();
    expect(ws.sent.some(m => m.type === 'error')).toBe(true);
  });
});
