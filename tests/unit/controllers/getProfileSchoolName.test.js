process.env.NODE_ENV = 'test';

const UserController = require('../../../src/controllers/userController');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

describe('UserController.getProfile — schoolName', () => {
  test('returns the school name when the user has a school_id', async () => {
    const userModel = { getById: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', first_name: 'A', last_name: 'B', phone_number: null, role: 'TEACHER', school_id: 'school-1', account_status: 'ACTIVE', two_fa_enabled: false, last_login: null, created_at: null }) };
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ name: 'Northview High School' }] }) };
    const ctrl = new UserController(userModel, { db });
    const res = fakeRes();

    await ctrl.getProfile({ user: { id: 'u1' } }, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.schoolName).toBe('Northview High School');
    expect(db.query).toHaveBeenCalledWith('SELECT name FROM schools WHERE id = $1', ['school-1']);
  });

  test('returns schoolName null and does not query when there is no school_id', async () => {
    const userModel = { getById: jest.fn().mockResolvedValue({ id: 'u2', email: 'x@y.z', first_name: 'X', last_name: 'Y', phone_number: null, role: 'BIDDER', school_id: null, account_status: 'ACTIVE', two_fa_enabled: false, last_login: null, created_at: null }) };
    const db = { query: jest.fn() };
    const ctrl = new UserController(userModel, { db });
    const res = fakeRes();

    await ctrl.getProfile({ user: { id: 'u2' } }, res, jest.fn());

    expect(res.body.data.schoolName).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});
