# Spec 02 — AI Description Generation

**Document**: `specs/02-ai-description.md`
**Status**: Stable
**Last updated**: 2026-03-20
**Implemented in**: `routes/ai.js`

---

## Purpose

Use Claude to research a second-hand product and produce a complete, ready-to-publish
WooCommerce product listing from minimal seller input. The model also analyses the
uploaded product photos as additional context.

---

## API Contract

### `POST /api/ai/describe`

**Request Body** (JSON)
```json
{
  "productName": "Sony WH-1000XM4 Headphones",
  "condition": "good",
  "userContext": "Includes original case and USB-C cable. Minor scratches on right ear cup.",
  "imageUrls": ["https://site.com/wp-content/uploads/2026/03/abc.webp"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productName` | string | **Yes** | Name of the product as typed by seller |
| `condition` | string | No | One of: `new`, `like_new`, `good`, `fair`, `poor` |
| `userContext` | string | No | Free-text seller notes |
| `imageUrls` | string[] | No | Public URLs of uploaded images — sent as vision content to Claude |

**Success Response** — HTTP 200
```json
{
  "success": true,
  "data": {
    "title": "Sony WH-1000XM4 Wireless Noise-Cancelling Headphones",
    "shortDescription": "Industry-leading noise cancellation, 30h battery, multipoint Bluetooth — in great condition with case and cable.",
    "fullDescription": "<h3>Overview</h3><p>...</p><h3>Key Specifications</h3><ul>...</ul>",
    "suggestedPrice": 185,
    "currency": "USD",
    "sku": "SH-SONY-WH1000XM4-001",
    "tags": ["sony", "headphones", "wireless", "noise-cancelling", "audio"]
  }
}
```

---

## Claude Integration

### Model
`claude-sonnet-4-6`

Changing this requires updating:
- `routes/ai.js`
- `CONSTITUTION.md` Article IV §4.1
- This document

### Vision (Image Analysis)
When `imageUrls` is non-empty, the images are included as vision content in the user message.
Claude analyses the actual product photos to improve accuracy of condition assessment,
identify included accessories, and provide a more accurate description.

Images are sent as `image_url` content blocks (one per URL) alongside the text prompt.

### System Prompt
```
You are an expert product copywriter specialising in second-hand marketplace listings.
You research products thoroughly and write compelling, honest descriptions that help items sell quickly.
You always respond with valid JSON only — no markdown, no extra text.
```

### User Prompt Template
```
Create a WooCommerce product listing for a second-hand item.

Product: {productName}
Condition: {conditionLabel}
Seller notes: {userContext | "None provided"}

Research this product’s specifications, typical features, and market value.
Combine that knowledge with the seller’s notes and the attached photos (if any)
to produce a compelling listing.

Return ONLY this JSON (no markdown fences):
{
  "title": "Short punchy product title under 60 chars",
  "shortDescription": "2-3 sentence compelling summary under 160 chars for SEO",
  "fullDescription": "Full HTML description with sections: Overview, Key Specifications, Condition Details, What’s Included. Use <h3>, <ul>, <p> tags. Min 200 words.",
  "suggestedPrice": 0,
  "currency": "USD",
  "sku": "auto-generated SKU suggestion e.g. SH-BRANDMODEL-001",
  "tags": ["tag1", "tag2", "tag3"]
}
```

---

## Purpose

Use Claude to research a second-hand product and produce a complete, ready-to-publish
WooCommerce product listing from minimal seller input.

---

## API Contract

### `POST /api/ai/describe`

**Request Body** (JSON)
```json
{
  "productName": "Sony WH-1000XM4 Headphones",
  "condition": "good",
  "userContext": "Includes original case and USB-C cable. Minor scratches on right ear cup.",
  "imageUrls": ["https://app.railway.app/uploads/abc.webp"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productName` | string | **Yes** | Name of the product as typed by seller |
| `condition` | string | No | One of: `new`, `like_new`, `good`, `fair`, `poor` |
| `userContext` | string | No | Free-text seller notes |
| `imageUrls` | string[] | No | Public URLs of uploaded images (for context in prompt) |

**Success Response** — HTTP 200
```json
{
  "success": true,
  "data": {
    "title": "Sony WH-1000XM4 Wireless Noise-Cancelling Headphones",
    "shortDescription": "Industry-leading noise cancellation, 30h battery, multipoint Bluetooth — in great condition with case and cable.",
    "fullDescription": "<h3>Overview</h3><p>...</p><h3>Key Specifications</h3><ul>...</ul>",
    "suggestedPrice": 185,
    "currency": "USD",
    "sku": "SH-SONY-WH1000XM4-001",
    "tags": ["sony", "headphones", "wireless", "noise-cancelling", "audio"]
  }
}
```

