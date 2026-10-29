// Candidate 3, built (DESIGN-candidate-3.md; Zob's rulings 2026-10-28): the cut-once open/close with PROVENANCE, every boolean on
// one noded arrangement (latticeNode.js#nodeCrossings with `self`, then latticeFaces.js#facesOf). Scratch first, measured against
// the integer form (compare.mjs --cand=provenance), then it moves into structures.mjs in place of openCloseAtStep.
//
// morph(region, d): offset the region's rings by d WITH TAGS (each raw edge names the region edge (ring, i) it offsets), resolve,
// then offset back by −d EMITTING THE REGION'S OWN LINES: the back-offset of an edge tagged (ring, i) IS that edge's line, so
//   · consecutive tags i, i+1 on one ring → the region's own vertex v₍ᵢ₊₁₎, integer, no arithmetic
//   · a tag run (tagRun.mjs) → the run's own vertices · a jog → kept · a cut → lineCrossOf(L_from, L_to), rounded once
//   · non-adjacent tags (a feature removed between two segments) → the cut join: one line twice (latticeNode#sameLine) → no
//     vertex; else lineCrossOf, or SQUARED past clipper's miter limit (parity, kept for the comparison: Boz) → a new cap line
//   · a null tag (an erode's square cap) → a NEW line, the cap's own back-offset, its joins computed once and rounded at birth
// Every failure refuses by name (the deck's cross-ring segment does, until Zob rules it).
import clipperLib from 'clipper-lib'
import { writeFileSync } from 'fs'
import { nodeCrossings, lineCrossOf, sameLine, NODE_BOUND, crossOf, LATTICE_STEP } from '../../src/lib/latticeNode.js'
import { facesOf, onLineTiered } from '../../src/lib/latticeFaces.js'
import { isRoundingSliver } from '../../cartograph/structures.mjs'
import { tagRun } from './tagRun.mjs'
const { IntPoint, Clipper, ClipperOffset, Paths, JoinType, EndType } = clipperLib
const SCALE = 1000, MITER_LIM = 0.5                 // clipper's constant for MiterLimit 2: parity only (Boz: derive or justify after)

const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], f = 1 / Math.hypot(dx, dy); return [dy * f, -dx * f] }   // clipper's GetUnitNormal
// a ring's raw offset curve at d, each point tagged with the region edge its OUTGOING raw edge offsets (null: a join's own edge)
// ⭐ STEP 1 AS THE DESIGN SAYS (Zob, 2026-10-29; no longer ClipperOffset point for point): EVERY join is the intersection of
// its two adjacent offset lines (in doubles: the raw curve is intermediate and only its topology leaves); a CONVEX join (the
// lines diverge: sinA·d > 0) past the miter limit is SQUARED, both cap ends on the two offset lines; a REFLEX join always takes
// the intersection. ⛔ No single-point branch and no detour through the source vertex: those are points that are not line
// intersections, and they gave Huron's backward step of two (a reflex near-straight chain with a 24 u middle edge)
function rawOffset(R, d, g, squares = null) {
  const n = R.length, N = R.map((a, j) => unit([a.X, a.Y], [R[(j + 1) % n].X, R[(j + 1) % n].Y])), out = []
  const put = (x, y, tag) => out.push({ X: Math.round(x), Y: Math.round(y), tag })
  for (let j = 0; j < n; j++) { const k = (j - 1 + n) % n, p = R[j], nk = N[k], nj = N[j], edge = { ring: g, i: j }
    if (SINGLE_POINT_BRANCH) { const sA = nk[0] * nj[1] - nj[0] * nk[1], cA = nk[0] * nj[0] + nk[1] * nj[1]   // ⛔ the mutant only
      if (Math.abs(sA * d) < 1.0 && cA > 0) { put(p.X + nk[0] * d, p.Y + nk[1] * d, edge); continue } }
    const sinA = Math.max(-1, Math.min(1, nk[0] * nj[1] - nj[0] * nk[1])), cosA = nk[0] * nj[0] + nk[1] * nj[1], r = 1 + cosA
    if (sinA * d > 0 && r < MITER_LIM) { const t = Math.tan(Math.atan2(sinA, cosA) / 4); if (squares) squares.push([p.X, p.Y])
      put(p.X + d * (nk[0] - nk[1] * t), p.Y + d * (nk[1] + nk[0] * t), null); put(p.X + d * (nj[0] + nj[1] * t), p.Y + d * (nj[1] - nj[0] * t), edge); continue }
    if (!(r > 0)) throw new Error(`⛔ the offset: ring ${g} turns straight back on itself at (${p.X / SCALE}, ${p.Y / SCALE}) (antiparallel edges): no join exists. Refusing.`)
    const q = d / r; put(p.X + (nk[0] + nj[0]) * q, p.Y + (nk[1] + nj[1]) * q, edge) }
  return out
}
const clean = (r) => { const o = []; for (const q of r) { const l = o[o.length - 1]; if (!l || l.X !== q.X || l.Y !== q.Y) o.push(q) }
  while (o.length > 1 && o[0].X === o[o.length - 1].X && o[0].Y === o[o.length - 1].Y) o.pop(); return o }
const distinct3 = (r) => new Set(r.map(q => q.X + ',' + q.Y)).size >= 3

// node `sets` (each a list of rings [{X, Y, tag?}]) together, self included, then the faces `keep` holds. → { rings, tags }
export function arrange(sets, keep, who, allTags = false, prefer = null, withTags = true) {
  const rings = [], setOf = []
  // ⭐ A RING OR PIECE WHOLLY BELOW THE LATTICE IS THE ROUNDING (Zob, 2026-10-29): judged BEFORE the arrangement by the kit's OWN
  // predicate (structures.mjs#isRoundingSliver: it erodes to nothing at NODE_BOUND, the rule that already tells a feature from the
  // rounding), dropped, COUNTED and NAMED (DROPPED: stage, set, area, centroid); never silent. nodeCrossings still refuses any
  // collapse that REACHES it
  const wholly = (c) => { if (NO_SLIVER_DROP) return false; const pp = [c.map(q => new IntPoint(q.X, q.Y))]; if (area(c) < 0) pp[0].reverse(); return isRoundingSliver(pp) }
  sets.forEach((S, si) => S.forEach(r => { const c = clean(r); if (!distinct3(c)) return
    if (wholly(c)) { let cx = 0, cy = 0; for (const q of c) { cx += q.X; cy += q.Y } DROPPED.push({ who, set: si, u2: Math.abs(area(c)), at: [+(cx / c.length / SCALE).toFixed(3), +(cy / c.length / SCALE).toFixed(3)] }); return }
    rings.push(c); setOf.push(si) }))
  if (!rings.length) return { rings: [], tags: [] }
  const input = rings.map((r, ri) => ({ p: r.map(q => [q.X / SCALE, q.Y / SCALE]), tag: `${who}#${ri}` }))
  let R
  try { R = nodeCrossings(input, { pairs: () => true, self: true, who }) }
  catch (e) { const m = /#(\d+) at \(.*collapsed/.exec(String(e.message)); if (m) { const r = rings[+m[1]]; e.message += ` [the ring as given: ${r.length} points ${JSON.stringify(r.map(q => [q.X, q.Y, q.tag ? `${q.tag.ring}:${q.tag.i}` : null]))}]` }
    // ⭐ Zob's minimal repro: the rings the verifier names, saved as given (before noding) with their set, to a fixture
    const ids = [...String(e.message).matchAll(new RegExp(`${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#(\\d+)`, 'g'))].map(m => +m[1])
    if (ids.length && process.env.CUTONCE_REPRO) writeFileSync(process.env.CUTONCE_REPRO, JSON.stringify({ who, error: String(e.message), rings: [...new Set(ids)].map(i => ({ i, set: setOf[i], tag: input[i].tag, p: input[i].p })) }))
    throw e }
  const edges = [], here = new Map()
  R.forEach((o, ri) => o.forEach((v, q) => { const w = o[(q + 1) % o.length]; edges.push({ a: v.k, b: w.k, set: setOf[ri], tag: rings[ri][v.edge]?.tag ?? null })
    // every vertex the noding INSERTED (src null: a hot pixel the segment was routed through), with the EMITTED segment it was
    // routed into: the emission invariant's second tier (Zob, 2026-10-29)
    if (v.src == null) { const r0 = rings[ri], a0 = r0[v.edge], b0 = r0[(v.edge + 1) % r0.length]; { const key = v.k[0] + ',' + v.k[1], sg = [[a0.X, a0.Y], [b0.X, b0.Y]]; (INSERTED.get(key) || INSERTED.set(key, []).get(key)).push({ who, seg: sg }); (here.get(key) || here.set(key, []).get(key)).push(sg) } } }))
  return facesOf(edges, keep, { sets: sets.length, who, allTags, prefer, inserted: here, tags: withTags && !(TAGS_OFF_AT === who.split(' ').pop()) })
}

