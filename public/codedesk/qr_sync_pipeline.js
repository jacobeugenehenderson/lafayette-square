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

function _lsqGetCurrentBizId() {
  var sel = document.getElementById('bizSelect');
  return sel ? (sel.value || '').trim() : '';
}

// Storage key: lsq-qr-design-{bizId}-{type}
function _lsqDesignKey(bizId, type) {
  return LSQ_DESIGN_PREFIX + bizId + '-' + type;
}
function _lsqImageKey(bizId, type) {
  return LSQ_IMAGE_PREFIX + bizId + '-' + type;
}

function _lsqSaveLocal(bizId, state, type) {
  if (!bizId || !type) return;
  try { localStorage.setItem(_lsqDesignKey(bizId, type), JSON.stringify(state)); } catch (e) {}
}

function _lsqLoadLocal(bizId, type) {
  if (!bizId || !type) return null;
  try {
    var raw = localStorage.getItem(_lsqDesignKey(bizId, type));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function _lsqSaveImage(bizId, dataUrl, type) {
  if (!bizId || !dataUrl || !type) return;
  try { localStorage.setItem(_lsqImageKey(bizId, type), dataUrl); } catch (e) {}
}

// =====================================================
//  API LAYER (background, non-blocking)
// =====================================================
function _lsqSaveRemote(bizId, state, type) {
  if (!bizId || !type || !window.LSQ_API_URL) return;
  try {
    fetch(window.LSQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveDesign', bizId: bizId + '-' + type, design: state })
    }).catch(function() {});
  } catch (e) {}
}

async function _lsqLoadRemote(bizId, type) {
  if (!bizId || !type || !window.LSQ_API_URL) return null;
  try {
    var res = await fetch(
      window.LSQ_API_URL + '?action=getDesign&bizId=' + encodeURIComponent(bizId + '-' + type)
    );
    var data = await res.json();
    return (data && data.data && data.data.design) || null;
  } catch (e) { return null; }
}

// =====================================================
//  DEBOUNCE TIMERS
// =====================================================
var _lsqLocalTimer = null;
var _lsqRemoteTimer = null;
var LOCAL_DEBOUNCE_MS = 500;
var REMOTE_DEBOUNCE_MS = 3000;

function _lsqSaveDebounced() {
  if (window.__CODEDESK_IMPORTING_STATE__) return;

  var bizId = _lsqGetCurrentBizId();
  var type = _lsqGetCurrentType();
  if (!bizId) return;

  clearTimeout(_lsqLocalTimer);
  _lsqLocalTimer = setTimeout(function() {
    if (typeof window.codedeskExportState !== 'function') return;
    var state = window.codedeskExportState();
    _lsqSaveLocal(bizId, state, type);
  }, LOCAL_DEBOUNCE_MS);

  clearTimeout(_lsqRemoteTimer);
  _lsqRemoteTimer = setTimeout(function() {
    if (typeof window.codedeskExportState !== 'function') return;
    var state = window.codedeskExportState();
    _lsqSaveRemote(bizId, state, type);
  }, REMOTE_DEBOUNCE_MS);
}

// =====================================================
//  IMMEDIATE SAVE + IMAGE EXPORT (called by parent on Save)
// =====================================================
window._lsqSaveNow = function _lsqSaveNow() {
  var bizId = _lsqGetCurrentBizId();
  var type = _lsqGetCurrentType();
  if (!bizId) return;

  if (typeof window.codedeskExportState === 'function') {
    var state = window.codedeskExportState();
    _lsqSaveLocal(bizId, state, type);
    _lsqSaveRemote(bizId, state, type);
  }

  // Export rendered PNG and store it
  if (typeof window.codedeskExportPngDataUrl === 'function') {
    window.codedeskExportPngDataUrl(2).then(function(dataUrl) {
      _lsqSaveImage(bizId, dataUrl, type);
      window.parent.postMessage({ type: 'lsq-saved', bizId: bizId, qrType: type, image: dataUrl }, '*');
    }).catch(function() {
      window.parent.postMessage({ type: 'lsq-saved' }, '*');
    });
  } else {
    window.parent.postMessage({ type: 'lsq-saved' }, '*');
  }
};

// =====================================================
//  RENDER HOOK — auto-save after every render()
// =====================================================
(function hookRenderForAutoSave() {
  var _hookInstalled = false;

  function installHook() {
    if (_hookInstalled) return;
    if (typeof window.render !== 'function') return;

    var _originalRender = window.render;
    window.render = function lsqAutoSaveRender() {
      var result = _originalRender.apply(this, arguments);
      _lsqSaveDebounced();
      return result;
    };
    _hookInstalled = true;
  }

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
  var type = _lsqGetCurrentType();
  if (!bizId) return;
  if (typeof window.codedeskExportState !== 'function') return;

  var state = window.codedeskExportState();
  _lsqSaveLocal(bizId, state, type);

  if (navigator.sendBeacon && window.LSQ_API_URL) {
    try {
      navigator.sendBeacon(
        window.LSQ_API_URL,
        JSON.stringify({ action: 'saveDesign', bizId: bizId + '-' + type, design: state })
      );
    } catch (e) {}
  }
});

// =====================================================
//  LOAD DESIGN (for a specific bizId + type)
// =====================================================
function _lsqLoadDesign(bizId, type) {
  if (!bizId || !type) return;

  var local = _lsqLoadLocal(bizId, type);
  if (local && typeof window.codedeskImportState === 'function') {
    window.codedeskImportState(local);
  }

  // Background: check API for newer version
  _lsqLoadRemote(bizId, type).then(function(remote) {
    if (!remote) return;
    var localTs = local ? (local.at || 0) : 0;
    var remoteTs = remote.at || 0;
    if (remoteTs > localTs) {
      _lsqSaveLocal(bizId, remote, type);
      if (typeof window.codedeskImportState === 'function') {
        window.codedeskImportState(remote);
      }
    }
  }).catch(function() {});
}

// =====================================================
//  TYPE SWITCH — save old type, load new type
//  Guard: skip during import to prevent loops
// =====================================================
var __lsq_switching_type = false;

function _lsqOnTypeSwitch(newType) {
  if (__lsq_switching_type) return;
  if (window.__CODEDESK_IMPORTING_STATE__) return;

  var bizId = _lsqGetCurrentBizId();
  if (!bizId) return;

  var oldType = window.__lsq_last_type || 'Townie';
  if (oldType === newType) return;

  __lsq_switching_type = true;

  // Save current design for the old type
  if (typeof window.codedeskExportState === 'function') {
    var state = window.codedeskExportState();
    _lsqSaveLocal(bizId, state, oldType);
    _lsqSaveRemote(bizId, state, oldType);

    if (typeof window.codedeskExportPngDataUrl === 'function') {
      window.codedeskExportPngDataUrl(2).then(function(dataUrl) {
        _lsqSaveImage(bizId, dataUrl, oldType);
      }).catch(function() {});
    }
  }

  window.__lsq_last_type = newType;

  // Load new type's design
  _lsqLoadDesign(bizId, newType);

  // Release guard after microtask (import dispatches events synchronously)
  queueMicrotask(function() { __lsq_switching_type = false; });
}

// Wire #qrType change
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

// Wire #bizSelect change — load design for selected biz + current type
(function wireBizSelectSync() {
  function wire() {
    var sel = document.getElementById('bizSelect');
    if (!sel || sel.__lsq_sync_wired) return;
    sel.__lsq_sync_wired = true;

    sel.addEventListener('change', function() {
      var bizId = (sel.value || '').trim();
      if (bizId) _lsqLoadDesign(bizId, _lsqGetCurrentType());
    });
  }

  var observer = new MutationObserver(function() { wire(); });
  var target = document.getElementById('detailsPanel');
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }

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
