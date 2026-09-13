#!/usr/bin/env node
// ⛔⛔ IS THE ② LEG TAIL JUST THE CORNER REACHING FURTHER THAN 12 m? — the discriminator that
// decides whether the node handles are the WHOLE job or only half of it.
//
// WHY. `claims-proto-curb.mjs` splits ②'s vertices at a 12 m radius and reports LEG vs CORNER.
// The corner row is expected to miss (the authored R lives in the node's bezier handles and
// those are not built — `RIBBONS §1`). But the LEG row also has a tail, and `RIBBONS §1` marks
// it OPEN with "measure BEFORE Gate C". ⛔ 12 m IS AN ARBITRARY CUTOFF, so "leg" and "corner"
// are not two populations — they are one population cut at a guess.
//
// THE MEASUREMENT, and it is the definition rather than a proxy: bin every non-highway ②
// vertex by its distance to the nearest chain endpoint, and report the deviation profile per
// bin. Two outcomes, and they prescribe different work:
//   DECAYS to ~0 → the tail IS corner reach. Building the handles closes it. Gate C is not a
//     separate construction and must not be started from "a construction is owed" (§1's own
//     warning, after Benton showed the width step needs no rule).
//   PLATEAUS at distance → there is a mid-leg error the handles cannot touch. That is Gate C,
//     and it is real.
//
// ⛔ AUTHORED STATE ONLY, through `_proto-feed` (Layer 0 q3) — measured: dropping LS's
// blockCustoms moves ②'s curb by 21,142 m², so a bare run scores the wrong map.
// ⛔ The baseline is the iA built by THIS SAME RUN, never `public/baked/*/shape.json`, which
// was frozen before the current curve fit ("verify the baseline before comparing to it").
// ⛔ Grade-separated rings are EXCLUDED: the shipped curb builds no highway curb at all, so
// they have no baseline and averaging them in makes the number meaningless.
// ▶ node scratch/claims-proto-leg-tail-is-corner-reach.mjs [scene ...]
import { feed, buildProto } from './_proto-feed.mjs'

const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')

const d2seg = (p, a, b) => { const ex = b[0]-a[0], ez = b[1]-a[1], L2 = ex*ex+ez*ez||1
  let t = ((p[0]-a[0])*ex + (p[1]-a[1])*ez)/L2; t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0]-(a[0]+ex*t), p[1]-(a[1]+ez*t)) }
const q = (a, fr) => { const s = [...a].sort((x,y)=>x-y); return s.length ? s[Math.min(s.length-1, Math.floor(s.length*fr))] : NaN }

// bins in metres from the nearest chain endpoint — open-ended at the top so nothing is dropped
const EDGES = [0, 3, 6, 12, 20, 30, 50, 80, Infinity]

