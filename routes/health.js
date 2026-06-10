const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/', async (req, res) => {
  const result = { status: 'ok' };

  // This endpoint is exempt from auth so Railway can probe it. Detailed
  // diagnostics (WP URL, upstream errors, config state) are only included
  // for authenticated sessions to avoid leaking infrastructure details.
  const isAuthenticated = auth.verifyToken(auth.getSessionCookie(req));

  // WP REST API reachability
  const wpUrl = process.env.WP_URL?.replace(/\/$/, '');
  result.wpUrl = wpUrl || 'not configured';

  if (wpUrl) {
    try {
      const r = await fetch(`${wpUrl}/wp-json`, { signal: AbortSignal.timeout(5000) });
      result.wpApi = r.ok ? 'reachable' : `error (${r.status})`;
      if (!r.ok) result.status = 'degraded';
    } catch (e) {
      result.wpApi = 'unreachable';
      result.wpApiError = e.message;
      result.status = 'degraded';
    }
  } else {
    result.wpApi = 'not configured';
    result.status = 'degraded';
  }

  // WC API credentials configured?
  result.wcApi = process.env.WC_CONSUMER_KEY ? 'configured' : 'not configured';
  if (!process.env.WC_CONSUMER_KEY) result.status = 'degraded';

  // Claude API configured?
  result.claude = process.env.ANTHROPIC_API_KEY ? 'configured' : 'not configured';
  result.aiModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  if (!process.env.ANTHROPIC_API_KEY) result.status = 'degraded';

  if (!isAuthenticated) {
    return res
      .status(result.status === 'ok' ? 200 : 503)
      .json({ status: result.status });
  }

  res.status(result.status === 'ok' ? 200 : 503).json(result);
});

module.exports = router;
