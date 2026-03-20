# CLAUDE.md — SecondSell Project Guide

This file is read by Claude Code at session start. Follow every instruction here exactly.

---

## Mandatory Skills

### UI/UX — ALWAYS LOAD FOR FRONTEND WORK

**Skill file**: `.claude/skills/ui-ux-pro-max/SKILL.md`

You **MUST** read and apply this skill whenever any of the following is requested:
- Any change to `public/index.html`, `public/login.html`, `public/css/style.css`, `public/js/app.js`
- Designing or modifying any UI component (button, modal, form, card, navigation, toast, badge, spinner)
- Choosing colours, typography, spacing, layout, or animation
- Reviewing the frontend for usability, accessibility, or visual quality
- Adding a new page or step to the flow

**How to invoke**: Use `read_file` on `.claude/skills/ui-ux-pro-max/SKILL.md` first, then apply its rules before writing any frontend code. Priority order is: Accessibility → Touch/Interaction → Style → Layout → Typography.

**Non-negotiable UI rules** (from the skill — apply at all times):
- All touch targets ≥ 44 × 44 px (Apple HIG / WCAG 2.5.5)
- Body text ≥ 16px, line-height 1.5, sufficient colour contrast (≥ 4.5:1)
- Every async action must show a loading state
- Errors must be visible near the field — never silent failures
- Duration 150–300 ms for all transitions; respect `prefers-reduced-motion`
- No emoji as icons — use SVG icons or Unicode symbols sparingly
- Mobile-first: design for 375 × 667 px first, then scale up
- Style: **glassmorphism / dark-elevated** with purple accent (`#6c47ff`) — do not change the brand style without explicit user approval

---

## Project Overview

**SecondSell** is a mobile-first web application for quickly listing second-hand products on WooCommerce.

User flow:
1. Photograph product → Sharp optimises + auto-crops to correct aspect ratio → uploaded to WP media library
2. Enter product name, condition, notes → Claude generates full listing
3. Review & edit AI output
4. Set price → WooCommerce REST API creates the product

**Why not use the WooCommerce admin UI?**
- Slow on mobile, image upload is one-at-a-time
- This app is 10–50× faster end-to-end

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 (native `fetch`) |
| Framework | Express 4 |
| Image processing | Sharp — WebP, smart aspect-ratio crop |
| WordPress images | WP REST API `/wp-json/wp/v2/media` (Application Password) |
| Product creation | WC REST API `/wp-json/wc/v3/products` (Consumer Key/Secret) |
| AI description | Anthropic SDK — `claude-sonnet-4-6` |
| File upload | Multer (memory storage) |
| Frontend | Vanilla JS, mobile-first CSS |
| Deployment | Railway (Nixpacks) |

---

## Project Structure

```
/
├── CLAUDE.md
├── CONSTITUTION.md
├── README.md
├── specs/
│   ├── 00-overview.md
│   ├── 01-image-upload.md
│   ├── 02-ai-description.md
│   ├── 03-woocommerce-db.md
│   └── 04-frontend-ux.md
├── server.js
├── config/
│   └── database.js          ← stubbed out (DB support dropped)
├── middleware/
│   └── auth.js              ← cookie-based HMAC-SHA256 session auth
├── routes/
│   ├── auth.js              ← POST /api/auth/login, POST /api/auth/logout
│   ├── upload.js            ← POST /api/upload
│   ├── ai.js                ← POST /api/ai/describe
│   ├── products.js          ← GET /api/products/categories, POST /api/products
│   └── health.js            ← GET  /api/health
├── utils/
│   ├── wcApi.js             ← WP + WC REST API client
│   ├── phpSerialize.js      ← utility (retained, not currently used)
│   └── slugify.js           ← utility (retained, not currently used)
├── public/
│   ├── index.html
│   ├── login.html
│   ├── css/style.css
│   └── js/app.js
├── package.json
├── railway.json
└── .env.example
```

---

## Environment Variables

```env
PORT=3000
NODE_ENV=production

# WordPress (for WP REST API media upload)
WP_URL=https://your-wordpress-site.com
WP_USER=admin
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# WooCommerce REST API (for product + category management)
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...

# Basic Auth (login gate for the web app)
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=<secret>

# AI
ANTHROPIC_API_KEY=sk-ant-<secret>
```

