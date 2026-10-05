// Forensic (Sward): replay the land-use decision for Huron tiles. Two stages, both re-run from source:
//  (A) derive.js votes each polygonized FACE (ribbons.faces) by OSM coverage → face.use
//  (B) tileGround.js luForRing gives a TILE the use of the smallest face containing ONE interior point.
// For each tile: OSM cover of the tile ring by tag (exact Clipper overlap via luCoverageForFace, plus
// uncovered area by 5 m sampling), the faces it overlaps and their use, and which face decided it.
// Usage: CARTOGRAPH_SCENE=huron node scratch/huron-median-lu/lu-vote.mjs 6 63 66 108
import fs from 'fs'
import { OSM_TO_LU, OSM_LU_KIND, luCoverageForFace, luWinnerFromCoverage } from '../../cartograph/derive.js'
import { unreadableFace } from '../../cartograph/osm-vocabulary.mjs'
// OSM_LU_DECLARED is function-local in derive.js — parsed from its source, not restated
const _src = fs.readFileSync('cartograph/derive.js', 'utf8'), _m = _src.slice(_src.indexOf('const OSM_LU_DECLARED = {')); const OSM_LU_DECLARED = Object.fromEntries([..._m.slice(0, _m.indexOf('\n  }')).matchAll(/'([a-z_]+:[a-z_]+)'/g)].map(x => [x[1], 1]))
const s = JSON.parse(fs.readFileSync('public/baked/huron/shape.json'))
const rib = JSON.parse(fs.readFileSync('cartograph/data/huron/clean/ribbons.json'))
const osm = JSON.parse(fs.readFileSync('cartograph/data/huron/raw/osm.json'))
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x ?? r[j][0]) * (r[i].z ?? r[i][1]) - (r[i].x ?? r[i][0]) * (r[j].z ?? r[j][1]); return a / 2 }
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i].x ?? r[i][0], zi = r[i].z ?? r[i][1], xj = r[j].x ?? r[j][0], zj = r[j].z ?? r[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
function ringInteriorPoint(r) { // copied from src/lib/tileGround.js
  let cx = 0, cy = 0; for (const p of r) { cx += p[0]; cy += p[1] }; cx /= r.length; cy /= r.length
  if (pip(cx, cy, r)) return [cx, cy]
  const a = r[0], b = r[1 % r.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  for (let i = 0; i < r.length; i++) { const t = i / r.length, px = mx + (cx - mx) * t, py = my + (cy - my) * t; if (pip(px, py, r)) return [px, py] }
  return [cx, cy]
}
// the same ingest as derive.js (readable + compound; declared skipped; unmapped recorded)
const polys = [], unmapped = []
for (const [cat, key] of [['landuse', 'landuse'], ['leisure', 'leisure'], ['natural', 'natural'], ['amenity', 'amenity']])
  for (const f of (osm.ground?.[cat] || [])) {
    const sub = f.tags?.[key]; if (!sub) continue
    const u = unreadableFace(f); const tag = `${cat}:${sub}`
    if (u && u !== 'compound') { unmapped.push({ tag: `${u}:${tag}`, f }); continue }
    if (OSM_LU_DECLARED[tag]) continue
    const lu = OSM_TO_LU[tag]; if (!lu) { unmapped.push({ tag, f }); continue }
    if (!f.coords || f.coords.length < 3) continue
    const holes = (f.holes || []).filter(h => Array.isArray(h) && h.length >= 3)
    let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const p of f.coords) { b[0] = Math.min(b[0], p.x); b[1] = Math.max(b[1], p.x); b[2] = Math.min(b[2], p.z); b[3] = Math.max(b[3], p.z) }
    polys.push({ lu, tag, ring: f.coords, holes, bb: b, id: f.osmId ?? f.id, name: f.tags?.name })
  }
const faces = (rib.faces || []).filter(f => f?.ring?.length >= 3 && f.use)
const STEP = 5
for (const ti of process.argv.slice(2).map(Number)) {
  const t = s.tiles[ti], area = Math.abs(A(t.ring))
  console.log(`\n══ tile ${ti}: baked lu=${t.lu}, ring ${(area / 1e4).toFixed(2)} ha`)
  // (1) OSM coverage of the whole tile ring (what a vote over the TILE would see)
  const cov = luCoverageForFace(t.ring, polys)
  console.log(`  OSM cover of the tile ring (exact overlap, per tag; may overlap each other):`)
  for (const [tag, v] of Object.entries(cov).sort((a, b) => b[1].area - a[1].area)) console.log(`     ${tag.padEnd(34)} → ${v.lu.padEnd(13)} ${(v.area / 1e4).toFixed(2).padStart(7)} ha  ${(100 * v.area / area).toFixed(1).padStart(5)}%  kind=${OSM_LU_KIND[tag] ?? '-'}`)
  console.log(`     ⇒ a coverage vote over the TILE ring would pick: ${luWinnerFromCoverage(cov)}`)
  // uncovered (no mapped LU polygon), and covered only by unmapped tags
  let n = 0, none = 0, unm = {}
  let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const p of t.ring) { b[0] = Math.min(b[0], p[0]); b[1] = Math.max(b[1], p[0]); b[2] = Math.min(b[2], p[1]); b[3] = Math.max(b[3], p[1]) }
  for (let x = b[0]; x <= b[1]; x += STEP) for (let z = b[2]; z <= b[3]; z += STEP) {
    if (!pip(x, z, t.ring)) continue; n++
    const inP = polys.some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && pip(x, z, o.ring) && !o.holes.some(h => pip(x, z, h)))
    if (!inP) { none++; for (const u of unmapped) if (u.f.coords?.length >= 3 && pip(x, z, u.f.coords)) { unm[u.tag] = (unm[u.tag] || 0) + 1; break } }
  }
  console.log(`  covered by NO mapped OSM LU polygon: ${(none * STEP * STEP / 1e4).toFixed(2)} ha (${(100 * none / n).toFixed(1)}%)` + (Object.keys(unm).length ? `; of that, under an UNMAPPED/unreadable tag: ${Object.entries(unm).map(([k, c]) => `${k} ${(c * STEP * STEP / 1e4).toFixed(2)} ha`).join(', ')}` : ''))
  // (2) faces overlapping the tile, by sampling
  const fc = {}
  for (let x = b[0]; x <= b[1]; x += STEP * 2) for (let z = b[2]; z <= b[3]; z += STEP * 2) {
    if (!pip(x, z, t.ring)) continue
    let best = -1, ba = Infinity
    faces.forEach((f, i) => { if (pip(x, z, f.ring)) { const a = Math.abs(A(f.ring)); if (a < ba) { ba = a; best = i } } })
    fc[best] = (fc[best] || 0) + 1
  }
  const [px, pz] = ringInteriorPoint(t.ring)
  let dec = -1, da = Infinity; faces.forEach((f, i) => { if (pip(px, pz, f.ring)) { const a = Math.abs(A(f.ring)); if (a < da) { da = a; dec = i } } })
  console.log(`  ribbons.faces under the tile (smallest containing face, 10 m samples):`)
  for (const [fi, c] of Object.entries(fc).sort((a, b) => b[1] - a[1])) { const f = faces[fi]; console.log(`     face ${String(fi).padStart(3)} use=${(f?.use ?? 'NONE').padEnd(13)} face ${f ? (Math.abs(A(f.ring)) / 1e4).toFixed(2) : '-'} ha · ${(c * 100 / 1e4).toFixed(2)} ha of this tile${+fi === dec ? '   ⇐ holds ringInteriorPoint → DECIDES the tile' : ''}`) }
  console.log(`  ringInteriorPoint = (${px.toFixed(0)}, ${pz.toFixed(0)}) → face ${dec} use=${faces[dec]?.use}`)
  if (dec >= 0) {
    const fcov = luCoverageForFace(faces[dec].ring, polys), fa = Math.abs(A(faces[dec].ring))
    console.log(`  the deciding face's own vote (${(fa / 1e4).toFixed(2)} ha):`)
    for (const [tag, v] of Object.entries(fcov).sort((a, b) => b[1].area - a[1].area)) console.log(`     ${tag.padEnd(34)} → ${v.lu.padEnd(13)} ${(v.area / 1e4).toFixed(2).padStart(7)} ha  ${(100 * v.area / fa).toFixed(1).padStart(5)}%  kind=${OSM_LU_KIND[tag] ?? '-'}`)
    console.log(`     ⇒ luWinnerFromCoverage: ${luWinnerFromCoverage(fcov)}`)
  }
}
