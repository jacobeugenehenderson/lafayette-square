/**
 * Cartograph — Phase 0: Skeleton extractor
 *
 * Input:  data/raw/osm.json (ground.highway features, local coords)
 * Output: data/clean/skeleton.json
 *           { streets: [...named, welded, simplified, divided-pairs collapsed],
 *             paths:   [...unnamed fragments, kept verbatim, tagged] }
 *
 * The skeleton is the canonical street graph. Everything downstream
 * (Survey, Measure, StreetRibbons, Designer, Stage) consumes it plus a
 * thin operator-edit overlay (centerlines.json, future shape).
 *
 * Run: node skeleton.js
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, CLEAN_DIR, requireExplicitScene} from './config.js'
import { writeIfChanged } from './io.js'
import { CURB_WIDTH, SV_SIDEWALK } from '../src/cartograph/streetProfiles.js'

// ⛔ No silent default on a WRITE path (BRIEF-ls-bleed-excision site 11).
requireExplicitScene('skeleton.js (writes data/<scene>/clean/skeleton.json)')

// --- Operator-reviewable manifests ----------------------------------------

/**
 * Names to exclude from the street track outright (interstates, rail,
 * named cycle-only tracks, etc.) — they become paths or are dropped.
 */
const EXCLUDE_FROM_STREETS = new Set([
  'MetroLink Green Line',                  // rail, not a street
  '21st Street Cycle Track',               // cycle-only
  // I-44 / Ozark Expressway names retired — we now ribbon motorways
  // explicitly (see derive.js vehicularStreets filter), and the corridor
  // reads better with the highway present than as a hole in the map.
])

// --- Geometry helpers -----------------------------------------------------

const EPS = 1e-3 // 1mm endpoint-match tolerance

function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z
  return dx * dx + dz * dz
}
function dist(a, b) { return Math.sqrt(dist2(a, b)) }

function ptsEqual(a, b) { return dist2(a, b) < EPS * EPS }

// Coord key at 1cm (matches fetch.js coord rounding). Used to detect shared
// nodes / junctions across chains and to protect them during simplification.
function vKey(p) { return `${p.x.toFixed(2)},${p.z.toFixed(2)}` }

function reverse(coords) { return coords.slice().reverse() }

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Perpendicular distance from point p to segment ab.
function perpDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2
  t = Math.max(0, Math.min(1, t))
  const px = a.x + t * dx, pz = a.z + t * dz
  return Math.hypot(p.x - px, p.z - pz)
}

// --- Step 1: group named highways by name ---------------------------------

function groupByName(highways) {
  const groups = new Map()
  const unnamed = []
  for (const f of highways) {
    const name = f.tags?.name
    if (!name) { unnamed.push(f); continue }
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(f)
  }
  return { groups, unnamed }
}

// --- Step 1.5: phase analyzer (Path B, phase 1 — analysis-only) -----------
// For each name group, classify each OSM fragment as:
//   - 'divided-A' / 'divided-B' — half of an antiparallel oneway pair
//     (mean perpendicular distance < DIVIDED_MAX_GAP, tangent dot < -0.6)
//   - 'single-oneway' — oneway fragment with no antiparallel partner
//   - 'single-bidi'   — bidirectional fragment
//
// This is pure analysis. Welding behavior is untouched. The decomposition
// is logged so we can validate it against the OSM-source table in NOTES
// (Jefferson 19 ways, Lafayette 22 ways) before phase 2 gates the welder.
//
// Why at the fragment level rather than chain level: a corridor like
// Lafayette has its divided carriageways at the OSM-way granularity.
// Once weldChains splices them, the structure is gone. The analyzer
// must run on raw fragments to see what's there.
const DIVIDED_MAX_GAP = 60           // meters — symmetric mean perp distance
                                     // (max of the two directional means, so
                                     // a stub can't claim a long partner via
                                     // its sliver of overlap). Truman's
                                     // widest carriageway pair sits at 54m;
                                     // length-ratio filter blocks stub abuse.
const DIVIDED_MIN_TAN_DOT = -0.6     // -1 = exactly antiparallel
const DIVIDED_MIN_LEN_RATIO = 0.5    // shorter / longer; rejects connector stubs
const DIVIDED_MIN_STATION_OVERLAP = 0.4  // fraction of the shorter fragment that
                                     // runs BESIDE its mate along the corridor
                                     // axis. The tangent-dot + gap gates accept
                                     // antiparallel fragments that are merely
                                     // NEAR each other; neither tests that the
                                     // two run side-by-side. A longitudinally-
                                     // staggered stub pair (Truman #5/#6:
                                     // z[-100,-31] vs z[-16,55], ~85m apart, zero
                                     // overlap) passes all three — the gap helper
                                     // clamps t∈[0,1], so a stub just past its
                                     // mate's end still reads a small perp
                                     // distance to that endpoint — and its
                                     // emergent median ring draws a skewed
                                     // diagonal wedge. Calibrated on all 28 LS
                                     // pairs: #5/#6 = 0.0, every TRUE pair ≥ 0.669
                                     // (clean gap; 0.4 is mid-gap). Unpaired stubs
                                     // fall through to single-oneway → no median,
                                     // the correct outcome.

function avgTangentXZ(coords) {
  let dx = 0, dz = 0
  for (let i = 1; i < coords.length; i++) {
    dx += coords[i].x - coords[i - 1].x
    dz += coords[i].z - coords[i - 1].z
  }
  const L = Math.hypot(dx, dz) || 1
  return { x: dx / L, z: dz / L }
}

function polylineLengthXZ(coords) {
  let s = 0
  for (let i = 1; i < coords.length; i++) {
    s += Math.hypot(coords[i].x - coords[i - 1].x, coords[i].z - coords[i - 1].z)
  }
  return s
}

// Mean nearest-distance from points of A onto polyline B.
function meanPerpDistanceXZ(aCoords, bCoords) {
  let sum = 0, n = 0
  for (const p of aCoords) {
    let best = Infinity
    for (let i = 0; i < bCoords.length - 1; i++) {
      const a = bCoords[i], b = bCoords[i + 1]
      const dx = b.x - a.x, dz = b.z - a.z
      const len2 = dx * dx + dz * dz
      if (len2 < 1e-9) continue
      let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2
      t = Math.max(0, Math.min(1, t))
      const px = a.x + t * dx, pz = a.z + t * dz
      const d = Math.hypot(px - p.x, pz - p.z)
      if (d < best) best = d
    }
    if (best < Infinity) { sum += best; n++ }
  }
  return n ? sum / n : Infinity
}

// Longitudinal station-overlap fraction of two fragments along the corridor.
// Project every point of A and of B onto A's average tangent (UNCLAMPED — unlike
// meanPerpDistanceXZ, which clamps t∈[0,1] and so can't tell "beside" from "just
// past the end"), giving each fragment a 1D station interval [min,max]. Return
// the overlap of those intervals as a fraction of the SHORTER interval. A true
// carriageway pair runs the corridor together → ≈1; a staggered stub pair → 0.
// Convention note (feedback_perp_side_convention): this is a STATION test (along
// the axis), orthogonal to the perp-side/innerSign question (across the axis) —
// it only decides WHETHER two fragments pair, never which side faces the median.
function stationOverlapFracXZ(aCoords, bCoords) {
  const tHat = avgTangentXZ(aCoords)
  const o = aCoords[0]
  const station = (p) => (p.x - o.x) * tHat.x + (p.z - o.z) * tHat.z
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity
  for (const p of aCoords) { const s = station(p); if (s < aMin) aMin = s; if (s > aMax) aMax = s }
  for (const p of bCoords) { const s = station(p); if (s < bMin) bMin = s; if (s > bMax) bMax = s }
  const shorter = Math.min(aMax - aMin, bMax - bMin)
  if (shorter < 1e-6) return 0  // degenerate axis-extent — treat as no overlap
  const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin))
  return overlap / shorter
}

// ── Data-first carriageway gates (OSM2STREETS-GROUNDING §4.2 item 1) ──────
//
// The geometric gates below (scoreOnewayPair) used to be the WHOLE detector —
// any two same-name oneway fragments that ran antiparallel within 60 m were
// declared a divided road. That fabricated the South 18th pair: a motorway_link
// ramp + a service drive, both carrying the street name, 3.2 m apart, sailed
// through. The standard (osm2streets dual_carriageways.rs) detects from the
// DATA MODEL + TOPOLOGY first — class compatibility, ramp dispatch, a
// split/rejoin trace — and uses geometry as at most a check. These gates port
// that, in front of BOTH pairing call sites (analyzePhases, repairDividedPairs):
//
//   (a) SAME drivable class — every osm2streets collapse/merge gate requires
//       matching highway class; a ramp and a service drive are never the two
//       halves of one road.
//   (b) carriageway ELIGIBILITY — `*_link` (ramps: their on_off_ramp dispatch,
//       never carriageway candidates) and `service` (drives/alleys: never
//       carriageways) classes are excluded outright, as are non-drivable ways.
//   (c) SPLIT/REJOIN connectivity — a real divided road diverges from a node
//       and rejoins (their MultiConnection trace). Measured on all live LS
//       pairs: every real pair rejoins within a ≤24 m bridge — EXCEPT the
//       clip-truncated arterial corridors (Truman, Officer-David-Haynes, one
//       Jefferson pair) whose split/rejoin lies OUTSIDE the disc extract; a
//       hard topological gate would kill those real corridors. Hence the
//       tier: clip-scale classes (tertiary and up — corridors big enough to
//       cross the whole extract unbroken) are exempt; everything local
//       (residential/unclassified/living_street) must demonstrably rejoin.
//
// Geometry is thereby DEMOTED to confirmation. DIVIDED_MAX_GAP stays 60 — not
// tightened, because real staggered fragment pairs reach 53.8 m (Truman) — but
// it is no longer the trigger: class + topology are.
const CARRIAGEWAY_CLASSES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street',
])
// Corridors that plausibly cross the whole clipped extract without a rejoin
// inside it (gate (c)'s clip-truncation exemption).
const CLIP_SCALE_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
const REJOIN_BRIDGE_MAX = 35  // m — longest live real-pair bridge is 23.3 (Park Ave)

// Node-adjacency over ALL highway fragments (every consecutive coord pair is
// an edge tagged with its way). Built once in main(), threaded to both pairing
// call sites for the rejoin trace.
function buildRejoinGraph(highways) {
  const adj = new Map()
  const push = (k, e) => { let a = adj.get(k); if (!a) { a = []; adj.set(k, a) } a.push(e) }
  for (const f of highways) {
    for (let i = 0; i < f.coords.length - 1; i++) {
      const a = vKey(f.coords[i]), b = vKey(f.coords[i + 1])
      const len = dist(f.coords[i], f.coords[i + 1])
      push(a, { to: b, len, osmId: f.osmId })
      push(b, { to: a, len, osmId: f.osmId })
    }
  }
  return adj
}

// Gate (c): does some endpoint of A reach some endpoint of B — a shared node
// (direct rejoin, 0 m), or a short path through OTHER ways (the corridor's own
// bidi spine, or a cross-street stub between the carriageway ends — osm2streets'
// "bridge" roads), never traveling along A or B themselves, capped at
// REJOIN_BRIDGE_MAX. Dijkstra over a tiny neighborhood; cheap.
function pairRejoins(adj, aCoords, bCoords, bannedIds) {
  const endsOf = (c) => [vKey(c[0]), vKey(c[c.length - 1])]
  const targets = new Set(endsOf(bCoords))
  for (const k of endsOf(aCoords)) if (targets.has(k)) return true
  const banned = new Set(bannedIds)
  for (const start of endsOf(aCoords)) {
    const seen = new Map([[start, 0]])
    const q = [[0, start]]
    while (q.length) {
      q.sort((x, y) => x[0] - y[0])
      const [d, n] = q.shift()
      if (targets.has(n)) return true
      for (const e of adj.get(n) || []) {
        if (banned.has(e.osmId)) continue
        const nd = d + e.len
        if (nd > REJOIN_BRIDGE_MAX) continue
        if (nd >= (seen.get(e.to) ?? Infinity)) continue
        seen.set(e.to, nd); q.push([nd, e.to])
      }
    }
  }
  return false
}

// Gates (a)+(b)+(c) bundled — `cls` per candidate from its tags (fragment
// level) or dominant-class vote (chain level). Returns false-with-reason for
// the rejection log.
function carriagewayGates(clsA, clsB, aCoords, bCoords, bannedIds, rejoinAdj) {
  if (!CARRIAGEWAY_CLASSES.has(clsA) || !CARRIAGEWAY_CLASSES.has(clsB)) {
    return { pass: false, reason: `ineligible-class ${clsA}+${clsB}` }
  }
  if (clsA !== clsB) return { pass: false, reason: `class-mismatch ${clsA}+${clsB}` }
  if (!CLIP_SCALE_CLASSES.has(clsA) &&
      !pairRejoins(rejoinAdj, aCoords, bCoords, bannedIds)) {
    return { pass: false, reason: `no-split-rejoin (${clsA})` }
  }
  return { pass: true }
}

// The full 4-gate carriageway-pair test, in one place so every caller applies
// the SAME gates — including the station-overlap gate (commit 8ffd795). Used by
// analyzePhases (fragment level, pre-weld) AND repairDividedPairs (merged-chain
// level, post-longitudinal-weld) as geometric CONFIRMATION behind the data-first
// carriagewayGates above. Returns { paired, gap } — gap is the symmetric
// mean perpendicular distance (= the median width) when the candidate pairs.
//   1. antiparallel        — tangent dot < DIVIDED_MIN_TAN_DOT (oneway pairs run
//                            opposite directions)
//   2. length-ratio        — shorter/longer ≥ DIVIDED_MIN_LEN_RATIO (rejects stubs)
//   3. symmetric gap        — max of the two directional means ≤ DIVIDED_MAX_GAP
//                            (a short fragment can't claim a long partner cheaply)
//   4. station-overlap      — the two must run BESIDE each other along the corridor
//                            axis, not merely be near + antiparallel (drops the
//                            longitudinally-staggered stub pair the gap clamp lets slip)
function scoreOnewayPair(aCoords, bCoords) {
  const aTan = avgTangentXZ(aCoords)
  const bTan = avgTangentXZ(bCoords)
  const dot = aTan.x * bTan.x + aTan.z * bTan.z
  if (dot > DIVIDED_MIN_TAN_DOT) return { paired: false }
  const aLen = polylineLengthXZ(aCoords)
  const bLen = polylineLengthXZ(bCoords)
  const lenRatio = Math.min(aLen, bLen) / Math.max(aLen, bLen)
  if (lenRatio < DIVIDED_MIN_LEN_RATIO) return { paired: false }
  const gap = Math.max(
    meanPerpDistanceXZ(aCoords, bCoords),
    meanPerpDistanceXZ(bCoords, aCoords),
  )
  if (gap > DIVIDED_MAX_GAP) return { paired: false }
  if (stationOverlapFracXZ(aCoords, bCoords) < DIVIDED_MIN_STATION_OVERLAP) return { paired: false }
  return { paired: true, gap, lenRatio }
}

function analyzePhases(name, fragments, rejoinAdj) {
  const oneway = fragments.filter(f => f.tags?.oneway === 'yes')
  const bidi = fragments.filter(f => f.tags?.oneway !== 'yes')

  // Score every candidate oneway pair, then resolve by ascending gap so
  // the cleanest matches claim partners first. Greedy first-match was
  // letting connector stubs lock out same-length carriageway mates
  // (Truman: 361m main pair lost to a 12m stub at 12.4m one-way gap).
  // Data-first gates run FIRST (class/eligibility/rejoin — see
  // carriagewayGates); geometry confirms. Rejections of geometric matches
  // are logged so a refused pair is visible, never silent.
  const cand = []
  for (let i = 0; i < oneway.length; i++) {
    const A = oneway[i]
    for (let j = i + 1; j < oneway.length; j++) {
      const B = oneway[j]
      const r = scoreOnewayPair(A.coords, B.coords)
      if (!r.paired) continue
      const g = carriagewayGates(
        A.tags?.highway, B.tags?.highway,
        A.coords, B.coords, [A.osmId, B.osmId], rejoinAdj)
      if (!g.pass) {
        console.log(`  carriageway gates REFUSED ${name} ${A.osmId}+${B.osmId} (gap ${r.gap.toFixed(1)}m): ${g.reason}`)
        continue
      }
      cand.push({ A, B, gap: r.gap, lenRatio: r.lenRatio })
    }
  }
  cand.sort((a, b) => a.gap - b.gap)

  const paired = new Map() // osmId → { partner, gap, role, pairKey }
  for (const { A, B, gap } of cand) {
    if (paired.has(A.osmId) || paired.has(B.osmId)) continue
    // pairKey stays stable across welding so derive can rejoin A/B
    // chains by lookup instead of geometry.
    const pairKey = `${Math.min(A.osmId, B.osmId)}-${Math.max(A.osmId, B.osmId)}`
    paired.set(A.osmId, { partner: B.osmId, gap, role: 'divided-A', pairKey })
    paired.set(B.osmId, { partner: A.osmId, gap, role: 'divided-B', pairKey })
  }

  const classified = fragments.map(f => {
    if (f.tags?.oneway === 'yes') {
      const p = paired.get(f.osmId)
      if (p) return { osmId: f.osmId, kind: 'divided', role: p.role, partner: p.partner, gap: p.gap, pairKey: p.pairKey }
      return { osmId: f.osmId, kind: 'single-oneway' }
    }
    return { osmId: f.osmId, kind: 'single-bidi' }
  })

  const counts = {
    total: fragments.length,
    dividedPairs: paired.size / 2,
    singleOneway: classified.filter(c => c.kind === 'single-oneway').length,
    singleBidi: bidi.length,
  }
  return { name, classified, counts }
}

