// claims-the-walk-is-level-across.mjs — DOES EVERY WALK AND CURB STAY LEVEL ACROSS ITS RUN, AT EVERY EXAGGERATION?
//
// ⭐ THE INVARIANT (BRIEF-the-ground-knows-its-height §6): the drawn walk and curb fall no more than the town's
// `walk.crossSlopeMax` (norms.json, read through `resolveWalkNorm`, never restated) ACROSS the run they line, at every
// exaggeration the town draws. The drawn height is two parts (`terrainShader.js`): the TERRAIN part × uExag plus the
// mesh's own y (the kerb, unexaggerated). Across a triangle the fall is |e·∇terrain·n + ∇y·n|, so it holds at every
// e ≤ the town's authored ceiling (`terrainExag`, the most any shot draws) iff |∇y·n| + E·|∇terrain·n| ≤ the limit.
// "Across" is the normal of the ① run the band lines (`shape.json` tile.runs: skelId · side · segOrd), the run found
// inside the tile whose ring holds the triangle — by geometry, never by tile index.
// ⭐ THE TERRAIN PART is what the runtime draws: the group's baked per-vertex terrain height (`rawByteOffset`) when the
//   bake wrote one, else the terrain field sampled at each vertex (the shader's texture lookup, which is what a group
//   with no baked height is drawn from — the two are the same surface, so this is not a substitution). Said per town.
// ⭐ A CUT IS NOT A WALK: a triangle whose kerb part varies (a ramp, flare or taper, which falls by the town's rampSlope
//   on purpose) is counted apart, never gated here.
// ⭐ A SLIVER IS GATED LIKE ANY TRIANGLE: its plane is computed from the same float32 vertices the GPU draws, so a steep
//   sliver is a steep drawn surface, not rounding. Only a collinear triangle (no plane at all) is counted apart.
//
// ⭐⭐ THE GATE IS THE WALK'S CROSS-SECTION, AS A WALKER MEETS IT (Boz, 2026-10-11): at stations every STATION_M along
//   every ② run (`tile.runs`), the ring normal is walked through the DRAWN sidewalk to its front and back edge, and the
//   drawn height is read at the FRONT, the MIDDLE and the BACK (barycentric in the sidewalk triangle, terrain part and kerb
//   part apart): each half's fall must hold, so a crease or a bow inside the walk cannot hide between its edges. ⛔ The
//   per-TRIANGLE fall below is NOT the gate: a triangle with all three vertices on ONE edge of the walk (a fan along a
//   curved edge) reads the street's curvature ALONG as a tilt ACROSS, and is no cross-section of the walk. It stays,
//   printed, as the DRAWING's diagnostic.
// ⭐ THREE CLASSES, never one number (Boz, 2026-10-11):
//   · a STREET'S walk (its run's chain is a road) — GATED;
//   · a PATH's walk (the run's chain is a footway / cycleway / path / pedestrian / steps / bridleway, by the chain's own
//     `highway` in ribbons.json) — named and counted, not gated: whether a trail carries a walk at all is A19's question;
//   · SUB-LATTICE: a triangle whose excess fall × its own extent across the run is under the partition's lattice
//     (`WELD_QUANTUM_M`, read) cannot show a tilt — a sliver along an edge, whose "fall across" is the street's grade
//     along divided by its altitude. Counted, not gated.
// ⭐ MUTATION TEST: `--selftest` on one town, in memory, on the STATION gate: (1) every terrain part one value (a flat
//   world) → GREEN; (2) the terrain part tilted across x at twice the limit → RED; (3) the walk's MIDDLE bowed up by
//   twice the limit over a half-width, its edges untouched → RED. (The served, undeformed slab is RED: 71.7% of HPDM's
//   street-walk stations, 2026-10-11.)
//
//   node checks/claims-the-walk-is-level-across.mjs [--town=a,b] [--dir=<slab dir>] [--selftest] [--show=n]
// Read-only. Exits 1 on any street-walk station over the limit, or on a town whose limit cannot be read.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { loadSceneTerrain } from '../cartograph/terrainLoad.js'
import { resolveWalkNorm } from '../cartograph/curb-cut-norm.mjs'
import { ribbonsPathOf } from '../cartograph/scene.js'
import { WELD_QUANTUM_M } from '../cartograph/groundConformity.js'

