"use strict";

// ------------------------------------------------------------
// Lafayette Square QR — Bootstrap
// Loads QRCode library, manifest, and business data.
// ------------------------------------------------------------

// 1) Load QRCode.js (local vendor first, then CDN fallback)
(function loadQRCodeOnce() {
  if (window.QRCode && window.QRCode.CorrectLevel) return;

  function use(url, onload) {
    var s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = onload;
    s.onerror = function () {
      if (!/cdnjs/.test(url)) {
        use('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', onload);
      } else {
        console.error('Failed to load QRCode library from', url);
      }
    };
    document.head.appendChild(s);
  }

  use('./vendor/qrcode.min.js', function () {
    // QRCode is now available as window.QRCode
  });
})();

// Helper: compute the base URL for Lafayette Square QR targets
// If codedesk is at /codedesk/, the base is the parent path
function getLsqBaseUrl() {
  var path = window.location.pathname;
  var idx = path.indexOf('/codedesk');
  if (idx >= 0) return window.location.origin + path.slice(0, idx);
  return window.location.origin;
}
window.getLsqBaseUrl = getLsqBaseUrl;

// Populate all bizSelect elements with business data
// Supports both <select> and listbox (.fldListbox) rendering
function populateBizSelect(businesses) {
  var hiddenInput = document.getElementById('bizSelect');
  var listbox = document.querySelector('.fldListbox[data-for="bizSelect"]');

  // Listbox mode: render clickable items
  if (listbox && hiddenInput) {
    var current = hiddenInput.value || '';
    listbox.innerHTML = '';

    var sorted = businesses.slice().sort(function(a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    sorted.forEach(function(biz) {
      var id = biz.id || biz.building_id || '';
      var name = biz.name || biz.id || 'Unknown';
      var cat = biz.category || '';

      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'biz-item' + (id === current ? ' is-active' : '');
      item.dataset.bizId = id;

      var nameSpan = document.createElement('span');
      nameSpan.className = 'biz-item-name';
      nameSpan.textContent = name;
      item.appendChild(nameSpan);

      if (cat) {
        var catSpan = document.createElement('span');
        catSpan.className = 'biz-item-cat';
        catSpan.textContent = cat;
        item.appendChild(catSpan);
      }

      item.addEventListener('click', function() {
        // Deselect previous
        var prev = listbox.querySelector('.biz-item.is-active');
        if (prev) prev.classList.remove('is-active');

        // Select this one
        item.classList.add('is-active');
        hiddenInput.value = id;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      listbox.appendChild(item);
    });

    return;
  }

  // Fallback: legacy <select> mode
  var selects = document.querySelectorAll('select#bizSelect');
  if (!selects.length) return;

  selects.forEach(function(sel) {
    var current = sel.value || '';
    sel.innerHTML = '';

    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '\u2014 Select a business \u2014';
    ph.disabled = true;
    if (!current) ph.selected = true;
    sel.appendChild(ph);

    var sorted = businesses.slice().sort(function(a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    sorted.forEach(function(biz) {
      var opt = document.createElement('option');
      opt.value = biz.id || biz.building_id || '';
      var label = biz.name || biz.id || 'Unknown';
      if (biz.category) label += '  (' + biz.category + ')';
      opt.textContent = label;
      if (opt.value === current) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}
window.populateBizSelect = populateBizSelect;

// 2) Load manifest, templates, and business data
;(async function () {

  // Build a directory-safe base URL for fetches
  var __CODEDESK_BASE_URL__ = (function () {
    var p = window.location.pathname || "/";
    if (p && !p.endsWith("/")) {
      var last = p.split("/").pop() || "";
      if (last.indexOf(".") !== -1) {
        p = p.slice(0, p.length - last.length);
      } else {
        p = p + "/";
      }
    }
    if (p && !p.endsWith("/")) p = p + "/";
    return window.location.origin + p;
  })();

  // --- Load manifest ---
  var manifest;
  try {
    var manifestUrl = new URL("qr_type_manifest.json", __CODEDESK_BASE_URL__).toString();
    var res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("manifest not found: " + res.status);
    manifest = await res.json();
  } catch (e) {
    console.warn("Manifest load failed, using inline fallback", e);
    manifest = { types: {} };
  }

  window.manifest = window.manifest || {};
  try { Object.assign(window.manifest, manifest); } catch(_e) { window.manifest = manifest; }

  // --- Load templates (separate from type manifest) ---
  var templates = [];
  try {
    var templatesUrl = new URL("qr_templates.json", __CODEDESK_BASE_URL__).toString();
    var tRes = await fetch(templatesUrl, { cache: "no-store" });
    if (tRes.ok) {
      var tJson = await tRes.json();
      templates = Array.isArray(tJson.templates) ? tJson.templates : [];
      templates = templates.filter(function(tpl) {
        return tpl && typeof tpl === 'object' && tpl.id && tpl.state;
      });
    }
  } catch (e) {
    console.warn("Template load failed", e);
  }
  window.CODEDESK_TEMPLATES = templates;

  // --- Build the type-specific form (now that manifest is loaded) ---
  try {
    var typeSel = document.getElementById('qrType');
    if (typeSel && typeof window.renderTypeForm === 'function') {
      window.renderTypeForm(typeSel.value || 'Check-in');
    }
  } catch (e) {}

  // Force initial render
  try { if (typeof render === 'function') render(); } catch (e) {}

  // --- Fetch businesses from Lafayette Square API ---
  var apiUrl = window.LSQ_API_URL || '';
  if (apiUrl) {
    try {
      var bizRes = await fetch(apiUrl + '?action=businesses', { cache: 'no-store' });
      if (bizRes.ok) {
        var bizData = await bizRes.json();
        var businesses = (bizData.data && bizData.data.businesses)
          ? bizData.data.businesses
          : (bizData.businesses || []);
        if (Array.isArray(businesses) && businesses.length > 0) {
          window.LSQ_BUSINESSES = businesses;
          populateBizSelect(businesses);
        }
      }
    } catch (e) {
      console.warn("Business fetch from API failed", e);
    }
  }

  // Fallback: try to load from local landmarks.json (dev environment)
  if (!window.LSQ_BUSINESSES || !window.LSQ_BUSINESSES.length) {
    try {
      var base = getLsqBaseUrl();
      var paths = [
        base + '/codedesk/businesses.json',
        base + '/data/landmarks.json'
      ];
      for (var i = 0; i < paths.length; i++) {
        try {
          var fallbackRes = await fetch(paths[i], { cache: 'no-store' });
          if (fallbackRes.ok) {
            var fbData = await fallbackRes.json();
            var landmarks = fbData.landmarks || fbData.businesses || fbData;
            if (Array.isArray(landmarks) && landmarks.length > 0) {
              window.LSQ_BUSINESSES = landmarks;
              populateBizSelect(landmarks);
              break;
            }
          }
        } catch(e2) {}
      }
    } catch (e) {}
  }

  // --- Wire type change to re-populate bizSelect ---
  var typeSelect = document.getElementById('qrType');
  if (typeSelect) {
    typeSelect.addEventListener('change', function() {
      // After renderTypeForm rebuilds the form, re-populate bizSelect
      setTimeout(function() {
        if (window.LSQ_BUSINESSES && window.LSQ_BUSINESSES.length) {
          populateBizSelect(window.LSQ_BUSINESSES);
        }
      }, 0);
    });
  }

})();
