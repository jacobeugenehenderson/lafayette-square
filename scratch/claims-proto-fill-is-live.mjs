#!/usr/bin/env node
// ⛔⛔ THE ③ FLIP — "delete `bands` and the FILL strokes live" — MEASURED, not argued.
// ▶ node scratch/claims-proto-fill-is-live.mjs [scene]
//
// `SECTION §4` rules the keystone: freeze the SILHOUETTE, author the FILL live. ③ ships the
// FILL frozen (`bands` on the tile), which is the Phase-D over-reach re-committed. The flip was
// held back because it yielded ~a tenth of the ped fill and the cause was not established.
//
// ⭐ THIS CHECK READS THE SOURCE, IT DOES NOT RESTATE IT — every number below is re-derived from
// the live build, so it cannot go stale the way a figure written into a doc does.
//
// ⛔ THE TWO INSTRUMENT ERRORS IT EXISTS TO PREVENT, both of which cost measurements on 2026-09-06:
//  1. ③'s four frozen layers OVERLAP (LS: 46,072 m² pairwise). SUMMING their areas answers a
//     different question from "how much ground is painted". Every band figure here is a UNION.
//  2. `run.baseMeasure.treelawn` is the AUTHORED OVERRIDE ONLY — median 0. The depth the map
//     paints comes from `resolvePedDepths`. Comparing envelopes off the raw field reports a
//     3.00 m gap that does not exist. (`tileGround.js`, the `protoMeasureOf` comment says so.)
import { feed, buildProto } from './_proto-feed.mjs'
import { sectionPassTile, ringRunOwners } from '../src/lib/tileGround.js'
import { differenceRings, intersectRings } from '../src/lib/buildBlockGeometryV2.js'

const sA = r => Math.abs((r||[]).reduce((s,g)=>{let a=0;for(let i=0,n=g.length;i<n;i++){const p=g[i],q=g[(i+1)%n];a+=p[0]*q[1]-q[0]*p[1]}return s+a/2},0))
const U  = r => sA(differenceRings(r, []))                       // area of the UNION, never the sum
const plen = p => { let s=0; for(let i=1;i<p.length;i++) s+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]); return s }

