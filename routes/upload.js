const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { uploadMedia } = require('../utils/wcApi');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

/**
 * Detect image orientation and return target dimensions.
 *
 * Portrait  (height > width by > 20%) → 9:16  → 720 × 1280
 * Landscape (width > height by > 20%) → 16:9  → 1280 × 720
 * Square / near-square                → 1:1   → 1080 × 1080
 *
 * Uses Sharp's 'attention' strategy for smart centre-of-interest cropping
 * so the most important part of the photo is always preserved.
 */
function targetDimensions(width, height) {
  const ratio = width / height;

  if (ratio < 0.8) {
    // Portrait — taller than wide  →  9 : 16
    return { w: 720, h: 1280, orientation: 'portrait', aspect: '9:16' };
  }
  if (ratio > 1.25) {
    // Landscape — wider than tall  →  16 : 9
    return { w: 1280, h: 720, orientation: 'landscape', aspect: '16:9' };
  }
  // Square / near-square           →  1 : 1
  return { w: 1080, h: 1080, orientation: 'square', aspect: '1:1' };
}

/**
 * Optimise an image buffer:
 *   1. Auto-rotate from EXIF
 *   2. Detect orientation → resize to exact target aspect ratio (cover + smart crop)
 *   3. Encode to WebP at quality 80
 *
 * Returns { data: Buffer, info: SharpOutputInfo, orientation, aspect }
 */
async function optimise(buffer) {
  // Read metadata AFTER auto-rotate to get the display dimensions
  const meta = await sharp(buffer).rotate().metadata();
  const { w, h, orientation, aspect } = targetDimensions(meta.width, meta.height);

  const { data, info } = await sharp(buffer)
    .rotate()                                     // fix EXIF orientation first
    .resize(w, h, {
      fit: 'cover',                               // fill target box, crop excess
      position: sharp.strategy.attention,         // smart crop: keep faces / focal points
      withoutEnlargement: true,                   // never upscale a small image
    })
    .webp({ quality: 72, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return { data, info, orientation, aspect };
}

/**
 * POST /api/upload
 *
 * Accepts up to 10 images. Each is:
 *   - Auto-rotated
 *   - Resized to 9:16 (portrait), 16:9 (landscape) or 1:1 (square) with smart crop
 *   - Encoded as WebP quality 80
 *   - Uploaded to the WordPress media library
 *
 * Returns:
 * {
 *   images: [{
 *     id: number,       ← WP attachment post ID
 *     url: string,      ← canonical WP URL (wp-content/uploads/…)
 *     width: number,
 *     height: number,
 *     orientation: 'portrait' | 'landscape' | 'square',
 *     aspect: '9:16' | '16:9' | '1:1',
 *     sizeKb: number
 *   }]
 * }
 */
router.post('/', upload.array('images', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No images provided' });
  }

  try {
    const results = [];

    for (const file of req.files) {
      const { data, info, orientation, aspect } = await optimise(file.buffer);
      const filename = `${uuidv4()}.webp`;
      const wpMedia = await uploadMedia(data, filename);

      results.push({
        id: wpMedia.id,
        url: wpMedia.url,
        width: wpMedia.width ?? info.width,
        height: wpMedia.height ?? info.height,
        orientation,
        aspect,
        sizeKb: Math.round(info.size / 1024),
      });
    }

    res.json({ images: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
