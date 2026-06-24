/**
 * GpuMonitor — runtime GPU/CPU cost readout for Preview.
 *
 * Reads `renderer.info` each frame:
 *   - calls    (draw calls — the mobile-critical number)
 *   - triangles
 *   - geometries / textures / programs (resident counts)
 * Plus a rolling CPU frame-time average from rAF deltas.
 *
 * Δ-event log: when frame time, draws, or tris jump significantly,
 * capture the most-recent cause label (set externally via `noteEvent`).
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { pushFrame as phoneBusPushFrame } from './phoneBus'
import { ACTIVE_PROFILE, DEVICE_PROFILES, getActiveProfile, getActiveProfileId, subscribeActiveProfile } from './deviceProfiles'

const eventBus = { last: null, log: [] }
export function noteEvent(label) {
  eventBus.last = { label, at: Date.now() }
}

const stats = { fps: 0, frameMs: 0, calls: 0, tris: 0, geos: 0, tex: 0, progs: 0 }
const subs = new Set()
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn) }
const notify = () => { for (const fn of subs) fn() }

// ── Per-layer cost attribution ─────────────────────────────────────
// On a layer toggle, capture the rolling-average stats at toggle-time
// as `pre`, then again ~30 frames later as `post`. The signed delta
// (positive when toggling ON) is the layer's measured cost.

const SAMPLE_WINDOW = 30   // samples (~300 frames) averaged for the pre-toggle baseline
// Per-toggle measurement: skip the first SETTLE_SAMPLES post-toggle samples
// (the toggle transient — re-upload spikes / first-draw shader compile / a
// .visible flip settling), then average POST_SAMPLES purely-post-toggle
// samples. The old design waited only MEASURE_DELAY=30 frames before reading
// `post`, but `post` averaged the last ~300 frames of history — so ~90% of it
// was pre-toggle samples and every delta read ~10% of true (Vernier Phase-0
// §3). Averaging post-only samples is the timing fix.
const SETTLE_SAMPLES = 2   // samples (~20 frames) discarded after a toggle
const POST_SAMPLES   = 5   // settled post-toggle samples averaged for `post`

const layerCosts = new Map()           // key → { ms, calls, tris }
const layerCostListeners = new Set()
const layerCostSubscribe = (fn) => { layerCostListeners.add(fn); return () => layerCostListeners.delete(fn) }
const layerCostNotify = () => { for (const fn of layerCostListeners) fn() }

const pendingMeasurements = []         // { key, willBeOn, pre, skip, acc, n }

// Public: tell the monitor a layer is about to flip. Captures the settled
// pre-toggle baseline now; the ticker then discards the transient and
// averages the next POST_SAMPLES settled samples into the layer's cost.
export function measureToggle(key, willBeOn) {
  pendingMeasurements.push({
    key, willBeOn,
    pre: snapshotStats(),          // settled pre-toggle rolling average
    skip: SETTLE_SAMPLES,          // drop the post-toggle transient
    acc: { ms: 0, calls: 0, tris: 0 },
    n: 0,                          // settled post-toggle samples collected
  })
}

export function getLayerCost(key) { return layerCosts.get(key) || null }
export function useLayerCosts() {
  // Subscribe + force re-render on changes; returns the live Map.
  if (typeof window === 'undefined') return layerCosts
  return layerCosts
}
export { layerCostSubscribe }

// Spike thresholds come from the ACTIVE profile, read live in the ticker (the
// env selector can change which device is active) — see getActiveProfile() below.

// Rolling window of recent samples for averaging.
const sampleBuffer = []  // each entry: { ms, calls, tris }
function snapshotStats() {
  if (sampleBuffer.length === 0) {
    return { ms: stats.frameMs, calls: stats.calls, tris: stats.tris }
  }
  let ms = 0, calls = 0, tris = 0
  const n = Math.min(SAMPLE_WINDOW, sampleBuffer.length)
  const start = sampleBuffer.length - n
  for (let i = start; i < sampleBuffer.length; i++) {
    ms += sampleBuffer[i].ms
    calls += sampleBuffer[i].calls
    tris  += sampleBuffer[i].tris
  }
  return { ms: ms / n, calls: calls / n, tris: tris / n }
}

// Inline ticker — runs inside Canvas, polls renderer.info, detects
// spikes, and publishes to the DOM-side panel via subs.
export function GpuMonitorTicker() {
  const { gl } = useThree()
  const times = useRef([])
  const frameCount = useRef(0)
  const baseline = useRef({ ms: ACTIVE_PROFILE.frameBudgetMs, calls: 0, tris: 0 })
  const spikeLog = useRef([])
  // Track previous accumulator values so we can compute per-frame deltas.
  // Three.js's gl.info.render auto-resets at the START of each render() call,
  // so with EffectComposer's multi-pass setup the in-frame sample lands AFTER
  // the post-FX tail — usually 1 draw / 1 tri. Disabling autoReset and
  // delta-ing against last frame's accumulator gives honest per-frame totals.
  const prevCalls = useRef(0)
  const prevTris = useRef(0)

  useEffect(() => {
    gl.info.autoReset = false
    // Seed the deltas with current totals so the first frame after
    // mount doesn't report a giant "cumulative since renderer init"
    // value as a single-frame delta.
    prevCalls.current = gl.info.render.calls
    prevTris.current  = gl.info.render.triangles
  }, [gl])

  useFrame(() => {
    const now = performance.now()
    const lastT = times.current.length ? times.current[times.current.length - 1] : now
    const frameMs = now - lastT
    times.current.push(now)
    if (times.current.length > 60) times.current.shift()

    // Per-frame strip-chart sample. Delta from last frame's accumulator
    // = the work this frame's render(s) added — covers all post-FX passes.
    const totalCalls = gl.info.render.calls
    const totalTris  = gl.info.render.triangles
    const dCalls = Math.max(0, totalCalls - prevCalls.current)
    const dTris  = Math.max(0, totalTris  - prevTris.current)
    prevCalls.current = totalCalls
    prevTris.current  = totalTris
    phoneBusPushFrame(now, frameMs, dCalls, dTris)
    // Hold the latest per-frame delta so GpuPanel's draws/tris readouts
    // reflect this-frame work, not the renderer's cumulative since init.
    stats.calls = dCalls
    stats.tris  = dTris

    if (++frameCount.current % 10 !== 0) return

    if (times.current.length > 1) {
      const dt = times.current[times.current.length - 1] - times.current[0]
      stats.frameMs = Math.round((dt / (times.current.length - 1)) * 10) / 10
      stats.fps = stats.frameMs > 0 ? Math.round(1000 / stats.frameMs) : 0
    }

    const info = gl.info
    // calls/tris are already per-frame deltas (set above); keep memory
    // counters cumulative since they are.
    stats.geos  = info.memory.geometries
    stats.tex   = info.memory.textures
    stats.progs = info.programs?.length || 0

    // Push onto rolling buffer for per-layer attribution
    const sample = { ms: stats.frameMs, calls: stats.calls, tris: stats.tris }
    sampleBuffer.push(sample)
    if (sampleBuffer.length > SAMPLE_WINDOW * 4) sampleBuffer.shift()

    // Resolve pending measurements by averaging ONLY settled post-toggle
    // samples (the transient is skipped first), so the delta is the layer's
    // steady-state per-frame cost — not the old pre/post-overlap dilution.
    if (pendingMeasurements.length) {
      let dirty = false
      for (let i = pendingMeasurements.length - 1; i >= 0; i--) {
        const m = pendingMeasurements[i]
        if (m.skip > 0) { m.skip--; continue }   // drop the toggle transient
        m.acc.ms += sample.ms; m.acc.calls += sample.calls; m.acc.tris += sample.tris
        m.n++
        if (m.n >= POST_SAMPLES) {
          const sign = m.willBeOn ? 1 : -1
          const post = { ms: m.acc.ms / m.n, calls: m.acc.calls / m.n, tris: m.acc.tris / m.n }
          layerCosts.set(m.key, {
            ms:    (post.ms    - m.pre.ms)    * sign,
            calls: Math.round((post.calls - m.pre.calls) * sign),
            tris:  Math.round((post.tris  - m.pre.tris)  * sign),
          })
          pendingMeasurements.splice(i, 1)
          dirty = true
        }
      }
      if (dirty) layerCostNotify()
    }

    // Spike detection — log if any metric crosses threshold or doubles
    const prof = getActiveProfile()
    const isSpike =
      stats.frameMs > prof.spikeMs ||
      stats.calls > prof.drawBudget ||
      stats.tris > prof.triBudget ||
      stats.frameMs > baseline.current.ms * 2 ||
      stats.calls > baseline.current.calls * 2 ||
      stats.tris > baseline.current.tris * 2
    if (isSpike) {
      const cause = eventBus.last?.label || '(no event)'
      const entry = {
        at: Date.now(),
        cause,
        ms: stats.frameMs,
        calls: stats.calls,
        tris: stats.tris,
      }
      spikeLog.current.push(entry)
      if (spikeLog.current.length > 50) spikeLog.current.shift()
      eventBus.log = spikeLog.current.slice()
    } else {
      // Slowly track baseline when stable
      baseline.current.ms    = baseline.current.ms    * 0.9 + stats.frameMs * 0.1
      baseline.current.calls = baseline.current.calls * 0.9 + stats.calls   * 0.1
      baseline.current.tris  = baseline.current.tris  * 0.9 + stats.tris    * 0.1
    }

    notify()
  })
  return null
}

// ── Scene-total verdict — the budget call, one chip per device ──────
// Budget-% is a SCENE-TOTAL question, NOT a per-layer one: a single layer can
// dwarf the per-frame draw ceiling (the "Trees 1004%" bug), but the all-on
// scene total vs a device budget is meaningful. So the budget verdict lives
// here, with one read-only chip per device (desktop / phone-hi / phone-lo) —
// the operator sees at a glance which devices the slab fits. (Not the Phase-3
// active-device SELECTOR; just status.) Each chip = worst of draws/tris/memory
// vs that device's budget.
// ⚠️ Trust-gate (`HANDOFF-preview-measurement.md §"Open decisions"`): the phone
// budgets are INTERIM until the Phase-3 measurement, so a green chip is NOT yet
// a trustworthy "ship it" — surfaced inline. Thermal + transition are Phase 4.
const VERDICT_TONE = {
  good: { color: 'var(--success, #4ade80)', mark: '✅' },
  warn: { color: 'var(--warning, #f5a623)', mark: '⚠️' },
  bad:  { color: 'var(--error, #ff5566)',   mark: '❌' },
}
function toneForRatio(r) { return r > 1 ? 'bad' : r > 0.75 ? 'warn' : 'good' }

// Worst budget ratio for the live scene total against one device profile.
function sceneRatioFor(p) {
  let r = Math.max(stats.calls / p.drawBudget, stats.tris / p.triBudget)
  const mem = p.memBudgetCounts
  if (mem) {
    r = Math.max(r,
      stats.geos  / mem.geometries,
      stats.tex   / mem.textures,
      stats.progs / mem.programs,
    )
  }
  return r
}

const VERDICT_DEVICE_ORDER = ['desktop', 'phone-hi', 'phone-lo']

function SceneVerdict() {
  return (
    <div style={{
      paddingBottom: 8, marginBottom: 2,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div className="section-heading" style={{ marginBottom: 4 }}>scene vs budget</div>
      <div className="flex gap-1 flex-wrap">
        {VERDICT_DEVICE_ORDER.map(id => {
          const p = DEVICE_PROFILES[id]
          if (!p) return null
          return <DeviceChip key={id} profile={p} />
        })}
      </div>
      <div className="flex gap-1 flex-wrap" style={{ marginTop: 4 }}>
        <Chip label="thermal" coming />
        <Chip label="transition" coming />
      </div>
      <div className="glass-text-dim" style={{ fontSize: 9, marginTop: 5, lineHeight: 1.4 }}>
        phone budgets <span style={{ color: 'var(--warning, #f5a623)' }}>INTERIM</span> — a green chip is not yet a trustworthy ship call (pending Phase-3 measurement).
      </div>
    </div>
  )
}

function DeviceChip({ profile }) {
  const ratio = sceneRatioFor(profile)
  const t = VERDICT_TONE[toneForRatio(ratio)]
  // The env selector's active device gets a filled chip + caret, so it's clear
  // which one the gauges above are judging against.
  const active = getActiveProfileId() === profile.id
  return (
    <span className="font-mono" style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 4,
      border: `1px solid ${t.color}`, color: t.color,
      background: active ? `color-mix(in srgb, ${t.color} 22%, transparent)` : 'transparent',
      fontWeight: active ? 700 : 400,
    }}>
      {active ? '▸ ' : ''}{t.mark} {profile.id} · {Math.round(ratio * 100)}%
    </span>
  )
}

function Chip({ label, tone, coming }) {
  const color = coming ? 'var(--on-surface-subtle)' : VERDICT_TONE[tone].color
  return (
    <span className="font-mono" style={{
      fontSize: 9, padding: '1px 6px', borderRadius: 4,
      border: `1px solid ${coming ? 'rgba(255,255,255,0.12)' : color}`,
      color,
      opacity: coming ? 0.55 : 1,
    }}>
      {coming ? `● ${label} · soon` : `● ${label}`}
    </span>
  )
}

// DOM-side readout. Lives outside the Canvas.
export function GpuPanel() {
  const [, setTick] = useState(0)
  // Re-render on stats AND on the active-profile change (the env selector), so
  // the caps/colors below follow the selected device.
  useEffect(() => {
    const a = subscribe(() => setTick(n => n + 1))
    const b = subscribeActiveProfile(() => setTick(n => n + 1))
    return () => { a(); b() }
  }, [])

  const prof = getActiveProfile()
  const fmt = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
                     : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
                     : `${n}`
  const msColor =
    stats.frameMs > prof.spikeMs ? 'var(--error)'
    : stats.frameMs > prof.warnMs ? 'var(--warning, #f5a623)'
    : 'var(--success, #4ade80)'

  const mem = prof.memBudgetCounts

  return (
    <div className="space-y-2">
      <SceneVerdict />

      <div className="section-heading">GPU</div>

      <div className="flex items-baseline justify-between">
        <span className="glass-text-secondary" style={{ fontSize: 11 }}>frame</span>
        <span className="font-mono" style={{ color: msColor, fontSize: 13 }}>
          {stats.frameMs.toFixed(1)} ms · {stats.fps} fps
        </span>
      </div>

      <Row label="draws" value={stats.calls}    cap={prof.drawBudget} fmt={fmt} />
      <Row label="tris"  value={stats.tris}     cap={prof.triBudget} fmt={fmt} />

      {/* Resident memory ceiling (Vernier Phase 2). COUNTS, not bytes — three.js
          exposes counts, not VRAM bytes; a coarse proxy for the never-crash
          OOM gauge. Budget numbers are INTERIM/generous (deviceProfiles.js). */}
      <Row label="geos"  value={stats.geos}     cap={mem?.geometries ?? null} fmt={fmt} />
      <Row label="tex"   value={stats.tex}      cap={mem?.textures   ?? null} fmt={fmt} />
      <Row label="progs" value={stats.progs}    cap={mem?.programs   ?? null} fmt={fmt} />

      <SpikeLog />
    </div>
  )
}

