/* Refloow Photo Studio — selection transform handles (move / resize / rotate) */

const composition = require('./composition');

const SNAP = 12; // artboard units
let active = null; // { mode, handle, start, objSnapshot }
let guidesEl = null;

function stageEl() {
  return document.getElementById('composition-stage');
}

function ensureGuides() {
  const stage = stageEl();
  if (!stage) return null;
  if (!guidesEl) {
    guidesEl = document.createElement('div');
    guidesEl.className = 'comp-guides';
    guidesEl.innerHTML = '<div class="guide-v"></div><div class="guide-h"></div>';
    stage.appendChild(guidesEl);
  }
  return guidesEl;
}

function showGuides(showV, showH) {
  const g = ensureGuides();
  if (!g) return;
  g.classList.toggle('show-v', !!showV);
  g.classList.toggle('show-h', !!showH);
}

function hideGuides() {
  if (guidesEl) {
    guidesEl.classList.remove('show-v', 'show-h');
  }
}

function ensureHandles() {
  let box = document.getElementById('transform-box');
  if (box) return box;
  const stage = stageEl();
  if (!stage) return null;
  box = document.createElement('div');
  box.id = 'transform-box';
  box.className = 'transform-box';
  box.innerHTML = `
    <div class="tf-border"></div>
    <div class="tf-handle" data-handle="nw"></div>
    <div class="tf-handle" data-handle="n"></div>
    <div class="tf-handle" data-handle="ne"></div>
    <div class="tf-handle" data-handle="e"></div>
    <div class="tf-handle" data-handle="se"></div>
    <div class="tf-handle" data-handle="s"></div>
    <div class="tf-handle" data-handle="sw"></div>
    <div class="tf-handle" data-handle="w"></div>
    <div class="tf-rotate" data-handle="rotate" title="Rotate"></div>
    <div class="tf-angle" id="tf-angle-label"></div>
  `;
  stage.appendChild(box);
  return box;
}

function syncHandles() {
  const box = ensureHandles();
  if (!box) return;
  const obj = composition.getSelected();
  if (!obj || !obj.visible) {
    box.style.display = 'none';
    return;
  }
  const s = composition.stageScale();
  box.style.display = 'block';
  box.style.left = obj.x * s + 'px';
  box.style.top = obj.y * s + 'px';
  box.style.width = obj.w * s + 'px';
  box.style.height = obj.h * s + 'px';
  box.style.transform = `rotate(${obj.rotation}deg)`;
  box.classList.toggle('locked', !!obj.locked);
  const angle = document.getElementById('tf-angle-label');
  if (angle) angle.textContent = `${Math.round(obj.rotation)}°`;
}

function clientToArtboard(clientX, clientY) {
  const stage = stageEl();
  const s = composition.stageScale();
  const rect = stage.getBoundingClientRect();
  const zoom = window.editorZoomScale || 1;
  // stage is inside zoomed wrapper — getBoundingClientRect already includes zoom
  return {
    x: (clientX - rect.left) / (s * (rect.width / (composition.getArtboard().width * s))),
    y: (clientY - rect.top) / (s * (rect.height / (composition.getArtboard().height * s)))
  };
}

function artboardPointFromEvent(e) {
  const stage = stageEl();
  const rect = stage.getBoundingClientRect();
  const ab = composition.getArtboard();
  return {
    x: ((e.clientX - rect.left) / rect.width) * ab.width,
    y: ((e.clientY - rect.top) / rect.height) * ab.height
  };
}

function snapObject(obj) {
  const ab = composition.getArtboard();
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  let showV = false;
  let showH = false;
  if (Math.abs(cx - ab.width / 2) < SNAP) {
    obj.x = ab.width / 2 - obj.w / 2;
    showV = true;
  }
  if (Math.abs(cy - ab.height / 2) < SNAP) {
    obj.y = ab.height / 2 - obj.h / 2;
    showH = true;
  }
  showGuides(showV, showH);
}

