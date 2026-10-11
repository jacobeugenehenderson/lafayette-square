// trace-stretch.mjs — §4.3: along one arc (tile, skelId, side, segOrd), at stations every STEP m, walk inward along the
// ring normal and report the RENDERED height (mesh y + per-vertex terrain, barycentric in the drawn triangle, per group)
// against the terrain FIELD at the same point. Read-only.
// Usage: node scratch/ground-height/trace-stretch.mjs <scene> <tile> <skelId> <side> <segOrd> [step=20] [depth=8]
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
const [scene, tileS, skelId, side, segOrdS, stepS = '20', depthS = '8'] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const slab = join(root, 'public/baked', scene)
const gj = JSON.parse(readFileSync(join(slab, 'ground.json')))
const gb = readFileSync(join(slab, 'ground.bin')); const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const T = loadSceneTerrain(scene), raw = T.getElevationRaw
const tile = shape.tiles[+tileS]
const run = tile.runs.find(r => r.skelId === skelId && r.side === side && r.segOrd === +segOrdS)
console.log(`tile ${tileS} run ${skelId}·${side}·${segOrdS}: ${run.poly.length} pts; baseMeasure ${JSON.stringify(run.baseMeasure?.[side] ?? run.baseMeasure)}`)
// inward = the side of the ring the iA interior lies on
const ia = tile.iA[0]
function pip(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const groups = gj.groups.filter(g => /^(sidewalk|curb|treelawn|asphalt)/.test(g.id) || g.kind === 'face')
const tris = []
for (const g of groups) {
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) tris.push({ g: g.id, v: [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]) })
}
function drawnAt(x, z) {
  for (const t of tris) {
    const [a, b, c] = t.v
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d
    const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d
    const l3 = 1 - l1 - l2
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
    const h = l1 * (raw(a[0], a[2]) + a[1]) + l2 * (raw(b[0], b[2]) + b[1]) + l3 * (raw(c[0], c[2]) + c[1])
    const e = Math.max(Math.hypot(a[0] - b[0], a[2] - b[2]), Math.hypot(b[0] - c[0], b[2] - c[2]), Math.hypot(c[0] - a[0], c[2] - a[2]))
    return { g: t.g, h, e }
  }
  return null
}
const p = run.poly, step = +stepS, depth = +depthS
let acc = 0, next = 0
for (let i = 0; i + 1 < p.length; i++) {
  const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) continue
  const tx = (bx - ax) / L, tz = (bz - az) / L
  let nx = -tz, nz = tx
  const mx = (ax + bx) / 2, mz = (az + bz) / 2
  if (!pip(mx + nx * 0.5, mz + nz * 0.5, ia)) { nx = -nx; nz = -nz }
  while (next <= acc + L) {
    const u = next - acc, x = ax + tx * u, z = az + tz * u
    const row = []
    for (let d = 0.1; d <= depth; d += 0.5) {
      const q = drawnAt(x + nx * d, z + nz * d)
      row.push(q ? `${d.toFixed(1)}:${q.g.replace('treelawn:', 'tl:').slice(0, 8)} ${q.h.toFixed(2)}/${raw(x + nx * d, z + nz * d).toFixed(2)} e${q.e.toFixed(0)}` : `${d.toFixed(1)}:—`)
    }
    console.log(`s=${next.toFixed(0)}m (${x.toFixed(1)},${z.toFixed(1)})  drawn/field (m), e=longest tri edge\n   ` + row.join('  '))
    next += step
  }
  acc += L
}
