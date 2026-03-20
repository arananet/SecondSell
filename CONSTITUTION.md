# CONSTITUTION.md — SecondSell Project Constitution

> These are the immutable principles governing every change to SecondSell.
> Any pull request, AI suggestion, or code modification that violates these
> principles must be rejected, regardless of other merits.

---

## Article I — Data Integrity

**§1.1 WooCommerce REST API is the only product write path.**
Products, categories, and all associated metadata are created exclusively via
`POST /wp-json/wc/v3/products` and related WC REST API endpoints.
No direct SQL INSERTs or UPDATEs to WordPress/WooCommerce tables are permitted.

**§1.2 No destructive operations.**
This application performs only read and create operations via the WC REST API.
Product deletion, bulk updates, or schema changes are out of scope without
explicit documented justification.

**§1.3 WordPress Media Library for images.**
All product images are uploaded to the WordPress media library via
`POST /wp-json/wp/v2/media`. Images are never stored locally on the app server.

**§1.4 No raw queries with string interpolation.**
If any SQL is used (e.g. health checks), all queries use parameterised prepared statements.
SQL injection is an unconditional disqualifier for any contribution.

---

## Article II — Security

**§2.1 Zero credential exposure.**
Database credentials, API keys, and tokens must only be read from environment variables.
They must never be:
- Hardcoded in source files
- Logged to stdout/stderr
- Returned in API responses
- Committed to version control

**§2.2 Input validation at every boundary.**
All user input (file uploads, form fields, JSON body) must be validated and sanitised
before it touches any external API or the filesystem. Multer enforces file type/size.
Express limits body size. These are non-negotiable.

**§2.3 Uploads processed by Sharp.**
Uploaded files are processed through Sharp (WebP conversion, resize, crop) before
being forwarded to the WordPress media library.
Raw uploaded bytes are never forwarded directly.

**§2.4 Cookie-based session auth.**
The login gate uses HMAC-SHA256 session tokens stored in an HttpOnly, SameSite=Strict
cookie (`ss_session`). Credentials are compared using timing-safe equality.
The `BASIC_AUTH_PASS` env var must be quoted if it contains special characters.

---

## Article III — Product Quality

**§3.1 Every product must have a title.**
A product cannot be created without a non-empty title. Enforced at the API level.

**§3.2 Category is user-selectable, defaults to "Others".**
Users choose a WooCommerce category from a live dropdown populated by
`GET /api/products/categories`. If none is selected, "Others" is found or created
dynamically. Its ID must never be hard-coded.

**§3.3 All products are simple products.**
The `type: "simple"` field is mandatory. Variable, grouped, or external product
types are out of scope.

**§3.4 Images are always optimised.**
No raw camera image is stored or linked in WooCommerce.
Every image passes through Sharp: converted to WebP, smart-cropped to orientation
aspect ratio, compressed at quality 80. This is the single source of truth for
image processing parameters.

**§3.5 Stock is managed.**
Products are created with `manage_stock: true` and `stock_quantity` set to the
user-specified quantity (default 1).

---

## Article IV — AI Usage

**§4.1 Model is claude-sonnet-4-6.**
The Anthropic model used for description generation is `claude-sonnet-4-6`.
Model changes require an update to this Constitution, `CLAUDE.md`, and `specs/02-ai-description.md`.

**§4.2 AI output is always editable.**
AI-generated content (title, descriptions, SKU, tags) is presented to the user for review
and editing before any data is committed via the WC REST API.
AI output is never published automatically without user confirmation.

**§4.3 AI describes, humans decide.**
The AI provides suggestions — price, description, tags. The user retains final authority.
The app must never auto-publish on AI completion.

**§4.4 Structured output contract.**
The AI route must always return a JSON object matching:
```typescript
{
  title: string;            // max 60 chars
  shortDescription: string; // max 160 chars
  fullDescription: string;  // HTML, min 200 words
  suggestedPrice: number;
  currency: string;         // "USD"
  sku: string;
  tags: string[];
}
```
If the AI response cannot be parsed as this shape, the route returns HTTP 500
with a human-readable error. It must never return malformed data silently.

**§4.5 Vision analysis.**
When `imageUrls` are provided, they are included as vision content in the Claude
message so the model can analyse the actual product photos. This improves
accuracy of condition assessment and accessory identification.

---

## Article V — Frontend