const ROOT = new URL('../public/baked/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SHOW = +(arg('show') || 8)
const SELFTEST = process.argv.includes('--selftest')
const BANDS = new Set(['sidewalk', 'curb'])
const dirs = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'shape.json')) && existsSync(join(ROOT, t, 'ground.json')))).map(t => arg('dir') ? t : join(ROOT, t))

function load(dir) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
  const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const shape = JSON.parse(readFileSync(join(dir, 'shape.json'), 'utf8'))
  return { gj, AB, shape }
}

// the tiles' rings (even-odd over iA) and their run segments, bucketed
function tileIndex(shape) {
  const CELL = 50, grid = new Map()
  const tiles = shape.tiles.map((t, ti) => {
    const rings = (t.iA || []).filter(r => r?.length >= 3)
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const r of rings) for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
    const segs = []
    for (const run of t.runs || []) { const p = run.poly || []; for (let i = 0; i + 1 < p.length; i++) segs.push({ a: p[i], b: p[i + 1], run }) }
    return { ti, rings, segs, bb: [a, b, c, d] }
  }).filter(t => t.rings.length)
  for (const t of tiles) for (let gx = Math.floor(t.bb[0] / CELL); gx <= Math.floor(t.bb[2] / CELL); gx++) for (let gz = Math.floor(t.bb[1] / CELL); gz <= Math.floor(t.bb[3] / CELL); gz++) {
    const k = gx + ',' + gz; (grid.get(k) || grid.set(k, []).get(k)).push(t) }
  const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const ownerOf = (x, z) => { for (const t of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
    if (x < t.bb[0] || x > t.bb[2] || z < t.bb[1] || z > t.bb[3]) continue
    let inside = false; for (const r of t.rings) if (pip(x, z, r)) inside = !inside
    if (inside) return t } return null }
  const across = (t, x, z) => { let best = null, bd = Infinity
    for (const s of t.segs) { const [ax, az] = s.a, [bx, bz] = s.b, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (L2 < 1e-12) continue
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - u * dx, z - az - u * dz)
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { run: s.run, n: [-dz / L, dx / L] } } }
    return best }
  return { ownerOf, across }
}

function measure(dir, { mutate = null } = {}) {
  const { gj, AB, shape } = load(dir)
  const town = gj.look ?? basename(dir)   // the slab names its own town; a scratch dir is not one
  const norm = resolveWalkNorm(town, null)
  const T = loadSceneTerrain(town)
  if (!T) throw new Error(`${town}: no terrain — the drawn height is unknown`)
  const E = T.exag
  if (!(E >= 0)) throw new Error(`${town}: no authored exaggeration ceiling could be read`)
  const groups = gj.groups.filter(g => BANDS.has(g.id))
  if (!groups.length) return { town, none: true }
  const { ownerOf, across } = tileIndex(shape)
  const PATH = new Set(['footway', 'cycleway', 'path', 'pedestrian', 'steps', 'bridleway'])
  const ribP = ribbonsPathOf(town)
  if (!existsSync(ribP)) throw new Error(`${town}: no ribbons (${ribP}) — a run's class cannot be read`)
  const classOf = new Map(JSON.parse(readFileSync(ribP, 'utf8')).streets.map(st => [st.skelId ?? st.name, PATH.has(st.highway) ? 'path' : 'street']))
  const out = { town, E, norm, band: [0, 0, 0, 0], path: { n: 0, area: 0 }, subLattice: { n: 0, area: 0 }, sources: {}, tris: 0, area: 0, over: [], overArea: 0, cut: 0, cutArea: 0, thin: 0, unowned: 0, worst: 0, worstRaw: 0, worstY: 0 }
  for (const g of groups) {
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    let raw
    if (g.rawByteOffset != null) { raw = new Float32Array(AB, g.rawByteOffset, g.vertexCount); out.sources[g.id] = 'baked terrain height' }
    else { raw = new Float64Array(g.vertexCount); for (let v = 0; v < g.vertexCount; v++) raw[v] = T.getElevationRaw(P[v * 3], P[v * 3 + 2]); out.sources[g.id] = 'terrain field at each vertex (no baked height)' }
    if (mutate) raw = Float64Array.from(raw, (h, v) => mutate(h, P[v * 3], P[v * 3 + 2]))
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i], b = I[i + 1], c = I[i + 2]
      const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2]
      const e1x = bx - ax, e1z = bz - az, e2x = cx - ax, e2z = cz - az, det = e1x * e2z - e2x * e1z, area = Math.abs(det) / 2
      out.tris++; out.area += area
      if (!(Math.abs(det) > 0)) { out.thin++; continue }
      const grad = (h0, h1, h2) => { const d1 = h1 - h0, d2 = h2 - h0; return [(d1 * e2z - d2 * e1z) / det, (e1x * d2 - e2x * d1) / det] }
      const gr = grad(raw[a], raw[b], raw[c]), gy = grad(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1])
      const ya = P[a * 3 + 1], yb = P[b * 3 + 1], yc = P[c * 3 + 1]
      if (Math.max(ya, yb, yc) - Math.min(ya, yb, yc) > 1e-6) { out.cut++; out.cutArea += area; continue }
      const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3
      const t = ownerOf(mx, mz), ac = t && across(t, mx, mz)
      if (!ac) { out.unowned++; continue }
      const cr = Math.abs(gr[0] * ac.n[0] + gr[1] * ac.n[1]), cy = Math.abs(gy[0] * ac.n[0] + gy[1] * ac.n[1])
      const fall = cy + E * cr
      if (fall > out.worst) { out.worst = fall; out.worstRaw = cr; out.worstY = cy }
      if (norm.crossSlopeMax != null && fall > norm.crossSlopeMax) {
        const pr = [ax * ac.n[0] + az * ac.n[1], bx * ac.n[0] + bz * ac.n[1], cx * ac.n[0] + cz * ac.n[1]]
        if ((fall - norm.crossSlopeMax) * (Math.max(...pr) - Math.min(...pr)) < WELD_QUANTUM_M) { out.subLattice.n++; out.subLattice.area += area; continue }
        if (classOf.get(ac.run.skelId) === 'path') { out.path.n++; out.path.area += area; continue }
        const r = fall / norm.crossSlopeMax; out.band[r <= 1.01 ? 0 : r <= 2 ? 1 : r <= 10 ? 2 : 3] += area
        out.over.push({ g: g.id, area, fall, cr, ti: t.ti, key: `${ac.run.skelId} · ${ac.run.side} · ${ac.run.segOrd}`, at: [mx, mz] }); out.overArea += area }
    }
  }
  return out
}

