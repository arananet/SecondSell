const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const result = { status: 'ok' };

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

  res.status(result.status === 'ok' ? 200 : 503).json(result);
});

module.exports = router;
