/* Refloow Photo Studio — marketplace / catalog framing presets */

const PRESETS = [
  {
    id: 'amazon-1x1',
    label: 'Amazon 1:1',
    aspect: 1,
    paddingPct: 0.075,
    defaultBgId: 'pure-white',
    shadow: false,
    output: { format: 'png', quality: 0.95, maxSide: 2000 }
  },
  {
    id: 'social-4x5',
    label: 'Social 4:5',
    aspect: 4 / 5,
    paddingPct: 0.08,
    defaultBgId: 'softbox-white',
    shadow: true,
    output: { format: 'jpeg', quality: 0.92, maxSide: 1800 }
  },
  {
    id: 'banner-16x9',
    label: 'Banner 16:9',
    aspect: 16 / 9,
    paddingPct: 0.1,
    defaultBgId: 'cool-studio',
    shadow: true,
    output: { format: 'jpeg', quality: 0.9, maxSide: 1920 }
  },
  {
    id: 'original',
    label: 'Original',
    aspect: null,
    paddingPct: 0.05,
    defaultBgId: 'pure-white',
    shadow: false,
    output: { format: 'png', quality: 0.95, maxSide: 4000 }
  }
];

let selectedPresetId = 'amazon-1x1';
let paddingOverride = null;
let shadowOverride = null;

function getPresets() {
  return PRESETS.slice();
}

function getPresetById(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

function getSelectedPresetId() {
  return selectedPresetId;
}

function setSelectedPresetId(id) {
  if (getPresetById(id)) selectedPresetId = id;
}

function getPaddingPct() {
  if (paddingOverride != null) return paddingOverride;
  return getPresetById(selectedPresetId).paddingPct;
}

function setPaddingPct(value) {
  paddingOverride = value;
}

function getShadowEnabled() {
  if (shadowOverride != null) return shadowOverride;
  return !!getPresetById(selectedPresetId).shadow;
}

function setShadowEnabled(value) {
  shadowOverride = !!value;
}

function resetOverrides() {
  paddingOverride = null;
  shadowOverride = null;
}

/** Effective options for pipeline from current UI state */
function getActivePipelineOptions(extra = {}) {
  const preset = getPresetById(selectedPresetId);
  return {
    presetId: preset.id,
    aspect: preset.aspect,
    paddingPct: getPaddingPct(),
    shadow: getShadowEnabled(),
    bgId: extra.bgId,
    removeBg: extra.removeBg !== false,
    skipFrame: extra.skipFrame === true,
    output: { ...preset.output, ...(extra.output || {}) }
  };
}

module.exports = {
  PRESETS,
  getPresets,
  getPresetById,
  getSelectedPresetId,
  setSelectedPresetId,
  getPaddingPct,
  setPaddingPct,
  getShadowEnabled,
  setShadowEnabled,
  resetOverrides,
  getActivePipelineOptions
};
