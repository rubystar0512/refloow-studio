/* Refloow Photo Studio — local U-2-Netp background removal */

const ort = require('onnxruntime-web');
const fs = require('fs');
const path = require('path');

ort.env.wasm.numThreads = 1;

let session = null;
const MODEL_SIZE = 320;

async function ensureSession() {
  if (session) return session;
  const modelPath = path.join(__dirname, 'ai-models/background-removal/U-2-Netp/model.onnx');
  const modelData = fs.readFileSync(modelPath);
  const modelBuffer = new Uint8Array(modelData).buffer;
  session = await ort.InferenceSession.create(modelBuffer, { executionProviders: ['wasm'] });
  return session;
}

/**
 * Run inference and return a MODEL_SIZE mask canvas (alpha channel).
 */
async function inferMask(imageElement) {
  const sess = await ensureSession();

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = MODEL_SIZE;
  tempCanvas.height = MODEL_SIZE;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(imageElement, 0, 0, MODEL_SIZE, MODEL_SIZE);

  const imgData = tempCtx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const floatArray = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);

  for (let i = 0; i < MODEL_SIZE * MODEL_SIZE; i++) {
    const r = imgData[i * 4] / 255.0;
    const g = imgData[i * 4 + 1] / 255.0;
    const b = imgData[i * 4 + 2] / 255.0;
    floatArray[i] = (r - 0.485) / 0.229;
    floatArray[i + MODEL_SIZE * MODEL_SIZE] = (g - 0.456) / 0.224;
    floatArray[i + 2 * MODEL_SIZE * MODEL_SIZE] = (b - 0.406) / 0.225;
  }

  const inputTensor = new ort.Tensor('float32', floatArray, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const feeds = {};
  feeds[sess.inputNames[0]] = inputTensor;

  const results = await sess.run(feeds);
  const outputTensor = results[sess.outputNames[0]];
  const rawData = outputTensor.data;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < rawData.length; i++) {
    if (rawData[i] < min) min = rawData[i];
    if (rawData[i] > max) max = rawData[i];
  }
  if (max - min === 0) max = min + 0.0001;

  const maskImageData = new ImageData(MODEL_SIZE, MODEL_SIZE);
  for (let i = 0; i < rawData.length; ++i) {
    const normalized = (rawData[i] - min) / (max - min);
    const alpha = Math.round(normalized * 255);
    const offset = i * 4;
    maskImageData.data[offset] = 0;
    maskImageData.data[offset + 1] = 0;
    maskImageData.data[offset + 2] = 0;
    maskImageData.data[offset + 3] = alpha;
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = MODEL_SIZE;
  maskCanvas.height = MODEL_SIZE;
  maskCanvas.getContext('2d').putImageData(maskImageData, 0, 0);
  return maskCanvas;
}

/**
 * Apply mask canvas onto image → transparent PNG canvas (does not mutate DOM).
 */
function applyMask(imageElement, maskCanvas) {
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = imageElement.naturalWidth || imageElement.width;
  finalCanvas.height = imageElement.naturalHeight || imageElement.height;
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.drawImage(imageElement, 0, 0);
  finalCtx.globalCompositeOperation = 'destination-in';
  finalCtx.drawImage(maskCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
  return finalCanvas;
}

/**
 * Cut out background → returns canvas with transparency.
 */
async function cutoutToCanvas(imageElement) {
  const mask = await inferMask(imageElement);
  return applyMask(imageElement, mask);
}

/**
 * DOM-friendly API used by Edit mode (mutates imageElement.src).
 * Callback receives the cutout PNG data URL so callers never re-read an unloaded <img>.
 */
async function removeBackground(imageElement, callback) {
  if (!imageElement.src || imageElement.src === window.location.href) {
    if (callback) callback(null);
    return;
  }

  try {
    const canvas = await cutoutToCanvas(imageElement);
    const dataURL = canvas.toDataURL('image/png');
    await new Promise((resolve, reject) => {
      const onLoad = () => {
        imageElement.removeEventListener('load', onLoad);
        imageElement.removeEventListener('error', onError);
        resolve();
      };
      const onError = (err) => {
        imageElement.removeEventListener('load', onLoad);
        imageElement.removeEventListener('error', onError);
        reject(err);
      };
      imageElement.addEventListener('load', onLoad);
      imageElement.addEventListener('error', onError);
      imageElement.src = dataURL;
    });
    if (callback) callback(dataURL);
  } catch (error) {
    console.error('Failed to remove background:', error);
    if (callback) callback(null);
  }
}

module.exports = {
  ensureSession,
  inferMask,
  applyMask,
  cutoutToCanvas,
  removeBackground
};
