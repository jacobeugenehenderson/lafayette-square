// Where does each hole ray pass BELOW the drawn ground? (Argon, read-only.) Drawn height = the slab vertex's own y + the
// terrain under it × exag (exag 1 in the gap walk), barycentric within each ground triangle. March each ray in 0.1 m steps;
// at the first step whose y is below the surface covering its XZ, report the group there and the surface height.
//   node scratch/shore-holes/march.mjs <town> <points.json> [view]
import { readFileSync } from 'node:fs'
const [town, ptsFile, view = 'near-from-water'] = process.argv.slice(2)
const g = JSON.parse(readFileSync(`public/baked/${town}/ground.json`, 'utf8')), bin = readFileSync(`public/baked/${town}/ground.bin`)
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const T = JSON.parse(readFileSync(`public/baked/${town}/terrain.json`, 'utf8')), TD = new Float32Array(readFileSync(`public/baked/${town}/terrain.bin`).buffer.slice(0))
const { minX, maxX, minZ, maxZ } = T.bounds, sx = (maxX - minX) / (T.width - 1), sz = (maxZ - minZ) / (T.height - 1)
const terr = (x, z) => { const fx = (x - minX) / sx, fz = (z - minZ) / sz, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, v = (a, b) => TD[b * T.width + a]
  return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - tz) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * tz }
const rays = JSON.parse(readFileSync(ptsFile, 'utf8')).filter((r) => r[0] === view && r.length >= 9)
// the triangles near the rays only
const [cx, cz] = [rays[0][3], rays[0][5]], R = 120
const tris = []
for (const grp of g.groups) {
  if (grp.kind === 'mat' && /^water/.test(grp.id)) continue
  const pos = new Float32Array(ab, grp.vertexByteOffset, grp.vertexCount * 3), idx = new Uint32Array(ab, grp.indexByteOffset, grp.indexCount)
  for (let t = 0; t < idx.length; t += 3) {
    const V = [idx[t], idx[t + 1], idx[t + 2]].map((k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]])
    if (V.every(([x, , z]) => Math.hypot(x - cx, z - cz) > R)) continue
    tris.push({ id: `${grp.kind}:${grp.id}`, V: V.map(([x, y, z]) => [x, y + terr(x, z), z]) })
  }
}
const under = (x, z) => { const out = []; for (const t of tris) { const [[ax, ay, az], [bx, by, bz], [qx, qy, qz]] = t.V
  const d = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz); if (!d) continue
  const l1 = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / d, l2 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / d, l3 = 1 - l1 - l2
  if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue; out.push({ id: t.id, y: l1 * ay + l2 * by + l3 * qy }) } return out }
const tally = new Map()
for (const r of rays.slice(0, 60)) {
  const [, , , ox, oy, oz, dx, dy, dz] = r
  let found = null
  for (let s = 0.5; s < 200 && !found; s += 0.1) {
    const x = ox + dx * s, y = oy + dy * s, z = oz + dz * s, u = under(x, z)
    if (!u.length) { if (y < -3) { found = `no surface under (${x.toFixed(1)}, ${z.toFixed(1)}) at y ${y.toFixed(2)} — a gap in plan`; } continue }
    const top = Math.max(...u.map((q) => q.y))
    if (y <= top) found = `passes below ${u.map((q) => `${q.id}@${q.y.toFixed(2)}`).join(' / ')} at (${x.toFixed(1)}, ${z.toFixed(1)}), ray y ${y.toFixed(2)}`
  }
  const key = (found || 'never meets the ground in 200 m').replace(/\(-?[\d.]+, -?[\d.]+\)/, '(…)').replace(/-?\d+\.\d+/g, '#')
  tally.set(key, (tally.get(key) || 0) + 1)
  if (tally.get(key) === 1) console.log(' e.g.', found || 'never meets the ground in 200 m')
}
console.log(`\n${rays.length} hole rays (${view}); by what they pass:`); for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${k}`)
