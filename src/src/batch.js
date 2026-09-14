/* Refloow Photo Studio — batch folder processing via composition */

const path = require('path');
const { ipcRenderer } = require('electron');
const composition = require('./composition');
const { cutoutToCanvas } = require('./remove-bg');
const { loadImageSource, canvasToDataURL } = require('./compose');
const { getSelectedBackgroundId } = require('./backgrounds');
const { getPresetById, getSelectedPresetId } = require('./presets');

function setupBatch(hooks = {}) {
  const inputPathEl = document.getElementById('batch-input-path');
  const outputPathEl = document.getElementById('batch-output-path');
  const pickInputBtn = document.getElementById('btn-batch-input');
  const pickOutputBtn = document.getElementById('btn-batch-output');
  const startBtn = document.getElementById('btn-batch-start');
  const pauseBtn = document.getElementById('btn-batch-pause');
  const cancelBtn = document.getElementById('btn-batch-cancel');
  const queueEl = document.getElementById('batch-queue');
  const progressFill = document.getElementById('batch-progress-fill');
  const progressLabel = document.getElementById('batch-progress-label');
  const statusEl = document.getElementById('batch-status');

  let inputDir = '';
  let outputDir = '';
  let queue = [];
  let running = false;
  let paused = false;
  let cancelRequested = false;
  let processed = 0;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function renderQueue() {
    if (!queueEl) return;
    queueEl.innerHTML = '';
    queue.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'batch-row status-' + item.status;
      row.innerHTML = `
        <span class="batch-index">${index + 1}</span>
        <span class="batch-name" title="${item.name}">${item.name}</span>
        <span class="batch-state">${item.status}</span>
      `;
      queueEl.appendChild(row);
    });
  }

  function updateProgress() {
    const total = queue.length || 1;
    const pct = Math.round((processed / total) * 100);
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressLabel) progressLabel.textContent = `${processed} / ${queue.length}`;
  }

  async function processFile(filePath) {
    const img = await loadImageSource(filePath);
    const cutoutCanvas = await cutoutToCanvas(img);
    const cutout = cutoutCanvas.toDataURL('image/png');
    await composition.setProductFromSource(cutout, { keepTransform: false, resetArtboard: true });
    await composition.applyCatalogLayout({ bgId: getSelectedBackgroundId() });
    const flat = await composition.flattenComposition();
    const preset = getPresetById(getSelectedPresetId());
    const format = (preset.output && preset.output.format) || 'png';
    const quality = (preset.output && preset.output.quality) != null ? preset.output.quality : 0.92;
    return canvasToDataURL(flat, format, quality);
  }

  async function pickInput() {
    const res = await ipcRenderer.invoke('pick-directory', { title: 'Select input folder' });
    if (!res.success) return;
    inputDir = res.path;
    if (inputPathEl) inputPathEl.textContent = inputDir;
    const listed = await ipcRenderer.invoke('list-images', inputDir);
    if (!listed.success) {
      setStatus(listed.error || 'Could not read folder');
      return;
    }
    queue = listed.files.map((f) => ({ ...f, status: 'pending' }));
    processed = 0;
    updateProgress();
    renderQueue();
    setStatus(`${queue.length} image${queue.length === 1 ? '' : 's'} ready`);
  }

  async function pickOutput() {
    const res = await ipcRenderer.invoke('pick-directory', { title: 'Select output folder' });
    if (!res.success) return;
    outputDir = res.path;
    if (outputPathEl) outputPathEl.textContent = outputDir;
  }

  async function processNext(index) {
    if (cancelRequested) return;
    while (paused && !cancelRequested) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (cancelRequested || index >= queue.length) return;

    const item = queue[index];
    item.status = 'working';
    renderQueue();
    setStatus(`Processing ${item.name}…`);

    try {
      const dataURL = await processFile(item.path);
      const preset = getPresetById(getSelectedPresetId());
      const format = (preset.output && preset.output.format) || 'png';
      const ext = format === 'jpeg' || format === 'jpg' ? '.jpg' : '.png';
      const outPath = path.join(outputDir, `${item.stem}_catalog${ext}`);
      const write = await ipcRenderer.invoke('write-image-file', outPath, dataURL);
      if (!write.success) throw new Error(write.error || 'Write failed');
      item.status = 'done';
    } catch (err) {
      console.error(err);
      item.status = 'error';
    }

    processed += 1;
    updateProgress();
    renderQueue();
    await processNext(index + 1);
  }

  async function start() {
    if (running) return;
    if (!inputDir || !queue.length) {
      setStatus('Pick an input folder with images first');
      return;
    }
    if (!outputDir) {
      setStatus('Pick an output folder first');
      return;
    }

    running = true;
    paused = false;
    cancelRequested = false;
    processed = 0;
    queue.forEach((q) => {
      q.status = 'pending';
    });
    updateProgress();
    renderQueue();
    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (hooks.onBatchStart) hooks.onBatchStart();

    await processNext(0);

    running = false;
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    const errors = queue.filter((q) => q.status === 'error').length;
    const done = queue.filter((q) => q.status === 'done').length;
    setStatus(
      cancelRequested
        ? `Cancelled — ${done} saved`
        : `Finished — ${done} saved${errors ? `, ${errors} failed` : ''}`
    );
    if (hooks.onBatchEnd) hooks.onBatchEnd({ done, errors });
  }

  function pause() {
    if (!running) return;
    paused = !paused;
    if (pauseBtn) pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    setStatus(paused ? 'Paused' : 'Running…');
  }

  function cancel() {
    cancelRequested = true;
    paused = false;
    setStatus('Cancelling…');
  }

  function seedFromFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
    if (!files.length) return;
    queue = files.map((f) => ({
      name: f.name,
      path: f.path,
      stem: path.basename(f.name, path.extname(f.name)),
      status: 'pending'
    }));
    if (files[0] && files[0].path) {
      inputDir = path.dirname(files[0].path);
      if (inputPathEl) inputPathEl.textContent = inputDir + ' (from drop)';
    }
    processed = 0;
    updateProgress();
    renderQueue();
    setStatus(`${queue.length} images from drop`);
  }

  pickInputBtn && pickInputBtn.addEventListener('click', pickInput);
  pickOutputBtn && pickOutputBtn.addEventListener('click', pickOutput);
  startBtn && startBtn.addEventListener('click', start);
  pauseBtn && pauseBtn.addEventListener('click', pause);
  cancelBtn && cancelBtn.addEventListener('click', cancel);
  if (pauseBtn) pauseBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  return { seedFromFiles, start, getQueue: () => queue };
}

module.exports = { setupBatch };
