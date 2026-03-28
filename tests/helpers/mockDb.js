/**
 * Mock database for security/integration tests that need routes mounted
 * but do not require a live PostgreSQL connection.
 *
 * Behaviour:
 *  - query()  → resolves with { rows: [], rowCount: 0 } by default.
 *    This means every "find user" returns nothing (login → 401, etc.)
 *    which is the correct security-test expectation.
 *  - Callers may override individual queries via jest.fn().mockResolvedValueOnce()
 *    when a specific row is needed.
 */

const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),

  /** Reset call history between tests. */
  reset() {
    this.query.mockReset();
    this.query.mockResolvedValue({ rows: [], rowCount: 0 });
  }
};

module.exports = mockDb;
