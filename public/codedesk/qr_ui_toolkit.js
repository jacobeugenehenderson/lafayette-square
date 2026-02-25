console.log('[qr_ui_toolkit.js] SCRIPT LOADING... (v2024-DEBUG)');

// =====================================================
//  Render-plane invariant: buildText() must always exist
//  - Prevents render() structural block if earlier UI wiring throws.
//  - Real buildText() (below) will overwrite this once reached.
// =====================================================
if (typeof window.buildText !== 'function') {
  window.buildText = function buildText() {
    try {
      var base = (typeof window.getLsqBaseUrl === 'function')
        ? window.getLsqBaseUrl()
        : window.location.origin;
      var sel = document.getElementById('qrType');
      var t = sel ? String(sel.value || '') : '';
      var biz = '';
      try { var b = document.getElementById('bizSelect'); biz = b ? (b.value || '') : ''; } catch(_e2){}

      if (t === 'Townie' && biz) return base + '/checkin/' + encodeURIComponent(biz);
      if (t === 'Guardian' && biz) return base + '/claim/' + encodeURIComponent(biz);
      return base;
    } catch (_e) {}

    return window.location.origin;
  };
}

console.log('[PROBE ui_toolkit]', { href: String(location && location.href || ''), topEqSelf: (window === window.top), selfName: String(window.name || ''), hasWinBuildText: (typeof window.buildText === 'function'), hasLexBuildText: (typeof buildText === 'function') });

/* =====================================================
 *  Preview Authority Guard — block legacy QRCode.js from
 *  writing into #qrMount after custom SVG render.
 *
 *  Why here:
 *   - bootstrapper injects QRCode.js async
 *   - any late "helpful" fallback draw can clobber SVG
 *   - this gates only the competing writer, not render()
 * ===================================================== */
(function guardQrMountFromLegacyQRCodeOnce(){
  if (window.__CODEDESK_QRMOUNT_QRCODE_GUARD__) return;
  window.__CODEDESK_QRMOUNT_QRCODE_GUARD__ = true;

  const MOUNT_ID = 'qrMount';

  function isQrMountTarget(el){
    try {
      if (!el) return false;
      if (el === document.getElementById(MOUNT_ID)) return true;
      if (el && el.id === MOUNT_ID) return true;
      // Some legacy calls pass a selector string instead of an element
      if (typeof el === 'string' && el.replace(/^#/, '') === MOUNT_ID) return true;
    } catch (e) {}
    return false;
  }

  function wrapQRCodeCtor(Real){
    if (typeof Real !== 'function') return Real;
    if (Real.__CODEDESK_WRAPPED__) return Real;

    function WrappedQRCode(el, opts){
      if (isQrMountTarget(el)) {
        try {
          console.warn('🛑 Blocked legacy QRCode() write into #qrMount (custom SVG owns this mount).');
          console.warn(new Error('QRCode clobber attempt').stack);
        } catch (e) {}
        // Return a harmless shim (some callers call .makeCode())
        return { makeCode: function(){}, clear: function(){} };
      }
      return new Real(el, opts);
    }

    // Preserve prototype (instance methods) and static properties (e.g., CorrectLevel)
    try { WrappedQRCode.prototype = Real.prototype; } catch (e) {}
    try {
      Object.keys(Real).forEach((k) => { try { WrappedQRCode[k] = Real[k]; } catch (e) {} });
    } catch (e) {}

    try { WrappedQRCode.__CODEDESK_WRAPPED__ = true; } catch (e) {}
    return WrappedQRCode;
  }

  // Install a setter so async-injected QRCode.js also gets wrapped
  try {
    let _real = window.QRCode;

    Object.defineProperty(window, 'QRCode', {
      configurable: true,
      enumerable: true,
      get: function(){ return _real; },
      set: function(v){
        _real = wrapQRCodeCtor(v);
      }
    });

    // Wrap immediately if already present
    window.QRCode = _real;
  } catch (e) {
    // If defineProperty fails for any reason, do a best-effort direct wrap
    try { if (typeof window.QRCode === 'function') window.QRCode = wrapQRCodeCtor(window.QRCode); } catch (_e) {}
  }
})();

(function wireWheelScrollOnce(){
  if (window.__CODEDESK_WHEEL_SCROLL_WIRED__) return;
  window.__CODEDESK_WHEEL_SCROLL_WIRED__ = true;

  function isEditable(el){
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      // allow wheel to behave normally on number inputs too (don’t hijack)
      return true;
    }
    return el.isContentEditable === true;
  }

  function isScrollable(el){
    if (!el || el === document.body || el === document.documentElement) return false;
    const cs = getComputedStyle(el);
    const oy = cs.overflowY;
    if (!(oy === 'auto' || oy === 'scroll')) return false;
    return el.scrollHeight > el.clientHeight + 1;
  }

  function nearestScrollable(start){
    let el = start;
    while (el && el !== document.body && el !== document.documentElement){
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    // fall back to preview scroller if present
    const main =
      document.querySelector('[data-scroll-root]') ||
      document.getElementById('appScroll') ||
      document.querySelector('.app-scroll') ||
      null;
    if (main && isScrollable(main)) return main;
    return null;
  }

  document.addEventListener('wheel', (e) => {
    // If user is interacting with an editable control, let the browser do its thing.
    if (isEditable(e.target)) return;

    // If the page itself is already scrollable and working, don’t hijack it.
    // Only intervene when we can find an internal scroller to move.
    const scroller = nearestScrollable(e.target);
    if (!scroller) return;

    // If scroller can scroll in the wheel direction, consume and scroll it.
    const dy = e.deltaY || 0;
    if (!dy) return;

    const atTop = scroller.scrollTop <= 0;
    const atBot = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

    if ((dy < 0 && !atTop) || (dy > 0 && !atBot)) {
      e.preventDefault(); // REQUIRED to take control
      scroller.scrollTop += dy;
    }
  }, { passive: false });
})();

  /* === ECC (add-only, session-persistent) ========================== */
const ECC_KEY = 'codedesk_ecc';
const ECC_DEFAULT = 'Q';

function getECC(){
  const v = sessionStorage.getItem(ECC_KEY);
  return /^[LMQH]$/.test(v) ? v : ECC_DEFAULT;
}
window.getECC = getECC;

function setECC(val, { trigger = true } = {}){
  const v = (val || '').toUpperCase();
  if (!/^[LMQH]$/.test(v)) return;
  sessionStorage.setItem(ECC_KEY, v);

  // Reflect to any select#ecc present (top-bar or hidden)
  const sel = document.getElementById('ecc');
  if (sel && sel.value !== v){
    sel.value = v;
    if (trigger) sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Live re-render (non-invasive)
  if (typeof render === 'function') render();
}
window.setECC = setECC;

function wireECCPill(){
  if (wireECCPill._done) return;
  // ECC pill removed — just initialize the default level
  setECC(getECC(), { trigger: false });
  wireECCPill._done = true;
}

// Keep legacy/top-bar select alive and in sync (add-only)
function wireECCLegacySelect(){
  const sel = document.getElementById('ecc');
  if (!sel || wireECCLegacySelect._done) return;

  sel.addEventListener('change', () => {
    // Sync from select → pill (no re-emit)
    setECC(sel.value, { trigger: false });
  });

  // Ensure initial mutual sync
  setECC(sel.value || getECC(), { trigger: false });
  wireECCLegacySelect._done = true;
}
/* === END ECC ===================================================== */

// Wire ECC after DOM is ready (add-only; safe if nodes absent)
(function wireECCOnceOnReady(){
  if (window.__CODEDESK_ECC_WIRED__) return;
  window.__CODEDESK_ECC_WIRED__ = true;

  const run = function(){
    try { wireECCPill(); } catch(e){}
    try { wireECCLegacySelect(); } catch(e){}
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once:true });
  } else {
    run();
  }
})();

/* === Preview Font (session-persistent) ============================ */
const FONT_KEY     = 'codedesk_font';
// Store/select by base family name so it matches <option> values.
const FONT_DEFAULT = 'Work Sans';

function normalizeFont(val) {
  if (!val) return FONT_DEFAULT;

  let v = String(val).trim();
  if (!v) return FONT_DEFAULT;

  // Strip outer quotes if present
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }

  // If it's a stack, only keep the first family as our key
  const first = v.split(',')[0].trim();
  return first || FONT_DEFAULT;
}

