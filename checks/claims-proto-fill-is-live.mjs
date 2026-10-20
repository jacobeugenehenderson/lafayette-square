#!/usr/bin/env node
// ⭐⭐⭐ ③'s FILL, STRUCK LIVE PAST THE WALL — the STAMP INQUIRY, measured.
// ▶ node checks/claims-proto-fill-is-live.mjs [scene…] [--mutants]     (no scene = every feed town; ⚠️ heavy: two builds per town)
//
// `SECTION §4`'s keystone: freeze the SILHOUETTE, author the FILL live. ③ shipped the FILL frozen
// (`bands` on the tile), so authoring could not reach it. The flip is not "delete `bands`" — that
// hands a fully-polygonized contour to `sectionPassTile`, the per-RUN WALK painter, which asks
// where a frontage starts and stops. ⛔ On a contour there are no legs and no nodes; the only
// question is "WHAT DEPTH HERE". This gate measures the answer.
//
// WHAT IT ASSERTS
//   1. the live FILL reproduces ③'s own frozen bands (same construction, both sides of the wall)
//   2. authoring REACHES it (the whole point of the keystone), judged PER AUTHORED EDGE, at the product's door:
//      2a · FILL — every authored slot whose treelawn / sidewalk / materials differ from the DEFAULT the painter would take
//           (`resolvePedDepths` unauthored, the §3.1 arrangement) moves the paint of a tile it is stamped on, when that one
//           slot is removed. Reports reached / could; a slot stamped on no contour point is named, not counted.
//      2b · DROPPED — the whole build with `blockCustoms: null` (buildTileGround, the bake's door) moves the map.
//      2c · ② — every authored slot whose pavementHW differs from the street's base moves the depth ② offsets one of its
//           blocks by (`protoDepthByBlock`, the construction's own number), authored vs dropped.
//      2d · SYNTHETIC — every authored treelawn doubled moves the fill. Labelled as such: it proves the door is open, never
//           that the town's own authoring reached it.
//      ⛔ A town whose authored values all equal the defaults, or that authors nothing, CANNOT SPEAK on 2a–2c and is
//      named as such — never passed on 2d alone.
//   3. a SEAM is not constructible — every boundary is a whole-contour offset of one curve
//
// ⛔ TWO INSTRUMENT ERRORS THIS ENCODES SO THEY CANNOT RECUR (both cost measurements on 2026-09-06):
//   · ③'s four frozen layers OVERLAP (LS 46,072 m²). SUMMING their areas answers a different
//     question from "how much ground is painted". Every figure here is a UNION.
//   · `run.baseMeasure.treelawn` is the AUTHORED OVERRIDE ONLY — median 0. The painted depth comes
//     from `resolvePedDepths`. Off the raw field you get a 3.00 m envelope gap that does not exist.
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { sectionOpen, hasStampInquiry, sectionPassProtoTile, resolvePedDepths } from '../src/lib/tileGround.js'
import { differenceRings, intersectRings } from '../src/lib/buildBlockGeometryV2.js'

const sA = r => Math.abs((r||[]).reduce((s,g)=>{let a=0;for(let i=0,n=g.length;i<n;i++){const p=g[i],q=g[(i+1)%n];a+=p[0]*q[1]-q[0]*p[1]}return s+a/2},0))
const U  = r => sA(differenceRings(r, []))
const luA = o => Object.values(o||{}).reduce((s,v)=>s+U(v),0)
const pct = (a,b) => b > 0 ? `${(100*a/b).toFixed(1)}%` : 'n/a'

