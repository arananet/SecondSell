function makeSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

function uniqueSlug(base) {
  const ts = Date.now().toString(36);
  return `${makeSlug(base)}-${ts}`;
}

module.exports = { makeSlug, uniqueSlug };
