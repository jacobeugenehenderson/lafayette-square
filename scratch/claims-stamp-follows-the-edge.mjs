#!/usr/bin/env node
// ⭐⭐⭐ DOES A ② CONTOUR EDGE CARRY THE OWNER OF THE ① EDGE IT LIES ALONG?
// ▶ node scratch/claims-stamp-follows-the-edge.mjs [scene...]
//
// ⛔ THIS IS THE DEFINITION, NOT A PROXY. ②'s whole claim is "identity carried THROUGH the offset,
// never recovered from ring geometry afterward" (`RIBBONS §1`). The carried thing must therefore be
// checkable against the geometry it claims to describe: the inward offset of ① edge E is a segment
// PARALLEL to E at the authored half-width, so the ② edge lying there must carry E's owner. Nothing
// here reads a chain, and nothing here recovers a label by proximity in production — the proximity
// match is the ORACLE, which is the one place it is legitimate (`claims-proto-curb-is-parallel`).
//
// ⭐ WHY BY LENGTH AND NEVER BY POINTS (`2ddb526c`): corner arcs are ~5% of a town's contour by
// LENGTH and ~50% by POINTS, so a per-point score reports the corners and ignores the block.
//
// ⚠️ CANDIDATES BY SEGMENT PROXIMITY, DISTANCE TO THE LINE — the correction `RIBBONS §1` records
// after five successive errors in `claims-proto-curb-is-parallel`. Picking candidates by
// line-distance lets a distant parallel edge match by coincidence.
import fs from 'fs'
import { feed, buildProto, ribbonsPath } from './_proto-feed.mjs'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const len = (v) => Math.hypot(v[0], v[1])
const inPoly = (p, r) => { let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) &&
        p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
  return c }
// perpendicular distance from P to the LINE through A,B — and the clamped distance to the SEGMENT
const distLine = (P, A, B) => { const d = sub(B, A), L = len(d) || 1
  return Math.abs((P[0] - A[0]) * d[1] - (P[1] - A[1]) * d[0]) / L }
const signedAreaOf = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const distSeg = (P, A, B) => { const d = sub(B, A), L2 = d[0] * d[0] + d[1] * d[1] || 1
  let t = ((P[0] - A[0]) * d[0] + (P[1] - A[1]) * d[1]) / L2; t = Math.max(0, Math.min(1, t))
  return len(sub(P, [A[0] + d[0] * t, A[1] + d[1] * t])) }

const CORNER_TOL = 18 * Math.PI / 180   // ⛔ the ruled curve-sample-vs-corner constant, not a new threshold
const MIN_EDGE = 0.5      // below this a ② edge is corner residue, not a leg
const PARALLEL = 0.995    // |cos| — an offset segment is parallel to its source by construction
const REACH = 30          // m: no authored half-width + ped envelope on these towns approaches this

