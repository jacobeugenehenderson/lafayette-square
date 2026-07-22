// cap-width-probe2.mjs — drawn asphalt reach per side, sampled along the chain.
// Per-ring point-in-polygon OR'd (not even-odd across rings), so overlapping
// unioned rings can't cancel each other out.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const skelId = process.argv[2] || 'nicholson-place'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const s = ribbons.streets.find(x => (x.skelId || x.name) === skelId)
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0 })
console.log = o
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c } return c }
const hit = (rings, x, z) => rings.some(r => inRing(r, x, z))
console.log(`${skelId}: authored L=${s.measure?.left?.pavementHW} R=${s.measure?.right?.pavementHW}`)
const A = s.points[0], B = s.points[s.points.length - 1]
const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz)
const nx = -dz / L, nz = dx / L
for (const t of [0.15, 0.35, 0.55, 0.75, 0.9]) {
  const cx = A[0] + dx * t, cz = A[1] + dz * t
  const reach = (sgn) => { let last = 0; for (let d = 0.05; d <= 14; d += 0.05) if (hit(g.asphalt, cx + nx * sgn * d, cz + nz * sgn * d)) last = d; return last }
  console.log(`  t=${t.toFixed(2)}  -normal=${reach(-1).toFixed(2)}  +normal=${reach(1).toFixed(2)}`)
}