// === Utility: Font helpers ===
function getPreviewFont() {
  const host = document.getElementById('qrPreview');
  return getComputedStyle(host || document.body).fontFamily;
}
window.getPreviewFont = getPreviewFont;

function getFont() {
  const stored = sessionStorage.getItem(FONT_KEY);
  return normalizeFont(stored || FONT_DEFAULT);
}

function setFont(val) {
  const base = normalizeFont(val);
  sessionStorage.setItem(FONT_KEY, base);

  const sel = document.getElementById('fontFamily');
  if (sel) {
    sel.value = base;            // this now matches <option> values
    sel.style.fontFamily = base;
  }

  const preview = document.getElementById('qrPreview');
  if (preview) {
    preview.style.fontFamily = base;
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => typeof render === 'function' && render());
  } else if (typeof render === 'function') {
    render();
  }
}
window.setFont = setFont;

function wireFontSelect(){
  const sel = document.getElementById('fontFamily');
  if (!sel || wireFontSelect._done) return;

  // Make each option preview in its own face
  Array.from(sel.options).forEach(opt => {
    // each <option> has the full stack as its value
    opt.style.fontFamily = opt.value;
    opt.style.fontWeight = '600'; // keeps visual parity with pills
  });

  // When the user changes the selection, reflect everywhere
  sel.addEventListener('change', () => {
    setFont(sel.value);             // persists + updates preview + value
    sel.style.fontFamily = sel.value; // paint the button in that face
  });

  // Initialize from session or default and paint the control
  const initial = getFont();
  setFont(initial); // setFont will sync select + preview

  wireFontSelect._done = true;
}

// Wire Font after DOM is ready (add-only; safe if nodes absent)
(function wireFontOnceOnReady(){
  if (window.__CODEDESK_FONT_WIRED__) return;
  window.__CODEDESK_FONT_WIRED__ = true;

  const run = function(){
    try { wireFontSelect(); } catch(e){}
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once:true });
  } else {
    run();
  }
})();