function setupTransform() {
  const stage = stageEl();
  if (!stage) return;

  ensureHandles();
  ensureGuides();

  composition.onChange((event) => {
    if (event === 'select' || event === 'change' || event === 'render' || event === 'artboard') {
      syncHandles();
    }
  });

  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest('[data-handle]');
    const objEl = e.target.closest('.comp-object');

    if (handle && composition.getSelected()) {
      e.preventDefault();
      e.stopPropagation();
      window.__transformActive = true;
      startHandleAction(handle.dataset.handle, e);
      return;
    }

    if (objEl) {
      e.preventDefault();
      e.stopPropagation();
      const id = objEl.dataset.id;
      composition.select(id);
      const obj = composition.getObject(id);
      if (obj && !obj.locked) {
        window.__transformActive = true;
        startHandleAction('move', e);
      }
      return;
    }

    // click empty artboard → deselect (allow pan)
    if (e.target === stage || e.target.classList.contains('comp-guides')) {
      composition.clearSelection();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!active) return;
    e.preventDefault();
    onPointerMove(e);
  });

  window.addEventListener('mouseup', () => {
    if (!active) return;
    active = null;
    window.__transformActive = false;
    hideGuides();
    syncHandles();
  });

  // Keyboard nudge / rotate
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const obj = composition.getSelected();
    if (!obj || obj.locked) return;

    const step = e.shiftKey ? 10 : 1;
    let changed = false;

    if (e.key === 'ArrowLeft') {
      obj.x -= step;
      changed = true;
    } else if (e.key === 'ArrowRight') {
      obj.x += step;
      changed = true;
    } else if (e.key === 'ArrowUp') {
      obj.y -= step;
      changed = true;
    } else if (e.key === 'ArrowDown') {
      obj.y += step;
      changed = true;
    } else if (e.key === '[') {
      obj.rotation -= e.shiftKey ? 15 : 1;
      changed = true;
    } else if (e.key === ']') {
      obj.rotation += e.shiftKey ? 15 : 1;
      changed = true;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // Handled by global shortcuts in renderer (product + overlay)
      return;
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      composition.duplicateObject(obj.id);
      return;
    }

    if (changed) {
      e.preventDefault();
      composition.updateObject(obj.id, {
        x: obj.x,
        y: obj.y,
        rotation: obj.rotation
      });
      syncHandles();
    }
  });

  syncHandles();
}

function startHandleAction(handle, e) {
  const obj = composition.getSelected();
  if (!obj) return;
  const pt = artboardPointFromEvent(e);
  active = {
    mode: handle,
    start: pt,
    shift: e.shiftKey,
    snapshot: {
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      rotation: obj.rotation
    },
    aspect: obj.w / obj.h
  };
}

function onPointerMove(e) {
  const obj = composition.getSelected();
  if (!obj || !active || obj.locked) return;
  const pt = artboardPointFromEvent(e);
  const dx = pt.x - active.start.x;
  const dy = pt.y - active.start.y;
  const snap = { ...active.snapshot };
  const keepAspect = e.shiftKey || obj.type === 'product';
  const mode = active.mode;

  if (mode === 'move') {
    obj.x = snap.x + dx;
    obj.y = snap.y + dy;
    if (obj.type !== 'background') snapObject(obj);
  } else if (mode === 'rotate') {
    const cx = snap.x + snap.w / 2;
    const cy = snap.y + snap.h / 2;
    let ang = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI + 90;
    if (e.shiftKey) ang = Math.round(ang / 15) * 15;
    obj.rotation = ang;
  } else {
    // resize
    let { x, y, w, h } = snap;
    if (mode.includes('e')) w = Math.max(20, snap.w + dx);
    if (mode.includes('s')) h = Math.max(20, snap.h + dy);
    if (mode.includes('w')) {
      w = Math.max(20, snap.w - dx);
      x = snap.x + (snap.w - w);
    }
    if (mode.includes('n')) {
      h = Math.max(20, snap.h - dy);
      y = snap.y + (snap.h - h);
    }
    if (keepAspect && (mode === 'nw' || mode === 'ne' || mode === 'sw' || mode === 'se')) {
      const aspect = active.aspect;
      if (Math.abs(dx) > Math.abs(dy)) {
        h = w / aspect;
        if (mode.includes('n')) y = snap.y + snap.h - h;
      } else {
        w = h * aspect;
        if (mode.includes('w')) x = snap.x + snap.w - w;
      }
    }
    if (obj.type === 'background') {
      // background stays full-bleed — ignore resize
      return;
    }
    obj.x = x;
    obj.y = y;
    obj.w = w;
    obj.h = h;
  }

  composition.updateObject(obj.id, {
    x: obj.x,
    y: obj.y,
    w: obj.w,
    h: obj.h,
    rotation: obj.rotation
  });
  syncHandles();
}

function isTransformTarget(target) {
  return !!(
    target &&
    target.closest &&
    (target.closest('.comp-object') || target.closest('#transform-box') || target.closest('[data-handle]'))
  );
}

module.exports = {
  setupTransform,
  syncHandles,
  isTransformTarget
};
