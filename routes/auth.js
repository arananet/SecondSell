const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Body: { username, password }
 *
 * Validates credentials against BASIC_AUTH_USER / BASIC_AUTH_PASS env vars.
 * On success, sets a signed HttpOnly session cookie (ss_session) valid for 24 h.
 */
router.post('/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};

  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({ error: 'Authentication not configured on server' });
  }

  const userOk = auth.timingSafeStringEqual(username, expectedUser);
  const passOk = auth.timingSafeStringEqual(password, expectedPass);

  if (userOk && passOk) {
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
