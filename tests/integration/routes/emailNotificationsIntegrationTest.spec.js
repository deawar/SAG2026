/**
 * G13 — Email notification integration tests
 *
 * Tests:
 *  1.  notifyOutbid sends outbid-alert email with correct fields
 *  2.  notifyOutbid skips send when email_outbid pref is false
 *  3.  notifyOutbid fails-open when DB is unavailable (pref check throws)
 *  4.  notifyAuctionWon sends winner-notification email with correct fields
 *  5.  notifyAuctionWon skips send when email_winner pref is false
 *  6.  notifyArtworkStatusChanged sends approved email when status=APPROVED
 *  7.  notifyArtworkStatusChanged sends rejected email when status=REJECTED
 *  8.  notifyArtworkStatusChanged skips send when email_artwork_status pref is false
 *  9.  createEmailProvider returns a provider using json transport in non-production
 * 10.  createEmailProvider throws if SMTP_HOST missing in production
 * 11.  PUT /api/teacher/submissions/:id/approve returns 200 and does not block on email
 * 12.  PUT /api/teacher/submissions/:id/reject  returns 200 and does not block on email
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// ── Nodemailer mock — captures all sendMail calls ───────────────────────────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test@example.com>' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
    verify: jest.fn().mockResolvedValue(true)
  }))
}));

// ── models/index mock — pool used by teacher route, tokenBlacklist, etc. ────
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return {
    ...actual,
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  };
});

const { pool: mockPool } = require('../../../src/models/index');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

const {
  notifyOutbid,
  notifyAuctionWon,
  notifyArtworkStatusChanged,
  createEmailProvider,
  EmailProvider
} = require('../../../src/services/notificationService');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmailProvider() {
  // Use JSON transport so no real SMTP needed; sendMail is captured by the mock
  return new EmailProvider({ provider: 'json' });
}

function makeToken(payload = {}) {
  return jwt.sign(
    { sub: 'teacher-1', role: 'TEACHER', twoFaEnabled: false, ...payload },
    ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

// ── Unit tests: standalone notification functions ────────────────────────────

describe('G13 — Email notification functions', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('notifyOutbid', () => {
    test('sends outbid-alert email with correct recipient and subject', async () => {
      const emailProvider = makeEmailProvider();
      const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }; // no pref row → enabled

      await notifyOutbid(emailProvider, db, {
        userId: 'user-99',
        email: 'outbid@example.com',
        firstName: 'Alice',
        artworkTitle: 'Sunset Over Mountains',
        newBidDollars: 45.00,
        auctionEndsAt: new Date('2026-04-20T18:00:00Z')
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('outbid@example.com');
      expect(call.subject).toMatch(/outbid/i);
      expect(call.text).toMatch(/45\.00/);
    });

    test('skips send when email_outbid preference is false', async () => {
      const emailProvider = makeEmailProvider();
      const db = {
        query: jest.fn().mockResolvedValue({
          rows: [{ email_outbid: false, email_winner: true, email_artwork_status: true }],
          rowCount: 1
        })
      };

      await notifyOutbid(emailProvider, db, {
        userId: 'user-99',
        email: 'quiet@example.com',
        firstName: 'Bob',
        artworkTitle: 'Test Art',
        newBidDollars: 10.00,
        auctionEndsAt: null
      });

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    test('fails open (still sends) when DB throws during pref check', async () => {
      const emailProvider = makeEmailProvider();
      const db = { query: jest.fn().mockRejectedValue(new Error('DB down')) };

      await notifyOutbid(emailProvider, db, {
        userId: 'user-99',
        email: 'failopen@example.com',
        firstName: 'Carol',
        artworkTitle: 'Art Piece',
        newBidDollars: 20.00,
        auctionEndsAt: null
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('notifyAuctionWon', () => {
    test('sends winner-notification email with correct winning bid', async () => {
      const emailProvider = makeEmailProvider();
      const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };

      await notifyAuctionWon(emailProvider, db, {
        userId: 'winner-1',
        email: 'winner@example.com',
        firstName: 'Dave',
        artworkTitle: 'Coastal Dawn',
        winningBidDollars: 125.50
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('winner@example.com');
      expect(call.subject).toMatch(/won|congratul/i);
      expect(call.text).toMatch(/125\.50/);
    });

    test('skips send when email_winner preference is false', async () => {
      const emailProvider = makeEmailProvider();
      const db = {
        query: jest.fn().mockResolvedValue({
          rows: [{ email_outbid: true, email_winner: false }],
          rowCount: 1
        })
      };

      await notifyAuctionWon(emailProvider, db, {
        userId: 'winner-2',
        email: 'no-winner@example.com',
        firstName: 'Eve',
        artworkTitle: 'Silent Piece',
        winningBidDollars: 50.00
      });

      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('notifyArtworkStatusChanged', () => {
    test('sends approved email when status=APPROVED', async () => {
      const emailProvider = makeEmailProvider();
      const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };

      await notifyArtworkStatusChanged(emailProvider, db, {
        userId: 'student-1',
        email: 'student@example.com',
        firstName: 'Fiona',
        artworkTitle: 'Abstract Blues',
        newStatus: 'APPROVED',
        reason: null
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('student@example.com');
      expect(call.subject).toMatch(/approved/i);
      expect(call.text).toMatch(/approved/i);
    });

    test('sends rejected email with reason when status=REJECTED', async () => {
      const emailProvider = makeEmailProvider();
      const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };

      await notifyArtworkStatusChanged(emailProvider, db, {
        userId: 'student-2',
        email: 'student2@example.com',
        firstName: 'George',
        artworkTitle: 'Red Lines',
        newStatus: 'REJECTED',
        reason: 'Does not meet content guidelines'
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      // Subject should NOT say "✅ ... approved" — it should say "was not approved"
      expect(call.subject).not.toContain('✅');
      expect(call.html).toMatch(/not approved/i);
      expect(call.html).toMatch(/content guidelines/i);
    });

    test('skips send when email_artwork_status preference is false', async () => {
      const emailProvider = makeEmailProvider();
      const db = {
        query: jest.fn().mockResolvedValue({
          rows: [{ email_outbid: true, email_winner: true, email_artwork_status: false }],
          rowCount: 1
        })
      };

      await notifyArtworkStatusChanged(emailProvider, db, {
        userId: 'student-3',
        email: 'quiet-student@example.com',
        firstName: 'Hannah',
        artworkTitle: 'Mountain Path',
        newStatus: 'APPROVED',
        reason: null
      });

      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('createEmailProvider', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('returns a provider using json transport when not in production', () => {
      process.env.NODE_ENV = 'test';
      const provider = createEmailProvider();
      expect(provider).toBeInstanceOf(EmailProvider);
      // In json mode, transporter is created via nodemailer.createTransport
      const nodemailer = require('nodemailer');
      expect(nodemailer.createTransport).toHaveBeenCalledWith({ jsonTransport: true });
    });

    test('throws if SMTP_HOST is missing in production', () => {
      process.env.NODE_ENV = 'production';
      const prevHost = process.env.SMTP_HOST;
      delete process.env.SMTP_HOST;

      expect(() => createEmailProvider()).toThrow(/SMTP_HOST/i);

      if (prevHost !== undefined) process.env.SMTP_HOST = prevHost;
      process.env.NODE_ENV = 'test';
    });
  });
});

// ── Route integration tests: teacher approve/reject ─────────────────────────

describe('G13 — Teacher route does not block on email', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockSendMail.mockClear();
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('PUT /api/teacher/submissions/:id/approve returns 200 immediately', async () => {
    const token = makeToken({ role: 'TEACHER' });
    const artworkId = 'artwork-uuid-1';

    // teacherController uses pool from models/index (mockPool) for ALL queries:
    //   1. tokenBlacklist.isRevoked (verifyToken middleware)
    //   2. _resolveSchoolId → SELECT school_id FROM users
    //   3. UPDATE artwork → rowCount: 1
    //   4. notification: SELECT artwork + creator (setImmediate, best-effort)
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                   // isRevoked
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }] })       // _resolveSchoolId
      .mockResolvedValueOnce({ rows: [{ id: artworkId }], rowCount: 1 })  // UPDATE artwork
      .mockResolvedValue({ rows: [], rowCount: 0 });                       // notification

    const res = await request(app)
      .put(`/api/teacher/submissions/${artworkId}/approve`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('PUT /api/teacher/submissions/:id/reject returns 200 immediately', async () => {
    const token = makeToken({ role: 'TEACHER' });
    const artworkId = 'artwork-uuid-2';

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: artworkId }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .put(`/api/teacher/submissions/${artworkId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Does not meet guidelines' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
