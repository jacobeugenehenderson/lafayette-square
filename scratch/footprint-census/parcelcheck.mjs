// READ-ONLY registration check for the parcel test: (a) share of footprint area inside an assessor parcel (Monte-Carlo,
// 20 pts/footprint), (b) area-weighted share of each painted street class inside a parcel (triangle centroids), within the
// footprint bbox. node --max-old-space-size=4000 scratch/footprint-census/parcelcheck.mjs <town>
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const town = process.argv[2], ROOT = new URL('../../', import.meta.url).pathname, dir = join(ROOT, 'public/baked', town)
const raw = join(ROOT, 'cartograph/data', town, 'raw')
const R = []; for (const f of readdirSync(raw).filter(f => /_parcels\.json$/.test(f))) for (const p of JSON.parse(readFileSync(join(raw, f))).parcels) for (const r of p.rings || []) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } R.push({ r, x0, z0, x1, z1 }) }
const C = 10, G = new Map(); R.forEach((q, k) => { for (let j = Math.floor(q.z0 / C); j <= Math.floor(q.z1 / C); j++) for (let i = Math.floor(q.x0 / C); i <= Math.floor(q.x1 / C); i++) { const key = j * 1e5 + i; let l = G.get(key); if (!l) G.set(key, l = []); l.push(k) } })
const pip = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const inP = (x, z) => (G.get(Math.floor(z / C) * 1e5 + Math.floor(x / C)) || []).some(k => { const q = R[k]; return x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && pip(q.r, x, z) })
const bj = JSON.parse(readFileSync(join(dir, 'buildings.json'))), bb = readFileSync(join(dir, 'buildings.bin'))
const fp = new Float32Array(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength), bj.footprintByteOffset, bj.footprintPointCount * 2)
let hit = 0, tot = 0, X0 = Infinity, Z0 = Infinity, X1 = -Infinity, Z1 = -Infinity
for (const b of bj.buildings) {
  const [s, n] = b.footprintRange, pts = []; for (let i = 0; i < n; i++) pts.push([fp[(s + i) * 2], fp[(s + i) * 2 + 1]])
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  X0 = Math.min(X0, x0); X1 = Math.max(X1, x1); Z0 = Math.min(Z0, z0); Z1 = Math.max(Z1, z1)
  let k = 0, seed = s + 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let t = 0; t < 400 && k < 20; t++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (!pip(pts, x, z)) continue; k++; tot++; if (inP(x, z)) hit++ }
}
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), gbuf = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const acc = {}
for (const g of gj.groups) {
  if (!g.partition) continue
  const c = g.kind !== 'mat' ? 'lot(face)' : g.id.startsWith('treelawn') ? 'treelawn' : ['asphalt', 'curb', 'sidewalk', 'highway', 'alley'].includes(g.id) ? g.id : null
  if (!c) continue
  const P = new Float32Array(gbuf, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(gbuf, g.indexByteOffset, g.indexCount)
  const a = acc[c] || (acc[c] = [0, 0])
  for (let t = 0; t < I.length; t += 3) {
    const xs = [P[I[t] * 3], P[I[t + 1] * 3], P[I[t + 2] * 3]], zs = [P[I[t] * 3 + 2], P[I[t + 1] * 3 + 2], P[I[t + 2] * 3 + 2]]
    const cx = (xs[0] + xs[1] + xs[2]) / 3, cz = (zs[0] + zs[1] + zs[2]) / 3
    if (cx < X0 || cx > X1 || cz < Z0 || cz > Z1) continue
    const ar = Math.abs((xs[1] - xs[0]) * (zs[2] - zs[0]) - (xs[2] - xs[0]) * (zs[1] - zs[0])) / 2
    a[1] += ar; if (inP(cx, cz)) a[0] += ar
  }
}
console.log(`${town}: footprint area inside a parcel ${(100 * hit / tot).toFixed(1)}% (${tot} samples) · painted class area (triangle centroid) inside a parcel: ` + Object.entries(acc).map(([k, [h, t]]) => `${k} ${(100 * h / t).toFixed(1)}% of ${(t / 1e3).toFixed(0)}k m²`).join(' · '))
