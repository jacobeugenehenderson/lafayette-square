/**
 * SkyGradientGrid — Sky & Light card's 2D color matrix editor.
 *
 * Twirl-collapsible. Open drawer:
 *   • Editor grid: 5 rows (zenith → horizon → sun-glow) × 22 cols.
 *     No row or column labels — vertical position is self-describing,
 *     slot color stripes between groups mark the TOD divisions.
 *   • Now preview: full-width vertical slice of the resolved sky at
 *     the current minute, with sun + moon dots placed by altitude
 *     when above horizon.
 *   • 24h preview: stacked sample columns showing the full day's
 *     color story end to end.
 *
 * Edits go through useCartographStore.setSkySwatch which autosaves.
 */
import { useState, useMemo, useEffect, Fragment } from 'react'
import SunCalc from 'suncalc'
import useCartographStore from './stores/useCartographStore.js'
import { NAMED_TOD_SLOTS, getTodSlotMinutes } from './animatedParam.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import {
  SKY_BANDS, SKY_SLOT_COLUMNS, SKY_DEFAULTS,
  resolveSkyAtMinute, getSkyColumnMinutes,
} from './skyGrid.js'

const BAND_ORDER = ['high', 'mid', 'low', 'horizon', 'sunGlow']  // top-to-bottom
const LAT = 38.6160
const LON = -90.2161
const PREVIEW_SAMPLES = 96  // ~15 min per sample for the 24h strip

function rgbCss(rgb) {
  const r = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255)
  const g = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255)
  const b = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255)
  return `rgb(${r},${g},${b})`
}

function SwatchCell({ slotId, colIdx, band, hex, onChange }) {
  return (
    <input
      type="color"
      className="sky-swatch"
      value={hex || '#000000'}
      onChange={(e) => onChange(slotId, colIdx, band, e.target.value)}
      style={{
        width: '100%', height: '100%',
        cursor: 'pointer', display: 'block', minWidth: 0, boxSizing: 'border-box',
      }}
      title={`${slotId} · col ${colIdx + 1} · ${band}`}
    />
  )
}

