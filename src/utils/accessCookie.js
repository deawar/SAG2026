/**
 * Single source of truth for the access-token cookie.
 * HttpOnly so JS/XSS cannot read it; SameSite=Strict so it is never sent
 * cross-site; Path=/ so it rides every API route (unlike the refresh cookie's
 * /api/auth). Secure only in production so http://localhost works in dev/test.
 */
const ACCESS_COOKIE_NAME = 'access_token';
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  };
}

function setAccessCookie(res, token) {
  res.cookie(ACCESS_COOKIE_NAME, token, { ...cookieOptions(), maxAge: ACCESS_MAX_AGE_MS });
}

function clearAccessCookie(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, cookieOptions());
}

module.exports = { ACCESS_COOKIE_NAME, ACCESS_MAX_AGE_MS, setAccessCookie, clearAccessCookie };
