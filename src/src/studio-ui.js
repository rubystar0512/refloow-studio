/* Refloow Photo Studio — background picker + Catalog Ready wiring helpers */

const {
  getBackgroundCatalog,
  getSelectedBackgroundId,
  setSelectedBackgroundId,
  addCustomBackground,
  getSwatchDataURL
} = require('./backgrounds');
const {
  getPresets,
  getSelectedPresetId,
  setSelectedPresetId,
  getPaddingPct,
  setPaddingPct,
  getShadowEnabled,
  setShadowEnabled,
  getPresetById
} = require('./presets');
const { ipcRenderer } = require('electron');

function setupStudioControls(hooks = {}) {
  const grid = document.getElementById('bg-grid');
  const presetSelect = document.getElementById('preset-select');
  const paddingSlider = document.getElementById('slide-padding');
  const paddingVal = document.getElementById('val-padding');
  const shadowToggle = document.getElementById('toggle-shadow');
  const customBgInput = document.getElementById('bg-custom-input');
  const customBgBtn = document.getElementById('btn-bg-custom');

  async function renderBgGrid() {
    if (!grid) return;
    grid.innerHTML = '';
    const catalog = getBackgroundCatalog();
    for (const bg of catalog) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bg-swatch' + (bg.id === getSelectedBackgroundId() ? ' active' : '');
      btn.dataset.id = bg.id;
      btn.title = bg.label;

      const thumb = document.createElement('span');
      thumb.className = 'bg-swatch-thumb';
      try {
        const url = await Promise.resolve(getSwatchDataURL(bg.id, 72));
        thumb.style.backgroundImage = `url(${url})`;
      } catch (_) {
        thumb.style.background = '#ccc';
      }

      const label = document.createElement('span');
      label.className = 'bg-swatch-label';
      label.textContent = bg.label;

      btn.appendChild(thumb);
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        setSelectedBackgroundId(bg.id);
        renderBgGrid();
        if (hooks.onBackgroundChange) hooks.onBackgroundChange(bg.id);
      });
      grid.appendChild(btn);
    }
  }

  function fillPresets() {
    if (!presetSelect) return;
    presetSelect.innerHTML = '';
    getPresets().forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      if (p.id === getSelectedPresetId()) opt.selected = true;
      presetSelect.appendChild(opt);
    });
  }

  function syncPaddingUI() {
    const pct = Math.round(getPaddingPct() * 100);
    if (paddingSlider) paddingSlider.value = String(pct);
    if (paddingVal) paddingVal.textContent = pct + '%';
  }

  function syncShadowUI() {
    if (shadowToggle) shadowToggle.checked = getShadowEnabled();
  }

  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      setSelectedPresetId(presetSelect.value);
      const preset = getPresetById(presetSelect.value);
      if (preset.defaultBgId) setSelectedBackgroundId(preset.defaultBgId);
      setPaddingPct(preset.paddingPct);
      setShadowEnabled(preset.shadow);
      syncPaddingUI();
      syncShadowUI();
      renderBgGrid();
      if (hooks.onPresetChange) hooks.onPresetChange(presetSelect.value);
    });
  }

  if (paddingSlider) {
    paddingSlider.addEventListener('input', () => {
      const pct = Number(paddingSlider.value) / 100;
      setPaddingPct(pct);
      if (paddingVal) paddingVal.textContent = paddingSlider.value + '%';
    });
  }

  if (shadowToggle) {
    shadowToggle.addEventListener('change', () => {
      setShadowEnabled(shadowToggle.checked);
    });
  }

  if (customBgBtn && customBgInput) {
    customBgBtn.addEventListener('click', () => customBgInput.click());
    customBgInput.addEventListener('change', () => {
      const file = customBgInput.files && customBgInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataURL = reader.result;
        // Custom BG is cover-fitted into the current artboard — never resizes the canvas.
        addCustomBackground(file.name.replace(/\.[^.]+$/, '') || 'Custom', dataURL);
        try {
          await ipcRenderer.invoke('save-custom-background', file.name, dataURL);
        } catch (_) {}
        await renderBgGrid();
        if (hooks.onBackgroundChange) hooks.onBackgroundChange(getSelectedBackgroundId());
      };
      reader.readAsDataURL(file);
      customBgInput.value = '';
    });
  }

  fillPresets();
  syncPaddingUI();
  syncShadowUI();
  renderBgGrid();

  return { renderBgGrid, refresh: () => { fillPresets(); syncPaddingUI(); syncShadowUI(); renderBgGrid(); } };
}

module.exports = { setupStudioControls };
