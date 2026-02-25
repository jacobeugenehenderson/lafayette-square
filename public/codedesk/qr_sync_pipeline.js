// Lafayette Square QR — Sync pipeline
// Local-first persistence: localStorage is authoritative, API syncs in background
"use strict";

// Legacy stubs — other modules may still reference these
window.codedeskPushWorkingDebounced = function(){};
window.codedeskPushWorkingNow = async function(){ return false; };
window.codedeskSyncFileRoomNow = async function(){ return false; };
window.codedeskSyncFileRoomDebounced = function(){};

// No filename gate for Lafayette Square
window.__CODEDESK_FILENAME_ACCEPTED__ = true;
window.__CODEDESK_SETUP_DONE__ = true;

// =====================================================
//  LOCAL STORAGE LAYER (instant, authoritative)
// =====================================================
var LSQ_DESIGN_PREFIX = 'lsq-qr-design-';
var LSQ_IMAGE_PREFIX = 'lsq-qr-image-';

function _lsqGetCurrentType() {
  var sel = document.getElementById('qrType');
  return sel ? (sel.value || 'Townie') : 'Townie';
}

function _lsqDesignKey(bizId, type) {
  return LSQ_DESIGN_PREFIX + bizId + '-' + (type || _lsqGetCurrentType());
}

function _lsqImageKey(bizId, type) {
  return LSQ_IMAGE_PREFIX + bizId + '-' + (type || _lsqGetCurrentType());
}

function _lsqSaveLocal(bizId, state, type) {
  if (!bizId) return;
  try {
    localStorage.setItem(_lsqDesignKey(bizId, type), JSON.stringify(state));
  } catch (e) {}
}

