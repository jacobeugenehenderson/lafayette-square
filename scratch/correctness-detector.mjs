#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// CORRECTNESS DETECTOR  ·  v1 (Sieve, 2026-06-13)  ·  READ-ONLY FORENSIC
//
// First pass of the "correctness suite" (POLYGON-FIRST §5): per-chain
// invariants that FLAG streets whose geometry the pipeline gets wrong, so a
// kit never needs a human to hand-fix them. The 35 `source:'curated'` streets
// (INTAKE §6.1) are the LABELED defect set — a good detector flags them and
// does NOT false-positive on the ~180-street clean grid.
//
//   node scratch/correctness-detector.mjs            # full report (frame + confusion)
//   node scratch/correctness-detector.mjs --raw      # also run the chain invariants on
//                                                    #   the raw-OSM geometry of the 35
//
// INVARIANTS (each pass/fail per street):
//   CHAIN-LEVEL (run on ribbons.streets[] AND on raw-OSM stitched chains):
//     • max-turn      — jagged-arc detector (per-vertex exterior angle). West 18th must fail.
//     • width-step    — pavementHW jump across a same-NAME through-node.
//     • through-width — a continuesAs through-road (one canonical roadId) must carry ONE
//                       pavementHW PER SIDE — a per-name-fragment width step is the datum
//                       artifact behind the junction-curb bump. Regression guard for the
//                       derive.js name-aware width reconciliation. [HANDOFF-curve-primitive-skeleton]
//   TILE/CURB-LEVEL (run on buildTileGround output, current frame only):
//     • curb∥chain    — curb is a parallel offset of its chain (litmus logic).
//     • iA self-int   — the curb ring does not self-cross.
//     • face-closure  — the tile ring closes / has positive area / no zero-len edges.
//     • curb-bump     — a sharp turn between two SHORT curve-samples on iA = a junction-curb
//                       BUMP (the name-aware-corner / width-step-at-through-seam family: a
//                       continuesAs seam mis-read as a corner, or a width step rendered as a
//                       notch). The symptom-level "eye, mechanized" — the worklist that drives
//                       to zero as each through-road is reconciled. [HANDOFF-curve-primitive-skeleton]
//
// ⚠️ Thresholds are NOT tuned to flag exactly 35. They are set from geometric
// first-principles (a residential turn > ~50° between digitized vertices is a
// jag; a same-name through-node width jump > 1m is a step). The report tells
// the HONEST recall/precision so the operator can judge the thresholds.
// Flags are CANDIDATES FOR THE OPERATOR, not verdicts (proxy renders mislead).
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const RUN_RAW = process.argv.includes('--raw')

const { buildTileGround, extractFaces, sectionPass } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

// ── tunables (first-principles, not fit to 35) ──────────────────────────────
const MAX_TURN_DEG       = 50   // ° — exterior angle at a vertex above this = a jag on a road
const MAX_TURN_COUNT     = 2    // a chain with ≥ this many jag-vertices is flagged (1 jag may be a real corner)
const MIN_SEG_FOR_TURN   = 1.0  // m — ignore turn at vertices joined by a < this segment (noise/dupes)
const WIDTH_STEP_TOL     = 1.0  // m — same-name through-node pavementHW jump above this = a step
const NODE_SNAP          = 2.0  // m — two chain endpoints within this are the "same node"
// junction-curb bump (the name-aware-corner / through-seam family — this fix, 2026-06-15)
const CURB_BUMP_DEG      = 20   // ° — a sharp turn on iA above this between two short curve-samples = a bump (the genuine fillet arcs sit <18° per-vertex; a real corner has a LONG leg)
const CURB_BUMP_SEG      = 3.0  // m — both adjacent iA edges shorter than this ⇒ a curve-sample bump, not an authored corner (whose legs run long)
const THRU_WIDTH_TOL     = 0.5  // m — a canonical through-road's per-side pavementHW must agree within this (else a datum step → seam bump)
// divided-median health (Verge, 2026-06-15 — the construct-the-hard-polygons campaign)
const MIN_MEDIAN         = 1.0  // m — a divided pair must leave at least this much median between the two carriageways; less ⇒ the asphalt overruns and annihilates it (the needle/sliver)
const MAX_CHAINGAP       = 60   // m — a divided pair gap wider than this is a detector mis-pair (the OSM2STREETS §3.1 ceiling)
// curb∥chain (from litmus)
const CURB_TOL           = 0.75 // m — max |curb-offset − halfWidth| on a straight run
const FILLET_MARGIN      = 9    // m — exclude samples this close to a run end (corner zone) — see litmus
const STEP               = 0.5  // m — chain sampling interval
const MIN_RUN            = 22   // m — runs shorter are all-corner; skip
const RAY_CAP            = 4.5  // m — a hit beyond hw+this is the opposite curb; ignore
const MAX_TILE_SPAN      = 250  // m — skip the perimeter megatile
// topological invariants (Loom, 2026-06-13)
const WELD_TOL           = 0.15 // m — the extractFaces ENDPOINT_SNAP; a loop body gapping > this does NOT close (no emergent face)
const LOOP_GAP_CAND      = 8.0  // m — a single chain whose endpoints sit within this is a LOOP-BODY candidate to test for closure
const TIP_CAP_TOL        = 3.0  // m — an authored cul-de-sac tip with no shape cap (round/blunt) within this = a missing/degenerate cap
const NODE_DEG_SNAP      = 2.0  // m — two chain endpoints/vertices within this are the same graph node (for degree)
const COUPLET_FACE_MAX   = 2500 // m² — a couplet median is a THIN enclosed face; a larger bounded face is an ordinary city block (no median expected)
// junction-band silhouette invariant (this pass, 2026-06-13)
const JUNC_DEG          = 3    // a graph node of this degree or more is a real junction (the ped junction must close there)
const JUNC_THROAT_R     = 14   // m — the throat radius around a junction node within which the ped FILL must form one coherent junction
const JUNC_TILE_REACH   = 12   // m — a tile whose curb (iA) passes within this of the node is incident to the junction
const SLIVER_AREA       = 8    // m² — a ped (treelawn/sidewalk) fragment smaller than this at the throat is a junction-band SLIVER (a fragmented ped band). The legitimate leg strips are >100 m²; the slivers are the 2–6 m² wedges the independently-stroked legs leave behind.
const JUNC_SLIVER_FLAG  = 2    // a junction with this many throat slivers is flagged (1 may be a single corner notch; ≥2 = the band is fragmenting)
// name-transition smoothness invariant (Boz, 2026-06-13 — the through-road-simplify gate)
const NT_FACET_DEG      = 30   // ° — a name-transition is "one road through" (it's DETECTED via a collinear-tangent gate in skeleton.js), so a seam exterior-turn above this is a simplification FACET, not a real bend. The genuine U-corners sit ~20°. RED before c4cb191 (W18↔Dolman 46.5°), GREEN after (15.6°). First-principles, not fit.

// ── geometry helpers ────────────────────────────────────────────────────────
const sub   = (a, b) => [a[0] - b[0], a[1] - b[1]]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const dot   = (a, b) => a[0] * b[0] + a[1] * b[1]
const len   = (a) => Math.hypot(a[0], a[1])
const dist  = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

function rayHit(O, D, edges) {
  let best = Infinity
  for (const [A, B] of edges) {
    const E = sub(B, A), den = cross(E, D)
    if (Math.abs(den) < 1e-12) continue
    const W = sub(A, O)
    const t = cross(E, W) / den, s = cross(D, W) / den
    if (t > 1e-4 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t
  }
  return best
}
// segment-segment proper intersection (for self-int)
function segInt(p1, p2, p3, p4) {
  const d1 = sub(p2, p1), d2 = sub(p4, p3)
  const den = cross(d1, d2)
  if (Math.abs(den) < 1e-12) return false
  const t = cross(sub(p3, p1), d2) / den
  const u = cross(sub(p3, p1), d1) / den
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
}

// ── INVARIANT 1: max-turn (jagged arc) ──────────────────────────────────────
// Pure function of a polyline. Counts vertices whose exterior turn angle exceeds
// MAX_TURN_DEG (joined by segments ≥ MIN_SEG_FOR_TURN so vertex dupes/noise don't fire).
function maxTurn(pts) {
  let jags = 0, worst = 0, worstAt = null
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1]
    const v1 = sub(b, a), v2 = sub(c, b)
    const l1 = len(v1), l2 = len(v2)
    if (l1 < MIN_SEG_FOR_TURN || l2 < MIN_SEG_FOR_TURN) continue
    let ang = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (l1 * l2)))) * 180 / Math.PI
    if (ang > worst) { worst = ang; worstAt = b }
    if (ang > MAX_TURN_DEG) jags++
  }
  return { fail: jags >= MAX_TURN_COUNT, jags, worst: +worst.toFixed(1), worstAt }
}