**§5.1 Mobile-first, always.**
All CSS is written mobile-first (smallest viewport first, `min-width` media queries upward).
The canonical test viewport is 375×667px (iPhone SE). Features must work at this size.
Desktop enhancements are additive.

**§5.2 No frontend framework dependency.**
The frontend is vanilla HTML, CSS, and JavaScript.
React, Vue, Svelte, Angular, or any component framework must not be added without
a formal decision recorded in this Constitution.

**§5.3 No build step for the frontend.**
Files in `public/` are served as-is by Express. No Webpack, Vite, Parcel, or
similar bundler is permitted without explicit justification and Constitution amendment.

**§5.4 Progressive UX.**
The UI guides users through a linear 4-step flow.
Step navigation must prevent proceeding without required data.
Every async operation shows a loading state. Every error is displayed to the user.
No `alert()`, `confirm()`, or `prompt()` calls — use toast notifications and custom modals.

**§5.5 UI/UX skill is mandatory.**
Before any frontend change, the `.claude/skills/ui-ux-pro-max/SKILL.md` skill file
must be read and its rules applied. Priority order:
Accessibility → Touch/Interaction → Style → Layout → Typography.

**§5.6 Accessibility is non-negotiable.**
- All touch targets ≥ 44×44 px (Apple HIG / WCAG 2.5.5)
- `viewport` meta must never disable zoom (`maximum-scale` must not be set)
- All interactive icons must have `aria-label` or visible text labels
- Decorative SVGs must have `aria-hidden="true"`
- Dynamic content regions must use `aria-live` appropriately
- `prefers-reduced-motion` must disable all animations
- `:focus-visible` focus rings must be visible on all interactive elements

**§5.7 No emoji as icons.**
All interactive icons must be inline SVG (Lucide-style: stroke, no fill).
Emoji characters must never be used as UI icons.

---

## Article VI — Infrastructure

**§6.1 Railway is the deployment target.**
The app must remain deployable on Railway via Nixpacks with no additional configuration
beyond environment variables.

**§6.2 No persistent local storage required.**
All uploaded images are stored in the WordPress media library via WP REST API.
The app requires no Railway Volume or persistent filesystem.

**§6.3 Trust proxy.**
`app.set('trust proxy', 1)` is required for correct `req.secure` detection behind
Railway's reverse proxy (used for Secure cookie flag on HTTPS).

> These are the immutable principles governing every change to SecondSell.
> Any pull request, AI suggestion, or code modification that violates these
> principles must be rejected, regardless of other merits.

---

## Article I — Data Integrity

**§1.1 Production database is sacred.**
This app writes directly to a live WooCommerce/WordPress production database.
Every write operation must be wrapped in a MySQL transaction. Any failure mid-write
must trigger a full rollback. Partial product records are never acceptable.

**§1.2 No destructive operations.**
This application performs only INSERT and SELECT operations.
UPDATE or DELETE are only permitted for:
- Incrementing `term_taxonomy.count` after a new relationship is added
- No other mutations are allowed without explicit documented justification.

**§1.3 Schema correctness.**
Every DB write must produce a record that WooCommerce considers valid.
Required fields must never be omitted. The insertion spec in `specs/03-woocommerce-db.md`
is the authoritative definition of a valid product record.

**§1.4 No raw queries with string interpolation.**
All SQL uses parameterised prepared statements (`conn.execute(sql, [params])`).
SQL injection is an unconditional disqualifier for any contribution.

---

## Article II — Security

**§2.1 Zero credential exposure.**
Database credentials, API keys, and tokens must only be read from environment variables.
They must never be:
- Hardcoded in source files
- Logged to stdout/stderr
- Returned in API responses
- Committed to version control

**§2.2 Input validation at every boundary.**
All user input (file uploads, form fields, JSON body) must be validated and sanitised
before it touches the database or the filesystem. Multer enforces file type/size.
Express limits body size. SQL uses prepared statements. These are non-negotiable.

**§2.3 Uploads are sandboxed.**
Uploaded files are processed through Sharp before being saved.
Raw uploaded bytes are never written directly to disk.
The `/uploads` directory is served as static files with no directory listing.

**§2.4 No admin credentials in this app.**
This app does not handle WordPress admin usernames, passwords, or application passwords.
WooCommerce REST API credentials must never be added to this codebase.

---

## Article III — Product Quality