function Row({ label, value, cap, fmt }) {
  const pct = cap ? Math.min(100, (value / cap) * 100) : 0
  const color =
    !cap ? 'var(--on-surface-subtle)'
    : pct > 100 ? 'var(--error)'
    : pct > 75  ? 'var(--warning, #f5a623)'
    : 'var(--on-surface-variant)'
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
      <span className="glass-text-secondary" style={{ width: 38 }}>{label}</span>
      <span className="font-mono" style={{ color, minWidth: 56, textAlign: 'right' }}>
        {fmt(value)}{cap ? <span className="glass-text-dim"> / {fmt(cap)}</span> : null}
      </span>
      {cap ? (
        <div style={{
          flex: 1, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min(100, pct)}%`, height: '100%',
            background: color,
          }} />
        </div>
      ) : <div style={{ flex: 1 }} />}
    </div>
  )
}

function SpikeLog() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 500)
    return () => clearInterval(id)
  }, [])
  const log = eventBus.log.slice(-3).reverse()
  const ROW_H = 14
  const SLOTS = 3
  return (
    <div className="space-y-0.5 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="glass-text-dim" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        recent spikes
      </div>
      <div style={{ height: ROW_H * SLOTS }}>
        {log.map((e, i) => (
          <div key={e.at + ':' + i} className="font-mono glass-text-muted" style={{ fontSize: 10, height: ROW_H, lineHeight: `${ROW_H}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {e.cause} · {e.ms}ms · {fmt(e.calls)} draws
          </div>
        ))}
      </div>
    </div>
  )
}
function fmt(n) { return n >= 1000 ? `${(n/1000).toFixed(1)}K` : `${n}` }
