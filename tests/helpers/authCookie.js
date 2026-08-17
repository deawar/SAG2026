/** Attach a cookie-based access token + the CSRF header to a supertest request. */
function authCookie(token) {
  return { Cookie: `access_token=${token}`, 'X-Requested-With': 'XMLHttpRequest' };
}
/** Read the access_token value from a response's Set-Cookie (for login→call chains). */
function extractAccessCookie(res) {
  const raw = res.headers['set-cookie'] || [];
  const found = raw.find((s) => s.startsWith('access_token='));
  return found ? found.split(';')[0].split('=')[1] : null;
}
module.exports = { authCookie, extractAccessCookie };
