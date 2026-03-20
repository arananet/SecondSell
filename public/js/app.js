/* ====================================================
   SecondSell — Frontend App
   ==================================================== */

let currentStep    = 1;
let uploadedImages = [];  // { id, url, width, height, orientation, aspect, sizeKb }
let pendingUploads = 0;   // number of images currently uploading
let aiData         = null;
let bgRemovalEnabled = false; // whether to run server-side background removal

function onBgRemovalToggle(checked) {
  bgRemovalEnabled = checked;
  const row = document.getElementById('bg-removal-row');
  if (row) row.classList.toggle('toggle-row--on', checked);
}

// ─── API helper ───────────────────────────────────────
// Wraps fetch() and redirects to /login.html on 401.
// Cookies (session) are sent automatically by the browser for same-origin requests.
async function apiFetch(url, options = {}) {
  const resp = await fetch(url, options);
  if (resp.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Session expired');
  }
  return resp;
}

// ─── Logout ──────────────────────────────────────────
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
}

// ─── Toast notifications ─────────────────────────────
function showToast(message, type = 'error') {
  const prev = document.querySelector('.toast');
  if (prev) prev.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── API health badge ─────────────────────────────────
let _healthData = null;

(async function checkHealth() {
  const badge = document.getElementById('api-status');
  if (!badge) return;
  badge.style.cursor = 'pointer';
  badge.title = 'Click for API details';
  try {
    const r = await fetch('/api/health'); // always exempt from auth
    let data;
    try { data = await r.json(); } catch { data = { fetchError: `HTTP ${r.status}` }; }
    _healthData = data;
    badge.textContent = data.status === 'ok' ? '\u25cf Connected' : '\u25cf Degraded';
    badge.className   = `badge ${data.status === 'ok' ? 'badge-ok' : 'badge-error'}`;
  } catch (e) {
    _healthData = { fetchError: e.message };
    badge.textContent = '\u25cf Offline';
    badge.className   = 'badge badge-error';
  }
})();

function showHealthDebug() {
  const existing = document.getElementById('health-modal');
  if (existing) { existing.remove(); return; }

  const d = _healthData || {};
  const row = (label, val, isErr) =>
    `<tr${isErr ? ' class="debug-row-error"' : ''}><td>${escHtml(label)}</td><td>${escHtml(String(val ?? '\u2014'))}</td></tr>`;

  const rows = [
    row('Status',    d.status,    d.status && d.status !== 'ok'),
    row('WP URL',    d.wpUrl,     !d.wpUrl || d.wpUrl === 'not configured'),
    row('WP API',    d.wpApi,     d.wpApi && !d.wpApi.includes('reachable')),
    d.wpApiError ? row('WP Error', d.wpApiError, true) : '',
    row('WC API',    d.wcApi,     d.wcApi === 'not configured'),
    row('Claude',    d.claude,    d.claude === 'not configured'),
    d.fetchError ? row('Fetch Error', d.fetchError, true) : '',
  ].filter(Boolean).join('');

  const modal = document.createElement('div');
  modal.id = 'health-modal';
  modal.innerHTML = `
    <div id="health-modal-backdrop"></div>
    <div id="health-modal-box">
      <div id="health-modal-header">
        <strong>API Status</strong>
        <button id="health-modal-close" onclick="document.getElementById('health-modal').remove()">&#x2715;</button>
      </div>
      <table id="health-modal-table"><tbody>${rows}</tbody></table>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('health-modal-backdrop').addEventListener('click', () => modal.remove());
}

// ─── Load WooCommerce categories ────────────────────────────
async function loadCategories() {
  const sel = document.getElementById('product-category');
  if (!sel) return;
  try {
    const resp = await apiFetch('/api/products/categories');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const { categories } = await resp.json();

    sel.innerHTML = '';

    // Find "Others" to use as default; if missing we’ll show it as first option
    const others = categories.find(c => c.name.toLowerCase() === 'others');

    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + (c.count ? ` (${c.count})` : '');
      if (others ? c.id === others.id : c.name.toLowerCase() === 'others') opt.selected = true;
      sel.appendChild(opt);
    });

    // If "Others" wasn’t in the list, add it as a fallback option and select it
    if (!others) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Others (will be created)';
      opt.selected = true;
      sel.insertBefore(opt, sel.firstChild);
    }
  } catch (err) {
    sel.innerHTML = '<option value="">Others (default)</option>';
    console.warn('Could not load categories:', err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('api-status')?.addEventListener('click', showHealthDebug);
  loadCategories();
});

// ─── Step navigation ──────────────────────────────────
function goToStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    if (sn === n) s.classList.add('active');
    if (sn < n)  s.classList.add('done');
  });
  document.getElementById(`step-${n}`).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  currentStep = n;
  if (n === 4) buildSummary();
}

// ─── STEP 1: Photo capture / upload ──────────────────

// ── In-browser camera (MediaDevices API) ───────────────────────────────────
// Using getUserMedia() keeps the camera inside the browser page, completely
// avoiding the Android/iOS lifecycle bug where the OS kills/discards the browser
// tab while an external camera app is in the foreground.
// Falls back to a file-input if the API is unavailable or permission is denied.

let _cameraStream  = null;
let _cameraFacing  = 'environment'; // 'environment' = rear, 'user' = front

async function triggerCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    // API not available (insecure context, old browser) — use file input fallback
    _fallbackCameraInput();
    return;
  }
  try {
    await _startCameraStream(_cameraFacing);
  } catch (err) {
    console.warn('getUserMedia failed, falling back to file input:', err.message);
    _fallbackCameraInput();
  }
}

function _fallbackCameraInput() {
  const input = document.getElementById('camera-input');
  input.value = '';
  input.click();
}

async function _startCameraStream(facingMode) {
  // Stop any existing stream first
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
  _cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  const video = document.getElementById('camera-preview');
  video.srcObject = _cameraStream;
  document.getElementById('camera-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

async function flipCamera() {
  _cameraFacing = _cameraFacing === 'environment' ? 'user' : 'environment';
  try {
    await _startCameraStream(_cameraFacing);
  } catch {
    // device only has one camera — flip back silently
    _cameraFacing = _cameraFacing === 'environment' ? 'user' : 'environment';
  }
}

function closeCameraModal() {
  document.getElementById('camera-modal').classList.add('hidden');
  document.body.style.overflow = '';
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

function capturePhoto() {
  const video  = document.getElementById('camera-preview');
  const canvas = document.getElementById('camera-canvas');
  if (!video.videoWidth) { showToast('Camera not ready yet — try again.'); return; }
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  closeCameraModal();
  canvas.toBlob(blob => {
    if (!blob) { showToast('Failed to capture photo. Please try again.'); return; }
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    uploadSingleImage(file);
  }, 'image/jpeg', 0.92);
}

// ── Gallery & file-input fallback ───────────────────────────────────────────
function triggerGallery() {
  const input = document.getElementById('gallery-input');
  input.value = '';
  input.click();
}

document.getElementById('camera-input').addEventListener('change',  handleFiles);
document.getElementById('gallery-input').addEventListener('change', handleFiles);

function handleFiles(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const canAdd = 10 - uploadedImages.length - pendingUploads;
  if (canAdd <= 0) {
    showToast('Maximum 10 photos reached.');
    return;
  }

  // Upload each file independently.
  // Camera (single file): shows spinner, user can take next shot right away.
  // Gallery (multiple files): each gets its own spinner, uploads run in parallel.
  files.slice(0, canAdd).forEach(file => uploadSingleImage(file));
}

async function uploadSingleImage(file) {
  pendingUploads++;
  renderPhotoGrid();
  updateNextButton();

  const formData = new FormData();
  formData.append('images', file);
  formData.append('removeBackground', bgRemovalEnabled ? '1' : '0');

  try {
    const resp = await apiFetch('/api/upload', { method: 'POST', body: formData });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed (${resp.status})`);
    }

    const data = await resp.json();
    uploadedImages.push(data.images[0]);
  } catch (err) {
    if (err.message === 'Session expired') return;
    showToast(`Upload failed: ${err.message}`);
    console.error('Upload error:', err);
  } finally {
    pendingUploads--;
    renderPhotoGrid();
    updateNextButton();
    setStatus(
      uploadedImages.length > 0
        ? `${uploadedImages.length} photo${uploadedImages.length > 1 ? 's' : ''} ready`
        : pendingUploads > 0 ? 'Uploading\u2026' : ''
    );
  }
}

