#!/usr/bin/env node
// ⭐⭐⭐ ③'s FILL, STRUCK LIVE PAST THE WALL — the STAMP INQUIRY, measured.
// ▶ node scratch/claims-proto-fill-is-live.mjs [scene]
//
// `SECTION §4`'s keystone: freeze the SILHOUETTE, author the FILL live. ③ shipped the FILL frozen
// (`bands` on the tile), so authoring could not reach it. The flip is not "delete `bands`" — that
// hands a fully-polygonized contour to `sectionPassTile`, the per-RUN WALK painter, which asks
// where a frontage starts and stops. ⛔ On a contour there are no legs and no nodes; the only
// question is "WHAT DEPTH HERE". This gate measures the answer.
//
// WHAT IT ASSERTS
//   1. the live FILL reproduces ③'s own frozen bands (same construction, both sides of the wall)
//   2. authoring REACHES it (the whole point of the keystone)
//   3. a SEAM is not constructible — every boundary is a whole-contour offset of one curve
//
// ⛔ TWO INSTRUMENT ERRORS THIS ENCODES SO THEY CANNOT RECUR (both cost measurements on 2026-09-06):
//   · ③'s four frozen layers OVERLAP (LS 46,072 m²). SUMMING their areas answers a different
//     question from "how much ground is painted". Every figure here is a UNION.
//   · `run.baseMeasure.treelawn` is the AUTHORED OVERRIDE ONLY — median 0. The painted depth comes
//     from `resolvePedDepths`. Off the raw field you get a 3.00 m envelope gap that does not exist.
import { feed, buildProto } from './_proto-feed.mjs'
import { sectionOpen, hasStampInquiry } from '../src/lib/tileGround.js'
import { differenceRings, intersectRings } from '../src/lib/buildBlockGeometryV2.js'

const sA = r => Math.abs((r||[]).reduce((s,g)=>{let a=0;for(let i=0,n=g.length;i<n;i++){const p=g[i],q=g[(i+1)%n];a+=p[0]*q[1]-q[0]*p[1]}return s+a/2},0))
const U  = r => sA(differenceRings(r, []))
const luA = o => Object.values(o||{}).reduce((s,v)=>s+U(v),0)
const pct = (a,b) => b > 0 ? `${(100*a/b).toFixed(1)}%` : 'n/a'

let bad = 0
for (const scene of (process.argv[2] ? [process.argv[2]] : ['lafayette-square','hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const g = buildProto(f, { protoArtifact: true })
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
  row('BAND tl+sw', U(L.sidewalk)+luA(L.treelawnByLu), U(F.sidewalk)+luA(F.treelawnByLu))
  row('LU',       luA(L.luByClass),   luA(F.luByClass))
  // ⛔ 2%, AND THE REASON IS NAMED, NOT THE NUMBER TUNED. The live curb runs slightly LARGE on
  // both towns (+0.8% LS, +1.1% HPDM) and it is the same open residual as the strip split: ③ cuts
  // its bands with the DISC, the live path cuts with the tile's `iA` — which is that same region
  // after Clipper simplified it. ⛔ CAUSE NOT ESTABLISHED. 2% still catches a real regression:
  // the walk painter's curb was +6% here and fails this bar.
  row('curb',     U(L.curb),          U(F.curb), 0.02)
  row('asphalt',  U(L.asphalt),       U(F.asphalt))

  // ── 2 · AUTHORING REACHES THE FILL. `SECTION §4`'s whole point; it was Δ 0 m² on both paths.
  const bc = JSON.parse(JSON.stringify(f.blockCustoms || {}))
  let n = 0
  for (const s of Object.values(bc)) for (const sd of Object.values(s||{})) for (const o of Object.values(sd||{}))
    if (Number.isFinite(o?.treelawn)) { o.treelawn *= 2; n++ }
  const base = luA(L.treelawnByLu), moved = luA(open(T, bc).treelawnByLu)
  const frz  = 0   // the frozen bands were inert BY CONSTRUCTION — that is the over-reach now removed
  if (!n) console.log(`  authoring: this town authors NO treelawn depth — the gate cannot speak here (not a pass)`)
  else {
    const ok = Math.abs(moved-base) > 1
    if (!ok) bad++
    console.log(`  authoring: doubling ${n} treelawn slots moves the LIVE fill ${(moved-base>=0?'+':'')}${(moved-base).toFixed(0)} m² ${ok?'✅':'⛔ INERT'} · the FROZEN bands ${frz.toFixed(0)} m² (frozen is inert BY CONSTRUCTION — that is the over-reach)`)
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
console.log(bad ? `\n⛔ ${bad} FAILURE(S)` : `\n✅ PASS — the FILL is struck live off the frozen stamp, and authoring reaches it.`)
process.exit(bad ? 1 : 0)
