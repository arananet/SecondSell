# Spec 04 — Frontend UX

**Document**: `specs/04-frontend-ux.md`
**Status**: Stable
**Last updated**: 2026-03-20
**Implemented in**: `public/index.html`, `public/login.html`, `public/css/style.css`, `public/js/app.js`

---

## Purpose

Define the user interface, interaction model, and mobile experience requirements
for the SecondSell web application.

---

## Design System

| Property | Value |
|----------|-------|
| Style | Glassmorphism / dark-elevated with purple accent |
| Primary colour | `#6c47ff` |
| Success | `#22c55e` |
| Danger | `#ef4444` |
| Background | `#f5f4ff` (light purple tint) |
| Surface | `#ffffff` |
| Border | `#e2e0f0` |
| Font | System stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto` |
| Base font size | 16px |
| Line-height | 1.6 |
| Border-radius | 12px |
| Icon style | Lucide-style inline SVG (stroke, no fill) — **no emoji icons** |

---

## UI/UX Skill

All frontend work **must** load `.claude/skills/ui-ux-pro-max/SKILL.md` first.
Priority order: Accessibility → Touch/Interaction → Style → Layout → Typography.

---

## Design Principles

1. **Mobile-first** — designed for one-handed phone use; desktop is an enhancement
2. **Linear flow** — 4 sequential steps prevent confusion about what to do next
3. **Progressive disclosure** — each step shows only what’s needed at that moment
4. **Fail loudly** — every error is visible via toast; no silent failures
5. **Instant feedback** — every async action has a loading state
6. **Editable AI output** — AI content is a starting point, not the final word

---

## Viewport & Responsiveness

| Breakpoint | Behaviour |
|------------|----------|
| 0 – 539px | Full-width single column, native mobile |
| ≥ 540px | Centred card with `max-width: 540px`, border + shadow |

**Canonical test viewport**: 375 × 667 px (iPhone SE)

All touch targets must be ≥ 44px tall (Apple HIG / WCAG 2.5.5).
`viewport` meta must **not** disable zoom (`maximum-scale` must not be set).

---

## Layout Structure

```
┌─────────────────────────────────┐
│  SKIP LINK (visually hidden)     │
├─────────────────────────────────┤
│  HEADER (sticky)                 │
│  Logo icon + name   Badge | Out  │
├─────────────────────────────────┤
│  STEPS NAV                       │
│  [1] ── [2] ── [3] ── [4]       │
├─────────────────────────────────┤
│                                 │
│  STEP PANEL (active step only)  │
│                                 │
├─────────────────────────────────┤
│  FOOTER                          │
└─────────────────────────────────┘
```

---

## Authentication

`public/login.html` is the entry point for unauthenticated users.
- Cookie-based HMAC-SHA256 session (`ss_session`, HttpOnly, SameSite=Strict)
- middleware/auth.js redirects unauthenticated page requests to `/login.html`
- 401 API responses trigger redirect to `/login.html` via `apiFetch()` wrapper

Login page features: SVG branding, password show/hide toggle, inline error banner.

---

## Step 1 — Photos

### Goal
Let the user add product images quickly using camera or gallery.

### Elements
| Element | Behaviour |
|---------|-----------|
| “Take Photo” button | Opens rear camera via `<input capture="environment" accept="image/*">` |
| “Gallery” button | Opens file picker, multi-select |
| Photo grid | 3-column CSS Grid, square thumbnails, `aspect-ratio: 1` |
| Cover badge | Purple badge on first image — this becomes `_thumbnail_id` |
| Remove (×) button | 28px circle with 44px touch area via `::before`; removes from `uploadedImages[]` |
| Shimmer placeholder | Animated gradient while upload is in-flight |
| Status text | `role="status" aria-live="polite"`: “3 photo(s) ready” |
| Next button | Disabled until at least 1 image uploaded |

### Upload Flow
1. User selects files → `handleFiles()` called
2. Input reset immediately so camera fires again right away
3. `uploadSingleImage(file)` sends `POST /api/upload` per file
4. Shimmer placeholder shown during upload; thumbnail rendered on success
5. Parallel uploads for gallery; sequential for camera

### Constraints
- Max 10 images total (enforced in JS before upload)
- Toast notification shown if max reached

---

## Step 2 — Product Details

### Goal
Collect the minimal seller input needed for Claude to generate a complete description.

### Form Fields
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Product Name | text input | Yes | Placeholder: “e.g. Sony WH-1000XM4 Headphones” |
| Condition | `<select>` | Yes | Options: Like New, Good (default), Fair, Poor, Brand New |
| Quantity | `<input type=number>` | Yes | Default 1, min 1 |
| Category | `<select>` | No | Loaded from `GET /api/products/categories`; defaults to “Others” |
| Additional Notes | `<textarea>` | No | 4 rows; for accessories, reason for selling, etc. |

### Navigation
- Back → Step 1
- “Generate Description” → validates name is non-empty → calls `POST /api/ai/describe` → navigates to Step 3

---

## Step 3 — AI Description

### Goal
Display, review, and edit the AI-generated product listing.

### Loading State
- Full-section spinner with message “Researching product and crafting description…”
- Triggered immediately on navigation from Step 2
- Hides when API responds

### Editable Fields
| Field | Input type | Source |
|-------|-----------|--------|
| Product Title | `<input type="text">` | `aiData.title` |
| Short Description | `<textarea>` 3 rows | `aiData.shortDescription` |
| Full Description (HTML) | `<textarea>` 12 rows | `aiData.fullDescription` |
| SKU | `<input type="text">` | `aiData.sku` |
| Tags | `<input type="text">` | `aiData.tags.join(', ')` |

All fields are fully editable. The AI also analyses uploaded images when generating the description.

### Navigation
- Back → Step 2 (AI result discarded, must regenerate)
- Next: Set Price → Step 4 (enabled only after successful AI response)

---

## Step 4 — Price & Publish

### Goal
Let the user set the final price and publish the product.

### Summary Card
Shown at top of step, reads from edited Step 3 values:
- Product title
- Short description
- Thumbnail grid (first 5 images, 56×56px)

### Price Input
```
┌───────────────────────────────┐
│ $  │  185.00                  │
└───────────────────────────────┘
```
- Pre-filled with `aiData.suggestedPrice` if price field is empty
- AI suggestion shown as grey hint: “— AI suggests $185”

### Publish Button
- SVG rocket icon + “Publish to WooCommerce”
- Triggers `POST /api/products`
- Disabled + text changes to “Publishing…” during request

### Success State
Green card with product name and ID.
After 2.5s: dark glassmorphism **custom confirm modal** — “Add Another” or “Done”. No `confirm()` dialogs.

### Error State
Red card with error message. Publish button re-enabled for retry.

---

## State Model

```js
let currentStep    = 1;        // 1–4
let uploadedImages = [];       // [{ id, url, width, height, orientation, aspect, sizeKb }]
let pendingUploads = 0;        // in-flight uploads
let aiData         = null;     // { title, shortDescription, fullDescription,
                               //   suggestedPrice, currency, sku, tags }