// the back-offset: one eroded (or dilated) ring with its tags → the morphed ring's points, the region's own wherever unchanged
function emit(E, T, SRC, d, who, stat, LINES = null) {
  // tokens: L = a line { int: [a, b] } (a region edge) or { flt: [a, b] } (a new line); V = a fixed point
  // ⭐ PROVENANCE CROSSES THE STAGE BOUNDARY (Zob, 2026-10-29): a region edge's line is the LINE IT WAS BORN ON (`LINES[g][i]`:
  // P's own line, or a born line's two integer points), never a line re-derived through the region's rounded vertices
  const tok = []
  const lineOf = (g, i) => { const L = LINES?.[g]?.[i]; if (L) return L; const R = SRC[g], a = R[i], b = R[(i + 1) % R.length]; return [[a.X, a.Y], [b.X, b.Y]] }
  const Lsrc = (g, i) => ({ kind: 'L', g, i, int: lineOf(g, i) })
  let prevRunKey = null, lastRun = null
  for (let e = 0; e < E.length; e++) { const tg = T[e], p = E[e], q = E[(e + 1) % E.length]
    const tags = tg == null ? [] : Array.isArray(tg) ? tg : [tg]
    if (!tags.length) stat.lostTags = (stat.lostTags || 0) + 1, (stat.lostAt ||= []).length < 6 && stat.lostAt.push([p.X / SCALE, p.Y / SCALE, who])
    if (tags.some(x => x?.near)) stat.nearOut = (stat.nearOut || 0) + 1
    const lineTags = tags.filter(x => x && x.ring != null)
    const bornL = tags.find(x => x?.born)?.born
    if (tags.length && !lineTags.length && !tags.some(x => x?.base) && bornL) {
      // the born line ORIENTED ALONG THE BOUNDARY it now bounds (p → q, the region on its left), so its normal points outward:
      // a piece's own winding (reversed for the erode) says nothing about which side the region lies
      const BL = (bornL[1][0] - bornL[0][0]) * (q.X - p.X) + (bornL[1][1] - bornL[0][1]) * (q.Y - p.Y) < 0 ? [bornL[1], bornL[0]] : bornL, n = unit(BL[0], BL[1]), bornL2 = BL
      tok.push({ kind: 'L', flt: [[bornL2[0][0] - n[0] * d, bornL2[0][1] - n[1] * d], [bornL2[1][0] - n[0] * d, bornL2[1][1] - n[1] * d]], born: JSON.stringify(bornL2), at: p }); stat.newLines++; continue }
    if (tags.length && !lineTags.length && !tags.some(x => x?.base)) { tags.length = 0 }                   // near only: a new line from its own points
    else if (lineTags.length !== tags.length && !tags.some(x => x?.base)) { tags.splice(0, tags.length, ...lineTags) }
    if (tags.some(x => x?.base)) throw new Error(`[${who}] ⛔ the back-offset: (${JSON.stringify(tags.find(x => x?.base))}; with ${JSON.stringify(tags.filter(x => !x?.base).map(x => x.ring != null ? `${x.ring}:${x.i}` : x.born ? 'born' : 'near'))}) an eliminated stretch's base side (${[p.X, p.Y].map(v => v / SCALE)}) → (${[q.X, q.Y].map(v => v / SCALE)}) reached the boundary (it is born interior). Refusing.`)
    if (!tags.length) { // a null edge: a NEW line, the cap's own back-offset by −d
      const n = unit([p.X, p.Y], [q.X, q.Y]); tok.push({ kind: 'L', flt: [[p.X - n[0] * d, p.Y - n[1] * d], [q.X - n[0] * d, q.Y - n[1] * d]], at: p }); stat.newLines++; continue }
    // ⭐ consecutive eroded segments carrying the SAME tag set are one stretch of that run (the lines lie within rounding of each
    // other, so the noding cut the stretch into pieces each claimed by all of them): the run is emitted once, not once per piece
    const tkey = tags.length > 1 ? JSON.stringify(tags.filter(x => x?.ring != null).map(x => x.ring + ':' + x.i).sort()) : null
    if (tkey && tkey === prevRunKey) { stat.runRepeat = (stat.runRepeat || 0) + 1; continue }
    prevRunKey = tkey
    // ⭐ A MULTI-TAG TOKEN IS READ IN THE SOURCE RING'S FORWARD ORDER FROM ITS PREDECESSOR (Zob's ruling, 2026-10-29; Huron's pier: a
    // 65 mm segment at a neck carrying {0, 10}, read 10 then 0, made the join 14 → 10 backward). Several tags of ONE ring are ordered
    // by forward cyclic distance from the predecessor's last tag on that ring and pushed as consecutive lines, so every rule applies
    // to each change as if they were separate segments. Exact: the last must also precede the successor's first going forward, or
    // the call refuses by name with all three (the true non-monotone case)
    const ringsHere = new Set(tags.map(x => x.ring))
    if (!TAG_SET_ORDER && tags.length > 1 && ringsHere.size === 1) { const g = tags[0].ring, n = SRC[g].length, onG = (t) => (t == null ? [] : Array.isArray(t) ? t : [t]).filter(x => x?.ring === g).map(x => x.i)
      const pv = onG(T[(e - 1 + E.length) % E.length]), pred = lastRun && lastRun.ring === g ? lastRun.to : pv.length === 1 ? pv[0] : null
      // a tag inside the stretch just emitted on this ring is COVERED (the existing rule: a run already emitted is not re-emitted)
      const covered = (x) => lastRun && lastRun.ring === g && x !== lastRun.to && (x - lastRun.from + n) % n <= (lastRun.to - lastRun.from + n) % n
      let k2 = 1; while (k2 < E.length && JSON.stringify(onG(T[(e + k2) % E.length]).sort()) === JSON.stringify(onG(tg).sort())) k2++
      const nx = onG(T[(e + k2) % E.length])
      // ⭐ INSIDE ONE RUN (Zob's ruling, 2026-10-29; Huron's close at (−4326.715, −3328.738), a 4.24 u segment carrying 69435 and 69436
      // inside 69436's run): when the predecessor and the successor carry the SAME tag T and the token holds it, the token IS T and
      // continues T's run with no join; its other tags of this ring are claimants within the rounding (the transition rule's own
      // meaning), not emitted. T's line must hold both of the segment's ends within the tiered bound, or the call refuses by name
      if (!INSIDE_RUN_FORWARD && pred != null && nx.length === 1 && nx[0] === pred && tags.some(x => x.i === pred)) { const L = lineOf(g, pred)
        for (const v of [p, q]) if (!onLineTiered(L, [v.X, v.Y], (INSERTED.get(v.X + ',' + v.Y) || []).map(x => x.seg))) throw new Error(`[${who}] ⛔ the back-offset: the eroded segment (${[p.X, p.Y].map(c => c / SCALE)}) → (${[q.X, q.Y].map(c => c / SCALE)}) inside edge ${pred}'s run of ring ${g} has its end (${[v.X, v.Y].map(c => c / SCALE)}) off that edge's line beyond the tiered bound. Refusing.`)
        tok.push(Lsrc(g, pred)); stat.insideRun = (stat.insideRun || 0) + 1; continue }
      if (pred != null) { const pos = (x) => (x - pred + n) % n, ids = [...new Set(tags.map(x => x.i))].filter(x => !covered(x)).sort((a, b) => pos(a) - pos(b))
        const last = ids[ids.length - 1]
        // ⭐ A CLAIMANT THAT BREAKS THE ORDER IS THE ROUNDING (Plumb, 2026-10-29; PTown's five 'no forward order' sites, each a short source
        // edge between two near-collinear long ones, its offset vanished): a tag read after the successor's going forward is dropped when
        // its OWN offset line holds both of the segment's ends within the lattice's rounding (NODE_BOUND, two roundings at a vertex the
        // noding inserted: the tiered bound), the inside-run ruling's own meaning of a claimant. The kept tags read forward; none kept, the
        // token continues the predecessor. Any other order refuses by name, with all three
        let ids2 = ids
        if (nx.length === 1 && nx[0] !== last && pos(nx[0]) < pos(last)) {
          const keep = ids.filter(x => pos(x) <= pos(nx[0])), drop = ids.filter(x => pos(x) > pos(nx[0]))
          const offLine = (i) => { const L = lineOf(g, i), dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1], len = Math.hypot(dx, dy), nxv = dy / len, nyv = -dx / len
            return [p, q].every(v => { const ins = INSERTED.has(v.X + ',' + v.Y), dist = Math.abs((v.X - (L[0][0] + nxv * d)) * dy - (v.Y - (L[0][1] + nyv * d)) * dx) / len; return dist <= (ins ? 2 : 1) * NODE_BOUND }) }
          if (CLAIMANTS_KEPT || !drop.every(offLine))
  if (nx.length === 1 && nx[0] !== last && pos(nx[0]) < pos(last)) throw new Error(`[${who}] ⛔ the back-offset: the eroded segment (${[p.X, p.Y].map(v => v / SCALE)}) → (${[q.X, q.Y].map(v => v / SCALE)}) (${Math.hypot(q.X - p.X, q.Y - p.Y).toFixed(2)} u) carries ring ${g}'s edges ${ids.join(', ')}, and no forward order fits both its predecessor (edge ${pred}) and its successor (edge ${nx[0]}). Refusing.`)
          ids2 = keep.length ? keep : [pred]; stat.claimantsDropped = (stat.claimantsDropped || 0) + 1 }
        for (const i of ids2) tok.push(Lsrc(g, i))
        stat.orderedTokens = (stat.orderedTokens || 0) + 1; lastRun = { ring: g, from: ids2[0], to: ids2[ids2.length - 1] }; continue } }
    const r = tagRun(tags, SRC, { twoH: 2 * Math.abs(d), lineOf: LINES ? lineOf : null })
    if (!r.ok) throw new Error(`[${who}] ⛔ the back-offset: the eroded segment (${[p.X, p.Y].map(v => v / SCALE)}) → (${[q.X, q.Y].map(v => v / SCALE)}) carries tags ${JSON.stringify(tags)}: ${r.clause}. Refusing.`)
    stat[r.kind] = (stat[r.kind] || 0) + 1
    if (r.kind === 'transition') { // ordered by the neighbours: the tag of the ring the previous edge carries comes first
      const prev = T[(e - 1 + E.length) % E.length], pr = new Set((prev == null ? [] : Array.isArray(prev) ? prev : [prev]).map(t => t.ring))
      const [x, y] = pr.has(r.tags[1].ring) && !pr.has(r.tags[0].ring) ? [r.tags[1], r.tags[0]] : [r.tags[0], r.tags[1]]
      tok.push(Lsrc(x.ring, x.i), Lsrc(y.ring, y.i)); continue }
    const R = SRC[r.ring], n = R.length
    if (r.kind === 'cut') { tok.push(Lsrc(r.ring, r.from), { kind: 'V', p: r.X, cut: true }, Lsrc(r.ring, r.to)); continue }
    // ⭐ A RUN ALREADY EMITTED IS NOT RE-EMITTED (Huron, 2026-10-29): when the noding cuts one stretch of nearly collinear lines into
    // pieces claimed by overlapping runs, a run that starts INSIDE the stretch just emitted on this ring emits only its part
    // beyond it, and nothing if it is covered
    let from = r.from
    if (lastRun && lastRun.ring === r.ring) { const pos = (x) => (x - lastRun.from + n) % n
      const inside = (x) => pos(x) <= pos(lastRun.to)
      if (inside(r.to) && !inside(r.from)) throw new Error(`[${who}] ⛔ the back-offset: a tag run ${r.from}…${r.to} of ring ${r.ring} overlaps the stretch just emitted (${lastRun.from}…${lastRun.to}) and extends BACKWARD past its start (edges ${(() => { const o = []; for (let j = r.from; ; j = (j + 1) % n) { const p0 = R[j], p1 = R[(j + 1) % n]; o.push(`${j}: (${p0.X},${p0.Y})→(${p1.X},${p1.Y}) ${Math.hypot(p1.X - p0.X, p1.Y - p0.Y).toFixed(1)} u, line ${JSON.stringify(LINES?.[r.ring]?.[j] || 'own')}`); if (j === r.to || o.length > 8) break } return o.join(' · ') })()}; the tags on this segment ${JSON.stringify(tags.map(x => x.ring != null ? x.ring + ':' + x.i : x))}; THE SEGMENT (${p.X},${p.Y})→(${q.X},${q.Y}) length² ${(q.X - p.X) ** 2 + (q.Y - p.Y) ** 2}; each line's distance from its ends ${JSON.stringify(tags.filter(x => x.ring != null).map(x => { const l = LINES?.[x.ring]?.[x.i] || [[SRC[x.ring][x.i].X, SRC[x.ring][x.i].Y], [SRC[x.ring][(x.i + 1) % SRC[x.ring].length].X, SRC[x.ring][(x.i + 1) % SRC[x.ring].length].Y]], dx = l[1][0] - l[0][0], dy = l[1][1] - l[0][1], dd = (z) => +(Math.abs((z.X - l[0][0]) * dy - (z.Y - l[0][1]) * dx) / Math.hypot(dx, dy)).toFixed(3); return { tag: x.ring + ':' + x.i, fromP: dd(p), fromQ: dd(q) } }))}; segments before/after ${JSON.stringify([-2, -1, 1, 2].map(o => { const ee = (e + o + E.length) % E.length, tt = T[ee]; return { o, at: [E[ee].X, E[ee].Y], tags: (tt == null ? [] : Array.isArray(tt) ? tt : [tt]).map(x => x?.ring != null ? x.ring + ':' + x.i : Object.keys(x || {})[0]) } }))}). Refusing.`)
      if (inside(r.from)) { if (pos(r.to) <= pos(lastRun.to)) { stat.runCovered = (stat.runCovered || 0) + 1; continue } from = (lastRun.to + 1) % n; tok.push({ kind: 'V', p: [R[from].X, R[from].Y], own: true }); stat.runTrimmed = (stat.runTrimmed || 0) + 1 } }
    for (let j = from; ; j = (j + 1) % n) { tok.push(Lsrc(r.ring, j)); if (j === r.to) break; tok.push({ kind: 'V', p: [R[(j + 1) % n].X, R[(j + 1) % n].Y], own: true }) }
    lastRun = { ring: r.ring, from: lastRun && lastRun.ring === r.ring && from !== r.from ? lastRun.from : r.from, to: r.to } }
  // one line twice in a row is one line: the same region edge, or (exactly) the same line
  const t2 = []
  // ⭐ ONE LINE, TWO EDGES (Plumb, 2026-10-29; planted wallShort and PTown's wide fills): two region edges on ONE line in a row are one
  // line, but the merged token ENTERS at the first edge and LEAVES at the last, so the join out of it is read from the last edge (its
  // skipped arc, adjacency, run) and never from the first: kept from the first, the close's back-offset of a hole the dilate re-formed
  // read the join out as a cut across the arc 10…6, which runs the whole outer, and emitted that arc (the hole FILLED)
  for (const t of tok) { const l = t2[t2.length - 1]
    if (t.kind === 'L' && l?.kind === 'L' && ((t.born && t.born === l.born) || (t.g != null && t.g === l.g && t.i === l.i) || (t.int && l.int && sameLine({ a: t.int[0], b: t.int[1] }, { a: l.int[0], b: l.int[1] })))) {
      if (!MERGE_LEAVES_FIRST && t.g != null && !(t.g === l.g && t.i === l.i)) t2[t2.length - 1] = { ...l, out: { g: t.g, i: t.i, int: t.int } }
      continue }
    t2.push(t) }
  while (t2.length > 1 && t2[0].kind === 'L' && t2[t2.length - 1].kind === 'L' && ((t2[0].g != null && t2[0].g === t2[t2.length - 1].g && t2[0].i === t2[t2.length - 1].i))) t2.pop()
  // the joins: between two consecutive lines with no fixed point between
  const RUN = SRC.map((R, g) => (LINES?.[g] && !BY_EDGES ? runsOf(R, LINES[g]) : null))
  const out = [], outL = [], N = t2.length
  // ⭐ THE CORNER OF TWO LINES AT THE BACK-OFFSET, ONE HOME (Zob, 2026-10-29): a join whose lines DIVERGE in the back-offset past the
  // miter limit is SQUARED, whatever rule made the join (a cut, the own-vertex adjacency, a backward-adjacent pair): the cap a NEW
  // line placed as clipper places its square (|d| from the offset vertex, across the bisector), each end lineCross(L_cap, L_a)
  // and lineCross(L_cap, L_b), rounded once; an end past NODE_BOUND from its line refuses by name. Xf: the two lines' crossing
  // (for adjacent lines, their shared vertex). → true when it squared (the points pushed), false within the limit
  const capAt = (A, B, Xf, u) => { const na = unit(A[0], A[1]), nb = unit(B[0], B[1]), cosA = na[0] * nb[0] + na[1] * nb[1], sinA = na[0] * nb[1] - nb[0] * na[1]
    if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE); if (Math.hypot(Xf[0] - tx, Xf[1] - ty) < 1500)
      console.log('TRACE-CAP', JSON.stringify({ who, at: Xf.map(v => +(v / SCALE).toFixed(3)), A, B, d: +d.toFixed(1), turnDeg: +(Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI).toFixed(2), diverges: sinA * -d > 0, pastLimit: 1 + cosA < MITER_LIM, squared: 1 + cosA < MITER_LIM && sinA * -d > 0 })) }
    if (!(1 + cosA < MITER_LIM && sinA * -d > 0)) return false
    const dLine = (q, L) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.abs((q[0] - L[0][0]) * dy - (q[1] - L[0][1]) * dx) / Math.hypot(dx, dy) }
    const tt = Math.tan(Math.atan2(sinA, cosA) / 4), dd = -d
    const c = [Xf[0] - (na[0] + nb[0]) * dd / (1 + cosA), Xf[1] - (na[1] + nb[1]) * dd / (1 + cosA)]
    const cap = [[c[0] + dd * (na[0] - na[1] * tt), c[1] + dd * (na[1] + na[0] * tt)], [c[0] + dd * (nb[0] + nb[1] * tt), c[1] + dd * (nb[1] - nb[0] * tt)]]
    const e1 = fcross(cap, A).map(Math.round), e2 = fcross(cap, B).map(Math.round)
    for (const [e, L, nm] of [[e1, A, 'a'], [e2, B, 'b']]) if (dLine(e, L) > NODE_BOUND) throw new Error(`[${who}] ⛔ the back-offset: a squared join's cap end (${e.map(v => v / SCALE)}) lies ${dLine(e, L).toFixed(3)} u off its neighbour line ${nm}, past NODE_BOUND. Refusing.`)
    out.push(e1, e2); outL.push([e1, e2], u.int || null); [e1, e2].forEach(q => origin(q, 'square')); stat.squared = (stat.squared || 0) + 1; (stat.squares ||= []).push(Xf.map(Math.round)); return true }
  // the region's own arc from t's edge to u's, FORWARD IN THE RING'S OWN ORDER whatever its length (Zob, 2026-10-29; the
  // 'under n/2' heuristic is deleted), and VALID only if no interior edge of it appears elsewhere in this ring's lines (else
  // the jump runs BACKWARD against the ring); each arc point with its outgoing edge's line
  const present = new Set(t2.filter(x => x.kind === 'L' && x.g != null).map(x => x.g + ':' + x.i))
  // ⭐ A RING WOUND OPPOSITE TO ITS SOURCE TAKES NO STAND-INS (Zob's ruling, 2026-10-29; PTown's wide fills): the arc stand-ins (trimmed,
  // gap) and the backward-join rules hold only when the ring emitted runs the SAME way as the source ring its tags come from. A hole the
  // dilate re-forms where the close shuts a mouth is tagged with an OUTER's edges: the close's hole is the dilate of that hole, so every
  // join on it is a cut between its own two lines, crossed or squared. Exact (signed area), no constant
  const sense = Math.sign(area(E)), opposite = (g) => !OPP_STANDINS && Math.sign(area(SRC[g])) !== sense
  const arcOf = (t, u) => { if (opposite(t.g)) return { pts: [], lns: [], valid: false, opposite: true }
    const R = SRC[t.g], n = R.length, pts = [], lns = []; let valid = true
    for (let j = (t.i + 1) % n; ; j = (j + 1) % n) { pts.push([R[j].X, R[j].Y]); lns.push(lineOf(t.g, j)); if (j === u.i) break; if (present.has(t.g + ':' + j)) valid = false; if (pts.length > n) break }
    return { pts, lns, valid } }
  // ⭐ AN ARC'S VERTICES ARE JOINS TOO (Zob, 2026-10-29): each vertex v_j an arc emits sits between the region's edges j−1 and j, and
  // goes through the ONE corner function like any join (squared past the limit, else the vertex). An arc stands in for what the
  // next boolean returns, which holds only where D contains P's arc, and D does not contain a corner the limit squares.
  // Gap arcs and jogs never reach the limit (sub-NODE_BOUND wiggles, right-angle steps), but they are called the same way
  // ⭐ A TRIMMED ARC asks D, not the arc's own turns (the take-out, 2026-10-29: PTown's MacMillan, a 1 u notch whose 130° turn was
  // squared into a 0.75 m cap where the definition keeps P's arc). Its join t → u was tried against the limit first; D's boundary
  // there is the two target lines: in the OPEN (P ∩ D, d < 0) D holds an arc vertex iff it lies on the region's side (LEFT) of both;
  // in the CLOSE (P ∪ E, the mirror) the vertex is P's own iff it lies outside E, RIGHT of both; each within NODE_BOUND. Each such
  // vertex is the boolean's own. ⭐ Where the arc LEAVES the wedge (Zob's ruling, 2026-10-29), the exact answer is the arc CLIPPED
  // by it: an arc edge crossing L_a or L_b emits lineCrossOf(that edge, that line), rounded once, its outgoing edge on the line it
  // runs along; an exit by one line and an entry (or the arc's end) by the other passes D's corner X = L_a ∩ L_b. No constant
  const leftOf = (L, q) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.sign(-d) * (dx * (q[1] - L[0][1]) - dy * (q[0] - L[0][0])) / Math.hypot(dx, dy) >= -NODE_BOUND }
  const sd = (L, q) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.sign(-d) * (dx * (q[1] - L[0][1]) - dy * (q[0] - L[0][0])) / Math.hypot(dx, dy) }
  const isInt = (L) => L.every(pt => pt.every(Number.isInteger))
  const crossAt = (e, L) => (isInt(e) && isInt(L) ? lineCrossOf({ a: e[0], b: e[1] }, { a: L[0], b: L[1] }, who) : fcross(e, L).map(Math.round))
  const tAlong = (e, L) => { const a0 = sd(L, e[0]), a1 = sd(L, e[1]); return a0 / (a0 - a1) }   // where e crosses L, 0..1
  const clipArc = (a, kind, t0, u0) => { const LA = t0.int || t0.flt, LB = u0.int || u0.flt, ins = (q) => leftOf(LA, q) && leftOf(LB, q)
    const Xc = () => crossAt(LA, LB), pts = a.pts
    if (!ins(pts[0])) throw new Error(`[${who}] ⛔ the back-offset: a trimmed arc STARTS outside ${d < 0 ? 'D' : 'E'}'s wedge at (${pts[0].map(v => v / SCALE)}). Unruled; refusing.`)
    let exitL = null
    for (let k = 0; k < pts.length; k++) { const q = pts[k], inside = ins(q)
      if (k > 0) { const e = [pts[k - 1], q], prevIn = exitL == null
        if (prevIn && !inside) { const Ls = [LA, LB].filter(L => !leftOf(L, q)), L = Ls.length > 1 && tAlong(e, Ls[1]) < tAlong(e, Ls[0]) ? Ls[1] : Ls[0]
          const P = crossAt(e, L); out.push(P); outL.push(L === LA ? (t0.int || null) : (u0.int || null)); origin(P, 'arc-clip'); exitL = L; stat.arcClipped = (stat.arcClipped || 0) + 1 }
        else if (!prevIn && inside) { const Ls = [LA, LB].filter(L => !leftOf(L, e[0])), L = Ls.length > 1 && tAlong(e, Ls[1]) > tAlong(e, Ls[0]) ? Ls[1] : Ls[0]
          if (L !== exitL) { const X = Xc(); out.push(X); outL.push(L === LA ? (t0.int || null) : (u0.int || null)); origin(X, 'arc-clip') }
          const P = crossAt(e, L); out.push(P); outL.push(a.lns[k - 1]); origin(P, 'arc-clip'); exitL = null }
        else if (!prevIn && !inside && ins([(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2])) throw new Error(`[${who}] ⛔ the back-offset: a trimmed arc's edge passes through ${d < 0 ? 'D' : 'E'}'s wedge with both ends outside, at (${q.map(v => v / SCALE)}). Unruled; refusing.`) }
      if (inside) { out.push(q); outL.push(a.lns[k]); origin(q, kind) } }
    if (exitL != null && exitL !== LB) { const X = Xc(); out.push(X); outL.push(u0.int || null); origin(X, 'arc-clip') } }
  const pushArc = (a, kind, t0, u0 = null) => { if (kind === 'trimmed-arc' && !TRIMMED_ARC_CORNERS) return clipArc(a, kind, t0, u0)
    a.pts.forEach((q, k) => {
      const prevLine = k === 0 ? (t0.int || t0.flt) : a.lns[k - 1], nextLine = a.lns[k]
      if (!ARC_RAW && prevLine && nextLine && capAt(prevLine, nextLine, q, { int: nextLine })) { stat.arcSquared = (stat.arcSquared || 0) + 1; return }
      out.push(q); outL.push(a.lns[k]); origin(q, kind) }) }
  for (let k = 0; k < N; k++) { const t = t2[k].out ? { ...t2[k], ...t2[k].out } : t2[k], u = t2[(k + 1) % N]
    if (t.kind === 'V') { out.push(t.p); outL.push(u.kind === 'L' ? (u.int || null) : null); origin(t.p, t.cut ? 'cut-point' : 'run-vertex'); continue }
    if (u.kind === 'V') continue
    if (t.g != null && u.g === t.g && RUN[t.g] && RUN[t.g].runOf[u.i] === (RUN[t.g].runOf[t.i] + 1) % RUN[t.g].runs.length) { const v = SRC[t.g][RUN[t.g].runs[RUN[t.g].runOf[u.i]].s]; if (!OWN_SKIPS_LIMIT && capAt(t.int || t.flt, u.int || u.flt, [v.X, v.Y], u)) { stat.ownSquared = (stat.ownSquared || 0) + 1; continue } out.push([v.X, v.Y]); outL.push(u.int || null); origin([v.X, v.Y], 'own'); stat.own++; continue }
    if (t.g != null && u.g === t.g && u.i === (t.i + 1) % SRC[t.g].length) { const v = SRC[t.g][u.i]; if (!OWN_SKIPS_LIMIT && capAt(t.int || t.flt, u.int || u.flt, [v.X, v.Y], u)) { stat.ownSquared = (stat.ownSquared || 0) + 1; continue } out.push([v.X, v.Y]); outL.push(u.int || null); origin([v.X, v.Y], 'own'); stat.own++; continue }
    // a cut join between two lines
    const A = t.int || t.flt, B = u.int || u.flt
    const na = unit(A[0], A[1]), nb = unit(B[0], B[1]), cosA = na[0] * nb[0] + na[1] * nb[1], sinA = na[0] * nb[1] - nb[0] * na[1]
    if (t.int && u.int && sameLine({ a: A[0], b: A[1] }, { a: B[0], b: B[1] })) continue
    if (t.int && u.int && BigInt(A[1][0] - A[0][0]) * BigInt(B[1][1] - B[0][1]) === BigInt(A[1][1] - A[0][1]) * BigInt(B[1][0] - B[0][0])) {
      // ⭐ PARALLEL AND DISTINCT at a join: no cut exists (Zob's ruling, 2026-10-28, one rule for any order):
      //  · separation ≤ NODE_BOUND, exact (2·cross(dir, offset)² ≤ |dir|²): the lines differ by less than the lattice's own
      //    rounding (a staircase in the trace), so the join gets NO vertex: the last emitted point runs straight to the next
      //  · separation > NODE_BOUND, FORWARD on one ring: the jog, the band test (ruling (2)), the region's own vertices
      //  · else (backward, two rings, a failed band): refuse by name (a swallowtail: unruled until one exists)
      { const [dx, dy, ox, oy] = [A[1][0] - A[0][0], A[1][1] - A[0][1], B[0][0] - A[0][0], B[0][1] - A[0][1]].map(BigInt), cr = dx * oy - dy * ox
        if (2n * cr * cr <= dx * dx + dy * dy) { stat.staircase = (stat.staircase || 0) + 1; continue } }
      const ja = t.g != null && u.g === t.g ? arcOf(t, u) : null
      if (!ja || !ja.valid) throw new Error(`[${who}] ⛔ the back-offset: parallel distinct lines ${JSON.stringify(A)} and ${JSON.stringify(B)} meet ${!ja ? 'from two rings' : `BACKWARD (edge ${t.i} then ${u.i} of ${SRC[t.g].length}, ring ${t.g}${area(SRC[t.g]) < 0 ? ', a HOLE' : ', an outer'})`}, farther apart than the lattice's rounding (clause swallowtail). Refusing.`)
      const R = SRC[t.g], n = R.length, L = Math.hypot(A[1][0] - A[0][0], A[1][1] - A[0][1])
      const side = (p) => ((p[0] - A[0][0]) * (A[1][1] - A[0][1]) - (p[1] - A[0][1]) * (A[1][0] - A[0][0])) / L, o = side(B[0])
      const lo = Math.min(0, o) - NODE_BOUND, hi = Math.max(0, o) + NODE_BOUND, arc = []
      for (let j = (t.i + 1) % n; ; j = (j + 1) % n) { arc.push([R[j].X, R[j].Y]); if (j === u.i) break; if (arc.length > n) throw new Error(`[${who}] ⛔ the back-offset: the jog's arc does not close. Refusing.`) }
      const off = arc.find(p => { const s = side(p); return s < lo || s > hi })
      if (off) throw new Error(`[${who}] ⛔ the back-offset: parallel distinct lines meet across a protrusion at (${off.map(v => v / SCALE)}) (clause parallel-protrusion: lines ${JSON.stringify(A)} and ${JSON.stringify(B)}, ${Math.abs(o).toFixed(3)} u apart; the vertex ${side(off).toFixed(3)} u across, the band [${lo.toFixed(3)}, ${hi.toFixed(3)}]; arc of ${arc.length} vertices; t = (${t.g}, ${t.i}), u = (${u.g}, ${u.i}) of ${n}). Refusing.`)
      pushArc(ja, 'jog', t); stat.jogJoin = (stat.jogJoin || 0) + 1; continue }
    if (Math.abs(sinA) < 1e-15 && cosA > 0) throw new Error(`[${who}] ⛔ the back-offset: a new line parallel to its neighbour at (${A[1]}). Refusing.`)
    const Xf = fcross(A, B)                                                    // the lines' crossing, unrounded
    const dLine = (q, L) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.abs((q[0] - L[0][0]) * dy - (q[1] - L[0][1]) * dx) / Math.hypot(dx, dy) }
    // ⭐ THE GAP RULE AT ANY NON-ADJACENT JOIN (Zob, 2026-10-29; clause 3 made general): every skipped source vertex within
    // NODE_BOUND of the cut path (L_a to X, then L_b) → the two answers differ by less than the lattice's own rounding, so the
    // source vertices are emitted, never X
    const AR = t.g != null && u.g === t.g ? arcOf(t, u) : null
    // ⭐ THE MITER LIMIT FIRST (Huron's closedK, 2026-10-29): a join past the limit is SQUARED as the definition squares it, whatever
    // the gap rule would emit; the gap rule ran first and drew the unsquared apex (0.346 m² at (3183.18, 764.81))
    if (!GAP_BEFORE_LIMIT && capAt(A, B, Xf, u)) continue
    if (AR && AR.valid && AR.pts.length > 1) { const sk = AR.pts; {
        const dS = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, tt = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(q[0] - a[0] - tt * dx, q[1] - a[1] - tt * dy) }
        if (sk.every(q => Math.min(dS(q, A[0], Xf), dS(q, Xf, B[1])) <= NODE_BOUND)) { pushArc(AR, 'gap-arc', t); stat.gapArc = (stat.gapArc || 0) + 1; continue } } }
    if (GAP_BEFORE_LIMIT && capAt(A, B, Xf, u)) continue
    const X = t.int && u.int ? lineCrossOf({ a: A[0], b: A[1] }, { a: B[0], b: B[1] }, who) : fcross(A, B).map(Math.round)
    // ⭐ A CUT WHOSE CROSSING THE NEXT BOOLEAN TRIMS EMITS THAT BOOLEAN'S EXACT RESULT: THE REGION'S OWN ARC (Zob's ruling,
    // 2026-10-29). L_a and L_b are the region's own edge lines: in the open, X = L_a ∩ L_b outside the region is trimmed by ∩P,
    // which in exact arithmetic follows L_a to a's end, the skipped source arc, then L_b; the close is the mirror (X inside,
    // unioned away). So the arc is emitted and X never is. The side, exact (BigInt): the local loop arc-then-X wound
    // clockwise ⇔ X outside (the region lies LEFT of every ring)
    if (AR && AR.valid) { const arc = AR.pts; {
        const loop = [...arc, X]; let a2 = 0n; for (let k = 0; k < loop.length; k++) { const p = loop[k], q = loop[(k + 1) % loop.length]; a2 += BigInt(p[0]) * BigInt(q[1]) - BigInt(q[0]) * BigInt(p[1]) }
        if (TRIM_INVERTED ? !(d < 0 ? a2 < 0n : a2 > 0n) : (d < 0 ? a2 < 0n : a2 > 0n)) { pushArc(AR, 'trimmed-arc', t, u); stat.trimmedArc = (stat.trimmedArc || 0) + 1; continue } } }
    // ⛔ a BACKWARD cut between non-parallel lines of one ring: refuse by name (Zob, 2026-10-29; unruled until one exists)
    // ⭐ BACKWARD BUT ADJACENT (Zob, 2026-10-29): u = t − 1 on one ring: the two lines are adjacent source edges, and their
    // crossing must BE the shared source vertex v_t, integer for integer (checked, never assumed), which is emitted. Why the
    // eroded ring meets t before t − 1 is not established (Breakwater 6, decks 1, all one step back).
    if (AR && !AR.valid && !AR.opposite && !REFUSE_ALL_BACKWARD && (t.i - u.i + SRC[t.g].length) % SRC[t.g].length === 1) { const v = SRC[t.g][t.i]
      if (X[0] !== v.X || X[1] !== v.Y) throw new Error(`[${who}] ⛔ the back-offset: a backward-adjacent join (edge ${t.i} then ${u.i} of ring ${t.g}) crosses at (${X}), not at their shared vertex (${v.X}, ${v.Y}). Refusing.`)
      if (capAt(A, B, X, u)) continue
      out.push(X); outL.push(u.int || null); origin(X, 'backward-adjacent'); stat.backwardAdjacent = (stat.backwardAdjacent || 0) + 1; continue }
    if (AR && !AR.valid && !AR.opposite) { const n = SRC[t.g].length, inner = []; for (let j = (t.i + 1) % n; j !== u.i; j = (j + 1) % n) inner.push(j)
      const where = inner.slice(0, 4).map(j => ({ edge: j, atTokens: t2.map((x, q) => (x.kind === 'L' && x.g === t.g && x.i === j ? q : -1)).filter(q => q >= 0) }))
      const around = t2.slice(Math.max(0, k - 6), k + 8).map((x, q) => x.kind === 'L' ? (x.g != null ? `${x.g}:${x.i}` : 'new') : 'V')
      const lo = (t.i - 2 + n) % n, srcV = []; for (let q = 0; q < 7; q++) { const v = SRC[t.g][(lo + q) % n]; srcV.push(`${(lo + q) % n}:(${v.X},${v.Y})`) }
      const tagsOf = (tg) => (tg == null ? [] : Array.isArray(tg) ? tg : [tg]).filter(x => x.ring === t.g).map(x => x.i)
      const eroded = E.map((q, e2) => ({ e2, q, tg: tagsOf(T[e2]) })).filter(o => o.tg.some(i => ((i - lo + n) % n) < 7)).slice(0, 14).map(o => `e${o.e2}(${o.q.X},${o.q.Y})[${o.tg.join('+')}]`)
      // Zob's confirmation: each involved region edge's BIRTH LINE (LINES: P's line as two points, or none = born from its own points)
      const seen = t2.slice(Math.max(0, k - 6), k + 8).filter(x => x.kind === 'L' && x.g === t.g).map(x => x.i), lo2 = Math.min(...seen), hi2 = Math.max(...seen)
      const ids = []; for (let i = lo2; i <= hi2 && ids.length < 40; i++) ids.push(i)
      const births = ids.map(i => { const p0 = SRC[t.g][i], p1 = SRC[t.g][(i + 1) % n], L = LINES?.[t.g]?.[i]
        return { edge: i, inTokens: seen.includes(i), lenU: +Math.hypot(p1.X - p0.X, p1.Y - p0.Y).toFixed(2), deg: +(Math.atan2(p1.Y - p0.Y, p1.X - p0.X) * 180 / Math.PI).toFixed(3),
          line: L ? JSON.stringify(L) : 'born', lineDeg: L ? +(Math.atan2(L[1][1] - L[0][1], L[1][0] - L[0][0]) * 180 / Math.PI).toFixed(3) : null, pts: `(${p0.X},${p0.Y})→(${p1.X},${p1.Y})` } })
      if (process.env.CUTONCE_DUMP) writeFileSync(process.env.CUTONCE_DUMP, JSON.stringify({ src: srcV, eroded, tokens: around, births }, null, 1))
      // ⭐ THE MESSAGE EXPLAINS (Boz, 2026-10-29): a source STAIRCASE at the cut is named as one, with its site and what the
      // operator can do: the cut's own edges (those it skips, and its target) whose both ends lie within the lattice's rounding
      // (NODE_BOUND) of the cut's line
      const m3 = (v) => `(${(v.X / SCALE).toFixed(3)}, ${(v.Y / SCALE).toFixed(3)})`
      const stair = [...inner, u.i].filter(i => [SRC[t.g][i], SRC[t.g][(i + 1) % n]].every(v => onLineTiered(A, [v.X, v.Y], null)))
      const detail = `detail: the cut joins edge ${t.i} to edge ${u.i} and edge(s) ${inner.slice(0, 4).join(', ')} it skips appear elsewhere in the ring (${JSON.stringify(where)}); tokens round it [${around.join(' ')}]`
      const todo = 'Nothing the operator can do changes it today: the rule is BACKLOG "the open/close refuses at a source staircase" (unbuilt)'
      if (stair.length) throw new Error(`[${who}] ⛔ the open/close cannot read this ring: a STAIRCASE in its SOURCE at a cut. Ring ${t.g}'s edge(s) ${stair.map(i => `${i} ${m3(SRC[t.g][i])} → ${m3(SRC[t.g][(i + 1) % n])}, ${Math.hypot(SRC[t.g][(i + 1) % n].X - SRC[t.g][i].X, SRC[t.g][(i + 1) % n].Y - SRC[t.g][i].Y).toFixed(1)} mm`).join('; ')} lie within the lattice's rounding of edge ${t.i}'s line, so their offset lines cross and are read out of order. ${todo}. Refusing. (${detail})`)
      throw new Error(`[${who}] ⛔ the open/close cannot read this ring: at ring ${t.g}${area(SRC[t.g]) < 0 ? ' (a hole)' : ''} near ${m3(SRC[t.g][(t.i + 1) % n])}, a cut from edge ${t.i} to edge ${u.i} runs BACKWARD (the offset reads the ring's lines out of order). Cause not established; no staircase within the rounding there. ${todo}. Refusing. (${detail})`) }
    out.push(X); outL.push(u.int || null); origin(X, t.flt || u.flt ? 'new-line-join' : 'cut-join'); stat.cutJoin++
    const par = (L, q) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return ((q[0] - L[0][0]) * dx + (q[1] - L[0][1]) * dy) / (dx * dx + dy * dy) }
    DETAIL.set(X[0] + ',' + X[1], { who, t: t.g != null ? { g: t.g, i: t.i } : 'new', u: u.g != null ? { g: u.g, i: u.i } : 'new', ta: +par(A, Xf).toFixed(4), tb: +par(B, Xf).toFixed(4), A, B }) }
  if (outL.length !== out.length) throw new Error(`[${who}] ⛔ the back-offset: ${out.length} points but ${outL.length} outgoing lines. Refusing.`)
  // ⭐ THE EMISSION INVARIANT (Zob, 2026-10-29): every emitted edge lies on its tag's line, BOTH endpoints within NODE_BOUND of it
  // (exact, BigInt: 2·cross² ≤ |dir|² per end, as the transition test). A violation refuses by name with the rule that made the
  // edge (the start point's emission, cand3.mjs#ORIGIN), the line and both distances
  if (!NO_EMIT_INVARIANT) for (let k = 0; k < out.length; k++) { const L = outL[k]; if (!L) continue
    const p0 = out[k], p1 = out[(k + 1) % out.length]; if (p0[0] === p1[0] && p0[1] === p1[1]) continue
    const dx = BigInt(L[1][0] - L[0][0]), dy = BigInt(L[1][1] - L[0][1]), D2 = dx * dx + dy * dy
    // TWO TIERS BY ORIGIN, one home (latticeFaces.js#onLineTiered, shared with facesOf's transition test)
    const off = (pt) => !onLineTiered(L, pt, TIERS_SWAPPED ? null : (INSERTED.get(Math.round(pt[0]) + ',' + Math.round(pt[1])) || []).map(x => x.seg))
    if (off(p0) || off(p1)) { const dist = (pt) => +(Math.abs((pt[0] - L[0][0]) * Number(dy) - (pt[1] - L[0][1]) * Number(dx)) / Math.sqrt(Number(D2))).toFixed(3)
      const tier = (pt) => (INSERTED.has(Math.round(pt[0]) + ',' + Math.round(pt[1])) ? `noding-inserted in ${INSERTED.get(Math.round(pt[0]) + ',' + Math.round(pt[1])).map(x => x.who).join(', ')}` : 'emitted')
      throw new Error(`[${who}] ⛔ the emission invariant (start ${tier(p0)}, end ${tier(p1)}): the edge (${p0.map(v => v / SCALE)}) → (${p1.map(v => v / SCALE)}) is tagged with the line ${JSON.stringify(L)} but lies ${dist(p0)} / ${dist(p1)} u off it (> NODE_BOUND); made by: start ${ORIGIN.get(p0[0] + ',' + p0[1]) || '?'}, end ${ORIGIN.get(p1[0] + ',' + p1[1]) || '?'}. Refusing.`) } }
  return out.map(([X, Y], k) => ({ X, Y, tag: TAGS_BY_SEGMENT ? null : outL[k] }))
}
export const ORIGIN = new Map(), DETAIL = new Map(), INSERTED = new Map()
// each stage's REGION (face-walk output), for the stage-wise definition oracle (scratch/cut-once/oracle.mjs); diagnostic only
export const STAGES = {}
export const DROPPED = []                          // every ring or piece dropped as wholly the rounding, named
// a piece edge's tag: its line (ring, i), BORN (a strip end, a cap: a new line), or NEAR (on the region's own edge: interior after the
// boolean). An output edge with NO tag at all is a LOST tag (Zob's gate, 2026-10-29), counted
const BORN = { born: true }, NEAR = { near: true }
let TAGS_BY_SEGMENT = false                       // ⛔ the mutant only (setTagsBySegment): the close tags by the open's segments
export const setTagsBySegment = (v) => { TAGS_BY_SEGMENT = !!v }
let REFUSE_ALL_BACKWARD = false                   // ⛔ the mutant only (setRefuseAllBackward)
export const setRefuseAllBackward = (v) => { REFUSE_ALL_BACKWARD = !!v }
let SINGLE_POINT_BRANCH = false                   // ⛔ the mutant only (setSinglePointBranch): clipper's single-point join restored
export const setSinglePointBranch = (v) => { SINGLE_POINT_BRANCH = !!v }
let RAW_CURVE = false                             // ⛔ the mutant only (setRawCurve): the raw curve selected by winding > 0
export const setRawCurve = (v) => { RAW_CURVE = !!v }
let BY_EDGES = false                              // ⛔ the mutant only (setByEdges): the close morphs the open's edges, not its runs
export const setByEdges = (v) => { BY_EDGES = !!v }
let NO_TOPOLOGY_GUARD = false                     // ⛔ the mutant only (setNoTopologyGuard)
export const setNoTopologyGuard = (v) => { NO_TOPOLOGY_GUARD = !!v }
let FOLDED_QUAD = false, NO_FOLD_TRIANGLE = false, R_SEPARATE = false   // ⛔ the mutants only (setFoldMutant)
export const setFoldMutant = (m) => { FOLDED_QUAD = m === 'quad'; NO_FOLD_TRIANGLE = m === 'no-triangle'; R_SEPARATE = m === 'r-separate' }
let NO_EMIT_INVARIANT = false                     // ⛔ the mutant only (setNoEmitInvariant)
export const setNoEmitInvariant = (v) => { NO_EMIT_INVARIANT = !!v }
let TIERS_SWAPPED = false                         // ⛔ the mutant only (setTiersSwapped): a noding-inserted vertex judged against the line
export const setTiersSwapped = (v) => { TIERS_SWAPPED = !!v }
let TAGS_OFF_AT = null                            // ⛔ the mutant only (setTagsOffAt('∩P')): tags switched off where they ARE read
export const setTagsOffAt = (v) => { TAGS_OFF_AT = v }
let OWN_SKIPS_LIMIT = false                       // ⛔ the mutant only (setOwnSkipsLimit): the own-vertex join without the miter limit
export const setOwnSkipsLimit = (v) => { OWN_SKIPS_LIMIT = !!v }
let SUB_SAME_WAY = false                          // ⛔ the mutant only (setSubSameWay): a difference's subtracted set left as wound, its edges untagged
export const setSubSameWay = (v) => { SUB_SAME_WAY = !!v }
let INSIDE_RUN_FORWARD = false                    // ⛔ the mutant only (setInsideRunForward): a token inside one run read forward instead
export const setInsideRunForward = (v) => { INSIDE_RUN_FORWARD = !!v }
let TAG_SET_ORDER = false                         // ⛔ the mutant only (setTagSetOrder): a multi-tag token read as a set (tagRun's arc)
export const setTagSetOrder = (v) => { TAG_SET_ORDER = !!v }
let TRIMMED_ARC_CORNERS = false                   // ⛔ the mutant only (setTrimmedArcCorners): a trimmed arc unclipped, its vertices by their own turns
export const setTrimmedArcCorners = (v) => { TRIMMED_ARC_CORNERS = !!v }
let ARC_RAW = false                               // ⛔ the mutant only (setArcRaw): arcs emit raw vertices, no corner call
export const setArcRaw = (v) => { ARC_RAW = !!v }
let NO_SLIVER_DROP = false                        // ⛔ the mutant only (setNoSliverDrop)
export const setNoSliverDrop = (v) => { NO_SLIVER_DROP = !!v }
let TRIM_INVERTED = false                          // ⛔ the mutant only (setTrimInverted): the side test inverted
export const setTrimInverted = (v) => { TRIM_INVERTED = !!v }
const origin = (p, kind) => { const k = p[0] + ',' + p[1], o = ORIGIN.get(k); ORIGIN.set(k, o && o !== kind ? o + '|' + kind : kind) }
const fcross = (A, B) => { const r = [A[1][0] - A[0][0], A[1][1] - A[0][1]], s = [B[1][0] - B[0][0], B[1][1] - B[0][1]], den = r[0] * s[1] - r[1] * s[0]
  if (!den) throw new Error('⛔ the back-offset: a new line parallel to its neighbour. Refusing.')
  const t = ((B[0][0] - A[0][0]) * s[1] - (B[0][1] - A[0][1]) * s[0]) / den; return [A[0][0] + t * r[0], A[0][1] + t * r[1]] }

