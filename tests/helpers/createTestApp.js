/**
 * Creates a fully-configured Express app for security/integration tests.
 *
 * All routes — including auth, user, admin, teacher and school — are mounted
 * using a mock database so tests are not gated on a live PostgreSQL instance.
 *
 * Usage:
 *   const createTestApp = require('../helpers/createTestApp');
 *   const app = createTestApp();
 */

process.env.NODE_ENV = 'test';

// Provide fallback JWT secrets so tokens created in tests can be verified.
if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
}

const createApp = require('../../src/app');
const mockDb = require('./mockDb');

/**
 * Returns a fresh Express application instance backed by the mock db.
 * The mock db query stub is reset before each call so tests start clean.
 */
function createTestApp() {
  mockDb.reset();
  return createApp(mockDb);
}

module.exports = createTestApp;
