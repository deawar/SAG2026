/**
 * User Model Unit Tests
 * Tests _validateUserData() and create() directly against real validation logic.
 * Uses MockDatabase — no real DB connection required.
 */

const { UserModel } = require('../../../src/models');

// ---------------------------------------------------------------------------
// MockDatabase — sequences responses per query call
// ---------------------------------------------------------------------------
class MockDatabase {
  constructor(responses = []) {
    this._responses = responses;
    this._callIndex = 0;
  }

  async query() {
    const response = this._responses[this._callIndex] || { rows: [], rowCount: 0 };
    this._callIndex++;
    return response;
  }

  async transaction(cb) { return cb(this); }
}

// ---------------------------------------------------------------------------
// Shared valid base user — spread and override per test
// ---------------------------------------------------------------------------
const BASE_USER = {
  email: 'valid@example.com',
  password: 'SecurePass123!',
  firstName: 'John',
  lastName: 'Doe',
  role: 'STUDENT',
};

// ---------------------------------------------------------------------------
// validate required fields
// ---------------------------------------------------------------------------
describe('User Model', () => {
  let userModel;

  beforeEach(() => {
    userModel = new UserModel(new MockDatabase());
  });

  describe('validate required fields', () => {
    test('should not throw for valid complete user data', () => {
      expect(() => userModel._validateUserData(BASE_USER)).not.toThrow();
    });

    test('should throw INVALID_EMAIL when email is missing', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, email: '' }))
        .toThrow('INVALID_EMAIL');
    });

    test('should throw INVALID_EMAIL when email is null', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, email: null }))
        .toThrow('INVALID_EMAIL');
    });

    test('should throw PASSWORD_TOO_SHORT when password is empty', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: '' }))
        .toThrow('PASSWORD_TOO_SHORT');
    });

    test('should throw INVALID_FIRST_NAME when firstName is empty', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, firstName: '' }))
        .toThrow('INVALID_FIRST_NAME');
    });

    test('should throw INVALID_FIRST_NAME when firstName is only 1 character', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, firstName: 'J' }))
        .toThrow('INVALID_FIRST_NAME');
    });

    test('should throw INVALID_LAST_NAME when lastName is empty', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, lastName: '' }))
        .toThrow('INVALID_LAST_NAME');
    });

    test('should throw INVALID_LAST_NAME when lastName is only 1 character', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, lastName: 'D' }))
        .toThrow('INVALID_LAST_NAME');
    });

    test('should throw INVALID_ROLE when role is missing', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, role: '' }))
        .toThrow('INVALID_ROLE');
    });

    test('should throw INVALID_ROLE for unknown role', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, role: 'HACKER' }))
        .toThrow('INVALID_ROLE');
    });

    test('should accept all valid roles', () => {
      const validRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'BIDDER'];
      validRoles.forEach(role => {
        expect(() => userModel._validateUserData({ ...BASE_USER, role })).not.toThrow();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // reject invalid email format
  // ---------------------------------------------------------------------------
  describe('reject invalid email format', () => {
    test.each([
      ['plain string with no @', 'notanemail'],
      ['domain only, no TLD', 'missing@domain'],
      ['no local part', '@nodomain.com'],
      ['empty string', ''],
    ])('should throw INVALID_EMAIL for %s', (_desc, badEmail) => {
      expect(() => userModel._validateUserData({ ...BASE_USER, email: badEmail }))
        .toThrow('INVALID_EMAIL');
    });

    test('should accept user@example.com', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, email: 'user@example.com' }))
        .not.toThrow();
    });

    test('should accept email with plus-tag', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, email: 'user+tag@school.edu' }))
        .not.toThrow();
    });

    test('should accept email with subdomain', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, email: 'first.last@mail.domain.org' }))
        .not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // enforce unique email constraint
  // ---------------------------------------------------------------------------
  describe('enforce unique email constraint', () => {
    test('should throw EMAIL_ALREADY_EXISTS when email is already registered', async () => {
      const dbWithExistingUser = new MockDatabase([
        { rows: [{ id: 'existing-id' }], rowCount: 1 }, // email check returns a match
      ]);
      const model = new UserModel(dbWithExistingUser);

      await expect(model.create({ ...BASE_USER, email: 'taken@example.com' }))
        .rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });

    test('should succeed when email is not yet registered', async () => {
      const newUser = { id: 'new-uuid', email: 'new@example.com', first_name: 'John', last_name: 'Doe', role: 'STUDENT' };
      const dbFresh = new MockDatabase([
        { rows: [], rowCount: 0 },       // email uniqueness check — no existing user
        { rows: [newUser], rowCount: 1 }, // INSERT ... RETURNING
      ]);
      const model = new UserModel(dbFresh);

      const result = await model.create({ ...BASE_USER, email: 'new@example.com' });
      expect(result.email).toBe('new@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // password validation
  // ---------------------------------------------------------------------------
  describe('password validation', () => {
    test('should throw PASSWORD_TOO_SHORT for password under 12 characters', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'Short1!' }))
        .toThrow('PASSWORD_TOO_SHORT');
    });

    test('should throw PASSWORD_MISSING_UPPERCASE for all-lowercase password', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'securepass123!' }))
        .toThrow('PASSWORD_MISSING_UPPERCASE');
    });

    test('should throw PASSWORD_MISSING_LOWERCASE for all-uppercase password', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'SECUREPASS123!' }))
        .toThrow('PASSWORD_MISSING_LOWERCASE');
    });

    test('should throw PASSWORD_MISSING_NUMBER for password with no digits', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'SecurePassword!' }))
        .toThrow('PASSWORD_MISSING_NUMBER');
    });

    test('should throw PASSWORD_MISSING_SPECIAL_CHAR for password with no special character', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'SecurePass1234' }))
        .toThrow('PASSWORD_MISSING_SPECIAL_CHAR');
    });

    // NOTE: The source common-passwords list ('Password1!', 'Qwerty123!', 'Admin1234!') are
    // all <12 chars, so they hit PASSWORD_TOO_SHORT before the common-password guard.
    // These tests verify the actual thrown error; the PASSWORD_TOO_COMMON branch requires
    // a common password that is also ≥12 characters (currently no such entry exists in source).
    test('should throw PASSWORD_TOO_SHORT for "Password1!" (too short at 10 chars)', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'Password1!' }))
        .toThrow('PASSWORD_TOO_SHORT');
    });

    test('should throw PASSWORD_TOO_SHORT for "Qwerty123!" (too short at 10 chars)', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'Qwerty123!' }))
        .toThrow('PASSWORD_TOO_SHORT');
    });

    test('should accept a strong, unique password', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, password: 'Tr0ub4dor&3xtra!' }))
        .not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // COPPA age verification
  // ---------------------------------------------------------------------------
  describe('COPPA age verification', () => {
    const today = new Date();

    test('should throw COPPA_PARENTAL_CONSENT_REQUIRED for STUDENT under 13', () => {
      const under13 = new Date(today.getFullYear() - 12, today.getMonth(), today.getDate());
      expect(() => userModel._validateUserData({ ...BASE_USER, role: 'STUDENT', dateOfBirth: under13 }))
        .toThrow('COPPA_PARENTAL_CONSENT_REQUIRED');
    });

    test('should throw COPPA_PARENTAL_CONSENT_REQUIRED for BIDDER under 13', () => {
      const under13 = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
      expect(() => userModel._validateUserData({ ...BASE_USER, role: 'BIDDER', dateOfBirth: under13 }))
        .toThrow('COPPA_PARENTAL_CONSENT_REQUIRED');
    });

    test('should allow STUDENT who is exactly 13', () => {
      const exactly13 = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate() - 1);
      expect(() => userModel._validateUserData({ ...BASE_USER, role: 'STUDENT', dateOfBirth: exactly13 }))
        .not.toThrow();
    });

    test('should allow STUDENT who is 16', () => {
      const age16 = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate());
      expect(() => userModel._validateUserData({ ...BASE_USER, role: 'STUDENT', dateOfBirth: age16 }))
        .not.toThrow();
    });

    test('should NOT enforce COPPA for TEACHER role regardless of age', () => {
      const young = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
      expect(() => userModel._validateUserData({ ...BASE_USER, role: 'TEACHER', dateOfBirth: young }))
        .not.toThrow();
    });

    test('should throw INVALID_DATE_OF_BIRTH for invalid date string', () => {
      expect(() => userModel._validateUserData({ ...BASE_USER, role: 'STUDENT', dateOfBirth: 'not-a-date' }))
        .toThrow('INVALID_DATE_OF_BIRTH');
    });
  });
});
