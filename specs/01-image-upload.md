# Spec 01 — Image Upload & Optimisation

**Document**: `specs/01-image-upload.md`
**Status**: Stable
**Last updated**: 2026-03-19
**Implemented in**: `routes/upload.js`, `utils/wcApi.uploadMedia`

---

## Purpose

Accept product images from the user's device, optimise them for WooCommerce display,
and store them in the WordPress media library as proper attachment posts.

---

## API Contract

### `POST /api/upload`

**Request** — `multipart/form-data`, field `images`, up to 10 files, max 30 MB each, `image/*` only.

**Success Response** — HTTP 200
```json
{
  "images": [
    {
      "id": 247,
      "url": "https://site.com/wp-content/uploads/2024/03/uuid.webp",
      "width": 720,
      "height": 1280,
      "orientation": "portrait",
      "aspect": "9:16",
      "sizeKb": 68
    }
  ]
}
```

`id` is the WordPress attachment post ID — passed directly to `/api/products`.

---

## Image Optimisation Pipeline

```
User file (JPEG / PNG / HEIC / WebP / any Sharp-supported)
         │
         ▼  multer memory storage — raw bytes never touch disk
         │
         ▼  sharp(buffer).rotate()   ← fix EXIF orientation
         │
         ▼  Detect display orientation
              ratio = width / height
              ratio < 0.80  →  Portrait   9:16  →  720 × 1280
              ratio > 1.25  →  Landscape 16:9   → 1280 × 720
              else          →  Square     1:1   → 1080 × 1080
         │
         ▼  .resize(w, h, {
                fit: 'cover',
                position: sharp.strategy.attention,  ← smart focal-point crop
                withoutEnlargement: true
            })
         │
         ▼  .webp({ quality: 80, effort: 4 })
         │
         ▼  POST /wp-json/wp/v2/media  ← WordPress creates attachment post,
                                          generates all WC thumbnail sizes,
                                          serialises metadata
         │
         ▼  Return { id, url, width, height, orientation, aspect, sizeKb }
```

---

## Orientation Logic

| Input ratio (w/h) | Target | Dimensions | WC use case |
|-------------------|--------|------------|-------------|
| < 0.80 | Portrait | 720 × 1280 | Phone photos taken vertically |
| > 1.25 | Landscape | 1280 × 720 | Phone photos taken horizontally |
| 0.80 – 1.25 | Square | 1080 × 1080 | Near-square inputs |

**Cropping strategy:** `sharp.strategy.attention` analyses entropy and saliency to keep the
visually important region centred, so faces, products, and focal points are preserved even
when significant cropping occurs.

**Never upscaled:** `withoutEnlargement: true` ensures small source images are not blown up.

---

## WordPress Media Library Integration

Authentication uses **Application Passwords** (WP 5.6+):
```
Authorization: Basic base64("WP_USER:WP_APP_PASSWORD")
Content-Disposition: attachment; filename="<uuid>.webp"
Content-Type: image/webp
```

WordPress automatically:
- Saves file to `wp-content/uploads/YYYY/MM/`
- Creates `wp_posts` row with `post_type = 'attachment'`
- Writes `_wp_attached_file` and `_wp_attachment_metadata` postmeta
- Generates all registered image sizes including WooCommerce sizes:
  - `woocommerce_thumbnail` (default 300×300)
  - `woocommerce_single` (default 800×800)
  - `woocommerce_gallery_thumbnail` (100×100)

---

## Error Cases

| Scenario | HTTP |
|----------|------|
| No files | 400 |
| Non-image file | 400 |
| File > 30 MB | 400 |
| Sharp fails | 500 |
| WP upload 401 (bad credentials) | 500 |
| WP upload 403 (REST API blocked) | 500 |