function renderPhotoGrid() {
  const grid = document.getElementById('photo-preview-grid');
  grid.innerHTML = '';

  // Uploaded images with remove button
  uploadedImages.forEach((img, idx) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.innerHTML = `
      <img src="${escHtml(img.url)}" alt="Product photo ${idx + 1}" loading="lazy" />
      ${idx === 0 ? '<span class="badge-first">Cover</span>' : ''}
      <button class="remove-btn" onclick="removePhoto(${idx})" aria-label="Remove photo">&#x2715;</button>
    `;
    grid.appendChild(div);
  });

  // Loading placeholders for in-flight uploads
  for (let i = 0; i < pendingUploads; i++) {
    const div = document.createElement('div');
    div.className = 'photo-thumb photo-thumb--loading';
    div.innerHTML = '<div class="thumb-spinner"></div>';
    grid.appendChild(div);
  }
}

function removePhoto(idx) {
  uploadedImages.splice(idx, 1);
  renderPhotoGrid();
  updateNextButton();
  if (uploadedImages.length === 0 && pendingUploads === 0) setStatus('');
}

function updateNextButton() {
  document.getElementById('btn-step1-next').disabled =
    uploadedImages.length === 0 && pendingUploads === 0;
}

function setStatus(msg) {
  document.getElementById('upload-status').textContent = msg;
}

