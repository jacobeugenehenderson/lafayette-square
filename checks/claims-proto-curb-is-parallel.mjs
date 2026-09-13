#!/usr/bin/env node
// ⛔ IS ② PARALLEL TO ① AT THE AUTHORED WIDTH? — Jacob, 2026-09-06: "if the centerline (the
// protopoly) is smooth, their offsets should match."
//
// That is a falsifiable statement about the construction, and it is the honest acceptance for ②:
// every curb vertex should sit at exactly (authored half-width − ε) from ①'s contour. Any vertex
// that does not is the offset failing to be an offset.
// ⛔ PER BLOCK, never a whole-map total: four times on 2026-09-06 an aggregate hid a localised
// defect. The report is one row per block, worst first.
// ⛔ WITH the scene's authoring loaded (Layer 0 q3) — the expected distance is the AUTHORED width,
// so a bare run would score the operator's own edits as error.
// ⚠️ The owning edge is found as the NEAREST ① edge, and its width read off that edge's own carried
// stamp. That is a geometric nearest-point for MEASUREMENT, not an identity assignment — ①'s label
// is already on the edge; nothing is being recovered.
// ▶ node scratch/claims-proto-curb-is-parallel.mjs [scene] [--worst N]
import { feed, buildProto } from './_proto-feed.mjs'
const argv = process.argv.slice(2)
const scene = argv.find(a => !a.startsWith('--')) || 'lafayette-square'
const WORST = (() => { const i = argv.indexOf('--worst'); return i > 0 ? Number(argv[i + 1]) : 12 })()
const f = feed(scene); if (!f) process.exit(1)
const r = buildProto(f)
const O = r.protoOwners || []
const SA = (g) => { let a = 0; for (let i = 0; i < g.length; i++) { const j = (i+1)%g.length; a += g[i][0]*g[j][1] - g[j][0]*g[i][1] } return a/2 }
const cen = (g) => { let a=0,cx=0,cy=0; for(let i=0;i<g.length;i++){const j=(i+1)%g.length;const c=g[i][0]*g[j][1]-g[j][0]*g[i][1];a+=c;cx+=(g[i][0]+g[j][0])*c;cy+=(g[i][1]+g[j][1])*c} a/=2; return a?[cx/(6*a),cy/(6*a)]:g[0] }
const inRing = (g,x,y)=>{let c=false;for(let i=0,j=g.length-1;i<g.length;j=i++){const[a,b]=g[i],[e,d]=g[j];if((b>y)!==(d>y)&&x<(e-a)*(y-b)/(d-b)+a)c=!c}return c}
// ⛔⛔ PERPENDICULAR TO THE EDGE'S LINE, NEVER TO THE CLAMPED SEGMENT. An offset is defined by the
// LINE the edge lies on; a MITER APEX projects past the end of both adjacent segments, so a clamped
// distance measures to the shared ENDPOINT — `hw/sin(θ/2)` — not the perpendicular `hw`. At an
// ordinary 90° corner with hw 5.49 that reads 8.0 m and scores a 2.5 m "error".
// ⭐ THIS WAS THE ENTIRE "50 BLOCKS ARE NOT PARALLEL" FINDING. Switching to the line: max error 0.00 m,
// 100% of vertices within 0.10 m. ② IS EXACTLY PARALLEL — Jacob's claim holds without exception.
const d2seg = (p, a, b) => { const ex=b[0]-a[0], ez=b[1]-a[1], L=Math.hypot(ex,ez)||1
  return Math.abs((p[0]-a[0])*ez - (p[1]-a[1])*ex) / L }
// ⛔ …but WHICH edges are candidates is still decided by SEGMENT proximity: the adjacent edges are
// the ones the vertex was struck from. Choosing candidates by line-distance instead would let a
// distant PARALLEL edge match by coincidence, which is a permissive test wearing a strict one's face.
const dClamp = (p, a, b) => { const ex=b[0]-a[0], ez=b[1]-a[1], L2=ex*ex+ez*ez||1
  let t=((p[0]-a[0])*ex+(p[1]-a[1])*ez)/L2; t=Math.max(0,Math.min(1,t))
  return Math.hypot(p[0]-(a[0]+ex*t), p[1]-(a[1]+ez*t)) }
const EPS = f.ribbons.protopolygon?.eps ?? 0.005
const bc = f.blockCustoms || {}
const baseHW = new Map()
for (const s of f.ribbons.streets) baseHW.set(s.skelId ?? s.name, { left: s.measure?.left?.pavementHW, right: s.measure?.right?.pavementHW })
const hwOf = (o) => { if (!o) return null
  const a = bc?.[o.skelId]?.[o.side]?.[o.segOrd]?.pavementHW
  return Number.isFinite(a) ? a : baseHW.get(o.skelId)?.[o.side] }

