// Interior cracks near a point (Argon, read-only): ground edges used by ONE triangle (a boundary) that are not the outer
// rim, and any vertex of ANOTHER triangle lying on such an edge in plan (a T-junction: it lifts off the edge in 3D).
//   node scratch/shore-holes/tjunction.mjs <town> x,z r
import { readFileSync } from 'node:fs'
const [town, xz, rr] = process.argv.slice(2), [px, pz] = xz.split(',').map(Number), R = +rr
const g = JSON.parse(readFileSync(`public/baked/${town}/ground.json`, 'utf8')), bin = readFileSync(`public/baked/${town}/ground.bin`)
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const key = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`
const edges = new Map(), verts = new Map()
for (const grp of g.groups) {
  if (grp.kind === 'mat' && /^water/.test(grp.id)) continue
  const pos = new Float32Array(ab, grp.vertexByteOffset, grp.vertexCount * 3), idx = new Uint32Array(ab, grp.indexByteOffset, grp.indexCount)
  for (let t = 0; t < idx.length; t += 3) {
    const V = [idx[t], idx[t + 1], idx[t + 2]].map((k) => [pos[k * 3], pos[k * 3 + 2]])
    if (V.every(([x, z]) => Math.hypot(x - px, z - pz) > R)) continue
    for (const [x, z] of V) verts.set(key(x, z), [x, z, grp.id])
    for (let e = 0; e < 3; e++) { const a = V[e], b = V[(e + 1) % 3], k = [key(...a), key(...b)].sort().join('|')
      const r = edges.get(k) || { a, b, n: 0, ids: new Set() }; r.n++; r.ids.add(`${grp.kind}:${grp.id}`); edges.set(k, r) }
  }
}
const bnd = [...edges.values()].filter((e) => e.n === 1 && Math.hypot((e.a[0] + e.b[0]) / 2 - px, (e.a[1] + e.b[1]) / 2 - pz) < R * 0.8)
let tj = 0; const byPair = new Map()
for (const e of bnd) {
  const [ax, az] = e.a, [bx, bz] = e.b, L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) continue
  for (const [vx, vz, gid] of verts.values()) {
    const t = ((vx - ax) * (bx - ax) + (vz - az) * (bz - az)) / (L * L); if (t <= 1e-4 || t >= 1 - 1e-4) continue
    const off = Math.abs((bx - ax) * (az - vz) - (ax - vx) * (bz - az)) / L
    if (off < 1e-3) { tj++; const k = `${[...e.ids].join('+')} ← vertex of ${gid}`; byPair.set(k, (byPair.get(k) || 0) + 1) }
  }
}
console.log(`within ${R} m of (${px}, ${pz}): ${edges.size} edges · ${bnd.length} boundary edges (used once) · ${tj} T-junction vertices on them`)
for (const [k, n] of [...byPair].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${n} × ${k}`)
const byGroup = new Map(); for (const e of bnd) for (const id of e.ids) byGroup.set(id, (byGroup.get(id) || 0) + 1)
console.log('  boundary edges by group:', [...byGroup].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '))
