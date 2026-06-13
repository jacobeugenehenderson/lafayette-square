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
//     • width-step    — pavementHW jump across a same-name through-node.
//   TILE/CURB-LEVEL (run on buildTileGround output, current frame only):
//     • curb∥chain    — curb is a parallel offset of its chain (litmus logic).
//     • iA self-int   — the curb ring does not self-cross.
//     • face-closure  — the tile ring closes / has positive area / no zero-len edges.
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

const { buildTileGround, extractFaces } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

// ── tunables (first-principles, not fit to 35) ──────────────────────────────
const MAX_TURN_DEG       = 50   // ° — exterior angle at a vertex above this = a jag on a road
const MAX_TURN_COUNT     = 2    // a chain with ≥ this many jag-vertices is flagged (1 jag may be a real corner)
const MIN_SEG_FOR_TURN   = 1.0  // m — ignore turn at vertices joined by a < this segment (noise/dupes)
const WIDTH_STEP_TOL     = 1.0  // m — same-name through-node pavementHW jump above this = a step
const NODE_SNAP          = 2.0  // m — two chain endpoints within this are the "same node"
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

// ════════════════════════════════════════════════════════════════════════════
// B. TILE / CURB INVARIANTS on the CURRENT frame (buildTileGround)
// ════════════════════════════════════════════════════════════════════════════
// Map each tile-run to a street name via its skelId, so a tile flag attributes to a street.
const skelToName = {}
for (const s of streets) skelToName[s.skelId] = s.name

const curbFlags = {}   // name -> worst maxDev
const selfIntFlags = {}// name -> count
const faceFlags = {}   // name -> reason

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
  ...Object.keys(turnFlags), ...Object.keys(stepFlags),
  ...Object.keys(curbFlags), ...Object.keys(selfIntFlags), ...Object.keys(faceFlags),
  ...Object.keys(loopFlags), ...Object.keys(capFlags),
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
pr2('  curb∥chain', flaggedNames(curbFlags))
pr2('  iA self-int',flaggedNames(selfIntFlags))
pr2('  face-closure',flaggedNames(faceFlags))
console.log('  · TOPOLOGICAL (graph-level):')
pr2('  loop-closure',flaggedNames(loopFlags))
pr2('  cap-tangent', flaggedNames(capFlags))
console.log('  ' + '─'.repeat(60))
pr2('GEOMETRIC only', geomFlagged)
pr2('+ TOPOLOGICAL',  allFlagged)

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
console.log(`  + TOPOLOGICAL (loop-closure + cap-tangent):`)
console.log(`    recall    = ${TP.length}/${ND}  (${(100*TP.length/ND).toFixed(0)}%)  curated names flagged   [+${TP.length-TPg.length}]`)
console.log(`    precision = ${TP.length}/${allFlagged.size}  (${allFlagged.size?(100*TP.length/allFlagged.size).toFixed(0):0}%)  of flags are curated`)
console.log(`    grid FP   = ${FP.length}/${gridNames.size} clean-grid names flagged   [+${FP.length-FPg.length}]`)

console.log('\nFLAGGED CURATED (true positives):')
for (const n of [...curatedNames].filter(n=>allFlagged.has(n)).sort()) {
  const tags = []
  if (turnFlags[n])   tags.push(`turn(${turnFlags[n].jags}j,${turnFlags[n].worst}°)`)
  if (stepFlags[n])   tags.push(`step(${stepFlags[n].step}m:${stepFlags[n].a}/${stepFlags[n].b})`)
  if (curbFlags[n])   tags.push(`curb(${curbFlags[n]}m)`)
  if (selfIntFlags[n])tags.push(`selfint(${selfIntFlags[n]})`)
  if (faceFlags[n])   tags.push(`face(${faceFlags[n]})`)
  if (loopFlags[n])   tags.push(`LOOP(${loopFlags[n].why})`)
  if (capFlags[n])    tags.push(`CAP(${capFlags[n].capEnd}/${capFlags[n].end} ${capFlags[n].dist}m)`)
  console.log(`  ✔ ${n.padEnd(26)} ${tags.join('  ')}`)
}
console.log('\nMISSED CURATED (false negatives — no invariant fired):')
for (const n of FN.sort()) console.log(`  ✗ ${n}`)

console.log('\nGRID FALSE-POSITIVES (flagged but NOT curated — operator must judge):')
for (const n of FP.sort()) {
  const tags = []
  if (turnFlags[n])   tags.push(`turn(${turnFlags[n].jags}j,${turnFlags[n].worst}°)`)
  if (stepFlags[n])   tags.push(`step(${stepFlags[n].step}m)`)
  if (curbFlags[n])   tags.push(`curb(${curbFlags[n]}m)`)
  if (selfIntFlags[n])tags.push(`selfint(${selfIntFlags[n]})`)
  if (faceFlags[n])   tags.push(`face(${faceFlags[n]})`)
  if (loopFlags[n])   tags.push(`LOOP(${loopFlags[n].why})`)
  if (capFlags[n])    tags.push(`CAP(${capFlags[n].capEnd}/${capFlags[n].end} ${capFlags[n].dist}m)`)
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
