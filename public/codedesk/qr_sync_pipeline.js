// Lafayette Square QR — Sync pipeline
// Save-on-demand: only persist on explicit Save. Session cache for type switching.
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
//  LOCAL STORAGE LAYER (persistent, written only on Save)
// =====================================================
var LSQ_DESIGN_PREFIX = 'lsq-qr-design-';
var LSQ_IMAGE_PREFIX = 'lsq-qr-image-';

function _lsqGetCurrentType() {
  var sel = document.getElementById('qrType');
  return sel ? (sel.value || 'Townie') : 'Townie';
}

// Cache bizId — #bizSelect is destroyed/recreated by renderTypeForm on
// every type switch, so the DOM element is empty when _lsqOnTypeSwitch
// reads it.  The cache persists across form rebuilds.
window.__lsq_cached_biz_id = '';

function _lsqGetCurrentBizId() {
  var sel = document.getElementById('bizSelect');
  var fromDom = sel ? (sel.value || '').trim() : '';
  if (fromDom) window.__lsq_cached_biz_id = fromDom;
  return fromDom || window.__lsq_cached_biz_id;
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
function _lsqSaveRemote(bizId, state, type, image) {
  if (!bizId || !type || !window.LSQ_API_URL) return;
  var payload = { action: 'saveDesign', bizId: bizId + '-' + type, design: state };
  if (image) payload.image = image;
  try {
    fetch(window.LSQ_API_URL, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
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
//  CLAIM SECRET — auto-fetch for Guardian type
// =====================================================
var _lsqSecretCache = {};  // bizId → secret

function _lsqFetchClaimSecret(bizId) {
  if (!bizId || !window.LSQ_API_URL) return;
  if (_lsqSecretCache[bizId]) {
    _lsqApplySecret(_lsqSecretCache[bizId]);
    return;
  }
  fetch(window.LSQ_API_URL + '?action=claim-secret&lid=' + encodeURIComponent(bizId) + '&admin=lafayette1850')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var secret = data && data.data && data.data.claim_secret;
      if (secret) {
        _lsqSecretCache[bizId] = secret;
        _lsqApplySecret(secret);
      }
    })
    .catch(function() {});
}

function _lsqApplySecret(secret) {
  window.__lsq_cached_claim_secret = secret;
  var el = document.getElementById('claimSecret');
  if (el) el.value = secret;
  // Re-render so QR URL updates
  try { if (typeof window.render === 'function') window.render(); } catch (e) {}
}

// =====================================================
//  SESSION CACHE — in-memory drafts for type switching
//  Not persisted; only written to storage on explicit Save.
// =====================================================
var _lsqSessionCache = {};

function _lsqSessionKey(bizId, type) {
  return bizId + '-' + type;
}

// =====================================================
//  DIRTY CHECK — compare current state to last saved/loaded
//  No continuous tracking; parent calls _lsqIsDirty() on close.
// =====================================================
var _lsqCleanStateJson = null;

function _lsqSnapshotClean() {
  if (typeof window.codedeskExportState === 'function') {
    _lsqCleanStateJson = JSON.stringify(window.codedeskExportState());
  }
}

window._lsqIsDirty = function() {
  if (!_lsqCleanStateJson) return false;
  if (typeof window.codedeskExportState !== 'function') return false;
  return JSON.stringify(window.codedeskExportState()) !== _lsqCleanStateJson;
};

// =====================================================
//  IMMEDIATE SAVE + IMAGE EXPORT (called by parent on Save)
// =====================================================
window._lsqSaveNow = function _lsqSaveNow() {
  var bizId = _lsqGetCurrentBizId();
  var type = _lsqGetCurrentType();
  if (!bizId) return;

  var state = null;
  if (typeof window.codedeskExportState === 'function') {
    state = window.codedeskExportState();
    _lsqSaveLocal(bizId, state, type);
    // Remote save deferred until PNG is ready (sent together)
    // Update session cache too
    _lsqSessionCache[_lsqSessionKey(bizId, type)] = state;
  }

  // Snapshot clean state after save
  _lsqSnapshotClean();

  // Export rendered PNG and store it locally + remotely
  if (typeof window.codedeskExportPngDataUrl === 'function') {
    // Scale 2 for localStorage (high-res), scale 1 for API (fits in Sheets cell)
    window.codedeskExportPngDataUrl(2).then(function(hiRes) {
      if (hiRes) _lsqSaveImage(bizId, hiRes, type);
      // For API: use scale 1 to stay under Sheets 50K cell limit
      return window.codedeskExportPngDataUrl(1).then(function(loRes) {
        var apiImage = loRes || hiRes || '';
        if (state) _lsqSaveRemote(bizId, state, type, apiImage);
        window.parent.postMessage({ type: 'lsq-saved', bizId: bizId, qrType: type, image: hiRes || '' }, '*');
      });
    }).catch(function(err) {
      console.warn('QR PNG export failed', err);
      // PNG export failed — save design without image
      if (state) _lsqSaveRemote(bizId, state, type);
      window.parent.postMessage({ type: 'lsq-saved' }, '*');
    });
  } else {
    if (state) _lsqSaveRemote(bizId, state, type);
    window.parent.postMessage({ type: 'lsq-saved' }, '*');
  }
};

// (No render hook — dirty check is on-demand via _lsqIsDirty)

// =====================================================
//  DEFAULT STATE — clean slate for a fresh QR type
// =====================================================
var _LSQ_DEFAULT_STATE = {
  v: 1, at: 0,
  fields: {},
  style: {
    fontFamily: 'IBM Plex Sans',
    campaign: '', captionBody: '',
    captionColor: '#000000', bodyColor: '#000000',
    eyeRingColor: '#9CA3AF', eyeCenterColor: '#6B7280',
    bgTransparent: false, bgTopHex: '#FFFFFF', bgBottomHex: '#FFFFFF',
    bgTopAlpha: '100', bgBottomAlpha: '100',
    moduleShape: 'Square', eyeRingShape: 'Square', eyeCenterShape: 'Square',
    modulesMode: 'Shape', modulesEmoji: '', modulesScale: '0.9',
    centerMode: 'None', centerEmoji: '', centerScale: '1',
    eyeCenterMode: 'Shape', eyeCenterEmoji: '', eyeCenterScale: '0.9'
  }
};

// =====================================================
//  LOAD DESIGN (for a specific bizId + type)
// =====================================================
function _lsqLoadDesign(bizId, type) {
  if (!bizId || !type) return;

  var local = _lsqLoadLocal(bizId, type);
  if (local && typeof window.codedeskImportState === 'function') {
    // Strip `type` — the dropdown is already correct; letting import
    // touch it causes it to flip back (export captures the *new* type
    // value because the dropdown has already changed when we save).
    delete local.type;
    window.codedeskImportState(local);
    _lsqSnapshotClean();
  } else if (typeof window.codedeskImportState === 'function') {
    // No saved design — reset to defaults
    window.codedeskImportState(_LSQ_DEFAULT_STATE);
    _lsqSnapshotClean();
  }

  // Background: check API for newer version
  _lsqLoadRemote(bizId, type).then(function(remote) {
    if (!remote) return;
    var localTs = local ? (local.at || 0) : 0;
    var remoteTs = remote.at || 0;
    if (remoteTs > localTs) {
      _lsqSaveLocal(bizId, remote, type);
      delete remote.type;
      if (typeof window.codedeskImportState === 'function') {
        window.codedeskImportState(remote);
        _lsqSnapshotClean();
      }
    }
  }).catch(function() {});
}

// =====================================================
//  TYPE SWITCH — cache old type in memory, load new type
//  Guard: skip during import to prevent loops
// =====================================================
var __lsq_switching_type = false;

// Pre-save hook: called by ui_toolkit BEFORE renderTypeForm destroys the DOM.
// Captures current state while fields still exist.
var __lsq_pre_saved_for = null;

window._lsqSaveBeforeTypeSwitch = function(newType) {
  if (__lsq_switching_type) return;
  if (window.__CODEDESK_IMPORTING_STATE__) return;

  var bizId = _lsqGetCurrentBizId();
  if (!bizId) return;

  var oldType = window.__lsq_last_type || 'Townie';
  if (oldType === newType) return;

  if (typeof window.codedeskExportState === 'function') {
    var state = window.codedeskExportState();
    _lsqSessionCache[_lsqSessionKey(bizId, oldType)] = state;
  }
  __lsq_pre_saved_for = oldType;
};

function _lsqOnTypeSwitch(newType) {
  if (__lsq_switching_type) return;
  if (window.__CODEDESK_IMPORTING_STATE__) return;

  var bizId = _lsqGetCurrentBizId();
  if (!bizId) return;

  var oldType = window.__lsq_last_type || 'Townie';
  if (oldType === newType) return;

  __lsq_switching_type = true;

  // Save current design to session cache (skip if pre-saved)
  if (__lsq_pre_saved_for !== oldType && typeof window.codedeskExportState === 'function') {
    var state = window.codedeskExportState();
    _lsqSessionCache[_lsqSessionKey(bizId, oldType)] = state;
  }
  __lsq_pre_saved_for = null;

  window.__lsq_last_type = newType;

  // Load new type: session cache first, then persistent storage
  var cached = _lsqSessionCache[_lsqSessionKey(bizId, newType)];
  if (cached && typeof window.codedeskImportState === 'function') {
    delete cached.type;
    window.codedeskImportState(cached);
    _lsqSnapshotClean();
  } else {
    _lsqLoadDesign(bizId, newType);
  }

  // Fetch claim secret when switching to Guardian
  if (newType === 'Guardian' && bizId) {
    _lsqFetchClaimSecret(bizId);
  }

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
      if (!bizId) return;
      var type = _lsqGetCurrentType();
      _lsqLoadDesign(bizId, type);
      if (type === 'Guardian') _lsqFetchClaimSecret(bizId);
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