for (const scene of (process.argv[2] ? [process.argv[2]] : ['lafayette-square','hipointe-demun'])) {
  const f = feed(scene); if (!f) continue
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  const cw = f.curbWidth
  console.log(`\n══ ${scene} · ${T.length} proto tiles · ${f.slots} authored slots · cw ${cw} ══`)

  // ── ① THE REFUSED-FIELD READS. `sectionPassTile` reads fields ①'s tile records as REFUSED.
  // `undefined` never loses a `>` comparison, so a refused depth propagates as NaN rather than
  // failing — the silent-substitution shape Layer 0 q2 forbids, inside the painter.
  const refused = ['tl','sw','iaEdge','measure']
  const miss = {}
  for (const t of T) { for (const k of ['tl','sw','iaEdge']) if (t[k] === undefined) miss[k]=(miss[k]||0)+1
                       for (const r of t.runs||[]) if (r.measure === undefined) miss.measure=(miss.measure||0)+1 }
  console.log(`  fields sectionPassTile reads that ①'s tile does not supply: ${refused.map(k=>`${k}×${miss[k]||0}`).join(' · ')}`)

  // ── ② THE PARTITION (A10). It is what makes a gap unconstructible. It needs the `iaEdge`
  // stamp AND runs that consume `st.ring`; ①'s runs are grouped off `iA` instead, so neither holds.
  const stamped = T.filter(t=>Array.isArray(t.iaEdge)).length
  const consume = T.filter(t=>(t.runs||[]).reduce((s,r)=>s+r.poly.length-1,0)===t.ring.length).length
  const established = T.filter(t=>Array.isArray(t.iaEdge) && ringRunOwners(t)).length
  console.log(`  A10 partition: iaEdge stamp ${stamped}/${T.length} · runs consume st.ring ${consume}/${T.length} · ESTABLISHED ${established}/${T.length}`)

  // ── ③ THE RUNS ARE NEITHER A PARTITION NOR A COVER OF THE CURB RING.
  // ⭐ This is the finding Jacob named: "because we don't do a walk any more, we might need a
  // stamp inquiry step". A leg sector is stroked from a run's polyline, so curb with no run gets
  // no sector and its band falls to `luRemainder` — mid-leg, nowhere near a corner.
  let per=0, cov=0, over=0, under=0
  for (const t of T) {
    let L=0; for(const r of t.iA) for(let i=0;i<r.length;i++){const j=(i+1)%r.length; L+=Math.hypot(r[j][0]-r[i][0],r[j][1]-r[i][1])}
    const R=(t.runs||[]).reduce((s,r)=>s+plen(r.poly),0); per+=L; cov+=R
    if (L>0 && R>L*1.02) over++; else if (L>0 && R<L*0.98) under++
  }
  console.log(`  curb ring covered by runs: ${(100*cov/per).toFixed(1)}% · tiles UNDER-covered ${under} · OVER-covered ${over} (a cover cannot be both)`)

  // ── ④ THE FILL, frozen vs live, as a union — the acceptance number.
  let F=0,L=0,corner=0,far=0
  for (const t of T) {
    const fb=[...t.bands.treelawn,...t.bands.sidewalk]
    const {bands,...st}=t
    const r=sectionPassTile(st,cw,{outer:'LU',inner:'SW'},f.blockCustoms)
    const lb=[...Object.values(r.tlByLu).flat(),...r.Wacc]
    F+=U(fb); L+=U(lb)
    // where the miss lives: at a corner (the takeover declining) or mid-leg?
    const ap=(t.fillets||[]).map(x=>x.apex)
    for (const gp of differenceRings(fb,lb)) { const a=sA([gp]); if(a<0.01) continue
      let cx=0,cy=0; for(const p of gp){cx+=p[0];cy+=p[1]}; cx/=gp.length; cy/=gp.length
      let d=Infinity; for(const p of ap){const e=Math.hypot(p[0]-cx,p[1]-cy); if(e<d)d=e}
      if (d<=12) corner+=a; else far+=a }
  }
  console.log(`  ped band — FROZEN ${F.toFixed(0)} m² · LIVE ${L.toFixed(0)} m² = ${(100*L/F).toFixed(1)}%`)
  console.log(`  the miss lives: within 12 m of a fillet apex ${corner.toFixed(0)} m² (${(100*corner/(corner+far)).toFixed(1)}%) · FAR FIELD ${far.toFixed(0)} m² (${(100*far/(corner+far)).toFixed(1)}%)`)
  console.log(`  ⇒ ${far>corner*3 ? 'MID-LEG, not corner reach — the corner takeover is NOT the dominant cause.' : 'corner-weighted.'}`)

  // ── ⑤ DOES AUTHORING REACH THE FILL? `SECTION §4`'s whole point.
  const bc=JSON.parse(JSON.stringify(f.blockCustoms||{})); let n=0
  for(const s of Object.values(bc)) for(const sd of Object.values(s||{})) for(const o of Object.values(sd||{}))
    if(Number.isFinite(o?.treelawn)){o.treelawn*=2;n++}
  const tlOf=(cust)=>T.reduce((s,t)=>{const{bands,...st}=t
    return s+U(Object.values(sectionPassTile(st,cw,{outer:'LU',inner:'SW'},cust).tlByLu).flat())},0)
  const a=tlOf(f.blockCustoms), b=tlOf(bc)
  console.log(`  authoring reach: doubling ${n} authored treelawn slots moves the LIVE treelawn ${(b-a>=0?'+':'')}${(b-a).toFixed(0)} m²  ${Math.abs(b-a)<1?'⛔ INERT':'✅ reaches'}`)
}