// ── INVARIANT 2: width-step at a same-name through-node ──────────────────────
// For each pair of chains that SHARE A NAME and whose endpoints coincide (a
// through-node, not a corner/T to a different street), the pavementHW should
// match. A jump > WIDTH_STEP_TOL is a datum step (the Vail/Mackay/Albion class).
function widthStepReport(streets) {
  const byName = {}
  for (const s of streets) (byName[s.name] = byName[s.name] || []).push(s)
  const flagged = {}   // name -> {step, a, b}
  for (const [name, group] of Object.entries(byName)) {
    if (group.length < 2 || !name) continue
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const A = group[i], B = group[j]
      const ea = [A.points[0], A.points[A.points.length - 1]]
      const eb = [B.points[0], B.points[B.points.length - 1]]
      let touch = false
      for (const pa of ea) for (const pb of eb) if (dist(pa, pb) < NODE_SNAP) touch = true
      if (!touch) continue
      const hwA = A.measure?.left?.pavementHW || 0
      const hwB = B.measure?.left?.pavementHW || 0
      if (hwA < 0.3 || hwB < 0.3) continue   // a 0-HW chain is a stem/marker, not a real width
      const step = Math.abs(hwA - hwB)
      if (step > WIDTH_STEP_TOL) {
        const prev = flagged[name]
        if (!prev || step > prev.step) flagged[name] = { step: +step.toFixed(2), a: +hwA.toFixed(2), b: +hwB.toFixed(2) }
      }
    }
  }
  return flagged   // name -> detail
}

// ── INVARIANT: through-road width consistency (name-aware, the datum CAUSE) ───
// A continuesAs through-road is ONE road (the name is a label, the road is the
// line — RIBBONS §1, SKELETON §5a). It must carry ONE curb half-width PER SIDE;
// a per-name-fragment step (West-18th 5.49 ↔ Dolman 3.76 ↔ South-18th 3.25) is a
// datum artifact that renders as the junction-curb BUMP at the seam. Grouped by
// the canonical `roadId` (continuesAs union, frozen in derive.js), NOT by name —
// so it sees across name-transitions where same-name grouping is blind. This is
// the REGRESSION GUARD for the derive.js name-aware width reconciliation: GREEN
// (0) once a road carries one width per side. [HANDOFF-curve-primitive-skeleton]
function throughRoadWidthReport(streets) {
  const byRoad = {}
  for (const s of streets) { const rid = s.roadId || s.skelId; (byRoad[rid] = byRoad[rid] || []).push(s) }
  const flagged = {}   // name -> {roadId, side, vals}
  for (const [rid, chains] of Object.entries(byRoad)) {
    if (chains.length < 2) continue
    for (const side of ['left', 'right']) {
      const vals = [...new Set(chains.map(c => c.measure?.[side]?.pavementHW).filter(v => v != null && v > 0.3).map(v => +v.toFixed(2)))]
      if (vals.length < 2) continue
      if (Math.max(...vals) - Math.min(...vals) <= THRU_WIDTH_TOL) continue
      for (const c of chains) if (c.name && !flagged[c.name]) flagged[c.name] = { rid, side, vals }
    }
  }
  return flagged   // name -> detail
}

// ── INVARIANT: divided-median health (the construct-the-hard-polygons campaign) ──
// A divided carriageway strokes asphalt INWARD by its full inboard pavementHW; when
// the two carriageways' median-facing half-widths sum PAST the chain gap, their
// asphalt OVERRUNS and annihilates the (healthy) median ring → the rendered
// needle/sliver (Verge, 2026-06-15: all 39 frozen median rings are healthy; the
// render eats them — e.g. Lafayette lanes:1 stamped at the whole-road 10.56 m
// half-width). Two FRAME-ONLY gates (no buildTileGround): (1) width-overrun — the
// ROOT, drive to zero by the inboard-clamp + source width fix; (2) chainGap sanity.
// The inboard side is found GEOMETRICALLY (the side whose perp faces the mate), so
// no left/right convention is assumed. [HANDOFF-construct-hard-polygons.md HALF B]
function dividedMedianReport(streets) {
  const bySkel = {}; for (const s of streets) if (s.skelId) bySkel[s.skelId] = s
  const inboardHW = (a, b) => {
    const pa = a.points, pb = b.points
    if (!pa?.length || !pb?.length) return 0
    const ca = pa[Math.floor(pa.length / 2)], cb = pb[Math.floor(pb.length / 2)]
    const i = Math.max(1, Math.floor(pa.length / 2))
    const dx = pa[i][0] - pa[i - 1][0], dz = pa[i][1] - pa[i - 1][1], L = Math.hypot(dx, dz) || 1
    const toMate = [cb[0] - ca[0], cb[1] - ca[1]]
    const leftPerp = [-dz / L, dx / L]
    const side = (leftPerp[0] * toMate[0] + leftPerp[1] * toMate[1] > 0) ? 'left' : 'right'
    return a.measure?.[side]?.pavementHW || 0
  }
  const seen = new Set()
  const flagged = {}   // name -> { gap, hwSum, median, why }
  for (const s of streets) {
    if (s.phase?.kind !== 'divided' || !s.pairId) continue
    const key = [s.skelId, s.pairId].sort().join('|')
    if (seen.has(key)) continue; seen.add(key)
    const m = bySkel[s.pairId]; if (!m) continue
    const gap = s.phase?.chainGap ?? s.phase?.medianWidth
    if (gap == null) continue
    const hwA = inboardHW(s, m), hwB = inboardHW(m, s), sum = hwA + hwB
    const median = gap - sum
    let why = null
    if (gap < MIN_MEDIAN || gap > MAX_CHAINGAP) why = `chainGap ${gap.toFixed(1)}m out of [${MIN_MEDIAN},${MAX_CHAINGAP}] (mis-pair?)`
    else if (median < MIN_MEDIAN) why = `inboard hw ${hwA.toFixed(1)}+${hwB.toFixed(1)}=${sum.toFixed(1)} vs gap ${gap.toFixed(1)} → median ${median.toFixed(1)}m (overrun → needle)`
    if (why) for (const c of [s, m]) if (c.name && !flagged[c.name]) flagged[c.name] = { gap: +gap.toFixed(1), hwSum: +sum.toFixed(1), median: +median.toFixed(1), why }
  }
  return flagged   // name -> detail
}

// ── signed area (CCW positive) ───────────────────────────────────────────────
function signedArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1] }
  return a / 2
}
const centroid = (ring) => { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1] } return [x / ring.length, y / ring.length] }
function inPoly(p, poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])) c = !c
  }
  return c
}

// ── INVARIANT 6 (TOPOLOGICAL): loop-closure ──────────────────────────────────
// A loop street's body should enclose a FACE → the emergent median (LOOP-STREETS
// §0/§1). The face exists ONLY if the body's two endpoints meet within the
// extractFaces endpoint-weld (ENDPOINT_SNAP = 0.15 m). This is a GRAPH check, not
// a per-chain shape check: a loop body gapping > WELD_TOL reads as an open chain
// whose ends are distinct nodes → no ring closes → no median. FAIL = a loop-body
// candidate whose gap exceeds the weld tol AND/OR has no enclosed face / median
// near its interior. Oracle = extractFaces (the same walk the producer runs) +
// the frozen medians.
//
// Candidate detection (independent of the answer):
//   (A) single self-closing chain — points[0]≈points[-1] within LOOP_GAP_CAND
//       (Benton body 3.2cm, Park Place 0.0, Saint Vincent 2.2cm; the teardrop bodies)
//   (B) same-name multi-chain CYCLE — ≥2 same-name chains whose endpoints form a
//       closed planar walk (Waverly couplet). Reported as a candidate; closure is
//       judged by whether the group bounds an enclosed face.
function loopClosureReport(streets, faces, medians) {
  const flagged = {}   // name -> {reason, gap, faceArea}
  const facesCen = faces.map(f => ({ c: centroid(f.ring), a: signedArea(f.ring), ring: f.ring }))
  const medCens = (medians || []).filter(m => m.kind === 'median' && Array.isArray(m.ring) && m.ring.length >= 3)
                                 .map(m => ({ c: centroid(m.ring), a: Math.abs(signedArea(m.ring)) }))
  // nearest SMALL enclosed face to a point (the loop interior is a small bounded face)
  const nearFace = (c) => {
    let best = null, bd = Infinity
    for (const f of facesCen) { const d = Math.hypot(f.c[0] - c[0], f.c[1] - c[1]); if (d < bd) { bd = d; best = f } }
    return { d: bd, f: best }
  }
  const nearMed = (c) => { let bd = Infinity; for (const m of medCens) { const d = Math.hypot(m.c[0] - c[0], m.c[1] - c[1]); if (d < bd) bd = d } return bd }

  // (A) single self-closing chains
  for (const s of streets) {
    const pts = s?.points; if (!pts || pts.length < 4) continue
    const gap = dist(pts[0], pts[pts.length - 1])
    if (gap > LOOP_GAP_CAND) continue     // not a loop-body candidate
    const c = centroid(pts)
    const nf = nearFace(c)
    const md = nearMed(c)
    // closes? gap ≤ weld tol AND an enclosed face sits at the interior AND a median was emitted
    const closes = gap <= WELD_TOL && nf.d < 12 && Math.abs(nf.f?.a || 0) > 1
    const hasMedian = md < 12
    if (!closes || !hasMedian) {
      flagged[s.name] = {
        kind: 'A', gap: +gap.toFixed(3),
        faceD: +nf.d.toFixed(1), faceA: +Math.abs(nf.f?.a || 0).toFixed(0), medD: +md.toFixed(1),
        why: gap > WELD_TOL ? `gap ${gap.toFixed(2)}m > weld ${WELD_TOL}m → no face`
            : !hasMedian      ? 'no median emitted at interior'
            :                   'no enclosed face at interior',
      }
    }
  }
  // (B) GENUINE COUPLET (type B — LOOP-STREETS §1): ≥1 same-name ONEWAY
  // carriageway, all CENTER-anchored (NOT divided/inner-edge), the group forming
  // a cycle whose interior should be an emergent median (Waverly). We EXCLUDE
  // divided carriageways (anchor:'inner-edge' / pairId) — those carry a
  // CONSTRUCTED E2 median already (NOT the emergent-face case), so flagging them
  // is redundant with width-step/curb and pure noise. FAIL = the couplet interior
  // has no enclosed face / median (the open Waverly cut-thru — LOOP-STREETS §6
  // says it still renders full ROW, not curb+median).
  const byName = {}
  for (const s of streets) if (s?.points?.length >= 2) (byName[s.name] = byName[s.name] || []).push(s)
  for (const [name, group] of Object.entries(byName)) {
    if (group.length < 2 || !name || flagged[name]) continue
    const divided = group.some(s => s.anchor === 'inner-edge' || s.pairId)
    const oneways = group.filter(s => s.oneway).length
    if (divided || oneways < 1) continue   // divided avenue (constructed median) or not a oneway couplet
    const ends = []
    for (const s of group) { ends.push(s.points[0], s.points[s.points.length - 1]) }
    const reps = []
    const nodeOf = (p) => { for (const q of reps) if (dist(p, q.p) < NODE_DEG_SNAP) { q.deg++; return q } reps.push({ p, deg: 1 }); return reps[reps.length - 1] }
    for (const e of ends) nodeOf(e)
    const interiorNodes = reps.filter(r => r.deg >= 2).length
    if (interiorNodes < 2) continue   // not a cycle — same-name street split at through-nodes
    const c = centroid(ends)
    const md = nearMed(c)
    const nf = nearFace(c)
    // A genuine couplet's enclosed face is a THIN median (the carriageways run a
    // few m apart) — a large face is an ordinary city block the cycle bounds, and
    // it correctly has no median. Only flag when the bounded face is median-sized
    // (< COUPLET_FACE_MAX m²) AND no median was emitted there.
    const faceA = nf.d < 30 ? Math.abs(nf.f?.a || 0) : 0
    const couplet = faceA > 1 && faceA < COUPLET_FACE_MAX
    const hasMed = md < 25
    if (couplet && !hasMed) flagged[name] = { kind: 'B', cyclicNodes: interiorNodes, faceD: +nf.d.toFixed(1), faceA: +faceA.toFixed(0), medD: +md.toFixed(1), why: 'oneway couplet encloses no emergent median' }
  }
  return flagged
}

