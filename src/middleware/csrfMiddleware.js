/**
 * CSRF defense for cookie-authenticated mutations.
 * Only enforced when the request carries the access_token cookie: a forged
 * cross-site request necessarily rides that ambient cookie, so it hits the
 * header check and is blocked; a request without the cookie is unauthenticated
 * and 401s at the auth middleware regardless. Browsers cannot set a custom
 * header cross-site without a CORS preflight the server never approves.
 */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function requireCsrfHeader(req, res, next) {
  if (SAFE_METHODS.includes(req.method)) { return next(); }
  if (!req.cookies || !req.cookies.access_token) { return next(); }
  if (req.get('X-Requested-With')) { return next(); }
  return res.status(403).json({ success: false, message: 'CSRF check failed' });
}

module.exports = { requireCsrfHeader };
