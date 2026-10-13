// gusset-noside.mjs — WHERE ARE THE COAST STATIONS WHOSE WATER SIDE CANNOT BE TOLD? READ-ONLY.
// Reads a slab's shape.json#gusset (shoreGusset.mjs) and, for every station recorded with no side (ground null), asks
// the drawn water again at the record's probe (half the terrain step) and at finer probes, and says which: water on
// BOTH sides, or NEITHER. Groups them by run (deduped by the whole polyline) with each run's length, and prints where.
// Usage: node scratch/coast/gusset-noside.mjs <scene> <slab dir> [out.json]
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { drawnWaterTest, drawnWaterItems } from '../../cartograph/shore-armour.mjs'

const [scene, slab, outPath] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const G = shape.gusset
const wetAt = drawnWaterTest(drawnWaterItems(JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/map.json'))).layers?.water))
const PROBES = process.env.PROBES ? [G.stepM / 2, ...process.env.PROBES.split(",").map(Number)] : [G.stepM / 2, 1, 0.25, 0.05]   // PROBES=a,b,…: the finer probes to try, in order
const seen = new Set(), runs = []
for (const t of shape.tiles) for (const r of t.runs || []) {
  if (r.skelId !== '__water__' || !r.gusset) continue
  const f = JSON.stringify(r.poly), b = JSON.stringify([...r.poly].reverse()), k = f < b ? f : b
  if (seen.has(k)) continue; seen.add(k); runs.push(r)
}
const tally = { runs: runs.length, stations: 0, noSide: 0, both: 0, neither: 0, degenerate: 0, decidedAt: {} }
const rows = []
for (const r of runs) {
  const p = r.poly
  let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  let n = 0
  for (let i = 0; i < p.length; i++) {
    tally.stations++
    if (r.gusset.ground[i] != null) continue
    n++; tally.noSide++
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], m = Math.hypot(tx, tz)
    if (!(m > 0)) { tally.degenerate++; continue }
    const side = (d) => [wetAt(p[i][0] - tz / m * d, p[i][1] + tx / m * d), wetAt(p[i][0] + tz / m * d, p[i][1] - tx / m * d)]
    const [l, rr] = side(PROBES[0]); tally[l ? 'both' : 'neither']++
    const at = PROBES.slice(1).find(d => { const [x, y] = side(d); return x !== y })
    tally.decidedAt[at ?? 'never'] = (tally.decidedAt[at ?? 'never'] || 0) + 1
  }
  if (n) rows.push({ n, of: p.length, lenM: +len.toFixed(1), at: p[0].map(v => +v.toFixed(1)), tile: null })
}
rows.sort((a, b) => b.n - a.n)
console.log(`${scene}: ${tally.stations} stations on ${tally.runs} distinct coast runs · ${tally.noSide} with no side (probe ${PROBES[0].toFixed(2)} m)`)
console.log(`  water on BOTH sides ${tally.both} · NEITHER ${tally.neither} · degenerate (zero tangent) ${tally.degenerate}`)
console.log(`  decided at a finer probe: ${Object.entries(tally.decidedAt).map(([k, v]) => `${k === 'never' ? 'never' : k + ' m'} ${v}`).join(' · ')}`)
console.log(`  runs carrying them: ${rows.length}; all-no-side runs ${rows.filter(r => r.n === r.of).length}`)
for (const r of rows.slice(0, 12)) console.log(`    ${r.n}/${r.of} stations · run ${r.lenM} m · starts at ${r.at.join(',')}`)
if (outPath) writeFileSync(outPath, JSON.stringify({ tally, rows }, null, 1))
