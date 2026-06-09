#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// POLYGON-FIRST LITMUS · curb-is-parallel-to-its-chain
//
// The enforceable definition of "the curb is a frozen polygon, not a live
// re-stroke": a correct curb is `chain ⊕ halfWidth` — a PARALLEL OFFSET of its
// centerline. So along any straight run, the distance from the chain to the
// curb must equal the street's asphalt half-width, everywhere except inside a
// genuine corner's fillet. Deviation from that is the artifact (the "d" bulge).
//
// This runs against the LIVE producer (`buildTileGround`) — the same engine
// Survey renders — so it is RED exactly while the curb is still a chain-derived
// union-carve, and GREEN when the curb becomes a clean frozen offset. It turns
// "Polygon-First" from a claimed noun into a checked invariant.
//
// Method: for each run (a tile edge = a centerline segment), sample the chain,
// raycast inward to the curb ring `iA`, and compare the hit distance to the
// run's authored half-width. Samples within a fillet-margin of the run's ends
// are excluded (a genuine corner legitimately curves). Run: `node
// cartograph/litmus-curb-parallel.mjs`. Exit non-zero if any run violates.
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

// ── tunables ──────────────────────────────────────────────────────────────
const TOL = 0.75        // m — max allowed |curb-offset − halfWidth| on a straight run
const FILLET_MARGIN = 9 // m — exclude samples this close to a run end (corner/junction zone).
//   ⚠️ DELIBERATELY CONSERVATIVE — and this is the whole point. The divided-transition "d" bulge
//   lives INSIDE this margin (~6–12 m from the node), so this Tier-1 check is BLIND to it: a cheap
//   parallelism heuristic cannot separate the artifact bulge from a legitimate corner fillet, because
//   both deviate in the junction zone. Widening the margin to reach the bulge floods the result with
//   real-corner false positives. The honest conclusion: the trustworthy gate is the TIER-2 IDENTITY
//   TEST — actual curb == the frozen clean-offset curb (with constructed corners) — which can only be
//   written once the freeze exists (the D6a/b work). So this litmus proves the WEAKER claim ("the curb
//   is non-parallel even in straight middles, away from any corner") — which is already enough to
//   disprove "the curb is a parallel offset." It does NOT certify which junction-zone bows are
//   artifacts; only the freeze + identity test does. See cartograph/POLYGON-FIRST.md.
const STEP = 0.5        // m — chain sampling interval
const MIN_RUN = 22      // m — runs shorter than this are all-corner; skip (no straight middle)
const RAY_CAP = 4.5     // m — a curb hit beyond halfWidth+this is the OPPOSITE curb (thin tile); ignore
const MAX_TILE_SPAN = 250 // m — skip the perimeter megatile (iA = the whole-map ring)

