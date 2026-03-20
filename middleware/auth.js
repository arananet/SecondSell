const crypto = require('crypto');

/**
 * Cookie-based session authentication middleware.
 *
 * On successful POST /api/auth/login the server issues a signed HttpOnly
 * cookie (ss_session). This middleware validates that cookie on every request.
 *
 * Exempt paths (no auth needed):
 *   /login.html          — login page itself
 *   /api/health          — Railway health probe
 *   /api/auth/login      — login endpoint
 *   /api/auth/logout     — logout endpoint (clears cookie)
 *
 * Security properties:
 *  - HMAC-SHA256 signed token — cannot be forged without the secret
 *  - HttpOnly cookie — not readable from JavaScript (XSS protection)
 *  - SameSite=Strict — CSRF protection
 *  - Secure flag in production — HTTPS only
 *  - Timing-safe comparisons throughout
 */

function _secret() {
  const u = process.env.BASIC_AUTH_USER;
  const p = process.env.BASIC_AUTH_PASS;
  if (!u || !p) throw new Error('BASIC_AUTH_USER and BASIC_AUTH_PASS must be set');
  return Buffer.from(`${u}:${p}`, 'utf8');
}

/**
 * Create a signed session token for the given username.
 * Format: encodeURIComponent(user).timestamp_seconds.hmac_base64url
 */
function makeToken(user) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${encodeURIComponent(user)}:${ts}`;
  const sig = crypto.createHmac('sha256', _secret()).update(payload).digest('base64url');
  return `${encodeURIComponent(user)}.${ts}.${sig}`;
}

/**
 * Verify a session token. Returns true if the signature is valid and
 * the token has not expired (24 h).
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;

  const dot1 = token.indexOf('.');
  if (dot1 === -1) return false;
  const dot2 = token.indexOf('.', dot1 + 1);
  if (dot2 === -1) return false;

  const rawUser = token.slice(0, dot1);
  const rawTs   = token.slice(dot1 + 1, dot2);
  const sig     = token.slice(dot2 + 1);

  const ts = parseInt(rawTs, 10);
  if (!rawUser || isNaN(ts)) return false;

  // Check expiry (24 h)
  if (Math.floor(Date.now() / 1000) - ts > 86400) return false;

  let expectedSig;
  try {
    expectedSig = crypto
      .createHmac('sha256', _secret())
      .update(`${rawUser}:${rawTs}`)
      .digest('base64url');
  } catch {
    return false; // env vars not configured
  }

  // Timing-safe string comparison
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/** Extract the ss_session cookie value from the request headers. */
function getSessionCookie(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)ss_session=([^;]+)/);
  return m ? m[1] : null;
}

/**
 * Timing-safe string equality (exported for use in the auth route).
 */
function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(String(a), 'utf8');
  const bBuf = Buffer.from(String(b), 'utf8');
  const len  = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  return crypto.timingSafeEqual(aPad, bPad) && aBuf.length === bBuf.length;
}

function authMiddleware(req, res, next) {
  // Always allow health probe
  if (req.path === '/api/health') return next();

  // Login page: allow through, but redirect to app if already authenticated
  if (req.path === '/login.html') {
    if (verifyToken(getSessionCookie(req))) return res.redirect('/');
    return next();
  }

  // Auth endpoints are accessible without a session
  if (req.path === '/api/auth/login' || req.path === '/api/auth/logout') return next();

  if (verifyToken(getSessionCookie(req))) return next();

  // Not authenticated
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Session expired. Please log in.' });
  }
  return res.redirect('/login.html');
}

authMiddleware.makeToken           = makeToken;
authMiddleware.timingSafeStringEqual = timingSafeStringEqual;

module.exports = authMiddleware;

