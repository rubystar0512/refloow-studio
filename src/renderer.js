const { setupUpload } = require('./src/upload');
const { initCrop, applyCrop, cancelCrop } = require('./src/crop');
const { setupExport } = require('./src/export');
const { flipImage } = require('./src/flip');
const { setupLayers } = require('./src/layers');
const { removeBackground, cutoutToCanvas } = require('./src/remove-bg');
const { setupFilters } = require('./src/filters');
const { setupZoom } = require('./src/zoom');
const { setupText } = require('./src/text');
const { setupStudioControls } = require('./src/studio-ui');
const { setupBatch } = require('./src/batch');
const { getSelectedBackgroundId, setSelectedBackgroundId } = require('./src/backgrounds');
const composition = require('./src/composition');
const { setupTransform, syncHandles } = require('./src/transform');
const { setupObjectsUI } = require('./src/objects-ui');
const { loadImageSource, canvasToDataURL } = require('./src/compose');
const compHistory = require('./src/comp-history');
const { ipcRenderer } = require('electron');
const path = require('path');

const imageElement = document.getElementById('editor-image');
const cropBtn = document.getElementById('btn-crop');
const mirrorBtn = document.getElementById('btn-mirror');
const removeBgBtn = document.getElementById('btn-remove-bg');
const catalogBtn = document.getElementById('btn-catalog-ready');
const applyBgBtn = document.getElementById('btn-apply-bg');
const workingOverlay = document.getElementById('working-overlay');
const workingLabel = document.getElementById('working-label');

const { addLayer } = setupLayers();
setupText(addLayer);

let cutoutDataURL = null;
let isCropping = false;
let isWorking = false;

const cropActionContainer = document.createElement('div');
cropActionContainer.style.display = 'none';
cropActionContainer.style.gap = '8px';
cropActionContainer.style.marginTop = '8px';

const applyCropBtn = document.createElement('button');
applyCropBtn.textContent = 'Apply';
applyCropBtn.className = 'primary';
applyCropBtn.style.flex = '1';
applyCropBtn.style.marginBottom = '0';

const cancelCropBtn = document.createElement('button');
cancelCropBtn.textContent = 'Cancel';
cancelCropBtn.className = 'ghost';
cancelCropBtn.style.flex = '1';
cancelCropBtn.style.marginBottom = '0';

cropActionContainer.appendChild(applyCropBtn);
cropActionContainer.appendChild(cancelCropBtn);
cropBtn.parentNode.insertBefore(cropActionContainer, cropBtn.nextSibling);

function lockUI(label) {
  isWorking = true;
  document.body.style.cursor = 'wait';
  if (workingOverlay) workingOverlay.style.display = 'flex';
  if (workingLabel && label) workingLabel.textContent = label;
}

function unlockUI() {
  isWorking = false;
  document.body.style.cursor = 'default';
  if (workingOverlay) workingOverlay.style.display = 'none';
  if (mirrorBtn) mirrorBtn.style.opacity = '1';
}

function exitCropMode() {
  isCropping = false;
  cropActionContainer.style.display = 'none';
}

function setMode(mode) {
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  document.querySelectorAll('[data-panel]').forEach((el) => {
    el.style.display = el.getAttribute('data-panel') === mode ? 'block' : 'none';
  });
  const stageEdit = document.getElementById('stage-edit');
  const stageBatch = document.getElementById('stage-batch');
  if (mode === 'batch') {
    if (stageEdit) stageEdit.style.display = 'none';
    if (stageBatch) stageBatch.style.display = 'flex';
  } else {
    if (stageEdit) stageEdit.style.display = 'flex';
    if (stageBatch) stageBatch.style.display = 'none';
  }
}

document.querySelectorAll('.mode-tab').forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

async function loadProductFromDataURL(dataURL, options = {}) {
  cutoutDataURL = null;
  await composition.setProductFromSource(dataURL, options);
  await composition.setBackgroundId(getSelectedBackgroundId());
  syncHandles();
  // Filters attach to product DOM image when present
  const productImg = document.querySelector('#comp-obj-product img, .comp-product img');
  if (productImg) {
    try {
      setupFilters(productImg);
    } catch (_) {}
  }
}

async function applyBackgroundOnly() {
  if (!composition.hasComposition()) return;
  lockUI('Updating background…');
  try {
    await composition.setBackgroundId(getSelectedBackgroundId());
    syncHandles();
  } finally {
    unlockUI();
  }
}

async function runCatalogReady() {
  const product = composition.getProduct();
  if (!product && (!imageElement.src || imageElement.src === window.location.href)) return;
  if (isCropping || isWorking) return;
  lockUI('Catalog Ready…');
  try {
    let src = product && product.src;
    if (!src && imageElement.src) src = imageElement.src;
    if (!src) return;

    const img = await loadImageSource(src);
    const canvas = await cutoutToCanvas(img);
    const cutout = canvas.toDataURL('image/png');
    cutoutDataURL = cutout;
    await composition.setProductFromSource(cutout, { keepTransform: false, resetArtboard: true });
    await composition.applyCatalogLayout({ bgId: getSelectedBackgroundId() });
    syncHandles();
  } catch (err) {
    console.error(err);
  } finally {
    unlockUI();
  }
}

setupStudioControls({
  onBackgroundChange: async () => {
    if (composition.hasComposition()) {
      await applyBackgroundOnly();
    }
  },
  onPresetChange: async () => {
    if (composition.getProduct()) {
      lockUI('Updating layout…');
      try {
        await composition.applyCatalogLayout({ bgId: getSelectedBackgroundId() });
        syncHandles();
      } finally {
        unlockUI();
      }
    }
  }
});

