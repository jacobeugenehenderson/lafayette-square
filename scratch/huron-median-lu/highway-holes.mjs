// Forensic (Sward): for each ring in shape.json `highway`, sample its interior on a grid and
// report which tile (by RING containment) and which tile.lu owns each sample. A negative-area
// ring is a hole in the highway envelope (a median candidate). Usage: node scratch/huron-median-lu/highway-holes.mjs
import fs from 'fs'
const shape = JSON.parse(fs.readFileSync('public/baked/huron/shape.json'))
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
const bb = r => { let a = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) { a[0] = Math.min(a[0], x); a[1] = Math.max(a[1], x); a[2] = Math.min(a[2], z); a[3] = Math.max(a[3], z) } return a }
const tiles = shape.tiles.map((t, i) => ({ i, t, bb: bb(t.ring) }))
const H = Object.values(shape.highway)
const outer = H.filter(r => A(r) > 0), holes = H.filter(r => A(r) < 0)
const STEP = 4
for (const [hi, r] of H.entries()) {
  const b = bb(r), sign = A(r) > 0 ? 'outer' : 'hole', tally = {}; let n = 0
  for (let x = b[0]; x <= b[1]; x += STEP) for (let z = b[2]; z <= b[3]; z += STEP) {
    if (!pip(x, z, r)) continue
    if (sign === 'outer' && holes.some(h => pip(x, z, h))) continue
    n++
    const hit = tiles.filter(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && pip(x, z, o.t.ring))
    const k = hit.length ? hit.map(o => `${o.i}:${o.t.lu}`).join('+') : 'NO TILE'
    tally[k] = (tally[k] || 0) + 1
  }
  console.log(`highway[${hi}] ${sign} ${(Math.abs(A(r)) / 1e4).toFixed(2)} ha, ${n} samples @${STEP} m`)
  for (const [k, c] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${k.padEnd(30)} ${(c * STEP * STEP / 1e4).toFixed(2)} ha`)
}
