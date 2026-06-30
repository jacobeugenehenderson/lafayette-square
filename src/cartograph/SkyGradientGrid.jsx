/**
 * SkyGradientGrid — Sky Builder, post-2026-05-20 architecture pivot.
 *
 * 24 clock-hour columns × 5 vertical bands. Each cell renders the resolved
 * sky color at that (hour, band), composed from:
 *   - the procedural-canon anchor cards (ANCHOR_CARDS in skyGrid.js)
 *   - lerped between flanking seasonal anchors by useCalendar.dayOfYear()
 *   - with per-Look overrides applied via Chebyshev d≤1 spatial × 15-min
 *     temporal envelope (handled by skyGrid.buildMosaicForDate / resolver)
 *
 * Click a cell → author an override at that (hour, band).
 * Shift+click → remove the override at that (hour, band) (revert to canon).
 *
 * No anchor-name navigation — operator thinks "today's sky" not "spring's
 * matrix"; year-strip drag in DawnTimeline scrubs the date.
 */
import { useState, useMemo, useEffect, Fragment } from 'react'
import SunCalc from 'suncalc'
import useCartographStore, { activeChannel } from './stores/useCartographStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCalendar from '../hooks/useCalendar'
import {
  SKY_BANDS, SKY_HOURS,
  resolveSkyAtMinute, buildMosaicForDate,
} from './skyGrid.js'
import { INSTANCE } from '../instance.js'

const BAND_ORDER = ['high', 'mid', 'low', 'horizon', 'sunGlow']  // top-to-bottom
const LAT = INSTANCE.geography.lat
const LON = INSTANCE.geography.lon
const PREVIEW_SAMPLES = 96  // ~15 min per sample for the 24h strip

function rgbCss(rgb) {
  const r = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255)
  const g = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255)
  const b = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255)
  return `rgb(${r},${g},${b})`
}

// Look up the existing override at (hour, band) if any.
function findOverride(overrides, hour, band) {
  if (!Array.isArray(overrides)) return null
  return overrides.find(o => o.hour === hour && o.band === band) || null
}

