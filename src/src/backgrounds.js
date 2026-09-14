/* Refloow Photo Studio — background templates & composition */

const path = require('path');
const { createCanvas } = require('./compose');

const BUILTIN = [
  { id: 'pure-white', label: 'Pure White', category: 'solid', type: 'solid', color: '#FFFFFF' },
  { id: 'soft-gray', label: 'Soft Gray', category: 'solid', type: 'solid', color: '#E8EAED' },
  { id: 'charcoal', label: 'Charcoal', category: 'solid', type: 'solid', color: '#2A2E33' },
  { id: 'brand-amber', label: 'Brand Amber', category: 'solid', type: 'solid', color: '#C47A3A' },
  {
    id: 'softbox-white',
    label: 'Softbox White',
    category: 'gradient',
    type: 'gradient',
    colors: ['#FFFFFF', '#F0F2F5'],
    angle: 180
  },
  {
    id: 'cool-studio',
    label: 'Cool Studio',
    category: 'gradient',
    type: 'gradient',
    colors: ['#EEF2F6', '#D5DEE8'],
    angle: 160
  },
  {
    id: 'warm-floor',
    label: 'Warm Floor Fade',
    category: 'gradient',
    type: 'gradient',
    colors: ['#F7F4F0', '#E8DFD4', '#D4C4B0'],
    angle: 180
  },
  {
    id: 'lifestyle-mist',
    label: 'Lifestyle Mist',
    category: 'lifestyle',
    type: 'lifestyle',
    colors: ['#E4ECF2', '#C8D5E0', '#A8B8C8'],
    noise: 0.08
  },
  {
    id: 'lifestyle-linen',
    label: 'Lifestyle Linen',
    category: 'lifestyle',
    type: 'lifestyle',
    colors: ['#F3EEE6', '#E5D9C8', '#CDBBA3'],
    noise: 0.1
  },
  {
    id: 'lifestyle-slate',
    label: 'Lifestyle Slate',
    category: 'lifestyle',
    type: 'lifestyle',
    colors: ['#3A424C', '#2C333C', '#1E242B'],
    noise: 0.06
  },
  {
    id: 'lifestyle-blush',
    label: 'Lifestyle Blush',
    category: 'lifestyle',
    type: 'lifestyle',
    colors: ['#F6EBE7', '#E8D2CB', '#D4B5AB'],
    noise: 0.07
  },
  {
    id: 'lifestyle-sage',
    label: 'Lifestyle Sage',
    category: 'lifestyle',
    type: 'lifestyle',
    colors: ['#E6EDE6', '#C5D4C6', '#9FB5A2'],
    noise: 0.08
  }
];

let customBackgrounds = [];
let selectedBackgroundId = 'pure-white';

function getBackgroundCatalog() {
  return [...BUILTIN, ...customBackgrounds];
}

function getBackgroundById(id) {
  return getBackgroundCatalog().find((b) => b.id === id) || BUILTIN[0];
}

function getSelectedBackgroundId() {
  return selectedBackgroundId;
}

function setSelectedBackgroundId(id) {
  if (getBackgroundById(id)) selectedBackgroundId = id;
}

function addCustomBackground(label, dataURL) {
  const id = 'custom-' + Date.now();
  const entry = {
    id,
    label: label || 'Custom',
    category: 'custom',
    type: 'image',
    dataURL
  };
  customBackgrounds.push(entry);
  selectedBackgroundId = id;
  return entry;
}

function removeCustomBackground(id) {
  customBackgrounds = customBackgrounds.filter((b) => b.id !== id);
  if (selectedBackgroundId === id) selectedBackgroundId = 'pure-white';
}

function drawNoise(ctx, w, h, amount) {
  if (!amount) return;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(imageData, 0, 0);
}

function fillGradient(ctx, w, h, colors, angleDeg) {
  const rad = ((angleDeg || 180) * Math.PI) / 180;
  const x0 = w / 2 - (Math.cos(rad) * w) / 2;
  const y0 = h / 2 - (Math.sin(rad) * h) / 2;
  const x1 = w / 2 + (Math.cos(rad) * w) / 2;
  const y1 = h / 2 + (Math.sin(rad) * h) / 2;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Draw a background template onto a new canvas.
 */
function renderBackground(bgSpec, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const bg = typeof bgSpec === 'string' ? getBackgroundById(bgSpec) : bgSpec;

  if (!bg) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }

  if (bg.type === 'solid') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }

  if (bg.type === 'gradient' || bg.type === 'lifestyle') {
    fillGradient(ctx, width, height, bg.colors, bg.angle || 165);
    if (bg.type === 'lifestyle') {
      // soft radial vignette for depth
      const rg = ctx.createRadialGradient(
        width * 0.5,
        height * 0.35,
        width * 0.1,
        width * 0.5,
        height * 0.5,
        width * 0.75
      );
      rg.addColorStop(0, 'rgba(255,255,255,0.18)');
      rg.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, width, height);
      drawNoise(ctx, width, height, bg.noise || 0.06);
    }
    return canvas;
  }

  if (bg.type === 'image' && bg.dataURL) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
        resolve(canvas);
      };
      img.onerror = () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        resolve(canvas);
      };
      img.src = bg.dataURL;
    });
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

async function renderBackgroundAsync(bgSpec, width, height) {
  const result = renderBackground(bgSpec, width, height);
  return result instanceof Promise ? result : result;
}

/** Swatch data URL for UI thumbnails */
function getSwatchDataURL(bgId, size = 96) {
  const canvas = renderBackground(bgId, size, size);
  if (canvas instanceof Promise) {
    return canvas.then((c) => c.toDataURL('image/png'));
  }
  return canvas.toDataURL('image/png');
}

function getManifestPath() {
  return path.join(__dirname, 'assets', 'backgrounds', 'manifest.json');
}

module.exports = {
  BUILTIN,
  getBackgroundCatalog,
  getBackgroundById,
  getSelectedBackgroundId,
  setSelectedBackgroundId,
  addCustomBackground,
  removeCustomBackground,
  renderBackground,
  renderBackgroundAsync,
  getSwatchDataURL,
  getManifestPath
};
