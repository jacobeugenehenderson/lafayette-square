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

const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

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
pr2('max-turn',   flaggedNames(turnFlags))
pr2('width-step', flaggedNames(stepFlags))
pr2('curb∥chain', flaggedNames(curbFlags))
pr2('iA self-int',flaggedNames(selfIntFlags))
pr2('face-closure',flaggedNames(faceFlags))
console.log('  ' + '─'.repeat(60))
pr2('ANY invariant', allFlagged)

// confusion matrix vs the 35
const gridNames = new Set(streets.map(s => s.name).filter(n => !isCurated(n)))
const TP = [...allFlagged].filter(isCurated)
const FN = [...curatedNames].filter(n => !allFlagged.has(n))
const FP = [...allFlagged].filter(n => !isCurated(n))
const ND = curatedNames.size   // 31 distinct curated names
console.log('\nCONFUSION (current frame, ANY invariant) — measured per curated NAME:')
console.log(`  recall    = ${TP.length}/${ND}  (${(100*TP.length/ND).toFixed(0)}%)  curated names flagged`)
console.log(`  precision = ${TP.length}/${allFlagged.size}  (${allFlagged.size?(100*TP.length/allFlagged.size).toFixed(0):0}%)  of flags are curated`)
console.log(`  grid FP   = ${FP.length}/${gridNames.size} clean-grid names flagged`)

console.log('\nFLAGGED CURATED (true positives):')
for (const n of [...curatedNames].filter(n=>allFlagged.has(n)).sort()) {
  const tags = []
  if (turnFlags[n])   tags.push(`turn(${turnFlags[n].jags}j,${turnFlags[n].worst}°)`)
  if (stepFlags[n])   tags.push(`step(${stepFlags[n].step}m:${stepFlags[n].a}/${stepFlags[n].b})`)
  if (curbFlags[n])   tags.push(`curb(${curbFlags[n]}m)`)
  if (selfIntFlags[n])tags.push(`selfint(${selfIntFlags[n]})`)
  if (faceFlags[n])   tags.push(`face(${faceFlags[n]})`)
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