function EditorGrid({ sky, setSwatch, tick }) {
  const cols = []
  for (const s of NAMED_TOD_SLOTS) {
    const n = SKY_SLOT_COLUMNS[s.id] || 1
    for (let c = 0; c < n; c++) {
      cols.push({
        slotId: s.id, colIdx: c, slotColor: s.color,
        isFirst: c === 0,
      })
    }
  }
  const totalCols = cols.length

  const valueFor = (slotId, colIdx, band) => {
    const slot = sky?.values?.[slotId]
    const tuple = (Array.isArray(slot) && slot[colIdx]) || SKY_DEFAULTS[slotId][colIdx]
    return tuple?.[band] || '#000000'
  }

  // Playhead position in EDITOR space — fractional column index (0..totalCols).
  // Resolves which two columns bracket the current minute (handling wrap),
  // returns aIdx + t. Different math from the day strip's % of 1440.
  const playheadColX = useMemo(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = getTodSlotMinutes(tod.currentTime)
    const colMins = getSkyColumnMinutes(slotMinutes)
    if (!colMins.length) return 0
    let aIdx = -1
    for (let i = 0; i < colMins.length; i++) {
      const cur  = colMins[i]
      const next = colMins[(i + 1) % colMins.length]
      const nextM = next.minute >= cur.minute ? next.minute : next.minute + 1440
      const m = minute >= cur.minute ? minute : minute + 1440
      if (m >= cur.minute && m <= nextM) { aIdx = i; break }
    }
    if (aIdx < 0) aIdx = colMins.length - 1
    const a = colMins[aIdx], b = colMins[(aIdx + 1) % colMins.length]
    let aM = a.minute, bM = b.minute, m = minute
    if (bM < aM) bM += 1440
    if (m < aM) m += 1440
    const span = bM - aM || 1
    const t = Math.max(0, Math.min(1, (m - aM) / span))
    // Find aIdx position in the cols array order (matches NAMED_TOD_SLOTS order
    // since getSkyColumnMinutes walks slots in the same order then sorts by
    // minute — close enough for visualization; lookup by slotId+colIdx is safer).
    const editorAIdx = cols.findIndex(c => c.slotId === a.slotId && c.colIdx === a.colIdx)
    const editorBIdx = cols.findIndex(c => c.slotId === b.slotId && c.colIdx === b.colIdx)
    if (editorAIdx < 0 || editorBIdx < 0) return 0
    // Handle wrap (Night → Dawn) by clamping; visually the playhead simply
    // hits the right edge then reappears at the left.
    let frac
    if (editorBIdx === editorAIdx) frac = editorAIdx
    else if (Math.abs(editorBIdx - editorAIdx) === 1) frac = editorAIdx + t * (editorBIdx - editorAIdx)
    else frac = editorAIdx  // wrap case: don't draw across the full strip
    // Each column center sits at (frac + 0.5) / totalCols of the strip.
    return ((frac + 0.5) / totalCols) * 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, totalCols])

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))`,
    gap: 3,
    background: 'transparent',
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={gridStyle}>
        {BAND_ORDER.map((band) => (
          <Fragment key={`row-${band}`}>
            {cols.map((c, i) => (
              <div
                key={`cell-${band}-${i}`}
                style={{ aspectRatio: '1 / 1' }}
              >
                <SwatchCell
                  slotId={c.slotId}
                  colIdx={c.colIdx}
                  band={band}
                  hex={valueFor(c.slotId, c.colIdx, band)}
                  onChange={setSwatch}
                />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      {/* Playhead caret — points UP at the column currently being
          resolved, sits just beneath the editor's bottom edge. */}
      <div style={{
        position: 'absolute',
        bottom: -5,
        left: `${playheadColX}%`,
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderBottom: '5px solid var(--vic-gold, #ffd166)',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// "Now" preview — vertical sky slice at the current minute, with sun
// and moon placed by altitude. Refreshes via useFrame so the strip
// updates as TOD scrubs.
function NowPreview({ sky, tick }) {
  const { resolved, sunAlt, moonAlt, moonIllum } = useMemo(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = getTodSlotMinutes(tod.currentTime)
    const r = resolveSkyAtMinute(sky, minute, slotMinutes)
    const sunPos = SunCalc.getPosition(tod.currentTime, LAT, LON)
    const moonPos = SunCalc.getMoonPosition(tod.currentTime, LAT, LON)
    const moonIllum = SunCalc.getMoonIllumination(tod.currentTime).fraction
    return {
      resolved: r,
      sunAlt: sunPos.altitude,
      moonAlt: moonPos.altitude,
      moonIllum,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky, tick])

  if (!resolved) return null

  // CSS gradient: zenith at top → horizon at bottom. 4 stops.
  const bg = `linear-gradient(to bottom,
    ${rgbCss(resolved.high)} 0%,
    ${rgbCss(resolved.mid)} 33%,
    ${rgbCss(resolved.low)} 66%,
    ${rgbCss(resolved.horizon)} 100%)`

  // Altitude → vertical position. 0 rad = horizon (bottom). π/2 = zenith (top).
  // Map [-0.05, π/2] → [bottom .. top]; below -0.05 = below horizon, hide.
  function altToY(altRad) {
    if (altRad < -0.05) return null
    const t = Math.max(0, Math.min(1, altRad / (Math.PI / 2)))
    return (1 - t) * 100  // % from top
  }
  const sunY = altToY(sunAlt)
  const moonY = altToY(moonAlt)

  // Sun glow wash: paint a soft horizon glow when sun is near or below
  // horizon (twilight). Falls off above 0.3 rad (~17°).
  const sunGlowAlpha = Math.max(0, Math.min(1,
    sunAlt < 0
      ? 1 - Math.abs(sunAlt) / 0.3
      : 1 - sunAlt / 0.3
  ))
  const sunGlowCss = sunGlowAlpha > 0.05
    ? `linear-gradient(to top,
        ${rgbCss(resolved.sunGlow)} 0%,
        rgba(0,0,0,0) 30%)`
    : null

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{
        position: 'relative',
        height: 100,
        border: '1px solid var(--outline-variant)',
        background: bg,
        overflow: 'hidden',
      }}>
        {/* Sun glow wash overlay */}
        {sunGlowCss && (
          <div style={{
            position: 'absolute', inset: 0,
            background: sunGlowCss,
            opacity: sunGlowAlpha,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }} />
        )}
        {/* Sun dot */}
        {sunY !== null && (
          <div style={{
            position: 'absolute',
            top: `${sunY}%`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff5d6',
            boxShadow: '0 0 12px 4px rgba(255,220,140,0.8)',
            pointerEvents: 'none',
          }} title={`Sun · ${(sunAlt * 180 / Math.PI).toFixed(1)}°`} />
        )}
        {/* Moon dot — sized by illumination */}
        {moonY !== null && moonIllum > 0.05 && (
          <div style={{
            position: 'absolute',
            top: `${moonY}%`,
            left: '70%',
            transform: 'translate(-50%, -50%)',
            width: 10, height: 10, borderRadius: '50%',
            background: '#dde6f5',
            opacity: 0.4 + moonIllum * 0.6,
            boxShadow: `0 0 ${4 + moonIllum * 6}px 2px rgba(200,210,230,0.5)`,
            pointerEvents: 'none',
          }} title={`Moon · ${(moonAlt * 180 / Math.PI).toFixed(1)}° · ${(moonIllum * 100).toFixed(0)}%`} />
        )}
      </div>
    </div>
  )
}

// Day-long resolved preview. Each sample = one minute slice rendered
// as a vertical mini-gradient. Sun-glow row beneath. Hour ticks below.
function DayStrip({ sky, tick }) {
  const slotMinutes = useMemo(() => getTodSlotMinutes(new Date()), [sky])
  const columns = useMemo(() => {
    const out = []
    for (let i = 0; i < PREVIEW_SAMPLES; i++) {
      const minute = (i / PREVIEW_SAMPLES) * 1440
      out.push(resolveSkyAtMinute(sky, minute, slotMinutes))
    }
    return out
  }, [sky, slotMinutes])

  // Playhead horizontal position in % from left.
  const playheadPct = useMemo(() => {
    const tod = useTimeOfDay.getState()
    return (tod.getMinuteOfDay() / 1440) * 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  // Scrub: click anywhere on the strip → set minute. Drag → continuous.
  // Pointer-capture so the drag survives the cursor leaving the strip.
  const onPointerDown = (e) => {
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const setFromClient = (clientX) => {
      const rect = el.getBoundingClientRect()
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      useTimeOfDay.getState().setMinuteOfDay(t * 1440)
    }
    setFromClient(e.clientX)
    el._scrubMove = (ev) => setFromClient(ev.clientX)
    el.addEventListener('pointermove', el._scrubMove)
    const release = (ev) => {
      el.removeEventListener('pointermove', el._scrubMove)
      el.removeEventListener('pointerup', release)
      el.removeEventListener('pointercancel', release)
      try { el.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
  }

  return (
    <div
      style={{ marginTop: 6, position: 'relative', cursor: 'ew-resize' }}
      onPointerDown={onPointerDown}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${PREVIEW_SAMPLES}, 1fr)`,
        gap: 0, height: 48,
        border: '1px solid var(--outline-variant)',
      }}>
        {columns.map((c, i) => (
          <div key={i} style={{
            background: c
              ? `linear-gradient(to bottom, ${rgbCss(c.high)}, ${rgbCss(c.mid)} 33%, ${rgbCss(c.low)} 66%, ${rgbCss(c.horizon)})`
              : 'transparent',
          }} />
        ))}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${PREVIEW_SAMPLES}, 1fr)`,
        gap: 0, height: 6,
        marginTop: 1,
        border: '1px solid var(--outline-variant)',
      }}>
        {columns.map((c, i) => (
          <div key={i} style={{ background: c ? rgbCss(c.sunGlow) : 'transparent' }} />
        ))}
      </div>
      {/* Playhead — vertical line spanning both day strips */}
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0,
        left: `${playheadPct}%`,
        width: 1,
        background: 'var(--vic-gold, #ffd166)',
        pointerEvents: 'none',
        boxShadow: '0 0 3px rgba(255,209,102,0.8)',
      }} />
    </div>
  )
}

export default function SkyGradientGrid() {
  const sky = useCartographStore(s => s.sky)
  const setSwatch = useCartographStore(s => s.setSkySwatch)
  const revert = useCartographStore(s => s.revertSky)
  const [expanded, setExpanded] = useState(false)

  // Single ~5fps tick drives all live previews + playhead. Only runs
  // while the card is open.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!expanded) return
    const id = setInterval(() => setTick(n => (n + 1) % 1e6), 200)
    return () => clearInterval(id)
  }, [expanded])


  return (
    <div style={{ borderTop: '1px solid var(--outline-variant)' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center"
        style={{
          gap: 6, padding: '4px 0',
          background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block', width: 10,
          color: 'var(--on-surface-subtle)',
          fontSize: 'var(--type-caption)',
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 120ms',
        }}>▸</span>
        <span className="text-body-sm font-medium" style={{ color: 'var(--on-surface)' }}>
          Sky
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 px-2 py-2" style={{
          background: 'var(--surface-container-low, rgba(0,0,0,0.25))',
          borderRadius: 4,
          marginBottom: 4,
        }}>
          <div className="flex items-center justify-end" style={{ gap: 6 }}>
            <button
              onClick={revert}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                border: '1px solid var(--outline)',
                borderRadius: 3,
                background: 'transparent',
                color: 'var(--on-surface-subtle)',
                cursor: 'pointer',
              }}
              title="Reset all sky swatches to canonical defaults"
            >
              ↺ Revert
            </button>
          </div>
          <EditorGrid sky={sky} setSwatch={setSwatch} tick={tick} />
          <NowPreview sky={sky} tick={tick} />
          <DayStrip sky={sky} tick={tick} />
        </div>
      )}
    </div>
  )
}
