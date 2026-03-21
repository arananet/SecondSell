const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

router.post('/describe', async (req, res) => {
  const { productName, condition, userContext, imageUrls = [] } = req.body;

  if (!productName) {
    return res.status(400).json({ error: 'productName is required' });
  }

  const conditionLabels = {
    new: 'Brand New (never used)',
    like_new: 'Like New (used once or twice, no signs of wear)',
    good: 'Good (light signs of use, fully functional)',
    fair: 'Fair (visible wear, fully functional)',
    poor: 'Poor (heavy wear or minor issues, still functional)',
  };

  const conditionText = conditionLabels[condition] || condition || 'Unknown';

  const systemPrompt = `You are an expert product copywriter specializing in second-hand marketplace listings.
You research products thoroughly and write compelling, honest descriptions that help items sell quickly.
You always respond with valid JSON only — no markdown, no extra text.`;

  const userPrompt = `Create a WooCommerce product listing for a second-hand item.

Product: ${productName}
Condition: ${conditionText}
Seller notes: ${userContext || 'None provided'}
${imageUrls.length > 0 ? `Photos provided: ${imageUrls.length} image(s)` : ''}

Research this product's specifications, typical features, and market value. Combine that knowledge with the seller's notes to produce a compelling listing.

Return ONLY this JSON (no markdown fences):
{
  "title": "Short punchy product title under 60 chars",
  "shortDescription": "2-3 sentence compelling summary under 160 chars for SEO",
  "fullDescription": "Full HTML description with sections: Overview, Key Specifications, Condition Details, What's Included. Use <h3>, <ul>, <p> tags. Min 200 words.",
  "suggestedPrice": 0,
  "currency": "USD",
  "sku": "auto-generated SKU suggestion e.g. SH-BRANDMODEL-001",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const raw = message.content[0].text.trim();

    // Strip any accidental markdown fences
    const jsonText = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    const data = JSON.parse(jsonText);
    res.json({ success: true, data });
  } catch (err) {
    console.error('AI error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
