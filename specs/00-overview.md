# Spec 00 — System Overview

**Document**: `specs/00-overview.md`
**Status**: Stable
**Last updated**: 2026-03-20

---

## Problem Statement

Adding second-hand products to WooCommerce via the WordPress admin UI is prohibitively slow:
- The media uploader processes images one at a time with no bulk optimisation
- Writing compelling product descriptions manually is time-consuming
- The WooCommerce editor is heavy and unusable on mobile

**SecondSell** solves this by providing a fast, mobile-native workflow that:
1. Captures and optimises images on the spot
2. Uses Claude to research product specs and draft a compelling listing (including analysing the uploaded images)
3. Creates the fully-formed product record via the WooCommerce REST API

---

## Goals

| # | Goal | Priority |
|---|------|----------|
| G1 | Mobile-first UX — fully usable one-handed on a phone | Must Have |
| G2 | Image optimisation — WebP, smart crop, no manual resizing | Must Have |
| G3 | AI description generation — title, short desc, full desc, price, SKU, tags | Must Have |
| G4 | WooCommerce REST API product creation | Must Have |
| G5 | Category selection — live dropdown from WC, defaults to “Others” | Must Have |
| G6 | All credentials in environment variables — no secrets in code | Must Have |
| G7 | Railway deployment | Must Have |
| G8 | Review and edit AI output before publishing | Must Have |
| G9 | Login gate — cookie-based HMAC session auth | Must Have |
| G10 | Bulk image upload — up to 10 per product, parallel | Should Have |
| G11 | Tag support | Should Have |
| G12 | Quantity / stock management | Should Have |

---

## Non-Goals (v1)

- Multi-user support
- WooCommerce product editing or deletion
- Inventory management beyond `stock_quantity`
- Variable products (sizes, colours)
- Payment / order processing

---

## System Architecture

```
┌─────────────────────────────────┐
│         User (mobile browser)   │
│  Camera / Gallery → 4-step UI   │
└─────────────┬──────────────────┗
               │ HTTPS
               ▼
┌─────────────────────────────────┐
│     SecondSell App (Railway)    │
│                                 │
│  Express   ┌──────────────────┐ │
│  server ──►│ /api/auth         │ │
│            │ /api/upload       │ │ ◄── Sharp WebP conversion
│            │ /api/ai/describe  │ │ ◄── Claude claude-sonnet-4-6 + vision
│            │ /api/products     │ │ ◄── WC REST API
│            │ /api/health       │ │
│            └──────────────────┘ │
└─────────────┬───────────────────┘
               │ WP/WC REST API
               ▼
    WordPress + WooCommerce
    (images + products)

---

## Problem Statement

Adding second-hand products to WooCommerce via the WordPress admin UI is prohibitively slow:
- The media uploader processes images one at a time with no bulk optimisation
- Writing compelling product descriptions manually is time-consuming
- The WooCommerce editor is heavy and unusable on mobile

**SecondSell** solves this by providing a fast, mobile-native workflow that:
1. Captures and optimises images on the spot
2. Uses Claude to research product specs and draft a compelling listing
3. Writes the fully-formed product record directly to the WooCommerce MySQL database

---

## Goals

| # | Goal | Priority |
|---|------|----------|
| G1 | Mobile-first UX — fully usable one-handed on a phone | Must Have |
| G2 | Image optimisation — WebP, ≤1200px, no manual resizing | Must Have |
| G3 | AI description generation — title, short desc, full desc, price, SKU, tags | Must Have |
| G4 | Direct WooCommerce DB insertion — no WP admin, no REST API auth required | Must Have |
| G5 | Products in "Others" category by default | Must Have |
| G6 | All credentials in environment variables — no secrets in code | Must Have |
| G7 | Railway deployment with persistent image storage | Must Have |
| G8 | Review and edit AI output before publishing | Must Have |
| G9 | Bulk image upload (up to 10 per product) | Should Have |
| G10 | Tag support | Should Have |

---

## Non-Goals (v1)

- User authentication / multi-user support
- WooCommerce product editing or deletion
- Inventory management
- Variable products (sizes, colours)
- Payment / order processing
- Category selection (always "Others" in v1)

---

## System Architecture

```
┌─────────────────────────────────┐
│         User (mobile browser)   │
│  Camera / Gallery → 4-step UI   │
└──────────────┬──────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────┐
│     SecondSell App (Railway)    │
│                                 │
│  Express   ┌──────────────────┐ │
│  server ──►│ /api/upload      │ │ ◄── Sharp WebP conversion
│            │ /api/ai/describe │ │ ◄── Claude claude-sonnet-4-6
│            │ /api/products    │ │ ◄── MySQL transaction
│            │ /api/health      │ │
│            └──────────────────┘ │
│                                 │
│  /uploads  (Railway Volume)     │
└──────────────┬──────────────────┘
               │ TCP:49645
               ▼
┌─────────────────────────────────┐
│  WordPress MySQL (Railway)      │
│  wp_posts, wp_postmeta,         │
│  wp_terms, wp_term_taxonomy,    │
│  wp_term_relationships          │
└─────────────────────────────────┘
```

---

## Data Flow

```
User selects images
       │
       ▼
POST /api/upload
  Sharp: rotate → resize ≤1200px → WebP q82
  Save to /uploads/{uuid}.webp
  Return: [{ id, url, width, height }]
       │
       ▼
User enters: product name, condition, notes
       │
       ▼
POST /api/ai/describe
  Claude claude-sonnet-4-6 researches product
  Returns: title, shortDesc, fullDesc, price, SKU, tags
       │
       ▼
User reviews & edits AI output
       │
       ▼
User sets price → POST /api/products
  Transaction:
    INSERT wp_posts (product)
    INSERT wp_postmeta (price, SKU, visibility, stock, etc.)
    INSERT wp_posts × N (attachments)
    INSERT wp_postmeta × N (attachment meta, PHP-serialized)
    INSERT wp_term_relationships (Others category)
    INSERT wp_term_relationships (simple product type)
    INSERT wp_term_relationships × M (tags)
    UPDATE wp_term_taxonomy (counts)
  COMMIT
       │
       ▼
Success screen → reset for next product
```

---

## Key Constraints

- **No WP REST API** — authentication credentials are not available to this app
- **No WordPress PHP** — all WP-specific formats (PHP serialize, GUID format) are emulated in Node.js
- **Production DB** — no test mode; every write is live
- **External image URLs** — images live on the SecondSell app, not in WP's uploads directory; WP handles external URLs via `_wp_attached_file` starting with `http`

---

## Versioning

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2026-03-19 | Initial implementation — single user, Others category, simple products |