const STATION_M = 1, PROBE_M = 0.02, EDGE_IN_M = 0.01
// the walk's cross-section at stations along every ② run — THE GATE. `mutate(h, x, z, frac)` bends the read height for
// the selftest (frac = 0 at the walk's front edge, 1 at its back; W the walk's width there).
function stations(dir, { mutate = null } = {}) {
  const { gj, AB, shape } = load(dir)
  const town = gj.look ?? basename(dir), norm = resolveWalkNorm(town, null), T = loadSceneTerrain(town), E = T.exag
  const g = gj.groups.find(g => g.id === 'sidewalk'); if (!g) return { town, none: true }
  const PATH = new Set(['footway', 'cycleway', 'path', 'pedestrian', 'steps', 'bridleway'])
  const classOf = new Map(JSON.parse(readFileSync(ribbonsPathOf(town), 'utf8')).streets.map(st => [st.skelId ?? st.name, PATH.has(st.highway) ? 'path' : 'street']))
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const R = g.rawByteOffset != null ? new Float32Array(AB, g.rawByteOffset, g.vertexCount) : Float64Array.from({ length: g.vertexCount }, (_, v) => T.getElevationRaw(P[v * 3], P[v * 3 + 2]))
  const C = 4, grid = new Map()
  for (let i = 0; i < I.length; i += 3) { const v = [I[i], I[i + 1], I[i + 2]], xs = v.map(k => P[k * 3]), zs = v.map(k => P[k * 3 + 2])
    for (let x = Math.floor(Math.min(...xs) / C); x <= Math.floor(Math.max(...xs) / C); x++) for (let z = Math.floor(Math.min(...zs) / C); z <= Math.floor(Math.max(...zs) / C); z++) { const k = x * 100003 + z; (grid.get(k) || grid.set(k, []).get(k)).push(v) } }
  const at = (x, z) => { for (const [a, b, c] of grid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) || []) {
    const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2]
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-12) continue
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return { raw: l1 * R[a] + l2 * R[b] + l3 * R[c], y: l1 * P[a * 3 + 1] + l2 * P[b * 3 + 1] + l3 * P[c * 3 + 1] } }
    return null }
  const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const out = { town, E, norm, source: g.rawByteOffset != null ? 'baked terrain height' : 'terrain field at each vertex (no baked height)', street: { n: 0, over: [] }, path: { n: 0, over: 0 }, falls: [] }
  for (const [ti, t] of shape.tiles.entries()) { if (!t.ring) continue
    for (const run of t.runs || []) { if (!run.skelId || run.skelId.startsWith('__')) continue
      const p = run.poly, cls = classOf.get(run.skelId) || 'street'
      for (let i = 0; i + 1 < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) continue
        const tx = (bx - ax) / L, tz = (bz - az) / L; let nx = -tz, nz = tx
        if (!pip((ax + bx) / 2 + nx * 0.05, (az + bz) / 2 + nz * 0.05, t.ring)) { nx = -nx; nz = -nz }
        for (let u = STATION_M / 2; u < L; u += STATION_M) { const x0 = ax + tx * u, z0 = az + tz * u
          let f = null, b = null
          for (let d = PROBE_M; d < 20; d += PROBE_M) { if (at(x0 + nx * d, z0 + nz * d)) { if (f == null) f = d; b = d } else if (f != null) break }
          if (f == null || b - f < 0.5) continue
          const ds = [f + EDGE_IN_M, (f + b) / 2, b - EDGE_IN_M], hs = ds.map((d, k) => { const h = at(x0 + nx * d, z0 + nz * d); if (!h) return null
            return mutate ? { raw: mutate(h.raw, x0 + nx * d, z0 + nz * d, k / 2, b - f), y: h.y } : h })
          if (hs.some(h => !h)) continue
          // each half's fall, at the ceiling: kerb part + E × terrain part (|a + e·b| ≤ |a| + E|b| for every e ≤ E)
          let fall = 0
          for (const [p0, p1] of [[0, 1], [1, 2]]) { const w = ds[p1] - ds[p0]; fall = Math.max(fall, (Math.abs(hs[p1].y - hs[p0].y) + E * Math.abs(hs[p1].raw - hs[p0].raw)) / w) }
          if (cls === 'path') { out.path.n++; if (norm.crossSlopeMax != null && fall > norm.crossSlopeMax) out.path.over++; continue }
          out.street.n++; out.falls.push(fall)
          if (norm.crossSlopeMax != null && fall > norm.crossSlopeMax) out.street.over.push({ fall, ti, key: `${run.skelId} · ${run.side} · ${run.segOrd}`, at: [x0, z0] }) } } } }
  return out
}

