// tj-vs-topo.mjs — what findTJunctions (exact identity, groundConformity.js) finds that the EXACT used-once test
// (claims-the-ground-tiles-without-a-gap: an edge used once inside the disc, rim excluded the check's way) would not:
// a finding whose vertex has no incident used-once edge off the rim, and whose host edge is on the rim. Read-only.
//   node tj-vs-topo.mjs <slab dir> …   (an unstamped slab: every non-water group, said so)
import { readFileSync } from 'fs'
import { join } from 'path'
const { findTJunctions } = await import('/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/hpdm-gate/cartograph/groundConformity.js')
for (const dir of process.argv.slice(2)) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const stamped = gj.groups.some(g => g.partition != null)
  const gs = gj.groups.filter(g => stamped ? g.partition === true : !/^water/.test(g.id)).map(g => ({ id: g.id, positions: new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), indices: new Uint32Array(AB, g.indexByteOffset, g.indexCount) }))
  const tj = findTJunctions(gs)
  const st = gj.stencil, key = (x, z) => `${x},${z}`, edges = new Map()
  for (const g of gs) { const P = g.positions, I = g.indices
    for (let i = 0; i < I.length; i += 3) for (let e = 0; e < 3; e++) { const a = I[i + e], b = I[i + (e + 1) % 3], A = [P[a * 3], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 2]], ka = key(...A), kb = key(...B); if (ka === kb) continue
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka, r = edges.get(k); if (r) r.n++; else edges.set(k, { n: 1, a: A, b: B, ka, kb }) } }
  let rMax = 0; for (const r of edges.values()) if (r.n === 1) for (const p of [r.a, r.b]) rMax = Math.max(rMax, Math.hypot(p[0] - st.center[0], p[1] - st.center[1]))
  const interiorAt = new Set()
  for (const r of edges.values()) { if (r.n !== 1) continue
    const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), rim = Math.min(Math.hypot(r.a[0] - st.center[0], r.a[1] - st.center[1]), Math.hypot(r.b[0] - st.center[0], r.b[1] - st.center[1])) >= rMax - L * L / (8 * rMax) - 1e-3
    if (!rim) { interiorAt.add(r.ka); interiorAt.add(r.kb) } }
  const missed = tj.found.filter(f => !interiorAt.has(key(f.x, f.z)))
  console.log(`${dir.split('/').pop()}${stamped ? '' : ' (UNSTAMPED: every non-water group)'}: findTJunctions ${tj.total} · of them with no used-once edge off the rim at the vertex (the exact test would miss) ${missed.length}`)
  for (const f of missed.slice(0, 8)) console.log(`   (${f.x.toFixed(3)}, ${f.z.toFixed(3)}) ${f.vertexGroup} on ${f.edgeGroup}`)
}
