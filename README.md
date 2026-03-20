# SecondSell — AI-Powered Second-Hand Product Uploader for WooCommerce

A mobile-first web app that lets you photograph second-hand products, generate complete WooCommerce
listings with Claude AI, and publish them in seconds — without touching the slow WordPress admin.

---

## How It Works

```
📱 Camera / gallery
      │
      ▼
Sharp — detect orientation
  Portrait  → 9:16 → 720×1280
  Landscape → 16:9 → 1280×720    (smart attention crop, WebP q80)
  Square    → 1:1  → 1080×1080
      │
      ▼
WP REST API ──────────────────► WordPress Media Library
/wp-json/wp/v2/media             (real attachment ID returned)
      │
      ▼
Claude claude-sonnet-4-6 ──────► Full product listing
researches specs + user notes     title / descriptions / SKU / tags / price
+ analyses uploaded photos
      │
      ▼
User reviews & edits
      │
      ▼
WC REST API ───────────────────► WooCommerce product (live instantly)
/wp-json/wc/v3/products          handles all DB writes + cache + hooks
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                SecondSell App (Railway)                 │
│                                                         │
│  POST /api/auth/login   → cookie-based session auth     │
│  POST /api/upload       → Sharp + WP REST API           │
│  POST /api/ai/describe  → Claude claude-sonnet-4-6      │
│  GET  /api/products/categories → WC REST API            │
│  POST /api/products     → WC REST API                   │
│  GET  /api/health       → WP/WC reachability check      │
│                                                         │
│  public/  (vanilla JS, mobile-first, no bundler)        │
└──────────┬──────────────────────────────────────────────┘
           │ WP/WC REST API
           ▼
   WordPress + WooCommerce
   (images + products)
```

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| WordPress 5.6+ | Application Passwords feature |
| WooCommerce 3.7+ | `wp_wc_product_meta_lookup` table |
| HTTPS on WordPress | Required for Application Passwords |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) |

---

## Setup

### 1. Install

```bash
git clone <repo> && cd secondsell
npm install
```

### 2. WordPress Application Password

1. **WP Admin → Users → Edit your profile**
2. Scroll to **Application Passwords**
3. Name: `SecondSell` → **Add New Application Password**
4. Copy the generated password — it's shown once

### 3. WooCommerce REST API Key

1. **WP Admin → WooCommerce → Settings → Advanced → REST API**
2. **Add key** — Description: `SecondSell`, User: admin, Permissions: **Read/Write**
3. Copy the Consumer Key and Consumer Secret

### 4. Environment variables

```bash
cp .env.example .env
```

```env
WP_URL=https://your-wordpress-site.com
WP_USER=your-wp-username
WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"

WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...

BASIC_AUTH_USER=admin
BASIC_AUTH_PASS="your-app-password"

ANTHROPIC_API_KEY=sk-ant-...
```

> **Note:** If your password contains `#`, `!`, or other shell-special characters, wrap it in double quotes in `.env`.

### 5. Run locally

```bash
npm run dev
# → http://localhost:3000
```

For camera access on iOS/Android, use HTTPS (e.g. ngrok) — browsers require HTTPS for `getUserMedia`.

---

## Deploy to Railway

1. Push to GitHub
2. Railway → **New Project → Deploy from GitHub repo**
3. Set all env vars in Railway → Service → **Variables**

> **No Railway Volume needed** — images live in WordPress's own media library.

---

## Image Processing

| Input orientation | Detected by | Cropped to | Output |
|-------------------|-------------|-----------|--------|
| Portrait (tall) | ratio < 0.80 | 9:16 | 720 × 1280 WebP |
| Landscape (wide) | ratio > 1.25 | 16:9 | 1280 × 720 WebP |
| Square / near-sq | 0.80 – 1.25 | 1:1 | 1080 × 1080 WebP |

- **Crop strategy:** `sharp.strategy.attention` — analyses saliency and entropy to keep the focal point centred.
- **Never upscaled:** small images stay small.
- **EXIF rotation applied** before any resize.
- **WebP quality 80** — typically 40–120 KB per image.

