// gusset-side-diff.mjs — where the gusset's water side (the run's edge vs its tile's ① land) is undecided, and where it
// disagrees with the drawn water probed at half a terrain step (the retired test). READ-ONLY; locations, not causes.
// Usage: node scratch/coast/gusset-side-diff.mjs <scene> <slab dir> [out.json]
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { drawnWaterTest, drawnWaterItems } from '../../cartograph/shore-armour.mjs'
import { landOfTile } from '../../cartograph/shoreGusset.mjs'
const [scene, slab, out] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const wetAt = drawnWaterTest(drawnWaterItems(JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/map.json'))).layers?.water))
const disc = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'neighborhood_boundary.json')))
const inDisc = ([x, z]) => Math.hypot(x - disc.center[0], z - disc.center[1]) <= disc.radius
const probe = shape.gusset.stepM / 2, L = 0.001
const seen = new Set(), undecided = [], disagree = []
let n = 0
for (const t of shape.tiles) for (const r of t.runs || []) {
  if (r.skelId !== '__water__') continue
  const f = JSON.stringify(r.poly), b = JSON.stringify([...r.poly].reverse()), k = f < b ? f : b; if (seen.has(k)) continue; seen.add(k)
  const p = r.poly, land = landOfTile(t.iaFull)
  for (let i = 0; i < p.length; i++) { n++
    const a = i + 1 < p.length ? p[i] : p[i - 1], c = i + 1 < p.length ? p[i + 1] : p[i], tx = c[0] - a[0], tz = c[1] - a[1], m = Math.hypot(tx, tz)
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2
    const ll = m > 0 && land(mx - tz / m * L, mz + tx / m * L), lr = m > 0 && land(mx + tz / m * L, mz - tx / m * L)
    const where = { at: p[i].map(v => +v.toFixed(2)), inDisc: inDisc(p[i]) }
    if (ll === lr) { undecided.push({ ...where, why: m > 0 ? (ll ? 'land both sides' : 'land neither side') : 'zero-length edge' }); continue }
    const waterLeft = lr
    const wl = wetAt(mx - tz / m * probe, mz + tx / m * probe), wr = wetAt(mx + tz / m * probe, mz - tx / m * probe)
    if (wl !== wr && wl !== waterLeft) disagree.push(where)
  }
}
const tally = (a) => `${a.length} (${a.filter(w => w.inDisc).length} inside the disc)`
console.log(`${scene}: ${n} distinct stations · undecided ${tally(undecided)} · disagree with the drawn water at ${probe.toFixed(2)} m ${tally(disagree)}`)
const why = {}; for (const u of undecided) why[u.why] = (why[u.why] || 0) + 1; console.log(`  undecided: ${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`  undecided at: ${undecided.filter(w => w.inDisc).map(w => w.at.join(',')).join(' · ')}`)
const cells = {}; for (const d of disagree.filter(w => w.inDisc)) { const key = `${Math.round(d.at[0] / 250) * 250},${Math.round(d.at[1] / 250) * 250}`; cells[key] = (cells[key] || 0) + 1 }
console.log(`  disagreements inside the disc, by 250 m cell: ${Object.entries(cells).sort((a, b) => b[1] - a[1]).map(([k, v]) => `(${k}) ${v}`).join(' · ')}`)
if (out) writeFileSync(out, JSON.stringify({ undecided, disagree }))
