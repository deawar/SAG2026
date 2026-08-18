/**
 * Short-lived httpOnly cookie carrying the 2FA pre-auth token
 * (purpose '2fa_challenge' or '2fa_force_setup'). Scoped to /api/auth because
 * only the auth endpoints consume it.
 */
const TWOFA_COOKIE_NAME = 'twofa_token';
const TWOFA_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth'
  };
}

function setTwofaCookie(res, token) {
  res.cookie(TWOFA_COOKIE_NAME, token, { ...cookieOptions(), maxAge: TWOFA_MAX_AGE_MS });
}

function clearTwofaCookie(res) {
  res.clearCookie(TWOFA_COOKIE_NAME, cookieOptions());
}

module.exports = { TWOFA_COOKIE_NAME, TWOFA_MAX_AGE_MS, setTwofaCookie, clearTwofaCookie };
