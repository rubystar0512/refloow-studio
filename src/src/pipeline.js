/* Refloow Photo Studio — catalog pipeline: remove BG → compose → frame → encode */

const { cutoutToCanvas } = require('./remove-bg');
const { renderBackgroundAsync, getSelectedBackgroundId } = require('./backgrounds');
const {
  loadImageSource,
  placeProductOnBackdrop,
  frameToAspect,
  canvasToDataURL,
  dataURLToBuffer,
  createCanvas
} = require('./compose');
const { getActivePipelineOptions, getPresetById } = require('./presets');

function hasTransparency(img) {
  const w = Math.min(img.naturalWidth || img.width, 64);
  const h = Math.min(img.naturalHeight || img.height, 64);
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

/**
 * @param {string|HTMLImageElement|File} imageSource
 * @param {object} options overrides for getActivePipelineOptions
 * @returns {Promise<{ canvas: HTMLCanvasElement, dataURL: string, buffer: Buffer, format: string }>}
 */
async function runPipeline(imageSource, options = {}) {
  const opts = getActivePipelineOptions(options);
  const bgId = opts.bgId || getSelectedBackgroundId();

  let cutoutCanvas;
  let cutoutDataURL = null;

  // Prefer an existing cutout (lets users swap backgrounds without re-running AI)
  if (options.cutoutSource) {
    const cutoutImg = await loadImageSource(options.cutoutSource);
    cutoutCanvas = createCanvas(cutoutImg.naturalWidth || cutoutImg.width, cutoutImg.naturalHeight || cutoutImg.height);
    cutoutCanvas.getContext('2d').drawImage(cutoutImg, 0, 0);
    cutoutDataURL = typeof options.cutoutSource === 'string' && options.cutoutSource.startsWith('data:')
      ? options.cutoutSource
      : cutoutCanvas.toDataURL('image/png');
  } else {
    const img = await loadImageSource(imageSource);
    if (opts.removeBg && !hasTransparency(img)) {
      cutoutCanvas = await cutoutToCanvas(img);
      cutoutDataURL = cutoutCanvas.toDataURL('image/png');
    } else if (hasTransparency(img)) {
      cutoutCanvas = createCanvas(img.naturalWidth, img.naturalHeight);
      cutoutCanvas.getContext('2d').drawImage(img, 0, 0);
      cutoutDataURL = cutoutCanvas.toDataURL('image/png');
    } else {
      cutoutCanvas = createCanvas(img.naturalWidth, img.naturalHeight);
      cutoutCanvas.getContext('2d').drawImage(img, 0, 0);
      cutoutDataURL = null;
    }
  }

  // Determine output stage size from aspect / source
  const preset = getPresetById(opts.presetId);
  const maxSide = (opts.output && opts.output.maxSide) || preset.output.maxSide || 2000;
  let stageW;
  let stageH;

  if (opts.aspect) {
    if (opts.aspect >= 1) {
      stageW = maxSide;
      stageH = Math.round(maxSide / opts.aspect);
    } else {
      stageH = maxSide;
      stageW = Math.round(maxSide * opts.aspect);
    }
  } else {
    const srcMax = Math.max(cutoutCanvas.width, cutoutCanvas.height);
    const scale = srcMax > maxSide ? maxSide / srcMax : 1;
    stageW = Math.round(cutoutCanvas.width * scale);
    stageH = Math.round(cutoutCanvas.height * scale);
  }

  const backdrop = await renderBackgroundAsync(bgId, stageW, stageH);
  placeProductOnBackdrop(cutoutCanvas, backdrop, {
    paddingPct: opts.paddingPct,
    shadow: opts.shadow
  });

  let finalCanvas = backdrop;
  if (!opts.skipFrame && opts.aspect) {
    finalCanvas = frameToAspect(backdrop, opts.aspect, maxSide);
  }

  const format = (opts.output && opts.output.format) || 'png';
  const quality = (opts.output && opts.output.quality) != null ? opts.output.quality : 0.92;
  const dataURL = canvasToDataURL(finalCanvas, format, quality);
  const buffer = dataURLToBuffer(dataURL);

  return { canvas: finalCanvas, dataURL, buffer, format, cutoutDataURL };
}

/**
 * Apply pipeline result to the editor base image.
 */
function applyResultToEditor(imageElement, dataURL, onDone) {
  imageElement.onload = () => {
    imageElement.style.display = 'block';
    const ph = document.getElementById('placeholder-text');
    if (ph) ph.style.display = 'none';
    if (onDone) onDone();
  };
  imageElement.src = dataURL;
}

module.exports = {
  runPipeline,
  applyResultToEditor,
  hasTransparency
};