// ⭐ THE OFFSET AS A BOOLEAN OF EXACT PIECES (Zob, 2026-10-29): not a winding selection of one self-crossing curve (with pure
// intersection joins "winding > 0" keeps a narrow spike's loops, which the erosion removes; Huron's 30 u spike). Each edge's
// STRIP on the d side (the rectangle from the edge to L_i(d)), and at each join where the offset lines DIVERGE (sinA·d > 0:
// a reflex vertex for the erode, a convex one for the dilate) the WEDGE v → v + n_k·d → X → v + n_j·d (X = their crossing),
// SQUARED past the miter limit (both cap ends on the lines, the cap a born line). Erode = region − ∪ pieces; dilate = region ∪
// pieces. A strip's far side carries its edge's tag, a wedge's two outer sides theirs; the strip ends and the caps are born
// (null). Every corner is in doubles, rounded once at birth: intermediate, only the tags leave.
// ⛔ ② (tileGround.js#offsetRingByRects) cannot share it: a variable-depth, per-owner, labelled offset with ease and water
// joins, whose booleans are clipper's union (the integer re-rounding this brief removes); moving ② onto the face walk is a ②
// change outside this brief. structures.mjs#stripOf widens a centreline symmetrically, not one side of an edge.
// ⭐ RUNS (Zob, 2026-10-29): the morph reads the region's LINE SEQUENCE, not its rounded vertex list. Consecutive edges born on the
// SAME line are one run: a vertex between them is a rounding point, not a corner, and enters no piece. Without birth lines
// (P itself) each edge is its own run. → per ring: runs [{ s, e, line }] (edge indices s…e) and runOf[i]
export function runsOf(R, lines) {
  const n = R.length, key = (i) => (lines?.[i] ? JSON.stringify(lines[i]) : `own:${i}`), runOf = new Array(n)
  let start = 0; while (start < n && key(start) === key((start - 1 + n) % n) && n > 1) start++
  if (start === n) start = 0
  const runs = []
  for (let c = 0; c < n; c++) { const i = (start + c) % n
    if (c === 0 || key(i) !== key((i - 1 + n) % n)) runs.push({ s: i, e: i, line: lines?.[i] || [[R[i].X, R[i].Y], [R[(i + 1) % n].X, R[(i + 1) % n].Y]] })
    else runs[runs.length - 1].e = i
    runOf[i] = runs.length - 1 }
  return { runs, runOf }
}
function offsetPieces(R, d, g, squares, lines = null, stat0 = {}) {
  // ⭐ A JOIN'S CORNER IS COMPUTED ONCE AND SHARED (Zob, 2026-10-29), FROM THE TWO LINES (never the region's rounded points): each
  // RUN's piece runs between its two join corners [v_s, v_e, C_end, C_start]; at each change of line, V* = the two lines' exact
  // crossing (doubles: intermediate), and DIVERGING → X = L_a(d) ∩ L_b(d), one point for both pieces; past the miter limit the
  // cap's two ends and a cap triangle [V*, C_a, C_b]; CONVERGING → the rectangle corners V* + n_a·d and V* + n_b·d
  const n = R.length, { runs } = runsOf(R, lines), m = runs.length, pieces = []
  const P = (x, y) => ({ X: Math.round(x), Y: Math.round(y) })
  const ccw = (pp) => { let a2 = 0; for (let k = 0; k < pp.length; k++) { const p = pp[k], q = pp[(k + 1) % pp.length]; a2 += p.X * q.Y - q.X * p.Y }
    if (a2 > 0) return pp
    const r = pp.slice().reverse(); return r.map((q, k) => ({ ...q, tag: pp[(pp.length - 1 - k - 1 + pp.length) % pp.length].tag })) }
  const N = runs.map(r => unit(r.line[0], r.line[1]))
  // the corner between run k and the run r after it (ruling (d)'s classes): { end: k's end corner, start: r's start corner, cap }
  const cornerOf = (k, r, v) => { const nk = N[k], nj = N[r]
    const sinA = Math.max(-1, Math.min(1, nk[0] * nj[1] - nj[0] * nk[1])), cosA = nk[0] * nj[0] + nk[1] * nj[1], rr = 1 + cosA
    const Lk = runs[k].line, Lr = runs[r].line, den = (Lk[1][0] - Lk[0][0]) * (Lr[1][1] - Lr[0][1]) - (Lk[1][1] - Lk[0][1]) * (Lr[1][0] - Lr[0][0])
    const nearV = (l) => { const dx = BigInt(l[1][0] - l[0][0]), dy = BigInt(l[1][1] - l[0][1]), cr = dx * BigInt(v.Y - l[0][1]) - dy * BigInt(v.X - l[0][0]); return 2n * cr * cr <= dx * dx + dy * dy }
    // ⭐ both lines within rounding of the region vertex between them: that vertex is the corner (a transition, or the ordinary
    // case where both pass through it), never a far crossing of two nearly parallel lines
    const V = nearV(Lk) && nearV(Lr) ? [v.X, v.Y] : m > 1 && den !== 0 ? fcross(Lk, Lr) : [v.X, v.Y]
    if (!(sinA * d > 0)) return { end: P(V[0] + nk[0] * d, V[1] + nk[1] * d), start: P(V[0] + nj[0] * d, V[1] + nj[1] * d), cap: false, conv: true }
    if (rr < MITER_LIM) { const t = Math.tan(Math.atan2(sinA, cosA) / 4)
      return { end: P(V[0] + d * (nk[0] - nk[1] * t), V[1] + d * (nk[1] + nk[0] * t)), start: P(V[0] + d * (nj[0] + nj[1] * t), V[1] + d * (nj[1] - nj[0] * t)), cap: true } }
    const qq = d / rr, X = P(V[0] + (nk[0] + nj[0]) * qq, V[1] + (nk[1] + nj[1]) * qq); return { end: X, start: X, cap: false } }
  const vAt = (r) => R[runs[r].s]                                                   // the region vertex where run r starts
  // ⭐ EVERY PIECE IS LOCAL (Zob, 2026-10-29; the elimination pass, Y, the fan and the base polygon are withdrawn): the dilation is
  // the union of EVERY run's strip and EVERY diverging join's wedge, so a run between converging neighbours can be outermost and
  // nothing is swallowed by construction. Corners per ruling (d), computed once; C[k] the corner between run k and the next
  const C = runs.map((_, k) => cornerOf(k, (k + 1) % m, vAt((k + 1) % m)))
  for (let k = 0; k < m; k++) { const c = C[k], r = (k + 1) % m
    if (c.cap) { if (squares) squares.push([vAt(r).X, vAt(r).Y]); pieces.push(ccw([{ X: vAt(r).X, Y: vAt(r).Y, tag: BORN }, { ...c.end, tag: BORN }, { ...c.start, tag: BORN }])) } }
  for (let q = 0; q < m; q++) { const k = (q - 1 + m) % m, a = vAt(q), b = vAt((q + 1) % m), L = runs[q].line, nn = N[q]
    if (a.X === b.X && a.Y === b.Y && m > 1) continue
    const s0 = C[k].start, e0 = C[q].end, along = (e0.X - s0.X) * (L[1][0] - L[0][0]) + (e0.Y - s0.Y) * (L[1][1] - L[0][1])
    const lineTag = { ring: g, i: runs[q].s }
    if (along > 0) { pieces.push(ccw([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, { ...e0, tag: lineTag }, { ...s0, tag: BORN }])); continue }
    if (along <= 0 && FOLDED_QUAD) { pieces.push(ccw([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, { ...e0, tag: lineTag }, { ...s0, tag: BORN }])); continue }   // ⛔ the mutant only
    // a run whose far side would fold: its PLAIN RECTANGLE, plus at each DIVERGING end the triangle [v, X, R] (X the end's shared
    // join point, the same integer point the neighbour's quad ends at; R this run's rectangle corner at v). With the
    // neighbour's quad half [v, R_prev, X] it covers the true wedge [v, R_prev, X, R_next]; a converging end needs nothing
    // ⭐ R IS X BELOW ONE LATTICE STEP (Zob, 2026-10-29): X (the shared join) and R (this run's rectangle corner at that end) both lie
    // on L_r(d); closer than LATTICE_STEP (the lattice's own constant) they are ONE point at the kit's resolution, so R takes the
    // shared integer X and the triangle vanishes exactly (rounded separately they were ruling (d)'s disease: one point, two
    // roundings). The distance in doubles: both points are intermediate, only the decision leaves
    const raF = [a.X + nn[0] * d, a.Y + nn[1] * d], rbF = [b.X + nn[0] * d, b.Y + nn[1] * d]
    const sameAt = (Xp, Rf, conv) => !conv && !R_SEPARATE && Math.hypot(Xp.X - Rf[0], Xp.Y - Rf[1]) < LATTICE_STEP
    const aIsX = sameAt(s0, raF, C[k].conv), bIsX = sameAt(e0, rbF, C[q].conv)
    if (aIsX) stat0.rIsX = (stat0.rIsX || 0) + 1; if (bIsX) stat0.rIsX = (stat0.rIsX || 0) + 1
    const Ra = aIsX ? { X: s0.X, Y: s0.Y } : P(raF[0], raF[1]), Rb = bIsX ? { X: e0.X, Y: e0.Y } : P(rbF[0], rbF[1])
    pieces.push(ccw([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, { ...Rb, tag: lineTag }, { ...Ra, tag: BORN }]))
    if (!C[k].conv && !aIsX && !NO_FOLD_TRIANGLE) pieces.push(ccw([{ X: a.X, Y: a.Y, tag: BORN }, { ...s0, tag: lineTag }, { ...Ra, tag: BORN }]))
    if (!C[q].conv && !bIsX && !NO_FOLD_TRIANGLE) pieces.push(ccw([{ X: b.X, Y: b.Y, tag: BORN }, { ...Rb, tag: lineTag }, { ...e0, tag: BORN }]))
    stat0.folded = (stat0.folded || 0) + 1 }
  // ⭐ A BORN LINE IS ITS TWO BIRTH POINTS (Zob, 2026-10-29), the whole strip end or cap edge: never a noded fragment of it,
  // whose two rounded points a unit apart would quantise its direction to the lattice's axes (the decks' axis-aligned box)
  for (const pp of pieces) pp.forEach((q, k) => { if (q.tag === BORN) { const w = pp[(k + 1) % pp.length]; q.tag = { born: [[q.X, q.Y], [w.X, w.Y]] } } })
  return pieces
}
// ⭐ THE SPIKE (Zob, 2026-10-29): the BACK-offset as PIECES + one face walk, exactly like the forward offset, in place of emit's tag
// rules. Each edge of the intermediate region F gets a TARGET line: an edge tagged with a region edge returns to that edge's BIRTH
// line (net offset 0: L_i(d) then −d), its exact integer points, never recomputed; any other edge (born, near, untagged) is
// offset as its own line along its own normal by the back distance. Consecutive edges with one target form one run; corners at a
// change of target are classified in the BACK direction: diverging → the targets' crossing (exact for two integer lines), past
// the miter limit a cap from F's vertex (its ends on both targets); converging → each target's foot of F's vertex. A run whose far
// side runs backward between its corners is its plain rectangle plus a triangle at each diverging end (R = X below one step).
// Then F ∪ pieces (a back-dilate) or F − pieces (a back-erode, the pieces wound clockwise so their tags run with the boundary).
// SPIKE: switched by setBackPieces; emit stays the reference point until the oracle's table decides
let CLAIMANTS_KEPT = false                         // ⛔ the mutant only (setClaimantsKept): an order-breaking claimant is never dropped
export const setClaimantsKept = (v) => { CLAIMANTS_KEPT = !!v }
let F_SLIVER_KEPT = false                         // ⛔ the mutant only (setFSliverKept): the offset's rounding-sized faces are emitted
export const setFSliverKept = (v) => { F_SLIVER_KEPT = !!v }
let OPP_STANDINS = false                          // ⛔ the mutant only (setOppStandins): an opposite-wound ring takes the arc stand-ins
export const setOppStandins = (v) => { OPP_STANDINS = !!v }
let MERGE_LEAVES_FIRST = false                    // ⛔ the mutant only (setMergeLeavesFirst): a merged line token leaves at its FIRST edge
export const setMergeLeavesFirst = (v) => { MERGE_LEAVES_FIRST = !!v }
let BACK_PIECES = !!process.env.CUTONCE_BACK_PIECES
export const setBackPieces = (v) => { BACK_PIECES = !!v }
let GAP_BEFORE_LIMIT = false                      // ⛔ the mutant only (setGapBeforeLimit): the gap rule ahead of the miter limit
export const setGapBeforeLimit = (v) => { GAP_BEFORE_LIMIT = !!v }
let CORNER_AT_MITER = false                       // ⛔ the mutant only (setCornerAtMiter): M used directly as the corner, the withdrawn (a)
export const setCornerAtMiter = (v) => { CORNER_AT_MITER = !!v }
function backPieces(F, region, lines, dBack, who, stat) {
  const isLine = (x) => Array.isArray(x) && x.length === 2 && x.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite))
  const lineOfRegion = (g, i) => { const L = lines?.[g]?.[i]; if (L) return L; const R = region[g], a = R[i], b = R[(i + 1) % R.length]; return [[a.X, a.Y], [b.X, b.Y]] }
  const pieces = []
  const P2 = (x, y) => ({ X: Math.round(x), Y: Math.round(y) })
  const ccwp = (pp) => { let a2 = 0; for (let k = 0; k < pp.length; k++) { const p = pp[k], q = pp[(k + 1) % pp.length]; a2 += p.X * q.Y - q.X * p.Y }
    if (a2 > 0) return pp; const r = pp.slice().reverse(); return r.map((q, k) => ({ ...q, tag: pp[(pp.length - 1 - k - 1 + pp.length) % pp.length].tag })) }
  F.rings.forEach((E, k) => { const n = E.length
    // each F edge's target line, oriented along the edge (so its clipper normal points out of F), and the tag its far side carries
    const T = E.map((p, i) => { const q = E[(i + 1) % n], tg = F.tags[k][i], tags = tg == null ? [] : Array.isArray(tg) ? tg : [tg]
      const reg = tags.find(x => x && x.ring != null), born = tags.find(x => x && x.born)
      let L, tag
      if (reg) { L = lineOfRegion(reg.ring, reg.i); tag = isLine(lines?.[reg.ring]?.[reg.i]) ? lines[reg.ring][reg.i] : L }
      else { const base = born ? born.born : [[p.X, p.Y], [q.X, q.Y]], nn = unit(base[0], base[1]), sgn = ((base[1][0] - base[0][0]) * (q.X - p.X) + (base[1][1] - base[0][1]) * (q.Y - p.Y)) < 0 ? -1 : 1
        L = [[base[0][0] + sgn * nn[0] * dBack, base[0][1] + sgn * nn[1] * dBack], [base[1][0] + sgn * nn[0] * dBack, base[1][1] + sgn * nn[1] * dBack]]; tag = { born: L.map(pt => pt.map(Math.round)) } }
      if ((L[1][0] - L[0][0]) * (q.X - p.X) + (L[1][1] - L[0][1]) * (q.Y - p.Y) < 0) L = [L[1], L[0]]
      return { L, tag, key: JSON.stringify(L) } })
    // runs of one target
    let start = 0; while (start < n && T[start].key === T[(start - 1 + n) % n].key && n > 1) start++; if (start === n) start = 0
    const runs = []; for (let c = 0; c < n; c++) { const i = (start + c) % n; if (c === 0 || T[i].key !== T[(i - 1 + n) % n].key) runs.push({ s: i, e: i, L: T[i].L, tag: T[i].tag }); else runs[runs.length - 1].e = i }
    const m = runs.length; if (m < 1) return
    const N = runs.map(r => unit(r.L[0], r.L[1])), vAt = (q) => E[runs[q].s]
    const foot = (v, L) => { const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1], t = ((v.X - L[0][0]) * dx + (v.Y - L[0][1]) * dy) / (dx * dx + dy * dy); return [L[0][0] + t * dx, L[0][1] + t * dy] }
    const intLine = (L) => L.every(pt => pt.every(Number.isInteger))
    const C = runs.map((_, kk) => { const r = (kk + 1) % m, nk = N[kk], nj = N[r], v = vAt(r)
      const sinA = Math.max(-1, Math.min(1, nk[0] * nj[1] - nj[0] * nk[1])), cosA = nk[0] * nj[0] + nk[1] * nj[1]
      if (m === 1 || !(sinA * dBack > 0)) { const a2 = foot(v, runs[kk].L), b2 = foot(v, runs[r].L); return { end: P2(...a2), start: P2(...b2), conv: true } }
      if (1 + cosA < MITER_LIM) { const t = Math.tan(Math.atan2(sinA, cosA) / 4)
        const cap = [[v.X + dBack * (nk[0] - nk[1] * t), v.Y + dBack * (nk[1] + nk[0] * t)], [v.X + dBack * (nj[0] + nj[1] * t), v.Y + dBack * (nj[1] - nj[0] * t)]]
        stat.backSquared = (stat.backSquared || 0) + 1
        return { end: P2(...fcross(cap, runs[kk].L)), start: P2(...fcross(cap, runs[r].L)), cap: true, v } }
      // the diverging corner (Zob's ruling (a′), 2026-10-29): it must be BOTH on its lines AND where the definition puts it.
      // M = clipper's miter point from F's vertex, v + (n_k + n_j)·d / (1 + cos) (the definition's corner); X = the targets' crossing,
      // exact (lineCrossOf) and rounded once; two targets that SHARE an endpoint meet exactly there. X within NODE_BOUND of M → the
      // corner is X. Otherwise F's boundary there had a short connector that rounding merged away, and the honest corner is TWO
      // points: M's foot on A and M's foot on B, each rounded once, joined by a BORN connector (the gap piece v·P_A·P_B, below)
      const A = runs[kk].L, B = runs[r].L, sh = [A[0], A[1]].find(pa => [B[0], B[1]].some(pb => pb[0] === pa[0] && pb[1] === pa[1]))
      const M = [v.X + (nk[0] + nj[0]) * dBack / (1 + cosA), v.Y + (nk[1] + nj[1]) * dBack / (1 + cosA)]
      if (CORNER_AT_MITER && !(sh && intLine(A) && intLine(B))) { const Mr = M.map(Math.round); return { end: { X: Mr[0], Y: Mr[1] }, start: { X: Mr[0], Y: Mr[1] } } }   // ⛔ the mutant only: the withdrawn (a)
      let X = sh && intLine(A) && intLine(B) ? sh : null
      if (!X) { try { X = intLine(A) && intLine(B) ? lineCrossOf({ a: A[0], b: A[1] }, { a: B[0], b: B[1] }, who) : fcross(A, B).map(Math.round) } catch { X = null }
        if (X && !(Math.hypot(X[0] - M[0], X[1] - M[1]) <= NODE_BOUND)) X = null }
      if (X) return { end: { X: X[0], Y: X[1] }, start: { X: X[0], Y: X[1] } }
      const pa = P2(...foot({ X: M[0], Y: M[1] }, A)), pb = P2(...foot({ X: M[0], Y: M[1] }, B))
      stat.backTwoFeet = (stat.backTwoFeet || 0) + 1
      if (process.env.CUTONCE_FEET) console.log('FEET', who, JSON.stringify({ v: [v.X, v.Y], M: M.map(Math.round), X, pa: [pa.X, pa.Y], pb: [pb.X, pb.Y], A, B, turnDeg: +(Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI).toFixed(2) }))
      if (pa.X === pb.X && pa.Y === pb.Y) return { end: pa, start: pb }
      return { end: pa, start: pb, conn: true, v } })
    for (let kk = 0; kk < m; kk++) { const c = C[kk]; if (c.cap) pieces.push(ccwp([{ X: c.v.X, Y: c.v.Y, tag: BORN }, { ...c.end, tag: BORN }, { ...c.start, tag: BORN }])) }
    for (let q = 0; q < m; q++) { const kk = (q - 1 + m) % m, a = vAt(q), b = vAt((q + 1) % m), L = runs[q].L
      const s0 = C[kk].start, e0 = C[q].end, along = (e0.X - s0.X) * (L[1][0] - L[0][0]) + (e0.Y - s0.Y) * (L[1][1] - L[0][1])
      // a two-feet corner at the run's END (ruling (a′)): its gap, F's vertex · P_A · P_B, is a needle one step wide that the noder
      // cannot carry alone, so it is part of THIS strip: b → P_B (side) → P_A (the born connector) → along the run
      const cn = C[q].conn ? [{ ...C[q].start, tag: BORN }] : []
      if (along > 0) { pieces.push(ccwp([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, ...cn, { ...e0, tag: runs[q].tag }, { ...s0, tag: BORN }])); continue }
      if (C[q].conn) pieces.push(ccwp([{ X: b.X, Y: b.Y, tag: BORN }, { ...C[q].start, tag: BORN }, { ...e0, tag: BORN }]))
      const raF = foot(a, L), rbF = foot(b, L)
      const aIsX = !C[kk].conv && Math.hypot(s0.X - raF[0], s0.Y - raF[1]) < LATTICE_STEP, bIsX = !C[q].conv && Math.hypot(e0.X - rbF[0], e0.Y - rbF[1]) < LATTICE_STEP
      const Ra = aIsX ? s0 : P2(...raF), Rb = bIsX ? e0 : P2(...rbF)
      pieces.push(ccwp([{ X: a.X, Y: a.Y, tag: NEAR }, { X: b.X, Y: b.Y, tag: BORN }, { ...Rb, tag: runs[q].tag }, { ...Ra, tag: BORN }]))
      if (!C[kk].conv && !aIsX) pieces.push(ccwp([{ X: a.X, Y: a.Y, tag: BORN }, { ...s0, tag: runs[q].tag }, { ...Ra, tag: BORN }]))
      if (!C[q].conv && !bIsX) pieces.push(ccwp([{ X: b.X, Y: b.Y, tag: BORN }, { ...Rb, tag: runs[q].tag }, { ...e0, tag: BORN }]))
      stat.backFolded = (stat.backFolded || 0) + 1 } })
  for (const pp of pieces) pp.forEach((q, k) => { if (q.tag === BORN) { const w = pp[(k + 1) % pp.length]; q.tag = { born: [[q.X, q.Y], [w.X, w.Y]] } } })
  const ps = dBack < 0 ? pieces.map(pp => { const r = pp.slice().reverse(); return r.map((q, k) => ({ ...q, tag: pp[(pp.length - 1 - k - 1 + pp.length) % pp.length].tag })) }) : pieces
  const base = F.rings.map((r, k) => r.map((q, i) => ({ X: q.X, Y: q.Y, tag: F.tags[k][i] })))
  // every tag read; a LINE wins over a born line on a segment both claim (a strip's far side against a neighbour's strip end)
  const Fb = arrange([base, ps], dBack < 0 ? (w => w[0] > 0 && !(w[1] < 0)) : (w => w[0] > 0 || w[1] > 0), `${who} back`, true)
  const pickTag = (t) => { const ts = t == null ? [] : Array.isArray(t) && !isLine(t) ? t : [t]; return ts.find(isLine) || ts.find(x => x?.born) || null }
  if (process.env.CUTONCE_THIN) { const thin = Fb.rings.filter(r => { const pp = [r.map(q => new IntPoint(q.X, q.Y))]; if (area(r) < 0) pp[0].reverse(); return isRoundingSliver(pp) })
    console.log(`THIN ${who}: ${thin.length} of ${Fb.rings.length} back-offset ring(s) are rounding slivers (≤ one step wide), ${thin.reduce((t, r) => t + Math.abs(area(r)), 0).toFixed(0)} u² in all; e.g. ${JSON.stringify(thin.slice(0, 3).map(r => ({ n: r.length, a: Math.abs(area(r)), at: [r[0].X, r[0].Y] })))}`) }
  const OUTb = Fb.rings.map((r, k) => r.map((q, i) => ({ X: q.X, Y: q.Y, tag: pickTag(Fb.tags[k][i]) })))
  // ⭐ THE EMISSION INVARIANT ON THE SPIKE'S OUTPUT (Zob's condition on departure (a)): every output edge on its tag's LINE within the
  // tiered bound (latticeFaces.js#onLineTiered); counted per stage (stat.backOffLine), the worst named
  let offN = 0, worst = null
  OUTb.forEach(r => r.forEach((q, i) => { const t = q.tag; if (!isLine(t) || !t.every(pt => pt.every(Number.isInteger))) return; const w = r[(i + 1) % r.length]
    for (const pt of [q, w]) { const segs = (INSERTED.get(pt.X + ',' + pt.Y) || []).map(x => x.seg); if (!onLineTiered(t, [pt.X, pt.Y], segs)) { offN++
      const dx = t[1][0] - t[0][0], dy = t[1][1] - t[0][1], dd = Math.abs((pt.X - t[0][0]) * dy - (pt.Y - t[0][1]) * dx) / Math.hypot(dx, dy)
      if (!worst || dd > worst.u) worst = { u: +dd.toFixed(1), at: [pt.X / SCALE, pt.Y / SCALE], line: t }; break } } }))
  ;(stat.backOffLine ||= {})[who] = { edges: offN, worst }
  return OUTb
}
export function morph(region, d, who, stat, lines = null) {
  let F
  if (RAW_CURVE) { const raw = region.map((R, g) => rawOffset(R, d, g, (stat.squares ||= []))); F = arrange([raw], w => w[0] > 0, `${who} offset`, true) }   // ⛔ the mutant only
  else { let pieces = region.flatMap((R, g) => offsetPieces(R, d, g, (stat.squares ||= []), BY_EDGES ? null : lines?.[g], stat))
    // ⭐ THE ERODE'S PIECES WIND CLOCKWISE (Plumb, 2026-10-29, measured on the decks): facesOf takes a boundary edge's tag from the
    // inputs running the SAME way as the boundary (the kept face on its left). In an erode the kept region lies OUTSIDE the
    // pieces, so a counter-clockwise piece's tagged far side runs AGAINST the boundary and every eroded edge came out tagless
    // (each back-offset then a fresh line, a near-copy of P's). Wound clockwise (tags moved with their edges), the far side runs
    // with the boundary; coverage is then winding < 0
    if (d < 0) pieces = pieces.map(pp => { const r = pp.slice().reverse(); return r.map((q, k) => ({ ...q, tag: pp[(pp.length - 1 - k - 1 + pp.length) % pp.length].tag })) })
    const base = region.map(R => R.map(q => ({ X: q.X, Y: q.Y, tag: null })))
    F = arrange([base, pieces], d < 0 ? (w => w[0] > 0 && !(w[1] < 0)) : (w => w[0] > 0 || w[1] > 0), `${who} offset`, true) }
  STAGES[d < 0 ? 'erode' : 'dilate'] = F.rings; STAGES[d < 0 ? 'erodeTags' : 'dilateTags'] = F.tags                                  // the stage-wise oracle reads each stage's REGION
  if (BACK_PIECES) return backPieces(F, region, lines, -d, who, stat)
  // TRACE (diagnostic only, CUTONCE_TRACE_AT=x,y metres): every eroded/dilated edge within 2 m of the place, with its tags
  if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE)
    F.rings.forEach((E, k) => E.forEach((q, e) => { const r2 = E[(e + 1) % E.length]; if (Math.min(Math.hypot(q.X - tx, q.Y - ty), Math.hypot(r2.X - tx, r2.Y - ty)) > 2000) return
      console.log(`TRACE ${who} ring ${k} e${e} (${q.X},${q.Y})→(${r2.X},${r2.Y}) tags ${JSON.stringify(F.tags[k][e])}`) })) }
  // ⭐ A RING OF THE OFFSET'S OWN FACES THAT IS WHOLLY THE ROUNDING IS NOT EMITTED (Plumb, 2026-10-29; PTown's wide fills): the same
  // predicate the arrangement applies to what it is given (isRoundingSliver, Zob's sliver ruling), applied to what the offset's face
  // walk returns, before the back-offset: a 3-vertex ring of zero area at a mouth the dilate shut, emitted on the open's lines, grew
  // into a 1 m² hole that drained the re-formed hole to the outside. Dropped, COUNTED and NAMED (DROPPED), never silent
  const keepK = F.rings.map((E, k) => { if (F_SLIVER_KEPT) return true; const pp = [E.map(q => new IntPoint(q.X, q.Y))]; if (area(E) < 0) pp[0].reverse(); if (!isRoundingSliver(pp)) return true
    let cx = 0, cy = 0; for (const q of E) { cx += q.X; cy += q.Y } DROPPED.push({ who: `${who} offset face`, set: -1, u2: Math.abs(area(E)), at: [+(cx / E.length / SCALE).toFixed(3), +(cy / E.length / SCALE).toFixed(3)] }); return false })
  const OUT = F.rings.map((E, k) => keepK[k] ? emit(E, F.tags[k], region, d, who, stat, lines) : null).filter(Boolean)
  if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE)
    OUT.forEach((E, k) => E.forEach((q, e) => { const r2 = E[(e + 1) % E.length]; if (Math.hypot(q.X - tx, q.Y - ty) > 2000) return
      console.log(`TRACE-OUT ${who} ring ${k} v${e} (${q.X},${q.Y})→(${r2.X},${r2.Y}) line ${JSON.stringify(q.tag)}`) })) }
  if (process.env.CUTONCE_LOST) console.log(`LOST ${who}: ${stat.lostTags || 0} edge(s) with no tag ${JSON.stringify(stat.lostAt || [])} · near sides out ${stat.nearOut || 0}`)
  return OUT
}