let failed = false
for (const scene of scenes) {
  const f = feed(scene)
  if (!f) { failed = true; continue }
  const r = buildProto(f, { emitArtifact: true })   // the baseline iA is minted by this same run
  if (!r.protoCurb?.length) { console.log(`⛔ ${scene}: ② built no curb rings — NOT measured`); failed = true; continue }

  // the baseline: the same run's own iA
  const iA = []
  for (const t of (r._shapeArtifact || [])) for (const ring of (t.iA || [])) iA.push(ring)
  if (!iA.length) { console.log(`⛔ ${scene}: no iA in this run's artifact — NOT measured`); failed = true; continue }

  // a uniform grid over the baseline so nearest-edge lookup is not O(rings) per vertex
  const CELL = 25
  const grid = new Map()
  const key = (cx, cz) => cx + ',' + cz
  for (const rg of iA) for (let i = 0; i < rg.length; i++) {
    const a = rg[i], b = rg[(i+1) % rg.length]
    const x0 = Math.min(a[0],b[0]), x1 = Math.max(a[0],b[0]), z0 = Math.min(a[1],b[1]), z1 = Math.max(a[1],b[1])
    for (let cx = Math.floor(x0/CELL); cx <= Math.floor(x1/CELL); cx++)
      for (let cz = Math.floor(z0/CELL); cz <= Math.floor(z1/CELL); cz++) {
        const k = key(cx, cz); let e = grid.get(k); if (!e) grid.set(k, e = []); e.push([a, b])
      }
  }
  // ⛔ THE SEARCH IS BOUNDED, AND AN UNMATCHED VERTEX IS ITS OWN FAILING CLASS — never folded
  // into a magnitude. `litmus-curb-parallel.mjs:86` silently `continue`s past a tile it cannot
  // measure, so "this block has no curb" prints as "bows 3.9 m" (`ROADMAP A05`). An Infinity
  // averaged into a percentage is the same substitution with a different sign.
  const dToBaseline = (p) => {
    let best = Infinity
    for (let ring = 0; ring < 24 && !(best < ring * CELL); ring++) {
      const cx0 = Math.floor(p[0]/CELL), cz0 = Math.floor(p[1]/CELL)
      for (let cx = cx0-ring; cx <= cx0+ring; cx++) for (let cz = cz0-ring; cz <= cz0+ring; cz++) {
        if (ring && Math.abs(cx-cx0) !== ring && Math.abs(cz-cz0) !== ring) continue
        for (const [a, b] of (grid.get(key(cx, cz)) || [])) { const d = d2seg(p, a, b); if (d < best) best = d }
      }
    }
    return best
  }

  // nearest chain ENDPOINT — the node, which is where a handle would live
  const nodes = []
  for (const s of f.ribbons.streets) if (s.points?.length >= 2) { nodes.push(s.points[0], s.points.at(-1)) }
  const nGrid = new Map()
  for (const n of nodes) { const k = key(Math.floor(n[0]/CELL), Math.floor(n[1]/CELL)); let e = nGrid.get(k); if (!e) nGrid.set(k, e = []); e.push(n) }
  const dToNode = (p) => {
    let best = Infinity
    for (let ring = 0; ring < 12 && !(best < ring * CELL); ring++) {
      const cx0 = Math.floor(p[0]/CELL), cz0 = Math.floor(p[1]/CELL)
      for (let cx = cx0-ring; cx <= cx0+ring; cx++) for (let cz = cz0-ring; cz <= cz0+ring; cz++) {
        if (ring && Math.abs(cx-cx0) !== ring && Math.abs(cz-cz0) !== ring) continue
        for (const n of (nGrid.get(key(cx, cz)) || [])) { const d = Math.hypot(p[0]-n[0], p[1]-n[1]); if (d < best) best = d }
      }
    }
    return best
  }

  const bins = EDGES.slice(0, -1).map(() => [])
  const unmatched = EDGES.slice(0, -1).map(() => 0)
  let gsRings = 0, gsVerts = 0
  for (let k2 = 0; k2 < r.protoCurb.length; k2++) {
    if (r.protoCurbGs?.[k2]) { gsRings++; gsVerts += r.protoCurb[k2].length; continue }
    for (const p of r.protoCurb[k2]) {
      const dn = dToNode(p)
      let bi = EDGES.findIndex((e, i) => dn >= e && dn < EDGES[i+1]); if (bi < 0) bi = bins.length - 1
      const d = dToBaseline(p)
      if (Number.isFinite(d)) bins[bi].push(d); else unmatched[bi]++
    }
  }

  console.log(`\n${'='.repeat(76)}\n${scene}  — ② vertex deviation from this run's own iA, by distance to nearest node`)
  console.log(`   authoring: ${r.protoAuthoring}`)
  console.log(`   ⛔ excluded: ${gsRings} grade-separated ring(s) / ${gsVerts} vertices (no shipped highway curb to compare to)`)
  console.log(`\n   ${'distance to node'.padEnd(18)} ${'n'.padStart(7)} ${'median'.padStart(9)} ${'p90'.padStart(9)} ${'within 0.10 m'.padStart(14)} ${'UNMATCHED'.padStart(10)}`)
  const within = []
  bins.forEach((a, i) => {
    if (!a.length) return
    const w = 100 * a.filter(d => d < 0.1).length / a.length
    within.push({ lo: EDGES[i], w, n: a.length })
    const label = EDGES[i+1] === Infinity ? `${EDGES[i]}+ m` : `${EDGES[i]}–${EDGES[i+1]} m`
    console.log(`   ${label.padEnd(18)} ${String(a.length).padStart(7)} ${q(a,.5).toFixed(3).padStart(9)} ${q(a,.9).toFixed(3).padStart(9)} ${(w.toFixed(1)+'%').padStart(14)} ${String(unmatched[i]).padStart(10)}`)
  })

  // ⛔ THE VERDICT IS READ OFF THE FAR BINS, NOT OFF AN AGGREGATE. The question is whether the
  // profile still improves once you are well away from every node.
  const unmatchedTotal = unmatched.reduce((n, v) => n + v, 0)
  const matchedTotal = bins.reduce((n, a) => n + a.length, 0)
  if (unmatchedTotal) console.log(`\n   ⛔ ${unmatchedTotal} vertex/vertices found NO baseline edge within ${24 * CELL} m — UNMEASURABLE, reported as its own class and excluded from every statistic above.`)
  if (unmatchedTotal > matchedTotal * 0.01) {
    console.log(`   ⛔⛔ ${(100 * unmatchedTotal / (unmatchedTotal + matchedTotal)).toFixed(1)}% of vertices are UNMEASURABLE — this scene gets NO VERDICT. The instrument, not the geometry, is what failed; fix it before reading anything into these rows.`)
    failed = true
    continue
  }
  const far = within.filter(b => b.lo >= 20)
  const farN = far.reduce((n, b) => n + b.n, 0)
  const farW = farN ? far.reduce((s, b) => s + b.w * b.n, 0) / farN : NaN
  console.log(`\n   far field (≥20 m from any node): n=${farN}, within 0.10 m ${farW.toFixed(1)}%`)
  if (!farN) { console.log('   ⚠️ no far-field vertices — this scene cannot answer the question. NOT "clean".'); failed = true }
  else if (farW >= 99) console.log('   ⭐ DECAYS — the tail is CORNER REACH. Build the handles; Gate C is not a separate construction.')
  else { console.log(`   ⛔ PLATEAUS — ${(100-farW).toFixed(1)}% of far-field vertices still miss. A mid-leg error the handles cannot touch. Gate C is real.`); failed = true }
}

console.log(`\n${failed ? '⛔ FAIL — see the far-field rows' : '✅ the tail is corner reach on every scene measured'} — re-run this; do not quote its digits.`)
process.exit(failed ? 1 : 0)
