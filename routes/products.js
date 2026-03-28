const express = require('express');
const router = express.Router();
const {
  createProduct,
  getOrCreateCategory,
  getCategories,
  getShippingMethods,
  skuExists,
} = require('../utils/wcApi');

/**
 * GET /api/products/categories
 * Returns all WooCommerce categories as [{ id, name, count }].
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await getCategories();
    res.json({ success: true, categories });
  } catch (err) {
    console.error('Failed to fetch categories:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/products/shipping-methods
 * Returns enabled WooCommerce shipping methods with their configured cost.
 */
router.get('/shipping-methods', async (req, res) => {
  try {
    const methods = await getShippingMethods();
    res.json({ success: true, methods });
  } catch (err) {
    console.error('Failed to fetch shipping methods:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/products
 *
 * Creates a WooCommerce simple product via the WC REST API.
 * The API handles all DB writes (wp_posts, wp_postmeta, wp_wc_product_meta_lookup),
 * cache clearing, and hook firing automatically.
 *
 * Body:
 * {
 *   title: string,                           required
 *   shortDescription: string,
 *   fullDescription: string,                 HTML
 *   price: string,                           e.g. "49.99"
 *   sku: string,
 *   images: [{ id, url, width, height }],    WP attachment IDs from /api/upload
 *   tags: string[]
 * }
 */
router.post('/', async (req, res) => {
  const {
    title,
    shortDescription = '',
    fullDescription = '',
    price = '',
    sku = '',
    quantity = 1,
    categoryId,
    images = [],
    tags = [],
    shippingMethodKey,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  if (!shippingMethodKey) {
    return res.status(400).json({ error: 'shippingMethodKey is required' });
  }

  try {
    // Check for duplicate SKU before doing anything else
    if (sku) {
      const existingId = await skuExists(sku);
      if (existingId) {
        return res.status(409).json({
          error: `SKU "${sku}" is already used by product #${existingId}. Please edit the SKU and try again.`,
          code: 'sku_duplicate',
          existingProductId: existingId,
        });
      }
    }

    // Use the provided category ID or fall back to "Others"
    const resolvedCategoryId = categoryId
      ? parseInt(categoryId, 10)
      : await getOrCreateCategory('Others');

    // Resolve selected shipping method to ensure it still exists on WC
    const shippingMethods = await getShippingMethods();
    const selectedShippingMethod = shippingMethods.find(m => m.key === shippingMethodKey);
    if (!selectedShippingMethod) {
      return res.status(400).json({ error: 'Selected shipping method is no longer available. Please reload and try again.' });
    }

    // Append standard second-hand disclaimer to the product description
    const disclaimer = `
<hr />
<p style="font-size:0.85em;color:#666;"><strong>Disclaimer — Sold As Is:</strong> All second-hand products are sold without any type of warranty. While we make every effort to ensure the information provided in this listing is accurate, some parts or components may not work as expected due to age and prior use. By purchasing this item, the buyer accepts full responsibility and acknowledges that no returns, refunds, or guarantees are offered.</p>`;
    const fullDescWithDisclaimer = fullDescription + disclaimer;

    // Create the product via WC REST API
    const product = await createProduct({
      title,
      shortDescription,
      fullDescription: fullDescWithDisclaimer,
      price,
      sku,
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
      images,
      tags,
      categoryId: resolvedCategoryId,
      shippingMethod: selectedShippingMethod,
    });

    res.json({
      success: true,
      productId: product.id,
      slug: product.slug,
      permalink: product.permalink,
      message: `Product "${title}" created with ID ${product.id}`,
    });
  } catch (err) {
    console.error('Product creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
