/**
 * Global fetch guard. The access token is an httpOnly cookie the browser sends
 * automatically on same-origin requests, so JS never holds a token. For every
 * same-origin request this: (1) adds the X-Requested-With CSRF header the server
 * requires on cookie-authenticated mutations, and (2) strips any stale
 * Authorization header (no bearer token exists anymore). Cross-origin requests
 * (e.g. Stripe.js) pass through untouched. Load this BEFORE any other script.
 */
(function() {
  if (typeof window === 'undefined' || !window.fetch) { return; }
  const nativeFetch = window.fetch.bind(window);
  function sameOrigin(url) {
    try { return new URL(url, window.location.href).origin === window.location.origin; }
    catch (_e) { return false; }
  }
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    if (!sameOrigin(url)) { return nativeFetch(input, init); }
    const opts = init ? { ...init } : {};
    const headers = new Headers(opts.headers || {});
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.delete('Authorization');
    opts.headers = headers;
    return nativeFetch(input, opts);
  };
})();