```

State is in-memory only. Page refresh resets everything (intentional in v1).

---

## Steps Nav Visual States

| Step state | Circle colour | Label colour |
|------------|---------------|--------------|
| Future (not reached) | Light grey | Muted grey, 40% opacity |
| Active (current) | Primary purple | Primary purple |
| Done (past) | Green | Dark green |

---

## Accessibility Checklist (enforced)

- [ ] `viewport` does not set `maximum-scale` — zoom never disabled (WCAG 1.4.4)
- [ ] Skip link `<a href="#main-content">` present and focusable (WCAG 2.4.1)
- [ ] All interactive icons have `aria-label` or visible text labels
- [ ] `aria-hidden="true"` on all decorative SVGs
- [ ] Upload status uses `role="status" aria-live="polite"`
- [ ] Toast container uses `aria-live` (polite for info, assertive for errors)
- [ ] All form inputs have visible `<label>` elements (not placeholder-only)
- [ ] Required fields marked with `*`
- [ ] All buttons `≥ 44px` touch target (Apple HIG / WCAG 2.5.5)
- [ ] `prefers-reduced-motion` disables all animations
- [ ] `:focus-visible` rings on all interactive elements
- [ ] Confirm modal uses custom dark-glassmorphism dialog, never `confirm()`
- [ ] No `alert()` calls — use `showToast()` instead

---

## Purpose

Define the user interface, interaction model, and mobile experience requirements
for the SecondSell web application.

---

## Design Principles

1. **Mobile-first** — designed for one-handed phone use; desktop is an enhancement
2. **Linear flow** — 4 sequential steps prevent confusion about what to do next
3. **Progressive disclosure** — each step shows only what's needed at that moment
4. **Fail loudly** — every error is visible; no silent failures
5. **Instant feedback** — every async action has a loading state
6. **Editable AI output** — AI content is a starting point, not the final word

---

## Viewport & Responsiveness

| Breakpoint | Behaviour |
|------------|-----------|
| 0 – 539px | Full-width single column, native mobile |
| ≥ 540px | Centred card with `max-width: 540px`, border + shadow |

**Canonical test viewport**: 375 × 667 px (iPhone SE)

All touch targets must be ≥ 44px tall (Apple HIG / WCAG 2.5.5).

---

## Layout Structure

```
┌─────────────────────────────────┐
│  HEADER (sticky)                │
│  Logo              DB status    │
├─────────────────────────────────┤
│  STEPS NAV                      │
│  [1] ── [2] ── [3] ── [4]      │
├─────────────────────────────────┤
│                                 │
│  STEP PANEL (active step only)  │
│                                 │
├─────────────────────────────────┤
│  FOOTER                         │
└─────────────────────────────────┘
```

---

## Step 1 — Photos

### Goal
Let the user add product images quickly using camera or gallery.

### Elements
| Element | Behaviour |
|---------|-----------|
| "Take Photo" button | Opens rear camera via `<input capture="environment" accept="image/*">` |
| "Choose from Gallery" button | Opens file picker, multi-select |
| Photo grid | 3-column CSS Grid, square thumbnails, aspect-ratio 1:1 |
| Cover badge | Purple badge on first image — this becomes `_thumbnail_id` |
| Remove (×) button | 22px circular button, removes from `uploadedImages[]` |
| Progress bar | 6px bar animates 0→80% during upload, 80→100% on success |
| Status text | Small text below bar: "3 photo(s) ready" |
| Next button | Disabled until at least 1 image uploaded |

### Upload Flow
1. User selects files → `handleFiles()` called
2. `FormData` built, `POST /api/upload` sent
3. Progress animates to 80% while waiting
4. On success: `uploadedImages[]` extended, grid re-rendered, progress → 100%
5. After 800ms, progress bar hides

### Constraints
- Max 10 images total (enforced in JS before upload)
- If 10 reached, alert user instead of uploading

---

## Step 2 — Product Details

### Goal
Collect the minimal seller input needed for Claude to generate a complete description.

### Form Fields
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Product Name | text input | Yes | Placeholder: "e.g. Sony WH-1000XM4 Headphones" |
| Condition | `<select>` | Yes | Options: Like New, Good (default), Fair, Poor, Brand New |
| Additional Notes | `<textarea>` | No | 4 rows; for accessories, reason for selling, etc. |

### Navigation
- Back → Step 1
- "Generate Description" → validates name is non-empty → calls `POST /api/ai/describe` → navigates to Step 3

---

## Step 3 — AI Description

### Goal
Display, review, and edit the AI-generated product listing.

### Loading State
- Full-section spinner with message "Researching product and crafting description…"
- Triggered immediately on navigation from Step 2
- Hides when API responds

### Editable Fields
| Field | Input type | Source |
|-------|-----------|--------|
| Product Title | `<input type="text">` | `aiData.title` |
| Short Description | `<textarea>` 3 rows | `aiData.shortDescription` |
| Full Description (HTML) | `<textarea>` 12 rows | `aiData.fullDescription` |
| SKU | `<input type="text">` | `aiData.sku` |
| Tags | `<input type="text">` | `aiData.tags.join(', ')` |

All fields are fully editable. The user should feel free to modify anything.

### Navigation
- Back → Step 2 (AI result discarded, must regenerate)
- Next: Set Price → Step 4 (enabled only after successful AI response)

---

## Step 4 — Price & Publish

### Goal
Let the user set the final price and publish the product.

### Summary Card
Shown at top of step, reads from edited Step 3 values:
- Product title
- Short description
- Thumbnail grid (first 5 images, 56×56px)

### Price Input
```
┌───────────────────────────────┐
│ $  │  185.00                  │
└───────────────────────────────┘
```
- Left side: `$` currency symbol (bordered separator)
- Right side: `<input type="number">` step 0.01
- Pre-filled with `aiData.suggestedPrice` if price field is empty
- AI suggestion shown as grey hint next to label: "— AI suggests $185"

### Publish Button
- Label: "🚀 Publish to WooCommerce"
- Triggers `POST /api/products`
- Disabled + text changes to "Publishing…" during request

### Success State
Green card:
```
✓ Product Published!
"Sony WH-1000XM4 Wireless Headphones" is now live in WooCommerce.
Product ID: 1042
```
After 2.5s: `confirm()` dialog — "Add another product?" → Yes resets app, No stays.

### Error State
Red card with error message. Publish button re-enabled for retry.

---

## State Model

```js
let currentStep = 1;           // 1–4
let uploadedImages = [];        // [{ id, url, width, height, mimeType }]
let aiData = null;             // { title, shortDescription, fullDescription,
                               //   suggestedPrice, currency, sku, tags }
