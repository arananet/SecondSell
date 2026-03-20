/**
 * WordPress & WooCommerce REST API client.
 *
 * WP REST API  → image uploads    (/wp-json/wp/v2/media)
 * WC REST API  → product creation (/wp-json/wc/v3/products)
 *                category lookup  (/wp-json/wc/v3/products/categories)
 *
 * Auth:
 *  WP REST API  → Basic auth with Application Password (WP_USER:WP_APP_PASSWORD)
 *  WC REST API  → Basic auth with API keys (WC_CONSUMER_KEY:WC_CONSUMER_SECRET)
 */

function base() {
  const url = process.env.WP_URL?.replace(/\/$/, '');
  if (!url) throw new Error('WP_URL env var is required');
  return url;
}

function wpAuth() {
  const user = process.env.WP_USER;
  const pass = process.env.WP_APP_PASSWORD;
  if (!user || !pass) throw new Error('WP_USER and WP_APP_PASSWORD env vars are required');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

function wcAuth() {
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('WC_CONSUMER_KEY and WC_CONSUMER_SECRET env vars are required');
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

// ─── WordPress Media Library ───────────────────────────────────────────────

/**
 * Upload an image buffer to the WordPress media library.
 * Returns { id, url, width, height } where id is the WP attachment post ID.
 */
async function uploadMedia(buffer, filename) {
  const resp = await fetch(`${base()}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: wpAuth(),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'image/webp',
    },
    body: buffer,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`WP media upload failed (${resp.status}): ${body.slice(0, 400)}`);
  }

  const data = await resp.json();
  return {
    id: data.id,
    url: data.source_url,
    width: data.media_details?.width,
    height: data.media_details?.height,
  };
}

// ─── WooCommerce Categories ────────────────────────────────────────────────

/**
 * Find or create a WooCommerce product category by name.
 * Returns the category ID.
 */
async function getOrCreateCategory(name) {
  const auth = wcAuth();
  const categoryBase = `${base()}/wp-json/wc/v3/products/categories`;

  // Search for existing category
  const searchResp = await fetch(
    `${categoryBase}?search=${encodeURIComponent(name)}&per_page=20`,
    { headers: { Authorization: auth } }
  );

  if (searchResp.ok) {
    const cats = await searchResp.json();
    const match = cats.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;
  }

  // Create it
  const createResp = await fetch(categoryBase, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!createResp.ok) {
    const body = await createResp.text();
    throw new Error(`WC category creation failed (${createResp.status}): ${body.slice(0, 300)}`);
  }

  const cat = await createResp.json();
  return cat.id;
}

// ─── WooCommerce Products ──────────────────────────────────────────────────

/**
 * Create a simple WooCommerce product via the REST API.
 *
 * The WC REST API handles all internals automatically:
 *   - wp_posts, wp_postmeta insertions
 *   - wp_wc_product_meta_lookup population
 *   - Transient/object cache clearing
 *   - All WooCommerce action/filter hooks
 *
 * @param {object} opts
 * @param {string}   opts.title
 * @param {string}   opts.shortDescription  - post_excerpt
 * @param {string}   opts.fullDescription   - post_content (HTML)
 * @param {string}   opts.price             - numeric string e.g. "49.99"
 * @param {string}   opts.sku
 * @param {Array}    opts.images            - [{ id: wpAttachmentId, url }]
 * @param {string[]} opts.tags              - tag name strings
 * @param {number}   opts.categoryId        - WC category ID
 *
 * @returns {object} WooCommerce product object (full API response)
 */
async function createProduct({ title, shortDescription, fullDescription, price, sku, quantity, images, tags, categoryId }) {
  const payload = {
    name: title,
    type: 'simple',
    status: 'publish',
    description: fullDescription || '',
    short_description: shortDescription || '',
    regular_price: price ? String(parseFloat(price).toFixed(2)) : '',
    sku: sku || '',
    manage_stock: true,
    stock_quantity: quantity || 1,
    stock_status: 'instock',
    backorders: 'no',
    sold_individually: false,
    virtual: false,
    downloadable: false,
    tax_status: 'taxable',
    categories: categoryId ? [{ id: categoryId }] : [],
    tags: (tags || []).filter(Boolean).map(t => ({ name: t.trim() })),
    // images[0] becomes the featured image; the rest go into the product gallery
    images: (images || []).map(img => ({
      id: img.id,
      src: img.url,
      name: img.url?.split('/').pop() || '',
      alt: title,
    })),
  };

  const resp = await fetch(`${base()}/wp-json/wc/v3/products`, {
    method: 'POST',
    headers: {
      Authorization: wcAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`WC product creation failed (${resp.status}): ${body.slice(0, 500)}`);
  }

  return resp.json();
}

/**
 * Fetch a WooCommerce product (for health/verification checks).
 */
async function getProduct(productId) {
  const resp = await fetch(`${base()}/wp-json/wc/v3/products/${productId}`, {
    headers: { Authorization: wcAuth() },
  });
  if (!resp.ok) return null;
  return resp.json();
}

/**
 * Fetch all WooCommerce product categories (sorted by name).
 * Returns [{ id, name, count }]
 */
async function getCategories() {
  const auth = wcAuth();
  let all = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const resp = await fetch(
      `${base()}/wp-json/wc/v3/products/categories?per_page=${perPage}&page=${page}&orderby=name&order=asc&hide_empty=false`,
      { headers: { Authorization: auth } }
    );
    if (!resp.ok) break;
    const batch = await resp.json();
    if (!batch.length) break;
    all = all.concat(batch);
    if (batch.length < perPage) break;
    page++;
  }

  return all.map(c => ({ id: c.id, name: c.name, count: c.count }));
}

/**
 * Check whether a SKU already exists in WooCommerce.
 * Returns the existing product ID if found, or null if free.
 */
async function skuExists(sku) {
  if (!sku) return null;
  const resp = await fetch(
    `${base()}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}&per_page=1`,
    { headers: { Authorization: wcAuth() } }
  );
  if (!resp.ok) return null;
  const products = await resp.json();
  return products.length > 0 ? products[0].id : null;
}

module.exports = { uploadMedia, getOrCreateCategory, getCategories, skuExists, createProduct, getProduct };