// ── geometry helpers ────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const len = (a) => Math.hypot(a[0], a[1])
function polyCentroid(ring) {
  let x = 0, y = 0
  for (const p of ring) { x += p[0]; y += p[1] }
  return [x / ring.length, y / ring.length]
}
// first hit distance of ray O+tD (D unit) against a set of [A,B] segments, t>eps
function rayHit(O, D, edges) {
  let best = Infinity
  for (const [A, B] of edges) {
    const E = sub(B, A)
    const den = cross(E, D)
    if (Math.abs(den) < 1e-12) continue
    const W = sub(A, O)
    const t = cross(E, W) / den
    const s = cross(D, W) / den
    if (t > 1e-4 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t
  }
  return best
}

// ── load + build ────────────────────────────────────────────────────────────
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const pr = buildTileGround(ribbons, {
  stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  blockCustoms: null, emitArtifact: true,
})
const tiles = pr._shapeArtifact || []

// ── the check ───────────────────────────────────────────────────────────────
const violations = []
let runsChecked = 0
for (let ti = 0; ti < tiles.length; ti++) {
  const tile = tiles[ti]
  if (!tile?.iA?.length) continue
  // skip the perimeter megatile — its iA is the whole-map ring, not a block curb
  let xn = Infinity, xx = -Infinity, yn = Infinity, yx = -Infinity
  for (const p of tile.ring) { xn = Math.min(xn, p[0]); xx = Math.max(xx, p[0]); yn = Math.min(yn, p[1]); yx = Math.max(yx, p[1]) }
  if (Math.hypot(xx - xn, yx - yn) > MAX_TILE_SPAN) continue
  const edges = []
  for (const ring of tile.iA) for (let i = 0; i < ring.length; i++) edges.push([ring[i], ring[(i + 1) % ring.length]])

  for (const run of tile.runs || []) {
    const poly = run.poly
    if (!poly || poly.length < 2) continue
    let L = 0
    for (let i = 1; i < poly.length; i++) L += len(sub(poly[i], poly[i - 1]))
    if (L < MIN_RUN) continue
    const hwL = run.measure?.left?.pavementHW || 0
    const hwR = run.measure?.right?.pavementHW || 0
    if (hwL < 0.5 && hwR < 0.5) continue
    runsChecked++

    // For each sample on the chain, find the LOCAL curb: raycast both normals,
    // accept a hit only within [0.1, hw+RAY_CAP] of its side's half-width, and
    // take the nearer (the real curb for this tile is the one within reach).
    let worst = 0, worstAt = null, worstSide = null, along = 0
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i]
      const segLen = len(sub(b, a)) || 1
      const fwd = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen]
      const leftN = [-fwd[1], fwd[0]]
      const rightN = [fwd[1], -fwd[0]]
      for (let d = 0; d <= segLen; d += STEP) {
        const aAlong = along + d
        if (aAlong < FILLET_MARGIN || aAlong > L - FILLET_MARGIN) continue
        const O = [a[0] + (b[0] - a[0]) * (d / segLen), a[1] + (b[1] - a[1]) * (d / segLen)]
        let best = Infinity, bestDev = null, bestSide = null
        for (const [nrm, hw, sd] of [[leftN, hwL, 'left'], [rightN, hwR, 'right']]) {
          if (!(hw > 0.5)) continue
          const hit = rayHit(O, nrm, edges)
          if (!isFinite(hit) || hit < 0.1 || hit > hw + RAY_CAP) continue
          if (hit < best) { best = hit; bestDev = Math.abs(hit - hw); bestSide = sd }
        }
        if (bestDev != null && bestDev > worst) { worst = bestDev; worstAt = O; worstSide = bestSide }
      }
      along += segLen
    }
    if (worst > TOL) {
      violations.push({ tile: ti, skelId: run.skelId, side: worstSide, hw: +(worstSide === 'left' ? hwL : hwR).toFixed(2), maxDev: +worst.toFixed(2), at: worstAt?.map(v => +v.toFixed(1)) })
    }
  }
}

violations.sort((a, b) => b.maxDev - a.maxDev)
console.log(`POLYGON-FIRST LITMUS · curb ∥ chain`)
console.log(`  runs checked: ${runsChecked}   tolerance: ${TOL}m off-parallel (excl. ${FILLET_MARGIN}m corner margin)`)
console.log(`  VIOLATIONS: ${violations.length}\n`)
for (const v of violations.slice(0, 25)) {
  console.log(`  tile ${String(v.tile).padStart(3)}  ${(v.skelId || '?').padEnd(22)} side=${v.side.padEnd(5)} hw=${String(v.hw).padStart(5)}  curb bows ${String(v.maxDev).padStart(5)}m off-parallel  @ ${v.at}`)
}
if (violations.length > 25) console.log(`  … and ${violations.length - 25} more`)
console.log(violations.length
  ? `\n❌ RED (Tier-1) — even in straight middles, away from any corner, the curb is not a parallel\n   offset of its chain. The curb is re-stroked live (a union-carve), not a frozen polygon.\n   This is the WEAKER, certain claim. It does NOT include the junction-zone "d" bulges — those\n   need the Tier-2 identity test (curb == frozen clean offset), writable only once the freeze\n   exists. See cartograph/POLYGON-FIRST.md.`
  : `\n✅ GREEN (Tier-1) — every straight-run middle is parallel to its chain. (Does not certify the\n   junction zone — that is Tier-2.)`)
process.exit(violations.length ? 1 : 0)
