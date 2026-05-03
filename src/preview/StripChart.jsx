/**
 * StripChart — event-bounded recording renderer.
 *
 * Renders the current phoneBus session fit-to-width. While recording,
 * the chart extends as new frames arrive. When stopped, the chart
 * is frozen and supports hover-to-inspect.
 *
 * Layout:
 *   ┌─ header ────────────────────────────────┐
 *   │ {yMax} ms        →label · 1.23s · ●rec  │
 *   ├─ meter rectangle ───────────────────────┤
 *   │  [bars equalizer-gradient'd to ms]      │
 *   │  ............ 60 fps ...................│
 *   ├─ swimlanes (only when spans present) ───┤
 *   │  [event spans]                          │
 *   └─────────────────────────────────────────┘
 *
 * Bars use a fixed gradient pinned to absolute ms (green at 0,
 * yellow at the 60fps line, orange at 30ms, red at 50ms+). Bars
 * shorter than the gradient's red zone stay green.
 */
import { useEffect, useRef, useState } from 'react'
import { getSession, subscribe } from './phoneBus'

const CEILING_MS = 17               // 60fps reference line
const Y_MIN_MAX_MS = 25             // axis floor — never compress below this

// Literal mobile budget. Bar height = worst-axis overage so the meter
// warns regardless of which axis is closest to the wall.
const BUDGET = { ms: 17, draws: 200, tris: 1_000_000 }

// "Knob" prompts — the chart's job is to tell you what to DO, not just
// what's wrong. Each over-budget axis maps to a concrete action.
const KNOB = {
  ms:    'simplify shaders · drop post-FX · defer work',
  draws: 'instance · atlas · merge geometry',
  tris:  'LOD harder · decimate',
}

// Composite: largest budget ratio across axes, expressed as ms-equivalent
// so we can plot height + apply the existing ms gradient consistently.
function composite(f) {
  const rMs    = f.ms    / BUDGET.ms
  const rDraws = f.calls / BUDGET.draws
  const rTris  = f.tris  / BUDGET.tris
  let axis = 'ms', factor = rMs
  if (rDraws > factor) { axis = 'draws'; factor = rDraws }
  if (rTris  > factor) { axis = 'tris';  factor = rTris  }
  // ms-equivalent — preserves raw ms when it dominates, otherwise
  // synthesizes the height that the worst axis would warrant.
  const effMs = Math.max(f.ms, BUDGET.ms * factor)
  return { effMs, axis, factor }
}
const HEADER_H = 20
const LEFT_GUTTER = 56              // y-axis labels live here, never on top of bars
const LANE_H = 18
const LANE_GAP = 2

// Fixed lane registry — these always render with their label, even
// when no spans were captured for that category in the recording.
// Predictable structure beats space-saving emptiness.
const LANES = [
  { id: 'camera',  label: 'camera',  hint: 'tween between shots' },
  { id: 'assets',  label: 'assets',  hint: 'fetch / texture / GLB' },
  { id: 'compile', label: 'compile', hint: 'shader compile (todo)' },
]

// Literal-budget verdicts. A frame's ms maps to one of these labels.
function verdict(ms) {
  if (ms <= 17) return { text: '60 fps', tone: 'good' }
  if (ms <= 22) return { text: 'near 60', tone: 'ok' }
  if (ms <= 33) return { text: '30 fps', tone: 'warn' }
  if (ms <= 50) return { text: 'jank', tone: 'bad' }
  return { text: 'stutter', tone: 'bad' }
}

const COLOR_BG = '#0d0d0f'
const COLOR_GRID = 'rgba(255,255,255,0.06)'
const COLOR_CEILING = 'rgba(255,255,255,0.22)'
const COLOR_LABEL = 'rgba(255,255,255,0.5)'
const COLOR_LABEL_DIM = 'rgba(255,255,255,0.35)'
const COLOR_LANE_BG = 'rgba(255,255,255,0.03)'
const COLOR_CARET = 'rgba(255,255,255,0.5)'

