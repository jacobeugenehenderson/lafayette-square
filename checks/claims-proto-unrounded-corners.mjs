// ⛔ WHICH corners are still square, classified by CARRIED IDENTITY — so the remaining work is a
// named set of classes, not "some corners look wrong".
// ▶ node scratch/claims-proto-unrounded-corners.mjs [scene ...]
import { feed, buildProto } from './_proto-feed.mjs'

for (const scene of (process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square'])) {
  const f = feed(scene); if (!f || f.curbWidth == null) continue
  const tg = buildProto(f, { protoProducer: true })
  const O = tg.protoOwners || []
  const PP = f.ribbons.protopolygon
  // a block ring is "single-street" when no non-grade-separated owner change occurs on it
  const cls = { sameOwner: 0, ownerChange: 0, boundary: 0, gradeSep: 0, noLabel: 0 }
  let sharp = 0
  const curbs = tg.protoCurb || [], labsOf = tg._protoCurbLabs || null
  // fall back to the artifact's iA + runs when per-vertex labels are not exported
  for (const r of curbs) {
    const n = r.length
    for (let i = 0; i < n; i++) {
      const P = r[(i-1+n)%n], V = r[i], N = r[(i+1)%n]
      const d1 = Math.atan2(V[1]-P[1], V[0]-P[0]), d2 = Math.atan2(N[1]-V[1], N[0]-V[0])
      let t = (d2-d1)*180/Math.PI; while (t>180) t-=360; while (t<-180) t+=360
      if (Math.abs(t) < 60 || Math.abs(t) > 120) continue
      sharp++
    }
  }
  // classify on ①'s BLOCK rings instead — that is where the identity lives
  const sa = g => { let a=0; for (let i=0;i<g.length;i++){const[x1,y1]=g[i],[x2,y2]=g[(i+1)%g.length];a+=x1*y2-x2*y1} return a/2 }
  let bSharp = 0
  const b = { bendHard: 0, bendCurved: 0, boundaryEdge: 0, gradeSep: 0, unlabelled: 0, realChange: 0 }
  for (let k = 0; k < PP.blocks.length; k++) {
    const g = PP.blocks[k], L = PP.blockLabels[k], n = g.length
    const all = [...L, ...((PP.blockHoleLabels||[])[k]||[]).flat()]
    let gsN = 0; for (const l of all) if (PP.owners[l]?.gradeSeparated) gsN++
    if (gsN > all.length/2) continue
    for (let i = 0; i < n; i++) {
      const P = g[(i-1+n)%n], V = g[i], N = g[(i+1)%n]
      const d1 = Math.atan2(V[1]-P[1], V[0]-P[0]), d2 = Math.atan2(N[1]-V[1], N[0]-V[0])
      let t = (d2-d1)*180/Math.PI; while (t>180) t-=360; while (t<-180) t+=360
      if (Math.abs(t) < 30) continue
      bSharp++
      const a1 = PP.owners[L[(i-1+n)%n]], a2 = PP.owners[L[i]]
      if (!a1 || !a2 || a1.skelId == null || a2.skelId == null) { b.unlabelled++; continue }
      if (a1.gradeSeparated || a2.gradeSeparated) { b.gradeSep++; continue }
      if (String(a1.skelId).startsWith('__') || String(a2.skelId).startsWith('__')) { b.boundaryEdge++; continue }
      if (a1.skelId !== a2.skelId) { b.realChange++; continue }
      // ⭐ SAME owner both sides — the live detector asks the SECOND question here: does the node
      // have BROKEN handles? (`RIBBONS §1`: broken handles turn, continuous handles ease.)
      // ⛔ This probe MUST mirror `protoRAt` or it reports a class the code already handles — it
      // did exactly that for one pass, still counting 558 "unrounded" bends after they were fixed.
      if (a1.hard && a2.hard) b.bendHard++
      else b.bendCurved++
    }
  }
  console.log(`${scene}: ${sharp} turns of 60–120° survive on the CURB`)
  console.log(`\n① block-ring vertices turning >=30°, by CARRIED IDENTITY (${bSharp} total):`)
  console.log(`  ✅ owner CHANGES — the ease sees these            : ${b.realChange}`)
  console.log(`  ✅ same owner, BROKEN handles (a bend) — eased too: ${b.bendHard}`)
  console.log(`  ·  same owner, a BEZIER runs through — already smooth, must NOT be filleted: ${b.bendCurved}`)
  console.log(`  ·  a __boundary__ edge (the map edge, no curb) : ${b.boundaryEdge}`)
  console.log(`  ·  grade-separated                             : ${b.gradeSep}`)
  console.log(`  ·  unlabelled                                  : ${b.unlabelled}`)
  console.log(`\n⭐ The live detector is "the OWNER changed OR the node has BROKEN handles" — both carried`)
  console.log(`   identity, no angle threshold anywhere. A bezier node is left alone by ruling.`)
}
