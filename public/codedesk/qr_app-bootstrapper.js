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
// Groups into category folders (Dining, Shopping, Residential, etc.)
var CATEGORY_ORDER = ['dining', 'shopping', 'services', 'arts', 'community', 'historic', 'hospitality', 'professional', 'recreation', 'residential'];
var CATEGORY_LABELS = {
  dining: 'Dining', shopping: 'Shopping', services: 'Services',
  arts: 'Arts', community: 'Community', historic: 'Historic',
  hospitality: 'Hospitality', professional: 'Professional',
  recreation: 'Recreation', residential: 'Residential',
};

function _makeBizItem(biz, current, hiddenInput, listbox) {
  var id = biz.id || biz.building_id || '';
  var name = biz.name || biz.id || 'Unknown';

  var item = document.createElement('button');
  item.type = 'button';
  item.className = 'biz-item' + (id === current ? ' is-active' : '');
  item.dataset.bizId = id;

  var nameSpan = document.createElement('span');
  nameSpan.className = 'biz-item-name';
  nameSpan.textContent = name;
  item.appendChild(nameSpan);

  item.addEventListener('click', function() {
    var prev = listbox.querySelector('.biz-item.is-active');
    if (prev) prev.classList.remove('is-active');
    item.classList.add('is-active');
    hiddenInput.value = id;
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  });

  return item;
}

function _groupByCategory(businesses) {
  var catMap = {};
  businesses.forEach(function(biz) {
    var cat = biz.category || 'other';
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push(biz);
  });
  // Sort each group alphabetically
  Object.keys(catMap).forEach(function(cat) {
    catMap[cat].sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
  });
  // Return ordered array of { key, label, items }
  var result = [];
  CATEGORY_ORDER.forEach(function(cat) {
    if (catMap[cat]) {
      result.push({ key: cat, label: CATEGORY_LABELS[cat] || cat, items: catMap[cat] });
      delete catMap[cat];
    }
  });
  // Append any remaining categories not in the order list
  Object.keys(catMap).sort().forEach(function(cat) {
    result.push({ key: cat, label: CATEGORY_LABELS[cat] || cat, items: catMap[cat] });
  });
  return result;
}