// ── INVARIANT 7 (TOPOLOGICAL): cul-de-sac-cap-tangent ────────────────────────
// A degree-1 dead-end TIP that the operator authored a cap on (capEnds = round|
// blunt) must materialize a proper cap in the rendered tile geometry — a round
// semicircle or a blunt flat, tangent to the chain (SECTION §6, HANDOFF-dead-end
// -typology). FAIL = an authored tip with NO shape-tip (roundTips/bluntTips)
// within TIP_CAP_TOL → the cap is missing/degenerate (the ribbon just stops or
// thorns). This is GRAPH-level: we key on the graph DEGREE of the endpoint (a
// true tip is degree 1) so a coincidental same-name endpoint elsewhere doesn't
// fire, then read the authored intent (capEnds) and the realized shape (tips).
//
// Note on `caps[].degree`: it is computed in the seed but defaults `cap:'round'`
// on EVERY degree-1 end incl. chains that exit the rendered clip — too loose. We
// rebuild the graph degree from the live chains and require capEnds to be the
// AUTHORED signal, so we test the operator's intent, not a default.
function capTangentReport(streets, tiles, clip) {
  // graph degree over all chain endpoints + interior touches (snap NODE_DEG_SNAP)
  const reps = []
  const node = (p) => { for (const q of reps) if (dist(p, q.p) < NODE_DEG_SNAP) return q; const q = { p, deg: 0 }; reps.push(q); return q }
  for (const s of streets) { if (!s?.points?.length) continue; node(s.points[0]).deg++; node(s.points[s.points.length - 1]).deg++ }
  for (const s of streets) for (let i = 1; i < (s.points?.length || 0) - 1; i++) {
    for (const q of reps) if (dist(s.points[i], q.p) < NODE_DEG_SNAP) { q.deg += 2; break }   // a chain passing through an endpoint-node
  }
  const degAt = (p) => { for (const q of reps) if (dist(p, q.p) < NODE_DEG_SNAP) return q.deg; return 0 }
  // collect realized shape tips
  const tips = []
  for (const t of tiles) { for (const rt of (t.roundTips || [])) tips.push({ p: rt.p, kind: 'round' }); for (const bt of (t.bluntTips || [])) tips.push({ p: bt.p, kind: 'blunt' }) }
  const nearTip = (p) => { let bd = Infinity, bk = null; for (const t of tips) { const d = dist(t.p, p); if (d < bd) { bd = d; bk = t.kind } } return { d: bd, kind: bk } }

  const flagged = {}   // name -> {end, capEnd, dist}
  for (const s of streets) {
    if (!s?.capEnds || !s.points?.length) continue
    for (const [end, idx] of [['start', 0], ['end', s.points.length - 1]]) {
      const ce = s.capEnds[end]
      if (ce !== 'round' && ce !== 'blunt') continue   // only AUTHORED caps (operator intent)
      const p = s.points[idx]
      if (degAt(p) !== 1) continue                       // must be a TRUE graph tip
      if (clip && !inPoly(p, clip)) continue             // tip is rendered
      const nt = nearTip(p)
      if (!(nt.d < TIP_CAP_TOL)) {
        const prev = flagged[s.name]
        if (!prev || nt.d < prev.dist) flagged[s.name] = { end, capEnd: ce, dist: +nt.d.toFixed(1) }
      }
    }
  }
  return flagged
}

// ── INVARIANT 8 (TOPOLOGICAL): junction-band silhouette ──────────────────────
// At each real junction node (graph degree ≥ JUNC_DEG) the asphalt junction IS
// constructed as one polygon (junctionMap / E3.2 — `SECTION §7`), but the PED
// bands are NOT — each leg/tile strokes its treelawn+sidewalk inward independently,
// stencil-clipped to its own tile. Where the throat necks, those independent strokes
// leave the junction mouth FRAGMENTED: the treelawn/sidewalk break into tiny wedge
// SLIVERS instead of one coherent ped junction (the visible "green sliver / jagged
// corner" defect — `scratch/jx-*.png`). This is the third topological class
// POLYGON-FIRST §5 / SECTION §7 names ("does the constructed ped junction match the
// asphalt junction?") — the one neither loop-closure nor cap-tangent touches.
//
// SIGNAL (measured, not asserted): per junction node, stroke each incident tile’s
// ped FILL via the producer (sectionPass) and count ped fragments smaller than
// SLIVER_AREA within the throat. The legitimate leg strips are >100 m²; the
// fragments left by independent strokes are 2–6 m². ≥ JUNC_SLIVER_FLAG slivers at a
// node = the ped junction is fragmenting. ORACLE = sectionPass (the same FILL stroke
// the producer + Stage run); the asphalt junction (pr.asphalt) is the reference the
// ped should agree with. This is a GRAPH-level check (keyed on node degree), like
// loop-closure/cap-tangent — not a per-chain shape check.
//
// ⚠️ The unit of the defect is the JUNCTION, not the street. Name-attribution
// (a node’s flag → all its incident street names) inherently OVER-SPREADS to the
// grid streets that merely cross there, so the report leads with the per-junction
// confusion and treats name-recall as secondary (cf. Loom’s discipline).
function junctionBandReport(streets, tiles, asphalt, cw) {
  // (a) graph degree over endpoints + interior touches (snap NODE_DEG_SNAP) — reuse
  //     the same node model cap-tangent uses, so a junction = a real degree-≥3 node.
  const reps = []
  const node = (p) => { for (const q of reps) if (dist(p, q.p) < NODE_DEG_SNAP) return q; const q = { p, deg: 0, names: new Set() }; reps.push(q); return q }
  for (const s of streets) { if (!s?.points?.length) continue; const a = node(s.points[0]); a.deg++; a.names.add(s.name); const b = node(s.points[s.points.length - 1]); b.deg++; b.names.add(s.name) }
  for (const s of streets) for (let i = 1; i < (s.points?.length || 0) - 1; i++) {
    for (const q of reps) if (dist(s.points[i], q.p) < NODE_DEG_SNAP) { q.deg += 2; q.names.add(s.name); break }
  }
  const J = reps.filter(q => q.deg >= JUNC_DEG)

  // (b) per-tile ped FILL (treelawn + sidewalk fragments) via the producer, cached.
  const stripMat = { outer: 'LU', inner: 'SW' }
  const pedCache = {}
  const pedOf = (ti) => pedCache[ti] || (pedCache[ti] = (() => {
    const sp = sectionPass([tiles[ti]], cw, stripMat, null)
    const flat = (byLu) => Object.values(byLu || {}).flat()
    return [...flat(sp.tlByLu), ...sp.Wacc].filter(r => r && r.length >= 3)
  })())
  const ringArea = (r) => Math.abs(signedArea(r))
  const nearD = (r, p) => { let m = Infinity; for (const v of r) { const d = dist(v, p); if (d < m) m = d } return m }
  const incidentTiles = (p) => { const o = []; for (let ti = 0; ti < tiles.length; ti++) { const T = tiles[ti]; if (!T?.iA) continue; let near = false; for (const r of T.iA) { for (const v of r) if (dist(v, p) < JUNC_TILE_REACH) { near = true; break } if (near) break } if (near) o.push(ti) } return o }

  // (c) per junction: count throat slivers + the worst (smallest) sliver area
  const junctions = []   // {p, deg, names:[], slivers, worstA, tilesN}
  for (const q of J) {
    const tis = incidentTiles(q.p)
    let slivers = 0, worstA = Infinity
    for (const ti of tis) for (const r of pedOf(ti)) {
      if (nearD(r, q.p) >= JUNC_THROAT_R) continue
      const a = ringArea(r)
      if (a < SLIVER_AREA) { slivers++; if (a < worstA) worstA = a }
    }
    junctions.push({ p: q.p, deg: q.deg, names: [...q.names], slivers, worstA: isFinite(worstA) ? worstA : null, tilesN: tis.length })
  }

  // (d) name attribution (secondary; over-spreads by construction)
  const flaggedNames = {}   // name -> worst slivers at any incident flagged junction
  for (const j of junctions) {
    if (j.slivers < JUNC_SLIVER_FLAG) continue
    for (const n of j.names) { if (!flaggedNames[n] || j.slivers > flaggedNames[n].slivers) flaggedNames[n] = { slivers: j.slivers, worstA: j.worstA } }
  }
  return { junctions, flaggedNames }
}

