/**
 * Single source of truth for the refresh-token cookie.
 * HttpOnly so JS/XSS cannot read it; SameSite=Strict so it is never sent
 * cross-site; Path=/api/auth so it rides along only on auth requests.
 * Secure is enabled only in production (so http://localhost works in dev/test).
 */
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth'
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieOptions(), maxAge: REFRESH_MAX_AGE_MS });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

module.exports = { REFRESH_COOKIE_NAME, REFRESH_MAX_AGE_MS, setRefreshCookie, clearRefreshCookie };
