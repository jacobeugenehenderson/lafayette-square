/**
 * phoneBus — flight recorder for Preview's Phone mode.
 *
 * Two modes (operator-selectable):
 *
 *   EVENT   — tape recorder. Operator triggers a recording (Reload,
 *             →Browse, →Street); every frame + span between t0 and t1
 *             is captured. Auto-stops at AUTO_STOP_MS or via stop().
 *             Idle = chart shows last tape (or "press a trigger").
 *
 *   AMBIENT — continuous rolling window. Frames + spans push live;
 *             entries older than AMBIENT_WINDOW_MS are pruned. Chart
 *             always shows the most recent N seconds. Useful for
 *             watching steady-state cost (e.g. cosmetic Hero pan)
 *             without manual triggers.
 *
 * Chart consumes via getSession() — same shape both ways, so the
 * renderer is mode-agnostic.
 */

const MAX_FRAMES = 1200         // hard cap for event recordings (~20s)
const MAX_SPANS = 200
const AUTO_STOP_MS = 5000       // event recordings auto-stop after 5s
const AMBIENT_WINDOW_MS = 8000  // ambient rolling window
const WARMUP_FRAMES = 2         // skip first frames after start()

let autoStopTimer = null
let perfObserver = null

let mode = 'event'              // 'event' | 'ambient'
let session = makeIdle()
let ambient = makeAmbient()
// Ambient warmup: when first switching to ambient (or first mount),
// the first 2 frames may report stale stats from the prior render
// pipeline state. Skip them so they don't pin yMax.
let ambientWarmup = WARMUP_FRAMES

function makeIdle() {
  return { status: 'idle', label: null, t0: 0, t1: 0, frames: [], spans: [] }
}
function makeAmbient() {
  return { frames: [], spans: [] }
}

const subs = new Set()
function notify() { for (const fn of subs) fn() }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn) }

// ── Mode ─────────────────────────────────────────────────────────────
export function getMode() { return mode }
export function setMode(m) {
  if (m === mode) return
  // Stop any in-flight event recording when leaving event mode.
  if (mode === 'event' && session.status === 'recording') {
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null }
    session = { ...session, status: 'stopped', t1: performance.now() }
  }
  mode = m
  if (mode === 'ambient') {
    ambient = makeAmbient()
    ambientWarmup = WARMUP_FRAMES
    startPerfObserver()
  } else {
    if (session.status !== 'recording') stopPerfObserver()
  }
  notify()
}

// ── Event-mode triggers ──────────────────────────────────────────────
export function start(label) {
  if (mode !== 'event') return
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null }
  session = {
    status: 'recording',
    label,
    t0: performance.now(),
    t1: 0,
    frames: [],
    spans: [],
    _warmup: WARMUP_FRAMES,
  }
  autoStopTimer = setTimeout(() => stop(), AUTO_STOP_MS)
  startPerfObserver()
  notify()
}

export function stop() {
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null }
  if (mode === 'event') stopPerfObserver()
  if (session.status !== 'recording') return
  session = { ...session, status: 'stopped', t1: performance.now() }
  notify()
}

export function reset() {
  session = makeIdle()
  notify()
}

// ── Read API for the chart ───────────────────────────────────────────
// Returns a session-shaped object regardless of mode so the renderer
// doesn't have to branch.
export function getSession() {
  if (mode === 'ambient') {
    return {
      status: 'recording',          // chart treats as live
      label: 'ambient',
      t0: performance.now() - AMBIENT_WINDOW_MS,
      t1: 0,
      frames: ambient.frames,
      spans: ambient.spans,
    }
  }
  return session
}

// ── Frame + span ingest ──────────────────────────────────────────────
export function pushFrame(t, ms, calls, tris) {
  if (mode === 'ambient') {
    ambient.frames.push({ t, ms, calls, tris })
    pruneAmbient()
    if (ambient.frames.length % 6 === 0) notify()
    return
  }
  // event mode
  if (session.status !== 'recording') return
  if (session._warmup > 0) { session._warmup--; return }
  if (session.frames.length >= MAX_FRAMES) {
    session = { ...session, status: 'stopped', t1: t }
    stopPerfObserver()
    notify()
    return
  }
  session.frames.push({ t, ms, calls, tris })
  if (session.frames.length % 6 === 0) notify()
}

export function startSpan(id, lane, label, color = '#7dd3fc') {
  const target = mode === 'ambient' ? ambient : session
  if (mode === 'event' && session.status !== 'recording') return
  if (target.spans.length >= MAX_SPANS) return
  target.spans.push({ id, lane, label, color, t0: performance.now(), t1: null })
}

export function endSpan(id) {
  const target = mode === 'ambient' ? ambient : session
  if (mode === 'event' && session.status !== 'recording') return
  for (let i = target.spans.length - 1; i >= 0; i--) {
    if (target.spans[i].id === id && target.spans[i].t1 == null) {
      target.spans[i].t1 = performance.now()
      return
    }
  }
}

function pruneAmbient() {
  const cutoff = performance.now() - AMBIENT_WINDOW_MS
  while (ambient.frames.length && ambient.frames[0].t < cutoff) {
    ambient.frames.shift()
  }
  // Drop spans whose end time is older than cutoff (open spans never drop).
  ambient.spans = ambient.spans.filter(sp => (sp.t1 ?? Infinity) >= cutoff)
}

// ── PerformanceObserver — assets lane ────────────────────────────────
function startPerfObserver() {
  if (perfObserver) return
  if (typeof PerformanceObserver === 'undefined') return
  try {
    perfObserver = new PerformanceObserver((list) => {
      const target = mode === 'ambient' ? ambient
        : session.status === 'recording' ? session
        : null
      if (!target) return
      const cutoff = mode === 'ambient'
        ? performance.now() - AMBIENT_WINDOW_MS
        : session.t0
      for (const entry of list.getEntries()) {
        const t0e = entry.startTime
        const t1e = entry.startTime + entry.duration
        if (t1e < cutoff) continue
        const name = (() => {
          try {
            const u = new URL(entry.name, window.location.origin)
            const segs = u.pathname.split('/').filter(Boolean)
            return segs[segs.length - 1] || u.pathname
          } catch { return entry.name }
        })()
        target.spans.push({
          id: `r:${entry.name}:${entry.startTime}`,
          lane: 'assets',
          label: name,
          color: '#a78bfa',
          t0: t0e,
          t1: t1e,
        })
      }
    })
    perfObserver.observe({ entryTypes: ['resource'] })
  } catch { /* ignore — older browsers */ }
}
function stopPerfObserver() {
  if (perfObserver) { try { perfObserver.disconnect() } catch {} perfObserver = null }
}
