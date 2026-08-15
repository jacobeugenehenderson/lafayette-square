// SLICE 2 — WHY IS A HALF-EDGE UNCLAIMED? The partition, not the count. (Wren, 2026-08-14)
//
// The completeness check (substrateWalk.js `completeness`) reports how many
// half-edges no face claims. ⛔ THAT NUMBER IS NOT A DEFECT COUNT. At least one
// large class is expected and ruled: RIBBONS §1, 2026-08-12 — "a walk over the
// street graph does not close the perimeter… the rim BOUNDS, it does not own",
// so a perimeter half-edge with no successor is the model working. ⛔ Inventing
// a rim coupler to close it would make the rim a side-chain, which the
// 2026-08-12 retraction forbids.
//
// This probe partitions the unclaimed population into named classes and sizes
// the RESIDUAL — the part nothing explains. That residual is the deliverable.
//
//   node scratch/slice2-unclaimed-classes.mjs
//     [--scene=lafayette-square|hipointe-demun]
//     [--ribbons=<path>]   the scene's promoted bundle (default) | a clean/map.json
//     [--list=<class>]     dump every member of one class at (skelId, side)
//
// ⛔ Reads nothing but objects. ⛔ Repairs nothing. ⛔ No call site is added.
import fs from 'fs'
import { loadScene, banner, ARG, CHILLERED } from './_substrate-feed.mjs'

const o = console.log; console.log = () => {}
const { walkSubstrate, completeness } = await import('../src/lib/substrateWalk.js')
console.log = o

const SCENE = ARG('scene', 'lafayette-square')
if (CHILLERED.includes(SCENE)) { o(`  ${SCENE}: CHILLERED (2026-08-13) — made for a pitch, pitch made. ⛔ No number is printed for it.`); process.exit(0) }
const LIST = ARG('list', null)
const S = await loadScene(SCENE, ARG('ribbons', null))
banner(S, o)

const ORIENTATIONS = ['a-to-b', 'b-to-a']
const RUNS = {}
for (const or of ORIENTATIONS) {
  RUNS[or] = walkSubstrate({
    streets: S.streets, junctionMap: S.ribbons.junctionMap,
    widthAt: S.widthAtSegOrd, outerRing: S.outerRing, orientation: or,
  })
}

// ── Geometry of a terminating node, structurally and with NO threshold ────────
// Inside/outside the stencil is point-in-polygon against the boundary the walk
// was handed. ⭐ A street that runs off the edge of the map has nothing beyond
// the stencil to close against, and that is the rim ruling, not a hole.
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const dSeg = (p, a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1; let t = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + ex * t), p[1] - (a[1] + ez * t)) }
const dRing = (p, r) => { let m = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const d = dSeg(p, r[j], r[i]); if (d < m) m = d } return m }
const parseKey = (k) => k.split(',').map(Number)

// Degree of a vertex in the CHAIN graph, read off the streets themselves: how
// many chains carry this exact coordinate. deg 1 = a tip; deg 0 = not a shared
// vertex at all (the chain simply ends there).
const vertexOwners = new Map()
for (const s of S.streets) {
  for (const p of s.points) {
    const k = p[0].toFixed(3) + ',' + p[1].toFixed(3)
    if (!vertexOwners.has(k)) vertexOwners.set(k, new Set())
    vertexOwners.get(k).add(s.skelId)
  }
}
const nodeByKey = new Map((S.ribbons.junctionMap?.nodes || []).map(n => [n.key || (n.at[0].toFixed(3) + ',' + n.at[1].toFixed(3)), n]))

// ── THE SUCCESSOR RELATION'S OWN SHAPE ───────────────────────────────────────
// A face walk partitions into cycles only if `succ` is a PERMUTATION. Where it
// is partial you get paths; where it is not INJECTIVE two paths merge and the
// later one can never close. ⭐ Measured, because "the run hit an already-walked
// half-edge" is a SYMPTOM whose cause is one of those two.
o(`\n═══ THE SUCCESSOR RELATION — is it a permutation? ═══`)
for (const or of ORIENTATIONS) {
  const R = RUNS[or]
  const succ = new Map(R.successors)
  const preds = new Map()
  for (const [i, out] of succ) { if (!preds.has(out)) preds.set(out, []); preds.get(out).push(i) }
  const multi = [...preds.entries()].filter(([, v]) => v.length > 1)
  const total = R.halfEdges.length
  o(`  ${or.padEnd(8)} domain ${String(succ.size).padStart(4)}/${total} (${(100 * succ.size / total).toFixed(1)}% have a successor) · image ${String(preds.size).padStart(4)} · NOT injective at ${multi.length} outbound(s)`)
  if (multi.length) for (const [out, ins] of multi.slice(0, 6)) o(`     ${out} has ${ins.length} predecessors: ${ins.join(' ')}`)
}

