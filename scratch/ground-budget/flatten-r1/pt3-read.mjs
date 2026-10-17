// pt3-read.mjs — reads pt3.json (make-pt3.mjs): (a) the unowned count and how many sit within one lattice step of a stamp
// crossing the insert used; (b) at each PT3_AT place, every stack ring vertex within 0.5 m — group, and whether a stamp
// crossing or the stencil rim lies within a step of it (S1: the rim and a stamp crossing coincide there; S2: neither).
//   node pt3-read.mjs <pt3.json> <ground.json with the stencil>
import { readFileSync } from 'fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8')), st = JSON.parse(readFileSync(process.argv[3], 'utf8')).stencil
const S = 1000, V = d.V.map(([x, y]) => [x / S, y / S])
const grid = new Map(), key = (x, z) => `${Math.floor(x)},${Math.floor(z)}`
for (const v of V) { const k = key(v[0], v[1]); (grid.get(k) || grid.set(k, []).get(k)).push(v) }
const nearV = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const v of grid.get(key(x + i, z + j)) || []) if (Math.hypot(v[0] - x, v[1] - z) <= r) return true; return false }
const onV = d.unowned.filter(u => nearV(u.x, u.z, 0.001)).length, near1cm = d.unowned.filter(u => nearV(u.x, u.z, 0.01)).length
console.log(`stamp crossings ${V.length} · unowned ${d.unowned.length} (pre-cut 335 · cut 361 · cut+insert incl. block 432) · within one step of a crossing ${onV} · within 1 cm ${near1cm}`)
const rim = (x, z) => st.radius - Math.hypot(x - st.center[0], z - st.center[1])
for (const P of d.pts) {
  console.log(`\n== (${P.join(', ')}) · rim ${rim(P[0], P[1]).toFixed(3)} m inside`)
  for (const [g, rs] of Object.entries(d.near)) for (const { idx, ri, r } of rs) for (const v of r) {
    if (Math.hypot(v[0] - P[0], v[1] - P[1]) > 0.5) continue
    console.log(`   ${g}#${idx}.${ri} (${v[0].toFixed(3)}, ${v[1].toFixed(3)}) · stamp crossing within a step: ${nearV(v[0], v[1], 0.001)} · rim ${(rim(v[0], v[1]) * 1000).toFixed(2)} mm inside`) } }
