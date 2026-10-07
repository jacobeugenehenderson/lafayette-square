#!/usr/bin/env node
// ⭐⭐ EVERY JUNCTION CORNER'S CURB CUTS COME FROM SOMEWHERE NAMED — AND EVERY CROSSWALK ENDS AT A CURB CUT ON BOTH SIDES — `BRIEF-corner-ramps-and-kerb §0a`, `cartograph/curb-cut-norm.mjs`.
// Builds Section's FILL for a scene (the painter is live) and reads the curb cuts it painted off the painter's own tally:
// junction corners by the rung their style came from (authored · scene · state · kit), how many have NO source, and
// every curb-cut record's corner. It restates no rule.
//
//   node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene>            off the scene's frozen ①
//   node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene> --live     off a live mint (before a re-pour)
//   node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene> --live --selftest
//        the painter under trial norms + an authored leg, on that scene's real corners
//
// ⛔ FAILS when: a curb cut sits on a corner that is not a junction · a crosswalk's two ends are not two curb cuts at one
// junction, beside one chain, on its two sides · junction corners on tiles poured before the norm was
// frozen (`noNorm` — re-pour) · an authored style is invalid · the selftest disagrees. `noSource` (norm 'none', nothing
// authored or recorded) is printed loud and is NOT a failure — it is the ruled default, made visible.
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
import { buildCurbCutEvidence, buildCrosswalkEvidence, ROAD } from '../cartograph/curb-cut-evidence.mjs'
import { styleFromEvidence, landCurbCutEvidence, landCrosswalkEvidence } from '../src/lib/tileGround.js'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const args = process.argv.slice(2)
const scene = args.find(a => !a.startsWith('--')) || 'lafayette-square'
const live = args.includes('--live')
const f = feed(scene); if (!f) process.exit(1)
if (live) delete f.ribbons.protopolygon
// a crosswalk pair is sound iff both ends are curb cuts at the same node, serving the same chain from its two sides
// a far-kerb crosswalk (b = null) is sound iff its one end is a cut serving that chain
const badPairs = (r) => (r.crosswalkPairs || []).filter(([a, b, chain]) => {
  const A = r.curbCutRecs[a], B = b == null ? null : r.curbCutRecs[b]
  if (b == null) return !A || !(A.serves || []).some(x => x.leg.skelId === chain)
  if (!A || !B || A.node == null || A.node !== B.node) return true
  const sa = (A.serves || []).find(x => x.leg.skelId === chain), sb = (B.serves || []).find(x => x.leg.skelId === chain)
  return !sa || !sb || sa.leg.side === sb.leg.side
}).length
// `corners` = the corner map (`cornerCornerRadiusOverrides`: radius · existence · curb-cut style, one entry per corner key)
const run = (norm, corners = f.cornerCornerRadiusOverrides, evidence, crossings) => {
  const rb = { ...f.ribbons, ...(norm === undefined ? {} : { curbCutNorm: norm }), ...(evidence === undefined ? {} : { curbCutEvidence: evidence }),
               ...(crossings === undefined ? {} : { crosswalkEvidence: crossings }) }
  return buildProto({ ...f, ribbons: rb, cornerCornerRadiusOverrides: corners }, { quiet: true, protoProducer: true })
}
// the corner map with one corner's `cut` set (null = cleared), every other entry and field kept
const withCut = (map, key, cut) => { const m = { ...(map || {}) }, cur = m[key], e = cur == null ? {} : typeof cur === 'object' ? { ...cur } : { r: cur }
  if (cut == null) delete e.cut; else e.cut = cut
  if (Object.keys(e).length) m[key] = Object.keys(e).length === 1 && 'r' in e ? e.r : e; else delete m[key]; return m }

