/* Refloow Photo Studio — composition undo / redo / clipboard */

const composition = require('./composition');

const MAX = 40;
const undoStack = [];
const redoStack = [];
let clipboard = null;
let applying = false;
let lastPushAt = 0;

function snapshot() {
  const artboard = composition.getArtboard();
  const objects = composition.getObjects().map((o) => ({ ...o }));
  return {
    artboard: { ...artboard },
    objects,
    selectedId: composition.getSelectedId()
  };
}

function cloneState(state) {
  return {
    artboard: { ...state.artboard },
    objects: state.objects.map((o) => ({ ...o })),
    selectedId: state.selectedId
  };
}

async function restore(state) {
  applying = true;
  try {
    composition.restoreState(cloneState(state));
    await composition.renderAll();
    if (state.selectedId && composition.getObject(state.selectedId)) {
      composition.select(state.selectedId);
    } else {
      composition.clearSelection();
    }
  } finally {
    applying = false;
  }
}

function pushHistory(force) {
  if (applying) return;
  const now = Date.now();
  if (!force && now - lastPushAt < 140 && undoStack.length) {
    undoStack[undoStack.length - 1] = snapshot();
    lastPushAt = now;
    return;
  }
  lastPushAt = now;
  undoStack.push(snapshot());
  if (undoStack.length > MAX) undoStack.shift();
  redoStack.length = 0;
}

async function undo() {
  if (undoStack.length < 2) return false;
  const current = undoStack.pop();
  redoStack.push(current);
  const prev = undoStack[undoStack.length - 1];
  await restore(cloneState(prev));
  return true;
}

async function redo() {
  if (!redoStack.length) return false;
  const next = redoStack.pop();
  undoStack.push(cloneState(next));
  await restore(cloneState(next));
  return true;
}

function copySelected() {
  const obj = composition.getSelected();
  if (!obj || obj.type === 'background') return false;
  clipboard = { ...obj };
  return true;
}

function cutSelected() {
  const obj = composition.getSelected();
  if (!obj || obj.type === 'background' || obj.locked) return false;
  clipboard = { ...obj };
  composition.removeObject(obj.id);
  return true;
}

async function pasteClipboard() {
  if (!clipboard) return null;
  if (clipboard.type === 'product' && !composition.getProduct()) {
    const copy = { ...clipboard, id: 'obj-product', name: 'Product' };
    composition.restoreObject(copy);
    await composition.renderAll();
    return copy;
  }
  const src = clipboard.src;
  if (!src) return null;
  const overlay = composition.addOverlay(src, (clipboard.name || 'Paste') + ' copy');
  composition.updateObject(overlay.id, {
    x: (clipboard.x || 0) + 24,
    y: (clipboard.y || 0) + 24,
    w: clipboard.w,
    h: clipboard.h,
    rotation: clipboard.rotation || 0,
    opacity: clipboard.opacity != null ? clipboard.opacity : 1,
    flipX: !!clipboard.flipX,
    flipY: !!clipboard.flipY
  });
  return overlay;
}

function deleteSelected() {
  const obj = composition.getSelected();
  if (!obj || obj.locked) return false;
  if (obj.type === 'background') return false;
  composition.removeObject(obj.id);
  return true;
}

function canUndo() {
  return undoStack.length >= 2;
}

function canRedo() {
  return redoStack.length > 0;
}

function initHistoryTracking() {
  undoStack.length = 0;
  redoStack.length = 0;
  undoStack.push(snapshot());

  composition.onChange((event) => {
    if (applying) return;
    if (event === 'select' || event === 'render' || event === 'artboard') return;
    pushHistory(false);
  });
}

module.exports = {
  pushHistory,
  undo,
  redo,
  copySelected,
  cutSelected,
  pasteClipboard,
  deleteSelected,
  initHistoryTracking,
  snapshot,
  canUndo,
  canRedo
};
