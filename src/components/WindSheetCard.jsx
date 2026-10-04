/**
 * WindSheetCard — the wind sheet's readout and "show on map" toggle, as a card in an app's tools column (Jacob,
 * 2026-10-04: "it should go in the same tools column as everything else"; it had floated over Preview's Publish card).
 * The body is one component; each column wraps it in its own card shell — Stage's glass-panel Collapsible, Preview's
 * profiler-panel twirl — so it reads like its neighbours. ▶ the sheet: lib/windSheet.js · cartograph/ARCHITECTURE.md §8.
 */
import { useState, useSyncExternalStore } from 'react'
import { getWindSheetReadout, getWindSheetOverlay, setWindSheetOverlay, onWindSheetReadout } from '../lib/windSheet.js'

const fmtDeg = (dir) => Math.round(((Math.atan2(-dir[0], dir[1]) * 180) / Math.PI + 360) % 360)

/** The card's body: the sheet's state and the overlay toggle. */
export function WindSheetReadout() {
  const r = useSyncExternalStore(onWindSheetReadout, getWindSheetReadout)
  const overlay = useSyncExternalStore(onWindSheetReadout, getWindSheetOverlay)
  if (!r) return <div className="profiler-note">No wind sheet mounted.</div>
  const { status, air: a, layout: L, gust } = r
  const rows = [
    ['extent', `${status.extent}${L ? ` · ${L.size}² · ${L.mPerTexel.toFixed(2)} m/texel · ${Math.round(L.span)} m` : ' — unallocated'}`],
    ['weather', status.weather],
    ['wind', `${a.baseSpeedMps.toFixed(1)} m/s from ${fmtDeg(a.baseDirection)}°`],
    ['gusts', a.hasGusts ? `+${a.gustsScale.toFixed(1)} m/s above the mean` : 'no gust reading'],
    ['shape', `${a.gustShape.toFixed(2)} (0 patches · 1 squall lines) · storminess ${a.storminess.toFixed(2)}${gust ? ` · ${Math.round(gust.along)} × ${Math.round(gust.across)} m` : ''}`],
    ['memory', status.sim],
  ]
  return (
    <div style={{ fontSize: 11, lineHeight: 1.5 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 6px', cursor: 'pointer' }}>
        <input type="checkbox" checked={overlay} onChange={(e) => setWindSheetOverlay(e.target.checked)} />
        Show on map <span className="profiler-note">(colour = strength · streaks travel with it)</span>
      </label>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8 }}><span style={{ opacity: 0.6, width: 56, flex: 'none' }}>{k}</span><span>{v}</span></div>
      ))}
    </div>
  )
}

/** Preview's shell: the same twirl heading as Diagnosis, closed by default. */
export function WindSheetPreviewCard() {
  const [open, setOpen] = useState(false)
  return (
    <div className="profiler-panel">
      <button onClick={() => setOpen(!open)} className="section-heading" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        {open ? '▾' : '▸'} wind sheet
      </button>
      {open && <WindSheetReadout />}
    </div>
  )
}
