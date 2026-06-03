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

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, CLEAN_DIR } from './config.js'

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

function analyzePhases(name, fragments) {
  const oneway = fragments.filter(f => f.tags?.oneway === 'yes')
  const bidi = fragments.filter(f => f.tags?.oneway !== 'yes')

  // Score every candidate oneway pair, then resolve by ascending gap so
  // the cleanest matches claim partners first. Greedy first-match was
  // letting connector stubs lock out same-length carriageway mates
  // (Truman: 361m main pair lost to a 12m stub at 12.4m one-way gap).
  const cand = []
  for (let i = 0; i < oneway.length; i++) {
    const A = oneway[i]
    const aLen = polylineLengthXZ(A.coords)
    const aTan = avgTangentXZ(A.coords)
    for (let j = i + 1; j < oneway.length; j++) {
      const B = oneway[j]
      const bLen = polylineLengthXZ(B.coords)
      const bTan = avgTangentXZ(B.coords)
      const dot = aTan.x * bTan.x + aTan.z * bTan.z
      if (dot > DIVIDED_MIN_TAN_DOT) continue
      const lenRatio = Math.min(aLen, bLen) / Math.max(aLen, bLen)
      if (lenRatio < DIVIDED_MIN_LEN_RATIO) continue
      // Symmetric gap: take max of the two directional means so a short
      // fragment can't claim a long partner cheaply (its sliver of
      // overlap dominates the one-way mean).
      const gap = Math.max(
        meanPerpDistanceXZ(A.coords, B.coords),
        meanPerpDistanceXZ(B.coords, A.coords),
      )
      if (gap > DIVIDED_MAX_GAP) continue
      // 4th gate: the two must actually run BESIDE each other along the
      // corridor, not merely be near + antiparallel. Drops longitudinally-
      // staggered stub pairs (Truman #5/#6) that the gap clamp lets slip.
      if (stationOverlapFracXZ(A.coords, B.coords) < DIVIDED_MIN_STATION_OVERLAP) continue
      cand.push({ A, B, gap, lenRatio })
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
      if (slice.length >= 2) slices.push(slice)
    }
    const isDivided = chain.signature === 'divided-A' || chain.signature === 'divided-B'
    if (isDivided && slices.length > 1) {
      // Keep the longest as the carriageway; demote the rest.
      let bestIdx = 0, bestLen = 0
      for (let i = 0; i < slices.length; i++) {
        let L = 0
        for (let j = 1; j < slices[i].length; j++) L += Math.hypot(slices[i][j].x - slices[i][j-1].x, slices[i][j].z - slices[i][j-1].z)
        if (L > bestLen) { bestLen = L; bestIdx = i }
      }
      for (let i = 0; i < slices.length; i++) {
        if (i === bestIdx) {
          out.push({ ...chain, coords: slices[i] })
        } else {
          out.push({ ...chain, coords: slices[i], signature: 'single-bidi', pairKey: null, oneway: false })
        }
      }
    } else {
      for (const slice of slices) out.push({ ...chain, coords: slice })
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
  const pool = fragments.map(f => ({
    coords: f.coords.slice(),
    sources: [f.osmId],
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

        // tail-to-head
        if (ptsEqual(chainTail, cHead)) {
          chain.coords = chain.coords.concat(c.coords.slice(1))
          chain.sources.push(...c.sources)
          pool.splice(i, 1); extended = true; break
        }
        // tail-to-tail (flip c) — forbidden for oneway pairs
        if (!anyOneway && ptsEqual(chainTail, cTail)) {
          chain.coords = chain.coords.concat(reverse(c.coords).slice(1))
          chain.sources.push(...c.sources)
          pool.splice(i, 1); extended = true; break
        }
        // head-to-tail (prepend c)
        if (ptsEqual(chainHead, cTail)) {
          chain.coords = c.coords.slice(0, -1).concat(chain.coords)
          chain.sources.unshift(...c.sources)
          pool.splice(i, 1); extended = true; break
        }
        // head-to-head (flip c, prepend) — forbidden for oneway pairs
        if (!anyOneway && ptsEqual(chainHead, cHead)) {
          chain.coords = reverse(c.coords).slice(0, -1).concat(chain.coords)
          chain.sources.unshift(...c.sources)
          pool.splice(i, 1); extended = true; break
        }
      }
    }
    chains.push(chain)
  }
  return chains
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

// --- Step 4: angular-tolerance simplification -----------------------------
// Collapse a point if its perpendicular deviation from the chord formed by
// its neighbors < DEV_TOL AND the turn angle < ANGLE_TOL.

// `protectedKeys` (Set of `vKey(p)`) holds the coords that are junction /
// shared nodes. A protected vertex is NEVER collapsed — this is the fix for
// the Osteopathologist finding that junction-blind RDP deleted 79 real
// T-junctions (the through-street's vertex at a T reads as "locally straight"
// and gets removed, stranding the terminator on a segment interior). Keeping
// junction vertices makes the frame's junction topology survive simplification.
function simplify(coords, devTol = 0.2, angleTolDeg = 2, protectedKeys = null) {
  if (coords.length <= 2) return coords.slice()
  const angleTol = angleTolDeg * Math.PI / 180
  const out = [coords[0]]
  for (let i = 1; i < coords.length - 1; i++) {
    const prev = out[out.length - 1]
    const curr = coords[i]
    const next = coords[i + 1]
    if (protectedKeys && protectedKeys.has(vKey(curr))) { out.push(curr); continue }
    const dev = perpDist(curr, prev, next)
    const v1x = curr.x - prev.x, v1z = curr.z - prev.z
    const v2x = next.x - curr.x, v2z = next.z - curr.z
    const a1 = Math.atan2(v1z, v1x), a2 = Math.atan2(v2z, v2x)
    let turn = Math.abs(a2 - a1)
    if (turn > Math.PI) turn = 2 * Math.PI - turn
    if (dev < devTol && turn < angleTol) continue // collapse
    out.push(curr)
  }
  out.push(coords[coords.length - 1])
  return out
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
let WAY_TAGS_BY_ID = new Map()

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

  const { groups, unnamed } = groupByName(highways)
  console.log(`       ${groups.size} unique names, ${unnamed.length} unnamed`)

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
    const report = analyzePhases(name, fragments)
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
    const chains = splitAtFolds(weldChains(fragments, signatureByOsmId, pairKeyByOsmId))
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
          // Median width = the paired-carriageway gap (Part 1.6); null for undivided.
          ...(c.pairKey && gapByPairKey.has(c.pairKey) && { medianWidth: gapByPairKey.get(c.pairKey) }),
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

  // ── Junction-protected simplification ────────────────────────────────
  // Build the set of shared-node / junction coords from the welded chains
  // BEFORE simplifying. A coord touched by >=2 distinct streets is a junction
  // (cross, T, or same-name severance/divided meeting point). Protecting these
  // from RDP keeps every junction vertex alive — the fix for the 79 deleted
  // T-junctions (Osteopathologist, OSM-FORENSICS.md Part 3.1). Endpoints are
  // already preserved by simplify(); this protects INTERIOR junction vertices.
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

  // Simplify streets.
  let totalPtsBefore = 0, totalPtsAfter = 0
  for (const s of streets) {
    totalPtsBefore += s.points.length
    s.points = simplify(s.points, 0.2, 2, junctionKeys)
    totalPtsAfter += s.points.length
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
  writeFileSync(outPath, JSON.stringify({ streets, paths, junctions, nameTransitions }, null, 2))
  console.log(`\n→ ${outPath}`)
}

function makeStreet(id, name, sourceTags, chain, extras = {}) {
  const highway = sourceTags?.highway || 'residential'
  const oneway = sourceTags?.oneway === 'yes'
  const lanes = parseInt(sourceTags?.lanes, 10)
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