**§3.1 Every product must have a title.**
A product cannot be created without a non-empty title. This is enforced at the API level.

**§3.2 Products belong to "Others".**
Every product created through this app is assigned to the WooCommerce `product_cat`
term named "Others". This category is found or created dynamically — its term_taxonomy_id
must never be hard-coded.

**§3.3 All products are simple products.**
The `product_type` taxonomy relationship to "simple" is mandatory for every product.
Variable, grouped, or external product types are out of scope.

**§3.4 Images are always optimised.**
No raw camera image is stored or linked in WooCommerce.
Every image passes through Sharp: converted to WebP, resized to ≤1200px on longest edge,
compressed at quality 82. This is the single source of truth for image processing parameters.

---

## Article IV — AI Usage

**§4.1 Model is claude-sonnet-4-6.**
The Anthropic model used for description generation is `claude-sonnet-4-6`.
Model changes require an update to this Constitution, `CLAUDE.md`, and `specs/02-ai-description.md`.

**§4.2 AI output is always editable.**
AI-generated content (title, descriptions, SKU, tags) is presented to the user for review
and editing before any data is committed to the database.
AI output is never published automatically without user confirmation.

**§4.3 AI describes, humans decide.**
The AI provides suggestions — price, description, tags. The user retains final authority.
The app must never auto-publish on AI completion.

**§4.4 Structured output contract.**
The AI route must always return a JSON object matching:
```typescript
{
  title: string;           // max 60 chars
  shortDescription: string; // max 160 chars
  fullDescription: string; // HTML, min 200 words
  suggestedPrice: number;
  currency: string;        // "USD"
  sku: string;
  tags: string[];
}
```
If the AI response cannot be parsed as this shape, the route returns HTTP 500
with a human-readable error. It must never return malformed data silently.

---

## Article V — Frontend

**§5.1 Mobile-first, always.**
All CSS is written mobile-first (smallest viewport first, `min-width` media queries upward).
The canonical test viewport is 375×667px (iPhone SE). Features must work at this size.
Desktop enhancements are additive.

**§5.2 No frontend framework dependency.**
The frontend is vanilla HTML, CSS, and JavaScript.
React, Vue, Svelte, Angular, or any component framework must not be added without
a formal decision recorded in this Constitution.

**§5.3 No build step for the frontend.**
Files in `public/` are served as-is by Express. No Webpack, Vite, Parcel, or
similar bundler is permitted without explicit justification and Constitution amendment.

**§5.4 Progressive UX.**
The UI guides users through a linear 4-step flow.
Step navigation must prevent proceeding without required data.
Every async operation shows a loading state. Every error is displayed to the user.

---

## Article VI — Infrastructure

**§6.1 Railway is the deployment target.**
The app must remain deployable on Railway via Nixpacks with no additional configuration
beyond environment variables and a Volume at `/uploads`.

**§6.2 Images persist via Railway Volume.**
Uploaded and processed images are stored in `/uploads`.
This directory must be a Railway Volume mount in production.
The app must not assume this directory is ephemeral.

**§6.3 APP_URL must be configured.**
The `APP_URL` environment variable is the canonical base URL for serving images.
It must always be set to the public Railway domain.
Relative URLs for images are never acceptable in WooCommerce meta.

**§6.4 Port is dynamic.**
The app listens on `process.env.PORT || 3000`. The port is never hardcoded elsewhere.

---

## Article VII — Code Standards

**§7.1 No over-engineering.**
Each route does one thing. Business logic is extracted to `utils/` only when used
in more than one place. Abstractions are introduced to solve existing problems,
never to anticipate hypothetical future ones.

**§7.2 Dependencies are deliberate.**
Every npm package added must be justified. The current dependency list is the minimum
necessary. `devDependencies` must not reach production.

**§7.3 Errors are logged server-side, summarised client-side.**
Full error details (stack traces, SQL errors) are logged to `console.error` on the server.
API responses return a short human-readable `{ error: string }` — never a raw stack trace.

**§7.4 Spec before implementation.**
Any new feature or significant change must have a spec entry in `specs/` before
implementation begins. The spec is the contract; the code is the fulfilment.

---

## Amendment Process

To amend this Constitution:
1. Open a pull request with changes to `CONSTITUTION.md`
2. Describe the motivation and impact in the PR description
3. Update any affected spec files simultaneously
4. The amendment takes effect only after PR is merged to the main branch
