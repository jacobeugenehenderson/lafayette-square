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
  'Officer David Haynes Memorial Highway', // I-44
  'Ozark Expressway',                      // I-44 / I-55
  'MetroLink Green Line',                  // rail, not a street
  '21st Street Cycle Track',               // cycle-only
])

// --- Geometry helpers -----------------------------------------------------

const EPS = 1e-3 // 1mm endpoint-match tolerance

function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z
  return dx * dx + dz * dz
}
function dist(a, b) { return Math.sqrt(dist2(a, b)) }

function ptsEqual(a, b) { return dist2(a, b) < EPS * EPS }

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

function simplify(coords, devTol = 0.2, angleTolDeg = 2) {
  if (coords.length <= 2) return coords.slice()
  const angleTol = angleTolDeg * Math.PI / 180
  const out = [coords[0]]
  for (let i = 1; i < coords.length - 1; i++) {
    const prev = out[out.length - 1]
    const curr = coords[i]
    const next = coords[i + 1]
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

// --- Main pipeline --------------------------------------------------------

function main() {
  const osm = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf8'))
  const highways = osm.ground?.highway || []
  console.log(`Input: ${highways.length} highway features`)

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
  for (const [name, fragments] of groups) {
    if (EXCLUDE_FROM_STREETS.has(name)) continue
    const report = analyzePhases(name, fragments)
    phaseReports.push(report)
    for (const c of report.classified) {
      const sig = c.kind === 'divided' ? c.role : c.kind
      signatureByOsmId.set(c.osmId, sig)
      if (c.pairKey) pairKeyByOsmId.set(c.osmId, c.pairKey)
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
        { phase: { kind: ph.kind, role: ph.role, corridorName: name, pairKey: c.pairKey || null } },
      ))
    })
  }

  // Unnamed → paths, preserved verbatim but typed.
  const paths = unnamed.map((f, i) => ({
    id: `path-${i}`,
    highway: f.tags?.highway || 'unknown',
    tags: f.tags || {},
    coords: f.coords.map(c => ({ x: c.x, z: c.z })),
    osmId: f.osmId,
  }))

  // Simplify streets.
  let totalPtsBefore = 0, totalPtsAfter = 0
  for (const s of streets) {
    totalPtsBefore += s.points.length
    s.points = simplify(s.points)
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
  writeFileSync(outPath, JSON.stringify({ streets, paths }, null, 2))
  console.log(`\n→ ${outPath}`)
}

function makeStreet(id, name, sourceTags, chain, extras = {}) {
  return {
    id,
    name,
    highway: sourceTags?.highway || 'residential',
    oneway: sourceTags?.oneway === 'yes',
    points: chain.coords.map(c => ({ x: c.x, z: c.z })),
    sources: chain.sources || [],
    ...extras,
  }
}

main()