// --- Step 2: weld end-to-end fragments within a group ---------------------
// Greedy: pick a fragment, try to extend either end with another whose
// endpoint matches. Repeat until no more matches, then start a new chain.

// If a welded chain folds back on itself (two adjacent segments whose
// tangents face opposite directions, cos < -0.5), split it at the fold.
// Required for any signature: pairKey gating prevents cross-pair fusion
// but a single OSM way can still trace a doubled-back path (Y-junctions,
// turning loops), and the welder preserves it as one chain. Without
// splitting, clicking the chain highlights both arms of the fold.
//
// Sources are PER-SLICE: the welder carries `segSources` (the source osmId of
// every segment, parallel to coords) precisely so each slice here can claim
// only the ways its own segments came from. Before this, every slice was
// stamped with the UNION of the folded chain's sources — so two antiparallel
// drives fused-then-split at a gradual U (Papin's service pairs once the
// carriageway gates un-paired them) each claimed BOTH ways, polluting the
// class/lanes/grade summaries and the osmId-keyed lookups downstream.
function sliceSources(chain, from, to) {  // coords[from..to] → segments [from..to-1]
  const seg = chain.segSources
  if (!seg) return chain.sources
  return [...new Set(seg.slice(from, to))]
}
//
// For divided chains (carriageway-A/-B), splitting is signature-aware:
// keep ONLY the longest sub-chain with the original (signature, pairKey).
// Shorter sub-chains demote to single-bidi (no pairKey) so derive's
// pair lookup stays 1:1 — there can only be one carriageway-A and one
// carriageway-B per pairKey.
function splitAtFolds(chains) {
  const out = []
  for (const chain of chains) {
    const coords = chain.coords
    const foldIdxs = []
    for (let i = 1; i < coords.length - 1; i++) {
      const ax = coords[i].x - coords[i - 1].x
      const az = coords[i].z - coords[i - 1].z
      const bx = coords[i + 1].x - coords[i].x
      const bz = coords[i + 1].z - coords[i].z
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz)
      if (la < 1e-6 || lb < 1e-6) continue
      const cos = (ax * bx + az * bz) / (la * lb)
      if (cos < -0.5) foldIdxs.push(i)
    }
    if (!foldIdxs.length) { out.push(chain); continue }
    const cuts = [0, ...foldIdxs, coords.length - 1]
    const slices = []
    for (let i = 0; i < cuts.length - 1; i++) {
      const slice = coords.slice(cuts[i], cuts[i + 1] + 1)
      if (slice.length >= 2) slices.push({
        coords: slice,
        sources: sliceSources(chain, cuts[i], cuts[i + 1]),
        segSources: chain.segSources ? chain.segSources.slice(cuts[i], cuts[i + 1]) : undefined,
      })
    }
    const isDivided = chain.signature === 'divided-A' || chain.signature === 'divided-B'
    if (isDivided && slices.length > 1) {
      // Keep the longest as the carriageway; demote the rest.
      let bestIdx = 0, bestLen = 0
      for (let i = 0; i < slices.length; i++) {
        let L = 0
        const c = slices[i].coords
        for (let j = 1; j < c.length; j++) L += Math.hypot(c[j].x - c[j-1].x, c[j].z - c[j-1].z)
        if (L > bestLen) { bestLen = L; bestIdx = i }
      }
      for (let i = 0; i < slices.length; i++) {
        if (i === bestIdx) {
          out.push({ ...chain, ...slices[i] })
        } else {
          out.push({ ...chain, ...slices[i], signature: 'single-bidi', pairKey: null, oneway: false })
        }
      }
    } else {
      for (const slice of slices) out.push({ ...chain, ...slice })
    }
  }
  return out
}

// signatureByOsmId: Map<osmId, 'divided-A'|'divided-B'|'single-oneway'|'single-bidi'>.
// pairKeyByOsmId: Map<osmId, pairKey> for divided fragments — null otherwise.
// Welds are gated on (signature, pairKey) equality. Signature alone forbids
// the splice bridges that fused opposing carriageways into one super-chain
// (Lafayette 22→1). PairKey additionally keeps separate divided pairs in the
// same corridor (e.g. Lafayette's three A carriageways) from welding into
// each other when their endpoints happen to coincide.
function weldChains(fragments, signatureByOsmId, pairKeyByOsmId) {
  // [Data-first detection] ramp-dispatch boundary: a *_link fragment never
  // fuses with a non-link fragment of the same name group. This is the
  // standard's collapse class-gate ported at the link boundary only — a named
  // ramp (South 18th's I-44 motorway_link carries the street name) is its own
  // road, never a continuation of the surface street. Full class equality is
  // NOT enforced: 5 live chains legitimately mix classes (residential+service
  // continuations etc.) and splitting them is out of scope here.
  const isLink = (t) => /_link$/.test(t?.highway || '')
  const pool = fragments.map(f => ({
    coords: f.coords.slice(),
    sources: [f.osmId],
    // Source osmId per SEGMENT (parallel to coords, length-1): carried through
    // every weld so splitAtFolds can attribute each slice to its real ways.
    segSources: new Array(Math.max(0, f.coords.length - 1)).fill(f.osmId),
    tags: f.tags,
    oneway: f.tags?.oneway === 'yes',
    isClosed: f.isClosed,
    signature: signatureByOsmId.get(f.osmId) || 'single-bidi',
    pairKey: pairKeyByOsmId.get(f.osmId) || null,
  }))
  const chains = []

  while (pool.length) {
    let chain = pool.shift()
    let extended = true
    while (extended) {
      extended = false
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i]
        if (c.signature !== chain.signature) continue
        if (c.pairKey !== chain.pairKey) continue
        // Ramp-dispatch boundary (see header): link welds link, street welds
        // street, never across.
        if (isLink(chain.tags) !== isLink(c.tags)) continue
        const chainHead = chain.coords[0]
        const chainTail = chain.coords[chain.coords.length - 1]
        const cHead = c.coords[0]
        const cTail = c.coords[c.coords.length - 1]

        // If EITHER side is one-way, forbid flipped welds (tail-to-tail,
        // head-to-head). Flipping reverses direction; for a oneway chain
        // that splices together opposing carriageways of a divided road —
        // the classic welding failure that bowed Park Ave across its
        // median. Checking `chain.oneway` alone isn't enough: a oneway
        // fragment can accrete onto a bidirectional seed without
        // propagating its oneway flag.
        const anyOneway = chain.oneway || c.oneway

        // [Data-first detection] …and forbid U-TURN welds (joint heading
        // reverses, cos < -0.5 — the same fold threshold splitAtFolds cuts
        // at). An UN-PAIRED antiparallel oneway couple sharing an endpoint
        // (Papin's service drives; 18th's ramp+service once the carriageway
        // gates refuse them) would otherwise fuse tail-to-head into a folded
        // chain — splitAtFolds re-cuts the coords but stamps BOTH slices with
        // the union of sources, polluting class/lanes/grade summaries. A
        // genuine oneway continuation never U-turns at the join. Bidi U-welds
        // stay legal (a crescent street digitized in two ways is one road).
        const uTurn = (tOut, tIn) => headingDot(tOut, tIn) < -0.5

        // tail-to-head
        if (ptsEqual(chainTail, cHead) &&
            !(anyOneway && uTurn(tailTangent(chain.coords), headTangent(c.coords)))) {
          chain.coords = chain.coords.concat(c.coords.slice(1))
          chain.sources.push(...c.sources)
          chain.segSources = chain.segSources.concat(c.segSources)
          pool.splice(i, 1); extended = true; break
        }
        // tail-to-tail (flip c) — forbidden for oneway pairs
        if (!anyOneway && ptsEqual(chainTail, cTail)) {
          chain.coords = chain.coords.concat(reverse(c.coords).slice(1))
          chain.sources.push(...c.sources)
          chain.segSources = chain.segSources.concat(reverse(c.segSources))
          pool.splice(i, 1); extended = true; break
        }
        // head-to-tail (prepend c)
        if (ptsEqual(chainHead, cTail) &&
            !(anyOneway && uTurn(tailTangent(c.coords), headTangent(chain.coords)))) {
          chain.coords = c.coords.slice(0, -1).concat(chain.coords)
          chain.sources.unshift(...c.sources)
          chain.segSources = c.segSources.concat(chain.segSources)
          pool.splice(i, 1); extended = true; break
        }
        // head-to-head (flip c, prepend) — forbidden for oneway pairs
        if (!anyOneway && ptsEqual(chainHead, cHead)) {
          chain.coords = reverse(c.coords).slice(0, -1).concat(chain.coords)
          chain.sources.unshift(...c.sources)
          chain.segSources = reverse(c.segSources).concat(chain.segSources)
          pool.splice(i, 1); extended = true; break
        }
      }
    }
    chains.push(chain)
  }
  return chains
}

// --- Step 2.5: longitudinal carriageway weld (D1) -------------------------
//
// weldChains gates on (signature, pairKey) equality. That gate is CORRECT —
// it blocks LATERAL fusion (splicing opposing carriageways into one super-
// chain: the Lafayette 22→1 / Park-Ave-bow bug). But it ALSO leaves a single
// carriageway shattered into pieces whenever its own colinear continuation
// carries a different signature — which is exactly what happens on a divided
// road: the pairing turns on/off along the corridor (the two carriageways'
// junctions are staggered), so one physical carriageway is
//   [divided-A/pairK1] → [single-oneway/spine] → [divided-?/pairK2] → …
// — three or four (signature,pairKey) values along one straight strand, so
// weldChains leaves three or four chains. Truman: 8 chains for one road.
//
// This pass fuses those LONGITUDINAL continuations that weldChains can't:
// tail-to-head, heading-continuous, at a degree-2 node, oneway-only, and
// NEVER flipped. Because it never flips and requires heading continuity, it
// cannot join the two opposing carriageways (they run antiparallel and meet
// nowhere tail-to-head with continuous heading) — the lateral guard the
// (signature,pairKey) gate provided stays in force. The longitudinal-vs-
// lateral distinction is the whole point: weldChains owns lateral (keeps
// carriageways apart), this owns longitudinal (makes each one continuous).
//
// Scope = oneway only. A carriageway is oneway end-to-end; bidi colinear
// continuations are already fused by weldChains (same signature/pairKey), so
// restricting here keeps undivided bidi corridors untouched and guarantees
// never-flip is always meaningful.
//
// Returns { chains, didMerge }. didMerge gates repairDividedPairs (below):
// the merge crosses the per-fragment A/B role labels, so a merged group's
// pairing must be re-derived from geometry; an unmerged group keeps the
// fragment-level pairing analyzePhases already assigned (zero regression).
const LONGITUDINAL_MIN_HEADING_DOT = 0.85  // cos(~32°). The continuation must be
                                           // a near-colinear extension, not a
                                           // junction branch turning off the axis.

// End tangents at a join, using the segment adjacent to the joined endpoint.
function tailTangent(coords) {  // direction LEAVING the chain at its tail
  for (let i = coords.length - 1; i > 0; i--) {
    const dx = coords[i].x - coords[i - 1].x, dz = coords[i].z - coords[i - 1].z
    const L = Math.hypot(dx, dz)
    if (L > 1e-6) return { x: dx / L, z: dz / L }
  }
  return { x: 0, z: 0 }
}
function headTangent(coords) {  // direction ENTERING the chain at its head
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i].x - coords[i - 1].x, dz = coords[i].z - coords[i - 1].z
    const L = Math.hypot(dx, dz)
    if (L > 1e-6) return { x: dx / L, z: dz / L }
  }
  return { x: 0, z: 0 }
}
function headingDot(t1, t2) { return t1.x * t2.x + t1.z * t2.z }

function weldLongitudinal(chains) {
  // Vertex multiplicity across the whole group (endpoints AND interior). A
  // continuation node where only the two joined endpoints sit reads 2; a
  // third chain ending or passing through (a Y-branch / junction) reads ≥3
  // and is excluded — that is the "degree-3+ is a junction, not a weld point"
  // rule, scoped to this corridor's own chains.
  const vCount = new Map()
  for (const c of chains) for (const p of c.coords) {
    const k = vKey(p); vCount.set(k, (vCount.get(k) || 0) + 1)
  }
  const deg2 = (p) => vCount.get(vKey(p)) === 2

  const pool = chains.map(c => ({ ...c, coords: c.coords.slice(), sources: c.sources.slice() }))
  const out = []
  let didMerge = false
  while (pool.length) {
    let chain = pool.shift()
    let extended = true
    while (extended) {
      extended = false
      // Only oneway carriageways weld here (see scope note above).
      if (!chain.oneway) break
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i]
        if (!c.oneway) continue
        const chainHead = chain.coords[0]
        const chainTail = chain.coords[chain.coords.length - 1]
        const cHead = c.coords[0]
        const cTail = c.coords[c.coords.length - 1]

        // tail-to-head: chain → c. Direction preserved (no flip). Require the
        // join node be degree-2 and the heading continuous across it.
        if (ptsEqual(chainTail, cHead) && deg2(chainTail) &&
            headingDot(tailTangent(chain.coords), headTangent(c.coords)) >= LONGITUDINAL_MIN_HEADING_DOT) {
          chain.coords = chain.coords.concat(c.coords.slice(1))
          chain.sources.push(...c.sources)
          if (chain.segSources && c.segSources) chain.segSources = chain.segSources.concat(c.segSources)
          pool.splice(i, 1); extended = true; didMerge = true; break
        }
        // head-to-tail: c → chain (prepend). Also direction-preserving.
        if (ptsEqual(chainHead, cTail) && deg2(chainHead) &&
            headingDot(tailTangent(c.coords), headTangent(chain.coords)) >= LONGITUDINAL_MIN_HEADING_DOT) {
          chain.coords = c.coords.slice(0, -1).concat(chain.coords)
          chain.sources.unshift(...c.sources)
          if (chain.segSources && c.segSources) chain.segSources = c.segSources.concat(chain.segSources)
          pool.splice(i, 1); extended = true; didMerge = true; break
        }
        // No tail-to-tail / head-to-head: those FLIP one chain, which is how
        // opposing carriageways fuse. Never flip — the lateral guard.
      }
    }
    out.push(chain)
  }
  return { chains: out, didMerge }
}

