// claims-every-piece-takes-its-own-land-use.mjs
//
// ⭐⭐ THE INVARIANT (Jacob, 2026-10-04 — `docs/briefs/BRIEF-land-use-per-piece-and-the-control.md`):
// every PIECE of a tile's inner area (`iA`) takes its own land use — the class covering most of IT —
// and a piece nothing covers is `underived`, by name, never a class rolled from a hash.
//
// ⛔⛔ WHY. A tile used to take ONE class from ONE interior point of its ring, and every piece took
// it. MEASURED: Huron's motorway median (a 3.44 ha piece of tile 63, joined to a 186 ha block through
// a 1–10 mm throat) grew crop; downtown Huron (tile 24, five pieces, 230 ha) was painted
// `residential` while 98% of it lay under a face voted `industrial` — the point had landed on road.
//
// ⭐ HOW IT JUDGES, WITHOUT RESTATING THE MINT. The mint votes by exact area (`landUseByPiece`); this
// check samples each piece on its OWN grid (step = the piece's own size / 20, no metres typed here)
// and asks the voted faces (`ribbons.faces`) what lies under each sample, smallest face first.
// ⛔ A piece FAILS when its minted class covers NONE of its own ground. That is the shape a shared
// point leaves — the piece wears a class measured somewhere else — and it needs no threshold.
// A piece whose class covers some but not most of its ground is LISTED (sampling vs exact area can
// disagree near a tie), not failed.
// ⭐ The mint's own rulings are not judged: a verge/JR block is `verge` with no land-use choice, and
// an AUTHORED class (`blockLandUse`) is the product (Layer 0 q3) — both are counted and named.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. in `landUseByPiece`, vote the whole tile once and hand every piece that answer
//      (the single point restored)                                          → Huron tile 63's median
//   2. return `pickLuFromHash`'s kind of answer for an uncovered piece instead of `underived`
//      (any class not under the piece)                                      → the hermetic part
//   3. vote each piece by ONE interior point instead of by area             → the hermetic part
//   4. paint a piece WHOLE in its label, ignoring its evidence           → the hermetic part
//   5. layer the LARGER polygon over the smaller                          → the hermetic part
//   6. layer parcels OVER the OSM polygons                                → the hermetic part
//   7. hand a parcel-class overlap to the first class                     → the hermetic part
//   8. label every piece of a tile with its largest piece's label          → the per-piece leg (evidence pours)
//
// ⭐⭐ AND EACH PIECE IS PAINTED BY ITS EVIDENCE, POLYGON BY POLYGON (Jacob, 2026-10-05): the pour lays out
// disjoint evidence (`derive.js` `layerLandEvidence`: OSM polygons — cover over untyped over management, smaller
// over larger — then readable parcels; a cross-class parcel overlap is nobody's), and a piece paints each region
// in its class and `underived` (grass) elsewhere. Crop rows only on a mapped field: a farm PARCEL paints grass.
// Per town, ⛔ FAILS when a class's paint lies outside that class's own evidence by more than Clipper's 1 mm
// lattice × the paint's perimeter. A town poured before the evidence is NOT MEASURED on this leg, and says so.
// ⭐ The HERMETIC part runs first and needs no town, so mutation 2 cannot pass vacuously on a town
// where every piece happens to lie under some face (measured: none of the five is wholly uncovered).
//
//   node checks/claims-every-piece-takes-its-own-land-use.mjs [scene ...]
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { piecesOfIA, tilePieceLus, landUseByPiece, rekeyByPiece, prepareEvidence, evidenceByPiece, CROP_LU, UNDERIVED_LU } from '../src/lib/tileGround.js'
import { layerLandEvidence } from '../cartograph/derive.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'

const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bbOf = r => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]; return b }

