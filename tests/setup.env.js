/**
 * Global Jest setup file — runs before every test file.
 * Ensures JWT secrets are present so the fail-fast guard in authRoutes.js
 * (and userRoutes.js) does not abort test workers.
 */
process.env.NODE_ENV = 'test';

if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-xxxxxxxxxxxxxxxx';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-xxxxxxxxxxxxxxxx';
}
