// end-rule.mjs — the cracks findTJunctions' END RULE hides (Boz, 2026-10-18). Read-only on served slabs.
// The detector skips a vertex within ON_EDGE_M of an edge's END. Counted here: a BOUNDARY vertex V (exact float32 identity,
// on an edge of the union used once) within ON_EDGE_M of a BOUNDARY edge e of ANOTHER group, 0 < d, whose foot falls in
// e's end zone (≤ ON_EDGE_M from an end), and that is not e's endpoint — so two unshared chains end near each other without
// meeting. Distances are V→e and V→the nearer end of e. Partition groups only (ground.json `partition`).
//   node --max-old-space-size=10000 end-rule.mjs [town …]
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
const R = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/'
const { ON_EDGE_M } = await import(R + 'cartograph/groundConformity.js')
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['hipointedemun', 'huron', 'jacksonheights', 'lafayette-square', 'provincetown']
for (const town of towns) {
  const dir = join(R, 'public/baked', town); if (!existsSync(join(dir, 'ground.json'))) { console.log(`${town}: no slab`); continue }
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), bin = readFileSync(join(dir, gj.bin || 'ground.bin'))
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const groups = gj.groups.filter(g => g.partition)
  if (!groups.length) { console.log(`${town}: unstamped — no partition`); continue }
  // exact identity: one id per distinct float32 (x, z)
  const id = new Map(), X = [], Z = [], G = []
  const vid = (x, z, g) => { const k = x + ',' + z; let i = id.get(k); if (i === undefined) { i = X.length; id.set(k, i); X.push(x); Z.push(z); G.push(new Set()) } G[i].add(g); return i }
  const edges = new Map()   // "a|b" → { n, a, b, g }
  groups.forEach((g, gi) => { const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
    const loc = new Int32Array(g.vertexCount); for (let v = 0; v < g.vertexCount; v++) loc[v] = vid(P[v * 3], P[v * 3 + 2], gi)
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = loc[I[t + k]], b = loc[I[t + (k + 1) % 3]]; if (a === b) continue
      const key = a < b ? a + '|' + b : b + '|' + a, e = edges.get(key); if (e) e.n++; else edges.set(key, { n: 1, a, b, g: gi }) } })
  const bnd = [], onB = new Uint8Array(X.length), inc = new Map()   // vertex → its boundary edges
  for (const e of edges.values()) if (e.n === 1) { bnd.push(e); onB[e.a] = 1; onB[e.b] = 1
    for (const v of [e.a, e.b]) { let a = inc.get(v); if (!a) inc.set(v, a = []); a.push(e) } }
  const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0; return Math.hypot(px - ax - t * dx, pz - az - t * dz) }
  // grid of boundary vertices
  const cell = 4, grid = new Map(), ck = (cx, cz) => cx * 1e7 + cz
  for (let i = 0; i < X.length; i++) if (onB[i]) { const k = ck(Math.floor(X[i] / cell), Math.floor(Z[i] / cell)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i) }
  const hits = []
  for (const e of bnd) {
    const ax = X[e.a], az = Z[e.a], bx = X[e.b], bz = Z[e.b], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (!(L2 > 0)) continue
    const L = Math.sqrt(L2)
    // only the end zones: within ON_EDGE_M of each end
    for (const [ex, ez] of [[ax, az], [bx, bz]]) {
      const x0 = Math.floor((ex - 2 * ON_EDGE_M) / cell), x1 = Math.floor((ex + 2 * ON_EDGE_M) / cell), z0 = Math.floor((ez - 2 * ON_EDGE_M) / cell), z1 = Math.floor((ez + 2 * ON_EDGE_M) / cell)
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) for (const i of grid.get(ck(cx, cz)) || []) {
        if (i === e.a || i === e.b || G[i].has(e.g)) continue                                    // its own end, or a vertex of e's own group
        const t = ((X[i] - ax) * dx + (Z[i] - az) * dz) / L2, tc = Math.max(0, Math.min(1, t))
        const d = Math.hypot(X[i] - (ax + tc * dx), Z[i] - (az + tc * dz)); if (!(d > 0 && d <= ON_EDGE_M)) continue
        if (!(t > 0 && t < 1)) continue                                                         // its foot past e's end: near a vertex, not on e
        if (!(t * L <= ON_EDGE_M || (1 - t) * L <= ON_EDGE_M)) continue                          // interior: the detector already judges it
        const dEnd = Math.min(Math.hypot(X[i] - ax, Z[i] - az), Math.hypot(X[i] - bx, Z[i] - bz))
        // ALONGSIDE: one of V's own boundary edges runs along e (its far end within ON_EDGE_M of e, or e's near end within
        // ON_EDGE_M of it) — two unshared chains along each other, a sliver gap. Otherwise a JUNCTION: V's chain leaves e's end
        // (e.g. two groups meeting at the rim or the water's edge from opposite sides).
        const along = (inc.get(i) || []).some(f => { const w = f.a === i ? f.b : f.a
          return w !== e.a && w !== e.b ? segDist(X[w], Z[w], ax, az, bx, bz) <= ON_EDGE_M : true })
        hits.push({ x: X[i], z: Z[i], fx: ax + t * dx, fz: az + t * dz, d, dEnd, along, vg: [...G[i]].map(j => groups[j].id).join('+'), eg: groups[e.g].id })
      }
    }
  }
  // one row per vertex (a vertex near two edges' ends is one site)
  const by = new Map(); for (const h of hits) { const k = h.x + ',' + h.z; const o = by.get(k); if (!o || (h.along && !o.along) || (h.along === o.along && h.d < o.d)) by.set(k, h) }
  const all = [...by.values()], sites = all.filter(h => h.along).sort((p, q) => q.d - p.d)
  const rim = gj.stencil?.radius > 0 ? (h) => Math.hypot(h.x - (gj.stencil.center?.[0] ?? 0), h.z - (gj.stencil.center?.[1] ?? 0)) > gj.stencil.radius - 1 : () => false
  console.log(`${town}: end-zone sites ${all.length} · JUNCTION (V's chain leaves e's end) ${all.length - sites.length} · ALONGSIDE ${sites.length}, of them within 1 m of the rim ${sites.filter(rim).length}`)
  const q = (a, f) => a.length ? a.map(s => s[f]).sort((p, r) => p - r)[Math.floor((a.length - 1) * 0.5)] : 0
  // ⭐ IS THE GAP OPEN: the midpoint of V and its foot on e — covered by any partition triangle? (a triangle with no corner
  // nearby can still cover it). Triangles are tested only where a site's cell lies.
  const want = new Map(); sites.forEach((s, k) => { s.mx = (s.x + s.fx) / 2; s.mz = (s.z + s.fz) / 2; s.covered = 0
    const c = ck(Math.floor(s.mx / cell), Math.floor(s.mz / cell)); let a = want.get(c); if (!a) want.set(c, a = []); a.push(s) })
  const side = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax)
  groups.forEach((g) => { const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
      const x0 = Math.min(P[a], P[b], P[c]), x1 = Math.max(P[a], P[b], P[c]), z0 = Math.min(P[a + 2], P[b + 2], P[c + 2]), z1 = Math.max(P[a + 2], P[b + 2], P[c + 2])
      for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) for (const s of want.get(ck(cx, cz)) || []) {
        if (s.mx < x0 || s.mx > x1 || s.mz < z0 || s.mz > z1) continue
        const d1 = side(P[a], P[a + 2], P[b], P[b + 2], s.mx, s.mz), d2 = side(P[b], P[b + 2], P[c], P[c + 2], s.mx, s.mz), d3 = side(P[c], P[c + 2], P[a], P[a + 2], s.mx, s.mz)
        if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) s.covered++ } } })
  const open = sites.filter(s => !s.covered)
  console.log(`   the gap's midpoint covered by a triangle: ${sites.length - open.length} · OPEN (no triangle covers it) ${open.length}${open.length ? `, gap median ${(q(open, 'd') * 1000).toFixed(2)} mm, max ${(Math.max(...open.map(s => s.d)) * 1000).toFixed(2)} mm, within 1 m of the rim ${open.filter(rim).length}` : ''}`)
  sites.length = 0; sites.push(...open.sort((p, q) => q.d - p.d))
  const pairs = new Map(); for (const s of sites) pairs.set(`${s.vg} → ${s.eg}`, (pairs.get(`${s.vg} → ${s.eg}`) || 0) + 1)
  console.log(`   ALONGSIDE: gap (V off e) median ${(q(sites, 'd') * 1000).toFixed(2)} mm, max ${sites.length ? (sites[0].d * 1000).toFixed(2) : '—'} mm`)
  for (const [p, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`   ${n} · ${p}`)
  for (const s of sites.slice(0, 12)) console.log(`   (${s.x.toFixed(3)}, ${s.z.toFixed(3)}) ${s.vg} → ${s.eg} edge · ${(s.d * 1000).toFixed(2)} mm off it · ${(s.dEnd * 1000).toFixed(2)} mm from its end`)
}
