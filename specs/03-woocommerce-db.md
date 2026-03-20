# Spec 03 — WooCommerce Product Creation

**Document**: `specs/03-woocommerce-db.md`
**Status**: Stable
**Last updated**: 2026-03-20
**Implemented in**: `routes/products.js`, `utils/wcApi.js`

---

## Approach

Products and categories are managed exclusively via the **WooCommerce REST API**.
No direct database writes occur. The API handles:
- Correct `wp_posts` + `wp_postmeta` insertion (all required fields)
- Automatic `wp_wc_product_meta_lookup` population (required for SKU search, price/stock filters)
- Cache/transient clearing on save
- All WooCommerce action/filter hooks fired (third-party plugins see the new product)

---

## Approach

Products are created via the **WooCommerce REST API** (`POST /wp-json/wc/v3/products`).

This replaces direct DB writes and gives us:
- Correct `wp_posts` + `wp_postmeta` insertion (all required fields)
- Automatic `wp_wc_product_meta_lookup` population (required for SKU search, price/stock filters)
- Cache/transient clearing on save
- All WooCommerce action/filter hooks fired (third-party plugins see the new product)
- No need to maintain a PHP-compatible serialization layer in Node.js

Direct DB writes (mysql2) are retained **only for the health check** ping — not for product creation.

---

## API Call: Create Product

```
POST {WP_URL}/wp-json/wc/v3/products
Authorization: Basic base64(WC_CONSUMER_KEY:WC_CONSUMER_SECRET)
Content-Type: application/json
```

### Payload

```json
{
  "name": "Sony WH-1000XM4 Wireless Headphones",
  "type": "simple",
  "status": "publish",
  "description": "<h3>Overview</h3><p>…</p>",
  "short_description": "Industry-leading ANC, 30h battery.",
  "regular_price": "185.00",
  "sku": "SH-SONY-WH1000XM4-001",
  "manage_stock": false,
  "stock_status": "instock",
  "backorders": "no",
  "sold_individually": false,
  "virtual": false,
  "downloadable": false,
  "tax_status": "taxable",
  "categories": [{ "id": 15 }],
  "tags": [{ "name": "sony" }, { "name": "headphones" }],
  "images": [
    { "id": 247, "src": "https://…", "alt": "Sony WH-1000XM4 Wireless Headphones" },
    { "id": 248, "src": "https://…", "alt": "Sony WH-1000XM4 Wireless Headphones" }
  ]
}
```

**Image ordering:** `images[0]` becomes the featured product image (`_thumbnail_id`).
Subsequent images form the product gallery (`_product_image_gallery`). The WC API handles this automatically.

### WC API Response (key fields)

```json
{
  "id": 1042,
  "slug": "sony-wh-1000xm4-wireless-headphones",
  "permalink": "https://site.com/product/sony-wh-1000xm4-wireless-headphones/",
  "status": "publish",
  "images": [...],
  "categories": [...]
}
```

---

## Category Management

```
GET /wp-json/wc/v3/products/categories?search=Others&per_page=20
  → find exact name match (case-insensitive)
  → if found: use id
  → if not found:
      POST /wp-json/wc/v3/products/categories { name: "Others" }
      → use new id
```

The "Others" category is found or created on every product creation call.
The result is not cached in-process — the WC API responds in <100ms for a category lookup.

---

## API Contract: `POST /api/products`

### Request Body

```json
{
  "title": "Sony WH-1000XM4 Wireless Headphones",
  "shortDescription": "Industry-leading ANC, 30h battery — great condition.",
  "fullDescription": "<h3>Overview</h3><p>…</p><h3>Key Specifications</h3><ul>…</ul>",
  "price": "185.00",
  "sku": "SH-SONY-WH1000XM4-001",
  "images": [
    { "id": 247, "url": "https://…/uuid.webp", "width": 720, "height": 1280 }
  ],
  "tags": ["sony", "headphones", "wireless"]
}
```

`images[].id` must be a valid WordPress attachment ID (returned by `POST /api/upload`).

### Success Response — HTTP 200

```json
{
  "success": true,
  "productId": 1042,
  "slug": "sony-wh-1000xm4-wireless-headphones",
  "permalink": "https://site.com/product/sony-wh-1000xm4-wireless-headphones/",
  "message": "Product \"Sony WH-1000XM4 Wireless Headphones\" created with ID 1042"
}
```

### Error Response — HTTP 400 / 500

```json
{ "error": "Descriptive message" }
```

---

## Authentication

| Operation | Endpoint | Auth |
|-----------|----------|------|
| Image upload | `POST /wp-json/wp/v2/media` | `WP_USER` + `WP_APP_PASSWORD` (Application Password) |
| Category lookup/create | `GET/POST /wp-json/wc/v3/products/categories` | `WC_CONSUMER_KEY` + `WC_CONSUMER_SECRET` |
| Product create | `POST /wp-json/wc/v3/products` | `WC_CONSUMER_KEY` + `WC_CONSUMER_SECRET` |

---

## Error Cases

| Scenario | HTTP | Notes |
|----------|------|-------|
| `title` missing | 400 | Checked before any API call |
| WC auth fails | 500 | Check consumer key/secret |
| WP URL unreachable | 500 | Check WP_URL env var |
| Category create fails | 500 | Full error propagated |
| Product create fails | 500 | WC API error message included |

---

## Why Not Direct DB Writes?

Direct MySQL writes were used in v0. The WC REST API is preferred because:

1. **Completeness** — WC API writes every required row/column correctly, including fields that change between WC versions
2. **`wp_wc_product_meta_lookup`** — populated automatically; without it SKU search and price/stock filters break
3. **Cache** — WC API clears all relevant transients; direct writes leave stale cache
4. **Hooks** — third-party plugins (SEO, analytics, etc.) integrate via WooCommerce action hooks, which only fire through the API
5. **Future-proofing** — direct DB schema can change between WC major versions

Direct DB remains for the health check (`GET /api/health`) to verify database connectivity independently of the WC API layer.