// ── INVARIANT: name-transition smoothness (topological — the seam, not the chain)
// A name-transition keeps a road CONTINUOUS, so its seam should carry the road's
// own gentle curvature, not a hard kink. Per-chain RDP used to pin the seam node
// and drop the dense rounding, facetting it (W18↔Dolman 46.5°). Reads skeleton.json
// (it carries nameTransitions[] + {x,z} points); flags any seam whose exterior turn
// exceeds NT_FACET_DEG. This is the RED-until-true gate for the through-road fix
// (c4cb191) and the regression guard for every future town's name-transitions.
function nameTransitionReport(skOverride) {
  let sk = skOverride
  if (!sk) {
    const skPath = path.join(ROOT, 'cartograph/data/lafayette-square/clean/skeleton.json')
    if (!fs.existsSync(skPath)) return {}
    sk = JSON.parse(fs.readFileSync(skPath, 'utf8'))
  }
  const vk = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`
  const ang = (u, v) => {
    const l1 = Math.hypot(u.x, u.z), l2 = Math.hypot(v.x, v.z)
    if (l1 < 1e-6 || l2 < 1e-6) return 0
    return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.z * v.z) / (l1 * l2)))) * 180 / Math.PI
  }
  const flagged = {}
  for (const t of (sk.nameTransitions || [])) {
    const k = vk(t)
    const arms = []
    for (const s of sk.streets) {
      const p = s.points; if (!p || p.length < 2) continue
      if (vk(p[0]) === k) arms.push(p[1])
      if (vk(p[p.length - 1]) === k) arms.push(p[p.length - 2])
    }
    if (arms.length !== 2) continue
    const n = { x: t.x, z: t.z }
    const v1 = { x: n.x - arms[0].x, z: n.z - arms[0].z }   // into the node
    const v2 = { x: arms[1].x - n.x, z: arms[1].z - n.z }   // out of the node
    const seam = ang(v1, v2)
    if (seam > NT_FACET_DEG) {
      for (const nm of [t.from, t.to]) {
        if (!nm) continue
        if (!flagged[nm] || seam > flagged[nm].turn) flagged[nm] = { turn: +seam.toFixed(1), why: `${t.from}→${t.to} seam kink ${seam.toFixed(1)}° (facet, not a bend)` }
      }
    }
  }
  return flagged
}

// ── INVARIANT: curve-fit curb cleanliness (the D6a robust-offset GATE, 2026-06-14)
// The smooth-centerline knob (STREET_SMOOTH, SKELETON §3.5) feeds the curb offset;
// an UN-robust offset folds into needle rings / sliver islands / near-reversal spurs
// on tight smooth bends (Jacob's zoomed-out eye, the 2026-06-14 regression). This
// gate builds the frame at the curve-fit smoothing and asserts it introduces ZERO
// new curb degenerates vs the smooth=0 baseline. The DIFF (new-at-smoothed, by
// location) cancels the noise that made ad-hoc metrics useless: boundary long-edges
// + zero-length dup-stacks. RED until offsetRingVariable is robust; the permanent
// regression guard for every future town's curves after. (Not first-principles-
// absolute like the others — it's a smooth-vs-baseline DELTA, the honest test for
// "the knob added no degenerate".)
const CURVE_FIT_SMOOTH = 1.5
// Corner-roundness floor — the authored fillets MUST survive the offset. An
// ABSOLUTE check (not a smooth-vs-0 diff): a squaring bug squares at BOTH smooth
// values, so the diff can't see it. Known-good = 448 rounded fillets (r>0.5 m) at
// smooth=0 — was 459 until the name-aware corner fix (2026-06-15) correctly stopped
// filleting ~11 `continuesAs` name-seams (a through-node is NOT a corner — RIBBONS §1).
// Floor at 435 (margin below 448) — still craters the openRound squaring regression
// (459→93, 2026-06-14) which ring-count/area checks were blind to.
const ROUND_FILLET_MIN = 435
const roundedFillets = (tg) => Object.keys(tg.cornerFillets || {}).filter(k => (tg.cornerFillets[k]?.r || 0) > 0.5).length
function curbDegenerates(curbRings) {
  const feats = []
  for (const r of (curbRings || [])) {
    if (!r || r.length < 3) continue
    const a = Math.abs(signedArea(r))
    if (a > 0.01 && a < 8) {                                   // needle ring / fold island (legit fragments are >100 m²)
      let cx = 0, cy = 0; for (const p of r) { cx += p[0]; cy += p[1] }
      feats.push([cx / r.length, cy / r.length]); continue
    }
    for (let i = 0; i < r.length; i++) {                       // near-reversal spur tip on the body
      const p0 = r[(i - 1 + r.length) % r.length], v = r[i], p1 = r[(i + 1) % r.length]
      const e1 = dist(p0, v), e2 = dist(v, p1)
      if (e1 < 1 || e2 < 1 || e1 > 60 || e2 > 60) continue     // skip dup-stacks (0-len) + boundary/grade-sep long edges
      const d = ((v[0] - p0[0]) / e1) * ((p1[0] - v[0]) / e2) + ((v[1] - p0[1]) / e1) * ((p1[1] - v[1]) / e2)
      if (Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI > 165) feats.push(v)
    }
  }
  return feats
}
function curveFitReport() {
  const mk = (sm) => buildTileGround(ribbons, { stencil: clip, smooth: sm, curbWidth: design.curbWidth, blockLandUse: design.blockLandUse || null, cornerRadiusScale: design.cornerRadiusScale ?? 1, blockCustoms: design.blockCustoms || null, emitArtifact: true })
  const f0 = mk(0), f1 = mk(CURVE_FIT_SMOOTH)
  const base = curbDegenerates(f0.curb)
  const sm = curbDegenerates(f1.curb)
  const near = (p, set) => set.some(q => dist(p, q) < 5)
  const NEW = sm.filter(p => !near(p, base))
  return { base: base.length, sm: sm.length, NEW, rnd0: roundedFillets(f0), rnd1: roundedFillets(f1) }
}

// ── load the frame (same as corner-guard) ───────────────────────────────────
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const bnd = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/neighborhood_boundary.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json')))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])

const pr = buildTileGround(ribbons, {
  stencil: clip, smooth: 0, curbWidth: design.curbWidth,
  blockLandUse: design.blockLandUse || null, cornerRadiusScale: design.cornerRadiusScale ?? 1,
  blockCustoms: design.blockCustoms || null, emitArtifact: true,
})
const tiles = pr._shapeArtifact || []
const streets = ribbons.streets

// ── the labeled set: the 35 curated names ────────────────────────────────────
const centerlines = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/raw/centerlines.json'))).streets
const curatedNames = new Set(centerlines.filter(s => s.source === 'curated').map(s => s.name))
const isCurated = (name) => curatedNames.has(name)

// ════════════════════════════════════════════════════════════════════════════
// A. CHAIN INVARIANTS on the CURRENT frame (ribbons.streets)
// ════════════════════════════════════════════════════════════════════════════
// max-turn — per chain
const turnFlags = {}   // name -> worst {jags,worst}
for (const s of streets) {
  if (!s.points || s.points.length < 3) continue
  const t = maxTurn(s.points)
  if (t.fail) {
    const prev = turnFlags[s.name]
    if (!prev || t.jags > prev.jags) turnFlags[s.name] = t
  }
}
// width-step — per name
const stepFlags = widthStepReport(streets)
// through-road width consistency — per canonical roadId (the datum cause of the seam bump)
const thruWidthFlags = throughRoadWidthReport(streets)
// divided-median health — per divided pair (the carriageway-overrun root of the needle)
const medianFlags = dividedMedianReport(streets)

// ════════════════════════════════════════════════════════════════════════════
// B. TILE / CURB INVARIANTS on the CURRENT frame (buildTileGround)
// ════════════════════════════════════════════════════════════════════════════
// Map each tile-run to a street name via its skelId, so a tile flag attributes to a street.
const skelToName = {}
for (const s of streets) skelToName[s.skelId] = s.name

const curbFlags = {}   // name -> worst maxDev
const selfIntFlags = {}// name -> count
const faceFlags = {}   // name -> reason
const bumpFlags = {}   // name -> worst turn°  (junction-curb bump)
const bumpList = []    // {ti, p, turn} — the worklist (honest unit = LOCATION, not street)

for (let ti = 0; ti < tiles.length; ti++) {
  const tile = tiles[ti]
  if (!tile?.ring?.length) continue
  // span gate (skip perimeter megatile)
  let xn = Infinity, xx = -Infinity, yn = Infinity, yx = -Infinity
  for (const p of tile.ring) { xn = Math.min(xn, p[0]); xx = Math.max(xx, p[0]); yn = Math.min(yn, p[1]); yx = Math.max(yx, p[1]) }
  const big = Math.hypot(xx - xn, yx - yn) > MAX_TILE_SPAN

  // attribute this tile to the names of its runs
  const tileNames = new Set()
  for (const run of tile.runs || []) { const n = skelToName[run.skelId]; if (n) tileNames.add(n) }

  // ── face-closure: ring must have ≥3 verts, positive area, no zero-length edges
  if (!big) {
    const ring = tile.ring
    let area = 0, zeroEdges = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      area += cross(a, b)
      if (dist(a, b) < 0.01) zeroEdges++
    }
    area = Math.abs(area) / 2
    if (ring.length < 3 || area < 1 || zeroEdges > 0) {
      const reason = ring.length < 3 ? 'degenerate-ring' : area < 1 ? 'zero-area' : `${zeroEdges} zero-len-edge`
      for (const n of tileNames) if (!faceFlags[n]) faceFlags[n] = reason
    }
  }

  // ── iA self-intersection
  for (const ring of (tile.iA || [])) {
    if (ring.length < 4) continue
    let hits = 0
    for (let i = 0; i < ring.length; i++) {
      for (let j = i + 1; j < ring.length; j++) {
        if (i === j) continue
        // skip adjacent edges (share a vertex)
        if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue
        const a1 = ring[i], a2 = ring[(i + 1) % ring.length]
        const b1 = ring[j], b2 = ring[(j + 1) % ring.length]
        if (segInt(a1, a2, b1, b2)) hits++
      }
    }
    if (hits > 0) for (const n of tileNames) selfIntFlags[n] = Math.max(selfIntFlags[n] || 0, hits)
  }

  // ── curb-bump: a sharp turn between two SHORT curve-samples on iA = a junction-
  //    curb bump (the through-seam family). An authored corner has a LONG leg on
  //    one side (CURB_BUMP_SEG); a fillet arc turns < ~18°/vertex; a fold-spur is
  //    > 165° (dropFoldSpurs' job). What's left — a 20–165° reversal between two
  //    short samples — is a genuine bump. The honest unit is the LOCATION; we also
  //    attribute to the tile's run names for the confusion matrix (over-spreads).
  if (!big) for (const ring of (tile.iA || [])) {
    const nR = ring.length
    for (let i = 0; i < nR; i++) {
      const a = ring[(i - 1 + nR) % nR], v = ring[i], b = ring[(i + 1) % nR]
      const e1 = dist(a, v), e2 = dist(v, b)
      if (e1 > CURB_BUMP_SEG || e2 > CURB_BUMP_SEG || e1 < 1e-3 || e2 < 1e-3) continue
      const d = ((v[0] - a[0]) / e1) * ((b[0] - v[0]) / e2) + ((v[1] - a[1]) / e1) * ((b[1] - v[1]) / e2)
      const turn = Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI
      if (turn > CURB_BUMP_DEG && turn < 165) {
        bumpList.push({ ti, p: [v[0], v[1]], turn: +turn.toFixed(0) })
        for (const n of tileNames) bumpFlags[n] = Math.max(bumpFlags[n] || 0, +turn.toFixed(0))
      }
    }
  }

  // ── curb ∥ chain (litmus logic, per run)
  if (!big && tile.iA?.length) {
    const edges = []
    for (const ring of tile.iA) for (let i = 0; i < ring.length; i++) edges.push([ring[i], ring[(i + 1) % ring.length]])
    for (const run of tile.runs || []) {
      const poly = run.poly
      if (!poly || poly.length < 2) continue
      let L = 0; for (let i = 1; i < poly.length; i++) L += dist(poly[i], poly[i - 1])
      if (L < MIN_RUN) continue
      const hwL = run.measure?.left?.pavementHW || 0
      const hwR = run.measure?.right?.pavementHW || 0
      if (hwL < 0.5 && hwR < 0.5) continue
      let worst = 0, along = 0
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1], b = poly[i]
        const segLen = dist(a, b) || 1
        const fwd = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen]
        const leftN = [-fwd[1], fwd[0]], rightN = [fwd[1], -fwd[0]]
        for (let d = 0; d <= segLen; d += STEP) {
          const aAlong = along + d
          if (aAlong < FILLET_MARGIN || aAlong > L - FILLET_MARGIN) continue
          const O = [a[0] + (b[0] - a[0]) * (d / segLen), a[1] + (b[1] - a[1]) * (d / segLen)]
          let best = Infinity, bestDev = null
          for (const [nrm, hw] of [[leftN, hwL], [rightN, hwR]]) {
            if (!(hw > 0.5)) continue
            const hit = rayHit(O, nrm, edges)
            if (!isFinite(hit) || hit < 0.1 || hit > hw + RAY_CAP) continue
            if (hit < best) { best = hit; bestDev = Math.abs(hit - hw) }
          }
          if (bestDev != null && bestDev > worst) worst = bestDev
        }
        along += segLen
      }
      if (worst > CURB_TOL) {
        const n = skelToName[run.skelId]
        if (n) curbFlags[n] = Math.max(curbFlags[n] || 0, +worst.toFixed(2))
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// B2. TOPOLOGICAL INVARIANTS (graph-level) on the CURRENT frame
// ════════════════════════════════════════════════════════════════════════════
// Oracle = extractFaces (the same face walk the producer runs, incl. the
// endpoint-weld) + the frozen medians + the shape-tip artifacts.
const faces = extractFaces(streets)
const loopFlags = loopClosureReport(streets, faces, ribbons.medians)
const capFlags  = capTangentReport(streets, tiles, clip)
const junc      = junctionBandReport(streets, tiles, pr.asphalt, design.curbWidth)
const juncFlags = junc.flaggedNames   // name -> {slivers, worstA}
const ntFlags   = nameTransitionReport()   // name -> {turn, why}  (the through-road-simplify gate)
const cfGate    = curveFitReport()         // {base, sm, NEW}  (the D6a robust-offset gate — curve-fit cleanliness)

// SELF-TEST (--simNT): prove name-transition smoothness is a LIVE gate, not dead-
// green. Re-pin every transition seam the way per-chain RDP did (drop the rounding
// shoulders → reconnect the seam node to its far neighbours), and the invariant MUST
// fire (e.g. W18↔Dolman back to its ~46° facet). If it stays green, the oracle is dead.
if (process.argv.includes('--simNT')) {
  const skPath = path.join(ROOT, 'cartograph/data/lafayette-square/clean/skeleton.json')
  const sk = JSON.parse(fs.readFileSync(skPath, 'utf8'))
  const vk = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`
  // facet each transition seam: on each incident chain, delete the vertex adjacent
  // to the seam node (the rounding shoulder) so the node joins its far neighbour.
  const keyset = new Set((sk.nameTransitions || []).map(vk))
  const sim = { ...sk, streets: sk.streets.map(s => {
    if (!s.points || s.points.length < 4) return s
    const p = s.points
    if (keyset.has(vk(p[0]))) return { ...s, points: [p[0], ...p.slice(2)] }
    if (keyset.has(vk(p[p.length - 1]))) return { ...s, points: [...p.slice(0, -2), p[p.length - 1]] }
    return s
  }) }
  const simNT = nameTransitionReport(sim)
  console.log('\n[SELF-TEST --simNT] transition shoulders deleted (re-facetted):')
  console.log('  name-transition now flags:', Object.keys(simNT).length ? Object.entries(simNT).map(([n, f]) => `${n} (${f.turn}°)`).join('; ') : 'NONE — ORACLE DEAD')
  console.log('  (expected: Dolman/West 18th + the U-corners fire — the gate is live)\n')
}

