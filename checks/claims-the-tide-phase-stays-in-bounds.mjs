// claims-the-tide-phase-stays-in-bounds.mjs — the water never leaves the town's own low and high (BRIEF-tide).
//
// ⭐ THE CLAIM (Jacob: "we decide the 'high' and 'low' tides, and clamp them to the times"): over a whole year of
// NOAA-timed tide, the water's phase (cartograph/tide.mjs tidePhaseClock) stays inside [0, 1] — by construction,
// not by clipping — is exactly 1 at every predicted high and 0 at every predicted low, and the turning points
// alternate high/low. Every tidal town with a manifest tide; a year from the check's own run date.
//   node checks/claims-the-tide-phase-stays-in-bounds.mjs
import fs from 'fs'
import path from 'path'
import { tidePhaseClock, tideExtrema } from '../cartograph/tide.mjs'

const BAKED = 'public/baked'
const STEP_MIN = 10, EPS = 1e-9
let failures = 0, measured = 0

for (const t of fs.readdirSync(BAKED)) {
  const mp = path.join(BAKED, t, 'manifest.json')
  if (!fs.existsSync(mp)) continue
  const tide = JSON.parse(fs.readFileSync(mp, 'utf8')).tide
  if (!tide) continue
  measured++
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
  const phase = tidePhaseClock(tide)
  let lo = Infinity, hi = -Infinity, samples = 0
  for (let ms = start.getTime(); ms < start.getTime() + 365 * 86400000; ms += STEP_MIN * 60000) {
    const p = phase(new Date(ms)); samples++
    lo = Math.min(lo, p); hi = Math.max(hi, p)
  }
  const ext = tideExtrema(tide, start, 24 * 30)
  const offAt = ext.filter((e) => Math.abs(phase(e.at) - (e.kind === 'high' ? 1 : 0)) > 1e-6)
  const twice = ext.filter((e, i) => i && ext[i - 1].kind === e.kind)
  const bad = []
  if (lo < -EPS || hi > 1 + EPS) bad.push(`phase ran ${lo.toFixed(4)} … ${hi.toFixed(4)}`)
  if (offAt.length) bad.push(`${offAt.length} predicted extrema where the phase is not exactly 1 (high) / 0 (low)`)
  if (twice.length) bad.push(`${twice.length} repeated turning point(s) — highs and lows must alternate`)
  if (bad.length) { failures++; console.log(`  ✗ ${t}: ${bad.join('; ')}`) }
  else console.log(`  ✓ ${t}: ${samples} samples over a year in [${lo.toFixed(3)}, ${hi.toFixed(3)}] · ${ext.length} extrema in 30 days at exactly 1/0, alternating`)
}
if (!measured) { console.log('⛔ NOT MEASURED — no manifest carries a tide'); process.exit(2) }
console.log(`\n${failures ? `❌ ${failures} FAILURE(S)` : '✅ PASS'}`)
process.exit(failures ? 1 : 0)