const pct = (v) => `${(v * 100).toFixed(2)}%`
function reportStations(r) {
  if (r.none) { console.log(`  ?   ${r.town}: no walk drawn — not this check's question`); return 0 }
  const lim = r.norm.crossSlopeMax
  const q = (p) => { const s = [...r.falls].sort((a, b) => a - b); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN }
  const head = `${r.town}: ${r.street.n} street-walk station(s) every ${STATION_M} m · ceiling exag ${r.E} · drawn from ${r.source}`
  if (lim == null) { console.log(`  ⛔  ${head}\n        the town names NO cross-slope limit (norms.json walk.crossSlopeMax) — measured, not gated: fall p90 ${pct(q(0.9))}`); return 1 }
  const bad = r.street.over.length > 0
  console.log(`  ${bad ? '⛔ ' : '✅'}  ${head} · limit ${r.norm.crossSlopeMaxText} (${r.norm.source})`)
  console.log(`        THE GATE — the walk's cross-section (front · middle · back): fall p50 ${pct(q(0.5))} p90 ${pct(q(0.9))} p99 ${pct(q(0.99))} · over the limit at ${r.street.over.length} station(s), ${pct(r.street.over.length / Math.max(1, r.street.n))}`)
  console.log(`        not gated: path walks ${r.path.over} of ${r.path.n} station(s) over (A19's)`)
  if (bad) { const by = new Map(); for (const o of r.street.over) { const k = `tile ${o.ti} · ${o.key}`; const s = by.get(k) || by.set(k, { n: 0, worst: 0, at: o.at }).get(k); s.n++; if (o.fall > s.worst) { s.worst = o.fall; s.at = o.at } }
    for (const [k, s] of [...by].sort((a, b) => b[1].n - a[1].n).slice(0, SHOW)) console.log(`          ${k}: ${s.n} station(s), worst ${pct(s.worst)} at (${s.at[0].toFixed(1)}, ${s.at[1].toFixed(1)})`) }
  return bad ? 1 : 0
}
function report(r) {
  if (r.none) { console.log(`  ?   ${r.town}: no walk or curb drawn — not this check's question`); return 0 }
  const lim = r.norm.crossSlopeMax
  const src = [...new Set(Object.values(r.sources))].join(' / ')
  const head = `the DRAWING (per triangle, a diagnostic — NOT the gate): ${r.tris} walk+curb triangle(s), ${(r.area / 1e4).toFixed(2)} ha · ceiling exag ${r.E} · drawn from ${src}`
  if (lim == null) { console.log(`  ⛔  ${head}\n        the town names NO cross-slope limit (norms.json walk.crossSlopeMax, rung ${r.norm.source}) — measured, not gated: worst fall ${pct(r.worst)}`); return 1 }
  const bad = r.over.length > 0
  console.log(`        ${head} · limit ${r.norm.crossSlopeMaxText} (${pct(lim)}, ${r.norm.source})`)
  console.log(`        over the limit at the ceiling: ${r.over.length} triangle(s), ${(r.overArea / r.area * 100).toFixed(2)}% of the area · worst ${pct(r.worst)} (terrain ${pct(r.worstRaw)} per unit exag, kerb ${pct(r.worstY)})`)
  if (bad) console.log(`        how far over (share of the over area): ≤1.01× ${(r.band[0] / r.overArea * 100).toFixed(1)}% · ≤2× ${(r.band[1] / r.overArea * 100).toFixed(1)}% · ≤10× ${(r.band[2] / r.overArea * 100).toFixed(1)}% · >10× ${(r.band[3] / r.overArea * 100).toFixed(1)}%`)
  console.log(`        not gated: path walks over the limit ${r.path.n} tri(s), ${r.path.area.toFixed(0)} m² · sub-lattice ${r.subLattice.n} tri(s), ${r.subLattice.area.toFixed(2)} m²`)
  console.log(`        apart: ${r.cut} cut/taper triangle(s) (${r.cutArea.toFixed(0)} m², their fall is the ramp's) · ${r.thin} collinear (no plane) · ${r.unowned} in no tile`)
  if (bad) {
    const by = new Map(); for (const o of r.over) { const k = `tile ${o.ti} · ${o.key}`; const s = by.get(k) || by.set(k, { n: 0, area: 0, worst: 0, at: o.at }).get(k); s.n++; s.area += o.area; if (o.fall > s.worst) { s.worst = o.fall; s.at = o.at } }
    const rows = [...by.entries()].sort((p, q) => q[1].area - p[1].area)
    console.log(`        ${rows.length} stretch(es) over (tile · skelId · side · segOrd), by area:`)
    for (const [k, s] of rows.slice(0, SHOW)) console.log(`          ${k}: ${s.n} tri(s), ${s.area.toFixed(1)} m², worst ${pct(s.worst)} at (${s.at[0].toFixed(1)}, ${s.at[1].toFixed(1)})`)
  }
  return 0
}