let bad = 0
const scenes = process.argv.slice(2).filter(a => !a.startsWith('--'))
for (const scene of (scenes.length ? scenes : ['lafayette-square', 'hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  // ⛔ NO FALLBACK: the frozen ① is the subject. A scene poured before ① landed has none, and
  // re-minting one here would measure a DIFFERENT OBJECT than the one ② was struck from —
  // measured: a live mint with no boundary returns ①'s HOLES, whose rings are the reverse
  // orientation of the frozen `blocks` and carry a different label array.
  const P = JSON.parse(fs.readFileSync(ribbonsPath(scene), 'utf8')).protopolygon
  if (!P?.blocks?.length || !P?.blockLabels?.length || !P?.owners?.length) {
    console.log(`⛔ ${scene}: no frozen protopolygon blocks — SKIPPED LOUDLY, this scene was NOT checked`); bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles

  let ok = 0, wrong = 0, spill = 0, none = 0, unattr = 0, noBlock = 0, revRings = 0, fwdRings = 0
  const offs = [], okOffs = []
  const byPair = new Map()
  for (const t of T) {
    const rings = t.iaFull || [], stamps = t.iaStamp || [], runs = t.runs || []
    if (!rings.length) continue
    // ⭐ THE TILE'S OWN ① BLOCK, by CONTAINMENT — ② is an INWARD offset of it, so every ② vertex
    // lies inside. ⛔ Not by centroid (misfiles a non-convex island — `RIBBONS §1`) and not by
    // `t.ring`, which is POST-⊙: the disc is stamped last and re-emits the ring.
    const pts = rings.flat()
    // ⛔ SMALLEST CONTAINING BLOCK, not "the one that contains it" — blocks NEST (the frozen set is
    // a PolyTree and includes rim blocks), so containment alone matched two tiles to one block and
    // scored a whole tile against a neighbour's edges. Ambiguity here is the ORACLE's, not the map's:
    // a tile that matches none is REFUSED and counted, never scored against a guess.
    let bi = -1, bArea = Infinity
    for (let b = 0; b < P.blocks.length; b++) {
      const R = P.blocks[b]; if (R.length < 3) continue
      let all = true
      for (const q of pts) if (!inPoly(q, R)) { all = false; break }
      if (!all) continue
      const A = Math.abs(signedAreaOf(R)); if (A < bArea) { bArea = A; bi = b }
    }
    if (bi < 0) { noBlock++; continue }
    const BR = P.blocks[bi], BL = P.blockLabels[bi], m = BR.length
    const ownOf = (l) => (l == null ? null : P.owners[l])
    const kOf = (o) => (o ? `${o.skelId}|${o.side}|${o.segOrd}` : null)

    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri], stp = stamps[ri] || [], n = ring.length
      if (n < 3) continue
      // ⭐ ORIENTATION, RECORDED — the reason this check exists. Reported, never used to decide.
      { let f0 = 0, r0 = 0
        for (let q = 0; q < n; q++) { const A = ring[q], B = ring[(q + 1) % n]
          if (len(sub(B, A)) < 3) continue
          let best = null, bd = Infinity
          for (let e = 0; e < m; e++) { const d = distSeg(A, BR[e], BR[(e + 1) % m]); if (d < bd) { bd = d; best = e } }
          if (best == null) continue
          const dEdge = sub(BR[(best + 1) % m], BR[best]), dOut = sub(B, A)
          const c = (dEdge[0] * dOut[0] + dEdge[1] * dOut[1]) / ((len(dEdge) || 1) * (len(dOut) || 1))
          if (c > 0.9) f0++; else if (c < -0.9) r0++ }
        if (r0 > f0) revRings++; else fwdRings++ }

      for (let q = 0; q < n; q++) {
        const A = ring[q], B = ring[(q + 1) % n], L = len(sub(B, A))
        if (L < MIN_EDGE) continue
        const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], dir = sub(B, A)
        // the ① edge this ② edge LIES ALONG: parallel, and nearest by perpendicular distance to
        // its LINE among those whose SEGMENT is within reach of the midpoint.
        // ⛔ AND THE FOOT MUST LAND ON THE SEGMENT. A true offset runs ALONGSIDE its source, never
        // past its ends — without this a comb block (a face wrapping several dead-end spurs) offers
        // half a dozen long parallel walls within reach and the nearest LINE can be one the ② edge
        // is nowhere near. That is the permissive failure `RIBBONS §1` records in
        // `claims-proto-curb-is-parallel`: candidates by SEGMENT, distance to the LINE.
        let src = -1, bd = Infinity
        for (let e = 0; e < m; e++) {
          const EA = BR[e], EB = BR[(e + 1) % m], de = sub(EB, EA), Le = len(de)
          if (Le < 1e-9) continue
          const c = Math.abs((de[0] * dir[0] + de[1] * dir[1]) / (Le * (len(dir) || 1)))
          if (c < PARALLEL) continue
          const tf = ((M[0] - EA[0]) * de[0] + (M[1] - EA[1]) * de[1]) / (Le * Le)
          if (tf < -0.02 || tf > 1.02) continue
          if (distSeg(M, EA, EB) > REACH) continue
          const d = distLine(M, EA, EB)
          if (d < bd) { bd = d; src = e }
        }
        if (src < 0) { unattr += L; continue }
        const want = kOf(ownOf(BL[src]))
        const r = stp[q]
        const got = r == null ? null : `${runs[r].skelId}|${runs[r].side}|${runs[r].segOrd}`
        if (got == null) { none += L; continue }
        if (got === want) { okOffs.push(bd); ok += L; continue }
        // ⭐⭐ RULE 3, ONE INVARIANT ONE DEFECT (`POLYGON-FIRST §5`). Two failures were sharing this
        // counter and they are not the same thing:
        //   · SAME LEG — the ① edge that IS stamped is reachable from the true one without turning
        //     a corner. That is a straight run carrying a chain cut (a name transition, a `segOrd`
        //     boundary), and `SECTION §4` rule 5 rules it NOT a corner: "① has no nodes." A LEG is
        //     the contour between two CORNERS and it resolves to ONE arrangement, longest
        //     contributor wins. So this is the ruled model working, not a defect. CONTEXT.
        //   · ACROSS A CORNER — the stamped frontage is on the other side of a corner, i.e. a
        //     different SIDE of the block. That is the operator's "swap one, all four swap", and
        //     it is the gate.
        // ⛔ Merging them reports 20% where the defect is a fraction of it, which is how a cure
        // gets tuned against the wrong number.
        const gotEdges = []
        for (let e = 0; e < m; e++) if (kOf(ownOf(BL[e])) === got) gotEdges.push(e)
        let sameLeg = false
        for (const g of gotEdges) {
          for (const dir2 of [1, -1]) {
            let turn = 0, e = src, guard = 0
            while (e !== g && guard++ < m) {
              const v = dir2 > 0 ? (e + 1) % m : e
              const Pv = BR[(v - 1 + m) % m], Vv = BR[v], Nv = BR[(v + 1) % m]
              const a = Math.atan2(Nv[1] - Vv[1], Nv[0] - Vv[0]) - Math.atan2(Vv[1] - Pv[1], Vv[0] - Pv[0])
              if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) >= CORNER_TOL) { turn = 1; break }
              e = (e + dir2 + m) % m
            }
            if (!turn && e === g) { sameLeg = true; break }
          }
          if (sameLeg) break
        }
        if (sameLeg) { spill += L; continue }
        wrong += L; offs.push(bd); const kk = `${want} ← stamped ${got}`; byPair.set(kk, (byPair.get(kk) || 0) + L)
      }
    }
  }
  const tot = ok + wrong + spill + none + unattr
  const pc = (x) => `${(100 * x / (tot || 1)).toFixed(1)}%`
  console.log(`\n══ ${scene} · ${T.length} tile(s) · ${tot.toFixed(0)} m of ② contour ══`)
  console.log(`   ✅ stamp matches the ① edge it lies along   ${ok.toFixed(0)} m  ${pc(ok)}`)
  console.log(`   ⛔ stamped ACROSS A CORNER — another SIDE      ${wrong.toFixed(0)} m  ${pc(wrong)}   ← the gate`)
  console.log(`   ·  stamped from the same LEG (a chain cut)  ${spill.toFixed(0)} m  ${pc(spill)}   (context — SECTION §4 rule 5)`)
  console.log(`   ⛔ no stamp at all                          ${none.toFixed(0)} m  ${pc(none)}   ← the gate`)
  console.log(`   ·  no parallel ① edge in reach (corner arc) ${unattr.toFixed(0)} m  ${pc(unattr)}   (context)`)
  console.log(`   ·  ② rings traversed WITH ① ${fwdRings} · AGAINST ① ${revRings}` +
              (noBlock ? ` · ⛔ ${noBlock} tile(s) matched no single ① block and were NOT checked` : ''))
  const med = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] }
  console.log(`   ·  offset distance to the matched ① edge — median: OK ${med(okOffs).toFixed(2)} m · MISMATCHED ${med(offs).toFixed(2)} m   (a far one is the ORACLE reaching, not the map)`)
  for (const [k, v] of [...byPair].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`        ${v.toFixed(0)} m  ${k}`)
  if (wrong > 0.5 || none > 0.5) bad++
}
console.log(bad ? `\n⛔ FAIL — a ② edge carries an owner that is not the ① edge it was struck from. Authoring that owner repaints ground it does not front.`
                : `\n✅ PASS — every ② edge carries the owner of the ① edge it lies along.`)
process.exit(bad ? 1 : 0)