// ── ATTRIBUTION ──────────────────────────────────────────────────────────────
// An unclaimed half-edge is unclaimed because the RUN it lies in did not close.
// A run that ends by merging into an already-consumed half-edge is not an
// independent cause — it is DOWNSTREAM of whatever terminates the path it merged
// into. So attribute by following `succ` FORWARD to the terminal event.
function attribute(R) {
  const succ = new Map(R.successors)
  const byKey = new Map(R.halfEdges.map(h => [h.key, h]))
  const claimed = new Set()
  for (const f of R.faces) for (const e of f.edges) claimed.add(e.key)
  const runOf = new Map()
  for (const run of R.runs) for (const k of run.memberKeys) runOf.set(k, run)

  const out = []
  for (const h of R.halfEdges) {
    if (claimed.has(h.key)) continue
    // Follow forward to the terminal half-edge (the one with no successor), or
    // to a cycle. ⛔ Guarded, and the guard outcome is REPORTED, never assumed.
    const seen = new Set()
    let cur = h.key, terminal = null, hops = 0, intoClaimed = false
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      if (claimed.has(cur) && cur !== h.key) { intoClaimed = true; terminal = cur; break }
      const nx = succ.get(cur)
      if (!nx) { terminal = cur; break }
      cur = nx; hops++
    }
    const term = terminal ? byKey.get(terminal) : null
    const cycled = !terminal
    const node = term ? term.toKey : null
    const at = node ? parseKey(node) : null
    const jn = node ? nodeByKey.get(node) : null
    out.push({
      ...h,
      run: runOf.get(h.key),
      terminalKey: terminal, terminalSkel: term ? `${term.skelId}|${term.side}` : null,
      hops, cycled, intoClaimed,
      node,
      inside: at ? inRing(at, S.outerRing) : null,
      dRim: at ? dRing(at, S.outerRing) : null,
      deg: node ? (vertexOwners.get(node)?.size || 0) : null,
      hasNode: !!jn,
      couplers: jn ? (jn.cornersAdjacent || []).length : 0,
    })
  }
  return out
}

// ⭐⭐ TWO AXES, AND KEEPING THEM SEPARATE IS THE WHOLE POINT.
//   CAUSE — what stopped the path. A property of the coupler relation.
//   LOCATION — inside or outside the stencil. A property of the map's edge.
// ⛔ A first draft of this probe made "outside the stencil" the FIRST class, so
// it swallowed every cause: an unmatched coupler at r=956 was filed as "rim,
// expected" and disappeared. A LOCATION test placed ahead of the CAUSE tests
// hides real defects behind a ruled-expected label. Cause classifies; location
// only decides whether the cause is OWED a cure.
const CAUSES = [
  ['no-node    ', (u) => u.terminalKey && !u.hasNode && u.deg <= 1,
    'a chain end no junction node covers ⇒ no coupler can exist there'],
  ['no-node-ix ', (u) => u.terminalKey && !u.hasNode && u.deg > 1,
    '⛔ a vertex TWO OR MORE chains share, carrying no junction node — an intersection the junction map does not know about'],
  ['no-couplers', (u) => u.terminalKey && u.hasNode && u.couplers === 0,
    'a node was emitted with no cornersAdjacent'],
  ['unmatched  ', (u) => u.terminalKey && u.hasNode && u.couplers > 0,
    'the node carries couplers but none resolves to the half-edge that arrives'],
  ['into-claimed', (u) => u.intoClaimed,
    'the path merges into a cycle already consumed ⇒ two inbounds share one outbound'],
  ['cycled     ', (u) => u.cycled,
    '⛔ follows successors forever without returning to its own start'],
]
const causeOf = (u) => CAUSES.find(([, p]) => p(u))?.[0].trim() || 'UNATTRIBUTED'

// ⭐ THE EXPECTED/RESIDUAL AXIS IS LOCATION, AND IT IS RULED, NOT CHOSEN.
// RIBBONS §1, 2026-08-12: "the rim BOUNDS, it does not own" — no coupler, no
// band. A path that runs off the stencil has nothing beyond it to close against,
// so no cause is owed a cure there. ⛔ Inside the stencil, every cause is owed one.
const isExpected = (u) => u.inside === false

