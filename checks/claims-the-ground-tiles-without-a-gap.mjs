// claims-the-ground-tiles-without-a-gap.mjs — DOES THE DRAWN GROUND TILE THE DISC, WITH NO SEAM LEFT OPEN?
//
// ⭐ THE INVARIANT: the groups the bake stamps `partition: true` tile the ground. So inside the disc, every edge of
// every partition triangle is shared by exactly two triangles; an edge used ONCE is a boundary, and the union's only
// boundary is its outer rim. An interior boundary edge is a seam the ground does not close: a sliver of nothing, or a
// T-junction, or two producers' lines a few millimetres apart. At render the two sides lift differently and the seam
// opens (Huron's shore, 2026-10-10: a beach edge chording 0.25–0.40 m over sand-median vertices 5.5 mm off it).
// ⭐ Why this and not a tolerance: `findTJunctions` asks "is a vertex within ON_EDGE_M of an edge", so anything a few
// mm past that tolerance is invisible to it. This check asks the topology instead, which has no distance to tune.
// ⭐ A VERTEX IS ITS EXACT float32 POSITION, as the slab draws it — one identity with `findTJunctions` (groundConformity.js).
// Matched on the 1 mm lattice, two vertices 0.7 mm apart read as one and the sub-mm hole between them closed (removed
// 2026-10-18, Boz). ⭐ This check owns GAPS: `findTJunctions` never judges a vertex within ON_EDGE_M of an edge's end.
//
// ⭐ MUTATION TEST: `--selftest` (1) drops one interior triangle from a town's partition in memory → must go RED; (2) a chain
// whose two sides end on twins 0.7 mm apart in one 1 mm cell, not shared — a real hole — must count more seams than the same
// chain closed on one vertex, under this check's identity (and, shown beside it, not under the 1 mm one).
//
//   node checks/claims-the-ground-tiles-without-a-gap.mjs [--town=a,b] [--dir=<slab dir>] [--selftest] [--show=n]
// Read-only. Exits 1 on any interior seam.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { CLIP_SCALE } from '../src/lib/lattice.js'   // only for the selftest's 1 mm comparison
const ROOT = new URL('../public/baked/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SHOW = +(arg('show') || 5)
const dirs = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'ground.json')))).map(t => arg('dir') ? t : join(ROOT, t))

