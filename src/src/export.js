/* Refloow Photo Studio — export flattened composition */

const { ipcRenderer } = require('electron');
const { getPresetById, getSelectedPresetId } = require('./presets');
const composition = require('./composition');
const { canvasToDataURL } = require('./compose');

function setupExport() {
  const exportBtn = document.getElementById('btn-export');

  exportBtn.addEventListener('click', async () => {
    if (!composition.hasComposition()) {
      console.warn('No composition to export');
      return;
    }

    const preset = getPresetById(getSelectedPresetId());
    const format = (preset.output && preset.output.format) || 'png';
    const quality = (preset.output && preset.output.quality) != null ? preset.output.quality : 0.92;
    const mime = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png';

    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Processing…';
    exportBtn.style.opacity = '0.7';

    try {
      let canvas = await composition.flattenComposition();
      if (mime === 'image/jpeg') {
        const withBg = document.createElement('canvas');
        withBg.width = canvas.width;
        withBg.height = canvas.height;
        const ctx = withBg.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, withBg.width, withBg.height);
        ctx.drawImage(canvas, 0, 0);
        canvas = withBg;
      }
      const dataURL = canvasToDataURL(canvas, format, quality);
      await ipcRenderer.invoke('save-image', dataURL, `refloow-catalog.${ext}`);
    } catch (err) {
      console.error(err);
    }

    exportBtn.textContent = originalText;
    exportBtn.style.opacity = '1';
  });
}

module.exports = { setupExport };
