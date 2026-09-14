/* Refloow Photo Studio — composition object store + stage render */

const { renderBackgroundAsync, getSelectedBackgroundId, getBackgroundById } = require('./backgrounds');
const { getPresetById, getSelectedPresetId, getPaddingPct, getShadowEnabled } = require('./presets');
const { createCanvas, loadImageSource, getOpaqueBounds } = require('./compose');

let artboard = { width: 1600, height: 1600 };
let objects = [];
let selectedId = null;
let overlaySeq = 0;
let listeners = [];

const STAGE_DISPLAY_MAX = 720; // CSS px max for artboard on screen

function emit(event, payload) {
  listeners.forEach((fn) => {
    try {
      fn(event, payload);
    } catch (e) {
      console.error(e);
    }
  });
}

function onChange(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getArtboard() {
  return { ...artboard };
}

function getObjects() {
  return objects.slice().sort((a, b) => a.zIndex - b.zIndex);
}

function getObject(id) {
  return objects.find((o) => o.id === id) || null;
}

function getSelectedId() {
  return selectedId;
}

function getSelected() {
  return getObject(selectedId);
}

function getProduct() {
  return objects.find((o) => o.type === 'product') || null;
}

function getBackground() {
  return objects.find((o) => o.type === 'background') || null;
}

function hasComposition() {
  return objects.length > 0;
}

function computeArtboardSize(presetId) {
  const preset = getPresetById(presetId || getSelectedPresetId());
  const maxSide = (preset.output && preset.output.maxSide) || 2000;
  const aspect = preset.aspect;
  if (!aspect) {
    const product = getProduct();
    if (product && product.naturalW && product.naturalH) {
      const s = Math.min(1, maxSide / Math.max(product.naturalW, product.naturalH));
      return {
        width: Math.round(product.naturalW * s),
        height: Math.round(product.naturalH * s)
      };
    }
    return { width: maxSide, height: maxSide };
  }
  if (aspect >= 1) {
    return { width: maxSide, height: Math.round(maxSide / aspect) };
  }
  return { width: Math.round(maxSide * aspect), height: maxSide };
}

function setArtboardSize(width, height) {
  artboard = {
    width: Math.max(64, Math.round(width)),
    height: Math.max(64, Math.round(height))
  };
  const bg = getBackground();
  if (bg) {
    bg.x = 0;
    bg.y = 0;
    bg.w = artboard.width;
    bg.h = artboard.height;
  }
  syncStageSize();
  emit('artboard', artboard);
}

function ensureBackground(bgId) {
  let bg = getBackground();
  if (!bg) {
    bg = {
      id: 'obj-background',
      type: 'background',
      name: 'Background',
      bgId: bgId || getSelectedBackgroundId(),
      src: null,
      x: 0,
      y: 0,
      w: artboard.width,
      h: artboard.height,
      rotation: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
      locked: false,
      visible: true,
      zIndex: 0
    };
    objects.push(bg);
  } else {
    bg.bgId = bgId || bg.bgId || getSelectedBackgroundId();
    bg.w = artboard.width;
    bg.h = artboard.height;
    bg.x = 0;
    bg.y = 0;
  }
  return bg;
}

function defaultProductRect(naturalW, naturalH, paddingPct) {
  const pad = paddingPct != null ? paddingPct : getPaddingPct();
  const fill = 1 - pad * 2;
  const maxW = artboard.width * fill;
  const maxH = artboard.height * fill;
  const scale = Math.min(maxW / naturalW, maxH / naturalH);
  const w = naturalW * scale;
  const h = naturalH * scale;
  return {
    x: (artboard.width - w) / 2,
    y: (artboard.height - h) / 2,
    w,
    h
  };
}

async function setProductFromSource(source, options = {}) {
  const img = await loadImageSource(source);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const dataURL =
    typeof source === 'string' && source.startsWith('data:')
      ? source
      : (() => {
          const c = createCanvas(naturalW, naturalH);
          c.getContext('2d').drawImage(img, 0, 0);
          return c.toDataURL('image/png');
        })();

  if (options.resetArtboard !== false) {
    const size = computeArtboardSize();
    // If original preset, size from product
    const preset = getPresetById(getSelectedPresetId());
    if (!preset.aspect) {
      setArtboardSize(naturalW, naturalH);
    } else {
      setArtboardSize(size.width, size.height);
    }
  }

  ensureBackground(getSelectedBackgroundId());

  let product = getProduct();
  const keepTransform = options.keepTransform && product;
  const rect = keepTransform
    ? { x: product.x, y: product.y, w: product.w, h: product.h }
    : defaultProductRect(naturalW, naturalH, options.paddingPct);

  if (!product) {
    product = {
      id: 'obj-product',
      type: 'product',
      name: 'Product',
      bgId: null,
      src: dataURL,
      naturalW,
      naturalH,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      rotation: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
      locked: false,
      visible: true,
      zIndex: 1,
      filter: ''
    };
    objects.push(product);
  } else {
    product.src = dataURL;
    product.naturalW = naturalW;
    product.naturalH = naturalH;
    if (!keepTransform) {
      product.x = rect.x;
      product.y = rect.y;
      product.w = rect.w;
      product.h = rect.h;
      product.rotation = 0;
      product.flipX = false;
      product.flipY = false;
    }
  }

  document.body.classList.add('has-image');
  await renderAll();
  select(product.id);
  emit('change', { reason: 'product' });
  return product;
}

async function updateProductSrc(dataURL, keepTransform = true) {
  const product = getProduct();
  if (!product) {
    return setProductFromSource(dataURL, { keepTransform: false });
  }
  const img = await loadImageSource(dataURL);
  product.src = dataURL;
  product.naturalW = img.naturalWidth;
  product.naturalH = img.naturalHeight;
  if (!keepTransform) {
    const rect = defaultProductRect(product.naturalW, product.naturalH);
    Object.assign(product, rect);
  }
  await renderAll();
  emit('change', { reason: 'product-src' });
  return product;
}

async function setBackgroundId(bgId) {
  // Artboard size comes from catalog preset / product — never from BG image size.
  const preset = getPresetById(getSelectedPresetId());
  if (preset && preset.aspect) {
    const size = computeArtboardSize();
    if (artboard.width !== size.width || artboard.height !== size.height) {
      setArtboardSize(size.width, size.height);
    }
  }

  ensureBackground(bgId);
  const bg = getBackground();
  bg.bgId = bgId;
  bg.x = 0;
  bg.y = 0;
  bg.w = artboard.width;
  bg.h = artboard.height;
  const spec = getBackgroundById(bgId);
  if (spec && spec.type === 'image' && spec.dataURL) {
    bg.src = spec.dataURL;
  } else {
    bg.src = null;
  }
  syncStageSize();
  await renderBackgroundEl();
  emit('change', { reason: 'background' });
}

function addOverlay(src, name) {
  overlaySeq += 1;
  const maxZ = objects.reduce((m, o) => Math.max(m, o.zIndex), 0);
  const obj = {
    id: uid('overlay'),
    type: 'overlay',
    name: name || `Overlay ${overlaySeq}`,
    src,
    x: artboard.width * 0.35,
    y: artboard.height * 0.35,
    w: artboard.width * 0.3,
    h: artboard.height * 0.3,
    rotation: 0,
    opacity: 1,
    flipX: false,
    flipY: false,
    locked: false,
    visible: true,
    zIndex: maxZ + 1
  };
  objects.push(obj);
  renderObjectEl(obj);
  select(obj.id);
  emit('change', { reason: 'overlay-add' });
  return obj;
}

function updateObject(id, patch) {
  const obj = getObject(id);
  if (!obj) return null;
  Object.assign(obj, patch);
  if (obj.type === 'background') {
    obj.x = 0;
    obj.y = 0;
    obj.w = artboard.width;
    obj.h = artboard.height;
  }
  applyObjectTransform(obj);
  emit('change', { reason: 'update', id });
  return obj;
}

function select(id) {
  selectedId = id;
  document.querySelectorAll('.comp-object').forEach((el) => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
  emit('select', id);
}

function clearSelection() {
  select(null);
}

function removeObject(id) {
  const obj = getObject(id);
  if (!obj) return;
  if (obj.type === 'background') return;
  if (obj.type === 'product') {
    // clear product (keep background / artboard so a new upload can replace it)
    objects = objects.filter((o) => o.id !== id);
    const el = document.getElementById('comp-' + id);
    if (el) el.remove();
    selectedId = null;
    const legacy = document.getElementById('editor-image');
    if (legacy) {
      legacy.removeAttribute('src');
      legacy.style.display = 'none';
    }
    const box = document.getElementById('transform-box');
    if (box) box.style.display = 'none';
    emit('change', { reason: 'product-clear' });
    emit('select', null);
    return;
  }
  objects = objects.filter((o) => o.id !== id);
  const el = document.getElementById('comp-' + id);
  if (el) el.remove();
  if (selectedId === id) select(null);
  emit('change', { reason: 'remove', id });
}

function duplicateObject(id) {
  const obj = getObject(id);
  if (!obj || obj.type === 'background') return null;
  const copy = {
    ...obj,
    id: obj.type === 'product' ? uid('product') : uid('overlay'),
    name: obj.name + ' copy',
    x: obj.x + 24,
    y: obj.y + 24,
    zIndex: objects.reduce((m, o) => Math.max(m, o.zIndex), 0) + 1
  };
  // Only one primary product — duplicates become overlays
  if (obj.type === 'product') {
    copy.type = 'overlay';
    copy.name = 'Product copy';
  }
  objects.push(copy);
  renderObjectEl(copy);
  select(copy.id);
  emit('change', { reason: 'duplicate' });
  return copy;
}

function resetProductTransform() {
  const product = getProduct();
  if (!product || !product.naturalW) return;
  const rect = defaultProductRect(product.naturalW, product.naturalH);
  product.x = rect.x;
  product.y = rect.y;
  product.w = rect.w;
  product.h = rect.h;
  product.rotation = 0;
  product.flipX = false;
  product.flipY = false;
  product.opacity = 1;
  applyObjectTransform(product);
  emit('change', { reason: 'reset' });
}

function reorderObject(id, direction) {
  const sorted = getObjects().filter((o) => o.type !== 'background');
  const idx = sorted.findIndex((o) => o.id === id);
  if (idx < 0) return;
  const swapWith = direction === 'up' ? idx + 1 : idx - 1;
  if (swapWith < 0 || swapWith >= sorted.length) return;
  const a = sorted[idx];
  const b = sorted[swapWith];
  const z = a.zIndex;
  a.zIndex = b.zIndex;
  b.zIndex = z;
  applyObjectTransform(a);
  applyObjectTransform(b);
  emit('change', { reason: 'reorder' });
}

function stageScale() {
  const max = STAGE_DISPLAY_MAX;
  return Math.min(1, max / Math.max(artboard.width, artboard.height));
}

function syncStageSize() {
  const stage = document.getElementById('composition-stage');
  if (!stage) return;
  const s = stageScale();
  stage.style.width = artboard.width * s + 'px';
  stage.style.height = artboard.height * s + 'px';
  stage.dataset.artboardW = String(artboard.width);
  stage.dataset.artboardH = String(artboard.height);
  stage.dataset.stageScale = String(s);
}

function applyObjectTransform(obj) {
  const el = document.getElementById('comp-' + obj.id);
  if (!el) return;
  const s = stageScale();
  el.style.display = obj.visible ? 'block' : 'none';
  el.style.opacity = String(obj.opacity);
  el.style.zIndex = String(obj.zIndex + 10);
  el.style.left = obj.x * s + 'px';
  el.style.top = obj.y * s + 'px';
  el.style.width = obj.w * s + 'px';
  el.style.height = obj.h * s + 'px';
  const flips = `${obj.flipX ? 'scaleX(-1)' : ''} ${obj.flipY ? 'scaleY(-1)' : ''}`.trim();
  el.style.transform = `rotate(${obj.rotation}deg) ${flips}`.trim();
  el.classList.toggle('locked', !!obj.locked);
  el.classList.toggle('selected', obj.id === selectedId);
  if (obj.type === 'product' && obj.filter) {
    const img = el.querySelector('img');
    if (img) img.style.filter = obj.filter;
  }
}

async function renderBackgroundEl() {
  const bg = getBackground();
  if (!bg) return;
  let el = document.getElementById('comp-' + bg.id);
  const stage = document.getElementById('composition-stage');
  if (!stage) return;
  if (!el) {
    el = document.createElement('div');
    el.className = 'comp-object comp-background';
    el.id = 'comp-' + bg.id;
    el.dataset.id = bg.id;
    el.dataset.type = 'background';
    const inner = document.createElement('div');
    inner.className = 'comp-object-visual';
    el.appendChild(inner);
    stage.appendChild(el);
  }
  const visual = el.querySelector('.comp-object-visual');
  // Always rasterize into artboard bounds (cover-fit). Never size the stage to the image.
  const canvas = await renderBackgroundAsync(bg.bgId || getSelectedBackgroundId(), artboard.width, artboard.height);
  visual.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;
  visual.style.backgroundSize = '100% 100%';
  visual.style.backgroundPosition = 'center';
  visual.style.backgroundRepeat = 'no-repeat';
  bg.x = 0;
  bg.y = 0;
  bg.w = artboard.width;
  bg.h = artboard.height;
  applyObjectTransform(bg);
}

function renderObjectEl(obj) {
  const stage = document.getElementById('composition-stage');
  if (!stage) return;
  let el = document.getElementById('comp-' + obj.id);
  if (!el) {
    el = document.createElement('div');
    el.className = `comp-object comp-${obj.type}`;
    el.id = 'comp-' + obj.id;
    el.dataset.id = obj.id;
    el.dataset.type = obj.type;
    if (obj.type === 'background') {
      const visual = document.createElement('div');
      visual.className = 'comp-object-visual';
      el.appendChild(visual);
    } else {
      const img = document.createElement('img');
      img.className = 'comp-object-img';
      img.draggable = false;
      img.src = obj.src || '';
      el.appendChild(img);
    }
    stage.appendChild(el);
  } else if (obj.type !== 'background') {
    const img = el.querySelector('img');
    if (img && obj.src && img.src !== obj.src) img.src = obj.src;
  }
  applyObjectTransform(obj);
}

async function renderAll() {
  const stage = document.getElementById('composition-stage');
  if (!stage) return;
  syncStageSize();
  const legacy = document.getElementById('editor-image');
  if (legacy) legacy.style.display = 'none';
  const empty = document.getElementById('empty-state');
  const active = hasComposition();
  if (active) {
    document.body.classList.add('has-image');
    if (empty) empty.style.display = 'none';
    stage.style.display = 'block';
  } else {
    document.body.classList.remove('has-image');
    if (empty) empty.style.display = 'flex';
    stage.style.display = 'none';
  }

  for (const obj of getObjects()) {
    if (obj.type === 'background') await renderBackgroundEl();
    else renderObjectEl(obj);
  }
  stage.querySelectorAll('.comp-object').forEach((el) => {
    if (!getObject(el.dataset.id)) el.remove();
  });
  emit('render');
}

async function applyCatalogLayout(options = {}) {
  const size = computeArtboardSize();
  setArtboardSize(size.width, size.height);
  await setBackgroundId(options.bgId || getSelectedBackgroundId());
  const product = getProduct();
  if (product && product.naturalW) {
    const rect = defaultProductRect(product.naturalW, product.naturalH, options.paddingPct);
    product.x = rect.x;
    product.y = rect.y;
    product.w = rect.w;
    product.h = rect.h;
    product.rotation = 0;
    applyObjectTransform(product);
  }
  await renderAll();
  if (product) select(product.id);
  emit('change', { reason: 'catalog-layout' });
}

function clearComposition() {
  objects = [];
  selectedId = null;
  overlaySeq = 0;
  const stage = document.getElementById('composition-stage');
  if (stage) {
    stage.innerHTML = '';
    stage.style.display = 'none';
  }
  document.body.classList.remove('has-image');
  const empty = document.getElementById('empty-state');
  if (empty) empty.style.display = 'flex';
  const legacy = document.getElementById('editor-image');
  if (legacy) {
    legacy.style.display = 'none';
    legacy.removeAttribute('src');
  }
  emit('change', { reason: 'clear' });
}

/** Replace composition from a plain snapshot (undo/redo). Does not emit change. */
function restoreState(state) {
  artboard = {
    width: Math.max(64, Math.round((state.artboard && state.artboard.width) || 1600)),
    height: Math.max(64, Math.round((state.artboard && state.artboard.height) || 1600))
  };
  objects = (state.objects || []).map((o) => ({ ...o }));
  selectedId = state.selectedId || null;
  const stage = document.getElementById('composition-stage');
  if (stage) stage.innerHTML = '';
  syncStageSize();
}

/** Insert or replace a single object (clipboard paste). */
function restoreObject(obj) {
  if (!obj || !obj.id) return null;
  objects = objects.filter((o) => o.id !== obj.id);
  const copy = { ...obj };
  objects.push(copy);
  if (copy.type === 'background') {
    renderBackgroundEl();
  } else {
    renderObjectEl(copy);
  }
  select(copy.id);
  emit('change', { reason: 'restore-object' });
  return copy;
}

/**
 * Flatten composition to a canvas at artboard resolution.
 */
async function flattenComposition() {
  const canvas = createCanvas(artboard.width, artboard.height);
  const ctx = canvas.getContext('2d');

  for (const obj of getObjects()) {
    if (!obj.visible) continue;
    ctx.save();
    ctx.globalAlpha = obj.opacity;
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((obj.rotation * Math.PI) / 180);
    ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);

    if (obj.type === 'background') {
      const bgCanvas = await renderBackgroundAsync(obj.bgId || getSelectedBackgroundId(), artboard.width, artboard.height);
      ctx.drawImage(bgCanvas, -obj.w / 2, -obj.h / 2, obj.w, obj.h);
    } else if (obj.src) {
      const img = await loadImageSource(obj.src);
      if (obj.type === 'product' && getShadowEnabled()) {
        ctx.save();
        ctx.fillStyle = 'rgba(20,24,28,0.28)';
        ctx.beginPath();
        ctx.ellipse(0, obj.h * 0.42, obj.w * 0.38, obj.h * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (obj.filter) ctx.filter = obj.filter;
      ctx.drawImage(img, -obj.w / 2, -obj.h / 2, obj.w, obj.h);
      ctx.filter = 'none';
    }
    ctx.restore();
  }
  return canvas;
}

module.exports = {
  onChange,
  getArtboard,
  getObjects,
  getObject,
  getSelectedId,
  getSelected,
  getProduct,
  getBackground,
  hasComposition,
  setArtboardSize,
  computeArtboardSize,
  setProductFromSource,
  updateProductSrc,
  setBackgroundId,
  addOverlay,
  updateObject,
  select,
  clearSelection,
  removeObject,
  duplicateObject,
  resetProductTransform,
  reorderObject,
  renderAll,
  applyCatalogLayout,
  clearComposition,
  flattenComposition,
  stageScale,
  defaultProductRect,
  ensureBackground,
  restoreState,
  restoreObject
};
