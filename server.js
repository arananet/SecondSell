require('dotenv').config();
const express = require('express');
const path = require('path');
const authMiddleware = require('./middleware/auth');

const app = express();

// No CORS middleware: the frontend is served same-origin and auth is
// cookie-based, so cross-origin API access is intentionally not allowed.
// Image uploads go through multer (multipart), so JSON bodies stay small.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
// Trust Railway's / any reverse-proxy forwarded headers (needed for req.secure)
app.set('trust proxy', 1);

// Baseline security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ── Authentication ─────────────────────────────────────────────────────────
// Cookie-based session auth. /login.html, /api/health, /api/auth/login, and
// /api/auth/logout are exempt. Every other route requires a valid session.
app.use(authMiddleware);

// Serve frontend (only reached when auth passes, or for exempt paths)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/products', require('./routes/products'));
app.use('/api/health', require('./routes/health'));

// Fallback: serve SPA index for all authenticated page requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
