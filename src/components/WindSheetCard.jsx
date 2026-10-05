/**
 * WindSheetCard — the wind the trees get, EDITABLE, in an app's tools column (Jacob, 2026-10-04: "it should go in the
 * same tools column as everything else"; "I wouldn't even mind the wind card if the text entry fields were editable";
 * the map colours and the developer readout were "rather irrelevant", so they live on window.__windSheet now).
 * Each field shows the weather's value as its placeholder and, typed into, overrides it for this session through the
 * one cable (lib/windSheet.js#applyWindOverride): never saved, never baked. Blank = follow the weather.
 * Each column wraps the body in its own card shell: Stage's glass-panel Collapsible, Preview's profiler-panel twirl.
 */
import { useState, useSyncExternalStore } from 'react'
import { getWindSheetReadout, onWindSheetReadout, getWindOverride, setWindOverride, clearWindOverride } from '../lib/windSheet.js'

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const fromDegOf = (dir) => ((Math.atan2(-dir[0], dir[1]) * 180) / Math.PI + 360) % 360
const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16]

function Field({ label, unit, value, placeholder, onChange, step = 0.5, min = 0, max }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0' }}>
      <span style={{ width: 52, opacity: 0.7 }}>{label}</span>
      <input type="number" step={step} min={min} max={max} value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={{ width: 72, background: 'rgba(0,0,0,.25)', color: 'inherit', border: '1px solid rgba(255,255,255,.15)', borderRadius: 4, padding: '2px 4px' }} />
      <span style={{ opacity: 0.6 }}>{unit}</span>
    </label>
  )
}

/** The card's body: the wind as the trees get it, each value editable for this session. */
export function WindSheetReadout() {
  const r = useSyncExternalStore(onWindSheetReadout, getWindSheetReadout)
  const o = useSyncExternalStore(onWindSheetReadout, getWindOverride)
  if (!r) return <div className="profiler-note">No wind sheet mounted.</div>
  const w = r.air.weather || r.air   // the weather's own values (under any override)
  const wFrom = fromDegOf(w.baseDirection)
  const overridden = [o.speedMps, o.fromDeg, o.gustsMps, o.gustShape].some((v) => v != null)
  return (
    <div style={{ fontSize: 11, lineHeight: 1.5 }}>
      <Field label="wind" unit="m/s" value={o.speedMps} placeholder={w.baseSpeedMps.toFixed(1)} onChange={(v) => setWindOverride({ speedMps: v })} />
      <Field label="from" unit={`° ${compass(o.fromDeg ?? wFrom)}`} step={5} max={360} value={o.fromDeg} placeholder={Math.round(wFrom)} onChange={(v) => setWindOverride({ fromDeg: v })} />
      <Field label="gusts" unit="m/s peak" value={o.gustsMps} placeholder={(w.baseSpeedMps + w.gustsScale).toFixed(1)} onChange={(v) => setWindOverride({ gustsMps: v })} />
      <Field label="shape" unit="0 patches · 1 squall lines" step={0.1} max={1} value={o.gustShape} placeholder={w.gustShape.toFixed(1)} onChange={(v) => setWindOverride({ gustShape: v })} />
      <div className="profiler-note" style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>{overridden ? `overriding the ${w.status} weather for this session` : `from the weather (${w.status}) · type to override`}</span>
        {overridden && <button onClick={clearWindOverride} style={{ background: 'none', border: '1px solid rgba(255,255,255,.25)', borderRadius: 4, color: 'inherit', padding: '0 6px', cursor: 'pointer' }}>reset</button>}
      </div>
    </div>
  )
}

/** Preview's shell: the same twirl heading as Diagnosis, closed by default. */
export function WindSheetPreviewCard() {
  const [open, setOpen] = useState(false)
  return (
    <div className="profiler-panel">
      <button onClick={() => setOpen(!open)} className="section-heading" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        {open ? '▾' : '▸'} wind
      </button>
      {open && <WindSheetReadout />}
    </div>
  )
}
