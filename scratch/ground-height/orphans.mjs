// orphans.mjs — every ped vertex of a baked slab that NO painted band owns (the bake now throws on them), grouped into
// connected clusters, each with: tile · the drawn group · its distance to the nearest ② · the deepest ped band any ② span's
// ray reaches there · the painted WALK/LAWN/CURB polygon that holds it (area, and its distance to ②). READ-ONLY.
//   node scratch/ground-height/orphans.mjs <scene> <dump inputs.json> <slab dir>
import { readFileSync } from 'fs'
import { join } from 'path'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + (process.env.DEFORMER || 'scratch/ground-height/groundDeformer.probe.mjs'))
const { resolveWalkNorm, resolveLawnNorm } = await import(R + 'cartograph/curb-cut-norm.mjs')
const [scene, dumpP, dir] = process.argv.slice(2)
const dump = JSON.parse(readFileSync(dumpP)), T = loadSceneTerrain(scene)
const D = buildDeformer({ tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw,
  limits: { walkMax: resolveWalkNorm(scene).crossSlopeMax, lawnMax: resolveLawnNorm(scene).slopeMax ?? null, exag: T.exag, blend: T.stepM, sigma: T.stepM } })
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const pts = new Map()
for (const g of gj.groups) {
  if (g.id === 'water') continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], k = `${x.toFixed(2)},${z.toFixed(2)}`
    if (pts.has(k)) continue; const ti = D.unownedIn(x, z); if (ti != null) pts.set(k, { x, z, ti, g: g.id }) }
}
// clusters: orphans within 1 m of each other on one tile
const list = [...pts.values()], seen = new Set(), clusters = []
for (const p of list) { if (seen.has(p)) continue; const c = [p]; seen.add(p)
  for (let i = 0; i < c.length; i++) for (const q of list) if (!seen.has(q) && q.ti === c[i].ti && Math.hypot(q.x - c[i].x, q.z - c[i].z) < 1) { seen.add(q); c.push(q) }
  clusters.push(c) }
// the painted polygon (outer ring) of each class holding a point
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const holder = (x, z) => { for (const cls of ['walk', 'lawn', 'curb']) for (const it of dump.bands[cls]) { const o = it.outer || it; if (o.length >= 3 && pip(x, z, o) && !(it.holes || []).some(h => pip(x, z, h))) return { cls, area: area(o), n: o.length } } return null }
console.log(`${scene}: ${list.length} ped vertex(es) no painted band owns, in ${clusters.length} cluster(s) on ${new Set(list.map(p => p.ti)).size} tile(s) · by drawn group: ${JSON.stringify(list.reduce((m, p) => (m[p.g] = (m[p.g] || 0) + 1, m), {}))}`)
const rows = clusters.map(c => { const p = c[Math.floor(c.length / 2)], own = D._owners(p.x, p.z)
  const reach = Math.max(0, ...own.map(o => { let back = 0; for (const b of o.bands) { if (b.cls === 'lot') break; if (b.cls !== 'beyond') back = b.to } return back }))
  return { n: c.length, ti: p.ti, g: p.g, at: [p.x, p.z], d: own[0]?.d, reach, hold: holder(p.x, p.z) } }).sort((a, b) => b.n - a.n)
const hist = (f) => rows.reduce((m, r) => (m[f(r)] = (m[f(r)] || 0) + 1, m), {})
console.log('clusters by the painted polygon holding them:', JSON.stringify(hist(r => r.hold ? `${r.hold.cls} ${r.hold.area < 1 ? '<1 m²' : r.hold.area < 10 ? '1–10 m²' : r.hold.area < 100 ? '10–100 m²' : '≥100 m²'}` : 'none')))
console.log('clusters whose point lies DEEPER than every ② span\'s reachable band:', rows.filter(r => r.d != null && r.d > r.reach).length, 'of', rows.length)
for (const r of rows.slice(0, +(process.env.SHOWN || 15))) console.log(`  tile ${r.ti} · ${r.n} vertex(es) in ${r.g} at (${r.at.map(v => v.toFixed(2))}) · nearest ② ${r.d?.toFixed(2)} m · deepest reachable band ${r.reach.toFixed(2)} m · held by painted ${r.hold ? `${r.hold.cls} polygon ${r.hold.area.toFixed(1)} m² (${r.hold.n} vertices)` : 'nothing'}`)
if (process.env.CURB) { const C = rows.filter(r => r.hold?.cls === 'curb')
  const ds = C.map(r => r.d).sort((a, b) => a - b); console.log(`curb-held clusters ${C.length}: nearest ② p10 ${ds[Math.floor(.1 * ds.length)]?.toFixed(3)} p50 ${ds[ds.length >> 1]?.toFixed(3)} p90 ${ds[Math.floor(.9 * ds.length)]?.toFixed(3)} m · drawn as ${JSON.stringify(C.reduce((m, r) => (m[r.g] = (m[r.g] || 0) + 1, m), {}))}`)
  for (const r of C.slice(0, 4)) { console.log(`  tile ${r.ti} (${r.at.map(v => v.toFixed(3))}) in ${r.g} d ${r.d?.toFixed(3)}`)
    for (const o of D._owners(...r.at).slice(0, 3)) console.log(`     ${o.key} d ${o.d.toFixed(3)} → ${o.bands.slice(0, 4).map(b => `${b.cls} ${b.from.toFixed(3)}-${b.to.toFixed(3)}`).join(' ')}`) } }