// a face set's rings → pieces [outer, …holes] (a hole into the smallest outer holding its first vertex)
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.X * q.Y - q.X * p.Y } return a / 2 }
const inR = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
function pieces(rings) {
  const outs = rings.filter(r => area(r) > 0).map(r => ({ r, a: area(r), holes: [] })), holes = rings.filter(r => area(r) < 0)
  for (const h of holes) { const m = h.find(() => true), own = outs.filter(o => inR(m.X + 0.25, m.Y + 0.25, o.r) || o.r.some(q => q.X === m.X && q.Y === m.Y)).sort((x, y) => x.a - y.a)[0]
    if (!own) throw new Error('⛔ pieces: a hole inside no outer. Refusing.'); own.holes.push(h) }
  return outs.map(o => [o.r, ...o.holes])
}
const toIP = (pp) => pp.map(r => r.map(q => new IntPoint(q.X, q.Y)))
const m2 = (pp) => pp.reduce((t, r) => t + area(r), 0) / SCALE / SCALE

/** The cut-once open/close at the step, with provenance. `paths` clipper paths (any winding; unioned first, nonzero). */
export { pieces, area }
// P: the input's union, each edge tagged with its own line
const unionTagged = (paths, what) => arrange([paths.map(p => p.map(q => ({ X: q.X, Y: q.Y })))], w => w[0] !== 0, `${what} union`, false, null, false).rings
  .map(r => r.map((q, i) => ({ X: q.X, Y: q.Y, tag: [[q.X, q.Y], [r[(i + 1) % r.length].X, r[(i + 1) % r.length].Y]] })))
