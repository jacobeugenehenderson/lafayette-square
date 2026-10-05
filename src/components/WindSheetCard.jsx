/**
 * WindSheetCard — the wind the trees get, as PILLS (Jacob, 2026-10-05: "build the wind pills"; the typed fields
 * before them, 2026-10-04, asked for a bearing nobody had a reason to choose). Weather follows the town's weather;
 * Still · Breezy · Windy · Storm stand the trees in that wind for this session (lib/windSheet.js#WIND_PILLS): never
 * saved, never baked. Direction is always the weather's (a Stage preset's: the town's own tendency). One line says
 * what the trees are getting. The Tree Wind look is tuned against these (Stage › Surfaces › Trees).
 */
import { useState, useSyncExternalStore } from 'react'
import { getWindSheetReadout, onWindSheetReadout, getWindOverride, setWindPill, windPillOf, WIND_PILLS } from '../lib/windSheet.js'

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const fromDegOf = (dir) => ((Math.atan2(-dir[0], dir[1]) * 180) / Math.PI + 360) % 360
const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16]
const PILLS = ['weather', ...Object.keys(WIND_PILLS)]

/** The wind pills + what the trees are getting. Stage puts it under the Weather switch; Preview in its panel. */
export function WindSwitch() {
  const r = useSyncExternalStore(onWindSheetReadout, getWindSheetReadout)
  const o = useSyncExternalStore(onWindSheetReadout, getWindOverride)
  const on = windPillOf(o)
  const a = r?.air
  return (
    <div>
      <div className="mode-pill mt-3" role="group" aria-label="Wind">
        {PILLS.map((m) => (
          <button key={m} type="button" onClick={() => setWindPill(m)} aria-pressed={on === m}
            title={m === 'weather' ? 'The wind of the weather above (live, or a preset\'s still air)' : `Stand the trees in a ${m} wind (this session only, not saved)`}
          >{m}</button>
        ))}
      </div>
      <div className="profiler-note" style={{ marginTop: 4, fontSize: 11 }}>
        {!a ? 'No wind sheet mounted.'
          : `${on === 'weather' ? `from the weather (${(a.weather || a).status})` : `${on ?? 'custom'} wind`} · ${a.baseSpeedMps.toFixed(1)} m/s, gusts to ${(a.baseSpeedMps + a.gustsScale).toFixed(1)} · from ${compass(fromDegOf(a.baseDirection))}`}
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
      {open && <WindSwitch />}
    </div>
  )
}