// Re-derive divided-carriageway pairing on a group's chains AFTER the
// longitudinal weld. Necessary because the per-fragment A/B role labels do
// NOT survive the merge: one physical strand can hold a carriageway-A piece
// from one pair and a carriageway-B piece from another (Truman's east strand
// = #0[A,K1] + spine + #3[B,K2] + spine), so the inherited signature/pairKey
// is meaningless on a merged chain. We re-pair the merged oneway chains with
// the SAME 4 gates analyzePhases uses (scoreOnewayPair) and stamp a fresh
// shared pairKey + A/B signature + chainGap on the two carriageways. The
// emergent median then falls out of one continuous inner-edge chain per side.
function repairDividedPairs(chains, rejoinAdj) {
  const oneway = chains.filter(c => c.oneway)
  const cand = []
  for (let i = 0; i < oneway.length; i++) {
    for (let j = i + 1; j < oneway.length; j++) {
      const a = oneway[i], b = oneway[j]
      const r = scoreOnewayPair(a.coords, b.coords)
      if (!r.paired) continue
      // Same data-first gates as analyzePhases, at chain granularity: class
      // from the dominant-class vote over each chain's own sources; the
      // rejoin trace banned from traveling along either chain's ways.
      const g = carriagewayGates(
        chainHighway(a.sources, a.tags), chainHighway(b.sources, b.tags),
        a.coords, b.coords, [...(a.sources || []), ...(b.sources || [])], rejoinAdj)
      if (!g.pass) {
        console.log(`  carriageway gates REFUSED (chain-level) ${a.sources?.[0]}+${b.sources?.[0]} (gap ${r.gap.toFixed(1)}m): ${g.reason}`)
        continue
      }
      cand.push({ a, b, gap: r.gap })
    }
  }
  cand.sort((x, y) => x.gap - y.gap)  // cleanest (tightest) pairs claim first
  const partnered = new Set()
  for (const { a, b, gap } of cand) {
    if (partnered.has(a) || partnered.has(b)) continue
    partnered.add(a); partnered.add(b)
    // Fresh pairKey shared by both carriageways, stable across the bake:
    // min/max over the union of source osmIds. Distinct from any fragment-
    // level pairKey (which derive no longer sees for this corridor).
    const ids = [...a.sources, ...b.sources]
    const pairKey = `${Math.min(...ids)}-${Math.max(...ids)}`
    // chainGap = perpendicular distance between the two carriageway CHAINS
    // (formerly misnamed `medianWidth`). The chains sit at the carriageways'
    // median-facing edges (anchor='inner-edge'), so the gap approximates the
    // physical median only when both inboard pavementHWs are 0 — it is a
    // frame fact about the chains, not a measured median. (Mercator, D1.)
    const mw = +gap.toFixed(2)
    a.signature = 'divided-A'; a.pairKey = pairKey; a.chainGap = mw
    b.signature = 'divided-B'; b.pairKey = pairKey; b.chainGap = mw
  }
  // Any oneway chain that was divided at the fragment level but found no
  // partner after the merge demotes to a plain one-way spine (no median).
  for (const c of oneway) {
    if (partnered.has(c)) continue
    if (c.signature === 'divided-A' || c.signature === 'divided-B') {
      c.signature = 'single-oneway'; c.pairKey = null; c.chainGap = undefined
    }
  }
}

// Chain length in meters (used by shadow-drop and simplification metrics).
function chainLength(coords) {
  let s = 0
  for (let i = 1; i < coords.length; i++) s += dist(coords[i - 1], coords[i])
  return s
}

function resamplePolyline(coords, n) {
  const total = chainLength(coords)
  const step = total / (n - 1)
  const out = [coords[0]]
  let distAcc = 0, segIdx = 0, segStart = coords[0], segEnd = coords[1]
  let segLen = dist(segStart, segEnd)
  for (let i = 1; i < n - 1; i++) {
    const target = i * step
    while (distAcc + segLen < target && segIdx < coords.length - 2) {
      distAcc += segLen
      segIdx++
      segStart = coords[segIdx]
      segEnd = coords[segIdx + 1]
      segLen = dist(segStart, segEnd)
    }
    const t = (target - distAcc) / segLen
    out.push({
      x: segStart.x + t * (segEnd.x - segStart.x),
      z: segStart.z + t * (segEnd.z - segStart.z),
    })
  }
  out.push(coords[coords.length - 1])
  return out
}

// --- Step 4: simplification ------------------------------------------------
// Junction-protected GLOBAL Douglas-Peucker. (Replaces the old local
// single-pass `simplify`, which only collapsed a vertex when BOTH its
// perp-deviation AND its turn fell below tolerance — too weak to thin OSM's
// native curve OVER-SAMPLING: a smooth loop digitized at ~30 vertices keeps
// them all, since each turns >2°.) That over-sampled line is the root of the
// downstream "too much line" thorns: the render's `smoothChain` then
// ×4-interpolates every one of those vertices (29 → ~113 on Benton), and the
// inward ped-band offset of that rippled ring bulges/pinches. RDP instead
// keeps the MINIMAL control set whose chords stay within `eps` of every
// dropped vertex — a smooth curve collapses to its few real control points,
// then ONE smoothing pass regenerates it cleanly (PIPELINE P1: "the simpler
// the skeleton output, the healthier downstream").
//
// Topology is preserved byte-for-byte: sharp corners survive automatically
// (any chord spanning a corner has large perp-deviation → the corner vertex is
// kept), and every junction / shared-node coord in `protectedKeys` (Set of
// `vKey(p)`) is a FORCED split point + keep (the 79-interior-T fix,
// Osteopathologist / OSM-FORENSICS Part 3). So degree, caps, and the junction
// graph are unchanged; only redundant curve/straight in-fill is removed.
function rdpRange(coords, lo, hi, eps, keep) {
  if (hi - lo < 2) return
  const a = coords[lo], b = coords[hi]
  let maxD = -1, maxI = -1
  for (let i = lo + 1; i < hi; i++) {
    const d = perpDist(coords[i], a, b)   // len2==0 (closed span) → radial dist; RDP still splits at the apex
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > eps) {
    keep[maxI] = true
    rdpRange(coords, lo, maxI, eps, keep)
    rdpRange(coords, maxI, hi, eps, keep)
  }
}
function simplifyRDP(coords, eps = 0.5, protectedKeys = null) {
  if (coords.length <= 2) return coords.slice()
  const n = coords.length
  const keep = new Array(n).fill(false)
  keep[0] = keep[n - 1] = true
  // Forced split points: protected (junction / shared-node) interior vertices.
  // Splitting the chain at each one guarantees it survives RDP exactly.
  const splits = [0]
  for (let i = 1; i < n - 1; i++) {
    if (protectedKeys && protectedKeys.has(vKey(coords[i]))) { keep[i] = true; splits.push(i) }
  }
  splits.push(n - 1)
  for (let s = 0; s < splits.length - 1; s++) rdpRange(coords, splits[s], splits[s + 1], eps, keep)
  return coords.filter((_, i) => keep[i])
}
// Like simplifyRDP but returns the keep[] boolean mask instead of the filtered
// points — so a caller can RDP a CONCATENATED through-road once and then split it
// back into its named chains at known seam indices (see the transition-aware
// simplification below). Shares rdpRange + the protected-split logic exactly.
function rdpKeep(coords, eps = 0.5, protectedKeys = null) {
  const n = coords.length
  const keep = new Array(n).fill(false)
  if (n === 0) return keep
  keep[0] = keep[n - 1] = true
  if (n <= 2) return keep
  const splits = [0]
  for (let i = 1; i < n - 1; i++) {
    if (protectedKeys && protectedKeys.has(vKey(coords[i]))) { keep[i] = true; splits.push(i) }
  }
  splits.push(n - 1)
  for (let s = 0; s < splits.length - 1; s++) rdpRange(coords, splits[s], splits[s + 1], eps, keep)
  return keep
}

