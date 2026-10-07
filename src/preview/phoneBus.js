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
 *
 * ⭐ THE FRAME TIMELINE (BRIEF-hero-arrival-perf step 0). A frame is the interval between two presented frames (rAF
 * deltas, GpuMonitor), which is what the eye judges as choppy and needs no GPU clock. On the same clock sit MARKS, the
 * instants a hitch may sit on: a file arriving (assets), a shader program first linked or a texture / geometry first
 * uploaded (compile, read off renderer.info growing), a KTX2 page transcoded or an image decoded (`tl:` marks,
 * src/lib/startupMarks.js#markTimeline), a slider drag or a shot change (input), a long animation frame and its scripts
 * (main). `frameTimeline()` reads a recording back: p50 / p95 / max, every frame over the target's budget, and each
 * HITCH (a frame that dropped at least one budget's worth past the run's own p50) beside the marks in it or in the frame
 * before it. ▶ window.__frameTimeline() · node checks/claims-frame-timeline-catches-a-stall.mjs
 */
import { getActiveProfile, getActiveProfileId } from './deviceProfiles'

const MAX_FRAMES = 1200         // hard cap for event recordings (~20s)
const MAX_FRAMES_COLD = 7200    // the cold start runs to COLD_CAP_MS (or __coldHoldMs), at up to 120 Hz
const MAX_SPANS = 200
const MAX_SPANS_COLD = 4000     // a cold start fetches hundreds of files; each is a span on the assets lane
const COLD_CAP_MS = 30000       // a cold-start recording stops at the last startup mark, or here
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
export function start(label, { ms = AUTO_STOP_MS } = {}) {
  if (mode !== 'event') return
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null }
  if (coldTimer) { clearInterval(coldTimer); coldTimer = null }
  session = {
    status: 'recording',
    label,
    t0: performance.now(),
    t1: 0,
    frames: [],
    spans: [],
    _warmup: WARMUP_FRAMES,
  }
  autoStopTimer = setTimeout(() => stop(), ms)
  startPerfObserver()
  notify()
}

// ── The cold start: the page's own load, as a recording ──────────────
// t0 is navigation start (0), so the strip reads the spec's sequence from the first byte: every file this page
// fetched is a span on the assets lane (Resource Timing, backfilled), and each startup mark (src/lib/startupMarks.js)
// is a tick on the startup lane. The header carries TIME TO WARD once the FIRST TRUTHFUL FRAME marks. It stops a second
// after every mark is in, or at COLD_CAP_MS; a shot change's stop() does not end it early.
let coldTimer = null
export function recordColdStart({ sequence, readMarks, describe }) {
  if (mode !== 'event' || session.cold) return
  session = { status: 'recording', label: 'cold start', t0: 0, t1: 0, frames: [], spans: [], _warmup: 0, cold: true }
  startPerfObserver({ buffered: true, describe })
  const seen = new Set()
  coldTimer = setInterval(() => {
    const marks = readMarks()
    for (const s of sequence) {
      const t = marks[s.id]
      if (t == null || seen.has(s.id)) continue
      seen.add(s.id)
      session.spans.push({ id: `mark:${s.id}`, lane: 'startup', label: s.label, short: s.short, color: s.blocking ? '#fbbf24' : '#a3a3a3', t0: t, t1: t, tick: true })
      if (s.id === 'first-truthful-frame') session.label = `cold start · TIME TO WARD ${(t / 1000).toFixed(2)}s`
    }
    // Done when EVERY mark is in (they need not arrive in the sequence's order: trees can draw before the ground), plus
    // a second; or at the cap.
    const all = sequence.every((s) => marks[s.id] != null)
    // `window.__coldHoldMs` (set before the page loads) holds the recording to that time, so a scripted cold run reads
    // the same window every time, past the last mark (the frame-timeline check's run a).
    const hold = (typeof window !== 'undefined' && window.__coldHoldMs) || 0
    const end = all ? Math.max(Math.max(...sequence.map((s) => marks[s.id])) + 1000, hold) : null
    if ((end != null && performance.now() > end) || performance.now() > Math.max(COLD_CAP_MS, hold)) {
      clearInterval(coldTimer); coldTimer = null
      if (marks['first-truthful-frame'] == null) session.label = `cold start · no FIRST TRUTHFUL FRAME in ${COLD_CAP_MS / 1000}s`
      session.cold = 'done'
      stop()
    }
    notify()
  }, 250)
  notify()
}