// SELF-TEST (--simthruwidth): prove through-width is a LIVE guard, not dead-green.
// The derive.js reconciliation made it 0 (every through-road carries one width per
// side). Re-deviate one chain's per-side width by +3 m (the datum step the fix
// removed) and the invariant MUST fire. If it stays green, the oracle is dead.
if (process.argv.includes('--simthruwidth')) {
  const byRoad = {}
  for (const s of streets) { const rid = s.roadId || s.skelId; (byRoad[rid] = byRoad[rid] || []).push(s) }
  const sim = streets.map(s => ({ ...s, measure: JSON.parse(JSON.stringify(s.measure || {})) }))
  const simByRoad = {}
  for (const s of sim) { const rid = s.roadId || s.skelId; (simByRoad[rid] = simByRoad[rid] || []).push(s) }
  let hit = null
  for (const chains of Object.values(simByRoad)) if (chains.length >= 2 && chains[0].measure?.left?.pavementHW != null) { chains[0].measure.left.pavementHW += 3; hit = chains[0].name; break }
  const simFlags = throughRoadWidthReport(sim)
  console.log('\n[SELF-TEST --simthruwidth] one through-road chain re-widened +3 m (' + (hit || 'none') + '):')
  console.log('  through-width now flags:', Object.keys(simFlags).length ? Object.keys(simFlags).join(', ') : 'NONE — ORACLE DEAD')
  console.log('  (expected: that road\'s chains fire — the guard is live)\n')
}