---

## Development Commands

```bash
npm install
npm run dev          # nodemon watch mode
npm start            # production

# Test endpoints
curl http://localhost:3000/api/health

curl -X POST http://localhost:3000/api/upload \
  -F "images=@photo.jpg"

curl -X POST http://localhost:3000/api/ai/describe \
  -H "Content-Type: application/json" \
  -d '{"productName":"iPhone 14","condition":"good","userContext":"Minor scratches"}'

curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","price":"99","images":[{"id":247,"url":"https://..."}]}'
```

---

## Image Pipeline (routes/upload.js)

```
Input → rotate (EXIF) → detect orientation → resize + smart crop → WebP q80 → WP media library
```

| Input ratio w/h | Orientation | Target | Dimensions |
|----------------|-------------|--------|------------|
| < 0.80 | Portrait | 9:16 | 720 × 1280 |
| > 1.25 | Landscape | 16:9 | 1280 × 720 |
| 0.80–1.25 | Square | 1:1 | 1080 × 1080 |

Smart crop: `sharp.strategy.attention` (entropy + saliency — preserves faces and focal points).

---

## Product Creation (routes/products.js → utils/wcApi.js)

```
getOrCreateCategory("Others")  →  GET /wc/v3/products/categories?search=Others
                                   POST /wc/v3/products/categories  (if missing)
createProduct(data)            →  POST /wc/v3/products
```

The WC REST API handles: wp_posts, wp_postmeta, wp_wc_product_meta_lookup, cache clearing, hooks.

---

## AI Description (routes/ai.js)

Model: `claude-sonnet-4-6` — do not change without updating CONSTITUTION.md and spec 02.

---

## Critical Rules (see CONSTITUTION.md for full detail)

1. **WC REST API for products** — never write product rows directly to the DB.
2. **WP REST API for images** — never store images locally.
3. **Never expose credentials** — no logging of keys, passwords, or auth headers.
4. **AI output is always editable** — never auto-publish without user confirmation.
5. **AI model is `claude-sonnet-4-6`** — do not change without updating CONSTITUTION.md.
6. **Mobile-first** — canonical test viewport 375×667px; all changes tested there first.
7. **No frontend framework** — vanilla JS only; no bundler.
8. **All image output is WebP q80** — Sharp is the only image processor.
9. **Smart orientation crop** — always use `sharp.strategy.attention` for cover resizing.
10. **UI skill is mandatory** — load `.claude/skills/ui-ux-pro-max/SKILL.md` before any frontend change.
11. **No emoji as icons** — use inline SVG (Lucide style) for all interactive icons.
12. **Touch targets ≥ 44px** — all buttons/inputs must meet Apple HIG / WCAG 2.5.5.
13. **Cookie-based auth** — session token is HMAC-SHA256, stored as `ss_session` HttpOnly cookie.
14. **Category selection** — user chooses WC category from a live dropdown; defaults to “Others”.

---

## WC REST API Reference

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Upload image | POST | `/wp-json/wp/v2/media` |
| List categories | GET | `/wp-json/wc/v3/products/categories` |
| Create category | POST | `/wp-json/wc/v3/products/categories` |
| Create product | POST | `/wp-json/wc/v3/products` |
| Get product | GET | `/wp-json/wc/v3/products/{id}` |

App endpoint for categories: `GET /api/products/categories` → returns `[{ id, name, count }]`

Auth for WP API: `Basic base64(WP_USER:WP_APP_PASSWORD)`
Auth for WC API: `Basic base64(WC_CONSUMER_KEY:WC_CONSUMER_SECRET)`
Auth for app: cookie `ss_session` (HMAC-SHA256, set by `POST /api/auth/login`)

---

## Common Pitfalls

- **WP REST API 401** → wrong `WP_USER` / `WP_APP_PASSWORD`, or site doesn't have HTTPS
- **WP REST API 403** → security plugin blocking REST API (Wordfence, iThemes); or permalink not saved
- **WC API 401** → wrong consumer key/secret, or key has Read-only permissions (needs Read/Write)
- **Image wrong orientation** → Sharp reads EXIF after `.rotate()` — always call `.rotate()` first before reading metadata
- **Category not found** → `getOrCreateCategory` does exact case-insensitive match then creates; safe to call repeatedly
