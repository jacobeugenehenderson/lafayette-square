// parcel-parts.mjs — what a MULTIPART parcel loses at each reader of `rings[0]` (Boz, 2026-10-18). Read-only, per town:
// the declared raw parcel wells (sources.json) and the emitted map.json (`parcel`, `block`). A parcel's PARTS are its
// rings that lie inside no other ring of it (containment, not winding: Esri promises no order); the rest are holes.
//   node scratch/footprint-census/parcel-parts.mjs [town …]
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import clipperLib from 'clipper-lib'
import { readSources } from '../../cartograph/sources.js'
const { Clipper, Paths, PolyType, ClipType, PolyFillType } = clipperLib
const S = 100, toC = (r) => r.map(p => ({ X: Math.round((p.x ?? p[0]) * S), Y: Math.round((p.z ?? p[1]) * S) }))
const area = (paths) => paths.reduce((a, p) => a + Clipper.Area(p), 0) / (S * S)
const op = (type, a, b) => { const c = new Clipper(); c.AddPaths(a, PolyType.ptSubject, true); c.AddPaths(b, PolyType.ptClip, true); const o = new Paths(); c.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bb = (r) => r.reduce((a, [x, z]) => [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)], [Infinity, Infinity, -Infinity, -Infinity])
export function partsOf(rings) {   // the rings inside no other ring of the parcel (a ring's first vertex tested)
  const R = (rings || []).filter(r => r?.length >= 3)
  return R.filter((r, i) => !R.some((o, j) => j !== i && pip(r[0][0], r[0][1], o) && !pip(o[0][0], o[0][1], r)))
}
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['hipointedemun', 'huron', 'jacksonheights', 'lafayette-square', 'provincetown']
for (const town of towns) {
  const src = readSources(town), mapP = join('cartograph/data', town, 'clean/map.json')
  if (!src.declared || !src.parcels?.length || !existsSync(mapP)) { console.log(`${town}: no declared parcel well or no map.json — not measured`); continue }
  const L = JSON.parse(readFileSync(mapP, 'utf8')), layers = L.layers || L
  const emitted = (layers.parcel || []).map(e => toC(e.ring)), blocks = (layers.block || []).map(e => toC(e.ring)), blockRings = (layers.block || []).map(e => e.ring.map(p => [p.x, p.z]))
  const P = src.parcels.flatMap(w => Object.values(JSON.parse(readFileSync(join('cartograph/data', town, 'raw', w.file), 'utf8')).parcels || {}))
  const t = { parcels: P.length, multipart: 0, extraParts: 0, extraM2: 0, centroidOutside: 0, notFirstLargest: 0, dropped: 0, droppedM2: 0, emittedFirstOnly: 0, bboxShort: 0, otherBlock: 0, noCentroid: 0 }
  const names = []
  for (const p of P) { if (!p.centroid) t.noCentroid++
    const parts = partsOf(p.rings); if (parts.length < 2) continue
    t.multipart++; const first = p.rings[0], extra = parts.filter(r => r !== first); t.extraParts += extra.length; t.extraM2 += extra.reduce((a, r) => a + Math.abs(area([toC(r)])), 0)
    const A = parts.map(r => Math.abs(area([toC(r)]))); if (parts[A.indexOf(Math.max(...A))] !== first) t.notFirstLargest++
    if (p.centroid && !parts.some(r => pip(p.centroid[0], p.centroid[1], r))) t.centroidOutside++
    // serve.js's marker bbox: rings[0]'s box vs every part's
    const b0 = bb(first), ba = parts.map(bb).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
    if (ba.some((v, i) => v !== b0[i])) t.bboxShort++
    // the emitted parcel layer: a part with ground inside the blocks that no emitted parcel ring covers at all
    for (const r of extra) { const inB = op(ClipType.ctIntersection, [toC(r)], blocks); if (!(Math.abs(area(inB)) > 0)) continue
      const cov = op(ClipType.ctIntersection, inB, emitted); if (!(Math.abs(area(cov)) > 0)) { t.dropped++; t.droppedM2 += Math.abs(area(inB)); if (names.length < 5) names.push(p.handle ?? p.address) } }
    // land-use membership (derive's faceParcelMap reads the centroid + rings[0]'s vertices): an extra part in an emitted
    // block that neither reaches — the blocks stand in for the faces, which are not emitted
    const reached = new Set(); blockRings.forEach((br, i) => { if ((p.centroid && pip(p.centroid[0], p.centroid[1], br)) || first.some(([x, z]) => pip(x, z, br))) reached.add(i) })
    if (extra.some(r => blockRings.some((br, i) => !reached.has(i) && r.some(([x, z]) => pip(x, z, br))))) t.otherBlock++ }
  console.log(`${town}: parcels ${t.parcels} · multipart ${t.multipart} (extra parts ${t.extraParts}, ${t.extraM2.toFixed(0)} m²; rings[0] not the largest part ${t.notFirstLargest}) · centroid in no part ${t.centroidOutside} · no centroid ${t.noCentroid}`)
  console.log(`   emitted parcel layer: extra parts with block ground and NO emitted cover ${t.dropped} (${t.droppedM2.toFixed(0)} m² of block ground)${names.length ? ` — e.g. ${names.join(', ')}` : ''} · serve.js bbox misses a part ${t.bboxShort} · an extra part in a block rings[0]/centroid never reach (land-use membership) ${t.otherBlock}`)
}