// SELF-TEST (--simweld): prove loop-closure is a LIVE guard, not a dead-green
// check. Pull the welded loop bodies' endpoints apart past the weld tol (and
// drop the medians) — the invariant MUST then fire on Benton/Park Place/Saint
// Vincent. If it stays green here, the oracle is broken.
if (process.argv.includes('--simweld')) {
  const sim = streets.map(s => {
    if (!s?.points || s.points.length < 4) return s
    const gap = dist(s.points[0], s.points[s.points.length - 1])
    if (gap >= WELD_TOL) return s
    const pts = s.points.map(p => [p[0], p[1]])
    pts[pts.length - 1] = [pts[pts.length - 1][0] + 1.0, pts[pts.length - 1][1] + 1.0]  // open the loop 1.4 m
    return { ...s, points: pts }
  })
  const simFaces = extractFaces(sim)
  const simFlags = loopClosureReport(sim, simFaces, [])   // no medians → must flag every opened loop
  console.log('\n[SELF-TEST --simweld] loops opened past the weld tol + medians dropped:')
  console.log('  loop-closure now flags:', Object.keys(simFlags).length ? Object.entries(simFlags).map(([n, f]) => `${n} (${f.why})`).join('; ') : 'NONE — ORACLE BROKEN')
  console.log('  (expected: Benton Place / Park Place / Saint Vincent Avenue fire — the guard is live)\n')
}

// ════════════════════════════════════════════════════════════════════════════
// C. RAW-OSM chain invariants on the 35 (their pre-hand-fix geometry)
// ════════════════════════════════════════════════════════════════════════════
// Stitch each curated street's raw OSM fragments (osm.json ground.highway, by
// name) into chains, then run the chain invariants (max-turn) on the raw form.
let rawTurnByName = {}
if (RUN_RAW) {
  const osm = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/raw/osm.json')))
  const hw = osm.ground?.highway || []
  // stitch fragments sharing a name into maximal chains by endpoint-welding
  function stitch(frags) {
    const segs = frags.map(f => f.coords.map(c => [c.x, c.z])).filter(p => p.length >= 2)
    const chains = segs.map(s => s.slice())
    let merged = true
    while (merged) {
      merged = false
      outer:
      for (let i = 0; i < chains.length; i++) {
        for (let j = i + 1; j < chains.length; j++) {
          const A = chains[i], B = chains[j]
          const aS = A[0], aE = A[A.length - 1], bS = B[0], bE = B[B.length - 1]
          if (dist(aE, bS) < NODE_SNAP) { chains[i] = A.concat(B.slice(1)); chains.splice(j, 1); merged = true; break outer }
          if (dist(aE, bE) < NODE_SNAP) { chains[i] = A.concat(B.slice(0, -1).reverse()); chains.splice(j, 1); merged = true; break outer }
          if (dist(aS, bE) < NODE_SNAP) { chains[i] = B.concat(A.slice(1)); chains.splice(j, 1); merged = true; break outer }
          if (dist(aS, bS) < NODE_SNAP) { chains[i] = B.slice().reverse().concat(A.slice(1)); chains.splice(j, 1); merged = true; break outer }
        }
      }
    }
    return chains
  }
  for (const name of curatedNames) {
    const frags = hw.filter(f => f.tags?.name === name && f.coords?.length >= 2)
    if (!frags.length) continue
    const chains = stitch(frags)
    let worst = null
    for (const ch of chains) {
      if (ch.length < 3) continue
      const t = maxTurn(ch)
      if (!worst || t.jags > worst.jags || (t.jags === worst.jags && t.worst > worst.worst)) worst = t
    }
    if (worst) rawTurnByName[name] = worst
  }
}

// ════════════════════════════════════════════════════════════════════════════
// REPORT
// ════════════════════════════════════════════════════════════════════════════
const allFlagged = new Set([
  ...Object.keys(turnFlags), ...Object.keys(stepFlags), ...Object.keys(thruWidthFlags),
  ...Object.keys(curbFlags), ...Object.keys(selfIntFlags), ...Object.keys(faceFlags), ...Object.keys(bumpFlags),
  ...Object.keys(loopFlags), ...Object.keys(capFlags), ...Object.keys(juncFlags),
  ...Object.keys(ntFlags), ...Object.keys(medianFlags),
])
// the geometric-only set (Sieve v1) for the before/after comparison
const geomFlagged = new Set([
  ...Object.keys(turnFlags), ...Object.keys(stepFlags),
  ...Object.keys(curbFlags), ...Object.keys(selfIntFlags), ...Object.keys(faceFlags),
])
const flaggedNames = (obj) => new Set(Object.keys(obj))

function pr2(label, names) {
  const cur = [...names].filter(isCurated).length
  const grid = [...names].filter(n => !isCurated(n)).length
  console.log(`  ${label.padEnd(16)} flags ${String(names.size).padStart(3)}  (curated ${String(cur).padStart(2)}/${curatedNames.size},  grid ${String(grid).padStart(3)})`)
}

// ── cul-de-sac keyhole notch ─────────────────────────────────────────────────
// A turning-circle's curb must flow TANGENTIALLY into the bulb (the keyhole). RED
// if the stem↔bulb mouth notches — the un-returned corner the curb offset leaves,
// a SINGLE ~19° vertex. GREEN once the boolean keyhole (tileGround culDeSacKeyhole)
// rounds it: the return arc spreads the turn to ≤16°/vertex. The curb-bump 20° gate
// MISSES this sub-20° class — this is its dedicated guard. (HANDOFF-junction-
// construction §9e.) Detection mirrors tileGround.fitLoopCircle (R 3–12 m, res<0.3).
function culdesacNotchReport(streets, tiles) {
  const loops = []
  for (const s of streets) {
    const pts = s.points
    if (!pts || pts.length < 8) continue
    if (Math.hypot(pts[0][0] - pts[pts.length-1][0], pts[0][1] - pts[pts.length-1][1]) > 1) continue
    let sx=0,sy=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0,sz=0; const N=pts.length
    for (const [x,y] of pts){const z=x*x+y*y;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;sxz+=x*z;syz+=y*z;sz+=z}
    const M=[[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,N]],V=[sxz,syz,sz]
    const det3=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
    const D=det3(M); if(Math.abs(D)<1e-9) continue
    const rep=c=>M.map((row,ri)=>row.map((v,ci)=>ci===c?V[ri]:v))
    const cx=det3(rep(0))/(2*D),cy=det3(rep(1))/(2*D),C=det3(rep(2))/D,R=Math.sqrt(Math.max(0,C+cx*cx+cy*cy))
    if (R<3||R>12) continue
    let res=0; for(const[x,y]of pts) res+=Math.abs(Math.hypot(x-cx,y-cy)-R); res/=N
    if (res<0.3) loops.push({ C:[cx,cy], R })
  }
  const NOTCH_DEG=16, SEG=3, hits=[]
  for (const t of tiles) for (const ring of (t.iA||[])) {
    const n=ring.length
    for (let i=0;i<n;i++){
      const v=ring[i]
      if (!loops.some(L=>Math.hypot(v[0]-L.C[0],v[1]-L.C[1]) < L.R+10)) continue
      const a=ring[(i-1+n)%n],b=ring[(i+1)%n],e1=dist(a,v),e2=dist(v,b)
      if (e1>SEG||e2>SEG||e1<1e-3||e2<1e-3) continue
      const dd=((v[0]-a[0])/e1)*((b[0]-v[0])/e2)+((v[1]-a[1])/e1)*((b[1]-v[1])/e2)
      const turn=Math.acos(Math.max(-1,Math.min(1,dd)))*180/Math.PI
      if (turn>NOTCH_DEG && turn<165) hits.push({ p:[+v[0].toFixed(1),+v[1].toFixed(1)], turn:+turn.toFixed(0) })
    }
  }
  return { loops:loops.length, hits }
}

