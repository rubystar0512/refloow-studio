/* Refloow Photo Studio — overlay layers via composition */

const composition = require('./composition');

function setupLayers() {
  function addLayer(base64Data) {
    if (!composition.hasComposition()) {
      // ensure a stage exists with a white bg before overlay
      composition.setArtboardSize(1600, 1600);
      composition.ensureBackground('pure-white');
    }
    composition.addOverlay(base64Data);
    const panel = document.getElementById('layers-panel');
    if (panel) panel.style.display = 'none';
  }

  return { addLayer };
}

module.exports = { setupLayers };