setupObjectsUI({
  onBake: async () => {
    if (!composition.hasComposition()) return;
    lockUI('Baking…');
    try {
      const canvas = await composition.flattenComposition();
      const dataURL = canvas.toDataURL('image/png');
      composition.clearComposition();
      await loadProductFromDataURL(dataURL, { resetArtboard: true });
      // single flattened product on white-ish — user can still change BG
      await composition.setBackgroundId(getSelectedBackgroundId());
    } catch (err) {
      console.error(err);
    } finally {
      unlockUI();
    }
  }
});

setupTransform();
compHistory.initHistoryTracking();

const batchApi = setupBatch({
  onBatchStart: () => lockUI('Batch running…'),
  onBatchEnd: () => unlockUI()
});

// Patch batch to use composition pipeline per file
(function patchBatchRunner() {
  // batch.js uses runPipeline; replace by re-exporting a composition-based path via require cache is hard.
  // Instead override start by wrapping list processing in renderer hooks — batch module already uses runPipeline.
})();

setupUpload(
  async (loadedImageElement, dataURL) => {
    if (isCropping) cancelCrop();
    exitCropMode();
    try {
      const src =
        dataURL ||
        (() => {
          const c = document.createElement('canvas');
          c.width = loadedImageElement.naturalWidth;
          c.height = loadedImageElement.naturalHeight;
          c.getContext('2d').drawImage(loadedImageElement, 0, 0);
          return c.toDataURL('image/png');
        })();
      await loadProductFromDataURL(src, { keepTransform: false, resetArtboard: true });
    } catch (err) {
      console.error(err);
    }
  },
  (layerBase64Data) => {
    addLayer(layerBase64Data);
  }
);

const dropZone = document.getElementById('drop-zone');
if (dropZone) {
  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 1) {
      batchApi.seedFromFiles(files);
      setMode('batch');
    }
  });
}

setupExport();
setupZoom();
setMode('edit');

cropBtn.addEventListener('click', async () => {
  const product = composition.getProduct();
  if (!product || !product.src) return;
  if (isCropping || isWorking) return;
  // Use legacy cropper on hidden editor-image synced from product
  imageElement.onload = () => {
    isCropping = true;
    imageElement.style.display = 'block';
    document.getElementById('composition-stage').style.visibility = 'hidden';
    initCrop(imageElement);
    cropActionContainer.style.display = 'flex';
  };
  imageElement.src = product.src;
});

applyCropBtn.addEventListener('click', async () => {
  if (!isCropping) return;
  applyCrop(imageElement);
  exitCropMode();
  document.getElementById('composition-stage').style.visibility = 'visible';
  imageElement.style.display = 'none';
  await composition.updateProductSrc(imageElement.src, true);
  syncHandles();
});

cancelCropBtn.addEventListener('click', () => {
  if (!isCropping) return;
  cancelCrop();
  exitCropMode();
  document.getElementById('composition-stage').style.visibility = 'visible';
  imageElement.style.display = 'none';
});

mirrorBtn.addEventListener('click', () => {
  const product = composition.getProduct();
  if (!product || product.locked) return;
  composition.updateObject(product.id, { flipX: !product.flipX });
  syncHandles();
});

removeBgBtn.addEventListener('click', async () => {
  const product = composition.getProduct();
  if (!product || !product.src) return;
  if (isCropping || isWorking) return;
  lockUI('Removing background…');
  const originalText = removeBgBtn.textContent;
  removeBgBtn.textContent = 'Removing…';
  try {
    const img = await loadImageSource(product.src);
    // temporary element for removeBackground API
    const temp = new Image();
    await new Promise((res, rej) => {
      temp.onload = res;
      temp.onerror = rej;
      temp.src = product.src;
    });
    await new Promise((resolve) => {
      removeBackground(temp, async (dataURL) => {
        if (dataURL) {
          cutoutDataURL = dataURL;
          await composition.updateProductSrc(dataURL, true);
          syncHandles();
        }
        resolve();
      });
    });
  } catch (err) {
    console.error(err);
  } finally {
    removeBgBtn.textContent = originalText;
    unlockUI();
  }
});

const productRemoveBgBtn = document.getElementById('btn-product-remove-bg');
if (productRemoveBgBtn) {
  productRemoveBgBtn.addEventListener('click', () => removeBgBtn.click());
}

if (catalogBtn) catalogBtn.addEventListener('click', () => runCatalogReady());
if (applyBgBtn) applyBgBtn.addEventListener('click', () => applyBackgroundOnly());

document.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape' && isCropping) {
    cancelCrop();
    exitCropMode();
    document.getElementById('composition-stage').style.visibility = 'visible';
    imageElement.style.display = 'none';
    return;
  }

  const tag = (event.target && event.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) {
    return;
  }
  if (isCropping || isWorking) return;

  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (mod && key === 'z' && !event.shiftKey) {
    event.preventDefault();
    if (await compHistory.undo()) syncHandles();
    return;
  }
  if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault();
    if (await compHistory.redo()) syncHandles();
    return;
  }
  if (mod && key === 'c') {
    if (compHistory.copySelected()) event.preventDefault();
    return;
  }
  if (mod && key === 'x') {
    if (compHistory.cutSelected()) {
      event.preventDefault();
      syncHandles();
    }
    return;
  }
  if (mod && key === 'v') {
    if (await compHistory.pasteClipboard()) {
      event.preventDefault();
      syncHandles();
    }
    return;
  }
  if (mod && key === 'a') {
    event.preventDefault();
    const product = composition.getProduct();
    if (product) {
      composition.select(product.id);
      syncHandles();
    }
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (compHistory.deleteSelected()) {
      event.preventDefault();
      syncHandles();
    }
  }
});