// the input's union as its PARTS, each [outer, …holes] (a part in a part's hole its own): the noded arrangement's own P, for a caller that
// opens and closes part by part (structures.mjs#openCloseAtStep)
const fresh = () => { ORIGIN.clear(); INSERTED.clear(); DROPPED.length = 0 }   // the per-call records reset
export const partsOf = (paths, what) => { fresh(); return pieces(unionTagged(paths, what)).map(pp => pp.map(r => r.map(q => ({ X: q.X, Y: q.Y })))) }
// open = morph(P, −h) ∩ P
const openOf = (Pt, h, what, stat) => arrange([Pt, morph(Pt, -h, `${what} open`, stat)], w => w[0] > 0 && w[1] > 0, `${what} ∩P`, false, 0)
// ⭐ THE OPEN AND THE CLOSE ALONE, at h = step/2, for a caller whose operation is one of them (structures.mjs#waterWithoutDecks: the
// water beside a deck opened, the deck and its slivers closed): the same stages openCloseProvenance composes. → clipper Paths
export function openAt(paths, stepM, what, stat = {}) { const Pt = unionTagged(paths, what); return Pt.length ? toIP(openOf(Pt, (stepM / 2) * SCALE, what, stat).rings) : [] }
export function closeAt(paths, stepM, what, stat = {}) { const Pt = unionTagged(paths, what); if (!Pt.length) return []
  const C = morph(Pt, (stepM / 2) * SCALE, `${what} close`, stat, Pt.map(r => r.map(q => q.tag)))
  return toIP(arrange([Pt, C], w => w[0] > 0 || w[1] > 0, `${what} closed`, false, 0).rings) }