// === Caption placeholders + body auto-size =============================
function wireCaptionInputs(){
      const head = document.getElementById('campaign');
      const body = document.getElementById('captionBody');
      const HEAD_PH = 'Headline';
      const BODY_PH = 'Body (optional)';

      function syncHead(){
        if (!head) return;
        if (head.value.trim() === '') head.placeholder = HEAD_PH;
      }

      function syncBody(){
        if (!body) return;
        if (body.value.trim() === '') body.placeholder = BODY_PH;

        // rows: 1 by default; grow to 2 only when a second line exists
        const lines = body.value.split('\n').length;
        body.rows = Math.min(2, Math.max(1, lines));
      }

      head && head.addEventListener('input', syncHead);
      body && body.addEventListener('input', syncBody);

      // initialize on load
      syncHead();
      syncBody();
    }

    // === Emoji picker (HTML modal-driven; no fallback) =======================
    function wireEmojiPickerOnce(){
      if (window.__CODEDESK_EMOJI_PICKER_WIRED__) return;
      window.__CODEDESK_EMOJI_PICKER_WIRED__ = true;

      const modal = document.getElementById('emojiModal');
      const grid  = document.getElementById('emojiGrid');
      const search= document.getElementById('emojiSearch');
      const close = document.getElementById('emojiClose');

      if (!modal || !grid || !search || !close) return;

      // Emoji corpus: prefer the full set if present
      const EMOJIS =
        (typeof EMOJI_BIG !== 'undefined' && Array.isArray(EMOJI_BIG) && EMOJI_BIG.length)
          ? EMOJI_BIG
          : [
              "✨","✅","⚠️","❗","❓","📌","📎","🔗","📣","📢","🧠","💡","🛠️","⚙️","🧾","📄","🗂️","📦","🧩","🧪",
              "🎯","📍","🧭","🗺️","⏱️","⏳","🕒","📅","🗓️","🧷",
              "❤️","🖤","💙","💚","💛","🧡","💜","🤍","🤎","💖",
              "🙂","😎","🤝","🙏","👏","🔥","💥","⭐","🌈","⚡",
              "⬆️","⬇️","➡️","⬅️","↗️","↘️","↙️","↖️","🔼","🔽",
              "➕","➖","✖️","➗","∞","≈","≠","≤","≥",
              "🏳️‍🌈","🏳️‍⚧️"
            ];

      let activeTargetId = '';

      function setActiveTarget(id){
        activeTargetId = String(id || '').trim();
      }

      function openModal(){
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        try { search.focus(); } catch(e){}
      }

      function closeModal(){
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        setActiveTarget('');
      }

      function paint(filterText){
        const q = String(filterText || '').trim().toLowerCase();
        grid.innerHTML = '';

        const list = q
          ? EMOJIS.filter(e => e.toLowerCase().includes(q))
          : EMOJIS;

        list.forEach((emo) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'emoji-btn';
          b.textContent = emo;
          b.setAttribute('aria-label', emo);

          b.addEventListener('click', function(ev){
            try { ev.preventDefault(); } catch(_e){}
            try { ev.stopPropagation(); } catch(_e){}

            if (!activeTargetId) return;
            const inp = document.getElementById(activeTargetId);
            if (!inp) return;

            inp.value = emo;
            inp.dispatchEvent(new Event('input',  { bubbles:true }));
            inp.dispatchEvent(new Event('change', { bubbles:true }));
            try { if (typeof render === 'function') render(); } catch(e){}

            closeModal();
          }, { passive:false });

          grid.appendChild(b);
        });
      }

      // Delegate: any button with data-emoji-target opens modal
      document.addEventListener('click', function(e){
        const btn = e.target && e.target.closest && e.target.closest('button[data-emoji-target]');
        if (!btn) return;

        try { e.preventDefault(); } catch(_e){}
        try { e.stopPropagation(); } catch(_e){}

        const tid = btn.getAttribute('data-emoji-target') || '';
        if (!tid) return;

        setActiveTarget(tid);
        search.value = '';
        paint('');
        openModal();
      }, true);

      // Search
      search.addEventListener('input', function(){
        paint(search.value || '');
      });

      // Close button
      close.addEventListener('click', function(e){
        try { e.preventDefault(); } catch(_e){}
        try { e.stopPropagation(); } catch(_e){}
        closeModal();
      });

      // Click backdrop to close
      modal.addEventListener('click', function(e){
        if (e.target === modal) closeModal();
      });

      // ESC to close
      document.addEventListener('keydown', function(e){
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
      });

      // initial paint (so the grid is ready on first open)
      paint('');
    }

    // run after DOM loads
    (function wireCaptionAndEmojiOnce(){
      if (window.__CODEDESK_CAPTION_EMOJI_WIRED__) return;
      window.__CODEDESK_CAPTION_EMOJI_WIRED__ = true;

      const run = function(){
        try { wireCaptionInputs(); } catch(e){}
        try { wireEmojiPickerOnce(); } catch(e){}
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
      } else {
        run();
      }
    })();
    // -------- Scale clickers (delegated; safe across form rebuilds) --------
    function clamp(val, min, max) {
      return Math.min(max, Math.max(min, val));
    }

    if (!window._stepperBound) {
          const __codedeskStepperHandler__ = (e) => {
            const btn = e.target && e.target.closest && e.target.closest('[data-stepper]');
            if (!btn) return;

            // Capture-phase handler: prevent other UI layers from hijacking the interaction.
            try { e.preventDefault(); } catch(_e){}
            try { e.stopPropagation(); } catch(_e){}

            const targetId = btn.getAttribute('data-stepper');
            const delta = parseFloat(btn.getAttribute('data-delta')||'0');

            const input = document.getElementById(targetId);
            if (!input) return;

            const v = parseFloat(input.value||'0') || 0;
            const step = parseFloat(input.step||'0.05') || 0.05;
            const min = parseFloat(input.min||'0.1') || 0.1;
            const max = parseFloat(input.max||'1') || 1;

            const next = clamp((Math.round((v + (delta||step))*100)/100), min, max);
            input.value = next.toFixed(2);
            input.dispatchEvent(new Event('input', {bubbles:true}));
          };

          // IMPORTANT: use capture so narrow-mode accordion/tap handlers can't swallow it.
          document.addEventListener('click', __codedeskStepperHandler__, true);

          window._stepperBound = true;
        }