let failed = false, measured = 0
const cropUnmeasured = []   // towns whose pour predates the land evidence
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }
// ── HERMETIC: the mint itself, on pieces with known ground ───────────────────────
{
  const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
  const face = (use, ring) => ({ use, ring, bb: bbOf(ring), area: Math.abs(A(ring)) })
  console.log('hermetic — landUseByPiece on synthetic pieces:')
  // two pieces of one tile: a big field and a strip beside it under a different face
  const iA = [box(0, 0, 100, 100), box(110, 0, 120, 100)]
  const faces = [face('agricultural', box(-5, -5, 105, 105)), face('verge', box(105, -5, 125, 105))]
  const got = landUseByPiece(iA, { faces })
  say(got[0] === 'agricultural' && got[1] === 'verge', `each piece takes the face under IT — got ${got.join(' / ')}`)
  // a piece no face reaches is underived, by name
  const lone = landUseByPiece([box(500, 500, 510, 510)], { faces })
  say(lone[0] === UNDERIVED_LU, `a piece no face covers is \`${UNDERIVED_LU}\`, never a rolled class — got ${lone[0]}`)
  // by AREA, not by a point: a piece 70% under one face and 30% under another takes the 70%
  const split = landUseByPiece([box(0, 0, 100, 100)], { faces: [face('commercial', box(-5, -5, 30, 105)), face('residential', box(30, -5, 105, 105))] })
  say(split[0] === 'residential', `a piece takes the class covering MOST of it (70% residential vs 30% commercial) — got ${split[0]}`)
  // the old smallest-face rule survives as area: a small face inside a big one keeps its own ground
  const nest = landUseByPiece([box(0, 0, 100, 100)], { faces: [face('park', box(-5, -5, 105, 105)), face('parking', box(0, 0, 100, 60))] })
  say(nest[0] === 'parking', `a smaller face nested in a bigger one keeps its ground (60% parking inside a park face) — got ${nest[0]}`)
  // a hole is not a piece and takes no class
  const holed = landUseByPiece([box(0, 0, 100, 100), box(40, 40, 60, 60).reverse()], { faces })
  say(holed[0] === 'agricultural' && holed[1] === null, `a hole takes no class — got ${holed.join(' / ')}`)
  // ── the land is painted by its evidence: a field on the west 40%, house lots on the east 30%, a farm parcel between
  const ar = (rs) => Math.abs((rs || []).reduce((t, r) => t + A(r), 0))
  const ev = prepareEvidence(layerLandEvidence(
    [{ lu: 'agricultural', tag: 'landuse:farmland', ring: box(-10, -10, 40, 110).map(([x, z]) => ({ x, z })) }],
    [{ lu: 'residential', rings: [box(70, -10, 110, 110)] }, { lu: 'agricultural', rings: [box(40, -10, 55, 110)] }]).evidence)
  const st = { iA: [box(0, 0, 100, 100)], luByPiece: ['agricultural'] }
  st.evidenceByPiece = evidenceByPiece(st.iA, ev, null)
  const k = rekeyByPiece(st, { '\u0000own': [box(0, 0, 100, 100)] })
  say(Math.abs(ar(k.agricultural) - 4000) < 1 && Math.abs(ar(k.residential) - 3000) < 1 && Math.abs(ar(k[UNDERIVED_LU]) - 3000) < 1,
    `one piece paints its field crop (4,000 m²), its house lots residential (3,000) and the rest grass incl. a farm PARCEL (3,000) — got ${Math.round(ar(k.agricultural))} / ${Math.round(ar(k.residential))} / ${Math.round(ar(k[UNDERIVED_LU]))}`)
  // ── the layering
  const sq = (x0, z0, x1, z1) => box(x0, z0, x1, z1).map(([x, z]) => ({ x, z }))
  // even-odd across a region's rings: a point in a hole is not in the region
  const classAt = (E, x, z) => E.evidence.filter(e => e.rings.filter(r => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }).length % 2 === 1).map(e => e.lu)
  const L1 = layerLandEvidence([{ lu: 'park', tag: 'leisure:park', ring: sq(0, 0, 100, 100) }, { lu: 'recreation', tag: 'natural:wood', ring: sq(20, 20, 40, 40) }], [])
  say(classAt(L1, 30, 30).join() === 'recreation' && classAt(L1, 80, 80).join() === 'park', `ground COVER (a wood) paints over a MANAGEMENT boundary (a park) only where it lies — got ${classAt(L1, 30, 30)} / ${classAt(L1, 80, 80)}`)
  const L2 = layerLandEvidence([{ lu: 'residential', tag: 'landuse:residential', ring: sq(0, 0, 100, 100) }, { lu: 'commercial', tag: 'landuse:retail', ring: sq(10, 10, 20, 20) }], [])
  say(classAt(L2, 15, 15).join() === 'commercial', `the SMALLER polygon paints over the larger of the same kind — got ${classAt(L2, 15, 15)}`)
  const L3 = layerLandEvidence([{ lu: 'park', tag: 'leisure:park', ring: sq(0, 0, 50, 50) }], [{ lu: 'residential', rings: [box(0, 0, 100, 100)] }])
  say(classAt(L3, 25, 25).join() === 'park' && classAt(L3, 75, 75).join() === 'residential', `an OSM polygon paints over a parcel; the parcel paints the rest — got ${classAt(L3, 25, 25)} / ${classAt(L3, 75, 75)}`)
  const L4 = layerLandEvidence([], [{ lu: 'residential', rings: [box(0, 0, 60, 100)] }, { lu: 'commercial', rings: [box(40, 0, 100, 100)] }])
  say(classAt(L4, 50, 50).length === 0 && Math.abs(L4.parcelConflictM2 - 2000) < 1, `where parcels of different classes overlap, the ground is nobody's and is COUNTED (2,000 m²) — got [${classAt(L4, 50, 50)}] · ${Math.round(L4.parcelConflictM2)} m²`)
}