// ⭐ THE GAP CENSUS: for each orphan cluster, the best ② span's path from its station to the point, sampled every 0.5 mm
// by point-in-polygon (beyond the disc counts as band-continuous): the widest run of LOT on it. The cluster's class is
// the smallest such widest-gap over its candidates — a seam if ≤ 5 mm (the near-duplicate class), else wider.
if (process.env.GAPS) {
  const disc = dump.stencil, inDisc = (x, z) => !disc || pip(x, z, disc)
  const cls = (x, z) => !inDisc(x, z) ? 'beyond' : ['walk', 'lawn', 'curb'].find(c => D._inClass(c, x, z)) || 'lot'
  // the widest lot run on the path, and (SIDES=1) the two samples either side of it — `after` null if the lot runs to the point
  let sideOf = null
  const widest = (c, x, z) => { const ux = (x - c.px) / c.d, uz = (z - c.pz) / c.d; let run = 0, w = 0, band = false, prevT = null, from = null, best = null
    for (let t = 0.0025; t <= c.d; t += 0.0005) { const k = cls(c.px + ux * t, c.pz + uz * t)
      if (k === 'lot') { if (band) { if (run === 0) from = prevT; run += 0.0005; if (run > w) { w = run; best = { before: from, after: null } } } }
      else { if (k !== 'beyond') band = true; if (run > 0 && best && best.before === from && best.after == null && run === w) best.after = t; run = 0; prevT = t } }
    sideOf = best && { c, ux, uz, ...best }
    return band ? w : Infinity }
  const hist = {}, ex = {}
  for (const c of clusters) { const p = c[Math.floor(c.length / 2)]
    let g = Infinity, side = null
    for (const o of D._owners(p.x, p.z).slice(0, 4)) { const w = widest(o, p.x, p.z); if (w < g) { g = w; side = sideOf } }
    c.side = side
    const k = !Number.isFinite(g) ? 'no candidate path reaches a band' : g <= 0.005 ? 'seam ≤5 mm' : g <= 0.05 ? '5 mm–5 cm' : g <= 0.5 ? '5–50 cm' : '>50 cm'
    hist[k] = (hist[k] || 0) + c.length; c.gapClass = k; (ex[k] ||= []).push({ ti: p.ti, at: [p.x, p.z], g, g2: p.g, n: c.length }) }
  console.log('orphan VERTICES by the widest lot gap on the best path:', JSON.stringify(hist))
  if (process.env.SIDES) { const keyOf = []; if (dump.lawnKeys) for (const [k, n] of dump.lawnKeys) for (let i = 0; i < n; i++) keyOf.push(k)
    const lawnKey = (x, z) => { const i = dump.bands.lawn.findIndex(it => { const o = it.outer || it; return o.length >= 3 && pip(x, z, o) && !(it.holes || []).some(h => pip(x, z, h)) }); return i >= 0 && keyOf.length ? keyOf[i] : 'lawn' }
    const name = (x, z) => { const k = cls(x, z); return k === 'lawn' ? lawnKey(x, z) : k }
    const T = {}
    for (const c of clusters) { if (c.gapClass === 'seam ≤5 mm' || !c.side) continue; const s = c.side, at = (t) => [s.c.px + s.ux * t, s.c.pz + s.uz * t]
      const k = `${c.gapClass}: ${s.before == null ? '(start)' : name(...at(s.before))} | ${s.after == null ? '(lot to the point)' : name(...at(s.after))}`
      ;(T[k] ||= { v: 0, cl: 0, ex: [] }); T[k].v += c.length; T[k].cl++; T[k].ex.push(`tile ${c[0].ti} (${at(s.before ?? 0).map(v => v.toFixed(3))})`)
      const mid = s.before == null ? null : at(s.after == null ? s.before + 0.001 : (s.before + s.after) / 2); if (mid) (globalThis.MIDS ||= []).push({ k, ti: c[0].ti, n: c.length, at: mid }) }
    if (process.env.MIDS) { (await import('fs')).writeFileSync(process.env.MIDS, JSON.stringify(globalThis.MIDS || [])); console.log(`gap midpoints → ${process.env.MIDS}`) }
    console.log('wider classes by the pieces either side of the widest gap (vertices · clusters · e.g.):')
    for (const [k, r] of Object.entries(T).sort((a, b) => b[1].v - a[1].v)) console.log(`   ${k}: ${r.v} · ${r.cl} · ${r.ex.slice(0, 2).join(' · ')}`) }
  for (const [k, a] of Object.entries(ex)) console.log(`  ${k}: ${a.length} cluster(s), e.g. ${a.sort((p, q) => q.n - p.n).slice(0, 3).map(e => `tile ${e.ti} (${e.at.map(v => v.toFixed(2))}) ${e.g2} gap ${Number.isFinite(e.g) ? (e.g * 1000).toFixed(1) + ' mm' : '—'}`).join(' · ')}`)
}
// ⭐ WHICH PIECES A ≤5 mm GAP LIES BETWEEN: on the best path, the painted item just before and just after each lot run
// ≤ 5 mm — its class, its land-use key (when the dump carries `lawnKeys`) — or the disc's edge.
if (process.env.PAIRS) {
  // ⚡ The walk along the path classes each 0.5 mm sample with the deformer's own indexed `_inClass` (as GAPS does); the
  //   per-ITEM lookup (a linear scan of every painted polygon, 4.9 ms a call on HPDM) runs only at the two samples that
  //   bound a gap, behind a bbox reject. The first version called it at every sample: ~10 s per metre of path.
  const keyOf = []; if (dump.lawnKeys) for (const [k, n] of dump.lawnKeys) for (let i = 0; i < n; i++) keyOf.push(k)
  const bbox = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
  const boxes = Object.fromEntries(['walk', 'lawn', 'curb'].map(c => [c, dump.bands[c].map(it => bbox(it.outer || it))]))
  const disc = dump.stencil, inDisc = (x, z) => !disc || pip(x, z, disc)
  const clsAt = (x, z) => !inDisc(x, z) ? 'beyond the disc' : ['walk', 'lawn', 'curb'].find(c => D._inClass(c, x, z)) || 'lot'
  const itemAt = (x, z) => { const c = clsAt(x, z); if (c !== 'lawn' || !keyOf.length) return c
    const i = dump.bands.lawn.findIndex((it, j) => { const [a, b, cc, d] = boxes.lawn[j]; if (x < a || x > cc || z < b || z > d) return false
      const o = it.outer || it; return o.length >= 3 && pip(x, z, o) && !(it.holes || []).some(h => pip(x, z, h)) })
    return i >= 0 ? keyOf[i] : 'lawn (no item holds it)' }
  const pairs = new Map(), widths = []
  const exP = new Map()
  for (const c of clusters) { if (c.gapClass && c.gapClass !== 'seam ≤5 mm') continue; const p = c[Math.floor(c.length / 2)]
    for (const o of D._owners(p.x, p.z).slice(0, 4)) { const ux = (p.x - o.px) / o.d, uz = (p.z - o.pz) / o.d, at = (t) => [o.px + ux * t, o.pz + uz * t]
      let prevT = null, gapFrom = null, found = null
      for (let t = 0.0025; t <= o.d && !found; t += 0.0005) { const k = clsAt(...at(t))
        if (k === 'lot') { if (prevT != null && gapFrom == null) gapFrom = t }
        else { if (gapFrom != null) { const w = t - gapFrom; if (w <= 0.005) found = { a: itemAt(...at(prevT)), b: itemAt(...at(t)), w, mid: at((gapFrom + t) / 2 - 0.00025), ti: p.ti, n: c.length }; else break; gapFrom = null } prevT = t } }
      if (found) { const key = [found.a, found.b].join(' | '); pairs.set(key, (pairs.get(key) || 0) + c.length); (exP.get(key) || exP.set(key, []).get(key)).push(found); widths.push(found.w); break } } }
  console.log('≤5 mm gaps by the pieces either side (vertices):'); for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1])) console.log(`   ${k}: ${n} · e.g. ${exP.get(k).sort((a, b) => b.n - a.n).slice(0, 3).map(f => `tile ${f.ti} gap at (${f.mid.map(v => v.toFixed(4))}) ${(f.w * 1000).toFixed(1)} mm`).join(' · ')}`)
  widths.sort((a, b) => a - b); console.log(`   gap width p50 ${(widths[widths.length >> 1] * 1000).toFixed(1)} mm · max ${(widths.at(-1) * 1000).toFixed(1)} mm (sampled at 0.5 mm)`)
}