// --- Step 4b: curve-fit — a curving RUN becomes a smooth ARC ----------------
// (HANDOFF-concentric-curb-curved-streets.md / the two laws.) A curving street is
// a CURVE, not chords. RDP (step 4) gives the control points; here each RUN of gentle
// same-direction bends — between HARD vertices (endpoints, junctions/name-transitions,
// real sharp corners) — is replaced by a single circular ARC fit through it (a biarc
// where one arc can't ride the road, by a deviation bound), tessellated FINELY. The
// centerline becomes a true arc (no straight chords) so the curb's concentric offset is
// smooth — no facets, inner and outer. GRID-SAFE BY CONSTRUCTION: a straight run (no
// interior bend) and a sharp corner are left byte-identical — only genuine curves change.
// ⭐ DEFAULT-ON 2026-08-02. Was `=== '1'` (off by default), which made the pipeline
// unable to reproduce its own committed frame: the shipped LS skeleton carries 52 of
// 217 streets with bezier `segments`, so it was minted with the flag ON, and the
// documented rebuild silently produced a curve-LESS frame instead. That is ROADMAP
// A01's root and the exact silent-substitution shape — town #2 follows the docs, gets
// faceted streets, and nothing fails.
// ⚠️ Do NOT confuse this with STREET_SMOOTH, the retired render-time smoothing knob
// (`smoothCenterline.js`, pinned 0 since 2026-06-14) whose offset had no miter clamp
// and produced the needle/spur degenerates. THIS is the curve PRIMITIVE: sparse bezier
// control points fitted at the frame, grid-safe by construction, guarded by
// CURVE_MIN_RADIUS/CURVE_DEV_TOL below — and eye-approved twice (`7c49349` "centerline
// perfect"; `4273ce8` "curve curb is clean now"). Set CURVE_FIT=0 to disable.
const CURVE_FIT        = process.env.CURVE_FIT !== '0'   // ON by default — the curve-PRIMITIVE fit (HANDOFF-curve-primitive-skeleton.md)
const CURVE_HARD_TURN  = 35 * Math.PI / 180   // a vertex turning ≥ this is a real corner → kept SHARP, never inside a cluster
const CURVE_MIN_TURN   = 5  * Math.PI / 180   // a cluster must accumulate at least this total turn to be a real curve
const CURVE_SEG_MAX    = 40                    // a segment LONGER than this is a straight LEG — kept verbatim, never bezier'd
const CURVE_DEV_TOL    = 2.0                   // a fitted cubic must ride within this (m) of the cluster's real points, else fall back to lines (Law 2: never pull off the road). Tune on the eye.
const CURVE_MIN_RADIUS = 3                    // a fitted cubic may never bend TIGHTER than this radius (m) — catches the mid-curve HOOK that `dev` (one-sided) is blind to. 3 m is the knee measured on HPDM: kinks 26→14 (baseline 13) at a cost of 2 facet vertices; larger radii buy no further kink reduction and cost real smoothing. Turning circles ride the separate closed-loop path, untouched.
const CURVE_SPLIT_DEPTH = 4                // max recursive SPLITS when one cubic can't ride a long sweep (≤16 pieces). The frame stays sparse: a split adds ONE control vertex, vs. the dozens a densify would.
const CURVE_LOOP_CIRCLE_TOL = 0.06            // v2 step (a): a CLOSED loop whose circle-fit residual/R is within this is a turning circle → fit as bezier arcs. SV/Park ≈0.2%. A loop OVER this (Benton teardrop 73%) is NOT a circle → v2 step (b) fitClosedLoopBezier fits it as general beziers instead. (Waverly is a couplet, not a single closed loop — a different topology, unaffected.)
// Cubic-bezier point.
function bez(P0, P1, P2, P3, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return { x: a * P0.x + b * P1.x + c * P2.x + d * P3.x, z: a * P0.z + b * P1.z + c * P2.z + d * P3.z }
}
function lerpPt(a, b, t) { return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t } }
// Fit ONE cubic across cluster P[a..b], LEAVING P[a] along t0 and ARRIVING at P[b] along
// t3 (unit leg/seam directions) so the curve joins its neighbours TANGENTIALLY (no hook).
// Solves the TWO handle magnitudes (α,β) by least squares so the cubic rides the cluster's
// interior points. Returns ABSOLUTE control handles { c1, c2, dev } — NOT tessellated
// (this is the curve-PRIMITIVE model; tessellation happens once, downstream). `dev` = max
// ride error; the caller falls back to lines if it exceeds CURVE_DEV_TOL (Law 2).
function fitClusterHandles(P, a, b, t0, t3) {
  const P0 = P[a], P3 = P[b]
  const chord = Math.hypot(P3.x - P0.x, P3.z - P0.z)
  if (!(chord > 1e-6)) return null
  const cum = [0]                                  // chord-length parameter for each cluster point
  for (let i = a + 1; i <= b; i++) cum.push(cum[cum.length - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z))
  const total = cum[cum.length - 1] || 1
  // least squares: B(t) = base(t) + α·(3t(1-t)²)·t0 − β·(3t²(1-t))·t3  ⇒  2×2 normal eqs
  let Saa = 0, Sab = 0, Sbb = 0, Sar = 0, Sbr = 0
  for (let i = a + 1; i < b; i++) {
    const t = cum[i - a] / total, u = 1 - t
    const w0 = u * u * u + 3 * t * u * u, w3 = 3 * t * t * u + t * t * t
    const rx = P[i].x - (w0 * P0.x + w3 * P3.x), rz = P[i].z - (w0 * P0.z + w3 * P3.z)
    const Ai = 3 * t * u * u, Bi = 3 * t * t * u
    const ax = Ai * t0.x, az = Ai * t0.z, bx = -Bi * t3.x, bz = -Bi * t3.z
    Saa += ax * ax + az * az; Sbb += bx * bx + bz * bz; Sab += ax * bx + az * bz
    Sar += ax * rx + az * rz; Sbr += bx * rx + bz * rz
  }
  const det = Saa * Sbb - Sab * Sab
  let alpha, beta
  if (Math.abs(det) < 1e-9) { alpha = beta = chord * 0.33 }
  else { alpha = (Sar * Sbb - Sbr * Sab) / det; beta = (Saa * Sbr - Sab * Sar) / det }
  const lo = chord * 0.05, hi = chord * 0.9       // clamp handles sane-positive (no loops/overshoot)
  alpha = Math.max(lo, Math.min(hi, alpha)); beta = Math.max(lo, Math.min(hi, beta))
  const c1 = { x: P0.x + t0.x * alpha, z: P0.z + t0.z * alpha }
  const c2 = { x: P3.x - t3.x * beta,  z: P3.z - t3.z * beta }
  let dev = 0, worst = a + 1                       // `worst` = the vertex that rides furthest off → the SPLIT point
  for (let i = a + 1; i < b; i++) { let m = Infinity; for (let s = 0; s <= 24; s++) { const q = bez(P0, c1, c2, P3, s / 24); const d = Math.hypot(P[i].x - q.x, P[i].z - q.z); if (d < m) m = d } if (m > dev) { dev = m; worst = i } }
  return { c1, c2, dev, worst }
}
// ⚠️ `dev` is ONE-SIDED — it measures each sample's distance TO the curve, so a cubic may HOOK
// between samples and still score dev≈0: a tight mid-curve kink the eye reads as a defect
// (found on a ramp + Oak Knoll Park, 2026-07-22 — 28° across ~1 m, R≈2 m, 25 m from any control
// vertex). So ALSO cap local curvature: the minimum radius the fitted cubic ever reaches.
// Analytic (κ = |B'×B''| / |B'|³) so the test can't be fooled by sample spacing.
// A cusp (|B'|→0) reads as infinite curvature → rejected. Law 2 in curvature form: never
// invent a bend tighter than a street actually turns. Turning circles are NOT affected —
// closed loops go through fitClosedLoopCircle, a separate path.
function minFitRadius(P0, c1, c2, P3) {
  // Sample ~1 m apart (control-polygon length as the proxy) — a fixed sample count spaces out
  // on a long chain and steps clean OVER a narrow curvature spike, which is exactly the
  // artifact this guards (Broadview: R≈1.4 m missed at 33 samples).
  const approxLen = Math.hypot(c1.x - P0.x, c1.z - P0.z) + Math.hypot(c2.x - c1.x, c2.z - c1.z) + Math.hypot(P3.x - c2.x, P3.z - c2.z)
  const N = Math.max(32, Math.min(256, Math.ceil(approxLen)))
  let minR = Infinity
  for (let s = 0; s <= N; s++) {
    const t = s / N, u = 1 - t
    const dx = 3 * u * u * (c1.x - P0.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (P3.x - c2.x)
    const dz = 3 * u * u * (c1.z - P0.z) + 6 * u * t * (c2.z - c1.z) + 3 * t * t * (P3.z - c2.z)
    const ddx = 6 * u * (c2.x - 2 * c1.x + P0.x) + 6 * t * (P3.x - 2 * c2.x + c1.x)
    const ddz = 6 * u * (c2.z - 2 * c1.z + P0.z) + 6 * t * (P3.z - 2 * c2.z + c1.z)
    const speed = Math.hypot(dx, dz)
    if (speed < 1e-6) return 0                     // cusp — infinitely tight
    const cross = Math.abs(dx * ddz - dz * ddx)
    if (cross < 1e-12) continue                    // locally straight — infinite radius
    const R = (speed * speed * speed) / cross
    if (R < minR) minR = R
  }
  return minR
}
// Fit cluster P[a..b] as ONE cubic; if a single cubic can't RIDE it (dev > CURVE_DEV_TOL —
// a long sweep like Brookings' 261° or Tuscany's 98° tail), SPLIT at the worst-riding vertex
// and recurse (Schneider-style), joining the halves C1 through the local chain tangent so the
// pieces meet smoothly — one curve to the eye, no seam. This is the handoff's spec'd "if a
// single cubic can't, split into 2 (biarc-style)". Returns the pieces in order
// ({ end, c1, c2 }, each a bezier ENDING at vertex `end`), or null if even splitting can't
// ride it → the caller keeps lines (Law 2: never pull the curve off the road).
function fitClusterSplit(P, a, b, t0, t3, depth) {
  const fit = fitClusterHandles(P, a, b, t0, t3)
  if (fit && fit.dev <= CURVE_DEV_TOL && minFitRadius(P[a], fit.c1, fit.c2, P[b]) >= CURVE_MIN_RADIUS) {
    return [{ end: b, c1: fit.c1, c2: fit.c2 }]
  }
  if (depth >= CURVE_SPLIT_DEPTH || b - a < 2) return null
  const m = fit ? fit.worst : (a + b) >> 1
  if (m <= a || m >= b) return null
  const dx = P[m + 1].x - P[m - 1].x, dz = P[m + 1].z - P[m - 1].z   // local tangent AT the split → C1 join
  const L = Math.hypot(dx, dz) || 1
  const tm = { x: dx / L, z: dz / L }
  const head = fitClusterSplit(P, a, m, t0, tm, depth + 1); if (!head) return null
  const tail = fitClusterSplit(P, m, b, tm, t3, depth + 1); if (!tail) return null
  return head.concat(tail)
}
// Replace each tightly-packed CURVE CLUSTER (a run of SHORT segments that turns) with ONE
// cubic-bezier SEGMENT and DROP its interior points; keep STRAIGHT LEGS and sharp corners
// as LINE segments with their vertices. Returns { points: sparse control vertices,
// segments: one per consecutive pair ({type:'line'} | {type:'bezier',c1,c2}) }, or
// { points, segments: null } when the chain has no genuine curve → caller omits the field
// → byte-identical (grid-safe). The smoothness lives in the curve, not point density.
function curveFitSegments(points, pinned) {
  const n = points.length
  if (n < 3) return { points, segments: null }
  const segLen = (i) => Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z)
  const dir = (i, j) => { const dx = points[j].x - points[i].x, dz = points[j].z - points[i].z; const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L } }
  const turnAt = (i) => {
    const A = points[i - 1], V = points[i], B = points[i + 1]
    const ix = V.x - A.x, iz = V.z - A.z, ox = B.x - V.x, oz = B.z - V.z
    const li = Math.hypot(ix, iz) || 1, lo = Math.hypot(ox, oz) || 1
    return Math.acos(Math.max(-1, Math.min(1, (ix * ox + iz * oz) / (li * lo))))
  }
  const hardV = (i) => i === 0 || i === n - 1 || (pinned && pinned.has(vKey(points[i]))) || turnAt(i) >= CURVE_HARD_TURN
  const outPts = [points[0]]
  const segs = []
  let any = false, i = 0
  while (i < n - 1) {
    // a cluster begins at i if segment i is SHORT and vertex i isn't a hard corner-break
    if (segLen(i) < CURVE_SEG_MAX && !(i > 0 && hardV(i))) {
      let j = i + 1
      while (j < n - 1 && segLen(j) < CURVE_SEG_MAX && !hardV(j)) j++   // extend over short segs, stop at a long leg / hard vertex
      let tot = 0; for (let k = i + 1; k < j; k++) tot += turnAt(k)     // does the cluster actually turn?
      if (j > i + 1 && tot >= CURVE_MIN_TURN) {
        const t0 = i > 0 ? dir(i - 1, i) : dir(i, i + 1)                // tangents = bounding leg directions → tangential join
        const t3 = j < n - 1 ? dir(j, j + 1) : dir(j - 1, j)
        const pieces = fitClusterSplit(points, i, j, t0, t3, 0)   // ONE cubic when it rides; SPLIT when it can't
        if (pieces) {
          for (const g of pieces) { outPts.push(points[g.end]); segs.push({ type: 'bezier', c1: g.c1, c2: g.c2 }) }
          any = true; i = j; continue
        }
      }
    }
    outPts.push(points[i + 1]); segs.push({ type: 'line' }); i++        // straight / non-curving / un-fittable → keep verbatim
  }
  if (!any) return { points, segments: null }
  return { points: outPts, segments: segs }
}
// Reverse a segments array (and swap each bezier's handles) to match a reversed points array.
function reverseSegments(segs) {
  return segs.slice().reverse().map(g => g.type === 'bezier' ? { type: 'bezier', c1: g.c2, c2: g.c1 } : g)
}
// Solve a 3×3 linear system (Gaussian elim w/ partial pivot). Returns [x,y,z] or null if singular.
function solve3(A, B) {
  const M = A.map((r, i) => [...r, B[i]])
  for (let c = 0; c < 3; c++) {
    let pv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r
    if (Math.abs(M[pv][c]) < 1e-12) return null
    ;[M[c], M[pv]] = [M[pv], M[c]]
    for (let r = 0; r < 3; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k] }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]
}
// ── Closed-loop CIRCLE fit (v2 step (a): turning circles — SV, Park Place) ──
// A turning-circle bulb is a CLOSED ring that is, to within ~2 cm, a perfect
// CIRCLE (R≈8 m). curveFitSegments can't fit it — it pins the seam vertex
// (0 / n-1) as a hard corner so the ring never closes smoothly — which is why
// v1 EXCLUDED closed loops and they render as faceted ~19-gons (HANDOFF §v2).
// Here we fit the circle (Kåsa) and emit it as cubic-bezier ARCS (≤90° each,
// the classic 4/3·tan(δ/4) handle length) BETWEEN the ring's PINNED vertices —
// the weld (index 0) + every stem-junction coord (∈ pinnedKeys) — kept at their
// EXACT original positions so the stem welds + the emergent island face are
// preserved unchanged, only smoother (v2 SCOPE constraint). Returns
// { points, segments } (all bezier, closed: last===first) or null when the ring
// isn't circular enough — teardrops/couplets (Benton 73%, Waverly 52%) fall
// through to the legacy faceted path, which already reads clean.
function fitClosedLoopCircle(points, pinnedKeys) {
  const n = points.length
  if (n < 6) return null
  if (Math.hypot(points[0].x - points[n - 1].x, points[0].z - points[n - 1].z) >= 1.0) return null
  const ring = points.slice(0, n - 1)                       // distinct loop nodes (drop duplicate closing vertex)
  const m = ring.length
  let Sx = 0, Sz = 0, Sxx = 0, Szz = 0, Sxz = 0, Sxw = 0, Szw = 0, Sw = 0
  for (const p of ring) { const w = p.x * p.x + p.z * p.z; Sx += p.x; Sz += p.z; Sxx += p.x * p.x; Szz += p.z * p.z; Sxz += p.x * p.z; Sxw += p.x * w; Szw += p.z * w; Sw += w }
  const sol = solve3([[Sxx, Sxz, Sx], [Sxz, Szz, Sz], [Sx, Sz, m]], [-Sxw, -Szw, -Sw])
  if (!sol) return null
  const cx = -sol[0] / 2, cz = -sol[1] / 2, R2 = cx * cx + cz * cz - sol[2]
  if (!(R2 > 1)) return null
  const R = Math.sqrt(R2)
  let maxRes = 0; for (const p of ring) { const d = Math.abs(Math.hypot(p.x - cx, p.z - cz) - R); if (d > maxRes) maxRes = d }
  if (maxRes / R > CURVE_LOOP_CIRCLE_TOL) return fitClosedLoopBezier(ring, pinnedKeys)  // v2 step (b): not a circle (teardrop/couplet) → general bezier fit
  let area = 0; for (let i = 0; i < m; i++) { const p = ring[i], q = ring[(i + 1) % m]; area += p.x * q.z - q.x * p.z }
  const wnd = area >= 0 ? 1 : -1                             // ring winding: +1 CCW, -1 CW (preserve traversal direction)
  const TWO_PI = Math.PI * 2
  const ang = (p) => Math.atan2(p.z - cz, p.x - cx)
  const circlePt = (phi) => ({ x: cx + R * Math.cos(phi), z: cz + R * Math.sin(phi) })
  const pinned = [0]                                         // weld anchor + junctions, in ring order
  for (let i = 1; i < m; i++) if (pinnedKeys && pinnedKeys.has(vKey(ring[i]))) pinned.push(i)
  const outPts = [ring[pinned[0]]]
  const segs = []
  for (let k = 0; k < pinned.length; k++) {
    const aV = ring[pinned[k]], bV = ring[pinned[(k + 1) % pinned.length]]
    const ta = ang(aV), tb = ang(bV)
    let delta = (wnd * (tb - ta)) % TWO_PI; if (delta <= 1e-6) delta += TWO_PI   // single pinned / coincident → full circle
    const nSeg = Math.max(1, Math.ceil(delta / (Math.PI / 2) - 1e-9))            // ≤90° per cubic arc
    const d = delta / nSeg, h = R * (4 / 3) * Math.tan(d / 4)
    for (let j = 0; j < nSeg; j++) {
      const phi0 = ta + wnd * d * j, phi1 = ta + wnd * d * (j + 1)
      const start = j === 0 ? aV : circlePt(phi0)
      const end   = j === nSeg - 1 ? bV : circlePt(phi1)
      const t0 = { x: -wnd * Math.sin(phi0), z: wnd * Math.cos(phi0) }
      const t1 = { x: -wnd * Math.sin(phi1), z: wnd * Math.cos(phi1) }
      outPts.push(end)
      segs.push({ type: 'bezier', c1: { x: start.x + t0.x * h, z: start.z + t0.z * h }, c2: { x: end.x - t1.x * h, z: end.z - t1.z * h } })
    }
  }
  return { points: outPts, segments: segs }                 // closed: outPts[last] === ring[pinned[0]] === outPts[0]
}
// ── Closed-loop GENERAL bezier fit (v2 step (b): non-circular loops — Benton
// teardrop, Waverly couplet) ──────────────────────────────────────────────
// The circle fit rejects these (a teardrop is not a circle). Instead of leaving
// them faceted, fit each sub-arc BETWEEN the ring's PINNED vertices (weld index 0
// + every stem-junction ∈ pinnedKeys) as general cubic beziers, reusing the SAME
// open-chain Schneider fitter (fitClusterSplit) the straight streets use. The
// pinned vertices are kept EXACT (the emergent island face + stem weld are
// preserved unchanged — the v2 SCOPE constraint); only the body between them
// smooths, and a real corner survives at any pin where the two sides diverge (a
// teardrop keeps its point at the stem joint). A sub-arc a single/split cubic
// can't RIDE stays faceted (lines) for that arc only — never pull the curve off
// the road (Law 2). Returns { points, segments } (closed) or null if nothing
// smoothed (caller keeps the faceted path).
function fitClosedLoopBezier(ring, pinnedKeys) {
  const m = ring.length
  if (m < 6) return null
  const dir = (p, q) => { const dx = q.x - p.x, dz = q.z - p.z; const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L } }
  const pinned = [0]                                        // weld anchor + junctions, in ring order
  for (let i = 1; i < m; i++) if (pinnedKeys && pinnedKeys.has(vKey(ring[i]))) pinned.push(i)
  const outPts = [ring[pinned[0]]]
  const segs = []
  let anyBezier = false
  for (let k = 0; k < pinned.length; k++) {
    const aIdx = pinned[k], bIdx = pinned[(k + 1) % pinned.length]
    const sub = [ring[aIdx]]                                // the wrapping sub-arc aIdx..bIdx (full ring when single-pinned)
    let idx = aIdx
    do { idx = (idx + 1) % m; sub.push(ring[idx]) } while (idx !== bIdx)
    if (sub.length < 2) continue
    let tot = 0                                             // does the sub-arc actually turn?
    for (let i = 1; i < sub.length - 1; i++) { const A = sub[i - 1], V = sub[i], B = sub[i + 1]; const ix = V.x - A.x, iz = V.z - A.z, ox = B.x - V.x, oz = B.z - V.z; tot += Math.acos(Math.max(-1, Math.min(1, (ix * ox + iz * oz) / ((Math.hypot(ix, iz) || 1) * (Math.hypot(ox, oz) || 1))))) }
    const t0 = dir(sub[0], sub[1]), t3 = dir(sub[sub.length - 2], sub[sub.length - 1])
    const pieces = (sub.length > 2 && tot >= CURVE_MIN_TURN) ? fitClusterSplit(sub, 0, sub.length - 1, t0, t3, 0) : null
    if (pieces) {
      for (const g of pieces) { outPts.push(sub[g.end]); segs.push({ type: 'bezier', c1: g.c1, c2: g.c2 }) }
      anyBezier = true
    } else {
      for (let i = 1; i < sub.length; i++) { outPts.push(sub[i]); segs.push({ type: 'line' }) }   // un-fittable arc → keep faceted
    }
  }
  if (!anyBezier) return null
  return { points: outPts, segments: segs }
}
// Split the bezier segment nearest `coord` via de Casteljau so `coord`'s on-curve point
// becomes a shared, C1-continuous control vertex — used to cut a through-road's ONE fitted
// curve back into its named chains at a name-transition seam without re-introducing a kink
// (the West-18th↔Dolman mid-curve split). If the seam already sits on a clean vertex
// (straight-region seam) it splits there with no bezier change. Mutates pts/segs; returns
// the index in pts of the (possibly newly-inserted) seam vertex.
function splitAtSeamCoord(pts, segs, coord) {
  let best = -1, bd = Infinity
  for (let k = 0; k < pts.length; k++) { const d = Math.hypot(pts[k].x - coord.x, pts[k].z - coord.z); if (d < bd) { bd = d; best = k } }
  if (bd < 0.05) return best                                           // clean vertex (straight-region seam) → cut here
  let segIdx = -1, segT = 0, segD = Infinity                           // else find the bezier passing closest + its parameter
  for (let m = 0; m < segs.length; m++) {
    if (segs[m].type !== 'bezier') continue
    const P0 = pts[m], P3 = pts[m + 1], { c1, c2 } = segs[m]
    let bt = 0, bdd = Infinity
    for (let s = 0; s <= 60; s++) { const t = s / 60; const q = bez(P0, c1, c2, P3, t); const d = Math.hypot(q.x - coord.x, q.z - coord.z); if (d < bdd) { bdd = d; bt = t } }
    let lo = Math.max(0, bt - 1 / 60), hi = Math.min(1, bt + 1 / 60)   // ternary-refine
    for (let it = 0; it < 24; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; const q1 = bez(P0, c1, c2, P3, m1), q2 = bez(P0, c1, c2, P3, m2); (Math.hypot(q1.x - coord.x, q1.z - coord.z) < Math.hypot(q2.x - coord.x, q2.z - coord.z)) ? hi = m2 : lo = m1 }
    const t = (lo + hi) / 2, q = bez(P0, c1, c2, P3, t), d = Math.hypot(q.x - coord.x, q.z - coord.z)
    if (d < segD) { segD = d; segIdx = m; segT = t }
  }
  if (segIdx < 0) return best                                          // no bezier (shouldn't happen) → nearest vertex
  const P0 = pts[segIdx], P3 = pts[segIdx + 1], { c1, c2 } = segs[segIdx], t = segT
  const A = lerpPt(P0, c1, t), B = lerpPt(c1, c2, t), C = lerpPt(c2, P3, t)
  const D = lerpPt(A, B, t), E = lerpPt(B, C, t), F = lerpPt(D, E, t)  // F = on-curve seam point, shared by both halves
  pts.splice(segIdx + 1, 0, F)
  segs.splice(segIdx, 1, { type: 'bezier', c1: A, c2: D }, { type: 'bezier', c1: E, c2: C })
  return segIdx + 1
}

// --- Standards-seeded cross-section (OSM-FORENSICS.md Part 4) --------------
// Default/prior cross-section per street class. NACTO-by-class for the
// pedestrian-zone dims + curb-return R (the 2026-06-01 decision: tight
// pedestrian-scale radii are honest to LS; AASHTO truck radii deferred [U]).
// width has 0% OSM coverage at LS, so it MUST be seeded from lanes; sidewalk
// is too sparse (4/333) to trust, so PROWAG-seed it. The operator overrides
// only genuine exceptions (the north-star). Values in meters (ft × 0.3048).
const FT = 0.3048
const STD_SECTION = {
  residential: { lane: 10 * FT, parking: 8 * FT, sidewalk: 5 * FT, treelawn: 5 * FT, curb: 0.15, cornerR: 4.5 },
  unclassified:{ lane: 10 * FT, parking: 8 * FT, sidewalk: 5 * FT, treelawn: 5 * FT, curb: 0.15, cornerR: 4.5 },
  tertiary:    { lane: 10 * FT, parking: 8 * FT, sidewalk: 6 * FT, treelawn: 4 * FT, curb: 0.15, cornerR: 5.0 },
  secondary:   { lane: 11 * FT, parking: 8 * FT, sidewalk: 6 * FT, treelawn: 4 * FT, curb: 0.15, cornerR: 6.0 },
  primary:     { lane: 11 * FT, parking: 0,      sidewalk: 8 * FT, treelawn: 4 * FT, curb: 0.15, cornerR: 7.5 },
}
function seedSection(highway, lanes, oneway) {
  const base = highway && highway.replace(/_link$/, '')
  const cls = STD_SECTION[base] ? base : 'residential'
  const s = STD_SECTION[cls]
  const nLanes = Number.isFinite(lanes) && lanes > 0 ? lanes : (oneway ? 1 : 2)
  // curb-to-curb carriageway: lanes + on-street parking (residential only)
  const carriage = nLanes * s.lane + (cls === 'residential' || cls === 'unclassified' ? 2 * s.parking : 0)
  const pavementHW = +(carriage / 2).toFixed(2)
  return {
    seededClass: cls,
    lanesAssumed: nLanes,
    pavementHW,                         // curb-to-curb half width (width residual — 0% OSM)
    curb: s.curb,
    treelawn: +s.treelawn.toFixed(2),   // PROWAG/NACTO furnishing zone (absent in OSM)
    sidewalk: +s.sidewalk.toFixed(2),   // PROWAG min (sparse in OSM)
    cornerR: s.cornerR,                 // NACTO-by-class curb-return radius
    rowHalf: +(pavementHW + s.curb + s.treelawn + s.sidewalk).toFixed(2),
  }
}