const want = process.argv.slice(2)
for (const scene of (want.length ? want : feedScenes())) {
  const f = feed(scene); if (!f) continue
  const prev = console.warn; console.warn = () => {}
  let G; try { G = buildProto(f, { protoArtifact: true, protoProducer: true }) } finally { console.warn = prev }
  const T = G.protoShapeTiles
  if (!T?.length) { console.log(`⛔ ${scene}: no protoShapeTiles — NOT measured`); continue }
  measured++
  const faces = (f.ribbons.faces || []).filter(x => x?.ring?.length >= 3 && x.use).map(x => ({ use: x.use, ring: x.ring, bb: bbOf(x.ring), a: Math.abs(A(x.ring)) }))
  // ⭐ The ground is what the PAINTER reads: the land evidence when the pour carries it (each piece's label is the
  // evidence class holding most of it), else the face votes. ⛔ Judging an evidence-labelled piece by the coarser
  // face votes reported Provincetown's park/residential labels as wrong while every class painted on its own
  // evidence (2026-10-05) — the instrument, not the map.
  const evGroups = Array.isArray(f.ribbons.landEvidence) ? prepareEvidence(f.ribbons.landEvidence) : null
  const evAt = (x, z) => { for (const g of evGroups) { let n = 0; for (const q of g.rings) if (x >= q.bb[0] && x <= q.bb[1] && z >= q.bb[2] && z <= q.bb[3] && pip(x, z, q.r)) n++; if (n % 2) return g.lu } return UNDERIVED_LU }
  const faceAt = (x, z) => { let best = null, ba = Infinity; for (const g of faces) if (x >= g.bb[0] && x <= g.bb[1] && z >= g.bb[2] && z <= g.bb[3] && g.a < ba && pip(x, z, g.ring)) { ba = g.a; best = g.use } return best ?? UNDERIVED_LU }
  const useAt = evGroups ? evAt : faceAt
  const authored = new Set(Object.values(f.blockLandUse || {}))
  let pieces = 0, split = 0, mixed = 0, ruled = 0, byAuthor = 0
  const bad = [], minority = []
  T.forEach((t, ti) => {
    const lus = tilePieceLus(t), P = piecesOfIA(t.iA)
    if (P.length > 1) { split++; if (new Set(P.map(p => lus[p.i])).size > 1) mixed++ }
    for (const p of P) {
      pieces++
      const lu = lus[p.i]
      if (t.blockClass === 'verge' || t.blockClass === 'jr') { ruled++; continue }
      if (authored.has(lu)) { byAuthor++; continue }
      const b = bbOf(p.outer), step = Math.sqrt(A(p.outer)) / 20, c = {}; let n = 0
      for (let x = b[0] + step / 2; x <= b[1]; x += step) for (let z = b[2] + step / 2; z <= b[3]; z += step) {
        if (!pip(x, z, p.outer) || p.holes.some(h => pip(x, z, h))) continue
        n++; const u = useAt(x, z); c[u] = (c[u] || 0) + 1
      }
      if (!n) continue
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]
      const ha = (A(p.outer) / 1e4).toFixed(3)
      if (!c[lu]) bad.push(`tile ${ti} piece #${p.i} (${ha} ha) is painted ${lu}, which covers NONE of it — its ground is ${Object.entries(c).map(([k, v]) => `${k} ${Math.round(100 * v / n)}%`).join(' · ')}`)
      else if (top[0] !== lu) minority.push(`tile ${ti} piece #${p.i} (${ha} ha) ${lu} ${Math.round(100 * c[lu] / n)}% vs ${top[0]} ${Math.round(100 * top[1] / n)}% by sampling`)
    }
  })
  console.log(`\n${scene}: ${T.length} tiles · ${pieces} pieces · ${split} split tile(s), ${mixed} painted in more than one class · ${ruled} verge/JR piece(s) and ${byAuthor} authored piece(s) not judged`)
  console.log(`  ${bad.length ? '⛔' : '✅'} ${bad.length} piece(s) wear a class that covers none of their own ground`)
  for (const s of bad.slice(0, 12)) console.log(`     ${s}`)
  if (minority.length) { console.log(`  · ${minority.length} piece(s) where sampling and the exact vote disagree (near a tie — listed, not failed):`); for (const s of minority.slice(0, 6)) console.log(`     ${s}`) }
  if (bad.length) failed = true
  // ── each class paints only inside its own evidence ──
  if (!Array.isArray(f.ribbons.landEvidence)) cropUnmeasured.push(scene), console.log(`  ⛔ NOT MEASURED — painted by evidence: this pour carries no land evidence (\`ribbons.landEvidence\`); re-pour ${scene}. Not a pass.`)
  else {
    const groups = prepareEvidence(f.ribbons.landEvidence), worst = []
    for (const [lu, paint] of Object.entries(G.luByClass)) {
      if (lu === UNDERIVED_LU || lu === 'verge' || authored.has(lu)) continue          // the remainder · the mint's ruling · the operator's
      const region = groups.filter(g => g.paint === lu).flatMap(g => g.rings.map(x => x.r))
      const per = paint.reduce((t, r) => { let q = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) q += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return t + q }, 0)
      const outside = Math.abs(differenceRings(paint, region).reduce((t, r) => t + A(r), 0))
      if (outside > per * 0.001) worst.push(`${lu} ${Math.round(outside)} m²`)
    }
    console.log(`  ${worst.length ? '⛔' : '✅'} paint outside its own evidence: ${worst.length ? worst.join(' · ') : 'none, every class'} · ${f.ribbons.landEvidence.length} evidence region(s)`)
    if (worst.length) failed = true
  }
}
if (!measured) { console.log('\n⛔ NOT MEASURED — no scene could be built.'); process.exit(2) }
if (failed) { console.log('\n⛔ RED'); process.exit(1) }
if (cropUnmeasured.length) { console.log(`\n⛔ NOT FULLY MEASURED — every piece wears a class from its own ground, but painting-by-evidence could not be measured on: ${cropUnmeasured.join(', ')} (no land evidence in the pour). Re-pour them.`); process.exit(2) }
console.log('\n✅ GREEN — every piece wears a class from its own ground, and every class paints only on its own evidence.')
process.exit(0)