function populateBizSelect(businesses) {
  var hiddenInput = document.getElementById('bizSelect');
  var listbox = document.querySelector('.fldListbox[data-for="bizSelect"]');

  // Listbox mode: render clickable items grouped into category folders
  if (listbox && hiddenInput) {
    var current = hiddenInput.value || window.__lsq_cached_biz_id || '';
    listbox.innerHTML = '';

    var groups = _groupByCategory(businesses);

    groups.forEach(function(group) {
      if (!group.items.length) return;

      var folder = document.createElement('div');
      folder.className = 'biz-group';

      var header = document.createElement('button');
      header.type = 'button';
      header.className = 'biz-group-header';
      header.innerHTML = '<span class="biz-group-label">' + group.label +
        '</span><span class="biz-group-count">' + group.items.length + '</span>';

      var content = document.createElement('div');
      content.className = 'biz-group-content';
      content.style.display = 'none';

      header.addEventListener('click', function() {
        var isOpen = content.style.display !== 'none';
        content.style.display = isOpen ? 'none' : '';
        folder.classList.toggle('is-open', !isOpen);
      });

      group.items.forEach(function(biz) {
        content.appendChild(_makeBizItem(biz, current, hiddenInput, listbox));
      });

      // Auto-open if current selection is in this group
      var hasActive = group.items.some(function(b) {
        return (b.id || b.building_id || '') === current;
      });
      if (hasActive) {
        content.style.display = '';
        folder.classList.add('is-open');
      }

      folder.appendChild(header);
      folder.appendChild(content);
      listbox.appendChild(folder);
    });

    // Restore hidden input value after rebuilding (renderTypeForm clears it)
    if (current) hiddenInput.value = current;

    return;
  }

  // Fallback: legacy <select> mode with optgroups
  var selects = document.querySelectorAll('select#bizSelect');
  if (!selects.length) return;

  selects.forEach(function(sel) {
    var current = sel.value || window.__lsq_cached_biz_id || '';
    sel.innerHTML = '';

    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '\u2014 Select a place \u2014';
    ph.disabled = true;
    if (!current) ph.selected = true;
    sel.appendChild(ph);

    var groups = _groupByCategory(businesses);
    groups.forEach(function(group) {
      if (!group.items.length) return;
      var optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      group.items.forEach(function(biz) {
        var opt = document.createElement('option');
        opt.value = biz.id || biz.building_id || '';
        opt.textContent = biz.name || biz.id || 'Unknown';
        if (opt.value === current) opt.selected = true;
        optgroup.appendChild(opt);
      });
      sel.appendChild(optgroup);
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

  // --- Load manifest + templates + businesses in parallel ---
  var manifestUrl = new URL("qr_type_manifest.json", __CODEDESK_BASE_URL__).toString();
  var templatesUrl = new URL("qr_templates.json", __CODEDESK_BASE_URL__).toString();
  var apiUrl = window.LSQ_API_URL || '';

  var manifestP = fetch(manifestUrl, { cache: "no-store" }).then(function(r) {
    if (!r.ok) throw new Error("manifest not found: " + r.status);
    return r.json();
  }).catch(function(e) {
    console.warn("Manifest load failed, using inline fallback", e);
    return { types: {} };
  });

  var templatesP = fetch(templatesUrl, { cache: "no-store" }).then(function(r) {
    if (!r.ok) return [];
    return r.json().then(function(j) {
      var t = Array.isArray(j.templates) ? j.templates : [];
      return t.filter(function(tpl) { return tpl && typeof tpl === 'object' && tpl.id && tpl.state; });
    });
  }).catch(function(e) {
    console.warn("Template load failed", e);
    return [];
  });

  var bizP = (apiUrl
    ? fetch(apiUrl + '?action=listings', { cache: 'no-store' }).then(function(r) {
        if (!r.ok) return null;
        return r.json().then(function(d) {
          var b = Array.isArray(d.data) ? d.data : [];
          return b.length > 0 ? b : null;
        });
      }).catch(function() { return null; })
    : Promise.resolve(null)
  ).then(function(biz) {
    if (biz) return biz;
    // Fallback: try local files
    var base = getLsqBaseUrl();
    var paths = [base + '/codedesk/businesses.json', base + '/data/landmarks.json'];
    return paths.reduce(function(chain, path) {
      return chain.then(function(found) {
        if (found) return found;
        return fetch(path, { cache: 'no-store' }).then(function(r) {
          if (!r.ok) return null;
          return r.json().then(function(d) {
            var lm = d.landmarks || d.businesses || d;
            return Array.isArray(lm) && lm.length > 0 ? lm : null;
          });
        }).catch(function() { return null; });
      });
    }, Promise.resolve(null));
  });

  var results = await Promise.all([manifestP, templatesP, bizP]);
  var manifest = results[0];
  var templates = results[1];
  var businesses = results[2];

  window.manifest = window.manifest || {};
  try { Object.assign(window.manifest, manifest); } catch(_e) { window.manifest = manifest; }
  window.CODEDESK_TEMPLATES = templates;
  if (businesses) {
    window.LSQ_BUSINESSES = businesses;
    populateBizSelect(businesses);
  }

  // --- Build the type-specific form (now that manifest is loaded) ---
  try {
    var typeSel = document.getElementById('qrType');
    if (typeSel && typeof window.renderTypeForm === 'function') {
      window.renderTypeForm(typeSel.value || 'Townie');
    }
  } catch (e) {}

  // Force initial render
  try { if (typeof render === 'function') render(); } catch (e) {}

  // --- Wire type change to re-populate bizSelect ---
  var typeSelect = document.getElementById('qrType');
  if (typeSelect) {
    typeSelect.addEventListener('change', function() {
      // After renderTypeForm rebuilds the form, re-populate bizSelect + claimSecret
      setTimeout(function() {
        if (window.LSQ_BUSINESSES && window.LSQ_BUSINESSES.length) {
          populateBizSelect(window.LSQ_BUSINESSES);
        }
        // Hydrate claimSecret for Guardian type after form rebuild
        if (window.__lsq_cached_claim_secret) {
          var cs = document.getElementById('claimSecret');
          if (cs) cs.value = window.__lsq_cached_claim_secret;
        }
        // Re-render with hydrated values so URL text + QR content update
        try { if (typeof window.render === 'function') window.render(); } catch (e) {}
      }, 0);
    });
  }

  // --- Embed: load design for cached biz+type ---
  // Parent sends lsq-set-listing before #bizSelect exists (async timing).
  // Now that the form is built, set bizSelect from cache and load the design.
  if (document.documentElement.classList.contains('embed') && window.__lsq_cached_biz_id) {
    var _bSel = document.getElementById('bizSelect');
    if (_bSel) {
      _bSel.value = window.__lsq_cached_biz_id;
      _bSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Hydrate claimSecret if cached
    if (window.__lsq_cached_claim_secret) {
      var _cSel = document.getElementById('claimSecret');
      if (_cSel) _cSel.value = window.__lsq_cached_claim_secret;
    }
  }

})();