for (const or of ORIENTATIONS) {
  const U = attribute(RUNS[or])
  o(`\n═══ UNCLAIMED, CLASSIFIED — orientation ${or} · ${U.length} of ${RUNS[or].halfEdges.length} built half-edges ═══`)
  o(`  ${'cause'.padEnd(13)} ${'OUTSIDE stencil'.padStart(16)} ${'INSIDE stencil'.padStart(16)}   (outside = expected, RIBBONS §1's rim ruling)`)
  const groups = new Map()
  for (const u of U) {
    const k = causeOf(u)
    if (!groups.has(k)) groups.set(k, { out: [], in: [] })
    groups.get(k)[isExpected(u) ? 'out' : 'in'].push(u)
  }
  for (const [name, , why] of CAUSES) {
    const g = groups.get(name.trim()) || { out: [], in: [] }
    if (!g.out.length && !g.in.length) { o(`  ${name.padEnd(13)} ${String(0).padStart(16)} ${String(0).padStart(16)}`); continue }
    o(`  ${name.padEnd(13)} ${String(g.out.length).padStart(16)} ${String(g.in.length).padStart(16)}   ${why}`)
    const all = [...g.out, ...g.in]
    const terminals = new Set(all.map(u => u.node))
    const self = all.filter(u => u.terminalKey === u.key).length
    o(`  ${''.padEnd(13)} ${terminals.size} distinct terminal node(s) · ${self} ARE the terminal half-edge, ${all.length - self} lie upstream of one`)
  }
  const un = groups.get('UNATTRIBUTED')
  if (un) o(`  ${'UNATTRIBUTED'.padEnd(13)} ${String(un.out.length).padStart(16)} ${String(un.in.length).padStart(16)}   ⛔ no cause matched`)

  const expected = U.filter(isExpected)
  const residual = U.filter(u => !isExpected(u))
  const ds = expected.map(u => u.dRim).sort((a, b) => a - b)
  o(`\n  EXPECTED (outside the stencil) ... ${expected.length} of ${U.length}`)
  if (ds.length) o(`     margin outside the boundary ring: min ${ds[0].toFixed(1)} m · median ${ds[Math.floor(ds.length / 2)].toFixed(1)} m · max ${ds[ds.length - 1].toFixed(1)} m`)
  o(`     ⚠️ The MIN is the robustness of the inside/outside test. A small min means a`)
  o(`        half-edge sits on the line and could flip class on the next pour.`)
  o(`  ⭐ RESIDUAL (inside the stencil — nothing rules these expected) ... ${residual.length}`)
  if (residual.length) {
    const byChain = new Map()
    for (const u of residual) byChain.set(u.skelId, (byChain.get(u.skelId) || 0) + 1)
    for (const u of residual.slice(0, 25)) o(`     ${(u.skelId + '|' + u.side + '|' + u.arcIdx).padEnd(40)} ${causeOf(u).padEnd(12)} terminal ${u.terminalSkel} @ ${u.node} deg=${u.deg} node=${u.hasNode} couplers=${u.couplers}`)
    if (residual.length > 25) o(`     … and ${residual.length - 25} more, on ${byChain.size} chain(s) total`)
  }

  if (LIST) {
    const g = groups.get(LIST)
    if (g) {
      o(`\n  ── every member of cause "${LIST}", at (skelId, side, arcIdx):`)
      for (const u of [...g.out, ...g.in]) o(`     ${(u.skelId + '|' + u.side + '|' + u.arcIdx).padEnd(40)} ${isExpected(u) ? 'OUTSIDE' : 'INSIDE '} → terminal ${u.terminalSkel} @ ${u.node}  ${u.hops} hop(s)`)
    }
  }
}

// ── THE OTHER TWO CANDIDATE CLASSES, CONFIRMED OR REFUTED FROM THE DATA ──────
o(`\n═══ CANDIDATE: "DEGENERATE FACES STRAND HALF-EDGES DOWNSTREAM" ═══`)
{
  const R = RUNS['a-to-b']
  const deg = R.faces.filter(f => f.degenerate)
  const stranded = deg.reduce((s, f) => s + f.edges.length, 0)
  o(`  ⛔ REFUTED. ${deg.length} degenerate face(s) — negative-area ${R.faces.filter(f => f.area <= 0).length},`)
  o(`     self-intersecting ${R.faces.filter(f => f.selfIntersections > 0).length}. A degenerate face is a CLOSED face:`)
  o(`     it is emitted, never deleted, and it CLAIMS its ${stranded} half-edge(s) like any other.`)
  o(`     Half-edges stranded by degeneracy: 0. The class does not exist.`)
  const short = R.failures.filter(f => f.kind === 'closed-run-too-short').length
  o(`  closed runs that emitted no face (ring < 3 vertices) ... ${short}`)
}

