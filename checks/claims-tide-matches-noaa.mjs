// claims-tide-matches-noaa.mjs — the tide's CLOCK is NOAA's, not ours (BRIEF-tide).
//
// ⭐ THE CLAIM: cartograph/tide.mjs, fed a station's harmonic constituents, predicts the same highs and lows NOAA
// publishes for that station. Two gates, both reading their truth from NOAA's own numbers, never restated here:
//   (1) every constituent the station publishes is DEFINED, and the speed that definition implies equals NOAA's
//       published speed — a wrong Doodson multiple fails here before a single height is compared;
//   (2) over NOAA's own week of predicted highs and lows (the fixture fetch-water-datums --tide-only keeps beside
//       the constituents), every turning point is matched: time within TIME_MIN, height within HEIGHT_M.
// The tolerances are measured, not wished: at writing, Provincetown (8446121) matched 31/31 with worst time 2 min
// (NOAA prints to the minute) and worst height 0.020 m (RMS 0.010 m). ▶ re-run to re-measure.
//
// Reads every tidal town's raw/tide.json (tidal per raw/water-datums.json). A tidal town without one is NOT MEASURED, loudly (exit 2) —
// ▶ node cartograph/fetch-water-datums.mjs --scene=<town> --tide-only
//   node checks/claims-tide-matches-noaa.mjs
import fs from 'fs'
import path from 'path'
import { speedOf, tideExtrema } from '../cartograph/tide.mjs'

const TIME_MIN = 3, HEIGHT_M = 0.03, SPEED_TOL = 1e-5
const DATA = 'cartograph/data'
let failures = 0, measured = 0, unmeasured = 0
const fail = (m) => { failures++; console.log(`  ✗ ${m}`) }
const pass = (m) => console.log(`  ✓ ${m}`)

for (const town of fs.readdirSync(DATA).filter((t) => !t.startsWith('_') && !t.startsWith('.'))) {
  const p = path.join(DATA, town, 'raw/water-datums.json')
  if (!fs.existsSync(p)) continue
  const w = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (w.kind !== 'tidal') continue
  console.log(`\n${town}`)
  const tp = path.join(DATA, town, 'raw/tide.json')
  const t = fs.existsSync(tp) ? JSON.parse(fs.readFileSync(tp, 'utf8')) : null
  if (!t?.constituents?.length || !t.noaaHilo?.extrema?.length) {
    unmeasured++; console.log(`  ⛔ NOT MEASURED — tidal, but no tide clock or NOAA fixture in ${tp}`); continue
  }
  measured++

  // (1) definitions and speeds
  const bad = []
  for (const c of t.constituents) {
    let s
    try { s = speedOf(c.name) } catch (e) { bad.push(`${c.name}: ${e.message}`); continue }
    if (Math.abs(s - c.speed) > SPEED_TOL) bad.push(`${c.name}: defined ${s.toFixed(7)}°/h vs NOAA ${c.speed}°/h`)
  }
  if (bad.length) fail(`${bad.length} constituent(s) wrong:\n      ${bad.join('\n      ')}`)
  else pass(`${t.constituents.length} constituents defined; every speed = NOAA's within ${SPEED_TOL}°/h`)

  // (2) the turning points against NOAA's own predictions
  const noaa = t.noaaHilo.extrema.map((e) => ({ ...e, ms: Date.parse(e.at) }))
  const from = new Date(Math.min(...noaa.map((e) => e.ms)) - 3600000)
  const hours = (Math.max(...noaa.map((e) => e.ms)) - from.getTime()) / 3600000 + 2
  const mine = tideExtrema(t, from, hours)
  let worstT = 0, worstH = 0
  const misses = []
  for (const n of noaa) {
    const c = mine.filter((m) => m.kind === n.kind).sort((a, b) => Math.abs(a.at - n.ms) - Math.abs(b.at - n.ms))[0]
    const dt = c ? Math.abs(c.at - n.ms) / 60000 : Infinity, dh = c ? Math.abs(c.heightM - n.heightM) : Infinity
    worstT = Math.max(worstT, dt); worstH = Math.max(worstH, dh)
    if (!(dt <= TIME_MIN) || !(dh <= HEIGHT_M)) misses.push(`${n.kind} ${n.at}: ${c ? `${dt.toFixed(1)} min, ${dh.toFixed(3)} m off` : 'no match'}`)
  }
  if (mine.length !== noaa.length) misses.push(`NOAA has ${noaa.length} turning points in the window, tide.mjs ${mine.length}`)
  if (misses.length) fail(`${misses.length} of ${noaa.length} NOAA turning points missed (limit ${TIME_MIN} min, ${HEIGHT_M} m):\n      ${misses.slice(0, 6).join('\n      ')}`)
  else pass(`station ${t.station}: ${noaa.length}/${noaa.length} NOAA highs/lows · worst ${worstT.toFixed(1)} min, ${worstH.toFixed(3)} m`)
}

if (!measured && !unmeasured) { console.log('\n⛔ NOT MEASURED — no tidal town on disk'); process.exit(2) }
console.log(`\n${failures ? `❌ ${failures} FAILURE(S)` : unmeasured ? `⛔ ${unmeasured} tidal town(s) NOT MEASURED` : '✅ PASS'}`)
process.exit(failures ? 1 : unmeasured ? 2 : 0)