if (args.includes('--selftest')) {
  const dims = { width: 1.5, warningDepth: 0.6 }
  const cw = { style: 'lines', width: 3, line: 0.3, farKerb: 'none', source: 'trial' }, cwNone = { style: 'none', source: 'kit' }
  // the NORM trials run with fetched-but-empty kerb evidence: a town whose real kerb records decide some corners would
  // otherwise move every per-junction count below by however many it decides — those trials measure the norm alone
  // — and with the town's AUTHORED curb cuts lifted out (every other authored value kept): an authored corner is the
  // product, not noise, but it is not the norm, and these rows count the norm
  const noKerbs = { fetched: true, records: [] }
  let unCut = f.cornerCornerRadiusOverrides || {}
  for (const k of Object.keys(unCut)) unCut = withCut(unCut, k, null)
  const K = run({ style: 'none', source: 'kit', crosswalks: cw }, unCut, noKerbs).curbCutTally || {}
  const Kc = run({ style: 'none', source: 'kit', crosswalks: cw }, unCut, noKerbs).crosswalkTally || {}
  const Dg = run({ style: 'diagonal', ...dims, source: 'trial', crosswalks: cwNone }, unCut, noKerbs)
  const Pp = run({ style: 'perpendicular', ...dims, source: 'trial', crosswalks: cw }, unCut, noKerbs)
  const J = K.junction || 0
  // an authored corner on a town whose norm is 'none' but carries the jurisdiction's sizes: that corner gets curb cuts
  const oneKey = (Dg.curbCutCorners || []).find(c => c.key)?.key
  const authored = oneKey ? run({ style: 'none', ...dims, source: 'trial' }, withCut(unCut, oneKey, 'diagonal'), noKerbs).curbCutTally || {} : null
  // ⭐ THE EVIDENCE RUNG, on this town's real crossings: trial kerb nodes at both END vertices of every crossing way
  // (and three on a crossing's road node), bound and landed by the real code. Written to a temp file, never the town.
  const raw = `cartograph/data/${scene}/raw`, osm = JSON.parse(readFileSync(`${raw}/osm.json`, 'utf8')).ground.highway
  const crossings = osm.filter(w => w.tags?.footway === 'crossing' && w.coords.length >= 3)
  const onRoad = new Set(osm.filter(w => ROAD.has(w.tags?.highway)).flatMap(w => w.coords.map(c => `${c.lon},${c.lat}`)))
  const trial = (kind) => { const d = mkdtempSync(join(tmpdir(), 'kerbs-')), p2 = join(d, 'osm_kerbs.json'), nodes = []
    for (const w of crossings) for (const c of [w.coords[0], w.coords[w.coords.length - 1]]) nodes.push({ osmId: nodes.length, tags: { barrier: 'kerb', kerb: kind }, lon: c.lon, lat: c.lat })
    for (const c of crossings.map(w => w.coords.slice(1, -1).filter(c => onRoad.has(`${c.lon},${c.lat}`))).filter(r => r.length === 1).map(r => r[0]).slice(0, 3))
      nodes.push({ osmId: nodes.length, tags: { highway: 'crossing', kerb: kind }, lon: c.lon, lat: c.lat })
    writeFileSync(p2, JSON.stringify({ fetchedAt: 'trial', nodes }))
    return buildCurbCutEvidence({ osmPath: `${raw}/osm.json`, kerbsPath: p2, skeletonPath: `cartograph/data/${scene}/clean/skeleton.json` }) }
  const Elow = trial('lowered'), Eup = trial('raised')
  const none = buildCurbCutEvidence({ osmPath: `${raw}/osm.json`, kerbsPath: join(tmpdir(), 'no-such-kerbs.json'), skeletonPath: `cartograph/data/${scene}/clean/skeleton.json` })
  const diag = { style: 'diagonal', ...dims, source: 'trial', crosswalks: cwNone }
  const Lo = run(diag, undefined, Elow).curbCutTally || {}, Up = run(diag, undefined, Eup).curbCutTally || {}
  // the landing on its own, on clean copies of this town's tiles: every landing is OWNED by the road it crosses, and the
  // ownership guard is seen to FAIL: the same records claiming a road that does not exist must all be refused
  const tiles = structuredClone(run(diag).protoShapeTiles || []).map(t => { delete t.curbCutEvidence; return t })
  const L = landCurbCutEvidence(tiles, Elow).census
  const tiles2 = structuredClone(tiles).map(t => { delete t.curbCutEvidence; return t })
  const Lx = landCurbCutEvidence(tiles2, { ...Elow, records: Elow.records.map(r => ({ ...r, crossed: ['__no_such_road__'] })) }).census
  const owned = tiles.flatMap(t => (t.curbCutEvidence || []).map(x => (t.junctions?.[x.jx]?.legs || []).some(l => x.crossed.includes(l?.skelId))))
  const sfe = (xs) => styleFromEvidence(xs.map(([f2, kind = 'lowered']) => ({ f: f2, kind })))
  // ⭐ CROSSWALKS: square across the street, centred on the cut, the paint following the corner, a T's far kerb by norm
  const byCorner = (farKerb) => ({ style: 'byCorner', farKerb, source: 'trial', byCorner: { diagonal: { style: 'lines', width: 3, line: 0.3 }, perpendicular: { style: 'continental', width: 3, line: 0.6 } } })
  const CX = buildCrosswalkEvidence({ osmPath: `cartograph/data/${scene}/raw/osm.json`, skeletonPath: `cartograph/data/${scene}/clean/skeleton.json` })
  const DgC = run({ style: 'diagonal', ...dims, source: 'trial', crosswalks: byCorner('cut') }, undefined, undefined, CX)
  const DgX = run({ style: 'diagonal', ...dims, source: 'trial', crosswalks: byCorner('cut') }, undefined, undefined, { records: [] })
  const DgN = run({ style: 'diagonal', ...dims, source: 'trial', crosswalks: byCorner('none') })
  const PpB = run({ style: 'perpendicular', ...dims, source: 'trial', crosswalks: byCorner('none') })
  const area = (rs) => (rs || []).reduce((t, r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p2 = r[i], q2 = r[(i + 1) % r.length]; a += p2[0] * q2[1] - q2[0] * p2[1] } return t + Math.abs(a) / 2 }, 0)
  const square = (R) => (R.crosswalkPairs || []).every(([, , , A, B, d]) => { const L = Math.hypot(B[0] - A[0], B[1] - A[1]); return L > 0 && Math.abs((B[0] - A[0]) * d[0] + (B[1] - A[1]) * d[1]) <= 1e-6 * L })
  // EVERY crosswalk holds its apex: cut-centred by construction, a recorded station only when it does (item 9)
  const inside = ([a, b, , A, , d]) => [DgC.curbCutRecs[a], DgC.curbCutRecs[b]].every(rc => Math.abs((rc.at[0] - A[0]) * d[0] + (rc.at[1] - A[1]) * d[1]) <= 1.5 + 1e-9)
  const pairs2 = (DgC.crosswalkPairs || []).filter(p2 => p2[1] != null)
  const apexInside = pairs2.every(inside), recordedApexOutside = (DgC.crosswalkTally || {}).evidenceApexOutside || 0
  const xt = structuredClone(DgC.protoShapeTiles || []).map(t => { delete t.crosswalkEnds; return t }), XL = landCrosswalkEvidence(xt, CX).census
  const xEnds = xt.flatMap(t => t.crosswalkEnds || []), xById = new Map(); for (const x of xEnds) (xById.get(x.osmId) || xById.set(x.osmId, []).get(x.osmId)).push(x)
  const XT = DgX.crosswalkTally || {}
  const xs = structuredClone(DgC.protoShapeTiles || []).map(t => { delete t.crosswalkEnds; return t })
  const XS = landCrosswalkEvidence(xs, { records: CX.records.map(r => ({ ...r, rays: [r.rays[0], r.rays[0]] })) }).census
  const CT = DgC.crosswalkTally || {}, CN = DgN.crosswalkTally || {}, CP = PpB.crosswalkTally || {}
  // ⭐ STEP 4 — THE CORNER GESTURE'S DATA: a record per junction corner, carrying its corner key; a write by that key
  // draws that corner's style there and nowhere else (one corner, one entry — `claims-one-corner-write-moves-one-corner`)
  const corners = Dg.curbCutCorners || [], c0 = corners.find(c => c.key)
  const noneDims = { style: 'none', ...dims, source: 'trial', crosswalks: cwNone }
  const Same = c0 ? run(noneDims, withCut(unCut, c0.key, 'perpendicular'), noKerbs) : null
  const authoredAt = (R) => (R?.curbCutRecs || []).filter(r => r.source === 'authored')
  const keyOfRec = (R, r) => R.protoShapeTiles?.[r.tile]?.iaArcKey?.[r.si]?.[r.arc] ?? null
  const streetIds = new Set((f.ribbons.streets || []).map(st2 => st2.skelId))
  const streetLegs = (R, c) => (R.protoShapeTiles?.[c.tile]?.junctions?.[c.junction]?.legs || []).every(l => l && streetIds.has(l.skelId))
  // ⭐ THE PERPENDICULAR FILL, read off what was painted: just behind each cut, up its landing past the curb and the cut's
  // own depth, is WALK — the landing reaches the kerb — never lawn; and at each corner's wedge (`wedgeAt`, where the
  // corner has room for one) is lawn where the wedge is lawn and walk where it is concrete. A point painted neither is
  // off the drawing (the disc, or the curb) and skipped.
  const cwOf = JSON.parse(readFileSync(`public/looks/${f.look}/design.json`, 'utf8')).curbWidth
  const paintAt = (R) => { const idx = (rs) => (rs || []).map(r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return { r, x0, x1, z0, z1 } })
    const pin = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
    const inAny = (I, [x, z]) => I.some(b => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && pin(x, z, b.r))
    const W = idx(R.sidewalk), T = idx(Object.values(R.treelawnByLu || {}).flat())
    return (P) => inAny(W, P) ? 'walk' : inAny(T, P) ? 'lawn' : null }
  const ppAt = paintAt(Pp), behind = [], behindBad = []
  for (const r of Pp.curbCutRecs || []) { if (r.style !== 'perpendicular') continue
    const k = cwOf + dims.warningDepth + 0.15, v = r.along; if (!v) { behind.push('no landing direction'); continue }
    const m = ppAt([r.at[0] + v[0] * k, r.at[1] + v[1] * k]); if (m) behind.push(m); if (m && m !== 'walk') behindBad.push(r.at) }
  const apex = { lawn: [], concrete: [] }
  for (const c of Pp.curbCutCorners || []) { if (!c.wedge || !c.wedgeAt) continue
    const m = ppAt(c.wedgeAt); if (m) apex[c.wedge].push(m) }
  const rows = [
    ['every perpendicular cut has walk behind it',  behind.length > 0 && behind.every(m => m === 'walk')],
    ['a lawn wedge is lawn at the apex, a concrete one walk', apex.lawn.length > 0 && apex.lawn.every(m => m === 'lawn') && apex.concrete.every(m => m === 'walk')],
    // a corner is authorable when its legs are STREETS (skeleton chains); a shore or rim leg is no street and has no key
    ['every junction corner has a record, and one between streets its corner key', corners.length === J && corners.every(c => c.key || !streetLegs(Dg, c))],
    ['a corner\'s style, written by its key, draws there and only there', !!Same && authoredAt(Same).length > 0 && authoredAt(Same).every(r => keyOfRec(Same, r) === c0.key)],
    ['recorded crossings land on both kerbs, opposite sides', XL.landed > 0 && [...xById.values()].every(v => v.length === 2 && v[0].S === v[1].S && v[0].side !== v[1].side)],
    ['a crossing with both ends on one side is refused', XS.landed === 0 && XS.sameSide > 0],
    ['a recorded crossing sets the station',       (CT.byEvidence || 0) > 0 && !(XT.byEvidence) && square(DgC)],
    ['crosswalks run square to their street',     (CT.crosswalks || 0) > 0 && square(DgC) && square(PpB) && square(Pp)],
    ['a diagonal apex lies inside its crosswalk', (CT.pairs || 0) > 0 && apexInside],
    ['the paint follows the corner',              (CT.byPaint?.lines || 0) > 0 && !CT.byPaint?.continental && (CP.byPaint?.continental || 0) > 0 && !CP.byPaint?.lines],
    ["a T's far kerb: 'cut' cuts and crosses",    (CT.farKerbCut || 0) > 0 && area(DgC.curbCut) > area(DgN.curbCut)],
    ["a T's far kerb: 'none' is counted",         (CN.farKerbNone || 0) > 0 && !(CN.farKerbCut) && CN.farKerbNone === CT.farKerbCut],
    ['evidence: a middle drop reads diagonal',     sfe([[0.5]]) === 'diagonal'],
    ['evidence: two end drops read perpendicular', sfe([[0.1], [0.9]]) === 'perpendicular'],
    ['evidence: one end only is unreadable',       sfe([[0.1]]) === 'unreadable' && sfe([[0.5], [0.9]]) === 'unreadable'],
    ['evidence: raised only reads none',           sfe([[0.5, 'raised']]) === 'none' && sfe([[0.5, 'rolled']]) === 'unreadable'],
    ['no kerb file is NOT FETCHED, not empty',     none.fetched === false],
    ['kerb nodes bind to crossings by identity',   Elow.records.length > 0 && Elow.census.positionNotRecorded >= 3],
    ['every landing is owned by its crossed road', owned.length > 0 && owned.every(Boolean) && owned.length === L.landed],
    ['a road that is no leg is refused',          Lx.landed === 0 && Lx.notOwner === L.landed + L.notOwner],
    ['partial evidence against the norm is counted', (Lo.contradicted || 0) > 0 && (Lo.contradicted || 0) <= (Lo.unreadable || 0)],
    ['landed evidence reaches the painter',        ((Lo.bySource?.['osm:kerb'] || 0) + (Lo.unreadable || 0)) > 0],
    ['raised kerbs suppress the norm\'s cut',      (Up.bySource?.['osm:kerb'] || 0) > 0 && (Up.curbCuts || 0) < J],
    ['kit norm paints nothing',           (K.curbCuts || 0) === 0],
    ['…and every junction is noSource',   J > 0 && K.noSource === J],
    ['diagonal: one curb cut per junction',   (Dg.curbCutTally?.curbCuts || 0) === J],
    ['perpendicular: two per junction, but each missing landing counted', (Pp.curbCutTally?.curbCuts || 0) + (Pp.curbCutTally?.perpNoLanding || 0) === 2 * J
      && (Pp.curbCutCorners || []).reduce((n, c) => n + (c.noLanding || 0), 0) === (Pp.curbCutTally?.perpNoLanding || 0)],
    ['every curb cut is on a junction',       [...Dg.curbCutRecs, ...Pp.curbCutRecs].every(r => Number.isInteger(r.junction))],
    ['strips are painted',                (Dg.curbCut?.length || 0) > 0 && (Pp.curbCut?.length || 0) > (Dg.curbCut?.length || 0)],
    ['an authored leg places curb cuts',      !!authored && authored.curbCuts > 0 && authored.curbCuts < J && (authored.bySource?.authored || 0) > 0],
    ['no curb cuts → no crosswalks, said',    (Kc.pairs || 0) === 0 && Kc.noCurbCut === 1],
    ['crosswalk norm none → none',        (Dg.crosswalkPairs?.length || 0) === 0 && !(Dg.crosswalk?.length)],
    ['crosswalks pair curb cuts',             (Pp.crosswalkTally?.pairs || 0) > 0 && (Pp.crosswalk?.length || 0) > 0],
    ['every crosswalk ends at two curb cuts', badPairs(Pp) === 0],
  ]
  let bad = 0
  for (const [name, ok] of rows) { if (!ok) bad++; console.log(`  ${ok ? '✅' : '⛔'} ${name}`) }
  console.log(`  (crossings: ${CX.census.records} bound · ${XL.landed} landed on both kerbs (ends ${XL.ends.arc} arc / ${XL.ends.nearTangent} near-tangent / ${XL.ends.leg} leg) · ${XL.noHit} no hit · ${XL.notOwned} not owned · ${XL.sameSide} same side → ${CT.byEvidence} crosswalk(s) placed by a recorded crossing · ${recordedApexOutside} refused for leaving the apex outside)`)
  console.log(`  (crosswalks, diagonal + byCorner: ${CT.crosswalks} drawn · ${CT.pairs} between two cuts · ${CT.farKerbCut} to a far-kerb cut · ${CT.farCornerNoCut} far corner without a cut · ${CT.noFarKerb} no far kerb · ${CT.endsNotOwned} ends not owned · ${CT.ambiguous} ambiguous · ${CT.styleDisagrees} style disagrees · ${CT.apexesApart} cuts too far apart)`)
  console.log(`  (evidence trial: ${Elow.records.length} record(s) bound · landed ${L.landed}, refused ${L.notOwner} not-owner / ${L.offArc} off-arc / ${L.notJunction} not-junction / ${L.noHit} no-hit · lowered → ${Lo.bySource?.['osm:kerb'] || 0} corner(s) by evidence, ${Lo.unreadable || 0} unreadable (${Lo.contradicted || 0} contradict the norm) · raised → ${Up.curbCuts} cut(s) of ${J})`)
  console.log(`  (perpendicular fill: behind ${behind.length} drawn cut(s): ${behind.filter(m => m === 'walk').length} walk${behindBad.length ? ` (not: ${behindBad.slice(0, 8).map(a => `(${a[0].toFixed(0)}, ${a[1].toFixed(0)})`).join(' ')})` : ''} · apex ${apex.lawn.length} lawn wedge(s): ${apex.lawn.filter(m => m === 'lawn').length} lawn · ${apex.concrete.length} concrete: ${apex.concrete.filter(m => m === 'walk').length} walk · ${Pp.curbCutTally?.perpNoLanding} leg(s) with no landing)`)
  console.log(`  (${scene}: ${J} junction corners · diagonal ${Dg.curbCutTally?.curbCuts} · perpendicular ${Pp.curbCutTally?.curbCuts} · authored ${authored?.curbCuts ?? '—'} · perpendicular crosswalks ${Pp.crosswalkTally?.pairs} paired, ${Pp.crosswalkTally?.farKerbNone} far-kerb none, ${Pp.crosswalkTally?.ambiguous} ambiguous)`)
  console.log(bad ? `⛔ selftest: ${bad} wrong` : '✅ selftest: the painter places curb cuts by evidence, norm and authoring, on junctions only')
  process.exit(bad ? 1 : 0)
}