// ─── Confirm modal ──────────────────────────────────────
function showConfirmModal({ title, message, okLabel = 'OK', cancelLabel = 'Cancel', onOk, onCancel } = {}) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-modal-title').textContent   = title   || '';
  document.getElementById('confirm-modal-message').textContent = message || '';
  document.getElementById('confirm-modal-ok').textContent      = okLabel;
  document.getElementById('confirm-modal-cancel').textContent  = cancelLabel;

  const okBtn     = document.getElementById('confirm-modal-ok');
  const cancelBtn = document.getElementById('confirm-modal-cancel');

  function close() {
    modal.classList.add('hidden');
    okBtn.replaceWith(okBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  }

  document.getElementById('confirm-modal-ok').addEventListener('click', () => { close(); onOk?.(); });
  document.getElementById('confirm-modal-cancel').addEventListener('click', () => { close(); onCancel?.(); });

  modal.classList.remove('hidden');
}

// ─── STEP 2 → 3: Generate AI description ───────────────
async function generateDescription() {
  const name = document.getElementById('product-name').value.trim();
  if (!name) {
    showToast('Please enter a product name.');
    document.getElementById('product-name').focus();
    return;
  }

  const condition = document.getElementById('product-condition').value;
  const context   = document.getElementById('product-context').value.trim();

  goToStep(3);

  const loading = document.getElementById('ai-loading');
  const result  = document.getElementById('ai-result');
  const nextBtn = document.getElementById('btn-step3-next');

  loading.classList.remove('hidden');
  result.classList.add('hidden');
  nextBtn.disabled = true;

  try {
    const resp = await apiFetch('/api/ai/describe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        productName: name,
        condition,
        userContext: context,
        imageUrls:   uploadedImages.map(i => i.url),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'AI generation failed');
    }

    const data = await resp.json();
    aiData = data.data;

    document.getElementById('edit-title').value      = aiData.title            || name;
    document.getElementById('edit-short-desc').value = aiData.shortDescription || '';
    document.getElementById('edit-full-desc').value  = aiData.fullDescription  || '';
    document.getElementById('edit-sku').value        = aiData.sku              || '';
    document.getElementById('edit-tags').value       = (aiData.tags || []).join(', ');

    loading.classList.add('hidden');
    result.classList.remove('hidden');
    nextBtn.disabled = false;
  } catch (err) {
    if (err.message === 'Session expired') return;
    loading.classList.add('hidden');
    showToast(`Failed to generate description: ${err.message}`);
    goToStep(2);
    console.error(err);
  }
}