// ── INVARIANT: through-node ped BREAK at a straight deg-3 T (Lintel, 2026-07-16) ─
// The tabled T-artifact (THRUNODE-GATE-FINDINGS): a genuine deg-3 T on a straight,
// uniform-width through-street breaks the through-frontage's PED band where the
// side street T's in. SHARP topology predicate (isolates ~5-8, not the 62 raw
// junction-band slivers): deg-3 ∧ EXACTLY ONE through-street (one interior-vertex
// leg) ∧ NOT E3-constructed (junctionMap continuity/deTaper/apron all empty) ∧ the
// through-frontage same-skelId splits across ≥2 tiles ∧ a ped throat sliver sits on
// that frontage at the node. The last clause is the EYE-DEFECT itself (a treelawn/
// sidewalk fragment <SLIVER_AREA within the throat) — so this is RED-until-true on
// the ACTUAL ped continuity, NOT on "is an asphalt window built" (which is a green-
// that-lies: the :2461 window lands in aFill, but iA — the ped's source — is the
// per-tile parallel offset, byte-identical with/without the window, so the ped band
// still fragments; proven scratch/thrunode-probe.mjs). Clears only when the ped
// junction is constructed across the mouth (HANDOFF-junction-construction §2 gap).
function throughNodeBreakReport(streets, tiles, jmNodes, cw) {
  const stripMat = { outer: 'LU', inner: 'SW' }
  // graph model + through/terminating legs at each node
  const reps = []
  const node = (p) => { for (const q of reps) if (dist(p, q.p) < NODE_DEG_SNAP) return q; const q = { p, deg: 0, thru: [], term: [] }; reps.push(q); return q }
  for (const s of streets) {
    const pts = s.points; if (!pts?.length) continue
    for (let i = 0; i < pts.length; i++) {
      const interior = i > 0 && i < pts.length - 1
      // interior vertex adds degree 2 to its node; endpoint adds 1
      const near = reps.find(q => dist(pts[i], q.p) < NODE_DEG_SNAP)
      const q = near || node(pts[i])
      q.deg += interior ? 2 : 1
      ;(interior ? q.thru : q.term).push(s.skelId)
    }
  }
  const jmAt = (p) => { let best = null, bd = Infinity; for (const n of jmNodes) { const d = dist(n.at, p); if (d < bd) { bd = d; best = n } } return { n: best, d: bd } }
  const isE3 = (n) => n && ((n.continuity?.length || 0) > 0 || (n.deTaper?.length || 0) > 0 || !!n.apron)
  const tilesWithSkelNear = (skelId, p, reach = 16) => {
    const out = []
    for (let ti = 0; ti < tiles.length; ti++) {
      const t = tiles[ti]; if (!t?.runs?.some(r => r.skelId === skelId)) continue
      let near = false; for (const r of (t.iA || [])) { for (const v of r) if (dist(v, p) < reach) { near = true; break } if (near) break }
      if (near) out.push(ti)
    }
    return out
  }
  const pedRingsOf = (ti) => { const sp = sectionPass([tiles[ti]], cw, stripMat, null); const flat = (b) => Object.values(b || {}).flat(); return [...flat(sp.tlByLu), ...sp.Wacc].filter(r => r && r.length >= 3) }
  const nearRing = (r, p) => { let m = Infinity; for (const v of r) { const d = dist(v, p); if (d < m) m = d } return m }
  const flagged = []
  for (const q of reps) {
    const thru = [...new Set(q.thru)]
    if (q.deg !== 3 || thru.length !== 1) continue         // deg-3 ∧ exactly one through-street
    if (isE3(jmAt(q.p).n)) continue                        // NOT E3-constructed
    const tis = tilesWithSkelNear(thru[0], q.p)
    if (tis.length < 2) continue                           // frontage splits across ≥2 tiles
    let slivers = 0, worst = Infinity
    for (const ti of tis) for (const r of pedRingsOf(ti)) {
      if (nearRing(r, q.p) >= JUNC_THROAT_R) continue
      const a = Math.abs(signedArea(r)); if (a < SLIVER_AREA) { slivers++; if (a < worst) worst = a }
    }
    if (slivers >= JUNC_SLIVER_FLAG) flagged.push({ p: q.p, thru: thru[0], term: [...new Set(q.term)], slivers, worst: isFinite(worst) ? +worst.toFixed(1) : null })
  }
  return flagged.sort((a, b) => b.slivers - a.slivers)
}

console.log('\n══════════════════════════════════════════════════════════════════════')
console.log(' CORRECTNESS DETECTOR v1  ·  Lafayette Square  ·  candidates for the operator')
console.log('══════════════════════════════════════════════════════════════════════\n')
console.log(`Frame: ${streets.length} street chains across ${new Set(streets.map(s=>s.name)).size} names; ${tiles.length} tiles.`)
console.log(`Labeled defect set: 35 curated CHAINS = ${curatedNames.size} distinct NAMES (INTAKE §6.1).`)
console.log(`(4 names carry 2 curated chains each — Lasalle, Rutger, South 18th, Waverly — so recall is`)
console.log(` measured per-NAME against ${curatedNames.size}, not per-chain against 35.)\n`)

console.log('PER-INVARIANT (current frame):')
console.log('  · GEOMETRIC (per-chain shape):')
pr2('  max-turn',   flaggedNames(turnFlags))
pr2('  width-step', flaggedNames(stepFlags))
pr2('  through-width', flaggedNames(thruWidthFlags))
pr2('  curb∥chain', flaggedNames(curbFlags))
pr2('  iA self-int',flaggedNames(selfIntFlags))
pr2('  face-closure',flaggedNames(faceFlags))
pr2('  curb-bump',  flaggedNames(bumpFlags))
console.log('  · TOPOLOGICAL (graph-level):')
pr2('  loop-closure',flaggedNames(loopFlags))
pr2('  cap-tangent', flaggedNames(capFlags))
pr2('  junction-band', flaggedNames(juncFlags))
pr2('  name-transition', flaggedNames(ntFlags))
pr2('  divided-median', flaggedNames(medianFlags))
console.log('  ' + '─'.repeat(60))
pr2('GEOMETRIC only', geomFlagged)
pr2('+ TOPOLOGICAL',  allFlagged)

console.log('\n  · CURVE-FIT GATE (D6a robust-offset — smooth=' + CURVE_FIT_SMOOTH + ' vs smooth=0):')
console.log(`      curb degenerates: baseline(0)=${cfGate.base}  smoothed=${cfGate.sm}  NEW(regressions)=${cfGate.NEW.length}`)
// Corner gate = smooth=0 ONLY (the live map, where fillets ARE the rounding). At
// smooth>0 the curve-fit legitimately curve-rounds gentle bends so fillet-count
// drops by design (rnd1 is INFO, not a gate — squared junction corners at smooth>0
// are the eye's call when the knob re-enables).
console.log(`      corner-roundness: rounded fillets  smooth0=${cfGate.rnd0} (gate ≥${ROUND_FILLET_MIN})  smooth${CURVE_FIT_SMOOTH}=${cfGate.rnd1} (info — curve-round expected)`)
const cfSquared = cfGate.rnd0 < ROUND_FILLET_MIN
const cfGreen = cfGate.NEW.length === 0 && !cfSquared
console.log(`      ${cfGreen ? '✅ GREEN — clean curb + corners round (robust offset DONE)' : '❌ RED — ' + [cfGate.NEW.length ? cfGate.NEW.length + ' new needle/spur' : '', cfSquared ? `corners SQUARED at smooth=0 (${cfGate.rnd0} rounded vs ≥${ROUND_FILLET_MIN})` : ''].filter(Boolean).join(' + ')}`)
cfGate.NEW.slice(0, 14).forEach(p => console.log(`        new degenerate @ ${p[0].toFixed(0)},${p[1].toFixed(0)}`))

// cul-de-sac keyhole notch gate
const cdNotch = culdesacNotchReport(streets, tiles)
console.log('\n  · CUL-DE-SAC KEYHOLE (turning-circle mouth flows tangent into the bulb):')
console.log(`      ${cdNotch.loops} turning-circle(s); mouth notches >16° = ${cdNotch.hits.length}`)
console.log(`      ${cdNotch.hits.length === 0 ? '✅ GREEN — keyhole tangent (no mouth notch)' : '❌ RED — ' + cdNotch.hits.map(h => `${h.turn}°@[${h.p}]`).join(', ')}`)

// confusion matrix vs the 35
const gridNames = new Set(streets.map(s => s.name).filter(n => !isCurated(n)))
const TP = [...allFlagged].filter(isCurated)
const FN = [...curatedNames].filter(n => !allFlagged.has(n))
const FP = [...allFlagged].filter(n => !isCurated(n))
const ND = curatedNames.size   // 31 distinct curated names
const TPg = [...geomFlagged].filter(isCurated)
const FPg = [...geomFlagged].filter(n => !isCurated(n))
console.log('\nCONFUSION — measured per curated NAME:')
console.log(`  GEOMETRIC only (Sieve v1):`)
console.log(`    recall    = ${TPg.length}/${ND}  (${(100*TPg.length/ND).toFixed(0)}%)`)
console.log(`    precision = ${TPg.length}/${geomFlagged.size}  (${geomFlagged.size?(100*TPg.length/geomFlagged.size).toFixed(0):0}%)`)
console.log(`    grid FP   = ${FPg.length}/${gridNames.size}`)
console.log(`  + TOPOLOGICAL (loop-closure + cap-tangent + junction-band):`)
console.log(`    recall    = ${TP.length}/${ND}  (${(100*TP.length/ND).toFixed(0)}%)  curated names flagged   [+${TP.length-TPg.length}]`)
console.log(`    precision = ${TP.length}/${allFlagged.size}  (${allFlagged.size?(100*TP.length/allFlagged.size).toFixed(0):0}%)  of flags are curated`)
console.log(`    grid FP   = ${FP.length}/${gridNames.size} clean-grid names flagged   [+${FP.length-FPg.length}]`)

