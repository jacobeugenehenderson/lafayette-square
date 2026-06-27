/**
 * probe-feature-elevation — targeted 3DEP micro-elevation for grade features.
 *
 * The baked terrain DEM is ~40 m-sampled (896 EPQS points, smoothly
 * interpolated) — it has NO micro-relief, so a grotto staircase or a bridge
 * bank reads flat. This probes USGS EPQS (the SAME 3DEP service the intake
 * elevation grid uses) at the ENDPOINTS of grade features only — a sparse,
 * cheap query that resolves the real local grade. The higher end is "up",
 * the lower is "down", and the delta is the real drop. This handles both
 * descend-to-water AND ascend-to-monument with no monument data.
 *
 * SIDECAR (Phase-5 prototype): writes `src/data/park-feature-elev.json`, read
 * at runtime by ParkStairs. The kit home is intake/skeleton (carry the
 * endpoint elevations as frame truth on the path records) — promoted later
 * (that's a ribbons.json regen + loop eye-check; LOOP-STREETS §5).
 *
 * Run:  node cartograph/probe-feature-elevation.js
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { localToWgs84 } from './config.js'
import { fracInRing } from '../src/lib/parkPathClassify.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EPQS = 'https://epqs.nationalmap.gov/v1/json'

async function elevAt(x, z) {
  const [lon, lat] = localToWgs84(x, z)
  const url = `${EPQS}?x=${lon}&y=${lat}&wkid=4326&units=Meters&includeDate=false`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`EPQS HTTP ${r.status}`)
  const d = await r.json()
  return d.value != null ? Math.round(parseFloat(d.value) * 100) / 100 : null
}

async function main() {
  const rb = JSON.parse(readFileSync(join(ROOT, 'src/data/ribbons.json'), 'utf-8'))
  const poly = JSON.parse(readFileSync(join(ROOT, 'cartograph/data/lafayette-square/clean/park-polygon.json'), 'utf-8'))
  const steps = (rb.paths || []).filter(p => p.kind === 'steps' && fracInRing(p.points, poly.corners) >= 0.5)
  console.log(`Probing 3DEP at ${steps.length} park-step endpoints…`)
  const out = []
  for (const s of steps) {
    const a = s.points[0], b = s.points[s.points.length - 1]
    const elevA = await elevAt(a[0], a[1])
    const elevB = await elevAt(b[0], b[1])
    out.push({ a: [Math.round(a[0] * 100) / 100, Math.round(a[1] * 100) / 100],
               b: [Math.round(b[0] * 100) / 100, Math.round(b[1] * 100) / 100], elevA, elevB })
    console.log(`  [${a.map(v => v.toFixed(0))}]→[${b.map(v => v.toFixed(0))}]  A=${elevA} B=${elevB}  drop=${(Math.abs(elevA - elevB)).toFixed(2)}m  up=${elevA > elevB ? 'A' : 'B'}`)
  }
  const payload = {
    meta: { source: 'USGS EPQS 3DEP', feature: 'park steps',
            note: 'Sidecar micro-elevation for grade features (Phase 5). Endpoint elevations in metres MSL; higher end = up.' },
    steps: out,
  }
  const dest = join(ROOT, 'src/data/park-feature-elev.json')
  writeFileSync(dest, JSON.stringify(payload, null, 2))
  console.log(`Wrote ${dest} (${out.length} features)`)
}

main().catch(e => { console.error(e); process.exit(1) })