**Error Response** — HTTP 400 / 500
```json
{ "error": "Human-readable description of the problem" }
```

---

## Claude Integration

### Model
`claude-sonnet-4-6`

Changing this requires updating:
- `routes/ai.js`
- `CONSTITUTION.md` Article IV §4.1
- This document

### System Prompt
```
You are an expert product copywriter specialising in second-hand marketplace listings.
You research products thoroughly and write compelling, honest descriptions that help items sell quickly.
You always respond with valid JSON only — no markdown, no extra text.
```

### User Prompt Template
```
Create a WooCommerce product listing for a second-hand item.

Product: {productName}
Condition: {conditionLabel}
Seller notes: {userContext | "None provided"}
Photos provided: {imageUrls.length} image(s)

Research this product's specifications, typical features, and market value.
Combine that knowledge with the seller's notes to produce a compelling listing.

Return ONLY this JSON (no markdown fences):
{
  "title": "Short punchy product title under 60 chars",
  "shortDescription": "2-3 sentence compelling summary under 160 chars for SEO",
  "fullDescription": "Full HTML description with sections: Overview, Key Specifications, Condition Details, What's Included. Use <h3>, <ul>, <p> tags. Min 200 words.",
  "suggestedPrice": 0,
  "currency": "USD",
  "sku": "auto-generated SKU suggestion e.g. SH-BRANDMODEL-001",
  "tags": ["tag1", "tag2", "tag3"]
}
```

### Condition Labels Mapping

| `condition` value | Label sent to Claude |
|-------------------|---------------------|
| `new` | Brand New (never used) |
| `like_new` | Like New (used once or twice, no signs of wear) |
| `good` | Good (light signs of use, fully functional) |
| `fair` | Fair (visible wear, fully functional) |
| `poor` | Poor (heavy wear or minor issues, still functional) |
| *(any other)* | Passed through as-is |

---

## Output Schema (enforced contract)

```typescript
interface AiProductData {
  title: string;            // ≤ 60 characters, plain text
  shortDescription: string; // ≤ 160 characters, plain text, SEO-friendly
  fullDescription: string;  // HTML; uses <h3>, <ul>, <li>, <p> only
  suggestedPrice: number;   // USD, reasonable second-hand market price
  currency: string;         // Always "USD" in v1
  sku: string;              // Format: SH-{BRAND}{MODEL}-{NNN}
  tags: string[];           // 3–8 lowercase tags
}
```

### Validation Rules
- `title` must be non-empty after trim
- `fullDescription` must contain at least one HTML tag
- `suggestedPrice` must be a positive number
- If JSON.parse fails → HTTP 500, do not return partial data

### Markdown Stripping
Claude sometimes wraps JSON in fences despite instructions.
The route strips leading ` ```json ` and trailing ` ``` ` before parsing.

---

## Token Budget

| Setting | Value | Rationale |
|---------|-------|-----------|
| `max_tokens` | 2048 | Enough for full HTML description + metadata |
| Model | claude-sonnet-4-6 | Best quality/speed for product copy |

---

## Frontend Behaviour

- "Generate Description" button on Step 2 triggers this endpoint
- Full-screen loading spinner with message "Researching product and crafting description…"
- On success: navigate to Step 3, populate all fields (title, short desc, full desc, SKU, tags)
- All fields are editable text inputs/textareas — user has full control
- `suggestedPrice` is shown as a hint on Step 4's price field, pre-filled if price is empty
- On error: stay on Step 2, show alert with error message

---

## Error Cases

| Scenario | HTTP | Response |
|----------|------|---------|
| `productName` missing | 400 | `{ "error": "productName is required" }` |
| Claude API key invalid/missing | 500 | `{ "error": "..." }` |
| Claude returns non-JSON | 500 | `{ "error": "..." }` |
| Claude API timeout | 500 | `{ "error": "..." }` |
| Rate limit | 500 | `{ "error": "..." }` |

---

## Privacy & Data

- Image URLs are included in the prompt only as context (count: N images)
- Image pixels are **not** sent to the Anthropic API in v1 (vision not enabled)
- User-entered text (product name, notes) is sent to Anthropic per their API usage policy
- No user data is stored server-side after the response is returned

---

## Future Considerations (not v1)

- Vision: pass image thumbnails to Claude for visual product identification
- Multi-language output (currently English only)
- Caching identical product names to reduce API calls
- Streaming response for progressive display
