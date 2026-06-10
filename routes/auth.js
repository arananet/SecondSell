const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

// ── Login rate limiting (in-memory, per IP) ────────────────────────────────
// Max 10 failed attempts per 15-minute window. Successful login resets the
// counter. Good enough for a single-instance deployment (Railway).
const WINDOW_MS    = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map(); // ip → { count, windowStart }

function isRateLimited(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    failures.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
  // Opportunistic cleanup so the map cannot grow unbounded
  if (failures.size > 10000) {
    for (const [key, val] of failures) {
      if (now - val.windowStart > WINDOW_MS) failures.delete(key);
    }
  }
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 *
 * Validates credentials against BASIC_AUTH_USER / BASIC_AUTH_PASS env vars.
 * On success, sets a signed HttpOnly session cookie (ss_session) valid for 24 h.
 */
router.post('/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};

  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Try again in 15 minutes.' });
  }

  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({ error: 'Authentication not configured on server' });
  }

  const userOk = auth.timingSafeStringEqual(username, expectedUser);
  const passOk = auth.timingSafeStringEqual(password, expectedPass);

  if (userOk && passOk) {
    failures.delete(req.ip);
    const token = auth.makeToken(username);
    // Set Secure flag only when the connection is already HTTPS.
    // Works for Railway (x-forwarded-proto) and plain HTTPS direct connections.
    // Falls back to checking NODE_ENV so local HTTP development still works.
    const connectionIsHttps =
      req.headers['x-forwarded-proto'] === 'https' ||
      req.secure ||
      process.env.NODE_ENV === 'production';
    res.cookie('ss_session', token, {
      httpOnly: true,
      secure:   connectionIsHttps,
      sameSite: 'strict',
      maxAge:   86400 * 1000, // 24 hours in ms
      path:     '/',
    });
    return res.json({ success: true });
  }

  recordFailure(req.ip);
  return res.status(401).json({ error: 'Invalid username or password' });
});

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
router.post('/logout', (req, res) => {
  res.clearCookie('ss_session', { path: '/' });
  res.json({ success: true });
});

module.exports = router;