```

State is in-memory only. Page refresh resets everything (intentional in v1).

### Reset
`resetApp()` clears all state and navigates to Step 1.
Called automatically after successful publish (with user confirmation).

---

## Steps Nav Visual States

| Step state | Circle colour | Label colour |
|------------|---------------|-------------|
| Future (not reached) | Light grey | Muted grey, 40% opacity |
| Active (current) | Primary purple | Primary purple |
| Done (past) | Green | Dark green |

---

## DB Status Badge

| State | Colour | Text |
|-------|--------|------|
| Checking | Semi-transparent white | `● Checking DB…` |
| Connected | Green on white | `● DB Connected` |
| Error | Red on white | `● DB Error` |

Polled once on page load. Not auto-retried.

---

## Colour Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#6c47ff` | Buttons, active state, focus rings |
| `--primary-dark` | `#5535e0` | Button hover |
| `--success` | `#22c55e` | Success states, done steps |
| `--danger` | `#ef4444` | Error states |
| `--bg` | `#f5f4ff` | Page background |
| `--surface` | `#ffffff` | Cards, inputs |
| `--border` | `#e2e0f0` | Input borders, dividers |
| `--text` | `#1a1730` | Body text |
| `--text-muted` | `#6b7280` | Hints, labels, optional text |

---

## Typography

- Font stack: system font (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- Base: 16px / 1.6 line-height
- Step titles: 1.2rem / 700
- Buttons: 0.95rem / 600
- Labels: 0.875rem / 600
- Hints: 0.8rem / 400 muted

---

## Accessibility

- All inputs have associated `<label>` elements
- Buttons have `aria-label` where icon-only
- Focus styles preserved (not suppressed)
- Touch targets ≥ 44px
- Colour contrast ≥ 4.5:1 for body text against backgrounds

---

## Future Considerations (not v1)

- Drag-to-reorder images
- Offline draft saving (localStorage)
- Dark mode toggle
- PWA / Add to Home Screen
- Multi-language UI
- Rich text editor for Full Description instead of raw HTML textarea