// ⭐ WHAT AN AUTHORED SLOT SAYS THAT THE DEFAULT WOULD NOT — the same defaults the painter and ② take unauthored.
// ped: `resolvePedDepths(base, side, null)` · materials: the §3.1 arrangement (treelawn-Y reads LU→SW, N reads SW→LU) ·
// pavementHW: the street's base measure (`ribbons.streets[].measure`, what ②'s `protoBase` reads).
function slotSignal(blockCustoms, streets) {
  const baseOf = new Map((streets || []).map(s => [s.skelId, s.measure]))
  const out = []
  for (const [skelId, sides] of Object.entries(blockCustoms || {})) for (const [side, ords] of Object.entries(sides || {})) for (const [ord, c] of Object.entries(ords || {})) {
    if (!c || typeof c !== 'object') continue
    const base = baseOf.get(skelId), d0 = resolvePedDepths(base, side, null), d1 = resolvePedDepths(base, side, c)
    const ped = Math.abs(d0.tl - d1.tl) > 1e-9 || Math.abs(d0.sw - d1.sw) > 1e-9
    const defMat = d0.hasTL ? { outer: 'LU', inner: 'SW' } : { outer: 'SW', inner: 'LU' }
    const mat = !!c.materials && ((c.materials.outer != null && c.materials.outer !== defMat.outer) || (c.materials.inner != null && c.materials.inner !== defMat.inner))
    const bhw = base?.[side]?.pavementHW
    const pav = Number.isFinite(c.pavementHW) && !(Number.isFinite(bhw) && Math.abs(c.pavementHW - bhw) <= 1e-6)
    out.push({ skelId, side, segOrd: +ord, fill: ped || mat, pav, why: [ped && 'ped', mat && 'materials', pav && 'pavementHW'].filter(Boolean) })
  }
  return out
}
const without = (bc, s) => { const o = JSON.parse(JSON.stringify(bc)); delete o[s.skelId][s.side][s.segOrd]; return o }
const MUT = process.argv.includes('--mutants')
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const cannotSpeak = []

