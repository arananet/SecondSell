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

// ── Background removal (lazy-loaded ESM module) ──────────────────────────────
// @imgly/background-removal-node uses ONNX models that are downloaded on first
// call and cached. Wrapped in a lazy singleton so the download happens once.
let _removeBgFn = undefined;
async function getRemoveBgFn() {
  if (_removeBgFn !== undefined) return _removeBgFn;
  try {
    const mod = await import('@imgly/background-removal-node');
    _removeBgFn = mod.removeBackground ?? mod.default;
    console.log('Background removal module loaded.');
  } catch (e) {
    console.warn('Background removal unavailable:', e.message);
    _removeBgFn = null;
  }
  return _removeBgFn;
}

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
 *   1. Auto-rotate from EXIF (produces a correctly-oriented buffer)
 *   2. Optionally remove background → flatten alpha onto white
 *   3. Detect orientation → resize to exact target aspect ratio (cover + smart crop)
 *   4. Encode to WebP at quality 72
 *
 * Returns { data: Buffer, info: SharpOutputInfo, orientation, aspect }
 */
async function optimise(buffer, doRemoveBg = false) {
  // Materialise the EXIF-rotated buffer first so every downstream step
  // (including bg removal) works on display-orientation pixels.
  const rotatedBuffer = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(rotatedBuffer).metadata();
  const { w, h, orientation, aspect } = targetDimensions(meta.width, meta.height);

  let sourceBuffer = rotatedBuffer;

  if (doRemoveBg) {
    const removeBg = await getRemoveBgFn();
    if (removeBg) {
      try {
        const blob = await removeBg(rotatedBuffer);
        const pngBuf = Buffer.from(await blob.arrayBuffer());
        // Flatten PNG alpha channel onto a white background.
        // Sharp's .flatten() composites the alpha channel over the given colour.
        sourceBuffer = await sharp(pngBuf)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .toBuffer();
      } catch (e) {
        console.warn('Background removal failed, using original image:', e.message);
        // fall through with rotated original
      }
    }
  }

  const { data, info } = await sharp(sourceBuffer)
    // sourceBuffer is already correctly rotated; do NOT call .rotate() again.
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

  const doRemoveBg = req.body.removeBackground === '1';

  try {
    const results = [];

    for (const file of req.files) {
      const { data, info, orientation, aspect } = await optimise(file.buffer, doRemoveBg);
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

/**
 * POST /api/upload/rotate
 *
 * Rotates an already-uploaded image by the specified degrees (90, 180, 270).
 * Downloads the image from WP, rotates with Sharp, re-uploads, returns new image data.
 *
 * Body: { imageUrl: string, degrees: 90|180|270 }
 * Returns: { id, url, width, height, orientation, aspect, sizeKb }
 */
router.post('/rotate', async (req, res) => {
  const { imageUrl, degrees } = req.body;
  const validDegrees = [90, 180, 270];

  if (!imageUrl || !validDegrees.includes(degrees)) {
    return res.status(400).json({ error: 'imageUrl and degrees (90, 180, 270) are required' });
  }

  try {
    // Download the image from WP
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error(`Failed to download image (${imgResp.status})`);
    const arrayBuf = await imgResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // Rotate with Sharp, then re-encode as WebP
    const rotated = sharp(buffer).rotate(degrees);
    const meta = await rotated.metadata();
    // After rotation, metadata may not reflect the new dimensions yet, so
    // we get them from the output buffer.
    const { data, info } = await rotated
      .webp({ quality: 72, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const { w, h, orientation, aspect } = targetDimensions(info.width, info.height);

    const filename = `${uuidv4()}.webp`;
    const wpMedia = await uploadMedia(data, filename);

    res.json({
      id: wpMedia.id,
      url: wpMedia.url,
      width: wpMedia.width ?? info.width,
      height: wpMedia.height ?? info.height,
      orientation,
      aspect,
      sizeKb: Math.round(info.size / 1024),
    });
  } catch (err) {
    console.error('Rotate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
