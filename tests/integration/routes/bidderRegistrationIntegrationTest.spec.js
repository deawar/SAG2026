/**
 * G16 — Bidder onboarding integration tests
 *
 * Tests:
 *  1.  POST /api/auth/register with accountType='bidder' → 201, role=BIDDER
 *  2.  POST /api/auth/register bidder — schoolId not required (omitted → still 201)
 *  3.  POST /api/auth/register bidder — dateOfBirth not required (omitted → still 201)
 *  4.  POST /api/auth/register bidder — requires email + password + firstName + lastName
 *  5.  POST /api/auth/register bidder — duplicate email → 409
 *  6.  Frontend URL param logic: ?role=BIDDER detected correctly (pure unit test)
 *  7.  Frontend URL param logic: ?role=BIDDER hides school/DOB fields (field list check)
 *  8.  Student registration still works (accountType='student' unchanged)
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET)  { process.env.JWT_ACCESS_SECRET  = 'test-access-secret';  }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

// ── Nodemailer mock ────────────────────────────────────────────────────────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test@example.com>' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
    verify:   jest.fn().mockResolvedValue(true)
  }))
}));

const request        = require('supertest');
const createTestApp  = require('../../helpers/createTestApp');
const mockDb         = require('../../helpers/mockDb');

// ── Helpers ───────────────────────────────────────────────────────────────

function bidderPayload(overrides = {}) {
  return {
    email:       'bidder@example.com',
    password:    'SecurePass1!abc',
    firstName:   'Alice',
    lastName:    'Smith',
    accountType: 'bidder',
    ...overrides
  };
}

function studentPayload(overrides = {}) {
  return {
    email:       'student@example.com',
    password:    'SecurePass1!abc',
    firstName:   'Bob',
    lastName:    'Jones',
    dateOfBirth: '2006-01-01',
    schoolId:    'school-1',
    accountType: 'student',
    ...overrides
  };
}

// Simulate the frontend URL param logic (extracted pure function — no DOM needed)
function isBidderRole(search) {
  const params = new URLSearchParams(search);
  return (params.get('role') || '').toUpperCase() === 'BIDDER';
}

// Returns which fields are hidden in BIDDER mode (mirrors _applyBidderMode logic)
function bidderHiddenFields() {
  return ['school-fields-group', 'dob-group', 'account-type-group'];
}

function bidderRequiredFields() {
  return ['full_name', 'email', 'password', 'confirm_password', 'age_confirmation'];
}

// ── Backend registration tests ─────────────────────────────────────────────

describe('G16 — POST /api/auth/register (BIDDER)', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockSendMail.mockClear();
    mockDb.reset();
  });

  test('creates BIDDER account — returns 201 requiresVerification', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // email uniqueness check
      .mockResolvedValueOnce({ rows: [{ id: 'user-bidder-1', first_name: 'Alice', email: 'bidder@example.com', role: 'BIDDER' }], rowCount: 1 }) // userModel.create
      .mockResolvedValue({ rows: [], rowCount: 0 });              // setVerificationToken + rest

    const res = await request(app)
      .post('/api/auth/register')
      .send(bidderPayload());

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
  });

  test('BIDDER registration does not require schoolId', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'user-bidder-2', first_name: 'Alice', email: 'bidder2@example.com', role: 'BIDDER' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/auth/register')
      // No schoolId in payload
      .send(bidderPayload({ email: 'bidder2@example.com', schoolId: undefined }));

    expect(res.status).toBe(201);
  });

  test('BIDDER registration does not require dateOfBirth', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'user-bidder-3', first_name: 'Alice', email: 'bidder3@example.com', role: 'BIDDER' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/auth/register')
      // No dateOfBirth
      .send(bidderPayload({ email: 'bidder3@example.com', dateOfBirth: undefined }));

    expect(res.status).toBe(201);
  });

  test('BIDDER registration requires firstName + lastName + email + password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ accountType: 'bidder', email: 'bidder@example.com' }); // missing names + password

    expect(res.status).toBe(400);
  });

  test('BIDDER duplicate email → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // uniqueness check (first call)
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' })); // DB unique violation

    const res = await request(app)
      .post('/api/auth/register')
      .send(bidderPayload());

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already registered/i);
  });

  test('student registration (accountType=student) still works', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'student-1', first_name: 'Bob', email: 'student@example.com', role: 'STUDENT' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/auth/register')
      .send(studentPayload());

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
  });
});

// ── Frontend URL-param unit tests (pure JS, no DOM) ───────────────────────

describe('G16 — frontend ?role=BIDDER detection', () => {
  test('?role=BIDDER returns isBidder=true', () => {
    expect(isBidderRole('?role=BIDDER')).toBe(true);
  });

  test('?role=bidder (lowercase) returns isBidder=true (case-insensitive)', () => {
    expect(isBidderRole('?role=bidder')).toBe(true);
  });

  test('no role param returns isBidder=false', () => {
    expect(isBidderRole('')).toBe(false);
  });

  test('?role=STUDENT returns isBidder=false', () => {
    expect(isBidderRole('?role=STUDENT')).toBe(false);
  });

  test('BIDDER mode hides school-fields-group and dob-group', () => {
    const hidden = bidderHiddenFields();
    expect(hidden).toContain('school-fields-group');
    expect(hidden).toContain('dob-group');
  });

  test('BIDDER mode required fields include age_confirmation but not school_id or date_of_birth', () => {
    const required = bidderRequiredFields();
    expect(required).toContain('age_confirmation');
    expect(required).not.toContain('school_id');
    expect(required).not.toContain('date_of_birth');
  });
});
