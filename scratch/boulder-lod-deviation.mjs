// boulder-lod-deviation.mjs — HOW FAR APART ARE THE NEAR AND FAR DRAPES?
//
// ⭐ The far layer (octaves 1, whole armoured shore) and the near layer (octaves 3,
// within the camera radius) are the SAME surface at different detail. The handoff is
// therefore a detail POP, not a seam. This measures how big that pop is, because that
// is what decides hide-and-swap vs crossfade — and nobody should choose from intuition.
//
// METHOD, and its own error bound stated rather than hidden: for every vertex of the
// COARSE mesh, find the nearest vertex of the FINE mesh and record the distance. The
// fine lattice is dense, so nearest-vertex distance over-reports true surface deviation
// by at most about half the fine spacing — which is printed alongside, so a reader can
// see the noise floor of the measurement itself.
// Read-only. ▶ node scratch/boulder-lod-deviation.mjs
import { readFileSync } from 'node:fs'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'
import { drapeGlobals, revetmentDrape } from '../src/lib/revetmentDrape.js'

const NEAR_OCT = 3, FAR_OCT = Number(process.argv[2] ?? 1)
const doc = JSON.parse(readFileSync('public/baked/huron/revetment.json', 'utf8'))
const faces = revetmentFaces(doc).filter(f => f.anyArmour)

const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN

console.log(`near = octaves ${NEAR_OCT} · far = octaves ${FAR_OCT} · ${faces.length} armoured faces\n`)
console.log('face        coarseV   fineV   fineStep   median    p95      max     crest')
const all = []
for (const f of faces) {
  const Gf = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: NEAR_OCT })
  const Gc = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: FAR_OCT })
  const fine = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, octaves: NEAR_OCT, globals: Gf })
  const coarse = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, octaves: FAR_OCT, globals: Gc })
  const FP = fine.geometry.getAttribute('position').array
  const CP = coarse.geometry.getAttribute('position').array
  // Spatial hash over the fine vertices — a linear scan is O(n·m) and n·m is ~10^11 here.
  const CELL = Math.max(1, Gf.step * 4)
  const grid = new Map()
  const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`
  for (let i = 0; i < FP.length; i += 3) {
    const k = key(FP[i], FP[i + 1], FP[i + 2])
    let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(i)
  }
  const d = []
  for (let j = 0; j < CP.length; j += 3) {
    const x = CP[j], y = CP[j + 1], z = CP[j + 2]
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL), gz = Math.floor(z / CELL)
    let best = Infinity
    for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c = -1; c <= 1; c++) {
      const bucket = grid.get(`${gx + a},${gy + b2},${gz + c}`)
      if (!bucket) continue
      for (const i of bucket) {
        const dx = FP[i] - x, dy = FP[i + 1] - y, dz = FP[i + 2] - z
        const dd = dx * dx + dy * dy + dz * dz
        if (dd < best) best = dd
      }
    }
    if (best < Infinity) d.push(Math.sqrt(best))
  }
  d.sort((a, b) => a - b)
  all.push(...d)
  console.log(`${f.key.padEnd(10)} ${String(CP.length / 3).padStart(8)} ${String(FP.length / 3).padStart(7)} ` +
    `${Gf.step.toFixed(2).padStart(9)} ${pct(d, 0.5).toFixed(3).padStart(8)} ${pct(d, 0.95).toFixed(3).padStart(7)} ` +
    `${(d[d.length - 1] ?? NaN).toFixed(3).padStart(8)} ${f.crestAt(0.5).toFixed(2).padStart(6)}`)
}
all.sort((a, b) => a - b)
console.log(`\nALL FACES  median ${pct(all, 0.5).toFixed(3)} m · p95 ${pct(all, 0.95).toFixed(3)} m · max ${all[all.length - 1].toFixed(3)} m  (${all.length} coarse vertices)`)
console.log('⚠️ distances are nearest-VERTEX, so they over-report true surface deviation by up to ~half the fine step printed above.')