// --- Grade separation: carry layer/bridge/tunnel per chain (Part 2) -------
// OSM marks elevated/buried roadway with `bridge`/`tunnel` and a signed
// `layer`. fetch.js carries every tag verbatim, so these arrive on each source
// way's tags. The *visible* degenerate polygons (interchange triangles,
// slivers, false blocks) come from grade-separated centerlines that cross in
// 2D WITHOUT sharing a vertex — the planar face walk (`tileGround.extractFaces`)
// has no node there, so the crossing edge bowties the faces. We can't detect
// that at the junction graph (it is shared-vertex only — verified: 0 false
// junctions), so we instead mark each chain with the grade facts + an operative
// `gradeSeparated` flag a face consumer reads to EXCLUDE it from ground-face
// formation. (Measured on LS: 29 such crossings; every one has a limited-access
// road on at least one side, so the flag below clears all 29 — see
// HANDOFF-onframe-faces-brief.md for the extractFaces filter recipe.)
//
// WAY_TAGS_BY_ID maps osmId → tags so a welded chain (which may span several
// source ways) can be summarized from ALL its sources, not just fragment[0].
// WAY_LEN_BY_ID maps osmId → polyline length (m) for length-weighted summaries
// (chainHighway's class vote).
let WAY_TAGS_BY_ID = new Map()
let WAY_LEN_BY_ID = new Map()

// Limited-access highway corridors abut frontage roads, never bound
// neighborhood blocks — so they are excluded from ground faces regardless of
// grade (an at-grade motorway segment still crosses elevated ramps at the
// interchange). Class fact, kept here so the operative flag is self-contained.
const LIMITED_ACCESS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])

// Summarize bridge/tunnel/layer over all of a chain's source ways.
//   bridge/tunnel — true if ANY source way is one (a chain can be part bridge,
//     e.g. Mississippi Ave crossing the freeway: mostly at grade, one bridge way)
//   layer         — the largest-magnitude signed layer among sources (0 = grade)
//   entirelyOffGrade — every source way is bridge/tunnel/layer≠0 (a ramp or an
//     elevated motorway segment): the chain touches no ground here.
function gradeFacts(sources) {
  let bridge = false, tunnel = false, layer = 0, n = 0, offGrade = 0
  for (const id of sources || []) {
    const t = WAY_TAGS_BY_ID.get(id)
    if (!t) continue
    n++
    const b = !!t.bridge && t.bridge !== 'no'
    const tu = !!t.tunnel && t.tunnel !== 'no'
    const Lraw = t.layer !== undefined ? parseInt(t.layer, 10) : 0
    const L = Number.isFinite(Lraw) ? Lraw : 0
    if (b) bridge = true
    if (tu) tunnel = true
    if (Math.abs(L) > Math.abs(layer)) layer = L
    if (b || tu || L !== 0) offGrade++
  }
  return { bridge, tunnel, layer, entirelyOffGrade: n > 0 && offGrade === n }
}

// The OPERATIVE "exclude from ground-face formation" flag a face consumer
// (extractFaces) reads: a road that does NOT bound neighborhood blocks —
// elevated/buried along its whole length OR a limited-access corridor. Carried
// alongside the raw facts (layer/bridge/tunnel) so a finer downstream rule can
// refine if ever needed; the basic filter is just `!s.gradeSeparated`.
function gradeFields(highway, sources) {
  const f = gradeFacts(sources)
  return {
    layer: f.layer,
    bridge: f.bridge,
    tunnel: f.tunnel,
    gradeSeparated: f.entirelyOffGrade || LIMITED_ACCESS.has(highway),
  }
}

// [E1] Per-chain lanes vote across all source ways (same WAY_TAGS_BY_ID
// pattern as gradeFacts). Mode wins; ties go to the larger count; falls back
// to the group's first-fragment tag (the old behavior) when no source carries
// a usable lanes value.
function chainLanes(sources, sourceTags) {
  const votes = new Map()
  for (const id of sources || []) {
    const n = parseInt(WAY_TAGS_BY_ID.get(id)?.lanes, 10)
    if (Number.isFinite(n) && n > 0) votes.set(n, (votes.get(n) || 0) + 1)
  }
  let best = 0, bestCount = 0
  for (const [n, c] of votes) {
    if (c > bestCount || (c === bestCount && n > best)) { best = n; bestCount = c }
  }
  if (bestCount > 0) return best
  return parseInt(sourceTags?.lanes, 10)
}

// Per-chain dominant highway CLASS across all source ways (same WAY_TAGS_BY_ID
// pattern as chainLanes; the same first-fragment flattening the D6 comment
// fixed for `oneway` was still live for `highway` — the whole name group got
// fragments[0]'s class, so South 18th's motorway_link ramp and service drive
// were stamped 'residential', which also defeated gradeSeparated for named
// ramps: isLimitedAccess saw 'residential', not 'motorway_link'). The vote is
// LENGTH-weighted (class is a physical-majority question — count-mode let a
// 42 m primary stub at the Jefferson junction outvote 54 m of residential
// Geyer); ties go to the higher-rank class; falls back to the group's
// first-fragment tag (the old behavior) when no source carries a class.
const CLASS_RANK = [
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified',
  'residential', 'living_street', 'service', 'pedestrian', 'footway',
  'cycleway', 'path', 'steps', 'track',
]
function chainHighway(sources, sourceTags) {
  const votes = new Map()
  for (const id of sources || []) {
    const h = WAY_TAGS_BY_ID.get(id)?.highway
    if (h) votes.set(h, (votes.get(h) || 0) + (WAY_LEN_BY_ID.get(id) || 1))
  }
  let best = null, bestLen = 0
  const rank = (x) => { const r = CLASS_RANK.indexOf(x); return r === -1 ? CLASS_RANK.length : r }
  for (const [h, L] of votes) {
    if (L > bestLen || (L === bestLen && best !== null && rank(h) < rank(best))) {
      best = h; bestLen = L
    }
  }
  return best || sourceTags?.highway || 'residential'
}

// ── [E1] Custom width base — survey.json → per-side seed enrichment ───────
//
// raw/survey.json is the CUSTOM width source (a kit input: operator-supplied
// where a place has one; LS: 61/68 streets measured). Its semantics, per its
// generator (survey.js): `sidewalkLeft/Right` = centerline → SIDEWALK
// CENTERLINE on that side — i.e. where the BLOCK EDGE goes (back-of-sidewalk
// = swDist + SV_SIDEWALK/2); `pavementHalfWidth` = their average; `rowWidth`
// = assessor ROW. It is NOT an asphalt half-width — the asphalt is
// lanes-driven (seedSection). Feeding the survey float in as asphalt is the
// block-edge/asphalt conflation that flooded streets out to their sidewalks
// (E1 forensics; streetProfiles.defaultSideMeasure carries that legacy).
//
// Width-sourcing priority, per QUANTITY (custom → OSM → AASHTO):
//   block edge / ped section — survey sidewalk position → AASHTO defaults
//   asphalt                  — OSM lanes → AASHTO assumption, CLAMPED so it
//                              never crosses a survey-pinned sidewalk (the
//                              impossible-road guard, D1's reclaim spirit)
//
// ⚠ Side identity: survey's sidewalkLeft/Right keys are point-order-relative
// to the ORIGINAL OSM segment directions, aggregated per name — they survive
// neither welding nor the canonical-direction flip (the persisted-side-key
// class; see the perp-side convention note in tileGround.js:347). So the
// VALUES are taken as name-keyed survey facts, but WHICH physical side each
// lands on is re-resolved per chain from current geometry on every bake
// (parallel-sidewalk perp test below; measure-RIGHT = (-dz,dx) of
// point-order-forward — production's right-perp convention). Reversal-proof
// by construction.

function loadSurveyStreets() {
  const p = join(RAW_DIR, 'survey.json')
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf8')).streets || {} } catch { return {} }
}

// Min perpendicular distance from a chain to roughly-parallel OSM sidewalks,
// per physical side of the chain's CURRENT point order. Mirrors survey.js's
// measurement (parallel within ~30°, alongside the edge, 2–20 m window) but
// runs per chain edge so welded/curved chains bin honestly.
function chainSidewalkDistances(points, sidewalks) {
  let minLeft = null, minRight = null
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1]
    const dx = b.x - a.x, dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < 10) continue
    // measure-RIGHT = (-dz, dx) of point-order-forward (production right-perp).
    const nx = -dz / len, nz = dx / len
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2
    for (const sw of sidewalks) {
      const sc = sw.coords
      if (!sc || sc.length < 2) continue
      const sdx = sc[sc.length - 1].x - sc[0].x, sdz = sc[sc.length - 1].z - sc[0].z
      const slen = Math.hypot(sdx, sdz)
      if (slen < 3) continue
      const dot = Math.abs(dx * sdx + dz * sdz) / (len * slen)
      if (dot < 0.85) continue                   // parallel within ~30° only
      const smx = (sc[0].x + sc[sc.length - 1].x) / 2
      const smz = (sc[0].z + sc[sc.length - 1].z) / 2
      const along = ((smx - mx) * dx + (smz - mz) * dz) / len
      if (Math.abs(along) > len / 2 + 10) continue
      const perp = (smx - mx) * nx + (smz - mz) * nz
      const d = Math.abs(perp)
      if (d <= 2 || d >= 20) continue
      if (perp > 0) { if (minRight == null || d < minRight) minRight = d }
      else { if (minLeft == null || d < minLeft) minLeft = d }
    }
  }
  return { minLeft, minRight }
}

// Stamp seed.left/right (+ widthSource) on every named street with survey
// data. Runs AFTER the canonical-direction pass — side identity must be
// resolved against final point order. Divided carriageways get the same
// name-keyed treatment (the brief's propagation requirement); whichever
// values land on their median-facing side are zeroed downstream by
// derive.js's inner-edge normalization (innerEdgeAssign), so only the outer
// assignment is load-bearing there.
// [Benton guard] Sanity floor for the CUSTOM width tier. The narrowest
// functioning street is ~1.5 standard 10-ft lanes curb-to-curb (a NACTO
// yield/alley street, ~4.6 m). A custom datum that would clamp the asphalt
// below HALF of that is bad data, not a narrow street — Benton's assessor
// `rowWidth: 4` (a real loop ROW is ~12–18 m; the loop body collapsed to
// pavementHW 0.5) and Park Ave's contaminated `sidewalkLeft: 2.99` are the
// class. The datum (not the street) is rejected, so the side falls back to
// the next width tier (OSM lanes → AASHTO seed) — the custom→OSM→AASHTO
// ladder just skips a rung that fails physics. Deliberately ABSOLUTE, not
// lanes-scaled: OSM `lanes` is itself often inflated (S Jefferson tags 7,
// S 18th 4), and a lanes-scaled floor would reject those streets' plausible
// survey clamps along with the garbage.
const MIN_CUSTOM_PAV_HW = 1.5 * 10 * FT / 2   // 2.29 m asphalt half-width
// And the symmetric LARGE bound: the implied TREELAWN (curb → walk gap, after
// the asphalt takes its lanes/AASHTO seed) can't exceed ~6 m — even a grand
// avenue's furnishing zone tops out around 15–20 ft. More grass than that
// means the survey matched a FOREIGN sidewalk (across a median — Waverly's
// 12.8 is the far carriageway's walk; a parking lot — Gratiot's 16), not this
// street's. Seed-relative on purpose: a 14 m datum is honest on 6-lane Tucker
// (treelawn 3.1) and garbage on 1-lane Waverly (treelawn 7.9).
const MAX_CUSTOM_TREELAWN = 6
// `maxPav` = the street's most generous lanes/AASHTO asphalt half-width over
// ALL its same-name chains — NOT the current chain's. A divided corridor's
// carriageway fragment can seed 1 lane (pav 1.68) while the corridor's outer
// walk honestly sits 9–12 m out (Russell 8.74, Chouteau 10.02); judging that
// datum against the fragment's own seed would reject real data. The name is
// the survey's key, so the name's best lane evidence is the fair yardstick.
const plausibleSwDist = (maxPav, swDist) => {
  const room = swDist - SV_SIDEWALK / 2 - CURB_WIDTH
  if (room < MIN_CUSTOM_PAV_HW) return false
  return room - Math.min(maxPav, room) <= MAX_CUSTOM_TREELAWN
}
const plausibleRowHalf = (maxPav, rowHalf) => {
  const room = rowHalf - SV_SIDEWALK - CURB_WIDTH
  if (room < MIN_CUSTOM_PAV_HW) return false
  return room - Math.min(maxPav, room) <= MAX_CUSTOM_TREELAWN
}