// ── junction-band: the HONEST unit is the JUNCTION, not the street (name-attribution
//    over-spreads to every grid street crossing a defective node). Report per-junction.
{
  const Js = junc.junctions
  const flaggedJ = Js.filter(j => j.slivers >= JUNC_SLIVER_FLAG)
  const cleanJ = Js.filter(j => j.slivers === 0)
  const touchesCur = (j) => j.names.some(isCurated)
  const curJ = Js.filter(touchesCur), gridJ = Js.filter(j => !touchesCur(j))
  const curJF = curJ.filter(j => j.slivers >= JUNC_SLIVER_FLAG), gridJF = gridJ.filter(j => j.slivers >= JUNC_SLIVER_FLAG)
  const weird = ['Carroll Street','Hickory Street','Hickory Lane','Grattan Street']
  const weirdCaught = weird.filter(w => Js.some(j => j.names.includes(w) && j.slivers >= JUNC_SLIVER_FLAG))
  console.log(`\nJUNCTION-BAND — measured per JUNCTION NODE (the honest unit):`)
  console.log(`    ${Js.length} junctions (deg>=${JUNC_DEG}): ${cleanJ.length} CLEAN (0 throat slivers), ${flaggedJ.length} FLAGGED (>=${JUNC_SLIVER_FLAG} slivers <${SLIVER_AREA}m2)`)
  console.log(`    curated-touching junctions flagged = ${curJF.length}/${curJ.length};  pure-grid junctions flagged = ${gridJF.length}/${gridJ.length}`)
  console.log(`    the 4 weird junctions caught = ${weirdCaught.length}/4  [${weirdCaught.map(w=>w.split(' ')[0]).join(', ')}]`)
  // JUNC_DUMP=1 → per-junction CSV on stderr, so two runs (e.g. a flag A/B) can be
  // diffed to find WHICH junctions moved. The aggregate count alone cannot tell you.
  if (process.env.JUNC_DUMP === '1') {
    for (const j of Js.slice().sort((a, b) => (a.p[0] - b.p[0]) || (a.p[1] - b.p[1]))) {
      console.error(`JUNC\t${j.p[0].toFixed(1)},${j.p[1].toFixed(1)}\t${j.slivers}\t${j.deg}\t${j.names.join('|')}`)
    }
  }
  console.log(`    NOTE 55% of junctions are clean — the sliver signal discriminates; it is NOT firing everywhere.`)
  console.log(`       The defect class is PERVASIVE (${flaggedJ.length} junctions), so name-level grid FP is mostly REAL`)
  console.log(`       uncurated defect, not noise (verified by eye: scratch/jx-montrose-hickory.png et al).`)
  console.log(`\n    Worst-fragmented junctions (slivers — the operator-eye candidates):`)
  for (const j of flaggedJ.sort((a,b)=>b.slivers-a.slivers).slice(0, 14))
    console.log(`      (${j.p[0].toFixed(0)},${j.p[1].toFixed(0)}) d${j.deg}  slivers=${j.slivers}  {${j.names.join(' / ')}}`)
}

// ── through-node ped BREAK — the sharp deg-3-T subclass (the tabled artifact).
//    Separate from the raw junction-band count (which measures the OTHER
//    subclasses too). RED-until-true on the ACTUAL ped continuity — 0 only once
//    the ped junction is constructed across the mouth. [THRUNODE-GATE-FINDINGS]
{
  const jmNodes = ribbons.junctionMap?.nodes || []
  const tnb = throughNodeBreakReport(streets, tiles, jmNodes, design.curbWidth)
  console.log(`\nTHROUGH-NODE PED-BREAK — deg-3 straight-T subclass (isolates the tabled artifact):`)
  console.log(`    predicate: deg-3 ∧ one through-street ∧ NOT E3 ∧ frontage splits ≥2 tiles ∧ ped throat sliver`)
  console.log(`    ${tnb.length} node(s) flagged  ${tnb.length === 0 ? '✅ GREEN — through band runs continuous' : '⚠️ (cure landed 44→~15: the 5 named archetypes clear; residual = DIVIDED-carriageway T\'s (E2/E3 owns those) + wide-avenue STEM-corner over-fire — separate)'}`)
  for (const j of tnb)
    console.log(`      (${j.p[0].toFixed(0)},${j.p[1].toFixed(0)})  ${j.thru} thru / ${j.term.join('+')} ends  slivers=${j.slivers}${j.worst != null ? ' worst=' + j.worst + 'm²' : ''}`)
}

// ── curb-bump: the HONEST unit is the LOCATION (a tile can host many run names;
//    name-attribution over-spreads). This is the to-ZERO worklist for the through-
//    seam family — each entry is a curb vertex the operator/kit must drive smooth.
{
  const byTurn = bumpList.slice().sort((a, b) => b.turn - a.turn)
  console.log(`\nCURB-BUMP — measured per LOCATION (the honest unit; the through-seam worklist):`)
  console.log(`    ${bumpList.length} curb bumps (>${CURB_BUMP_DEG}° between <${CURB_BUMP_SEG}m curve-samples) across ${new Set(bumpList.map(b=>b.ti)).size} tiles.`)
  console.log(`    0 = the family is reconciled to zero (the name-aware corner + through-road width fixes, generalized).`)
  for (const b of byTurn.slice(0, 24)) console.log(`      tile ${String(b.ti).padStart(3)}  @(${b.p[0].toFixed(0)},${b.p[1].toFixed(0)})  ${b.turn}°`)
  if (byTurn.length > 24) console.log(`      … +${byTurn.length - 24} more`)
}

// ── divided-median: the overrun worklist (the construct-the-hard-polygons HALF B
//    scoreboard). Drive to zero by clamping the inboard pavementHW to the median edge
//    + fixing the source width datum (HANDOFF-construct-hard-polygons.md).
{
  const rows = Object.entries(medianFlags)
  console.log(`\nDIVIDED-MEDIAN — overrun/sanity worklist (HALF B scoreboard):`)
  console.log(`    ${rows.length} divided chains flagged (median < ${MIN_MEDIAN}m after the carriageways, or gap out of sanity).`)
  console.log(`    0 = every divided pair leaves a real median (the inboard-clamp + source width fix, generalized).`)
  for (const [n, f] of rows.sort((a, b) => a[1].median - b[1].median).slice(0, 16))
    console.log(`      ${n.padEnd(26)} ${f.why}`)
}

console.log('\nFLAGGED CURATED (true positives):')
for (const n of [...curatedNames].filter(n=>allFlagged.has(n)).sort()) {
  const tags = []
  if (turnFlags[n])   tags.push(`turn(${turnFlags[n].jags}j,${turnFlags[n].worst}°)`)
  if (stepFlags[n])   tags.push(`step(${stepFlags[n].step}m:${stepFlags[n].a}/${stepFlags[n].b})`)
  if (thruWidthFlags[n]) tags.push(`thruW(${thruWidthFlags[n].side}{${thruWidthFlags[n].vals.join(',')}})`)
  if (curbFlags[n])   tags.push(`curb(${curbFlags[n]}m)`)
  if (selfIntFlags[n])tags.push(`selfint(${selfIntFlags[n]})`)
  if (faceFlags[n])   tags.push(`face(${faceFlags[n]})`)
  if (bumpFlags[n])   tags.push(`bump(${bumpFlags[n]}°)`)
  if (medianFlags[n]) tags.push(`MEDIAN(${medianFlags[n].median}m)`)
  if (loopFlags[n])   tags.push(`LOOP(${loopFlags[n].why})`)
  if (capFlags[n])    tags.push(`CAP(${capFlags[n].capEnd}/${capFlags[n].end} ${capFlags[n].dist}m)`)
  if (juncFlags[n])   tags.push(`JUNC(${juncFlags[n].slivers} slivers, worst ${juncFlags[n].worstA!=null?juncFlags[n].worstA.toFixed(1):'?'}m2)`)
  console.log(`  ✔ ${n.padEnd(26)} ${tags.join('  ')}`)
}
console.log('\nMISSED CURATED (false negatives — no invariant fired):')
for (const n of FN.sort()) console.log(`  ✗ ${n}`)

console.log('\nGRID FALSE-POSITIVES (flagged but NOT curated — operator must judge):')
for (const n of FP.sort()) {
  const tags = []
  if (turnFlags[n])   tags.push(`turn(${turnFlags[n].jags}j,${turnFlags[n].worst}°)`)
  if (stepFlags[n])   tags.push(`step(${stepFlags[n].step}m)`)
  if (thruWidthFlags[n]) tags.push(`thruW(${thruWidthFlags[n].side}{${thruWidthFlags[n].vals.join(',')}})`)
  if (curbFlags[n])   tags.push(`curb(${curbFlags[n]}m)`)
  if (selfIntFlags[n])tags.push(`selfint(${selfIntFlags[n]})`)
  if (faceFlags[n])   tags.push(`face(${faceFlags[n]})`)
  if (bumpFlags[n])   tags.push(`bump(${bumpFlags[n]}°)`)
  if (medianFlags[n]) tags.push(`MEDIAN(${medianFlags[n].median}m)`)
  if (loopFlags[n])   tags.push(`LOOP(${loopFlags[n].why})`)
  if (capFlags[n])    tags.push(`CAP(${capFlags[n].capEnd}/${capFlags[n].end} ${capFlags[n].dist}m)`)
  if (juncFlags[n])   tags.push(`JUNC(${juncFlags[n].slivers} slivers, worst ${juncFlags[n].worstA!=null?juncFlags[n].worstA.toFixed(1):'?'}m2)`)
  console.log(`  ? ${n.padEnd(26)} ${tags.join('  ')}`)
}

if (RUN_RAW) {
  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(' RAW-OSM max-turn on the 35 (pre-hand-fix geometry, stitched from osm.json)')
  console.log('══════════════════════════════════════════════════════════════════════')
  const rawFlag = Object.entries(rawTurnByName).filter(([,t]) => t.fail)
  console.log(`  raw-OSM max-turn flags ${rawFlag.length}/${Object.keys(rawTurnByName).length} curated names that have raw geometry`)
  console.log('  (a defect the hand-fix REMOVED → the detector would have caught it pre-fix)\n')
  for (const [n, t] of Object.entries(rawTurnByName).sort((a,b)=>b[1].jags-a[1].jags)) {
    const cur = turnFlags[n]
    const fixed = t.fail && !cur ? '  ← hand-fix CURED the jag' : (t.fail && cur ? '  (still jagged in frame too)' : '')
    console.log(`  ${t.fail?'JAG ':'ok  '} ${n.padEnd(26)} raw: ${t.jags}j max ${t.worst}°${fixed}`)
  }
}

console.log('')