function EditorGrid({ sky, currentDate, tick }) {
  const addSkyOverride = useCartographStore(s => s.addSkyOverride)
  const removeSkyOverride = useCartographStore(s => s.removeSkyOverride)
  const overrides = sky?.overrides || []

  // Base mosaic for hex sampling per cell. We rebuild it once per render
  // and sample the resolver at three points per hour to get the CSS
  // gradient stops. The mosaic itself is doy-dependent (currentDate)
  // and override-dependent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const _ = useMemo(() => null, [tick, currentDate, sky])

  // Sample a single (hour, band) at three minutes within the hour, return
  // [leftHex, midHex, rightHex]. Uses the same resolver path the shader
  // consumes, so what-you-see is what-renders.
  const sampleCell = (hour, band) => {
    const samples = []
    for (const min of [hour * 60, hour * 60 + 30, hour * 60 + 59]) {
      const r = resolveSkyAtMinute(sky, min, null)
      samples.push(rgbCss(r[band]))
    }
    return samples
  }

  // Solar-noon hour for the active date (for the sun-overhead marker).
  const solarNoonHour = useMemo(() => {
    const t = SunCalc.getTimes(currentDate, LAT, LON)
    return t.solarNoon.getHours() + t.solarNoon.getMinutes() / 60
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate])

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${SKY_HOURS}, minmax(0, 1fr))`,
    gap: 2,
    background: 'transparent',
  }

  const onCellClick = (e, hour, band) => {
    if (e.shiftKey) {
      removeSkyOverride(hour, band)
      e.preventDefault()
      return
    }
    // First click on a cell without an override: open the color picker on
    // the sampled current color. Override is added on the picker's onChange
    // via addSkyOverride. To trigger the native picker, we let the input
    // receive the click — see SwatchInput below.
  }

  return (
    <div>
      {/* Hour labels — bold at every 6 hours */}
      <div style={gridStyle}>
        {Array.from({ length: SKY_HOURS }, (_, h) => {
          const bold = h === 0 || h === 6 || h === 12 || h === 18
          return (
            <div key={`label-${h}`} style={{
              fontSize: 9, color: bold ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
              fontWeight: bold ? 600 : 400, textAlign: 'center',
              padding: '0 0 2px',
            }}>{h}</div>
          )
        })}
      </div>

      {/* Sky grid — 5 rows of band cells */}
      <div style={{ ...gridStyle, position: 'relative' }}>
        {BAND_ORDER.map((band) => (
          <Fragment key={`row-${band}`}>
            {Array.from({ length: SKY_HOURS }, (_, h) => {
              const stops = sampleCell(h, band)
              const bg = stops[0] === stops[2]
                ? stops[1]  // flat — no gradient
                : `linear-gradient(to right, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`
              const ov = findOverride(overrides, h, band)
              return (
                <div key={`cell-${band}-${h}`} style={{
                  position: 'relative', aspectRatio: '1 / 1',
                  borderRadius: 2, overflow: 'hidden',
                  background: bg,
                  outline: ov ? '1.5px solid var(--vic-gold, #ffd166)' : '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                }}>
                  <SwatchInput
                    hour={h} band={band}
                    initialHex={ov?.hex || rgbCss(resolveSkyAtMinute(sky, h * 60 + 30, null)[band])}
                    onAuthor={(hex) => addSkyOverride(h, band, hex)}
                    onShiftClick={(e) => onCellClick(e, h, band)}
                  />
                </div>
              )
            })}
          </Fragment>
        ))}

        {/* Solar-noon marker — a thin gold line at the column corresponding
            to solar noon on the active date. */}
        <div style={{
          position: 'absolute', top: -14, bottom: -2,
          left: `${(solarNoonHour / SKY_HOURS) * 100}%`,
          width: 1, background: 'var(--vic-gold, #ffd166)',
          opacity: 0.6, pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}

// Color input that takes a sampled hex as its initial value. On user-
// committed change, calls onAuthor(hex). Shift+click bypasses the picker
// and calls onShiftClick (used by the cell's onClick handler to remove the
// override). The transparent input overlay covers the cell so the gradient
// behind it is visible.
function SwatchInput({ hour, band, initialHex, onAuthor, onShiftClick }) {
  // Convert "rgb(r,g,b)" → "#rrggbb" for the color picker (which only
  // accepts hex). Pure hex strings pass through.
  const hex = useMemo(() => {
    if (typeof initialHex !== 'string') return '#000000'
    if (initialHex.startsWith('#')) return initialHex
    const m = initialHex.match(/^rgb\((\d+),(\d+),(\d+)\)$/)
    if (!m) return '#000000'
    const c = (n) => Number(n).toString(16).padStart(2, '0')
    return '#' + c(m[1]) + c(m[2]) + c(m[3])
  }, [initialHex])

  return (
    <input
      type="color"
      value={hex}
      onClick={(e) => {
        if (e.shiftKey) {
          e.preventDefault()
          onShiftClick?.(e)
        }
      }}
      onChange={(e) => onAuthor(e.target.value)}
      title={`${String(hour).padStart(2, '0')}:00 · ${band} — click to author override, shift+click to revert`}
      className="sky-swatch"
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        opacity: 0,
        cursor: 'pointer',
        border: 'none', padding: 0, margin: 0,
        background: 'transparent',
      }}
    />
  )
}

// "Now" preview — vertical sky slice at the current minute, sun and moon
// placed by altitude. Refreshes via useFrame tick + currentDate.
function NowPreview({ sky, tick }) {
  const currentDate = useCalendar(s => s.currentDate)
  const { resolved, sunAlt, moonAlt, moonIllum } = useMemo(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const r = resolveSkyAtMinute(sky, minute, null)
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
  }, [sky, tick, currentDate])

  if (!resolved) return null

  const bg = `linear-gradient(to bottom,
    ${rgbCss(resolved.high)} 0%,
    ${rgbCss(resolved.mid)} 33%,
    ${rgbCss(resolved.low)} 66%,
    ${rgbCss(resolved.horizon)} 100%)`

  function altToY(altRad) {
    if (altRad < -0.05) return null
    const t = Math.max(0, Math.min(1, altRad / (Math.PI / 2)))
    return (1 - t) * 100
  }
  const sunY = altToY(sunAlt)
  const moonY = altToY(moonAlt)

  const sunGlowAlpha = Math.max(0, Math.min(1,
    sunAlt < 0
      ? 1 - Math.abs(sunAlt) / 0.3
      : 1 - sunAlt / 0.3
  ))
  const sunGlowCss = sunGlowAlpha > 0.05
    ? `linear-gradient(to top, ${rgbCss(resolved.sunGlow)} 0%, rgba(0,0,0,0) 30%)`
    : null

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{
        position: 'relative', height: 100,
        border: '1px solid var(--outline-variant)',
        background: bg, overflow: 'hidden',
      }}>
        {sunGlowCss && (
          <div style={{
            position: 'absolute', inset: 0,
            background: sunGlowCss, opacity: sunGlowAlpha,
            mixBlendMode: 'screen', pointerEvents: 'none',
          }} />
        )}
        {sunY !== null && (
          <div style={{
            position: 'absolute', top: `${sunY}%`, left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff5d6',
            boxShadow: '0 0 12px 4px rgba(255,220,140,0.8)',
            pointerEvents: 'none',
          }} title={`Sun · ${(sunAlt * 180 / Math.PI).toFixed(1)}°`} />
        )}
        {moonY !== null && moonIllum > 0.05 && (
          <div style={{
            position: 'absolute', top: `${moonY}%`, left: '70%',
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

// Day-long resolved preview. Each sample = one minute slice rendered as a
// vertical mini-gradient. Sun-glow row beneath. Click/drag → scrub TOD.
function DayStrip({ sky, tick }) {
  const currentDate = useCalendar(s => s.currentDate)
  const columns = useMemo(() => {
    const out = []
    for (let i = 0; i < PREVIEW_SAMPLES; i++) {
      const minute = (i / PREVIEW_SAMPLES) * 1440
      out.push(resolveSkyAtMinute(sky, minute, null))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky, currentDate])

  const playheadPct = useMemo(() => {
    const tod = useTimeOfDay.getState()
    return (tod.getMinuteOfDay() / 1440) * 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

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
    <div style={{ marginTop: 6, position: 'relative', cursor: 'ew-resize' }}
         onPointerDown={onPointerDown}>
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
        gap: 0, height: 6, marginTop: 1,
        border: '1px solid var(--outline-variant)',
      }}>
        {columns.map((c, i) => (
          <div key={i} style={{ background: c ? rgbCss(c.sunGlow) : 'transparent' }} />
        ))}
      </div>
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${playheadPct}%`, width: 1,
        background: 'var(--vic-gold, #ffd166)',
        pointerEvents: 'none',
        boxShadow: '0 0 3px rgba(255,209,102,0.8)',
      }} />
    </div>
  )
}

export default function SkyGradientGrid() {
  const sky = useCartographStore(s => activeChannel(s, 'sky'))
  const revert = useCartographStore(s => s.revertSky)
  const [expanded, setExpanded] = useState(false)
  const currentDate = useCalendar(s => s.currentDate)
  const overrides = sky?.overrides || []

  // ~5fps tick drives the playhead position + sun/moon dots in NowPreview.
  // Only runs while the card is open.
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
          <div className="flex items-center justify-between" style={{ gap: 6 }}>
            <span className="text-caption" style={{ color: 'var(--on-surface-subtle)' }}>
              today's sky · {overrides.length} override{overrides.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={revert}
              style={{
                fontSize: 10, padding: '2px 8px',
                border: '1px solid var(--outline)',
                borderRadius: 3, background: 'transparent',
                color: 'var(--on-surface-subtle)',
                cursor: 'pointer',
              }}
              title="Clear all overrides — sky reverts to procedural canon"
            >
              ↺ Revert
            </button>
          </div>
          <EditorGrid sky={sky} currentDate={currentDate} tick={tick} />
          <NowPreview sky={sky} tick={tick} />
          <DayStrip sky={sky} tick={tick} />
        </div>
      )}
    </div>
  )
}