if (SELFTEST) {
  const dir = dirs[0]
  const town = load(dir).gj.look ?? basename(dir), lim = resolveWalkNorm(town, null).crossSlopeMax
  if (lim == null) throw new Error(`--selftest needs a town with a cross-slope limit; ${town} names none`)
  const E = loadSceneTerrain(town).exag || 1
  const flat = stations(dir, { mutate: () => 0 })
  const tilt = stations(dir, { mutate: (h, x) => h + x * 2 * lim / E })
  const bow = stations(dir, { mutate: (h, x, z, frac, W) => frac === 0.5 ? h + 2 * lim * (W / 2) / E : h })   // the middle only; the edges untouched
  const rows = [['a flat world (every terrain part one value) is GREEN', flat.street.over.length === 0 && flat.street.n > 0],
                ['a world tilted across x at twice the limit is RED', tilt.street.over.length > 0],
                ['a walk BOWED in its middle at twice the limit, its edges untouched, is RED', bow.street.over.length > 0]]
  for (const [m, ok] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  console.log(`  (${town}: ${flat.street.n} station(s) · flat → ${flat.street.over.length} over · tilted → ${tilt.street.over.length} · bowed → ${bow.street.over.length})`)
  process.exit(rows.every(r => r[1]) ? 0 : 1)
}

let bad = 0
for (const d of dirs) { bad += reportStations(stations(d)); report(measure(d)) }
console.log(bad ? `⛔ ${bad} town(s) whose walk is not level across, or whose limit is not named` : '✅ every street walk is level across, front to middle to back, at every exaggeration its town draws')
process.exit(bad ? 1 : 0)
