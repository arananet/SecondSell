/**
 * Minimal PHP serialize implementation for WordPress attachment metadata.
 */
function phpSerialize(value) {
  if (value === null || value === undefined) return 'N;';
  if (typeof value === 'boolean') return `b:${value ? 1 : 0};`;
  if (typeof value === 'number' && Number.isInteger(value)) return `i:${value};`;
  if (typeof value === 'number') return `d:${value};`;
  if (typeof value === 'string') {
    const bytes = Buffer.byteLength(value, 'utf8');
    return `s:${bytes}:"${value}";`;
  }
  if (Array.isArray(value)) {
    const items = value.map((v, i) => phpSerialize(i) + phpSerialize(v)).join('');
    return `a:${value.length}:{${items}}`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    const items = keys.map(k => phpSerialize(k) + phpSerialize(value[k])).join('');
    return `a:${keys.length}:{${items}}`;
  }
  return 'N;';
}

function buildAttachmentMeta(width, height, filePath, mimeType = 'image/jpeg') {
  return phpSerialize({
    width,
    height,
    file: filePath,
    sizes: {},
    image_meta: {
      aperture: '0',
      credit: '',
      camera: '',
      caption: '',
      created_timestamp: '0',
      copyright: '',
      focal_length: '0',
      iso: '0',
      shutter_speed: '0',
      title: '',
      orientation: '0',
      keywords: [],
    },
  });
}

module.exports = { phpSerialize, buildAttachmentMeta };