function stampCustomWidths(streets, survey, sidewalks) {
  // One survey side, from a sidewalk-centerline distance. The block edge is
  // the back of sidewalk; treelawn is the natural gap; the asphalt keeps its
  // lanes/AASHTO seed unless that would cross the sidewalk.
  const fromSurveyDist = (seed, swDist) => {
    const swInner = swDist - SV_SIDEWALK / 2
    const pav = Math.min(seed.pavementHW, Math.max(0.5, swInner - CURB_WIDTH))
    const treelawn = Math.max(0, swInner - (pav + CURB_WIDTH))
    return {
      pavementHW: +pav.toFixed(2),
      treelawn: +treelawn.toFixed(2),
      sidewalk: +SV_SIDEWALK.toFixed(2),
      blockEdgeHW: +(swDist + SV_SIDEWALK / 2).toFixed(2),
      source: 'survey',
    }
  }
  // Assessor tier: ROW/2 IS the block edge; work the ped section back from it.
  const fromRowHalf = (seed, rowHalf) => {
    const pav = Math.min(seed.pavementHW, Math.max(0.5, rowHalf - CURB_WIDTH - SV_SIDEWALK))
    const treelawn = Math.max(0, rowHalf - SV_SIDEWALK - (pav + CURB_WIDTH))
    return {
      pavementHW: +pav.toFixed(2),
      treelawn: +treelawn.toFixed(2),
      sidewalk: +SV_SIDEWALK.toFixed(2),
      blockEdgeHW: +rowHalf.toFixed(2),
      source: 'survey-row',
    }
  }
  // No survey datum on this side — AASHTO seed stands (measure construction
  // downstream may render it as lawn when the other side IS surveyed: the
  // park-edge asymmetry).
  const standardSide = (seed) => ({
    pavementHW: seed.pavementHW,
    treelawn: seed.treelawn,
    sidewalk: seed.sidewalk,
    source: 'standard',
  })

  let stamped = 0, geomSided = 0, symmetricFallback = 0, rowTier = 0
  const rejected = []   // [Benton guard] rejected datum log: `${name} ${tier} ${value}`
  // [Benton guard] name-level max seed asphalt (see plausibleSwDist header)
  const nameMaxPav = new Map()
  for (const s of streets) {
    if (!s.seed || !s.name) continue
    nameMaxPav.set(s.name, Math.max(nameMaxPav.get(s.name) || 0, s.seed.pavementHW || 0))
  }
  for (const s of streets) {
    if (!s.seed || !s.name) continue
    const sv = survey[s.name]
    if (!sv) continue
    // [Benton guard] drop implausibly-small custom data BEFORE tier selection:
    // a rejected sidewalk datum demotes the street to single-sided (park-edge
    // handling) or, with none left, to the assessor-row tier; a rejected
    // rowWidth falls through to the AASHTO seed (`continue` below).
    const maxPav = nameMaxPav.get(s.name) || s.seed.pavementHW || 0
    const svValsRaw = [sv.sidewalkLeft, sv.sidewalkRight].filter(Number.isFinite)
    const svVals = svValsRaw.filter(v => plausibleSwDist(maxPav, v))
    for (const v of svValsRaw) if (!plausibleSwDist(maxPav, v)) rejected.push(`${s.name} sidewalk ${v}`)
    const rowHalfOk = Number.isFinite(sv.rowWidth) && plausibleRowHalf(maxPav, sv.rowWidth / 2)
    if (Number.isFinite(sv.rowWidth) && !rowHalfOk) rejected.push(`${s.name} rowWidth ${sv.rowWidth}`)
    let left = null, right = null
    if (svVals.length) {
      const { minLeft, minRight } = chainSidewalkDistances(s.points, sidewalks)
      if (svVals.length === 2) {
        const [vA, vB] = svVals
        if (minLeft != null && minRight != null) {
          // Both sides geometrically evidenced → the pairing that best
          // matches the chain's OWN measured distances wins (not near-rank:
          // a name-aggregated survey value contaminated from another chain —
          // e.g. a median-side path on a divided corridor — then lands on
          // the side it actually resembles, which for a carriageway is the
          // median side that innerEdgeAssign zeroes downstream).
          const costAB = Math.abs(minLeft - vA) + Math.abs(minRight - vB)
          const costBA = Math.abs(minLeft - vB) + Math.abs(minRight - vA)
          const [vL, vR] = costAB <= costBA ? [vA, vB] : [vB, vA]
          left = fromSurveyDist(s.seed, vL)
          right = fromSurveyDist(s.seed, vR)
          geomSided++
        } else if (minLeft != null || minRight != null) {
          // one side evidenced → it takes the survey value it best matches
          const d = minLeft != null ? minLeft : minRight
          const detA = Math.abs(d - vA) <= Math.abs(d - vB)
          const detVal = detA ? vA : vB
          const othVal = detA ? vB : vA
          if (minLeft != null) { left = fromSurveyDist(s.seed, detVal); right = fromSurveyDist(s.seed, othVal) }
          else { right = fromSurveyDist(s.seed, detVal); left = fromSurveyDist(s.seed, othVal) }
          geomSided++
        } else {
          // no geometric side evidence → symmetric on the average; never
          // trust the raw L/R labels (direction-mushy, see header note)
          const avg = (vA + vB) / 2
          left = fromSurveyDist(s.seed, avg)
          right = fromSurveyDist(s.seed, avg)
          symmetricFallback++
        }
      } else {
        // single-sided survey (park-edge class) → the geometrically-evidenced
        // side carries it; the other side stays standard (→ lawn downstream)
        const v = svVals[0]
        if (minLeft != null && minRight != null) {
          if (Math.abs(minLeft - v) <= Math.abs(minRight - v)) left = fromSurveyDist(s.seed, v)
          else right = fromSurveyDist(s.seed, v)
          geomSided++
        } else if (minLeft != null) { left = fromSurveyDist(s.seed, v); geomSided++ }
        else if (minRight != null) { right = fromSurveyDist(s.seed, v); geomSided++ }
        else { left = fromSurveyDist(s.seed, v); right = fromSurveyDist(s.seed, v); symmetricFallback++ }
      }
    } else if (rowHalfOk) {
      left = fromRowHalf(s.seed, sv.rowWidth / 2)
      right = fromRowHalf(s.seed, sv.rowWidth / 2)
      rowTier++
    } else {
      // survey source:'default', or every custom datum guard-rejected —
      // not (usable) custom data; the AASHTO seed stands
      continue
    }
    s.seed.left = left || standardSide(s.seed)
    s.seed.right = right || standardSide(s.seed)
    s.seed.widthSource = 'survey'
    stamped++
  }
  console.log(`  custom width base: ${stamped} street(s) seeded from survey.json `
    + `(${geomSided} geometry-sided, ${symmetricFallback} symmetric-fallback, ${rowTier} assessor-row)`)
  if (rejected.length) {
    const uniq = [...new Set(rejected)]
    console.log(`  custom width guard: rejected ${uniq.length} implausible datum(s) `
      + `(asphalt < ${MIN_CUSTOM_PAV_HW.toFixed(2)} m half-width or treelawn > ${MAX_CUSTOM_TREELAWN} m): ${uniq.join(' · ')}`)
  }
}

// --- Node typing: classify every shared coord by graph degree -------------
// degree 1 = dead-end · 2 = through/bend/name-transition · 3 = T · 4 = cross
// · 5+ = Y/complex. The cap decision becomes a NODE FACT (round at a true
// dead-end, butt where the chain joins anything) instead of the downstream
// operator-authored-or-blunt-and-pray guess (OSM-FORENSICS.md Part 1.1).
function buildNodeGraph(streets) {
  const degree = new Map()  // vKey -> incidence count
  const pt = new Map()
  for (const s of streets) {
    const p = s.points
    for (let i = 0; i < p.length; i++) {
      const k = vKey(p[i])
      pt.set(k, { x: p[i].x, z: p[i].z })
      const inc = (i === 0 || i === p.length - 1) ? 1 : 2
      degree.set(k, (degree.get(k) || 0) + inc)
    }
  }
  const kindOf = (d) => d === 1 ? 'deadend' : d === 2 ? 'through' : d === 3 ? 'T' : d === 4 ? 'cross' : 'Y'
  const junctions = []
  for (const [k, d] of degree) {
    if (d === 2) continue // bends/transitions are not junctions
    const p = pt.get(k)
    junctions.push({ x: p.x, z: p.z, degree: d, kind: kindOf(d) })
  }
  return { degree, junctions }
}

// --- Main pipeline --------------------------------------------------------