let bad = 0
for (const scene of (named.length ? named : feedScenes())) {
  const f = feed(scene); if (!f) { bad++; continue }
  const g = buildProto(f)
  const T = g.protoShapeTiles, cw = f.curbWidth
  // ⭐ ③'s strike is the REFERENCE, not the product: the tile no longer carries `bands` (the FILL
  // is live now), so the reference comes off the build's measurement channel and is cut by each
  // tile's own `iA` — the same cut the live painter applies, so the two are comparable.
  const region = differenceRings(T.flatMap(t => t.iA || []), [])   // the blocks, as the disc left them
  const clip = (rs) => intersectRings(rs || [], region)
  const open = (tiles, cust) => sectionOpen(tiles, cw, { outer:'LU', inner:'SW' }, null, cust)
  console.log(`\n══ ${scene} · ${T.length} proto tiles · ${f.slots} authored slots · cw ${cw} ══`)

  // ── 0 · the tile carries the per-POINT stamp, and it is TOTAL where ① labelled the contour.
  const st = T.filter(hasStampInquiry).length
  let pts = 0, nul = 0
  for (const t of T) for (const a of t.iaStamp || []) for (const v of a) { pts++; if (v == null) nul++ }
  console.log(`  stamp inquiry available on ${st}/${T.length} tiles · ${pts} contour points, ${nul} unstamped (${pct(nul,pts)} — rim + unlabelled ①)`)
  if (st !== T.length) { console.log('  ⛔ FAIL — a tile without the stamp falls to the WALK painter'); bad++ }

  // ── 1 · the live FILL vs ③'s frozen bands. Same ladder, both sides of the wall ⇒ they must agree.
  const L = open(T, f.blockCustoms)
  // ③'s strike, clipped to the same region the live bands are cut to. ⛔ `protoBands` is struck
  // BEFORE the disc is stamped, so comparing it raw answers a different question.
  const F = { sidewalk: clip(g.protoBands.sidewalk), treelawnByLu: { all: clip(g.protoBands.treelawn) },
              luByClass: { all: clip(g.protoBands.lu) }, curb: clip(g.protoBands.curb), asphalt: L.asphalt }
  // ⛔ THE TOLERANCE IS PER-LAYER AND IT IS NOT A FUDGE. `asphalt`/`curb`/`LU` and the TOTAL band
  // must reproduce ③ tightly — same ladder, both sides of the wall. The two STRIPS carry a known
  // open residual: they swap ~3% between each other while their total holds to 0.23%, so only the
  // DIVIDER moved. ⛔ CAUSE NOT ESTABLISHED — it is not the capacity guard (the residual sits on
  // the 144 tiles whose envelope is identical to ③'s) and not the rim cut. Tolerance 5% so the
  // gate still catches a real regression; ⛔ do not widen it to make a change pass.
  const row = (n, a, b, tol=0.01) => {
    const d = Math.abs(a-b), ok = d <= Math.max(1, b*tol)
    if (!ok) bad++
    console.log(`  ${n.padEnd(9)} frozen ${b.toFixed(0).padStart(8)} · live ${a.toFixed(0).padStart(8)} · Δ ${(a-b>=0?'+':'')}${(a-b).toFixed(0).padStart(7)} m² (${pct(d,b)} / ${(tol*100).toFixed(0)}%)  ${ok?'✅':'⛔'}`)
  }
  row('sidewalk', U(L.sidewalk), U(F.sidewalk), 0.05)
  row('treelawn', luA(L.treelawnByLu), luA(F.treelawnByLu), 0.05)
  // ⛔ 2% AND THE REASON IS NAMED: ③ builds NO ADA CORNER PADS — it has no corner concept at all.
  // The live path does (`SECTION §6.1`), and a pad deliberately routes the corner band deeper than
  // `cMin` to parcel. So the strips SHOULD differ from ③ now, and this row is no longer a parity
  // check — it is a drift alarm. ⛔ Do not widen it again to make a change pass.
  row('BAND tl+sw', U(L.sidewalk)+luA(L.treelawnByLu), U(F.sidewalk)+luA(F.treelawnByLu), 0.02)
  row('LU',       luA(L.luByClass),   luA(F.luByClass))
  // ⛔ 2%, AND THE REASON IS NAMED, NOT THE NUMBER TUNED. The live curb runs slightly LARGE on
  // both towns (+0.8% LS, +1.1% HPDM) and it is the same open residual as the strip split: ③ cuts
  // its bands with the DISC, the live path cuts with the tile's `iA` — which is that same region
  // after Clipper simplified it. ⛔ CAUSE NOT ESTABLISHED. 2% still catches a real regression:
  // the walk painter's curb was +6% here and fails this bar.
  row('curb',     U(L.curb),          U(F.curb), 0.02)
  row('asphalt',  U(L.asphalt),       U(F.asphalt))

  // ── 2 · AUTHORING REACHES THE MAP, PER AUTHORED EDGE, AT THE PRODUCT'S DOOR. `SECTION §4`'s whole point.
  const SIG = slotSignal(f.blockCustoms, f.ribbons.streets), fillSig = SIG.filter(x => x.fill), pavSig = SIG.filter(x => x.pav)
  const quietly = (fn) => { const p = console.log, w = console.warn; console.log = console.warn = () => {}; try { return fn() } finally { console.log = p; console.warn = w } }
  const paintA = (t, bc) => quietly(() => { const o = sectionPassProtoTile(t, cw, { outer:'LU', inner:'SW' }, bc, f.cornerCornerRadiusOverrides)
    return U(o.Wacc) + 1e3 * luA(o.tlByLu) + 1e6 * luA(o.luByLu) })   // one number per tile that moves if any strip moves
  console.log(`  authored slots ${SIG.length} · differ from their default: fill ${fillSig.length} · pavementHW ${pavSig.length}`)
  if (!SIG.length) { console.log(`  ⛔ CANNOT SPEAK — ${scene} authors no slot: 2a–2c have nothing to measure (not a pass)`); cannotSpeak.push(`${scene} (authors nothing)`) }

  // 2a · FILL, per authored edge: remove THAT slot; a tile it is stamped on must repaint.
  const fillReach = (bcFor) => {
    let could = 0, reached = 0; const offDrawing = [], missed = []
    for (const s of fillSig) {
      const tiles = T.filter(t => (t.runs || []).some((r, ri) => r.skelId === s.skelId && r.side === s.side && r.segOrd === s.segOrd
        && (t.iaStamp || []).some(a => a.includes(ri))))
      if (!tiles.length) { offDrawing.push(`${s.skelId}|${s.side}|${s.segOrd}`); continue }
      could++
      const bc0 = without(f.blockCustoms, s)
      if (tiles.some(t => Math.abs(paintA(t, bcFor(f.blockCustoms)) - paintA(t, bcFor(bc0))) > 1e-2)) reached++; else missed.push(`${s.skelId}|${s.side}|${s.segOrd} (${s.why.join('+')})`)
    }
    return { could, reached, offDrawing, missed }
  }
  if (SIG.length && !fillSig.length) { console.log(`  ⛔ 2a CANNOT SPEAK — every authored treelawn/sidewalk/material in ${scene} equals its default; removing one moves nothing BY CONSTRUCTION (not a pass)`); cannotSpeak.push(`${scene} 2a (authored fill = defaults)`) }
  else if (fillSig.length) {
    const R2a = fillReach(bc => bc)
    const ok = R2a.reached === R2a.could; if (!ok) bad++
    console.log(`  2a fill, per authored edge: ${R2a.reached}/${R2a.could} reached the paint ${ok ? '✅' : '⛔'}${R2a.offDrawing.length ? ` · ${R2a.offDrawing.length} stamped on no contour point (not counted): ${R2a.offDrawing.slice(0, 4).join(', ')}` : ''}`)
    for (const m of R2a.missed.slice(0, 8)) console.log(`     ⛔ inert: ${m}`)
    if (MUT) { const M = fillReach(() => null), red = M.could > 0 && M.reached < M.could; if (!red) bad++
      console.log(`     mutant · the painter given no authoring: ${M.reached}/${M.could} ${red ? 'RED, as it must be' : '⛔ still GREEN'}`) }
  }

  // 2b · DROPPED at the product's door: the whole build without blockCustoms.
  const g0 = SIG.length ? buildProto(f, { blockCustoms: null }) : null
  const moved = (A, B) => { const lay = { sidewalk: x => x.sidewalk, treelawn: x => Object.values(x.treelawnByLu || {}).flat(), asphalt: x => x.asphalt, curb: x => x.curb }
    return Object.fromEntries(Object.entries(lay).map(([k, get]) => [k, U(differenceRings(get(A) || [], get(B) || [])) + U(differenceRings(get(B) || [], get(A) || []))])) }
  if (g0) {
    const mv = moved(g, g0), tot = Object.values(mv).reduce((a, b) => a + b, 0), any = fillSig.length + pavSig.length
    if (!any) { console.log(`  ⛔ 2b CANNOT SPEAK — every authored value equals its default (moved ${tot.toFixed(0)} m², expected none)`); cannotSpeak.push(`${scene} 2b (authoring = defaults)`) }
    else { const ok = tot > 1; if (!ok) bad++
      console.log(`  2b authoring dropped at buildTileGround: moved ${Object.entries(mv).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')} m² ${ok ? '✅' : '⛔ INERT'}`)
      if (MUT) { const m = moved(g, g), red = Object.values(m).reduce((a, b) => a + b, 0) <= 1; if (!red) bad++
        console.log(`     mutant · the dropped build is the authored one: ${red ? 'RED, as it must be' : '⛔ still GREEN'}`) } }
  }

  // 2c · pavementHW reaches ②, per authored edge: a block it owns is offset by a different depth authored vs dropped.
  const P = f.ribbons.protopolygon, owners = P?.owners || []
  const pavReach = (A, B) => {
    let could = 0, reached = 0; const missed = []
    for (const s of pavSig) {
      const own = (L) => (L || []).some(l => { const o = owners[l]; return o && o.skelId === s.skelId && o.side === s.side && o.segOrd === s.segOrd })
      const ks = (P?.blockLabels || []).map((L, k) => (own(L) || (P.blockHoleLabels?.[k] || []).some(own)) ? k : -1).filter(k => k >= 0 && A.protoDepthByBlock?.[k] && B.protoDepthByBlock?.[k])
      if (!ks.length) continue
      could++
      if (ks.some(k => JSON.stringify(A.protoDepthByBlock[k].depth) !== JSON.stringify(B.protoDepthByBlock[k].depth))) reached++; else missed.push(`${s.skelId}|${s.side}|${s.segOrd}`)
    }
    return { could, reached, missed }
  }
  if (g0 && !pavSig.length) { console.log(`  ⛔ 2c CANNOT SPEAK — no authored pavementHW in ${scene} differs from its street's base (not a pass)`); cannotSpeak.push(`${scene} 2c (authored pavementHW = base)`) }
  else if (g0) {
    const R2c = pavReach(g, g0), ok = R2c.could > 0 && R2c.reached === R2c.could; if (!ok) bad++
    console.log(`  2c pavementHW reaches ②, per authored edge: ${R2c.reached}/${R2c.could} moved their block's offset depth ${ok ? '✅' : '⛔'}`)
    for (const m of R2c.missed.slice(0, 8)) console.log(`     ⛔ inert: ${m}`)
    if (MUT) { const M = pavReach(g, g), red = M.reached < M.could; if (!red) bad++
      console.log(`     mutant · the dropped build is the authored one: ${M.reached}/${M.could} ${red ? 'RED, as it must be' : '⛔ still GREEN'}`) }
  }

  // 2d · SYNTHETIC: every authored treelawn doubled. Proves the door is open; says nothing about the town's own values.
  const bc = JSON.parse(JSON.stringify(f.blockCustoms || {}))
  let n = 0
  for (const s of Object.values(bc)) for (const sd of Object.values(s||{})) for (const o of Object.values(sd||{}))
    if (Number.isFinite(o?.treelawn)) { o.treelawn *= 2; n++ }
  if (!n) console.log(`  2d synthetic: this town authors NO treelawn depth — nothing to double (not a pass)`)
  else {
    const base = luA(L.treelawnByLu), mv = luA(open(T, bc).treelawnByLu), ok = Math.abs(mv - base) > 1
    if (!ok) bad++
    console.log(`  2d synthetic (not the town's own values): doubling ${n} treelawn slots moves the LIVE fill ${(mv-base>=0?'+':'')}${(mv-base).toFixed(0)} m² ${ok?'✅':'⛔ INERT'}`)
    if (MUT) { const m = luA(open(T, f.blockCustoms).treelawnByLu), red = Math.abs(m - base) <= 1; if (!red) bad++
      console.log(`     mutant · the doubling not applied: ${red ? 'RED, as it must be' : '⛔ still GREEN'}`) }
  }
  // (c)'s own mutant: a copy of the town's slots set to their defaults must be read as NO SIGNAL.
  if (MUT && SIG.length) {
    const plain = {}
    for (const s of SIG) { const base = f.ribbons.streets.find(x => x.skelId === s.skelId)?.measure, d0 = resolvePedDepths(base, s.side, null)
      ;((plain[s.skelId] ||= {})[s.side] ||= {})[s.segOrd] = { treelawn: d0.tl, sidewalk: d0.sw, ...(Number.isFinite(base?.[s.side]?.pavementHW) ? { pavementHW: base[s.side].pavementHW } : {}) } }
    const S0 = slotSignal(plain, f.ribbons.streets), red = !S0.some(x => x.fill || x.pav); if (!red) bad++
    console.log(`     mutant · the slots set to their defaults: ${red ? 'read as NO SIGNAL, as it must be' : `⛔ still read as signal (${S0.filter(x => x.fill || x.pav).length})`}`)
  }

  // ── 3 · NO SEAM. Every boundary is a whole-contour offset of ONE curve, so treelawn and sidewalk
  // meet exactly. ⭐ `RIBBONS §1`: a visible seam is positive evidence of per-chain construction —
  // it tells you WHICH MODEL made the geometry, so this is not a quality check.
  // ⛔ MEASURED ON BOTH SIDES. `feedback_verify_the_baseline_before_comparing_to_it`: ③'s own
  // frozen layers overlap by 46,072 m² on LS, so a bare "the live band overlaps" is not a finding
  // — the question is whether the LIVE path overlaps MORE than the construction it reproduces.
  const ovOf = (o) => U(intersectRings(o.sidewalk, Object.values(o.treelawnByLu).flat()))
  const oL = ovOf(L), oF = ovOf(F)
  const ok = oL <= Math.max(1, oF * 1.05)
  console.log(`  treelawn∩sidewalk: frozen ${oF.toFixed(0)} m² · live ${oL.toFixed(0)} m² ${ok?'✅ no worse':'⛔ WORSE than ③'}`)
  if (!ok) bad++
}
if (cannotSpeak.length) console.log(`\n⛔ COULD NOT SPEAK (named, not passed): ${cannotSpeak.join(' · ')}`)
console.log(bad ? `\n⛔ ${bad} FAILURE(S)` : `\n✅ PASS where it could speak — the FILL is struck live off the frozen stamp, and authoring reaches it per authored edge.`)
process.exit(bad ? 1 : 0)