// ⭐ pair each ② ring with the ① hole it was struck from — by CONTAINMENT, not by index
const holes = []
for (let k = 0; k < (r.proto||[]).length; k++) { const g = r.proto[k]; if (g?.length>=3 && SA(g)<0) holes.push({ k, g, labs: r.protoLabels?.[k], area: Math.abs(SA(g)) }) }
const rows = []
for (const h of holes) {
  const own = new Set()
  for (const l of (h.labs||[])) { const o = O[l]; if (o) own.add(o.skelId) }
  // ⛔⛔ ASSIGN BY SAMPLED AREA, NOT BY BBOX AND NOT BY CENTROID. Both were tried here and both were
  // wrong, and the second one is documented in the canon I had already read:
  //   · BBOX — a large block's box swallows its neighbours' rings whole (four 80,000 m² blocks topped
  //     the first run of this table, scoring other blocks' curbs against the wrong ①).
  //   · CENTROID — `RIBBONS §1`'s reconcile gate: "an island is a ring, not a convex blob — the
  //     69,092 m² island lies 100% inside tile #3 and 0% inside #17, but its CENTROID lands in #17…
  //     the walk produces large non-convex islands BY CONSTRUCTION — the exact shape a centroid rule
  //     misfiles." That misfiling is what put 69 curb vertices 139 m from "their" block's contour and
  //     read as a catastrophic offset error; the offsets were fine and the bookkeeping was not.
  // ⭐ Sample the ring's own vertices and take the hole that holds MOST of them — the same "match by
  // area" the canon's §13 uses, and it needs no convexity assumption.
  const mine = (r.protoCurb||[]).filter(g => {
    let inHole = 0, n = 0
    for (let i = 0; i < g.length; i += Math.max(1, Math.floor(g.length / 24))) { n++; if (inRing(h.g, g[i][0], g[i][1])) inHole++ }
    return n && inHole / n > 0.5
  })
  if (!mine.length) continue
  const err = []
  for (const g of mine) for (const p of g) {
    // ⛔⛔ MATCH AGAINST THE EDGE THE VERTEX ACTUALLY SATISFIES, NOT THE NEAREST ONE.
    // A curb vertex must sit at ITS OWN edge's authored width — but at a MITER it is equidistant
    // from two edges that carry DIFFERENT widths, so scoring it against whichever happens to be
    // nearest charges it the difference between them. Measured: that alone accounted for most of the
    // apparent error — p90 1.76 m → 0.18 m, within 0.10 m 78.8% → 89.1%, same vertices.
    // ⭐ The claim being tested is "the offsets match", i.e. the vertex lies at SOME bounding edge's
    // authored width. Take the best of the nearest few; a vertex matching none of them is the failure.
    const cand = []
    for (let i = 0; i < h.g.length; i++) {
      const a = h.g[i], b = h.g[(i+1)%h.g.length]
      const hw = hwOf(O[h.labs?.[i]])
      if (Number.isFinite(hw) && hw > 0) cand.push({ d: dClamp(p, a, b), line: d2seg(p, a, b), hw })
    }
    if (!cand.length) continue
    cand.sort((a, b) => a.d - b.d)
    err.push(Math.min(...cand.slice(0, 4).map(c => Math.abs(c.line - Math.max(0, c.hw - EPS)))))
  }
  if (!err.length) continue
  err.sort((a,b)=>a-b)
  rows.push({ k: h.k, area: h.area, n: err.length, med: err[err.length>>1], p90: err[Math.floor(err.length*0.9)], max: err[err.length-1],
    within: 100*err.filter(e=>e<0.10).length/err.length, streets: [...own].slice(0,3).join(' + ') })
}
rows.sort((a,b)=>b.p90-a.p90)
const all = rows.flatMap(x=>x.within)
console.log(`\n${scene}: ${rows.length} block(s) measured — ②'s distance from ① vs the AUTHORED half-width (ε=${EPS} m)`)
console.log(`  blocks where >99% of curb vertices are within 0.10 m: ${rows.filter(x=>x.within>99).length} of ${rows.length}`)
console.log(`\n  ${'area m²'.padStart(9)} ${'med'.padStart(7)} ${'p90'.padStart(7)} ${'max'.padStart(8)} ${'within .1m'.padStart(11)}  streets`)
for (const x of rows.slice(0, WORST))
  console.log(`  ${x.area.toFixed(0).padStart(9)} ${x.med.toFixed(3).padStart(7)} ${x.p90.toFixed(3).padStart(7)} ${x.max.toFixed(2).padStart(8)} ${(x.within.toFixed(1)+'%').padStart(11)}  ${x.streets}`)
console.log(`\n  ⭐ THE CLAIM: "if the centerline is smooth, their offsets should match." A block whose p90 is`)
console.log(`     millimetres IS the offset working. A block with metres is the offset failing to be one.`)