export function stop() {
  if (session.cold === true) return   // the cold start ends itself (recordColdStart)
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
export function pushFrame(t, ms, calls, tris, gpuMs = null, mainMs = null) {
  if (mode === 'ambient') {
    ambient.frames.push({ t, ms, calls, tris, gpuMs, mainMs })
    pruneAmbient()
    if (ambient.frames.length % 6 === 0) notify()
    return
  }
  // event mode
  if (session.status !== 'recording') return
  if (session._warmup > 0) { session._warmup--; return }
  if (session.frames.length >= (session.cold ? MAX_FRAMES_COLD : MAX_FRAMES)) {
    session = { ...session, status: 'stopped', t1: t }
    stopPerfObserver()
    notify()
    return
  }
  session.frames.push({ t, ms, calls, tris, gpuMs, mainMs })
  if (session.frames.length % 6 === 0) notify()
}

export function startSpan(id, lane, label, color = '#7dd3fc') {
  const target = mode === 'ambient' ? ambient : session
  if (mode === 'event' && session.status !== 'recording') return
  if (target.spans.length >= (target.cold ? MAX_SPANS_COLD : MAX_SPANS)) return
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
function startPerfObserver({ buffered = false, describe = null } = {}) {
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
        if (entry.entryType === 'mark') {
          if (!entry.name.startsWith(TIMELINE_PREFIX) || entry.startTime < cutoff) continue
          pushMark(target, MARK_LANE[entry.name.slice(TIMELINE_PREFIX.length)] || 'assets', `${entry.name.slice(TIMELINE_PREFIX.length)} · ${entry.detail ?? ''}`, entry.startTime)
          continue
        }
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
        if (target.spans.length >= (target.cold ? MAX_SPANS_COLD : MAX_SPANS)) return
        target.spans.push({
          id: `r:${entry.name}:${entry.startTime}`,
          lane: 'assets',
          label: describe ? `${name} · ${describe(entry)}` : name,
          color: '#a78bfa',
          t0: t0e,
          t1: t1e,
        })
      }
    })
    perfObserver.observe({ type: 'resource', buffered })
    perfObserver.observe({ type: 'mark', buffered })
  } catch { /* ignore — older browsers */ }
}
function stopPerfObserver() {
  if (perfObserver) { try { perfObserver.disconnect() } catch {} perfObserver = null }
}

// ── Marks: the instants a hitch may sit on (the frame timeline) ───────
const TIMELINE_PREFIX = 'tl:'                          // src/lib/startupMarks.js#markTimeline
const MARK_LANE = { ktx2: 'assets', decode: 'assets' }   // a `tl:` kind → its lane (decode: the worker's bytes back)
const MARK_COLOR = { compile: '#f472b6', input: '#34d399', main: '#f87171', assets: '#c4b5fd', camera: '#7dd3fc' }

function pushMark(target, lane, label, t0, t1 = t0) {
  if (target.spans.length >= (target.cold ? MAX_SPANS_COLD : MAX_SPANS)) return
  target.spans.push({ id: `m:${lane}:${t0}:${target.spans.length}`, lane, label, color: MARK_COLOR[lane] || '#a3a3a3', t0, t1, tick: t1 === t0, mark: true })
}

/** Put an instant (or a span, with t1) on the recording's timeline. A no-op when nothing is recording. */
export function markFrameEvent(lane, label, t0 = performance.now(), t1 = t0) {
  const target = mode === 'ambient' ? ambient : session.status === 'recording' ? session : null
  if (target) pushMark(target, lane, label, t0, t1)
}

// The time slider's input, caught at the document so the shared slider (DawnTimeline's `data-tod` seam) carries no
// Preview code: one mark per pointer event that drags it.
if (typeof document !== 'undefined') {
  const onTod = (e) => { if (e.buttons && e.target?.closest?.('[data-tod]')) markFrameEvent('input', `time slider ${e.type}`, e.timeStamp) }
  document.addEventListener('pointerdown', onTod, true)
  document.addEventListener('pointermove', onTod, true)
}

