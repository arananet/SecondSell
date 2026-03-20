require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authMiddleware = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Trust Railway's / any reverse-proxy forwarded headers (needed for req.secure)
app.set('trust proxy', 1);

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