function _lsqLoadLocal(bizId, type) {
  if (!bizId) return null;
  try {
    var raw = localStorage.getItem(_lsqDesignKey(bizId, type));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function _lsqSaveImage(bizId, dataUrl, type) {
  if (!bizId || !dataUrl) return;
  try {
    localStorage.setItem(_lsqImageKey(bizId, type), dataUrl);
  } catch (e) {}
}

// =====================================================
//  API LAYER (background, non-blocking)
// =====================================================
function _lsqSaveRemote(bizId, state, type) {
  if (!bizId || !window.LSQ_API_URL) return;
  var key = bizId + '-' + (type || _lsqGetCurrentType());
  try {
    fetch(window.LSQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveDesign', bizId: key, design: state })
    }).catch(function() {}); // silent fail — localStorage is primary
  } catch (e) {}
}

async function _lsqLoadRemote(bizId, type) {
  if (!bizId || !window.LSQ_API_URL) return null;
  var key = bizId + '-' + (type || _lsqGetCurrentType());
  try {
    var res = await fetch(
      window.LSQ_API_URL + '?action=getDesign&bizId=' + encodeURIComponent(key)
    );
    var data = await res.json();
    return (data && data.design) || null;
  } catch (e) { return null; }
}

// =====================================================
//  DEBOUNCE TIMERS
// =====================================================
var _lsqLocalTimer = null;
var _lsqRemoteTimer = null;
var LOCAL_DEBOUNCE_MS = 500;
var REMOTE_DEBOUNCE_MS = 3000;

function _lsqGetCurrentBizId() {
  var sel = document.getElementById('bizSelect');
  return sel ? (sel.value || '').trim() : '';
}

function _lsqSaveDebounced() {
  // Don't save during import (prevents save-during-load loops)
  if (window.__CODEDESK_IMPORTING_STATE__) return;

  var bizId = _lsqGetCurrentBizId();
  if (!bizId) return;

  // Debounce local save (500ms)
  clearTimeout(_lsqLocalTimer);
  _lsqLocalTimer = setTimeout(function() {
    if (typeof window.codedeskExportState !== 'function') return;
    var state = window.codedeskExportState();
    _lsqSaveLocal(bizId, state);
  }, LOCAL_DEBOUNCE_MS);

  // Debounce remote save (3s)
  clearTimeout(_lsqRemoteTimer);
  _lsqRemoteTimer = setTimeout(function() {
    if (typeof window.codedeskExportState !== 'function') return;
    var state = window.codedeskExportState();
    _lsqSaveRemote(bizId, state);
  }, REMOTE_DEBOUNCE_MS);
}

// =====================================================
//  RENDER HOOK — auto-save after every render()
// =====================================================
(function hookRenderForAutoSave() {
  // Wait for render engine to be available, then wrap render()
  var _hookInstalled = false;

  function installHook() {
    if (_hookInstalled) return;
    if (typeof window.render !== 'function') return;

    var _originalRender = window.render;
    window.render = function lsqAutoSaveRender() {
      var result = _originalRender.apply(this, arguments);
      // Auto-save after render completes
      _lsqSaveDebounced();
      return result;
    };

    _hookInstalled = true;
  }

  // Try immediately, then poll until render exists
  installHook();
  if (!_hookInstalled) {
    var attempts = 0;
    var iv = setInterval(function() {
      attempts++;
      installHook();
      if (_hookInstalled || attempts > 100) clearInterval(iv);
    }, 100);
  }
})();

// =====================================================
//  BEFOREUNLOAD — immediate save on tab close
// =====================================================
window.addEventListener('beforeunload', function() {
  var bizId = _lsqGetCurrentBizId();
  if (!bizId) return;
  if (typeof window.codedeskExportState !== 'function') return;

  var type = _lsqGetCurrentType();
  var state = window.codedeskExportState();

  // Immediate localStorage save
  _lsqSaveLocal(bizId, state, type);

  // Best-effort API save via sendBeacon
  if (navigator.sendBeacon && window.LSQ_API_URL) {
    var key = bizId + '-' + type;
    try {
      navigator.sendBeacon(
        window.LSQ_API_URL,
        JSON.stringify({ action: 'saveDesign', bizId: key, design: state })
      );
    } catch (e) {}
  }
});

// =====================================================
//  LOAD ON BUSINESS SELECTION
// =====================================================
function _lsqOnBusinessSelect(bizId, type) {
  if (!bizId) return;
  var t = type || _lsqGetCurrentType();

  // Layer 1: Immediate load from localStorage
  var local = _lsqLoadLocal(bizId, t);
  if (local && typeof window.codedeskImportState === 'function') {
    window.codedeskImportState(local);
  }

  // Layer 2: Background load from API (merge if newer)
  _lsqLoadRemote(bizId, t).then(function(remote) {
    if (!remote) return;
    var localTs = local ? (local.at || 0) : 0;
    var remoteTs = remote.at || 0;
    if (remoteTs > localTs) {
      // Remote is newer — update localStorage and re-import
      _lsqSaveLocal(bizId, remote, t);
      if (typeof window.codedeskImportState === 'function') {
        window.codedeskImportState(remote);
      }
    }
  }).catch(function() {});
}

// On QR type switch: save current type, load new type
function _lsqOnTypeSwitch(newType) {
  var bizId = _lsqGetCurrentBizId();
  if (!bizId) return;

  // Save current design + image for the OLD type before switching
  var oldType = window.__lsq_last_type || 'Townie';
  if (typeof window.codedeskExportState === 'function') {
    var state = window.codedeskExportState();
    _lsqSaveLocal(bizId, state, oldType);
    _lsqSaveRemote(bizId, state, oldType);
    // Save rendered image for old type
    if (typeof window.codedeskExportPngDataUrl === 'function') {
      window.codedeskExportPngDataUrl(2).then(function(dataUrl) {
        _lsqSaveImage(bizId, dataUrl, oldType);
      }).catch(function() {});
    }
  }

  window.__lsq_last_type = newType;

  // Load new type's design
  _lsqOnBusinessSelect(bizId, newType);
}

// Track type changes
(function wireTypeSwitch() {
  function wire() {
    var sel = document.getElementById('qrType');
    if (!sel || sel.__lsq_type_wired) return;
    sel.__lsq_type_wired = true;
    window.__lsq_last_type = sel.value || 'Townie';

    sel.addEventListener('change', function() {
      _lsqOnTypeSwitch(sel.value);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
  setTimeout(wire, 500);
})();

// Hook into bizSelect changes
(function wireBizSelectSync() {
  function wire() {
    var sel = document.getElementById('bizSelect');
    if (!sel) return;
    if (sel.__lsq_sync_wired) return;
    sel.__lsq_sync_wired = true;

    sel.addEventListener('change', function() {
      var bizId = (sel.value || '').trim();
      if (bizId) _lsqOnBusinessSelect(bizId);
    });
  }

  // bizSelect is dynamically created by renderTypeForm, so we observe
  var observer = new MutationObserver(function() { wire(); });
  var target = document.getElementById('detailsPanel');
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }

  // Also try wiring on DOMContentLoaded and after a delay
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
  setTimeout(wire, 500);
  setTimeout(wire, 2000);
})();

// =====================================================
//  UNLOCK STEPPER (no filename gate)
// =====================================================
(function unlockStepperOnReady() {
  function unlock() {
    try {
      if (typeof window.codedeskSetLocked === 'function') {
        window.codedeskSetLocked(false);
      }
    } catch(e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', unlock, { once: true });
  } else {
    unlock();
  }
})();
