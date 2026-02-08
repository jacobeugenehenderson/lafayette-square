// Lafayette Square QR — State Engine
// Keeps: export/import state, style knob IDs, value helpers
// Removed: working file management, Ascend notifications
"use strict";

function safeId(id){ return typeof id === 'string' && id.trim() ? id.trim() : ''; }

function _getValueById(id){
  var el = document.getElementById(id);
  if (!el) return undefined;
  if (el.type === 'checkbox') return !!el.checked;
  return (el.value ?? '');
}
window._getValueById = _getValueById;

function _setValueById(id, value){
  var el = document.getElementById(id);
  if (!el) return;
  if (el.type === 'checkbox'){
    el.checked = !!value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.value = String(value ?? '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function val(id){
  var v = _getValueById(id);
  return (v == null) ? '' : v;
}

// The canonical list of "style knobs" (DOM element IDs for design controls)
var CODEDESK_STYLE_IDS = [
  'fontFamily',
  'campaign','captionBody',
  'captionColor','bodyColor',
  'eyeRingColor','eyeCenterColor',
  'bgTransparent','bgTopHex','bgBottomHex','bgTopAlpha','bgBottomAlpha',
  'moduleShape','eyeRingShape','eyeCenterShape',
  'modulesMode','modulesEmoji','modulesScale',
  'centerMode','centerEmoji','centerScale',
  'eyeCenterMode','eyeCenterEmoji','eyeCenterScale'
];

// Build a stable export payload
window.codedeskExportState = function codedeskExportState(){
  var payload = { v: 1, at: Date.now(), fields: {}, style: {} };

  var typeSel = document.getElementById('qrType');
  payload.type = typeSel ? (typeSel.value || '') : '';

  // Export type-specific fields from detailsPanel
  var details = document.getElementById('detailsPanel');
  if (details){
    details.querySelectorAll('input[id],select[id],textarea[id]').forEach(function(n) {
      var id = safeId(n.id);
      if (!id) return;
      payload.fields[id] = _getValueById(id);
    });
  }

  // Export known style knobs
  CODEDESK_STYLE_IDS.forEach(function(id) {
    payload.style[id] = _getValueById(id);
  });

  // Persist ECC + font session keys if present
  try { payload.ecc  = sessionStorage.getItem('codedesk_ecc')  || undefined; } catch(e){}
  try { payload.font = sessionStorage.getItem('codedesk_font') || undefined; } catch(e){}

  return payload;
};

// Import a previously exported state blob
window.codedeskImportState = function codedeskImportState(state){
  if (!state || typeof state !== 'object') return false;

  window.__CODEDESK_IMPORTING_STATE__ = true;

  try {
    // 1) Switch type
    var typeSel = document.getElementById('qrType');
    if (typeSel && state.type) {
      var desired = String(state.type).toLowerCase();
      var match = null;
      for (var i = 0; i < (typeSel.options || []).length; i++) {
        if (String(typeSel.options[i].value).toLowerCase() === desired) {
          match = typeSel.options[i].value;
          break;
        }
      }
      if (match && typeSel.value !== match) {
        typeSel.value = match;
        typeSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 2) Restore type-specific fields
    var fields = state.fields || {};
    Object.keys(fields).forEach(function(id) { _setValueById(id, fields[id]); });

    // 3) Restore style knobs
    var style = Object.assign({}, state.style || {});

    // Legacy aliases
    if (style.bgTopColor && !style.bgTopHex) style.bgTopHex = style.bgTopColor;
    if (style.bgBottomColor && !style.bgBottomHex) style.bgBottomHex = style.bgBottomColor;
    if (style.bgTopHex && !style.bgTopColor) style.bgTopColor = style.bgTopHex;
    if (style.bgBottomHex && !style.bgBottomColor) style.bgBottomColor = style.bgBottomHex;

    var _setStyleKnob = function(id, v) {
      _setValueById(id, v);
      if (/Color$/.test(id)) _setValueById(id.replace(/Color$/, 'Hex'), v);
      if (/Hex$/.test(id))   _setValueById(id.replace(/Hex$/,   'Color'), v);
    };

    Object.keys(style).forEach(function(id) { _setStyleKnob(id, style[id]); });

    // Re-apply gating
    try { typeof refreshBackground === 'function' && refreshBackground(); } catch(e){}
    try { typeof refreshModulesMode === 'function' && refreshModulesMode(); } catch(e){}
    try { typeof refreshCenter === 'function' && refreshCenter(); } catch(e){}
    try { typeof refreshEyeCenter === 'function' && refreshEyeCenter(); } catch(e){}

    // 4) Restore ECC + font
    try { if (state.ecc && typeof setECC === 'function') setECC(state.ecc, { trigger: true }); } catch(e){}
    try { if (state.font && typeof setFont === 'function') setFont(state.font); } catch(e){}

    // 5) Repaint
    try { typeof window.refreshBackground === 'function' && window.refreshBackground(); } catch(e){}
    try { typeof render === 'function' && render(); } catch(e){}

    return true;
  } finally {
    queueMicrotask(function() { window.__CODEDESK_IMPORTING_STATE__ = false; });
  }
};
