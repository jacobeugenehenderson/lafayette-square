// claims-the-ground-tiles-without-a-gap.mjs — DOES THE DRAWN GROUND TILE THE DISC, WITH NO SEAM LEFT OPEN?
//
// ⭐ THE INVARIANT: the groups the bake stamps `partition: true` tile the ground. So inside the disc, every edge of
// every partition triangle is shared by exactly two triangles; an edge used ONCE is a boundary, and the union's only
// boundary is its outer rim. An interior boundary edge is a seam the ground does not close: a sliver of nothing, or a
// T-junction, or two producers' lines a few millimetres apart. At render the two sides lift differently and the seam
// opens (Huron's shore, 2026-10-10: a beach edge chording 0.25–0.40 m over sand-median vertices 5.5 mm off it).
// ⭐ Why this and not a tolerance: `findTJunctions` asks "is a vertex within ON_EDGE_M of an edge", so anything a few
// mm past that tolerance is invisible to it. This check asks the topology instead, which has no distance to tune.
// Vertices are matched on the partition's own lattice (`WELD_QUANTUM_M`, groundConformity.js — read, not restated).
//
// ⭐ MUTATION TEST: `--selftest` drops one interior triangle from a town's partition in memory → must go RED.
//
//   node checks/claims-the-ground-tiles-without-a-gap.mjs [--town=a,b] [--dir=<slab dir>] [--selftest] [--show=n]
// Read-only. Exits 1 on any interior seam.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { WELD_QUANTUM_M } from '../cartograph/groundConformity.js'
const ROOT = new URL('../public/baked/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SHOW = +(arg('show') || 5)
const dirs = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'ground.json')))).map(t => arg('dir') ? t : join(ROOT, t))

function seams(dir, { dropOne = false } = {}) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
  const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const groups = gj.groups.filter(g => g.partition === true)
  if (!groups.length) return { unstamped: true }
  const st = gj.stencil
  if (!st?.center || !(st.radius > 0)) throw new Error(`${dir}: ground.json has no stencil — the disc whose rim is the only allowed boundary is unknown`)
  const Q = 1 / WELD_QUANTUM_M, key = (x, z) => `${Math.round(x * Q)},${Math.round(z * Q)}`
  const edges = new Map()
  let dropped = false
  for (const g of groups) {
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    for (let i = 0; i < I.length; i += 3) {
      const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])
      if (dropOne && !dropped) {   // the mutation: lose one triangle well inside the disc
        const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cz = (v[0][1] + v[1][1] + v[2][1]) / 3
        if (Math.hypot(cx - st.center[0], cz - st.center[1]) < 0.5 * st.radius) { dropped = true; continue }
      }
      for (let e = 0; e < 3; e++) {
        const a = v[e], b = v[(e + 1) % 3], ka = key(...a), kb = key(...b)
        if (ka === kb) continue
        const k = ka < kb ? ka + '|' + kb : kb + '|' + ka
        const r = edges.get(k); if (r) r.n++; else edges.set(k, { n: 1, a, b, g: g.id })
      }
    }
  }
  // the rim: a boundary edge whose both ends lie at the disc's radius (within the clip's own chord error, which is one
  // triangle-edge sagitta — measured as the farthest-out boundary vertex, so it is the slab's, not a number chosen here)
  let rMax = 0
  for (const r of edges.values()) if (r.n === 1) for (const p of [r.a, r.b]) rMax = Math.max(rMax, Math.hypot(p[0] - st.center[0], p[1] - st.center[1]))
  const out = []
  for (const r of edges.values()) {
    if (r.n !== 1) continue
    const ra = Math.hypot(r.a[0] - st.center[0], r.a[1] - st.center[1]), rb = Math.hypot(r.b[0] - st.center[0], r.b[1] - st.center[1])
    const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1])
    const sag = L * L / (8 * rMax)                                      // how far a rim chord of this length dips inward
    if (Math.min(ra, rb) >= rMax - sag - 1e-3) continue                 // on the rim
    out.push({ ...r, L })
  }
  return { out, groups: groups.length, dropped }
}

if (process.argv.includes('--selftest')) {
  const d = dirs[0], base = seams(d), mut = seams(d, { dropOne: true })
  const ok = mut.dropped && mut.out.length > base.out.length
  console.log(`selftest on ${d}: as drawn ${base.out.length} seam edge(s) · one triangle dropped → ${mut.out.length} ${ok ? '✅ the check sees it' : '⛔ the check is blind'}`)
  process.exit(ok ? 0 : 1)
}
let bad = 0
for (const d of dirs) {
  const r = seams(d)
  if (r.unstamped) { console.log(`  ?   ${d}: no partition stamp — not this check's question`); continue }
  const m = r.out.reduce((t, e) => t + e.L, 0)
  if (!r.out.length) { console.log(`  ok  ${d.split('/').pop()}: ${r.groups} partition groups tile the disc, no interior seam`); continue }
  bad++
  const by = {}; for (const e of r.out) by[e.g] = (by[e.g] || 0) + e.L
  console.error(`  ⛔  ${d.split('/').pop()}: ${r.out.length} interior seam edge(s), ${m.toFixed(0)} m · by group (m): ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')}`)
  for (const e of [...r.out].sort((a, b) => b.L - a.L).slice(0, SHOW)) console.error(`        ${e.g}: (${e.a.map(v => v.toFixed(3))}) → (${e.b.map(v => v.toFixed(3))}) ${e.L.toFixed(2)} m`)
}
if (bad) { console.error(`⛔ ${bad} slab(s) whose ground leaves a seam open`); process.exit(1) }
console.log('✅ every slab\'s ground tiles its disc')