function main() {
  const osm = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf8'))
  const highways = osm.ground?.highway || []
  console.log(`Input: ${highways.length} highway features`)

  // osmId → tags, so a welded chain can be graded from ALL its source ways
  // (Part 2 grade separation — see gradeFields/gradeFacts above).
  WAY_TAGS_BY_ID = new Map(highways.map(f => [f.osmId, f.tags || {}]))
  WAY_LEN_BY_ID = new Map(highways.map(f => [f.osmId, polylineLengthXZ(f.coords)]))

  const { groups, unnamed } = groupByName(highways)
  console.log(`       ${groups.size} unique names, ${unnamed.length} unnamed`)

  // Node graph over ALL fragments for the split/rejoin trace (gate (c) of the
  // data-first carriageway gates). Built once, threaded to both pairing sites.
  const rejoinAdj = buildRejoinGraph(highways)

  // ── Phase analyzer (Path B, phases 1+2) ───────────────────────────
  // Pre-weld: classify each named OSM fragment as divided-A / divided-B
  // / single-oneway / single-bidi. The signature map then gates welding
  // (phase 2): welds only fuse fragments with matching signatures, so
  // bidi splice bridges can no longer fuse opposing carriageways into
  // one super-chain. Logs decomposition for groups with divided pairs
  // or in the NOTES validation set.
  const VALIDATION_NAMES = new Set(['South Jefferson Avenue', 'Lafayette Avenue'])
  const phaseReports = []
  const signatureByOsmId = new Map()
  const pairKeyByOsmId = new Map()
  const gapByPairKey = new Map()   // pairKey -> carriageway gap (= median width)
  for (const [name, fragments] of groups) {
    if (EXCLUDE_FROM_STREETS.has(name)) continue
    const report = analyzePhases(name, fragments, rejoinAdj)
    phaseReports.push(report)
    for (const c of report.classified) {
      const sig = c.kind === 'divided' ? c.role : c.kind
      signatureByOsmId.set(c.osmId, sig)
      if (c.pairKey) {
        pairKeyByOsmId.set(c.osmId, c.pairKey)
        // The antiparallel-pair gap IS the median width — measured here in
        // analyzePhases and, until now, discarded (Part 2 / Part 1.6).
        if (Number.isFinite(c.gap)) gapByPairKey.set(c.pairKey, +c.gap.toFixed(2))
      }
    }
  }
  console.log('\nPhase analysis (pre-weld):')
  for (const r of phaseReports) {
    const c = r.counts
    if (c.dividedPairs === 0 && !VALIDATION_NAMES.has(r.name)) continue
    console.log(`  ${r.name}: ${c.total} ways → ${c.dividedPairs} divided pair(s), ${c.singleOneway} single-oneway, ${c.singleBidi} bidi`)
  }
  for (const r of phaseReports) {
    if (!VALIDATION_NAMES.has(r.name)) continue
    console.log(`\n  ${r.name} — fragment-level:`)
    for (const c of r.classified) {
      const tag = c.kind === 'divided'
        ? `${c.role} (partner ${c.partner}, gap ${c.gap.toFixed(1)}m)`
        : c.kind
      console.log(`    osm ${c.osmId}  ${tag}`)
    }
  }

  const streets = []

  // Signature → phase (kind, role) mapping. Both single-oneway and
  // single-bidi chains are 'single' phases — they share the spine role.
  // 'divided-A' / 'divided-B' carry through as carriageway-A / -B so
  // the knit step (Phase 5) can pair them.
  const SIG_TO_PHASE = {
    'divided-A':     { kind: 'divided', role: 'carriageway-A' },
    'divided-B':     { kind: 'divided', role: 'carriageway-B' },
    'single-oneway': { kind: 'single',  role: 'spine' },
    'single-bidi':   { kind: 'single',  role: 'spine' },
  }
  for (const [name, fragments] of groups) {
    if (EXCLUDE_FROM_STREETS.has(name)) continue
    const preMerge = splitAtFolds(weldChains(fragments, signatureByOsmId, pairKeyByOsmId))
    let chains = preMerge
    // D1 longitudinal weld: fuse each carriageway's own colinear oneway
    // continuation that weldChains' (signature,pairKey) gate left fragmented,
    // then re-derive the A/B pairing on the merged carriageways (the per-
    // fragment role labels don't survive the merge). weldLongitudinal copies
    // its input, so preMerge stays intact as a fallback.
    const lw = weldLongitudinal(preMerge)
    if (lw.didMerge) {
      const merged = lw.chains
      repairDividedPairs(merged, rejoinAdj)
      // SAFETY VALVE — accept the merge only if it didn't ORPHAN a carriageway.
      // A complex interchange corridor (Officer David Haynes: two carriageways
      // that splay 405m apart at an interchange) merges into long chains the
      // re-pairing can't match (gap 85m > 60m) — leaving the fragments that
      // WERE paired now unpaired = a median lost. In that case revert to the
      // proven fragment-level pairing. A corridor can only improve (clean
      // continuous carriageways, e.g. Truman 8→2) or stay identical, never
      // regress below its pre-weld carriageway count.
      const preDividedIds = new Set()
      for (const c of preMerge) {
        if (c.signature === 'divided-A' || c.signature === 'divided-B') {
          for (const id of c.sources) preDividedIds.add(id)
        }
      }
      const orphaned = merged.some(c =>
        !(c.signature === 'divided-A' || c.signature === 'divided-B') &&
        c.sources.some(id => preDividedIds.has(id)))
      chains = orphaned ? preMerge : merged
    }
    // One street per surviving chain. Divided roads emit two streets
    // (one per carriageway) — medians are emergent downstream.
    chains.forEach((c, i) => {
      const sig = c.signature || 'single-bidi'
      const ph = SIG_TO_PHASE[sig] || SIG_TO_PHASE['single-bidi']
      streets.push(makeStreet(
        chains.length === 1 ? slugify(name) : `${slugify(name)}-${i}`,
        name, fragments[0].tags, c,
        // Phase metadata: derived from signature so downstream (Phase 4
        // derive, Phase 5 knit) consumes phase shape directly instead of
        // rediscovering it. pairKey ties carriageway-A to its B partner
        // through welding; startNode/endNode populated post-normalize.
        { phase: {
          kind: ph.kind, role: ph.role, corridorName: name, pairKey: c.pairKey || null,
          // chainGap = the paired-carriageway chain gap (Part 1.6); null for
          // undivided. Formerly `medianWidth` — renamed because it measures the
          // distance between the two CHAINS, not the median (D1/Mercator). A
          // re-paired (longitudinally-merged) carriageway carries its own fresh
          // chainGap; fragment-level pairs look up the pre-weld gapByPairKey.
          ...(c.chainGap != null
            ? { chainGap: c.chainGap }
            : (c.pairKey && gapByPairKey.has(c.pairKey) && { chainGap: gapByPairKey.get(c.pairKey) })),
        } },
      ))
    })
  }

  // Unnamed highways: motorway/trunk and their ramps are vehicular and
  // belong with the streets (they ribbon, accept measure overrides, and
  // route through the Designer color picker). Everything else (footways,
  // service drives, paths) stays in `paths` and renders pavement-only.
  const VEHICULAR_UNNAMED = new Set([
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary_link', 'secondary_link', 'tertiary_link',
  ])
  const unnamedVehicular = []
  const unnamedNonVehicular = []
  for (const f of unnamed) {
    const hw = f.tags?.highway
    if (VEHICULAR_UNNAMED.has(hw)) unnamedVehicular.push(f)
    else unnamedNonVehicular.push(f)
  }
  // Promote unnamed vehicular fragments into streets with synthetic names.
  // Each fragment becomes its own chain (no welding — ramps don't share
  // endpoints reliably and the OSM ways already represent intent).
  for (let i = 0; i < unnamedVehicular.length; i++) {
    const f = unnamedVehicular[i]
    const hw = f.tags?.highway
    const synthName = `${hw} ${i + 1}`
    const oneway = f.tags?.oneway === 'yes'
    const lanes = parseInt(f.tags?.lanes, 10)
    streets.push({
      id: slugify(synthName),
      name: synthName,
      highway: hw,
      oneway,
      ...(Number.isFinite(lanes) && { lanes }),
      ...(f.tags?.surface && { surface: f.tags.surface }),
      ...(f.tags?.maxspeed && { maxspeed: f.tags.maxspeed }),
      points: f.coords.map(c => ({ x: c.x, z: c.z })),
      osmIds: [f.osmId],
      sources: [f.osmId],
      tags: f.tags || {},
      seed: seedSection(hw, lanes, oneway),
      // Grade separation (Part 2). These unnamed vehicular chains (ramps,
      // motorway/trunk fragments) are exactly the interchange roads — every one
      // is limited-access, so gradeSeparated is true here; the bridge/tunnel/
      // layer facts come straight off the single source way.
      ...gradeFields(hw, [f.osmId]),
    })
  }
  const paths = unnamedNonVehicular.map((f, i) => ({
    id: `path-${i}`,
    highway: f.tags?.highway || 'unknown',
    tags: f.tags || {},
    coords: f.coords.map(c => ({ x: c.x, z: c.z })),
    osmId: f.osmId,
  }))

  // ── INDEX MODE — stop here ───────────────────────────────────────────
  //
  // "The Skeleton is The First Bake" — so building it at FETCH time was the bake
  // running early. But the boundary-street picker has to work BEFORE Bake: it needs
  // street names, their geometry, and the junctions where they meet, so the operator
  // can say what the neighborhood is and see the ring close.
  //
  // Those two facts are only in tension if the picker needs a skeleton. It doesn't —
  // it needs an INDEX. Everything above this line is welding and naming (what streets
  // exist, where they run, where they meet). Everything below is the first bake:
  // simplification, spine-linking, width seeding, cap typing, name-transitions.
  //
  // So `--index` writes the welded chains + their junctions and stops. UNSIMPLIFIED
  // is not a compromise here, it's better: the picker wants the road as digitized,
  // not the polygon-ready abstraction of it. Nothing downstream may consume this —
  // it is a lookup table, not a frame.
  if (process.argv.includes('--index')) {
    const { junctions: idxJunctions } = buildNodeGraph(streets)
    const idxPath = join(CLEAN_DIR, 'street-index.json')
    const slim = streets.map(s2 => ({
      id: s2.id, name: s2.name, corridor: s2.corridor,
      highway: s2.highway, points: s2.points,
    }))
    const wroteIdx = writeIfChanged(idxPath, JSON.stringify({ streets: slim, junctions: idxJunctions }, null, 2), { touch: false })
    console.log(`\nStreet INDEX (pre-bake lookup, not a frame):`)
    console.log(`  ${slim.length} streets, ${idxJunctions.length} junctions`)
    console.log(`\n→ ${idxPath}${wroteIdx ? '' : ' [unchanged]'}`)
    return
  }

  // ── Junction-protected simplification ────────────────────────────────
  // Build the set of shared-node / junction coords from the welded chains
  // BEFORE simplifying. A coord touched by >=2 distinct streets is a junction
  // (cross, T, or same-name severance/divided meeting point). Protecting these
  // from RDP keeps every junction vertex alive — the fix for the 79 deleted
  // T-junctions (Osteopathologist, OSM-FORENSICS.md Part 3.1). Endpoints are
  // already preserved by simplifyRDP (keep[0]/keep[n-1]); the protected-keys
  // mechanism protects INTERIOR junction vertices.
  const coordOwners = new Map()
  for (const s of streets) {
    for (const p of s.points) {
      const k = vKey(p)
      let owners = coordOwners.get(k)
      if (!owners) { owners = new Set(); coordOwners.set(k, owners) }
      owners.add(s.id)
    }
  }
  const junctionKeys = new Set()
  for (const [k, owners] of coordOwners) if (owners.size >= 2) junctionKeys.add(k)
  console.log(`  junction-protected simplify: ${junctionKeys.size} shared-node coords held`)

  // Simplify streets — junction-protected GLOBAL RDP (replaces the old local
  // single-pass `simplify`, which barely thinned OSM's curve over-sampling and
  // so fed the downstream double-densification thorns; see simplifyRDP above).
  // eps = max chord deviation (m) of a dropped vertex. 1.0 m is well inside
  // offset-safety (ped bands are meters wide) and invisible against the aerial,
  // yet collapses smooth curves to their real control points. Junctions/caps
  // are unchanged (protected); verify via the "node typing" log below.
  //
  // ⚠️ LOOP-STREET GUARD. A tight closed loop body (Benton Place teardrop;
  // FEATURES §"Loop streets", NOTES 2026-05-10 L.0) concentrates its curvature
  // into a few high-angle vertices — at eps=1.0 the loop tip collapses to turns
  // of 40-48°, which exceeds smoothChain's 30° CORNER_TOL, so the render-smoother
  // mistakes those curve samples for hard corners and FACETS the loop into a
  // polygon. Normal streets never do this (their gentle curves stay <12° at
  // eps=1.0). So a geometrically-closed chain (first==last — the doctrine's
  // Type-A auto-detect rule, since the `loop` flag/L.x detection isn't live yet)
  // gets a gentle eps that keeps the curve smooth. (Loop *thorns* — the inner-
  // band collision across the thin emergent median — are a separate L.x concern,
  // NOT over-densification.)
  const RDP_EPS = 1.0
  const RDP_EPS_LOOP = 0.3
  const RDP_EPS_TRANSITION = 0.3   // through-roads: preserve the rounding at name-transition seams (see (c) below)
  const isClosedLoop = (pts) => {
    if (!pts || pts.length < 4) return false
    const a = pts[0], b = pts[pts.length - 1]
    return Math.hypot(a.x - b.x, a.z - b.z) < 1.0
  }
  // ── Transition-aware simplification: simplify the ROAD, not the named chain ──
  // Per-chain RDP pins every name-transition joint (a degree-2 node where two
  // DIFFERENTLY-named chains meet — it sits in junctionKeys as a shared coord),
  // then drops the rounding shoulders on each side, so a gentle raw curve facets
  // into one hard kink at the seam (West 18th↔Dolman: 15.6° raw → 46.5° pinned;
  // SPAR-SKELETON-FORENSIC.md). The fix follows the road THROUGH each name change
  // (the continuesAs path), simplifies the concatenated raw polyline ONCE with the
  // joints UN-pinned (real junctions still protected), then splits back by name —
  // so the rounding the data already has survives. PRESERVE, never straighten (RDP
  // only drops within-eps) and never move (retained ⊆ raw). A name is a label; the
  // road is the line on the ground — simplify the road, attribute the names after.
  const totalPtsBefore = streets.reduce((a, s) => a + s.points.length, 0)
  const sById = new Map(streets.map(s => [s.id, s]))
  const rawDegree = buildNodeGraph(streets).degree

  // (a) Name-transition joints, detected on the RAW points — same gate as the
  //     post-RDP nameTransitions detector below (degree-2 · two different-named
  //     chains end-to-end · outward tangents ~opposite, i.e. one road through).
  const endsAt = new Map()  // vKey -> [{id, end}]
  for (const s of streets) {
    const p = s.points
    const ks = vKey(p[0]); if (!endsAt.has(ks)) endsAt.set(ks, []); endsAt.get(ks).push({ id: s.id, end: 'start' })
    const ke = vKey(p[p.length - 1]); if (!endsAt.has(ke)) endsAt.set(ke, []); endsAt.get(ke).push({ id: s.id, end: 'end' })
  }
  const tangentOut = (id, end) => {
    const p = sById.get(id).points
    const [nd, aw] = end === 'start' ? [p[0], p[1]] : [p[p.length - 1], p[p.length - 2]]
    const dx = aw.x - nd.x, dz = aw.z - nd.z, L = Math.hypot(dx, dz) || 1
    return { x: dx / L, z: dz / L }
  }
  const endLinks = new Map()       // "id|end" -> { otherId, otherEnd, key }
  const transitionKeys = new Set() // joint vKeys to UN-pin during road RDP
  for (const [k, ends] of endsAt) {
    if ((rawDegree.get(k) || 0) !== 2 || ends.length !== 2) continue
    const [a, b] = ends
    if (sById.get(a.id).name === sById.get(b.id).name) continue   // same-name severance, not a transition
    const ta = tangentOut(a.id, a.end), tb = tangentOut(b.id, b.end)
    if (ta.x * tb.x + ta.z * tb.z > -0.6) continue                // not collinear → an L-corner, not one road
    endLinks.set(`${a.id}|${a.end}`, { otherId: b.id, otherEnd: b.end, key: k })
    endLinks.set(`${b.id}|${b.end}`, { otherId: a.id, otherEnd: a.end, key: k })
    transitionKeys.add(k)
  }

  // (b) Walk the joint links into maximal ordered through-roads (chain-sequences).
  const linkOf = (id, end) => endLinks.get(`${id}|${end}`)
  const usedInRoad = new Set()
  const roads = []
  for (const s of streets) {
    if (usedInRoad.has(s.id)) continue
    if (!linkOf(s.id, 'start') && !linkOf(s.id, 'end')) continue
    const comp = new Set(); const stk = [s.id]
    while (stk.length) {
      const id = stk.pop(); if (comp.has(id)) continue; comp.add(id)
      for (const end of ['start', 'end']) { const l = linkOf(id, end); if (l && !comp.has(l.otherId)) stk.push(l.otherId) }
    }
    let startId = null, headEnd = null   // start from a free end (road endpoint); else a cycle → break at s
    for (const id of comp) {
      if (!linkOf(id, 'start')) { startId = id; headEnd = 'start'; break }
      if (!linkOf(id, 'end'))   { startId = id; headEnd = 'end';   break }
    }
    if (startId == null) { startId = s.id; headEnd = 'start' }
    const seq = []; const guard = new Set(); let curId = startId, curHead = headEnd
    while (curId != null && !guard.has(curId)) {
      guard.add(curId)
      seq.push({ id: curId, flip: curHead === 'end' })   // flip = traverse this chain reversed
      const l = linkOf(curId, curHead === 'start' ? 'end' : 'start')
      if (!l || guard.has(l.otherId)) break
      curId = l.otherId; curHead = l.otherEnd
    }
    for (const e of seq) usedInRoad.add(e.id)
    if (seq.length >= 2) roads.push(seq)
  }

  // (c) Simplify each through-road ONCE across the joins, then split back by name.
  const protRoad = new Set([...junctionKeys].filter(k => !transitionKeys.has(k)))
  const orientedPts = (e) => e.flip ? reverse(sById.get(e.id).points) : sById.get(e.id).points.slice()
  const roadHandled = new Set()
  for (const road of roads) {
    const concat = []; const segStart = []
    for (let i = 0; i < road.length; i++) {
      const pts = orientedPts(road[i])
      if (i === 0) { segStart.push(0); for (const p of pts) concat.push(p) }
      else { segStart.push(concat.length - 1); for (let j = 1; j < pts.length; j++) concat.push(pts[j]) }  // share the seam
    }
    // Finer tolerance than the per-chain RDP_EPS: a name-transition's rounding is
    // sampled densely (~2-3 m vertices, each <1 m off-chord), so at eps=1.0 the
    // whole gentle bend collapses into one hard kink (W18↔Dolman 46.5°). At 0.3 m
    // the rounding survives → ~15.6° (its true raw turn). Straights stay thin (≈0
    // deviation drops at any eps); only curvature keeps extra points. Knob for the
    // eye. (Un-pinning the joint alone does NOT fix this — the lever is eps.)
    const eps = isClosedLoop(concat) ? RDP_EPS_LOOP : RDP_EPS_TRANSITION
    const keep = rdpKeep(concat, eps, protRoad)
    keep[0] = keep[concat.length - 1] = true
    for (let i = 1; i < road.length; i++) keep[segStart[i]] = true   // re-insert seams (connectivity + split points)
    for (let i = 0; i < road.length; i++) {
      const lo = segStart[i], hi = (i + 1 < road.length) ? segStart[i + 1] : concat.length - 1
      const seg = []
      for (let j = lo; j <= hi; j++) if (keep[j]) seg.push(concat[j])
      sById.get(road[i].id).points = road[i].flip ? reverse(seg) : seg
      roadHandled.add(road[i].id)
    }
  }
  if (roads.length) console.log(`  through-road simplify: ${roads.length} roads across ${transitionKeys.size} name-transitions (joints un-pinned)`)

  // (d) Every chain NOT in a through-road: per-chain RDP as before (junction-protected).
  let totalPtsAfter = 0
  for (const s of streets) {
    if (roadHandled.has(s.id)) continue
    const eps = isClosedLoop(s.points) ? RDP_EPS_LOOP : RDP_EPS
    s.points = simplifyRDP(s.points, eps, junctionKeys)
  }
  for (const s of streets) totalPtsAfter += s.points.length

  // Step 4b — curve-fit (the curve-PRIMITIVE model): a curving run becomes ONE cubic-bezier
  // SEGMENT (frame placement, Law 1); straights + sharp corners stay LINE segments,
  // byte-identical. The frame stays SPARSE — smoothness lives in the bezier, not point
  // density. Sets s.segments (omitted when a chain has no curve → grid-safe identity).
  if (CURVE_FIT) {
    let fitChains = 0
    // (a) THROUGH-ROADS — fit the curve across name-transition seams as ONE road, then cut
    //     it back per named chain (de Casteljau at any seam a bezier straddles) so the two
    //     chains SHARE the seam vertex + matched tangents → no mid-curve split (W18↔Dolman).
    //     "A name is a label; the road is the line — fit the road, attribute names after."
    for (const road of roads) {
      if (road.some(e => { const s = sById.get(e.id); return s.phase && s.phase.kind === 'divided' })) continue
      const concat = [], segStart = []                            // re-concatenate the (simplified) chains in road order
      for (let i = 0; i < road.length; i++) {
        const pts = orientedPts(road[i])
        if (i === 0) { segStart.push(0); for (const p of pts) concat.push(p) }
        else { segStart.push(concat.length - 1); for (let j = 1; j < pts.length; j++) concat.push(pts[j]) }
      }
      if (isClosedLoop(concat)) continue
      const fit = curveFitSegments(concat, protRoad)              // protRoad excludes the seams → a bezier may span them
      if (!fit.segments) continue                                 // straight through-road → identity, no segments
      const pts = fit.points.slice(), segs = fit.segments.slice()
      const cuts = [0]                                            // cut indices: road start, each interior seam, road end
      for (let i = 1; i < road.length; i++) cuts.push(splitAtSeamCoord(pts, segs, concat[segStart[i]]))
      cuts.push(pts.length - 1)                                   // (later splits only insert to the RIGHT of earlier cuts)
      for (let i = 0; i < road.length; i++) {
        let cp = pts.slice(cuts[i], cuts[i + 1] + 1)
        let cs = segs.slice(cuts[i], cuts[i + 1])
        if (road[i].flip) { cp = reverse(cp); cs = reverseSegments(cs) }
        const s = sById.get(road[i].id)
        s.points = cp
        s.segments = cs.some(g => g.type === 'bezier') ? cs : undefined   // omit if all-line (identity)
        if (s.segments) fitChains++
      }
    }
    // (b) STANDALONE chains (not in any through-road) — per-chain fit.
    //     ⛔ Skip DIVIDED carriageways (moving one desyncs its emergent median — the
    //     two-carriageway model is LOCKED; v2 step (c)). CLOSED LOOPS: v2 step (a) fits
    //     TRUE CIRCLES (turning circles — SV, Park Place) as bezier arcs; NON-circular
    //     loops (Benton teardrop — v2 step (b)) now fit as general beziers via
    //     fitClosedLoopBezier (the fitClosedLoopCircle fall-through). Waverly couplet is
    //     multi-chain, not a single closed loop — unaffected here.
    let loopFits = 0
    for (const s of streets) {
      if (roadHandled.has(s.id)) continue
      if (s.phase && s.phase.kind === 'divided') continue
      if (isClosedLoop(s.points)) {
        const loopFit = fitClosedLoopCircle(s.points, junctionKeys)
        if (loopFit) { s.points = loopFit.points; s.segments = loopFit.segments; fitChains++; loopFits++ }
        continue                                            // closed loops never go through the open-chain cluster fit
      }
      const fit = curveFitSegments(s.points, junctionKeys)
      if (fit.segments) { s.points = fit.points; s.segments = fit.segments; fitChains++ }
    }
    console.log(`  curve-fit: bezier-fit ${fitChains} curving chain(s) (${loopFits} closed loop(s) incl. non-circular teardrops; divided excluded)`)
  }

  // Canonical direction pass. Non-oneway chains are oriented so the
  // dominant component of (last - first) is positive (+X if E-W, +Z if N-S).
  // Without this, "left/right" of a chain in Measure has no stable
  // geographic meaning across chains, and ribbon winding can flip between
  // adjacent chains. Oneway chains are left alone — their direction is
  // the direction of travel.
  let flipped = 0
  for (const s of streets) {
    if (s.oneway) continue
    const p = s.points
    const dx = p[p.length - 1].x - p[0].x
    const dz = p[p.length - 1].z - p[0].z
    const dominantPositive = Math.abs(dx) > Math.abs(dz) ? dx > 0 : dz > 0
    if (!dominantPositive) {
      s.points = reverse(p)
      if (s.segments) s.segments = reverseSegments(s.segments)   // keep segments aligned to the reversed points (curve-primitive model)
      flipped++
    }
  }
  console.log(`  direction-normalized: flipped ${flipped} non-oneway chain(s)`)

  // Stamp phase endpoint coords (post-normalize so orientation is final).
  // startNode/endNode are the chain's first/last point — they're the
  // joining points the knit step will look up to find adjacent phases.
  for (const s of streets) {
    if (!s.phase) continue
    const p = s.points
    s.phase.startNode = { x: p[0].x, z: p[0].z }
    s.phase.endNode   = { x: p[p.length - 1].x, z: p[p.length - 1].z }
  }

  // ── Corridor spine-link (carriageway → spine continuation) ───────────
  // A divided carriageway needs to know its SPINE continuation across a
  // divided↔undivided transition, so the tile construction can hold the
  // carriageway's OUTER edge to the spine's straight outer-edge line (the
  // median opens inward; the outer curb stays continuous). We compute this
  // ONCE here, as a frozen frame fact, from the just-stamped endpoint nodes
  // + corridorName — NEVER re-derived by node-matching at construction time
  // (that re-coupling is the wall violation we're avoiding; carry it as
  // frame truth). Stamped per-end (a carriageway may meet a spine at its
  // start, end, both, or neither). The value is the spine street's `id`
  // (== ribbons skelId), so the consumer looks it up directly.
  {
    const nkey = (n) => `${n.x.toFixed(2)},${n.z.toFixed(2)}`
    const spinesByNode = new Map()   // nodeKey -> [{ id, corridor }]
    for (const s of streets) {
      if (s.phase?.role !== 'spine') continue
      for (const n of [s.phase.startNode, s.phase.endNode]) {
        if (!n) continue
        const k = nkey(n)
        if (!spinesByNode.has(k)) spinesByNode.set(k, [])
        spinesByNode.get(k).push({ id: s.id, corridor: s.phase.corridorName })
      }
    }
    let linked = 0
    for (const s of streets) {
      if (s.phase?.kind !== 'divided') continue
      for (const [field, n] of [['spineAtStart', s.phase.startNode], ['spineAtEnd', s.phase.endNode]]) {
        if (!n) continue
        const cand = (spinesByNode.get(nkey(n)) || []).find(sp => sp.corridor === s.phase.corridorName)
        if (cand) { s.phase[field] = cand.id; linked++ }
      }
    }
    console.log(`  corridor spine-link: stamped ${linked} carriageway→spine link(s)`)
  }

  // ── [E1] Custom width base (survey.json → per-side seed) ─────────────
  // After the canonical-direction pass: per-side identity is resolved
  // against FINAL point order (see stampCustomWidths header).
  stampCustomWidths(streets, loadSurveyStreets(),
    highways.filter(f => f.tags?.footway === 'sidewalk'))

  // ── Node typing → cap-as-fact (Part 1.1) ─────────────────────────────
  // Classify every shared coord by graph degree, then stamp each chain's two
  // endpoints with a cap decision: 'round' at a true dead-end (degree 1),
  // 'butt' where the chain joins anything (degree >= 2). This turns the
  // canonical cap failure (operator-authored-or-blunt-and-pray) into a frame
  // fact. NOTE: among degree-1 dead-ends, map-boundary exits also read as
  // 'round' here; the boundary-exit refinement rides with the deferred
  // boundary-trio brief (caps are emitted, not yet consumed downstream).
  const { degree, junctions } = buildNodeGraph(streets)
  let capRound = 0, capButt = 0
  for (const s of streets) {
    const p = s.points
    const dStart = degree.get(vKey(p[0])) || 1
    const dEnd   = degree.get(vKey(p[p.length - 1])) || 1
    s.caps = {
      start: { cap: dStart === 1 ? 'round' : 'butt', degree: dStart },
      end:   { cap: dEnd   === 1 ? 'round' : 'butt', degree: dEnd },
    }
    if (s.caps.start.cap === 'round') capRound++; else capButt++
    if (s.caps.end.cap === 'round') capRound++; else capButt++
  }
  const jc = junctions.reduce((m, j) => (m[j.kind] = (m[j.kind] || 0) + 1, m), {})
  console.log(`  node typing: ${junctions.length} junctions [${Object.entries(jc).map(([k,v])=>`${k} ${v}`).join(', ')}]`)
  console.log(`  caps: ${capRound} round (dead-end), ${capButt} butt (joined)`)

  // ── Name-transition understanding (Part 1.4 — the Dolman→18th 'U') ────
  // A single physical road that changes name mid-run shows up as two chains
  // of DIFFERENT names meeting at a degree-2 node (only those two endpoints —
  // no third street, so it is NOT a junction). We do NOT physically merge them
  // (that would re-key customs); instead the frame *understands* the situation:
  // each chain records `continuesAs` and a top-level `nameTransitions` list
  // marks the transition point. This is the "understand, don't split-tool"
  // doctrine — and it removes the excuse for the per-name densify/extend hacks.
  const endpointChains = new Map()  // vKey -> [{id, name, end}]
  const addEnd = (k, rec) => {
    let arr = endpointChains.get(k)
    if (!arr) { arr = []; endpointChains.set(k, arr) }
    arr.push(rec)
  }
  const byId = new Map(streets.map(s => [s.id, s]))
  // Outward direction from the shared node into a chain (unit vector pointing
  // away from the node along the chain's first/last segment).
  const outwardTangent = (rec) => {
    const p = byId.get(rec.id).points
    const [n, a] = rec.end === 'start' ? [p[0], p[1]] : [p[p.length - 1], p[p.length - 2]]
    const dx = a.x - n.x, dz = a.z - n.z
    const L = Math.hypot(dx, dz) || 1
    return { x: dx / L, z: dz / L }
  }
  for (const s of streets) {
    const p = s.points
    addEnd(vKey(p[0]),                { id: s.id, name: s.name, end: 'start' })
    addEnd(vKey(p[p.length - 1]),     { id: s.id, name: s.name, end: 'end' })
  }
  const nameTransitions = []
  for (const [k, ends] of endpointChains) {
    if ((degree.get(k) || 0) !== 2 || ends.length !== 2) continue
    const [a, b] = ends
    if (a.name === b.name) continue   // same-name severance handled by weld, not a transition
    // Tangent-continuity gate: a true name change runs roughly STRAIGHT through
    // the node (the two chains' outward tangents point ~opposite). This rejects
    // L-corners where two streets merely terminate together, and ramp Y-splits.
    const ta = outwardTangent(a), tb = outwardTangent(b)
    if (ta.x * tb.x + ta.z * tb.z > -0.6) continue   // not collinear → not one road
    const [x, z] = k.split(',').map(Number)
    nameTransitions.push({ x, z, from: a.name, to: b.name, fromId: a.id, toId: b.id })
    byId.get(a.id).continuesAs = b.id
    byId.get(b.id).continuesAs = a.id
  }
  if (nameTransitions.length) {
    console.log(`  name-transitions: ${nameTransitions.length} [${nameTransitions.map(t => `${t.from}→${t.to}`).join(', ')}]`)
  }

  // --- Directional-corridor linking (KIT, installation-agnostic) -----------
  // A single physical arterial is often split by a DIRECTIONAL name prefix at a
  // baseline — "North Big Bend Boulevard" ↔ "South Big Bend Boulevard" — and the
  // split frequently lands ON a junction (degree ≥ 3), which the degree-2
  // name-transition pass above skips. For boundary/corridor purposes the two are
  // ONE street ("a name is a label; the road is the line" — §5a). We stamp a
  // `corridor` field (= the base name, directional prefix stripped) on chains
  // that share a node with CONTINUOUS heading — the SAME tangent guard the
  // name-transition pass uses. That guard is load-bearing: LS's only same-base
  // directional pair, South 18th × West 18th, meets PERPENDICULARLY and must NOT
  // link (verified byte-identical). Sparse — absent on a street with no
  // directional sibling, so scenes without such corridors are unchanged.
  const DIR_PREFIX = /^(North|South|East|West)\s+/i
  const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' }
  const dirOf = (nm) => { const m = nm.match(DIR_PREFIX); return m ? m[1].toLowerCase() : null }
  const corridorBase = (nm) => nm.replace(DIR_PREFIX, '')
  const corridors = []
  for (const [k, ends] of endpointChains) {
    if (ends.length < 2) continue
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const a = ends[i], b = ends[j]
        if (a.id === b.id) continue
        const da = dirOf(a.name), db = dirOf(b.name)
        // OPPOSITE directional prefixes on the SAME base — a baseline split (N↔S
        // or E↔W), the canonical "one arterial, two directional names" case.
        // Adjacent prefixes (South↔West = an L-bend, e.g. LS's 18th St) are NOT a
        // baseline split and must NOT link — that guard keeps LS byte-identical.
        if (!da || !db || OPPOSITE[da] !== db) continue
        if (corridorBase(a.name) !== corridorBase(b.name)) continue
        const ta = outwardTangent(a), tb = outwardTangent(b)
        if (ta.x * tb.x + ta.z * tb.z > -0.6) continue   // continuous heading only
        const base = corridorBase(a.name)
        byId.get(a.id).corridor = base
        byId.get(b.id).corridor = base
        const [x, z] = k.split(',').map(Number)
        corridors.push({ base, at: [Math.round(x), Math.round(z)] })
      }
    }
  }
  if (corridors.length) {
    console.log(`  directional corridors: ${corridors.length} [${[...new Set(corridors.map(c => c.base))].join(', ')}]`)
  }

  // Propagate the corridor label ALONG the physical road. The loop above only
  // stamps the two chains that MEET at the directional baseline (the split node);
  // the rest of the corridor — longitudinal continuations, the antiparallel
  // carriageway, and any unprefixed middle ("Woodbury Road" between West/East
  // Woodbury) — stays untagged. That breaks the Extent boundary resolver, which
  // groups selections by `corridor`: a divided arterial surfaces as several names
  // and no single pick gathers the whole edge, so the ring won't close (Altadena's
  // Woodbury). Spread each seeded label to every chain that (a) shares a node with
  // an already-tagged chain and (b) has the SAME corridor base (directional prefix
  // stripped). The base-name guard is what prevents leaking onto a cross street —
  // a different road has a different base — so no heading test is needed. Purely
  // additive labelling; `corridor` feeds ONLY Extent selection + the aerial/
  // dropdown label-collapse, never derive/bake, so LS renders byte-identical.
  {
    const queue = streets.filter(s => s.corridor)
    let spread = 0
    while (queue.length) {
      const s = queue.shift()
      const base = s.corridor
      const p = s.points
      for (const node of [vKey(p[0]), vKey(p[p.length - 1])]) {
        for (const rec of (endpointChains.get(node) || [])) {
          const t = byId.get(rec.id)
          if (t.corridor) continue                             // already tagged
          if (corridorBase(t.name) !== base) continue          // same physical road only
          t.corridor = base
          queue.push(t)
          spread++
        }
      }
    }
    if (spread) console.log(`  corridor propagation: +${spread} chain(s) tagged along the road`)
  }

  // ── Identity terminal/through — the through-node fact (BRIEF-terminal-node-sweep) ──
  // An IDENTITY is one physical road: same identity-name (corridor-base if the
  // directional pass linked it, else name) + shared vertices. At each of a chain's
  // two endpoints we stamp whether that node is a TERMINAL for the identity (a
  // degree-1 TIP of the identity's own graph → a real corner belongs here) or
  // THROUGH (interior, degree >= 2 → the road runs straight past, no false corner
  // on its own frontage). This is the same KIND of frozen per-endpoint fact as
  // `caps` — and, like caps, it is a LABEL: NO chain is moved, no vertex projected,
  // no carriageway welded. Consumers (tileGround.cornerAt on the SHAPE side; the
  // sectionPass corner/ADA bid on the FILL side) READ this instead of re-guessing
  // "real corner vs pass-through" from local geometry (the DOT_CONTINUES angle
  // gate, isThruNode, the tile-local isThrough — all of which mis-key at a split
  // carriageway or a dogleg).
  //
  // Why this is general over any tip count (no "find the two ends" disambiguation):
  //   2 tips = ordinary road · 1 tip = lollipop (cul-de-sac bulb) · 3+ tips = a Y
  //   or same-name tee (every tip TERMINAL, the branch-point THROUGH) · 0 tips = a
  //   ring (roundabout) → every node degree >= 2 → THROUGH → mints no corner.
  //
  // ⛔ DELIBERATELY NOT UNIFIED — far-apart same-name pieces (opposite sides of a
  // park). They are a DIFFERENT connected component, so they never share a node;
  // a node's degree is a LOCAL property, so lumping every component of one name
  // into a single degree map cannot make them interfere (they contribute to
  // disjoint node-keys). Explicit component-splitting is therefore unnecessary
  // for correctness — and NOT unifying them is deliberate: unifying far-apart
  // same-name stretches changes no terminal classification (they share no node)
  // and only risks over-welding coincidentally-collinear unrelated streets. The
  // corner label keys on ADJACENCY, so name-level identity is safe.
  {
    const idKeyOf = (s) => ((s.corridor || s.name || '').trim()) || ('__id_' + s.id)
    const idDeg = new Map()   // idKey -> Map(vKey -> degree within that identity's graph)
    for (const s of streets) {
      const p = s.points
      if (!p || p.length < 2) continue
      const k = idKeyOf(s)
      let deg = idDeg.get(k); if (!deg) { deg = new Map(); idDeg.set(k, deg) }
      for (let i = 0; i < p.length - 1; i++) {
        const a = vKey(p[i]), b = vKey(p[i + 1])
        if (a === b) continue
        deg.set(a, (deg.get(a) || 0) + 1)
        deg.set(b, (deg.get(b) || 0) + 1)
      }
    }
    let nThru = 0, nTerm = 0
    for (const s of streets) {
      const p = s.points
      if (!p || p.length < 2) continue
      const deg = idDeg.get(idKeyOf(s))
      // THROUGH ⇔ the endpoint node is interior to the identity's graph (degree
      // >= 2). A lone chain's two ends are degree 1 → both TERMINAL (ordinary
      // road). A ring node is degree >= 2 → THROUGH (no terminal, no corner).
      const thruStart = (deg.get(vKey(p[0])) || 0) >= 2
      const thruEnd   = (deg.get(vKey(p[p.length - 1])) || 0) >= 2
      s.throughId = idKeyOf(s)
      s.through = { start: thruStart, end: thruEnd }
      thruStart ? nThru++ : nTerm++
      thruEnd   ? nThru++ : nTerm++
    }
    console.log(`  identity through-nodes: ${nThru} through, ${nTerm} terminal (chain-endpoints, over ${idDeg.size} identities)`)
  }

  console.log('\nSkeleton:')
  console.log(`  streets: ${streets.length}`)
  console.log(`  paths:   ${paths.length}`)
  console.log(`  simplification: ${totalPtsBefore} → ${totalPtsAfter} pts (${Math.round(100 * (1 - totalPtsAfter / totalPtsBefore))}% reduction)`)

  // Divided roads now show up as two same-name streets. Log them so
  // the operator sees what's paired in the output.
  const byName = new Map()
  for (const s of streets) {
    if (!byName.has(s.name)) byName.set(s.name, [])
    byName.get(s.name).push(s)
  }
  const multi = Array.from(byName.entries()).filter(([_, ss]) => ss.length > 1)
  if (multi.length) {
    console.log('\nStreets emitted as multiple carriageways/sections:')
    for (const [name, ss] of multi) {
      console.log(`  ${name}: ${ss.length} chain(s) — ${ss.map(s => s.points.length + 'pts').join(', ')}`)
    }
  }

  // Phase metadata summary.
  const byKindRole = new Map()
  for (const s of streets) {
    if (!s.phase) continue
    const k = `${s.phase.kind}/${s.phase.role}`
    byKindRole.set(k, (byKindRole.get(k) || 0) + 1)
  }
  console.log('\nPhase metadata (per chain):')
  for (const [k, n] of byKindRole) console.log(`  ${k}: ${n}`)

  const outPath = join(CLEAN_DIR, 'skeleton.json')
  // `junctions` is additive frame metadata (typed nodes). Downstream consumers
  // that read {streets, paths} are unaffected; the cap/corner consumers can
  // start reading it in the Layer-2 follow-on.
  //
  // Content-aware: skeleton.json is a needsRebuild INPUT (serve.js RAW_PATHS),
  // not an output of the bake chain, so a no-op run must leave its mtime alone
  // (touch:false) — a plain write (or the default mtime bump) would make every
  // byte-identical run force a full ribbons+bake rebuild downstream.
  const wrote = writeIfChanged(outPath, JSON.stringify({ streets, paths, junctions, nameTransitions }, null, 2), { touch: false })
  console.log(`\n→ ${outPath}${wrote ? '' : ' [unchanged]'}`)
}

