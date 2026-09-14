/* Refloow Photo Studio — objects list + selected object props */

const composition = require('./composition');

function setupObjectsUI(hooks = {}) {
  const listEl = document.getElementById('objects-list');
  const propsEl = document.getElementById('object-props');
  const emptyProps = document.getElementById('object-props-empty');

  function refreshList() {
    if (!listEl) return;
    const selected = composition.getSelectedId();
    listEl.innerHTML = '';
    // show top-first in UI
    const objs = composition.getObjects().slice().reverse();
    objs.forEach((obj) => {
      const row = document.createElement('div');
      row.className = 'object-row' + (obj.id === selected ? ' active' : '');
      row.dataset.id = obj.id;
      row.innerHTML = `
        <button type="button" class="obj-vis" title="Visibility">${obj.visible ? '👁' : '⊘'}</button>
        <button type="button" class="obj-lock" title="Lock">${obj.locked ? '🔒' : '🔓'}</button>
        <button type="button" class="obj-name" title="Select">
          <span class="obj-type">${obj.type}</span>
          <span class="obj-label">${obj.name}</span>
        </button>
        <button type="button" class="obj-up" title="Bring forward">▲</button>
        <button type="button" class="obj-down" title="Send backward">▼</button>
        <button type="button" class="obj-del" title="Delete" ${obj.type === 'background' ? 'disabled' : ''}>✕</button>
      `;
      row.querySelector('.obj-name').addEventListener('click', () => composition.select(obj.id));
      row.querySelector('.obj-vis').addEventListener('click', () => {
        composition.updateObject(obj.id, { visible: !obj.visible });
        refreshAll();
      });
      row.querySelector('.obj-lock').addEventListener('click', () => {
        composition.updateObject(obj.id, { locked: !obj.locked });
        refreshAll();
      });
      row.querySelector('.obj-up').addEventListener('click', () => {
        composition.reorderObject(obj.id, 'up');
        refreshAll();
      });
      row.querySelector('.obj-down').addEventListener('click', () => {
        composition.reorderObject(obj.id, 'down');
        refreshAll();
      });
      row.querySelector('.obj-del').addEventListener('click', () => {
        composition.removeObject(obj.id);
        refreshAll();
      });
      listEl.appendChild(row);
    });
  }

  function bindNum(id, key, parse = Number) {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = el.oninput = () => {
      const obj = composition.getSelected();
      if (!obj || obj.locked) return;
      const val = parse(el.value);
      if (Number.isNaN(val)) return;
      const patch = { [key]: val };
      if (obj.type === 'background' && (key === 'x' || key === 'y' || key === 'w' || key === 'h')) return;
      composition.updateObject(obj.id, patch);
      if (hooks.onTransform) hooks.onTransform();
    };
  }

  function refreshProps() {
    const obj = composition.getSelected();
    if (propsEl) propsEl.style.display = obj ? 'block' : 'none';
    if (emptyProps) emptyProps.style.display = obj ? 'none' : 'block';
    if (!obj) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) el.value = val;
    };
    set('prop-name', obj.name);
    set('prop-x', Math.round(obj.x));
    set('prop-y', Math.round(obj.y));
    set('prop-w', Math.round(obj.w));
    set('prop-h', Math.round(obj.h));
    set('prop-rot', Math.round(obj.rotation));
    set('prop-opacity', Math.round(obj.opacity * 100));
    const opLabel = document.getElementById('prop-opacity-val');
    if (opLabel) opLabel.textContent = Math.round(obj.opacity * 100) + '%';

    const typeBadge = document.getElementById('prop-type-badge');
    if (typeBadge) typeBadge.textContent = obj.type;

    const productActions = document.getElementById('product-object-actions');
    if (productActions) productActions.style.display = obj.type === 'product' ? 'flex' : 'none';
  }

  function refreshAll() {
    refreshList();
    refreshProps();
    const hint = document.getElementById('objects-empty-hint');
    if (hint) hint.style.display = composition.hasComposition() ? 'none' : 'block';
    if (hooks.onRefresh) hooks.onRefresh();
  }

  bindNum('prop-x', 'x');
  bindNum('prop-y', 'y');
  bindNum('prop-w', 'w');
  bindNum('prop-h', 'h');
  bindNum('prop-rot', 'rotation');

  const opacity = document.getElementById('prop-opacity');
  if (opacity) {
    opacity.oninput = () => {
      const obj = composition.getSelected();
      if (!obj || obj.locked) return;
      composition.updateObject(obj.id, { opacity: Number(opacity.value) / 100 });
      refreshProps();
    };
  }

  const nameInput = document.getElementById('prop-name');
  if (nameInput) {
    nameInput.onchange = () => {
      const obj = composition.getSelected();
      if (!obj) return;
      composition.updateObject(obj.id, { name: nameInput.value || obj.name });
      refreshList();
    };
  }

  const flipH = document.getElementById('btn-flip-h');
  const flipV = document.getElementById('btn-flip-v');
  if (flipH) {
    flipH.onclick = () => {
      const obj = composition.getSelected();
      if (!obj || obj.locked) return;
      composition.updateObject(obj.id, { flipX: !obj.flipX });
    };
  }
  if (flipV) {
    flipV.onclick = () => {
      const obj = composition.getSelected();
      if (!obj || obj.locked) return;
      composition.updateObject(obj.id, { flipY: !obj.flipY });
    };
  }

  const btnReset = document.getElementById('btn-reset-transform');
  if (btnReset) {
    btnReset.onclick = () => {
      composition.resetProductTransform();
      refreshAll();
    };
  }

  const btnDup = document.getElementById('btn-duplicate-object');
  if (btnDup) {
    btnDup.onclick = () => {
      const obj = composition.getSelected();
      if (!obj) return;
      composition.duplicateObject(obj.id);
      refreshAll();
    };
  }

  const btnBake = document.getElementById('btn-bake-flatten');
  if (btnBake && hooks.onBake) {
    btnBake.onclick = () => hooks.onBake();
  }

  composition.onChange(() => refreshAll());
  refreshAll();

  return { refreshAll, refreshList, refreshProps };
}

module.exports = { setupObjectsUI };