// Live re-paint when user moves any background knob
// Also: default-link top/bottom (alpha + color), and prevent 0% → 100% snapback
let _bg_knobs_wired = false;
function wireBackgroundKnobsOnce() {
  console.log('[wireBackgroundKnobsOnce] starting...');

  if (_bg_knobs_wired) {
    console.log('[wireBackgroundKnobsOnce] already wired (local flag)');
    return;
  }
  if (window.__CODEDESK_BG_KNOBS_WIRED__) {
    console.log('[wireBackgroundKnobsOnce] already wired (global flag)');
    return;
  }
  window.__CODEDESK_BG_KNOBS_WIRED__ = true;

  const topColor = document.getElementById('bgTopColor');
  const botColor = document.getElementById('bgBottomColor');
  const topHex   = document.getElementById('bgTopHex');
  const botHex   = document.getElementById('bgBottomHex');

  const topA = document.getElementById('bgTopAlpha');
  const botA = document.getElementById('bgBottomAlpha');

  // Numeric alpha inputs are not adjacent anymore (layout moved).
  const topANum = document.getElementById('bgTopAlphaNum');
  const botANum = document.getElementById('bgBottomAlphaNum');

  console.log('[wireBackgroundKnobsOnce] elements found:', {
    topColor: !!topColor,
    botColor: !!botColor,
    topHex: !!topHex,
    botHex: !!botHex,
    topA: !!topA,
    botA: !!botA,
    topANum: !!topANum,
    botANum: !!botANum
  });

  const LINK_KEY = 'codedesk_bg_link_v1';

  // Not present in minimal builds; bail safely.
  if (!topA || !botA) {
    console.warn('[wireBackgroundKnobsOnce] missing alpha sliders, bailing');
    return;
  }

  // One source of truth: checkbox "bgTransparent" (if present) owns the transparent mode.
  // NOTE: bgTransparent is used in buildText() to decide whether to omit bg.
  const bgTransparent = document.getElementById('bgTransparent');

  // Helper: parse numeric, preserving 0 (no `||` traps).
  function num(v, fallback){
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }
  function clamp100(x){ return Math.max(0, Math.min(100, x)); }

  function paintAlphaNums(){
    try {
      // Both sliders and numeric inputs use 0-100 range
      if (topANum) topANum.value = String(Math.round(clamp100(num(topA.value, 100))));
      if (botANum) botANum.value = String(Math.round(clamp100(num(botA.value, 100))));
    } catch (e) {}
  }

  function syncHexAndColor(fromEl, toEl){
    try {
      if (!fromEl || !toEl) return;
      const v = String(fromEl.value || '').trim();
      if (!v) return;
      if (toEl.value !== v) toEl.value = v;
    } catch (e) {}
  }

  function repaint(){
    console.log('[repaint] called');

    // IMPORTANT: do not trigger preset application during import/template apply
    if (window.__CODEDESK_IMPORTING_STATE__) {
      console.log('[repaint] blocked by IMPORTING_STATE');
      return;
    }
    if (window.__CODEDESK_APPLYING_TEMPLATE__) {
      console.log('[repaint] blocked by APPLYING_TEMPLATE');
      return;
    }

    if (typeof window.refreshBackground === 'function') {
      console.log('[repaint] calling refreshBackground');
      window.refreshBackground();
    } else {
      console.warn('[repaint] refreshBackground not found!');
    }

    if (typeof window.render === 'function') {
      console.log('[repaint] calling render');
      window.render();
    } else {
      console.warn('[repaint] render not found!');
    }
  }

  function isLinked(){
    try { return localStorage.getItem(LINK_KEY) === '1'; } catch (e) { return false; }
  }
  function setLinked(on){
    try { localStorage.setItem(LINK_KEY, on ? '1' : '0'); } catch (e) {}
  }

  // Default: linked unless explicitly disabled
  try {
    if (localStorage.getItem(LINK_KEY) == null) setLinked(true);
  } catch (e) {}

  function linkPair(source, target, transform){
    try {
      if (!isLinked()) return;
      if (!source || !target) return;
      const v = transform ? transform(source.value) : source.value;
      if (target.value !== v) target.value = v;
    } catch (e) {}
  }

  // Capture-phase interception for alpha sliders (defeat inline handlers)
  function bindAlpha(el, otherEl, numEl, otherNumEl){
    if (!el) return;

    el.addEventListener('input', function(e){
      console.log('[bindAlpha] slider input event:', el.id, el.value);
      try { e.stopImmediatePropagation(); } catch (e) {}
      try { e.stopPropagation(); } catch (e) {}

      // Clamp slider value to 0-100 range (sliders use 0-100, not 0-1)
      const v = clamp100(num(el.value, 100));
      el.value = String(Math.round(v));

      // Link top/bottom (both use 0-100)
      linkPair(el, otherEl, (x) => String(Math.round(clamp100(num(x, 100)))));

      // Sync numeric boxes
      paintAlphaNums();

      repaint();
    }, true);

    // Numeric input drives slider
    if (numEl){
      numEl.addEventListener('input', function(e){
        try { e.stopImmediatePropagation(); } catch (e) {}
        try { e.stopPropagation(); } catch (e) {}

        // Numeric inputs also use 0-100 range
        const v = clamp100(num(numEl.value, 100));
        numEl.value = String(Math.round(v));
        el.value = String(Math.round(v));

        // Link
        linkPair(el, otherEl, (x) => String(Math.round(clamp100(num(x, 100)))));

        paintAlphaNums();
        repaint();
      }, true);
    }
  }

  // Capture-phase interception for colors / hex
  function bindColor(colorEl, hexEl, otherColorEl, otherHexEl){
    if (colorEl){
      colorEl.addEventListener('input', function(e){
        console.log('[bindColor] color input event:', colorEl.id, colorEl.value);
        try { e.stopImmediatePropagation(); } catch (e) {}
        try { e.stopPropagation(); } catch (e) {}
        syncHexAndColor(colorEl, hexEl);
        linkPair(colorEl, otherColorEl, (x) => x);
        syncHexAndColor(otherColorEl, otherHexEl);
        repaint();
      }, true);
    }

    if (hexEl){
      hexEl.addEventListener('input', function(e){
        console.log('[bindColor] hex input event:', hexEl.id, hexEl.value);
        try { e.stopImmediatePropagation(); } catch (e) {}
        try { e.stopPropagation(); } catch (e) {}
        syncHexAndColor(hexEl, colorEl);
        linkPair(hexEl, otherHexEl, (x) => x);
        syncHexAndColor(otherHexEl, otherColorEl);
        repaint();
      }, true);
    }
  }

  // Transparent checkbox owns the mode; repaint only.
  if (bgTransparent){
    bgTransparent.addEventListener('change', function(){
      repaint();
    });
  }

  bindColor(topColor, topHex, botColor, botHex);
  bindColor(botColor, botHex, topColor, topHex);

  bindAlpha(topA, botA, topANum, botANum);
  bindAlpha(botA, topA, botANum, topANum);

  // Wire the bgLink button to toggle linked state
  const bgLinkBtn = document.getElementById('bgLink');
  if (bgLinkBtn && !bgLinkBtn.__bg_link_wired) {
    bgLinkBtn.__bg_link_wired = true;

    function updateLinkButtonUI() {
      const linked = isLinked();
      bgLinkBtn.textContent = linked ? '🔗' : '⛓️‍💥';
      bgLinkBtn.setAttribute('aria-pressed', linked ? 'true' : 'false');
      bgLinkBtn.setAttribute('title', linked ? 'Background linked' : 'Background unlinked');
      bgLinkBtn.setAttribute('aria-label', linked ? 'Background linked' : 'Background unlinked');
      bgLinkBtn.classList.toggle('is-on', linked);
    }

    bgLinkBtn.addEventListener('click', function() {
      setLinked(!isLinked());
      updateLinkButtonUI();
    });

    // Initialize button UI
    updateLinkButtonUI();
  }

  // Initialize numeric boxes
  try { paintAlphaNums(); } catch (e) {}

  // Defer initial background paint until render engine is loaded
  // (qr_render_engine.js loads after this file)
  function deferredInitialPaint() {
    if (typeof window.refreshBackground === 'function') {
      console.log('[deferredInitialPaint] refreshBackground found, calling repaint');
      repaint();
    } else {
      // Retry until render engine loads
      console.log('[deferredInitialPaint] refreshBackground not ready, retrying...');
      setTimeout(deferredInitialPaint, 50);
    }
  }
  setTimeout(deferredInitialPaint, 0);

  _bg_knobs_wired = true;
  console.log('[wireBackgroundKnobsOnce] completed successfully');
}