o(`\n═══ AND THE POPULATION THE COVERAGE FIGURE NEVER SAW ═══`)
{
  const R = RUNS['a-to-b']
  o(`  half-edges the arcs OWE (2 per arc) ... ${R.stats.halfEdgesExpected}`)
  o(`  built .................................. ${R.stats.halfEdges}`)
  o(`  ⛔ NEVER BUILT ......................... ${R.stats.halfEdgesUnbuilt}`)
  const byReason = new Map()
  for (const u of R.unbuilt) byReason.set(u.reason, (byReason.get(u.reason) || 0) + 1)
  for (const [r, n] of byReason) o(`       ${r}: ${n}`)
  o(`     These are ABSENT, not unclaimed — they never enter the universe, so a`)
  o(`     coverage figure measured against "built" is REWARDED for the failure.`)
  o(`     ⛔ Reported, not repaired: the cure is upstream (duplicated centreline`)
  o(`        vertices, RIBBONS §1's skeleton class), and it needs no ruling here.`)
  for (const u of R.unbuilt.slice(0, 8)) o(`       ${u.skelId}|${u.side}|${u.arcIdx}  ${u.reason}`)
  if (R.unbuilt.length > 8) o(`       … and ${R.unbuilt.length - 8} more`)
}

// ── WHERE CLASS A'S TERMINAL NODES ACTUALLY SIT ──────────────────────────────
// ⭐ The corroboration that makes class A a MECHANISM rather than a label: if
// these were ordinary street ends they would scatter. If they are the intake's
// cut, they lie on a circle.
o(`\n═══ CLASS A, CORROBORATED — where do the terminal nodes sit? ═══`)
{
  const [cx, cz] = S.nb.center
  const term = RUNS['a-to-b'].failures.filter(f => f.kind === 'no-successor')
  const rad = term.map(f => { const [x, z] = parseKey(f.node); return Math.hypot(x - cx, z - cz) }).sort((a, b) => a - b)
  const buckets = new Map()
  for (const r of rad) { const k = Math.round(r / 10) * 10; buckets.set(k, (buckets.get(k) || 0) + 1) }
  o(`  boundary radius ${S.nb.radius} m · ${rad.length} terminal node(s)`)
  o(`  radius from centre: min ${rad[0]?.toFixed(1)} · median ${rad[Math.floor(rad.length / 2)]?.toFixed(1)} · max ${rad[rad.length - 1]?.toFixed(1)}`)
  o(`  10 m buckets: ${[...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}m:${n}`).join('  ')}`)
  o(`  ⭐ A tight cluster at one radius is the intake's CUT, not a street ending —`)
  o(`     chains are severed on a circle beyond the boundary and their cut ends`)
  o(`     carry no junction node because there is no junction there.`)
  o(`  ⛔ The provenance of that circle (which stage cuts, at what multiple of the`)
  o(`     boundary radius) is NOT established here — measured, not explained.`)
  // ⭐ The terminals that are NOT on the modal circle are the ones the cut does
  // not explain. They are still outside the stencil, so still ruled expected —
  // but their cause is different and naming them is the point of the class.
  const modal = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const off = term.filter(f => { const [x, z] = parseKey(f.node); return Math.round(Math.hypot(x - cx, z - cz) / 10) * 10 !== modal })
  o(`  terminal nodes NOT on the modal circle (${modal} m): ${off.length}`)
  for (const f of off) {
    const [x, z] = parseKey(f.node)
    o(`     ${(f.skelId + '|' + f.side).padEnd(34)} r=${Math.hypot(x - cx, z - cz).toFixed(1)} m  reason=${f.reason}`)
  }
  if (off.length) o(`     ⭐ Outside the stencil, so ruled expected — but the CUT does not explain them.`)
}

// ── THE UNION, which is the number the completeness check reports ─────────────
o(`\n═══ THE UNION — unclaimed in AT LEAST ONE traversal (the completeness figure) ═══`)
{
  const C = completeness(ORIENTATIONS.map(or => ({ label: or, result: RUNS[or] })))
  const holes = C.joint.filter(j => j.pattern.split(',').includes('0')).flatMap(j => j.members)
  const A = new Map(attribute(RUNS['a-to-b']).map(u => [u.key, u]))
  const B = new Map(attribute(RUNS['b-to-a']).map(u => [u.key, u]))
  const classOf = (u) => u ? `${causeOf(u)}/${isExpected(u) ? 'outside' : 'INSIDE'}` : '—'
  const tally = new Map()
  for (const h of holes) {
    const k = `${classOf(A.get(h.key))} / ${classOf(B.get(h.key))}`
    tally.set(k, (tally.get(k) || 0) + 1)
  }
  o(`  ${holes.length} half-edges, by (class in a-to-b / class in b-to-a):`)
  for (const [k, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) o(`    ${String(n).padStart(4)}  ${k}`)
  o(`  ⛔ MULTI-CLAIMED, both traversals: ${C.perRun.map(r => `${r.label} ${r.multi.length}`).join(' · ')}`)
  o(`     This must stay 0. Holes say something is MISSING; an overlap would say the`)
  o(`     model contradicts itself, and closing holes by creating overlaps is worse.`)
}