// ─── STEP 4: Summary & Publish ────────────────────────
function buildSummary() {
  const title     = document.getElementById('edit-title').value
                 || document.getElementById('product-name').value;
  const shortDesc = document.getElementById('edit-short-desc').value;

  if (aiData?.suggestedPrice) {
    document.getElementById('suggested-price-label').textContent =
      `\u2014 AI suggests $${aiData.suggestedPrice}`;
    if (!document.getElementById('product-price').value) {
      document.getElementById('product-price').value = aiData.suggestedPrice;
    }
  }

  const thumbs = uploadedImages
    .slice(0, 5)
    .map(i => `<img src="${escHtml(i.url)}" alt="" />`)
    .join('');

  document.getElementById('product-summary').innerHTML = `
    <h3>${escHtml(title)}</h3>
    <p>${escHtml(shortDesc)}</p>
    ${thumbs ? `<div class="summary-thumbs">${thumbs}</div>` : ''}
  `;
}

async function publishProduct() {
  const title = document.getElementById('edit-title').value.trim();
  if (!title) { showToast('Product title is required.'); return; }

  const price   = document.getElementById('product-price').value;
  const tagsRaw = document.getElementById('edit-tags').value;
  const tags    = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  const btn       = document.getElementById('btn-publish');
  const resultDiv = document.getElementById('publish-result');

  btn.disabled    = true;
  btn.textContent = 'Publishing\u2026';
  resultDiv.classList.add('hidden');

  try {
    const resp = await apiFetch('/api/products', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        title,
        shortDescription: document.getElementById('edit-short-desc').value,
        fullDescription:  document.getElementById('edit-full-desc').value,
        price,
        sku:        document.getElementById('edit-sku').value,
        quantity:   parseInt(document.getElementById('product-quantity').value, 10) || 1,
        categoryId: document.getElementById('product-category').value || undefined,
        images:     uploadedImages,
        tags,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    // SKU conflict — send user back to Step 3 to fix it
    if (resp.status === 409 && data.code === 'sku_duplicate') {
      showToast(data.error, 'error');
      goToStep(3);
      document.getElementById('edit-sku').focus();
      return;
    }

    if (!resp.ok || !data.success) throw new Error(data.error || 'Publish failed');

    resultDiv.innerHTML = `
      <div class="result-success">
        <h3>&#10003; Product Published!</h3>
        <p><strong>${escHtml(title)}</strong> is now live in WooCommerce.</p>
        <p style="margin-top:6px;font-size:0.8rem;opacity:0.7">Product ID: ${data.productId}</p>
      </div>
    `;
    resultDiv.classList.remove('hidden');

    setTimeout(() => {
      showConfirmModal({
        title:       '🎉 Product Published!',
        message:     'Would you like to add another product?',
        okLabel:     'Add Another',
        cancelLabel: 'Done',
        onOk:        resetApp,
      });
    }, 2500);
  } catch (err) {
    if (err.message === 'Session expired') return;
    resultDiv.innerHTML = `
      <div class="result-error">
        <h3>Publish Failed</h3>
        <p>${escHtml(err.message)}</p>
      </div>
    `;
    resultDiv.classList.remove('hidden');
    console.error(err);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg> Publish to WooCommerce';
  }
}

// ─── Reset ────────────────────────────────────────────
function resetApp() {
  uploadedImages = [];
  pendingUploads = 0;
  aiData         = null;
  bgRemovalEnabled = false;
  const tog = document.getElementById('toggle-bg-removal');
  if (tog) tog.checked = false;
  document.getElementById('bg-removal-row')?.classList.remove('toggle-row--on');
  document.getElementById('product-name').value      = '';
  document.getElementById('product-condition').value = 'good';
  document.getElementById('product-quantity').value  = '1';
  document.getElementById('product-context').value   = '';
  document.getElementById('product-price').value     = '';
  document.getElementById('publish-result').classList.add('hidden');
  renderPhotoGrid();
  setStatus('');
  goToStep(1);
}

// ─── Utility ──────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

