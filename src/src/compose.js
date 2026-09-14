/* Refloow Photo Studio — canvas composition helpers */

/**
 * Load an HTMLImageElement from a File, path (file://), data URL, or existing element.
 */
function loadImageSource(source) {
  return new Promise((resolve, reject) => {
    if (source instanceof HTMLImageElement) {
      if (source.complete && source.naturalWidth) {
        resolve(source);
        return;
      }
      source.onload = () => resolve(source);
      source.onerror = reject;
      return;
    }

    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;

    if (typeof source === 'string') {
      if (source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('file:')) {
        img.src = source;
      } else {
        img.src = 'file:///' + source.replace(/\\/g, '/');
      }
      return;
    }

    if (source && source.path) {
      img.src = 'file:///' + String(source.path).replace(/\\/g, '/');
      return;
    }

    reject(new Error('Unsupported image source'));
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Alpha bounding box of non-transparent pixels */
function getOpaqueBounds(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return { x: 0, y: 0, width: w, height: h };
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function drawSoftShadow(ctx, x, y, w, h, strength = 0.35) {
  ctx.save();
  ctx.fillStyle = `rgba(20, 24, 28, ${strength})`;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.92, w * 0.38, h * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Place cutout on a backdrop canvas sized to aspect ratio with padding.
 * @param {HTMLImageElement|HTMLCanvasElement} cutout transparent product
 * @param {HTMLCanvasElement} backdrop already sized canvas with BG drawn
 * @param {{ paddingPct?: number, shadow?: boolean }} opts
 */
function placeProductOnBackdrop(cutout, backdrop, opts = {}) {
  const paddingPct = opts.paddingPct != null ? opts.paddingPct : 0.08;
  const shadow = !!opts.shadow;
  const ctx = backdrop.getContext('2d');
  const cw = backdrop.width;
  const ch = backdrop.height;

  const srcW = cutout.naturalWidth || cutout.width || 0;
  const srcH = cutout.naturalHeight || cutout.height || 0;
  if (srcW < 2 || srcH < 2) {
    console.warn('placeProductOnBackdrop: cutout has no size');
    return backdrop;
  }

  const bounds = getOpaqueBounds(cutout);
  // If mask is effectively empty, draw the full cutout anyway
  const useBounds =
    bounds.width >= 2 && bounds.height >= 2
      ? bounds
      : { x: 0, y: 0, width: srcW, height: srcH };

  const fill = 1 - paddingPct * 2;
  const maxW = cw * fill;
  const maxH = ch * fill;
  const scale = Math.min(maxW / useBounds.width, maxH / useBounds.height);
  const drawW = useBounds.width * scale;
  const drawH = useBounds.height * scale;
  const dx = (cw - drawW) / 2;
  const dy = (ch - drawH) / 2;

  if (shadow) {
    drawSoftShadow(ctx, dx, dy, drawW, drawH);
  }

  ctx.drawImage(
    cutout,
    useBounds.x,
    useBounds.y,
    useBounds.width,
    useBounds.height,
    dx,
    dy,
    drawW,
    drawH
  );

  return backdrop;
}

/**
 * Frame canvas to a target aspect (width/height). null aspect keeps original.
 */
function frameToAspect(sourceCanvas, aspect, maxSide) {
  if (!aspect) {
    if (maxSide && Math.max(sourceCanvas.width, sourceCanvas.height) > maxSide) {
      const s = maxSide / Math.max(sourceCanvas.width, sourceCanvas.height);
      const out = createCanvas(sourceCanvas.width * s, sourceCanvas.height * s);
      out.getContext('2d').drawImage(sourceCanvas, 0, 0, out.width, out.height);
      return out;
    }
    return sourceCanvas;
  }

  let outW;
  let outH;
  const base = maxSide || Math.max(sourceCanvas.width, sourceCanvas.height, 1600);
  if (aspect >= 1) {
    outW = base;
    outH = Math.round(base / aspect);
  } else {
    outH = base;
    outW = Math.round(base * aspect);
  }

  const out = createCanvas(outW, outH);
  out.getContext('2d').drawImage(sourceCanvas, 0, 0, outW, outH);
  return out;
}

function canvasToDataURL(canvas, format = 'png', quality = 0.92) {
  if (format === 'jpeg' || format === 'jpg') {
    return canvas.toDataURL('image/jpeg', quality);
  }
  return canvas.toDataURL('image/png');
}

function dataURLToBuffer(dataURL) {
  const parts = dataURL.split(';base64,');
  return Buffer.from(parts[1], 'base64');
}

module.exports = {
  loadImageSource,
  createCanvas,
  getOpaqueBounds,
  placeProductOnBackdrop,
  frameToAspect,
  canvasToDataURL,
  dataURLToBuffer,
  drawSoftShadow
};

// flattenComposition lives in composition.js (async, object-stack aware)