// Absolute-ms gradient — hot/cold spectrum (blue→cyan→green→yellow→orange→red).
// Tailwind 500-series for consistent saturation; the hue walk is smooth so
// no sharp banding at any single transition. 60fps lands squarely in green.
const GRADIENT_STOPS = [
  { ms: 0,   color: '#3b82f6' }, // blue — well under budget
  { ms: 10,  color: '#06b6d4' }, // cyan
  { ms: 17,  color: '#22c55e' }, // green — 60fps target
  { ms: 25,  color: '#eab308' }, // yellow
  { ms: 33,  color: '#f97316' }, // orange — 30fps line
  { ms: 50,  color: '#ef4444' }, // red — clear stutter
  { ms: 100, color: '#7f1d1d' }, // deep red — catastrophe
]

const fmt = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
                  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
                  : `${Math.round(n)}`

// ── Color sampling for tooltips ──────────────────────────────────────
function colorAt(ms) {
  if (ms <= GRADIENT_STOPS[0].ms) return GRADIENT_STOPS[0].color
  for (let i = 1; i < GRADIENT_STOPS.length; i++) {
    const a = GRADIENT_STOPS[i - 1]
    const b = GRADIENT_STOPS[i]
    if (ms <= b.ms) {
      const t = (ms - a.ms) / (b.ms - a.ms)
      return lerpHex(a.color, b.color, t)
    }
  }
  return GRADIENT_STOPS[GRADIENT_STOPS.length - 1].color
}
function lerpHex(a, b, t) {
  const pa = parseHex(a), pb = parseHex(b)
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
  return `rgb(${r},${g},${bl})`
}
function parseHex(h) {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

export default function StripChart({ height = 110 }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [hover, setHover] = useState(null)
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force(n => n + 1)), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let cssW = 0, cssH = 0

    const resize = () => {
      const r = wrapRef.current.getBoundingClientRect()
      cssW = Math.max(120, Math.floor(r.width))
      cssH = Math.max(80, Math.floor(r.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrapRef.current)

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const s = getSession()
      const w = cssW
      const h = cssH

      ctx.fillStyle = COLOR_BG
      ctx.fillRect(0, 0, w, h)

      // Header strip — labels live HERE, never on top of bars.
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textBaseline = 'middle'
      const headerY = HEADER_H / 2

      // Lanes always render in their fixed order — predictable structure.
      const laneCount = LANES.length
      const swimH = laneCount * (LANE_H + LANE_GAP) + 6
      const meterTop = HEADER_H
      const meterH = h - HEADER_H - swimH
      const meterBottom = meterTop + meterH

      // Empty / idle state — hint mid-meter, skip the rest.
      if (s.status === 'idle' || s.frames.length === 0) {
        ctx.textAlign = 'center'
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
        const hint = s.status === 'recording'
          ? `recording ${s.label || ''}…`
          : 'press a trigger to record'
        ctx.fillStyle = COLOR_LABEL_DIM
        ctx.fillText(hint, w / 2, meterTop + meterH / 2)
        ctx.textAlign = 'start'
        return
      }

      // Time + Y-axis fit
      const t0 = s.t0
      const tEnd = s.status === 'recording' ? performance.now() : s.t1
      const dur = Math.max(500, tEnd - t0)
      const barLeft = LEFT_GUTTER
      const barRight = w
      const barAreaW = barRight - barLeft
      const xPerMs = barAreaW / dur

      // Y-axis fits the 98th-percentile composite ms (max overage across
      // axes). Outliers clamp at the top with a saturated cap, so a single
      // 600ms hitch doesn't shrink everything else to a sliver.
      const compEffs = s.frames.map(f => composite(f).effMs).sort((a, b) => a - b)
      const p98 = compEffs[Math.floor(compEffs.length * 0.98)] ?? Y_MIN_MAX_MS
      let yMax = Math.max(Y_MIN_MAX_MS, p98)
      yMax = Math.ceil(yMax * 1.15)

      // Header text — session label, top-right
      ctx.textAlign = 'right'
      ctx.fillStyle = COLOR_LABEL_DIM
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
      const status = s.status === 'recording' ? '● rec' : 'done'
      ctx.fillText(`${s.label || 'session'} · ${(dur / 1000).toFixed(2)}s · ${status}`, w - 8, headerY)
      ctx.textAlign = 'start'

      // Meter background panel
      ctx.fillStyle = 'rgba(255,255,255,0.015)'
      ctx.fillRect(barLeft, meterTop, barAreaW, meterH)

      // 60fps reference line — extends across the bar area only
      const ceilingY = meterBottom - (meterH * CEILING_MS / yMax)
      ctx.strokeStyle = COLOR_CEILING
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(barLeft, ceilingY); ctx.lineTo(barRight, ceilingY)
      ctx.stroke()
      ctx.setLineDash([])

      // Y-axis labels in the LEFT GUTTER. Just two: top (yMax in ms)
      // and the dashed budget line (17 ms · 60 fps). Zero is implicit.
      ctx.fillStyle = COLOR_LABEL
      ctx.textAlign = 'right'
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(`${Math.round(yMax)} ms`, LEFT_GUTTER - 8, meterTop + 8)
      ctx.fillStyle = COLOR_LABEL_DIM
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText('60 fps', LEFT_GUTTER - 8, ceilingY - 1)
      ctx.textAlign = 'start'

      // Build the equalizer gradient ONCE (cached per draw — simple).
      // The gradient spans the meter height; stops are placed by ms.
      const grad = ctx.createLinearGradient(0, meterBottom, 0, meterTop)
      for (const stop of GRADIENT_STOPS) {
        const pos = Math.min(1, stop.ms / yMax)
        if (pos >= 0 && pos <= 1) grad.addColorStop(pos, stop.color)
      }
      // Anchor endpoints so the gradient covers the full meter.
      grad.addColorStop(0, GRADIENT_STOPS[0].color)
      grad.addColorStop(1, colorAt(yMax))

      // Bars: each bar is a clipped slice of the equalizer gradient.
      // We achieve "bar height = ms" by clipping the gradient rect to a
      // mask of bar tops. Two-pass: build mask path, paint gradient.
      const frames = s.frames
      const barW = Math.max(1, Math.min(8, barAreaW / Math.max(1, frames.length)))

      ctx.save()
      ctx.beginPath()
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]
        const x = barLeft + (f.t - t0) * xPerMs
        const eff = composite(f).effMs
        const clamped = Math.min(eff, yMax)
        const bh = (clamped / yMax) * meterH
        ctx.rect(x, meterBottom - bh, barW, bh)
      }
      ctx.clip()
      ctx.fillStyle = grad
      ctx.fillRect(barLeft, meterTop, barAreaW, meterH)
      ctx.restore()

      // Saturation caps: composite bars that exceeded yMax get a 3px red
      // strip at the very top — visually distinct from near-max bars.
      ctx.fillStyle = '#7f1d1d'
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]
        if (composite(f).effMs <= yMax) continue
        const x = barLeft + (f.t - t0) * xPerMs
        ctx.fillRect(x, meterTop, barW, 3)
      }


      // Swimlanes — always render the full registry, even empty ones.
      const laneTop0 = meterBottom + 6
      const laneIdxOf = new Map(LANES.map((l, i) => [l.id, i]))
      const laneAreaH = laneCount * (LANE_H + LANE_GAP)

      // Lane row backgrounds (paint first so cluster overlay sits on top)
      ctx.fillStyle = COLOR_LANE_BG
      for (let i = 0; i < laneCount; i++) {
        ctx.fillRect(barLeft, laneTop0 + i * (LANE_H + LANE_GAP), barAreaW, LANE_H)
      }

      // Cluster detection: when ≥3 spans bunch within CLUSTER_WINDOW_MS,
      // paint a warm backdrop across the cluster's time range. Cluster
      // says "this is staggerable work" — the chart's third job.
      const CLUSTER_WINDOW_MS = 200
      const CLUSTER_MIN_COUNT = 3
      const sortedSpans = [...s.spans].sort((a, b) => a.t0 - b.t0)
      const clusters = []
      for (let i = 0; i < sortedSpans.length; i++) {
        const start = sortedSpans[i].t0
        let end = (sortedSpans[i].t1 ?? tEnd)
        let count = 1
        let j = i + 1
        while (j < sortedSpans.length && sortedSpans[j].t0 - start < CLUSTER_WINDOW_MS) {
          count++
          end = Math.max(end, sortedSpans[j].t1 ?? tEnd)
          j++
        }
        if (count >= CLUSTER_MIN_COUNT) {
          clusters.push({ t0: start, t1: end, count })
          i = j - 1
        }
      }
      for (const c of clusters) {
        const x0 = barLeft + Math.max(0, (c.t0 - t0) * xPerMs)
        const x1 = barLeft + (c.t1 - t0) * xPerMs
        ctx.fillStyle = 'rgba(253, 230, 138, 0.12)'
        ctx.fillRect(x0, laneTop0, x1 - x0, laneAreaH)
        ctx.strokeStyle = 'rgba(253, 230, 138, 0.4)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x0 + 0.5, laneTop0); ctx.lineTo(x0 + 0.5, laneTop0 + laneAreaH)
        ctx.moveTo(x1 - 0.5, laneTop0); ctx.lineTo(x1 - 0.5, laneTop0 + laneAreaH)
        ctx.stroke()
        // small "stagger" hint above the cluster
        if (x1 - x0 > 30) {
          ctx.fillStyle = 'rgba(253, 230, 138, 0.7)'
          ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
          ctx.textAlign = 'left'
          ctx.fillText(`${c.count}× cluster — stagger`, x0 + 4, laneTop0 - 2)
          ctx.textAlign = 'start'
        }
      }

      // Spans
      for (const e of s.spans) {
        const t1 = e.t1 == null ? tEnd : e.t1
        const laneIdx = laneIdxOf.get(e.lane)
        if (laneIdx == null) continue
        const x0 = barLeft + Math.max(0, (e.t0 - t0) * xPerMs)
        const x1 = barLeft + (t1 - t0) * xPerMs
        const y = laneTop0 + laneIdx * (LANE_H + LANE_GAP)
        ctx.fillStyle = e.color
        ctx.globalAlpha = 0.85
        ctx.fillRect(x0, y, Math.max(2, x1 - x0), LANE_H)
        ctx.globalAlpha = 1
        if (x1 - x0 > 50) {
          ctx.fillStyle = '#000'
          ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
          ctx.fillText(e.label, x0 + 4, y + LANE_H / 2 + 1)
        }
      }

      // Lane labels in the LEFT GUTTER — vertically separate from the
      // y-axis labels (which are up at the meter top), no overlap.
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'right'
      for (const lane of LANES) {
        const idx = laneIdxOf.get(lane.id)
        const y = laneTop0 + idx * (LANE_H + LANE_GAP) + LANE_H / 2 + 1
        ctx.fillStyle = COLOR_LABEL_DIM
        ctx.fillText(lane.label, LEFT_GUTTER - 8, y)
      }
      ctx.textAlign = 'start'

      // Hover caret
      if (hover && s.status === 'stopped') {
        ctx.strokeStyle = COLOR_CARET
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(hover.x + 0.5, meterTop)
        ctx.lineTo(hover.x + 0.5, meterBottom)
        ctx.stroke()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [hover])

  const onMove = (e) => {
    const s = getSession()
    if (s.status !== 'stopped' || s.frames.length === 0) { setHover(null); return }
    const r = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (x < LEFT_GUTTER) { setHover(null); return }
    const barAreaW = r.width - LEFT_GUTTER
    const dur = Math.max(500, s.t1 - s.t0)
    const tAtX = s.t0 + ((x - LEFT_GUTTER) / barAreaW) * dur
    let nearest = s.frames[0]
    let bestDt = Math.abs(nearest.t - tAtX)
    for (const f of s.frames) {
      const dt = Math.abs(f.t - tAtX)
      if (dt < bestDt) { bestDt = dt; nearest = f }
    }
    const activeSpans = (s.spans || []).filter(sp => {
      const t1 = sp.t1 == null ? s.t1 : sp.t1
      return nearest.t >= sp.t0 && nearest.t <= t1
    })
    setHover({ x, y, frame: nearest, t: nearest.t - s.t0, spans: activeSpans })
  }
  const onLeave = () => setHover(null)

  return (
    <div ref={wrapRef} style={{
      width: '100%', height,
      borderRadius: 12,
      overflow: 'hidden',
      background: COLOR_BG,
      border: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
    }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: getSession().status === 'stopped' ? 'crosshair' : 'default' }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      />
      {hover && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          frame={hover.frame}
          t={hover.t}
          spans={hover.spans}
          containerW={wrapRef.current?.getBoundingClientRect().width || 0}
        />
      )}
    </div>
  )
}

