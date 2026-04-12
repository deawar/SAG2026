/**
 * COPPA Compliance Tests
 * Covers the full parental-consent flow end-to-end using the mock app.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const request    = require('supertest');
const crypto     = require('crypto');
const createTestApp = require('../helpers/createTestApp');
const mockDb     = require('../helpers/mockDb');

// ─── helpers ────────────────────────────────────────────────────────────────

function dobUnder13() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function dobAdult() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 20);
  return d.toISOString().slice(0, 10);
}

function makeConsentToken() {
  const raw  = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

// ─── Registration tests ──────────────────────────────────────────────────────

describe('COPPA — Registration', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('Under-13 student registration without parentEmail → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // email check
      .mockResolvedValueOnce({ rows: [{ id: 'uid-1', email: 'child@test.com', first_name: 'Kid', last_name: null, phone_number: null, role: 'STUDENT', school_id: null, created_at: new Date(), account_status: 'PENDING', requires_parental_consent: true, parental_consent_status: 'pending' }], rowCount: 1 }); // insert

    const res = await request(app).post('/api/auth/register').send({
      email: 'child@test.com',
      password: 'SecurePass123!',
      firstName: 'Kid',
      dateOfBirth: dobUnder13(),
      accountType: 'student'
      // parentEmail intentionally omitted
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('parentEmail');
  });

  test('Under-13 student registration with valid parentEmail → 201 + requiresParentalConsent', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // email uniqueness check
      .mockResolvedValueOnce({                             // INSERT user
        rows: [{
          id: 'uid-under13',
          email: 'child@test.com',
          first_name: 'Kid',
          last_name: null,
          phone_number: null,
          role: 'STUDENT',
          school_id: null,
          created_at: new Date(),
          account_status: 'PENDING',
          requires_parental_consent: true,
          parental_consent_status: 'pending'
        }],
        rowCount: 1
      });

    const res = await request(app).post('/api/auth/register').send({
      email: 'child@test.com',
      password: 'SecurePass123!',
      firstName: 'Kid',
      dateOfBirth: dobUnder13(),
      parentEmail: 'parent@test.com',
      accountType: 'student'
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.requiresParentalConsent).toBe(true);
    // No JWT should be issued
    expect(res.body.accessToken).toBeUndefined();
  });

  test('Adult student registration does not trigger COPPA flow → 201 requiresVerification', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // email check
      .mockResolvedValueOnce({                             // INSERT user
        rows: [{
          id: 'uid-adult',
          email: 'adult@test.com',
          first_name: 'Adult',
          last_name: 'User',
          phone_number: null,
          role: 'STUDENT',
          school_id: null,
          created_at: new Date(),
          account_status: 'PENDING',
          requires_parental_consent: false,
          parental_consent_status: 'not_required'
        }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });   // setVerificationToken UPDATE

    const res = await request(app).post('/api/auth/register').send({
      email: 'adult@test.com',
      password: 'SecurePass123!',
      firstName: 'Adult',
      lastName: 'User',
      dateOfBirth: dobAdult(),
      accountType: 'student'
    });

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.requiresParentalConsent).toBeUndefined();
  });

  test('Under-13 registration missing dateOfBirth → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'nodob@test.com',
      password: 'SecurePass123!',
      firstName: 'NoDate',
      lastName: 'User',
      accountType: 'student'
      // dateOfBirth omitted
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('dateOfBirth');
  });

  test('Under-13 account does NOT store last name or phone', async () => {
    let capturedParams;
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // email check
      .mockImplementationOnce((sql, params) => {           // INSERT — capture params
        capturedParams = params;
        return Promise.resolve({
          rows: [{
            id: 'uid-min',
            email: 'min@test.com',
            first_name: 'Min',
            last_name: null,
            phone_number: null,
            role: 'STUDENT',
            school_id: null,
            created_at: new Date(),
            account_status: 'PENDING',
            requires_parental_consent: true,
            parental_consent_status: 'pending'
          }],
          rowCount: 1
        });
      });

    await request(app).post('/api/auth/register').send({
      email: 'min@test.com',
      password: 'SecurePass123!',
      firstName: 'Min',
      lastName: 'ShouldBeDropped',
      phone: '555-1234',
      dateOfBirth: dobUnder13(),
      parentEmail: 'parent@test.com',
      accountType: 'student'
    });

    // params[4] = last_name, params[5] = phone_number
    expect(capturedParams[4]).toBeNull();
    expect(capturedParams[5]).toBeNull();
  });
});

// ─── Login guard tests ───────────────────────────────────────────────────────

describe('COPPA — Login Guard', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('Under-13 account with pending consent cannot log in → 403', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 'uid-under13',
        email: 'child@test.com',
        password_hash: '$2b$12$notreal',
        first_name: 'Kid',
        last_name: null,
        role: 'STUDENT',
        account_status: 'PENDING',
        two_fa_enabled: false,
        email_verified_at: null,
        requires_parental_consent: true,
        parental_consent_status: 'pending'
      }],
      rowCount: 1
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'child@test.com',
      password: 'SecurePass123!'
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('parental_consent_required');
  });

  test('Under-13 account with denied consent cannot log in → 403', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 'uid-denied',
        email: 'denied@test.com',
        password_hash: '$2b$12$notreal',
        first_name: 'Kid',
        last_name: null,
        role: 'STUDENT',
        account_status: 'PENDING',
        two_fa_enabled: false,
        email_verified_at: null,
        requires_parental_consent: true,
        parental_consent_status: 'denied'
      }],
      rowCount: 1
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'denied@test.com',
      password: 'SecurePass123!'
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('parental_consent_required');
  });
});

// ─── Parental consent endpoint tests ─────────────────────────────────────────

describe('COPPA — POST /api/auth/parental-consent', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('Grant consent → 200, account becomes active', async () => {
    const { raw, hash } = makeConsentToken();
    const uid = crypto.randomUUID();

    mockDb.query
      .mockResolvedValueOnce({   // SELECT user
        rows: [{
          id: uid,
          requires_parental_consent: true,
          parental_consent_status: 'pending',
          parent_consent_token: hash,
          parent_consent_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    const res = await request(app).post('/api/auth/parental-consent').send({
      uid,
      token: raw,
      granted: true
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the UPDATE was called
    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql.includes("parental_consent_status   = 'granted'")
    );
    expect(updateCall).toBeDefined();
  });

  test('Deny consent → 200, account soft-deleted', async () => {
    const { raw, hash } = makeConsentToken();
    const uid = crypto.randomUUID();

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: uid,
          requires_parental_consent: true,
          parental_consent_status: 'pending',
          parent_consent_token: hash,
          parent_consent_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app).post('/api/auth/parental-consent').send({
      uid,
      token: raw,
      granted: false
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql.includes("parental_consent_status = 'denied'")
    );
    expect(updateCall).toBeDefined();
  });

  test('Wrong token → 400', async () => {
    const { hash } = makeConsentToken();
    const uid = crypto.randomUUID();

    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: uid,
        requires_parental_consent: true,
        parental_consent_status: 'pending',
        parent_consent_token: hash,
        parent_consent_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }],
      rowCount: 1
    });

    const res = await request(app).post('/api/auth/parental-consent').send({
      uid,
      token: 'wrong-token',
      granted: true
    });

    expect(res.status).toBe(400);
  });

  test('Expired token → 400', async () => {
    const { raw, hash } = makeConsentToken();
    const uid = crypto.randomUUID();

    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: uid,
        requires_parental_consent: true,
        parental_consent_status: 'pending',
        parent_consent_token: hash,
        parent_consent_expires_at: new Date(Date.now() - 1000) // already expired
      }],
      rowCount: 1
    });

    const res = await request(app).post('/api/auth/parental-consent').send({
      uid,
      token: raw,
      granted: true
    });

    expect(res.status).toBe(400);
  });

  test('Missing fields → 400', async () => {
    const res = await request(app).post('/api/auth/parental-consent').send({ uid: 'x' });
    expect(res.status).toBe(400);
  });

  test('Unknown uid → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post('/api/auth/parental-consent').send({
      uid: crypto.randomUUID(),
      token: 'anytoken',
      granted: true
    });

    expect(res.status).toBe(400);
  });
});

// ─── Age calculation tests ────────────────────────────────────────────────────

describe('COPPA — age computation', () => {
  const { UserModel } = require('../../src/models');

  class MockDb {
    async query() { return { rows: [], rowCount: 0 }; }
  }

  const model = new UserModel(new MockDb());

  test('Child born 10 years ago is under 13', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    expect(model._calculateAge(d)).toBeLessThan(13);
  });

  test('Child born exactly 13 years ago is NOT under 13', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 13);
    d.setDate(d.getDate() - 1); // one day past birthday
    expect(model._calculateAge(d)).toBeGreaterThanOrEqual(13);
  });

  test('Adult born 20 years ago is not under 13', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 20);
    expect(model._calculateAge(d)).toBeGreaterThanOrEqual(13);
  });
});