const pct = (xs, p) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : null
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10

/**
 * The recording, read as the eye reads it. `budgetMs` is the active target's frame budget (deviceProfiles.js).
 *   p50 / p95 / max of the frame interval · `over`: frames over the budget · `hitches`: frames whose interval exceeds
 *   the run's own p50 by at least one budget (a frame the eye sees dropped, whatever the steady rate), each with the
 *   marks inside it or the frame before it (an arrival lands in one frame; its work is drawn in the next).
 * Frames are presented intervals (rAF deltas); a mark's time is when it happened on the same clock.
 */
export function frameTimeline(s = getSession()) {
  const prof = getActiveProfile()
  const budgetMs = prof.frameBudgetMs
  const frames = s.frames || []
  const ms = frames.map((f) => f.ms).filter((x) => x > 0)
  const sorted = [...ms].sort((a, b) => a - b)
  const p50 = pct(sorted, 0.5)
  const marks = (s.spans || []).filter((sp) => sp.lane !== 'assets' || sp.mark || sp.t1 != null)
  const hitches = []
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i]
    if (!(f.ms >= p50 + budgetMs)) continue
    const lo = f.t - f.ms - (frames[i - 1].ms || 0), hi = f.t
    // A file counts at its arrival (t1); a span (a long animation frame) counts if it overlaps; a tick at its instant.
    const at = marks.filter((m) => {
      const t = m.lane === 'assets' && !m.mark ? m.t1 : m.t0
      const t1 = m.tick || (m.lane === 'assets' && !m.mark) ? t : (m.t1 ?? t)
      return t1 >= lo && t <= hi
    }).map((m) => `${m.lane}: ${m.label}`)
    hitches.push({ atMs: r1(f.t), ms: r1(f.ms), gpuMs: r1(f.gpuMs), mainMs: r1(f.mainMs), calls: f.calls, tris: f.tris, marks: at })
  }
  const span = frames.length ? frames[frames.length - 1].t - (frames[0].t - frames[0].ms) : 0
  return {
    label: s.label, status: s.status, target: getActiveProfileId(), budgetMs: r1(budgetMs),
    frames: frames.length, spanMs: Math.round(span), fps: span > 0 ? r1(1000 * frames.length / span) : null,
    p50: r1(p50), p95: r1(pct(sorted, 0.95)), p99: r1(pct(sorted, 0.99)), max: r1(sorted[sorted.length - 1] ?? null),
    // The frame's own main-thread time (frameCost.js) and its draws / triangles, median: what the steady cost is made of.
    mainP50: r1(pct(frames.map((f) => f.mainMs).filter((x) => x != null).sort((a, b) => a - b), 0.5)),
    callsP50: pct(frames.map((f) => f.calls).sort((a, b) => a - b), 0.5), trisP50: pct(frames.map((f) => f.tris).sort((a, b) => a - b), 0.5),
    over: ms.filter((x) => x > budgetMs).length, hitchMs: r1(p50 != null ? p50 + budgetMs : null), hitches,
    marks: marks.filter((m) => m.lane !== 'assets' || m.mark).length, files: (s.spans || []).filter((m) => m.lane === 'assets' && !m.mark).length,
  }
}

/** Record a scripted run of `ms` and resolve with its timeline (the check's runs b and c; run a is the cold start). */
export function recordRun(label, ms) {
  setMode('event')
  start(label, { ms })
  return new Promise((resolve) => {
    const off = subscribe(() => { if (session.status === 'stopped') { off(); resolve(frameTimeline(session)) } })
  })
}

if (typeof window !== 'undefined') {
  window.__frameTimeline = (opts = {}) => {
    const t = frameTimeline()
    if (opts.raw) t.raw = { frames: session.frames.map((f) => [r1(f.t), r1(f.ms)]), spans: session.spans.map((m) => [m.lane, m.label, r1(m.t0), r1(m.t1)]) }
    return t
  }
  window.__frameRun = recordRun
}