console.log('[qr_ui_toolkit.js] About to call wireBackgroundKnobsOnce...');
try {
  wireBackgroundKnobsOnce();
} catch (e) {
  console.error('[wireBackgroundKnobsOnce] error:', e);
}
console.log('[qr_ui_toolkit.js] After wireBackgroundKnobsOnce call');

(function () {
  const $ = (id) => document.getElementById(id);

  // expose to the later script
  window.$ = $;
  window.preview = $("qrPreview");
  window.typeSel = $("qrType");

  window.colorHex = function (id, fallback) {
    const node = $(id);
    const v = (node && node.value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : (fallback || "#000000");
  };

  window.val = function (id) {
    const n = $(id);
    return n ? (n.type === "checkbox" ? n.checked : (n.value || "")) : "";
  };
  
})();

// ---- Type → fields lookup (manifest-backed; types is a map) ----
function getTypeFields(type){
  const t = (type || "").toString().trim();
  const m = window.manifest || {};
  const safeTypes = (m && m.types && typeof m.types === 'object') ? m.types : {};
  const key = Object.keys(safeTypes).find(k => k.toLowerCase() === t.toLowerCase()) || t;
  const ids = safeTypes[key];
  return Array.isArray(ids) ? ids : [];
}

    // ---- Type → fields lookup (manifest-backed; types is a map) ----
function getTypeFields(type){
  const t = (type || "").toString().trim();
  const m = window.manifest || {};
  const safeTypes = (m && m.types && typeof m.types === 'object') ? m.types : {};
  const key = Object.keys(safeTypes).find(k => k.toLowerCase() === t.toLowerCase()) || t;
  const ids = safeTypes[key];
  return Array.isArray(ids) ? ids : [];
}

// --- helpers to create inputs ---
  function el(tag, props, kids){
    const n = document.createElement(tag);
    props = props || {};
    Object.entries(props).forEach(([k,v])=>{
      if(k==='class') n.className = v;
      else if(k==='text') n.textContent = v;
      else if(k==='html') n.innerHTML = v;
      else if(k==='for') n.htmlFor = v;
      else if(k==='style') n.setAttribute('style', v);
      else n.setAttribute(k, v);
    });
    (kids||[]).forEach(k=>{
      if(k==null) return;
      if(typeof k === 'string') n.appendChild(document.createTextNode(k));
      else n.appendChild(k);
    });
    return n;
  }
  function buildField(fieldId){
    // fieldId is a string key from manifest.types[typeKey] (e.g., "urlData")
    // Look up metadata from manifest.fields[fieldId]
    const id = String(fieldId || '').trim();
    if (!id) return null;

    const meta = ((window.manifest && window.manifest.fields) || {})[id];
    if (!meta) {
      console.warn('No field meta for', id);
      return null;
    }

    const wrap = el('div', { class: 'fldRow' });
    const labelText = (meta.label != null && meta.label !== '') ? meta.label : '';
    let input;

    if (meta.type === 'listbox') {
      // Scrollable list of clickable items (no dropdown)
      input = el('input', { id: id, type: 'hidden' });
      const list = el('div', { class: 'fldListbox', 'data-for': id });
      wrap.appendChild(input);
      wrap.appendChild(list);

      // Store mapping
      input.dataset.mkey = id;

      // Re-render on value change
      input.addEventListener('change', () => {
        try { if (typeof window.render === 'function') window.render(); } catch (e) {}
      });

      return wrap;
    } else if (meta.type === 'select') {
      // Select dropdown
      input = el('select', { id: id, class: 'fldInp' });
      (meta.options || []).forEach(opt => {
        const option = el('option', { text: opt });
        option.value = opt;
        input.appendChild(option);
      });
      if (labelText) {
        const label = el('label', { class: 'fldLbl', for: id, text: labelText });
        wrap.appendChild(label);
      }
      wrap.appendChild(input);
    } else if (meta.type === 'checkbox') {
      // Inline checkbox
      const row = el('label', { class: 'fldCheckRow' });
      const cb = el('input', { id: id, type: 'checkbox', class: 'fldCheck' });
      row.appendChild(cb);
      row.appendChild(el('span', { class: 'fldCheckLabel', text: labelText }));
      cb.dataset.mkey = id;
      // Seed from existing value
      try {
        const current = (typeof window._getValueById === 'function') ? window._getValueById(id) : undefined;
        if (current != null) cb.checked = !!current;
      } catch (e) {}
      // Re-render on change
      cb.addEventListener('change', () => {
        try { if (typeof window.render === 'function') window.render(); } catch (e) {}
      });
      return row; // checkbox returns its own row
    } else if (meta.type === 'textarea') {
      // Textarea
      const label = el('label', { class: 'fldLbl', for: id, text: labelText });
      input = el('textarea', { id: id, class: 'fldInp' });
      input.rows = meta.rows || 2;
      if (meta.placeholder) input.placeholder = meta.placeholder;
      wrap.appendChild(label);
      wrap.appendChild(input);
    } else {
      // text / email / number / url / password
      const label = el('label', { class: 'fldLbl', for: id, text: labelText });
      input = el('input', { id: id, type: meta.type || 'text', class: 'fldInp' });
      if (meta.placeholder) input.placeholder = meta.placeholder;
      if (meta.step) input.step = meta.step;
      wrap.appendChild(label);
      wrap.appendChild(input);
    }

    // Store mapping to manifest key
    input.dataset.mkey = id;

    // Seed from existing value if present
    try {
      const current = (typeof window._getValueById === 'function') ? window._getValueById(id) : undefined;
      if (current != null && String(current).length) {
        if (input.type === 'checkbox') {
          input.checked = !!current;
        } else {
          input.value = String(current);
        }
      }
    } catch (e) {}

    // Re-render on changes
    const eventType = (input.tagName === 'SELECT' || input.type === 'checkbox') ? 'change' : 'input';
    input.addEventListener(eventType, () => {
      try { if (typeof window.render === 'function') window.render(); } catch (e) {}
    });

    return wrap;
  }

  function renderTypeForm(typeKey){
    const details = document.getElementById('detailsPanel');
    if(!details) return;

    const fields = (typeof window.getTypeFields === 'function') ? window.getTypeFields(typeKey) : [];
    details.innerHTML = '';

    if(!fields || !fields.length){
      details.appendChild(el('div', { class:'fldEmpty', text:'No fields for this type.' }));
      return;
    }

    fields.forEach(f=>{
      const row = buildField(f);
      if(row) details.appendChild(row);
    });
  }

  // --- Type select: rebuild fields on change ---
  const typeSel = document.getElementById('qrType');
  if(typeSel){
    typeSel.addEventListener('change', ()=>{
      // Pre-save current design before form rebuild destroys old DOM
      try { if (typeof window._lsqSaveBeforeTypeSwitch === 'function') window._lsqSaveBeforeTypeSwitch(typeSel.value); } catch (e) {}
      try { renderTypeForm(typeSel.value); } catch (e) {}
      // Refresh color hex bindings after dynamic field changes
      try { if(typeof window.wireColorHexSync === 'function') window.wireColorHexSync(); } catch (e) {}
      try { if(typeof window.render === 'function') window.render(); } catch (e) {}
    });
  }

  // First-load hydration: moved to bootstrapper (after manifest loads)
  // The bootstrapper will call renderTypeForm after window.manifest is ready.
  window.renderTypeForm = renderTypeForm;

// --- Build QR "text" for each Type (Lafayette Square: Check-in + Claim) ---
function buildText(){
    const _typeSel = document.getElementById('qrType');
    const t = _typeSel ? (_typeSel.value || '') : '';

    // Helper: compute base URL (strip /codedesk/ from current path)
    const base = (typeof window.getLsqBaseUrl === 'function')
      ? window.getLsqBaseUrl()
      : window.location.origin;

    switch(t){
      case "Townie": {
        const biz = (val("bizSelect") || "").trim();
        if (!biz) return base;
        const url = base + '/checkin/' + encodeURIComponent(biz);
        // Update URL display
        try {
          const disp = document.getElementById('lsqUrlDisplay');
          if (disp) disp.textContent = url;
        } catch(e){}
        return url;
      }

      case "Guardian": {
        const biz = (val("bizSelect") || "").trim();
        const secret = (val("claimSecret") || "").trim();
        if (!biz) return base;
        let url = base + '/claim/' + encodeURIComponent(biz);
        if (secret) url += '/' + encodeURIComponent(secret);
        // Update URL display
        try {
          const disp = document.getElementById('lsqUrlDisplay');
          if (disp) disp.textContent = url;
        } catch(e){}
        return url;
      }

      default:
        return base;
    }
  }

// Ensure buildText is global (render-plane invariant)
window.buildText = buildText;

function codedeskSetLocked(locked){
    // Reflect lock state on <body> (styling + debugging sanity)
    try { document.body && document.body.classList && document.body.classList.toggle('codedesk-locked', !!locked); } catch(e){}

    // Always start with all drawers closed (Caption/Design/Business/Finish)
    try {
      const stepper = document.getElementById('stepper');
      if (stepper) {
        stepper.querySelectorAll('[data-step-panel]').forEach((p) => { p.style.display = 'none'; });
        stepper.querySelectorAll('[data-step-toggle]').forEach((b) => {
          try { b.setAttribute('aria-expanded', 'false'); } catch(e){}
        });

        // Disable/enable the accordion buttons (they must feel inert until filename is accepted)
        stepper.querySelectorAll('[data-step-toggle]').forEach((b) => {
          try { b.disabled = !!locked; } catch(e){}
          try { b.setAttribute('aria-disabled', locked ? 'true' : 'false'); } catch(e){}
        });

        // Prevent stray pointer events on the rail itself
        stepper.style.pointerEvents = locked ? 'none' : 'auto';
      }
    } catch(e){}
  }
window.codedeskSetLocked = codedeskSetLocked;

let _right_wired = false;

function wireRightAccordionBehaviorOnce() {

  if (_right_wired) return;

  const right = document.getElementById('stepper');
  if (!right) {
    // Stepper may be late-mounted; retry a few times.
    if (!wireRightAccordionBehaviorOnce._retrying) {
      wireRightAccordionBehaviorOnce._retrying = true;
      let tries = 0;
      const maxTries = 40; // ~10s @ 250ms
      const iv = setInterval(function(){
        tries++;
        try {
          const r = document.getElementById('stepper');
          if (r) {
            clearInterval(iv);
            wireRightAccordionBehaviorOnce._retrying = false;
            try { wireRightAccordionBehaviorOnce(); } catch(e){}
            return;
          }
        } catch(e){}
        if (tries >= maxTries) {
          clearInterval(iv);
          wireRightAccordionBehaviorOnce._retrying = false;
        }
      }, 250);
    }
    return;
  }

  const captionCard     = right.querySelector('.step-card[data-step="caption"]');
  const designCard      = right.querySelector('.step-card[data-step="design"]');
  const businessCard    = right.querySelector('.step-card[data-step="business"]');
  const finishCard      = right.querySelector('.step-card[data-step="finish"]');

  const designBtn      = designCard?.querySelector('[data-step-toggle]');
  const businessBtn    = businessCard?.querySelector('[data-step-toggle]');
  const finishBtn      = finishCard?.querySelector('[data-step-toggle]');

    function setMode(mode) {
    right.classList.toggle('mech-active',   mode === 'business');
    right.classList.toggle('finish-active', mode === 'finish');
    if (mode === 'design') right.classList.remove('mech-active', 'finish-active');

  }

  const isOpen = (card) => {
  const panel = card?.querySelector('[data-step-panel]');
  // visible if it participates in layout
  return !!panel && panel.offsetParent !== null;
};

  designBtn   ?.addEventListener('click', () => setMode('design'));
  businessBtn ?.addEventListener('click', () => setMode('business'));
  finishBtn   ?.addEventListener('click', () => setMode('finish'));

  // Open Business step by default on page load
  if (businessCard && !isOpen(businessCard) && !isOpen(designCard) && !isOpen(captionCard)) {
    const panel = businessCard.querySelector('[data-step-panel]');
    if (panel) {
      panel.style.display = '';
      businessCard.classList.add('is-open');
      try { businessBtn?.setAttribute('aria-expanded', 'true'); } catch(e){}
      setMode('business');
    }
  } else {
    setMode(isOpen(businessCard) ? 'business'
         : isOpen(finishCard)    ? 'finish'
         : 'design');
  }

  // Mark wired so we don’t duplicate listeners
  _right_wired = true;
}

function computeParkOffset(){
    const R = document.documentElement;
    const stage = document.querySelector('.preview-stage');
    if (!stage) return null;

    // Use the visible QR card if present
    const preview = document.getElementById('qrPreview');
    const previewH = preview?.getBoundingClientRect().height || 0;

    // Header height
    const headerH = document.querySelector('.header-bar')
        ?.getBoundingClientRect().height || 56;
    // Make header height available to CSS so scroll-margin/padding can do exact parking
    R.style.setProperty('--header-h', headerH + 'px');

    // Read CSS knobs
    const getNum = (name, fallback) => {
      const v = getComputedStyle(R).getPropertyValue(name).trim();
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const overlap = getNum('--preview-overlap', 180);
    const gap     = getNum('--preview-gap', 8);
    const nudge   = getNum('--park-nudge', 16);

    // Phone height - overlap + gap + nudge
    const park = Math.max(0, Math.round(previewH - overlap + gap + nudge));

    // Expose as CSS var so CSS scroll-* rules can use it if needed
    R.style.setProperty('--park-offset', park + 'px');

    // Helpful if you keep inner scrolling elsewhere; harmless otherwise
    const stepper = document.getElementById('stepper');
    if (stepper){
      stepper.style.scrollPaddingTop = `calc(${headerH}px + ${park}px)`;
    }
    return park;
  }

  // Make it globally callable (you already call window.reflowStepper elsewhere)
  window.reflowStepper = function reflowStepper(){
    computeParkOffset();
  };

  // Keep it fresh
  window.addEventListener('resize', computeParkOffset, { passive: true });
  window.addEventListener('orientationchange', computeParkOffset, { passive: true });
  document.fonts?.ready?.then?.(computeParkOffset);

// --- Uniform "park under QR" on open (stacked only, stable + deterministic) ---
document.removeEventListener?.('click', window.__okqr_park_handler__);
window.__okqr_park_handler__ = function (e) {
  const btn  = e.target.closest?.('[data-step-toggle]');
  const card = btn?.closest?.('.step-card');
  if (!card) return;

  // Respect lock state: buttons are disabled while locked, but we also guard here.
  try {
    if (btn.disabled) return;
    if (btn.getAttribute && btn.getAttribute('aria-disabled') === 'true') return;
    if (document.body && document.body.classList && document.body.classList.contains('codedesk-locked')) return;
  } catch (e) {}

      // --- Accordion behavior: panels ship as display:none in HTML, so we must toggle them here ---
  try {
    const stepper = document.getElementById('stepper') || card.closest('#stepper');
    if (stepper) {
      const panel = card.querySelector('[data-step-panel]');
      const step  = String(card.getAttribute('data-step') || '');

      const isOpen = !!(panel && panel.offsetParent !== null && getComputedStyle(panel).display !== 'none');

      // Close all drawers first (true accordion)
      stepper.querySelectorAll('[data-step-panel]').forEach((p) => { p.style.display = 'none'; });
      stepper.querySelectorAll('[data-step-toggle]').forEach((b) => {
        try { b.setAttribute('aria-expanded', 'false'); } catch(e){}
      });

      // Clear open state tracking (needed for pill visibility + header paint rules)
      stepper.querySelectorAll('.step-card').forEach((c) => { try { c.classList.remove('is-open'); } catch(e){} });

      // Finish should NOT fold down: it never opens a panel; it only toggles finish-active styling.
      if (step === 'finish') {
        stepper.classList.remove('mech-active');
        stepper.classList.add('finish-active');
        return;
      }

      // If it was closed, open it; if it was open, leave everything closed.
      if (panel && !isOpen) {
        panel.style.display = '';
        try { btn.setAttribute('aria-expanded', 'true'); } catch(e){}
        try { card.classList.add('is-open'); } catch(e){}

        // Mode styling parity with wide-mode setMode()
        if (step === 'business') {
          stepper.classList.remove('finish-active');
          stepper.classList.add('mech-active');
        } else {
          stepper.classList.remove('mech-active', 'finish-active');
        }
      } else {
        // Closing (or clicking an already-open drawer) returns to neutral
        stepper.classList.remove('mech-active', 'finish-active');
      }
    }
  } catch (e) {}

  // Wait one microtask so header pills can expand before measuring
  setTimeout(() => {
    if (!window.matchMedia('(max-width: 1279px)').matches) return;
    window.reflowStepper?.(); // recompute --park-offset after header reflows

    // ✅ scroll to the wrapper (includes pills) — avoids post-scroll jump
    const header = card.querySelector('.step-header-wrap')
                || card.querySelector('.step-header')
                || card;

    const preferSmooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    header.scrollIntoView({
      block: 'start',
      behavior: preferSmooth ? 'smooth' : 'auto'
    });
  }, 0);
};

document.addEventListener('click', window.__okqr_park_handler__);

// --- Safety: ensure headers remain clickable under the phone on mobile ---
function applyClickThroughForMobile() {
  const pass  = window.matchMedia('(max-width: 1279px)').matches;
  const stage = document.querySelector('.preview-stage');

  console.log('[PROBE render]', { href: String(location && location.href || ''), topEqSelf: (window === window.top), selfName: String(window.name || ''), hasWinBuildText: (typeof window.buildText === 'function'), hasLexBuildText: (typeof buildText === 'function') });
  
  if (!stage) return;

  const wrap   = stage.querySelector('.absolute'); // inner absolute inset wrapper
  const qr     = stage.querySelector('#qrPreview');
  const mount  = stage.querySelector('#qrMount');
  const svg    = stage.querySelector('#qrMount > svg');
  const arrows = stage.querySelectorAll('.nav-arrow');

  // Allow clicks to pass through overlayed preview area except for QR itself + nav arrows
  // so accordion headers remain tappable.
  try {
    if (wrap) wrap.style.pointerEvents = pass ? 'none' : '';
    if (qr)   qr.style.pointerEvents   = pass ? 'auto' : '';
    if (mount) mount.style.pointerEvents = pass ? 'auto' : '';
    if (svg)  svg.style.pointerEvents  = pass ? 'auto' : '';
    arrows.forEach(a => { try { a.style.pointerEvents = pass ? 'auto' : ''; } catch(e){} });
  } catch(e){}
}

window.addEventListener('resize', applyClickThroughForMobile, { passive: true });
window.addEventListener('orientationchange', applyClickThroughForMobile, { passive: true });