function Tooltip({ x, y, frame, t, spans, containerW }) {
  const W = 240
  const left = Math.min(containerW - W - 8, Math.max(8, x + 12))
  const c = composite(frame)
  const isOver = c.factor > 1
  const verdictColor = colorAt(c.effMs)

  // What's the action? Name the dominant axis + the recommended knob.
  // For under-budget frames, the meter is calm — no advice needed.
  const headline = isOver
    ? `${c.axis} over · ${c.factor.toFixed(2)}× budget`
    : '60 fps · within budget'
  const knob = isOver ? KNOB[c.axis] : null

  return (
    <div style={{
      position: 'absolute',
      left, top: 8,
      width: W,
      padding: '8px 10px',
      background: 'rgba(20,20,22,0.96)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 11,
      color: '#e5e7eb',
      pointerEvents: 'none',
      lineHeight: 1.5,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ color: verdictColor, fontSize: 13, fontWeight: 600 }}>{headline}</span>
        <span style={{ color: '#9ca3af', fontSize: 10 }}>t={(t / 1000).toFixed(3)}s</span>
      </div>
      {knob && (
        <div style={{
          color: '#fde68a',
          fontSize: 10,
          marginBottom: 6,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          knob: {knob}
        </div>
      )}
      <Row label="frame ms" value={frame.ms.toFixed(1)} cap={`${BUDGET.ms}`}    over={frame.ms - BUDGET.ms} dominant={c.axis === 'ms' && isOver} />
      <Row label="draws"    value={fmt(frame.calls)}     cap={`${BUDGET.draws}`} over={frame.calls - BUDGET.draws} dominant={c.axis === 'draws' && isOver} />
      <Row label="tris"     value={fmt(frame.tris)}      cap="1M"                over={frame.tris - BUDGET.tris}    dominant={c.axis === 'tris' && isOver} />
      {spans.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {spans.map((sp, i) => (
            <div key={i} style={{ color: sp.color, fontSize: 10 }}>· {sp.lane}: {sp.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, cap, over, dominant }) {
  const color = over > 0 ? '#fca5a5' : '#e5e7eb'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
      <span style={{ color: dominant ? '#fde68a' : '#9ca3af' }}>{dominant ? '▶ ' : ''}{label}</span>
      <span style={{ color }}>{value}<span style={{ color: '#6b7280' }}> / {cap}</span></span>
    </div>
  )
}
