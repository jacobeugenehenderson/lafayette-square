// Each T-junction in a TJ dump (bake-ground's forensic: every triangle within 0.5 m of the finding): the welded edge
// use counts among the dumped triangles, every boundary edge within 10 mm of the vertex with its distance, and whether
// the vertex is the exact midpoint of a dumped edge (a refinement child) or a lattice point (a ring vertex). Read-only.
//   node scratch/huron-cost/tj-site.mjs scratch/ground-height/huron-blocker-tj.json
import { readFileSync } from 'node:fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const f32 = (v) => Math.fround(v)
const key = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`
const onLattice = (x, z) => Math.abs(x * 1000 - Math.round(x * 1000)) < 0.05 && Math.abs(z * 1000 - Math.round(z * 1000)) < 0.05
for (const f of d.found) {
  console.log(`\n■ ${f.vertexGroup} vertex (${f.x.toFixed(5)}, ${f.z.toFixed(5)}) on a ${f.edgeGroup} edge ${f.edgeLen.toFixed(3)} m · on the 1 mm lattice: ${onLattice(f.x, f.z)}`)
  const E = new Map()
  for (const t of f.tris) for (let k = 0; k < 3; k++) {
    const a = t.v[k], b = t.v[(k + 1) % 3], ka = key(...a), kb = key(...b); if (ka === kb) continue
    const ek = ka < kb ? ka + '|' + kb : kb + '|' + ka
    const e = E.get(ek) || { n: 0, a, b, groups: [] }; e.n++; e.groups.push(t.group); E.set(ek, e)
  }
  // is the vertex a midpoint of some dumped segment between two dumped vertices?
  const V = [...new Map(f.tris.flatMap(t => t.v).map(v => [key(...v), v])).values()]
  const mids = []
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    const mx = f32((V[i][0] + V[j][0]) / 2), mz = f32((V[i][1] + V[j][1]) / 2)
    if (Math.hypot(mx - f.x, mz - f.z) < 1e-4) mids.push(`(${V[i].map(c => c.toFixed(4))}) – (${V[j].map(c => c.toFixed(4))}) ${Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1]).toFixed(3)} m`)
  }
  console.log(`   midpoint of: ${mids.length ? mids.join(' · ') : 'none among the dumped vertices'}`)
  for (const e of E.values()) {
    const [ax, az] = e.a, [bx, bz] = e.b, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2)
    const t = ((f.x - ax) * dx + (f.z - az) * dz) / L2
    const dist = Math.abs((f.x - ax) * dz - (f.z - az) * dx) / L
    if (dist > 0.012 || t * L < -0.01 || (1 - t) * L < -0.01) continue
    console.log(`   ${e.n === 1 ? 'BOUNDARY' : 'shared  '} ${[...new Set(e.groups)].join('+').padEnd(32)} ${L.toFixed(3)} m · off ${(dist * 1000).toFixed(2)} mm · t ${t.toFixed(3)} · ends ${(t * L * 1000).toFixed(0)} / ${((1 - t) * L * 1000).toFixed(0)} mm · dir ${(Math.atan2(dz, dx) * 180 / Math.PI).toFixed(3)}°`)
  }
}