const EXACT = (x, z) => `${x},${z}`, LATTICE = (x, z) => `${Math.round(x * CLIP_SCALE)},${Math.round(z * CLIP_SCALE)}`
// edges used once, keyed by `key`: groups [{ id, P: Float32Array xyz, I: Uint32Array }]
function usedOnce(groups, key, drop = () => false) {
  const edges = new Map()
  for (const g of groups) { const { P, I } = g
    for (let i = 0; i < I.length; i += 3) {
      const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])
      if (drop(v)) continue
      for (let e = 0; e < 3; e++) {
        const a = v[e], b = v[(e + 1) % 3], ka = key(...a), kb = key(...b)
        if (ka === kb) continue
        const k = ka < kb ? ka + '|' + kb : kb + '|' + ka
        const r = edges.get(k); if (r) r.n++; else edges.set(k, { n: 1, a, b, g: g.id })
      }
    }
  }
  return edges
}
function seams(dir, { dropOne = false } = {}) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
  const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const groups = gj.groups.filter(g => g.partition === true)
  if (!groups.length) return { unstamped: true }
  const st = gj.stencil
  if (!st?.center || !(st.radius > 0)) throw new Error(`${dir}: ground.json has no stencil — the disc whose rim is the only allowed boundary is unknown`)
  let dropped = false
  const edges = usedOnce(groups.map(g => ({ id: g.id, P: new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I: new Uint32Array(AB, g.indexByteOffset, g.indexCount) })), EXACT,
    (v) => { if (!dropOne || dropped) return false   // the mutation: lose one triangle well inside the disc
      const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cz = (v[0][1] + v[1][1] + v[2][1]) / 3
      return Math.hypot(cx - st.center[0], cz - st.center[1]) < 0.5 * st.radius ? (dropped = true) : false })
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
  // twins: above's chain (0,0) → M → (2,0) over an apex, below's under one; closed = both on M = (1, +0.3 mm), hole = below on
  // (1, −0.4 mm) — 0.7 mm apart, one 1 mm cell
  const tri = (pts, idx) => ({ P: new Float32Array(pts.flatMap(([x, z]) => [x, 0, z])), I: new Uint32Array(idx) })
  const mk = (mz) => [{ id: 'above', ...tri([[0, 0], [1, 0.0003], [2, 0], [1, 1]], [0, 1, 3, 1, 2, 3]) }, { id: 'below', ...tri([[0, 0], [1, mz], [2, 0], [1, -1]], [0, 3, 1, 1, 3, 2]) }]
  const once = (gs, key) => [...usedOnce(gs, key).values()].filter(r => r.n === 1).length
  const exact = [once(mk(0.0003), EXACT), once(mk(-0.0004), EXACT)], lat = [once(mk(0.0003), LATTICE), once(mk(-0.0004), LATTICE)]
  const twins = exact[1] > exact[0]
  console.log(`selftest, twins 0.7 mm apart: used-once edges closed ${exact[0]} → hole ${exact[1]} ${twins ? '✅ the hole is seen' : '⛔ the hole is invisible'} (on the 1 mm lattice: ${lat[0]} → ${lat[1]})`)
  process.exit(ok && twins ? 0 : 1)
}
// ⭐ WHO IS ACROSS EACH SEAM, for assigning it (Boz, 2026-10-18): a seam edge's other side is the nearest OTHER seam edge
// to its midpoint (never its own group's chain neighbour, which shares an end), within PAIR_REACH. Disclosure only; a seam with nothing that near is "· nothing".
const PAIR_REACH = 0.05
function pairs(out) {
  const C = 1, grid = new Map(), ck = (x, z) => `${Math.floor(x / C)},${Math.floor(z / C)}`
  out.forEach((e, i) => { const x0 = Math.floor(Math.min(e.a[0], e.b[0]) / C), x1 = Math.floor(Math.max(e.a[0], e.b[0]) / C), z0 = Math.floor(Math.min(e.a[1], e.b[1]) / C), z1 = Math.floor(Math.max(e.a[1], e.b[1]) / C)
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(i) } })
  const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  const same = (p, q) => p[0] === q[0] && p[1] === q[1], res = new Map()
  out.forEach((e, i) => { const m = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], cand = new Set()
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) for (const j of grid.get(`${Math.floor(m[0] / C) + dx},${Math.floor(m[1] / C) + dz}`) || []) cand.add(j)
    let best = null, bd = PAIR_REACH
    for (const j of cand) { if (j === i) continue; const f = out[j]; if (f.g === e.g && (same(f.a, e.a) || same(f.a, e.b) || same(f.b, e.a) || same(f.b, e.b))) continue
      const dd = segD(m, f.a, f.b); if (dd <= bd) { bd = dd; best = f } }
    res.set(e, best ? [e.g, best.g].sort().join(' ↔ ') : `${e.g} · nothing`) })
  return res
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
  const pair = pairs(r.out), bp = {}; for (const e of r.out) { const k = pair.get(e); bp[k] = (bp[k] || 0) + e.L }
  console.error(`        by group PAIR (m; the other side is the nearest seam edge to this one's midpoint within ${PAIR_REACH * 100} cm — a REPORTING reach, not a rule): ${Object.entries(bp).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')}`)
  for (const e of [...r.out].sort((a, b) => b.L - a.L).slice(0, SHOW)) console.error(`        ${pair.get(e)}: (${e.a.map(v => v.toFixed(3))}) → (${e.b.map(v => v.toFixed(3))}) ${e.L.toFixed(2)} m`)
}
if (bad) { console.error(`⛔ ${bad} slab(s) whose ground leaves a seam open`); process.exit(1) }
console.log('✅ every slab\'s ground tiles its disc')