// a piece (rings {X, Y}: outer, holes) wider than 2h: it survives an erode by h + NODE_BOUND. An integer erode used as a PREDICATE only
// (as isRoundingSliver): its output is discarded
export const widerThanTwoH = (pp, h) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(toIP(pp), JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, -(h + NODE_BOUND)); return o.some(q => Clipper.Area(q) > 0) }
export function openCloseProvenance(paths, stepM, what) {
  const h = (stepM / 2) * SCALE, stat = { own: 0, cutJoin: 0, squared: 0, newLines: 0 }
  const Pt = unionTagged(paths, what)
  const OPEN = openOf(Pt, h, what, stat), open = OPEN.rings
  STAGES.open = open
  // closedK = morph(open, +h) ∪ open
  // ⭐ a TRANSITION edge of the open (two lines within rounding) gives the close the line its neighbour runs on, so the run
  // continues straight across it (Zob, 2026-10-29: across a transition, no vertex)
  // every tag normalized to a LINE for the close (a line; a born line's line; the first line of a list) or null (its own points)
  const isL = (x) => Array.isArray(x) && x.length === 2 && x.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite))
  const asLine = (tg) => (isL(tg) ? tg : tg?.born && isL(tg.born) ? tg.born : null)
  const openLines = OPEN.tags.map(T => T.map((tg, i) => { if (!(Array.isArray(tg) && !isL(tg))) return asLine(tg)
    tg = tg.map(asLine).filter(Boolean); if (tg.length <= 1) return tg[0] || null
    const key = (x) => JSON.stringify(x), prev = T[(i - 1 + T.length) % T.length], next = T[(i + 1) % T.length]
    stat.transitions = (stat.transitions || 0) + 1
    return tg.find(l => key(l) === key(prev)) || tg.find(l => key(l) === key(next)) || tg[0] }))
  if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE)
    open.forEach((r, g) => r.forEach((q, i) => { const w = r[(i + 1) % r.length]; if (Math.hypot(q.X - tx, q.Y - ty) > 1500) return
      console.log(`TRACE-OPEN ring ${g} e${i} (${q.X},${q.Y})→(${w.X},${w.Y}) ${Math.hypot(w.X - q.X, w.Y - q.Y).toFixed(1)} u · face-walk tag ${JSON.stringify(OPEN.tags[g][i])} · given to the close ${JSON.stringify(openLines[g][i])}`) })) }
  const C = morph(open, h, `${what} close`, stat, TAGS_BY_SEGMENT ? null : openLines)
  // each ring set passed on carries its face walk's tags ON ITS POINTS (arrange reads them there), so k's edges carry their lines
  const tagged = (F) => F.rings.map((r, k2) => r.map((q, i) => ({ X: q.X, Y: q.Y, tag: F.tags[k2]?.[i] ?? null })))
  const openT = tagged(OPEN)
  // ⭐ A DIFFERENCE'S SUBTRACTED SET IS WOUND CLOCKWISE (Huron's 407 lineless edges on k, 2026-10-29): facesOf tags an edge from the
  // inputs running the SAME way, and a subtracted set's edges bound the result running the other way, so they carried no tag.
  // Reversed (each tag moved with its edge, as the erode's pieces are), they run with the boundary; its coverage is winding < 0
  const revT = (rs) => rs.map(r => { const n = r.length, q = r.slice().reverse(); return q.map((v, k) => ({ ...v, tag: r[(n - 1 - k - 1 + n) % n].tag })) })
  const SUB = SUB_SAME_WAY ? (rs) => rs : revT, out_ = SUB_SAME_WAY ? (w) => w > 0 : (w) => w < 0
  const taken = pieces(tagged(arrange([Pt, SUB(openT)], w => w[0] > 0 && !out_(w[1]), `${what} taken`, false, 0)))
  const closedK = tagged(arrange([openT, C], w => w[0] > 0 || w[1] > 0, `${what} closedK`, false, 0))
  STAGES.closedK = closedK
  const filled = pieces(tagged(arrange([closedK, SUB(openT)], w => w[0] > 0 && !out_(w[1]), `${what} filled`, false, 0)))
  const tf = taken.filter(pp => !isRoundingSliver(toIP(pp))), ff = filled.filter(pp => !isRoundingSliver(toIP(pp)))
  // ⛔ THE DEFINITION'S INVARIANT ON EVERY FEATURE (Zob's ruling, 2026-10-29): the open takes, and the close fills, only where no disk of
  // radius h fits, so every taken and every filled feature erodes to nothing at h + NODE_BOUND (past the lattice's rounding), or the
  // call refuses by name (planted wallShort: a 120 m² hole the close filled, with no refusal)
  for (const [kind, fs] of [['taken', tf], ['filled', ff]]) for (const pp of fs) if (widerThanTwoH(pp, h)) { const o = pp[0]
    throw new Error(`[${what}] ⛔ the open/close: a ${kind} feature at (${(o[0].X / SCALE).toFixed(3)}, ${(o[0].Y / SCALE).toFixed(3)}) (${(m2(pp)).toFixed(2)} m²) is wider than a cell (it survives an erode by half a cell), and the definition ${kind === 'taken' ? 'takes' : 'fills'} nothing a disk of radius h fits in. Cause not established. Refusing.`) }
  const K = arrange([Pt, SUB(tf.flat()), ff.flat()], w => (w[0] > 0 && !out_(w[1])) || w[2] > 0, `${what} cut`, false, 0), k = K.rings
  // ⭐ THE TOPOLOGY GUARD ON k (Zob, 2026-10-29): a hole of P that k no longer holds (it opened to the outside), or two parts of P
  // that k joins, is the topology change Boz rules on: refused by name. Intermediate merges inside the open that the close
  // undoes are not refused. A test point per ring: half a unit to the side of its longest edge (P's material for an outer, the
  // hole for a hole)
  const wnd = (rs, x, y) => rs.reduce((t, r) => { let c = false; for (let a2 = 0, b2 = r.length - 1; a2 < r.length; b2 = a2++) { const p = r[a2], q = r[b2]; if ((p.Y > y) !== (q.Y > y) && x < (q.X - p.X) * (y - p.Y) / (q.Y - p.Y) + p.X) c = !c } return t + (c ? Math.sign(area(r)) : 0) }, 0)
  const probe = (r) => { let best = 0, bi = 0; r.forEach((p, i) => { const q = r[(i + 1) % r.length], L = Math.hypot(q.X - p.X, q.Y - p.Y); if (L > best) { best = L; bi = i } })
    const p = r[bi], q = r[(bi + 1) % r.length], L = best, nx = -(q.Y - p.Y) / L, ny = (q.X - p.X) / L, side = area(r) > 0 ? 0.5 : -0.5
    return [(p.X + q.X) / 2 + nx * side, (p.Y + q.Y) / 2 + ny * side] }
  const kOuters = k.filter(r => area(r) > 0)
  const ownerIn = (pt) => kOuters.map((r, i) => ({ i, a: area(r), inside: wnd([r], pt[0], pt[1]) !== 0 })).filter(x => x.inside).sort((x, y) => x.a - y.a)[0]?.i ?? null
  if (!NO_TOPOLOGY_GUARD) {
    for (const r of Pt.filter(r => area(r) < 0)) { const pt = probe(r); if (wnd(k, pt[0], pt[1]) !== 0) continue          // filled by the close: every filled feature is held narrower than 2h, above
      if (ownerIn(pt) == null) throw new Error(`[${what}] ⛔ the topology guard: P's hole at (${(r[0].X / SCALE).toFixed(3)}, ${(r[0].Y / SCALE).toFixed(3)}) (${(-area(r) / SCALE / SCALE).toFixed(2)} m²) is no longer a hole of the output: it opened to the outside. The topology change is Boz's. Refusing.`) }
    const seen = new Map(); for (const r of Pt.filter(r => area(r) > 0)) { const o = ownerIn(probe(r)); if (o == null) continue
      if (seen.has(o)) throw new Error(`[${what}] ⛔ the topology guard: two parts of P (at (${(seen.get(o)[0].X / SCALE).toFixed(3)}, ${(seen.get(o)[0].Y / SCALE).toFixed(3)}) and (${(r[0].X / SCALE).toFixed(3)}, ${(r[0].Y / SCALE).toFixed(3)})) are joined by the output. The topology change is Boz's. Refusing.`)
      seen.set(o, r) } }
  return { paths: toIP(k), rings: k, tags: K.tags, P: Pt, stat, opened: tf.map(pp => +m2(pp).toFixed(3)), closed: ff.map(pp => +m2(pp).toFixed(3)), slivers: { taken: taken.length - tf.length, filled: filled.length - ff.length } }
}
