'use strict';

/**
 * Unit tests for realtimeService authorization features added in Task 8:
 *  - canSubscribe(user, channel) pure authorization check
 *  - broadcastBidUpdate payload must NOT contain a bidder field
 *  - revoked token is rejected at authenticate
 */

const realtimeService = require('../../../src/services/realtimeService');

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
// Blacklist check at authenticate — revoked token is rejected
// ──────────────────────────────────────────────────────────────────────────────
describe('realtimeService._handleAuthenticate blacklist check', () => {
  afterEach(() => jest.restoreAllMocks());

  test('revoked token (isRevoked returns true) is rejected without authenticating', async () => {
    const jwt = require('jsonwebtoken');
    // Use the secret already set by tests/setup.env.js — no hardcoded credential
    const secret = process.env.JWT_ACCESS_SECRET;

    // Generate a valid token
    const jti = 'test-jti-revoked';
    const token = jwt.sign(
      { sub: 'user-revoked', jti, role: 'BIDDER', email: 'x@x.com' },
      secret,
      { algorithm: 'HS256', expiresIn: '15m' }
    );

    // Spy on the blacklist so isRevoked returns true for this jti
    const authService = require('../../../src/services/authenticationService');
    jest.spyOn(authService.tokenBlacklist, 'isRevoked').mockResolvedValue(true);

    const sent = [];
    const fakeWs = {
      userId: undefined,
      send: (msg) => sent.push(JSON.parse(msg))
    };

    // Call the private method via the singleton
    await realtimeService._handleAuthenticate(fakeWs, { token });

    expect(fakeWs.userId).toBeUndefined();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].type).toBe('error');
    expect(sent[0].message).toMatch(/revoked/i);
  });

  test('non-revoked token (isRevoked returns false) authenticates successfully', async () => {
    const jwt = require('jsonwebtoken');
    // Use the secret already set by tests/setup.env.js — no hardcoded credential
    const secret = process.env.JWT_ACCESS_SECRET;

    const jti = 'test-jti-valid';
    const token = jwt.sign(
      { sub: 'user-valid', jti, role: 'BIDDER', email: 'y@y.com' },
      secret,
      { algorithm: 'HS256', expiresIn: '15m' }
    );

    const authService = require('../../../src/services/authenticationService');
    jest.spyOn(authService.tokenBlacklist, 'isRevoked').mockResolvedValue(false);

    const sent = [];
    const fakeWs = {
      userId: undefined,
      send: (msg) => sent.push(JSON.parse(msg))
    };

    await realtimeService._handleAuthenticate(fakeWs, { token });

    // Clean up singleton state
    realtimeService.clients.delete('user-valid');
    realtimeService.subscriptions.delete('user-valid');

    expect(fakeWs.userId).toBe('user-valid');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].type).toBe('authenticated');
  });
});
