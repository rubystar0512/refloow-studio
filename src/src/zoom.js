/* Refloow Photo Studio — workspace zoom & pan */

let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let isZoomLocked = false;
let spacePressed = false;

window.editorZoomScale = 1;

function getEls() {
  return {
    container: document.querySelector('.canvas-container'),
    wrapper: document.getElementById('image-wrapper'),
    img: document.getElementById('editor-image'),
    zoomLabel: document.getElementById('zoom-level-label')
  };
}

function hasImage(img) {
  return img && img.src && img.src !== window.location.href && img.naturalWidth > 0;
}

function applyTransform() {
  const { wrapper, zoomLabel } = getEls();
  if (!wrapper) return;
  wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  window.editorZoomScale = scale;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function resetView() {
  scale = 1;
  translateX = 0;
  translateY = 0;
  window.editorZoomScale = 1;
  applyTransform();
}

function fitToView() {
  const { container, wrapper, img } = getEls();
  if (!container || !wrapper || !hasImage(img)) return;

  resetView();

  const pad = 48;
  const cw = container.clientWidth - pad;
  const ch = container.clientHeight - pad;
  if (cw <= 0 || ch <= 0) return;

  // Image is object-fit:contain inside wrapper; use displayed box
  const displayW = img.clientWidth || img.naturalWidth;
  const displayH = img.clientHeight || img.naturalHeight;
  if (!displayW || !displayH) return;

  const fit = Math.min(cw / displayW, ch / displayH, 1);
  scale = Math.max(0.1, fit);
  translateX = 0;
  translateY = 0;
  applyTransform();
}

function zoomBy(factor, centerClientX, centerClientY) {
  const { container, wrapper, img } = getEls();
  if (!wrapper || !hasImage(img) || isZoomLocked) return;

  let newScale = scale * factor;
  newScale = Math.max(0.1, Math.min(newScale, 15));
  if (newScale === scale) return;

  const rect = wrapper.getBoundingClientRect();
  const cx = (centerClientX != null ? centerClientX : rect.left + rect.width / 2) - rect.left;
  const cy = (centerClientY != null ? centerClientY : rect.top + rect.height / 2) - rect.top;
  const ratio = newScale / scale - 1;
  translateX -= cx * ratio;
  translateY -= cy * ratio;
  scale = newScale;
  applyTransform();
}

window.disableWorkspaceZoom = () => {
  isZoomLocked = true;
  isDragging = false;
  const { wrapper, container } = getEls();
  if (wrapper) wrapper.style.transform = 'translate(0px, 0px) scale(1)';
  if (container) {
    container.classList.remove('is-panning', 'can-pan');
    container.style.cursor = '';
  }
};

window.enableWorkspaceZoom = () => {
  isZoomLocked = false;
  resetView();
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  updatePanCursor();
};

function isLayerTarget(target) {
  return !!(target && target.closest && target.closest('.canvas-layer-wrapper'));
}

function updatePanCursor() {
  const { container, img } = getEls();
  if (!container) return;
  const hasComp = !!document.querySelector('.comp-object');
  if (isZoomLocked || (!hasImage(img) && !hasComp)) {
    container.classList.remove('can-pan');
    return;
  }
  container.classList.add('can-pan');
}

function setupZoom() {
  const { container, wrapper } = getEls();
  if (!container || !wrapper) return;

  wrapper.style.transformOrigin = 'center center';
  wrapper.style.willChange = 'transform';
  applyTransform();

  // Wheel zoom toward cursor
  container.addEventListener(
    'wheel',
    (e) => {
      if (isZoomLocked) return;
      const { img } = getEls();
      if (!hasImage(img)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      zoomBy(factor, e.clientX, e.clientY);
    },
    { passive: false }
  );

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      spacePressed = true;
      e.preventDefault();
      const { container: c } = getEls();
      if (c && !isZoomLocked) c.classList.add('space-pan');
    }

    // Shortcuts: Ctrl + / - / 0
    if ((e.ctrlKey || e.metaKey) && !isZoomLocked) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomBy(1.15);
      } else if (e.key === '-') {
        e.preventDefault();
        zoomBy(1 / 1.15);
      } else if (e.key === '0') {
        e.preventDefault();
        resetView();
      } else if (e.key.toLowerCase() === '1') {
        e.preventDefault();
        fitToView();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spacePressed = false;
      const { container: c } = getEls();
      if (c) c.classList.remove('space-pan');
      if (!isDragging && c) c.classList.remove('is-panning');
    }
  });

  container.addEventListener('mousedown', (e) => {
    if (isZoomLocked) return;
    if (window.__transformActive) return;
    // Don't pan when interacting with composition objects / handles
    if (
      e.target.closest &&
      (e.target.closest('.comp-object') ||
        e.target.closest('#transform-box') ||
        e.target.closest('[data-handle]') ||
        e.target.closest('.view-toolbar'))
    ) {
      return;
    }

    const { img } = getEls();
    const hasComp = document.querySelector('.comp-object');
    if (!hasImage(img) && !hasComp) return;

    const leftPan = e.button === 0;
    const middlePan = e.button === 1;
    const spacePan = e.button === 0 && spacePressed;

    if (leftPan || middlePan || spacePan) {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      container.classList.add('is-panning');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    const { container: c } = getEls();
    if (c) c.classList.remove('is-panning');
  });

  // Double-click empty stage → reset view
  container.addEventListener('dblclick', (e) => {
    if (isZoomLocked || isLayerTarget(e.target)) return;
    resetView();
  });

  // Toolbar buttons
  const btnIn = document.getElementById('btn-zoom-in');
  const btnOut = document.getElementById('btn-zoom-out');
  const btnFit = document.getElementById('btn-zoom-fit');
  const btnReset = document.getElementById('btn-zoom-reset');

  if (btnIn) btnIn.addEventListener('click', () => zoomBy(1.2));
  if (btnOut) btnOut.addEventListener('click', () => zoomBy(1 / 1.2));
  if (btnFit) btnFit.addEventListener('click', () => fitToView());
  if (btnReset) btnReset.addEventListener('click', () => resetView());

  // Keep pan affordance in sync when image loads / changes
  const observer = new MutationObserver(updatePanCursor);
  const img = document.getElementById('editor-image');
  if (img) observer.observe(img, { attributes: true, attributeFilter: ['src', 'style'] });
  updatePanCursor();

  window.resetWorkspaceView = resetView;
  window.fitWorkspaceView = fitToView;
}

module.exports = { setupZoom, resetView, fitToView, zoomBy };