function makeStreet(id, name, sourceTags, chain, extras = {}) {
  // Per-chain dominant class over the chain's OWN sources (chainHighway) —
  // sourceTags is the group's first fragment, and stamping ITS class on every
  // chain flattened the whole group (South 18th's ramp + service drive read
  // 'residential'; gradeSeparated defeated for named ramps). Same pattern as
  // the D6 oneway fix and the E1 lanes vote below.
  const highway = chainHighway(chain?.sources, sourceTags)
  // [D6] oneway is per-CHAIN, not per-group. sourceTags is the group's first
  // fragment, which on a mixed corridor (e.g. Lafayette: bidi fragments + oneway
  // carriageways) mis-reports every chain as the first fragment's direction —
  // leaving divided carriageways flagged oneway=false. The welded chain carries
  // its own oneway (the seed fragment's flag, true for any carriageway); prefer
  // it so Survey's One-way checkbox reads the carriageway honestly.
  const oneway = typeof chain?.oneway === 'boolean' ? chain.oneway : (sourceTags?.oneway === 'yes')
  // [E1] lanes summarized over ALL of the chain's source ways — sourceTags is
  // the group's FIRST fragment, and on a multi-way chain the lanes tag often
  // lives on other fragments (South 18th: lanes sit mid-corridor; fragment[0]
  // carries none), so a first-fragment read silently drops the OSM width
  // marrow. Mode across sources, ties to the larger count.
  const lanes = chainLanes(chain?.sources, sourceTags)
  return {
    id,
    name,
    highway,
    oneway,
    // Attributes present in OSM but dropped at P1 until now — carried so the
    // frame holds the cross-section instead of re-deriving it (Part 2 bucket b).
    ...(Number.isFinite(lanes) && { lanes }),
    ...(sourceTags?.surface && { surface: sourceTags.surface }),
    ...(sourceTags?.maxspeed && { maxspeed: sourceTags.maxspeed }),
    points: chain.coords.map(c => ({ x: c.x, z: c.z })),
    sources: chain.sources || [],
    // Standards-seeded default cross-section (Part 2 bucket d / north-star).
    seed: seedSection(highway, lanes, oneway),
    // Grade separation (Part 2): layer/bridge/tunnel summarized over ALL source
    // ways + the operative `gradeSeparated` flag. Earlier this dropped on named
    // streets (only fragments[0].tags reached here, no grade at all) — fixed by
    // grading from chain.sources, so a partly-bridge street like Mississippi Ave
    // is graded honestly (bridge:true, layer:1, but gradeSeparated:false — it
    // still bounds blocks).
    ...gradeFields(highway, chain.sources),
    ...extras,
  }
}

main()
