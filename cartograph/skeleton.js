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

// --- Step 2: weld end-to-end fragments within a group ---------------------
// Greedy: pick a fragment, try to extend either end with another whose
// endpoint matches. Repeat until no more matches, then start a new chain.

// If a welded chain folds back on itself (two adjacent segments whose
// tangents face opposite directions), split it at the fold. This cleans
// up divided roads where OSM bidirectional connector fragments let the
// welder splice opposing one-way halves together — oneway direction
// rules alone don't catch those.
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
    // Split at each fold: emit chain[0..fold], chain[fold..next], ...
    const cuts = [0, ...foldIdxs, coords.length - 1]
    for (let i = 0; i < cuts.length - 1; i++) {
      const slice = coords.slice(cuts[i], cuts[i + 1] + 1)
      if (slice.length < 2) continue
      out.push({ ...chain, coords: slice })
    }
  }
  return out
}

function weldChains(fragments) {
  const pool = fragments.map(f => ({
    coords: f.coords.slice(),
    sources: [f.osmId],
    tags: f.tags,
    oneway: f.tags?.oneway === 'yes',
    isClosed: f.isClosed,
  }))
  const chains = []

  while (pool.length) {
    let chain = pool.shift()
    let extended = true
    while (extended) {
      extended = false
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i]
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

function nearestOnPolyline(p, coords) {
  let best = { dist: Infinity, point: coords[0] }
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i]
    const dx = b.x - a.x, dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2
    t = Math.max(0, Math.min(1, t))
    const px = a.x + t * dx, pz = a.z + t * dz
    const d = Math.hypot(p.x - px, p.z - pz)
    if (d < best.dist) best = { dist: d, point: { x: px, z: pz } }
  }
  return best
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

  const streets = []

  // Drop any short chain fully "shadowed" by a longer same-name chain
  // (both endpoints project within SHADOW_PERP of the longer chain AND
  // the shorter chain is <50% of the longer's length). Handles OSM's
  // pattern of duplicate-tracing a subsection. Divided-road carriageway
  // pairs (both ~full length) are NOT dropped — they stay as two
  // separate streets per the positive-carriageway model.
  const SHADOW_PERP = 30
  const SHADOW_LEN_RATIO = 0.5
  function dropShadowedChains(chains) {
    if (chains.length < 2) return chains
    const sorted = chains.slice().sort((a, b) => chainLength(b.coords) - chainLength(a.coords))
    const kept = []
    for (const c of sorted) {
      const cLen = chainLength(c.coords)
      const shadowedBy = kept.find(k => {
        if (cLen / chainLength(k.coords) >= SHADOW_LEN_RATIO) return false
        const endA = nearestOnPolyline(c.coords[0], k.coords)
        const endB = nearestOnPolyline(c.coords[c.coords.length - 1], k.coords)
        return endA.dist < SHADOW_PERP && endB.dist < SHADOW_PERP
      })
      if (!shadowedBy) kept.push(c)
    }
    return kept
  }

  for (const [name, fragments] of groups) {
    if (EXCLUDE_FROM_STREETS.has(name)) continue
    const chains = dropShadowedChains(splitAtFolds(weldChains(fragments)))
    // One street per surviving chain. Divided roads emit two streets
    // (one per carriageway) — medians are emergent downstream.
    chains.forEach((c, i) => streets.push(makeStreet(
      chains.length === 1 ? slugify(name) : `${slugify(name)}-${i}`,
      name, fragments[0].tags, c
    )))
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