---

## API Reference

### `POST /api/auth/login`
```json
{ "username": "admin", "password": "secret" }
```
Sets `ss_session` cookie on success.

---

### `GET /api/products/categories`
Returns live WooCommerce categories:
```json
{ "success": true, "categories": [{ "id": 15, "name": "Electronics", "count": 8 }] }
```

---

### `POST /api/upload`
Optimise + upload images to WordPress media library.

**Request:** `multipart/form-data`, field `images`, up to 10 files.

**Response:**
```json
{
  "images": [
    {
      "id": 247,
      "url": "https://site.com/wp-content/uploads/2026/03/uuid.webp",
      "width": 720,
      "height": 1280,
      "orientation": "portrait",
      "aspect": "9:16",
      "sizeKb": 68
    }
  ]
}
```

---

### `POST /api/ai/describe`
Generate a product listing with Claude. Passes uploaded image URLs as vision content.

**Request:**
```json
{
  "productName": "Sony WH-1000XM4",
  "condition": "good",
  "userContext": "Includes case and USB-C cable",
  "imageUrls": ["https://..."]
}
```
`condition`: `new` | `like_new` | `good` | `fair` | `poor`

---

### `POST /api/products`
Create a WooCommerce product via REST API.

**Request:**
```json
{
  "title": "Sony WH-1000XM4 Wireless Headphones",
  "shortDescription": "Industry-leading ANC, 30h battery.",
  "fullDescription": "<h3>Overview</h3><p>…</p>",
  "price": "185.00",
  "sku": "SH-SONY-WH1000XM4-001",
  "quantity": 1,
  "categoryId": 15,
  "images": [{ "id": 247, "url": "https://…" }],
  "tags": ["sony", "headphones"]
}
```

---

### `GET /api/health`
```json
{
  "status": "ok",
  "wpUrl": "https://site.com",
  "wpApi": "reachable",
  "wcApi": "configured",
  "claude": "configured"
}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login fails | `#` in password not quoted | Wrap `BASIC_AUTH_PASS` in double quotes in `.env` |
| Upload 401 | Wrong `WP_USER` / `WP_APP_PASSWORD` | Regenerate WordPress Application Password |
| Upload 403 | REST API blocked by security plugin | Wordfence → allow REST API; re-save Permalinks |
| Product 401 | Wrong consumer key/secret | Regenerate WC API key with Read/Write |
| Product 403 | Key is Read-only | Edit key → set Permissions to Read/Write |
| AI fails | Wrong/truncated API key | Copy full key from console.anthropic.com |
| Wrong crop | EXIF not applied | Sharp `.rotate()` is called first — should be handled |

---

## Project Structure

```
├── server.js
├── middleware/auth.js           HMAC-SHA256 cookie session
├── routes/
│   ├── auth.js                 Login / logout
│   ├── upload.js               Sharp optimise → WP media
│   ├── ai.js                   Claude description + vision
│   ├── products.js             WC categories + product creation
│   └── health.js               System status
├── utils/
│   └── wcApi.js                WP + WC REST API client
├── public/
│   ├── index.html              4-step mobile UI
│   ├── login.html              Login page
│   ├── css/style.css           Mobile-first glassmorphism styles
│   └── js/app.js               Vanilla JS
├── specs/                      Feature specifications
├── CLAUDE.md                   AI coding guide
├── CONSTITUTION.md             Project rules
└── .env.example
```

---

## Security

- All credentials in environment variables — never in source code
- Cookie session uses HMAC-SHA256 — no plaintext tokens
- WP Application Password is scoped and revocable
- WC API key is scoped to Read/Write products only
- Multer enforces `image/*` type and 30 MB size limit
- Sharp processes all uploads in memory — raw bytes never written to disk
- API responses never include stack traces

---

## Developer

**Eduardo Arana & Soda [bot]**

---

## License

MIT