const r = run(undefined)
// an arc's two flank legs (skelId) off the tile's own stamp — the class is checked against them, not trusted
function legsOfArc(R, a) { const t = R.protoShapeTiles?.[a.tile], arc = t?.iaArc?.[a.si], stp = t?.iaStamp?.[a.si] || []; if (!arc) return []
  const n = arc.length, q = arc.findIndex((u, i) => u === a.arc && arc[(i - 1 + n) % n] !== a.arc); if (q < 0) return []
  let e = q; for (let k = 0; k < n && arc[(e + 1) % n] === a.arc; k++) e = (e + 1) % n
  return [stp[(q - 1 + n) % n], stp[e]].filter(x => x != null).map(x => t.runs[x].skelId) }
const T = r.curbCutTally
if (!T) { console.log(`⛔ ${scene}: the painter returned no curb-cut tally — NOT checked`); process.exit(1) }
const offJunction = (r.curbCutRecs || []).filter(x => !Number.isInteger(x.junction)).length
console.log(`${scene}${live ? ' (live ①)' : ''}: ${T.junction || 0} junction corner(s) · ${T.bend || 0} bend · ${T.unknown || 0} unknown`)
console.log(`  style from : ${Object.entries(T.bySource || {}).map(([k, v]) => `${v} ${k}`).join(' · ') || 'nothing'}`)
console.log(`  curb cuts  : ${T.curbCuts || 0} painted${T.short ? ` · ${T.short} short of their width` : ''}`)
if (T.noSource) console.log(`  ⛔ ${T.noSource} corners have no curb-cut source (norm 'none') — the ruled default, visible`)
if (T.noDims) console.log(`  ⛔ ${T.noDims} authored curb cut(s) with no norm dimensions to draw them`)
if (T.contradicted) console.log(`  ⛔ ${T.contradicted} corner(s) where partial evidence CONTRADICTS the norm — drawn by the norm; override if the record is right: ${(r.curbCutContradicted || []).slice(0, 8).map(c => `(${c.at[0].toFixed(0)}, ${c.at[1].toFixed(0)})`).join(' ')}`)
if (T.unreadable) console.log(`  ${T.unreadable} corner(s) whose recorded cuts are unreadable — counted, drawn by the norm`)
const C = r.crosswalkTally || {}, bad = badPairs(r)
console.log(`  crosswalks : ${C.style && C.style !== 'none' ? `${C.crosswalks} (${C.style}, from ${C.source}) · ${C.pairs} between two cuts · ${C.farKerbCut} to a far-kerb cut · ${C.farKerbNone} far kerb 'none' · ${C.farCornerNoCut} far corner without a cut · ${C.noFarKerb} no far kerb · ${C.ambiguous} ambiguous · ${C.styleDisagrees} style disagrees · ${C.apexesApart} cuts too far apart${C.apexesApart ? ` (${C.apartAt.slice(0, 6).map(a => `${a.street} (${a.at[0].toFixed(0)}, ${a.at[1].toFixed(0)}) ${a.gap} m`).join(' · ')})` : ''}` : `none (norm ${C.style ?? 'not frozen'})`}`)
if (bad) console.log(`  ⛔ ${bad} crosswalk(s) whose ends are not two curb cuts across one chain at one junction`)
// ⛔ A SHORE OR RIM CORNER IS NO STREET CORNER: no pad, no curb cut. Read off what was painted — the corner records' own
// class (`nostreet`) and every cut's own legs — against the scene's own street list, never a list of names.
const streetIds = new Set((f.ribbons.streets || []).map(st2 => st2.skelId))
const shorePads = (r.cornerArcs || []).filter(a => a.pad && legsOfArc(r, a).some(l => !streetIds.has(l))).length
const shoreCuts = (r.curbCutRecs || []).filter(x => (r.protoShapeTiles?.[x.tile]?.junctions?.[x.junction]?.legs || []).some(l => l && !streetIds.has(l.skelId))).length
console.log(`  no street  : ${(r.cornerArcs || []).filter(a => a.kind === 'nostreet').length} shore/rim corner arc(s) · ${shorePads} padded · ${shoreCuts} curb cut(s) on one`)
const fail = offJunction || T.noNorm || T.invalid || bad || shorePads || shoreCuts
if (shorePads || shoreCuts) console.log(`  ⛔ a shore or rim corner carries ${shorePads} pad(s) and ${shoreCuts} curb cut(s) — it is no street corner`)
if (offJunction) console.log(`  ⛔ ${offJunction} curb cut(s) on a corner that is not a junction`)
if (T.noNorm) console.log(`  ⛔ ${T.noNorm} junction corner(s) on tiles poured before the curb-cut norm — re-pour`)
if (T.invalid) console.log(`  ⛔ ${T.invalid} authored style(s) invalid`)
console.log(fail ? '⛔ NOT a pass' : '✅ every junction corner\'s curb-cut style has a named source')
process.exit(fail ? 1 : 0)
