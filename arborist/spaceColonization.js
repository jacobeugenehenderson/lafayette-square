/**
 * spaceColonization.js — Runions 2007 SCA + tropism, pure kernel.
 *
 * Algorithm summary (per cartograph/NOTES.md 2026-05-15 maxi-brief, Design
 * pillar #2): scatter N attractors inside a revolution envelope, grow a
 * branch-graph from trunkBase toward them by averaging unit vectors to
 * attractors-in-influence-radius and adding a tropism bias, kill attractors
 * within killRadius of any node, repeat until either no attractors remain in
 * range or maxIters is hit. Murray's law assigns branch radii post-order
 * (leaf = tipRadius; internal = sqrt(sum(child.r²))).
 *
 * The tropism vector is the load-bearing dial. Same algorithm produces all
 * four non-conifer silhouettes from envelope + tropism alone:
 *
 *   broadleaf  envelope=rounded_oval  tropism=(0,  0,    0)    → symmetric outward
 *   weeping    envelope=umbrella      tropism=(0, -0.4,  0)    → recurve, willow curtain
 *   columnar   envelope=tight_column  tropism=(0, +0.3,  0)    → upward bias
 *   ornamental envelope=broad_low     tropism=(0, -0.05, 0)    → softer, more horizontal
 *
 * Determinism: seedN drives mulberry32 — used for attractor scatter and
 * asymmetry sign. Same seedN → byte-identical output. Required for the
 * Phase A dice/adopt contract + writeIfChanged cache stability.
 *
 * No three.js imports — emits raw position arrays + parent pointers. The
 * mesh assembly (tapered cylinders, leaf cards) is generate-procedural.js's
 * job; this module is the pure computational kernel.
 *
 * Phase D scope: 4 of 5 species (broadleaf / weeping / columnar / ornamental).
 * Conifer keeps its existing free-growth code path until Phase E lands
 * monopodial whorl.
 */

const TAU = Math.PI * 2

// ── Phase C.1 anti-bias constants ───────────────────────────────────────
//
// The original SCA produces a metastable canopy lean: a ~5 cm random offset
// of the single growing tip gets amplified by attractor-killing into a
// per-seed asymmetric drift over ~100 iters (verified by Phase C bypass
// script, even with no lean and root at (0, 4.75, 0): tip centroid lands
// (-3.79, 7.75, 1.54)).
//
// Fix is structural, two parts:
//   1. After the auto-grow lift, force-extend the trunk straight up the
//      central axis to a height of (envelope start + envelope.height *
//      branchingStartFrac). Trunk-extension nodes are marked `axial` so
//      they do NOT participate in attractor-pull (only the canopy seeds
//      do). The extension's attractor-kill still happens normally, so the
//      lower envelope clears.
//   2. At trunkTop, seed N children evenly distributed in the XZ plane
//      (azimuth = k·τ/N). Each child is a normal SCA tip from iter 1,
//      giving symmetric coverage from the start. Bias on one sector is
//      balanced by symmetric tips on opposing sectors.
//
// Weeping morphology drapes BELOW the envelope start (offsetYFrac=-0.6),
// so a 0.5-frac extension would push trunk well past the natural canopy
// height; weeping gets a small frac (0.2) so trunk barely enters the
// envelope and branches have room to droop. The N-child seed is unchanged.
//
// Both values are configurable per-species via `sca.branchingStartFrac` /
// `sca.initialChildCount` (resolved through generate-procedural.js's
// resolveVariantParams overlay path).
const BRANCHING_START_FRAC_DEFAULT = 0.5
const BRANCHING_START_FRAC_WEEPING = 0.2
const INITIAL_CHILD_COUNT_DEFAULT = 6
const MAX_AXIAL_EXTENSION_SEGS = 32  // safety cap; H≤12m / step≤0.4m → ≤30

// C.1b: per-node branch fan-out cap. Once a node has this many direct
// children it stops accepting pull → bounds the runaway pocket-domination
// failure mode left by C.1 (one initial seed near a dense attractor pocket
// otherwise spawns a new child every iter from the same node, dragging
// centroid off-axis). Verified by 20-seed sweep (`_c1b_bypass.mjs`):
// dropping cap to 3 collapses bimodal tip-count distribution to single-
// modal 45–75 and zero seeds with cluster offset > 0.5 m across all four
// morphologies; weeping mean offset improves too (0.29 → 0.17 m) without
// breaking curtain descent. Overridable per-preset via `sca.maxChildrenPerNode`.
const MAX_CHILDREN_PER_NODE_DEFAULT = 3

// ── 2D revolution profiles ──────────────────────────────────────────────
//
// Each profile is a list of (t, r) pairs in normalized [0, 1] space.
// t is height fraction (0 = canopy bottom, 1 = canopy top); r is radius
// fraction (max radius at any height = envelope.width × profile_r(t)).
// Linear-interpolated between samples. Revolved around the Y axis to give
// the 3D attractor volume.
//
// These five profiles cover the 4 non-conifer morphologies. Phase D ships
// with them as a dropdown; a free-form curve editor is a later polish.
export const ENVELOPE_PROFILES = {
  rounded_oval:    [[0, 0],   [0.15, 0.85], [0.5, 1.0], [0.85, 0.85], [1, 0]],
  umbrella:        [[0, 1.0], [0.3, 0.95],  [0.6, 0.75], [0.85, 0.4], [1, 0]],
  tight_column:    [[0, 0],   [0.1, 0.6],   [0.5, 0.7], [0.9, 0.6],  [1, 0]],
  broad_low:       [[0, 0.1], [0.2, 0.9],   [0.55, 1.0], [0.85, 0.7], [1, 0]],
  asymmetric_oval: [[0, 0],   [0.15, 0.95], [0.5, 1.0], [0.85, 0.8],  [1, 0]],
}

// Default SCA + envelope per species. generate-procedural.js falls back to
// these when a PRESETS entry / overlay omits the field, so a fresh-checkout
// or partial operator overlay still produces a sensible silhouette.
// `offsetYFrac` shifts the envelope's vertical origin relative to
// trunkBase, expressed as a fraction of envelope.height. 0 = envelope
// bottom sits at trunkBase (normal canopy on top of trunk). Negative =
// envelope extends BELOW trunkBase (weeping curtain — branches arc up
// then droop through space behind the trunk top). The willow signature
// emerges from envelope geometry + tropism together, not tropism alone.
export const DEFAULT_SCA_BY_PRESET = {
  broad: {
    envelope: { profile: 'rounded_oval', asymmetry: 0, offsetYFrac: 0 },
    sca: { tropism: [0, 0,     0], attractorCount: 600, influenceRadius: 4.0, killRadius: 1.0, stepLength: 0.4, maxIters: 200, branchingStartFrac: 0.5, initialChildCount: 6, phyllotaxisMode: 'opposite', scaffoldEmergenceBias: 0.6, architecture: 'strong-leader', leaderStrength: 1.0 },
    deformers: { trunkWander: 0.08, trunkWavelength: 2.0, branchJitter: 0.1, barkRelief: 0.05 },
  },
  broadleaf: {
    envelope: { profile: 'rounded_oval', asymmetry: 0, offsetYFrac: 0 },
    sca: { tropism: [0, 0,     0], attractorCount: 600, influenceRadius: 4.0, killRadius: 1.0, stepLength: 0.4, maxIters: 200, branchingStartFrac: 0.5, initialChildCount: 6, phyllotaxisMode: 'opposite', scaffoldEmergenceBias: 0.6, architecture: 'strong-leader', leaderStrength: 1.0 },
    deformers: { trunkWander: 0.08, trunkWavelength: 2.0, branchJitter: 0.1, barkRelief: 0.05 },
  },
  weeping: {
    // Envelope hangs 60% below the trunk top so attractors extend into the
    // curtain zone. Strong −Y tropism pulls branches down through them.
    // C.1: tiny branchingStartFrac (0.2) means trunk barely extends into
    // the envelope so branches have room to droop. No upward emergence
    // bias — the curtain wants to fall, not lift. Stays on 'spreading' —
    // the curtain morphology needs apical scaffolds, not lateral seeding.
    envelope: { profile: 'umbrella',     asymmetry: 0, offsetYFrac: -0.6 },
    sca: { tropism: [0, -0.4,  0], attractorCount: 700, influenceRadius: 3.5, killRadius: 0.9, stepLength: 0.4, maxIters: 240, branchingStartFrac: 0.2, initialChildCount: 6, phyllotaxisMode: 'alternate', scaffoldEmergenceBias: 0, architecture: 'spreading', leaderStrength: 1.0 },
    deformers: { trunkWander: 0.10, trunkWavelength: 2.5, branchJitter: 0.15, barkRelief: 0.05 },
  },
  columnar: {
    // Verticality is the signature — strong-leader at full strength keeps
    // the central axis dominant and laterals running near-parallel.
    envelope: { profile: 'tight_column', asymmetry: 0, offsetYFrac: 0 },
    sca: { tropism: [0, +0.3,  0], attractorCount: 450, influenceRadius: 3.0, killRadius: 0.9, stepLength: 0.4, maxIters: 180, branchingStartFrac: 0.5, initialChildCount: 6, phyllotaxisMode: 'alternate', scaffoldEmergenceBias: 0.4, architecture: 'strong-leader', leaderStrength: 1.0 },
    deformers: { trunkWander: 0.05, trunkWavelength: 2.5, branchJitter: 0.05, barkRelief: 0.05 },
  },
  ornamental: {
    // Low broad form — 'spreading' keeps apical-radial scaffolding which
    // matches dogwood / redbud / crabapple silhouettes.
    envelope: { profile: 'broad_low',    asymmetry: 0, offsetYFrac: 0 },
    sca: { tropism: [0, -0.05, 0], attractorCount: 500, influenceRadius: 3.5, killRadius: 1.0, stepLength: 0.4, maxIters: 200, branchingStartFrac: 0.5, initialChildCount: 6, phyllotaxisMode: 'alternate', scaffoldEmergenceBias: 0.3, architecture: 'spreading', leaderStrength: 1.0 },
    deformers: { trunkWander: 0.08, trunkWavelength: 2.0, branchJitter: 0.1, barkRelief: 0.05 },
  },
}

// Decay length (m) for scaffoldEmergenceBias — bias is applied as
// `bias * exp(-pathLenFromTrunk / SCAFFOLD_EMERGENCE_DECAY_M)`, so values
// of pathLen ≪ decay produce nearly-full bias; values ≫ decay produce
// negligible bias. 1.5 m is the natural urban-broadleaf scale: the J of
// a Sugar Maple scaffold tightens up over the first ~1–2 m before the
// branch starts arcing outward.
const SCAFFOLD_EMERGENCE_DECAY_M = 1.5
// Pair half-angle (radians) — opposite-phyllotaxis children spawn at
// pullDir ± sin(θ) × pairAxis. ~28° gives a recognisable fishbone splay
// without exaggerating into a "Y" at every node.
const PAIR_HALF_ANGLE_RAD = 0.5

// ── PRNG ────────────────────────────────────────────────────────────────
//
// mulberry32: small, fast, well-distributed. Same seed → identical stream.
// Used for attractor scatter + per-tree asymmetry sign. We don't use it for
// leaf jitter (that's the v1 `seed()` hash in generate-procedural.js, kept
// for behavioral continuity across the Phase A↔D boundary).
export function mulberry32(seed) {
  let s = (seed | 0) || 1
  return function () {
    s = (s + 0x6D2B79F5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Envelope helpers ────────────────────────────────────────────────────

function profileR(profileName, t) {
  const profile = ENVELOPE_PROFILES[profileName] || ENVELOPE_PROFILES.rounded_oval
  if (t <= profile[0][0]) return profile[0][1]
  if (t >= profile[profile.length - 1][0]) return profile[profile.length - 1][1]
  for (let i = 1; i < profile.length; i++) {
    const [t1, r1] = profile[i]
    if (t1 < t) continue
    const [t0, r0] = profile[i - 1]
    const u = (t - t0) / (t1 - t0)
    return r0 + (r1 - r0) * u
  }
  return 0
}

// Uniform-by-volume rejection sampling inside the revolution envelope.
// `envelope.width` is the max canopy radius (matches v1 `canopyR` semantics
// — full canopy diameter is 2× width). `envelope.height` is the full crown
// height. `asymmetry ∈ [0, 1]` skews the cloud to one side (sign chosen
// once per tree from the PRNG, so a single asymmetry value gives a
// directionally-biased silhouette rather than symmetric jitter).
function scatterAttractors(envelope, count, rng) {
  const W = envelope.width
  const H = envelope.height
  const A = Math.max(0, Math.min(1, envelope.asymmetry || 0))
  const biasSign = rng() < 0.5 ? -1 : 1   // fixed once per tree
  const pts = []
  let tries = 0
  const maxTries = count * 8
  while (pts.length < count && tries < maxTries) {
    tries++
    const t = rng()
    const rMax = profileR(envelope.profile, t) * W
    if (rMax <= 0.0001) continue
    const r = Math.sqrt(rng()) * rMax   // sqrt() = uniform disk sampling
    const θ = rng() * TAU
    let x = r * Math.cos(θ)
    const z = r * Math.sin(θ)
    const y = t * H
    // One-sided asymmetric scaling: positive-X side (relative to biasSign)
    // stretches outward; negative side stays put. Produces a visibly skewed
    // silhouette that looks like wind-shaped growth.
    if (A > 0 && x * biasSign > 0) x *= (1 + A)
    pts.push([x, y, z])
  }
  return pts
}

// ── Growth loop ─────────────────────────────────────────────────────────

function squaredDistance(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}

// ── Vector helpers for opposite-phyllotaxis pair geometry ────────────────
function _normalize3(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}
function _cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
function _dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

// ── Deformer helpers (Phase D.2) ─────────────────────────────────────────
// `getTrunkWander` produces a deterministic XZ wander curve along world-Y,
// anchored at (0, 0) for y <= wanderOriginY (so the planted flare stays
// straight) and growing to full amplitude over the first metre above.
// Both the visible trunk geometry and the SCA axial extension query the
// same function so the canopy attaches cleanly to the wandered shaft.
function _wanderHash(seedN, ctrlIdx, channel) {
  const x = (seedN | 0) * 9311 + ctrlIdx * 1471 + channel * 7919
  const r = Math.sin(x * 12.9898) * 43758.5453
  return 2 * (r - Math.floor(r)) - 1   // [-1, 1]
}
export function getTrunkWander(seedN, worldY, wanderOriginY, amplitude, wavelength) {
  const yRel = worldY - wanderOriginY
  if (amplitude <= 0 || yRel <= 0 || wavelength <= 0) return [0, 0]
  const ctrlLo = Math.floor(yRel / wavelength)
  const t = (yRel - ctrlLo * wavelength) / wavelength
  // Cosine-smoothed t → tangent-continuous transitions between control
  // points (linear-lerp produces visible corners on a swept-polyline trunk).
  const ts = 0.5 - 0.5 * Math.cos(t * Math.PI)
  const xLo = _wanderHash(seedN, ctrlLo,     0)
  const xHi = _wanderHash(seedN, ctrlLo + 1, 0)
  const zLo = _wanderHash(seedN, ctrlLo,     1)
  const zHi = _wanderHash(seedN, ctrlLo + 1, 1)
  // Linear ramp 0→1 over the first metre so the wander grows smoothly out
  // of the planted base instead of starting mid-amplitude one stepLength up.
  const ampRamp = Math.min(1, yRel / 1.0)
  return [
    (xLo + ts * (xHi - xLo)) * amplitude * ampRamp,
    (zLo + ts * (zHi - zLo)) * amplitude * ampRamp,
  ]
}

// `_jitterPerp` returns a deterministic perpendicular offset of magnitude
// `scale`, used to wobble each SCA branch-spawn off the pull direction so
// branches read as organic rather than ruler-straight along each axis.
function _jitterHash(seedN, idx) {
  const x = ((seedN | 0) + idx) * 12.9898
  const v = Math.sin(x) * 43758.5453
  return 2 * (v - Math.floor(v)) - 1
}
function _jitterPerp(seedN, hashIdx, parentDir, scale) {
  if (scale <= 0) return [0, 0, 0]
  let upRef = [0, 1, 0]
  if (Math.abs(_dot3(parentDir, upRef)) > 0.98) upRef = [1, 0, 0]
  const u0 = _normalize3(_cross3(parentDir, upRef))
  const v0 = _cross3(parentDir, u0)
  const r1 = _jitterHash(seedN, hashIdx * 7 + 3)
  const r2 = _jitterHash(seedN, hashIdx * 7 + 11)
  return [
    (r1 * u0[0] + r2 * v0[0]) * scale,
    (r1 * u0[1] + r2 * v0[1]) * scale,
    (r1 * u0[2] + r2 * v0[2]) * scale,
  ]
}

// Returns null when no further growth is possible (either every attractor
// has been killed or no node is in influence range of any remaining
// attractor — the natural stopping condition).
function runGrowthLoop({ nodes, attractors, sca, seedN, branchJitter = 0 }) {
  const { tropism, influenceRadius, killRadius, stepLength, maxIters } = sca
  const inflSq = influenceRadius * influenceRadius
  const killSq = killRadius * killRadius
  const childCap = (sca.maxChildrenPerNode !== undefined)
    ? sca.maxChildrenPerNode : MAX_CHILDREN_PER_NODE_DEFAULT
  const phyllotaxisMode = sca.phyllotaxisMode || 'alternate'
  // In strong-leader architecture the per-scaffold `localTropism` carries
  // the sustained +Y bias for the LIFETIME of the scaffold chain, so the
  // base-decay `scaffoldEmergenceBias` ("Lift") is redundant — zero it
  // here to avoid double-lift when the operator imports a spreading-mode
  // Lift value onto a strong-leader slot by mistake. UI hides the Lift
  // slider in this mode; this is the defense-in-depth.
  const architecture = sca.architecture || 'spreading'
  const emergenceBias = architecture === 'strong-leader'
    ? 0
    : (sca.scaffoldEmergenceBias ?? 0)
  // Opposite mode spawns 2 children per event; alternate spawns 1. The
  // pull-filter uses this to skip nodes that would exceed the cap mid-pair
  // (we don't degrade a pair into a single — pairs preserve the species
  // signature).
  const spawnIncrement = phyllotaxisMode === 'opposite' ? 2 : 1

  for (let iter = 0; iter < maxIters; iter++) {
    if (attractors.length === 0) break

    // 1. Pull accumulation — for each attractor, find its nearest node;
    //    if that node is within influenceRadius, the attractor votes for
    //    it with unit-vector(attractor - node).
    const pullByNode = new Map()
    for (const a of attractors) {
      let bestIdx = -1, bestSq = Infinity
      for (let i = 0; i < nodes.length; i++) {
        // C.1: axial trunk-extension nodes do not attract; canopy seeds do.
        // This keeps the trunk straight while the N azimuthal children
        // share attractor-pull symmetrically.
        // C.1b: nodes that would exceed childCap after this iter's spawn
        // (1 in alternate, 2 in opposite) also stop attracting → attractor
        // flows to next-nearest tip, bounding per-node fan-out.
        if (nodes[i].axial) continue
        if (nodes[i].children.length + spawnIncrement > childCap) continue
        const sq = squaredDistance(a, nodes[i].pos)
        if (sq < bestSq) { bestSq = sq; bestIdx = i }
      }
      if (bestIdx < 0 || bestSq > inflSq) continue
      const node = nodes[bestIdx]
      const dx = a[0] - node.pos[0]
      const dy = a[1] - node.pos[1]
      const dz = a[2] - node.pos[2]
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      let acc = pullByNode.get(node)
      if (!acc) { acc = [0, 0, 0]; pullByNode.set(node, acc) }
      acc[0] += dx / len
      acc[1] += dy / len
      acc[2] += dz / len
    }
    if (pullByNode.size === 0) break

    // 2. Spawn child(ren) per pulled node.
    //
    // (B) Scaffold emergence bias: near the scaffold seed, add a decaying
    //     +Y term to growDir so primary scaffolds leave the trunk closer
    //     to vertical and open outward as they age. Decays exponentially
    //     in path length from the scaffold seed.
    //
    // (A) Opposite phyllotaxis: pair-spawn two children at pullDir ±
    //     sin(θ) × pairAxis, where pairAxis lies in the plane perpendicular
    //     to the parent edge, rotated by 0° or 90° per generation
    //     (pairDepth parity). Produces the decussate "fishbone" Sugar
    //     Maple silhouette. Alternate mode (default for non-broadleaf)
    //     keeps the legacy single-child spawn.
    const newNodes = []
    for (const [node, pull] of pullByNode) {
      const pathLen = node.pathLenFromTrunk || 0
      const biasY = emergenceBias * Math.exp(-pathLen / SCAFFOLD_EMERGENCE_DECAY_M)

      // Per-node localTropism (Phase G.0 strong-leader): each scaffold seed
      // carries a [0, +leaderStrength*0.4, 0] vector that propagates to
      // every descendant of the chain. Summed with global tropism — global
      // tropism (e.g. windward lean) still applies on top.
      const lt = node.localTropism
      const gx = pull[0] + tropism[0] + (lt ? lt[0] : 0)
      const gy = pull[1] + tropism[1] + biasY + (lt ? lt[1] : 0)
      const gz = pull[2] + tropism[2] + (lt ? lt[2] : 0)
      const glen = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1
      const pullDir = [gx / glen, gy / glen, gz / glen]

      const newPathLen = pathLen + stepLength
      const newDepth = (node.pairDepth || 0) + 1

      // Per-edge perpendicular jitter — wobbles each spawn off the
      // pull-direction line so branches read as organic rather than
      // ruler-straight. Magnitude = branchJitter × stepLength; direction
      // hashed deterministically from (seedN, node identity, child).
      const jitterScale = branchJitter * stepLength
      const jitterIdx = nodes.length * 17  // unique per spawn event
      let parentDirForJitter = [0, 1, 0]
      if (node.parent) {
        const dx = node.pos[0] - node.parent.pos[0]
        const dy = node.pos[1] - node.parent.pos[1]
        const dz = node.pos[2] - node.parent.pos[2]
        parentDirForJitter = _normalize3([dx, dy, dz])
      }

      if (phyllotaxisMode === 'opposite') {
        // Parent edge direction (forward axis of the pair plane).
        const parent = node.parent
        let parentDir = [0, 1, 0]
        if (parent) {
          const dx = node.pos[0] - parent.pos[0]
          const dy = node.pos[1] - parent.pos[1]
          const dz = node.pos[2] - parent.pos[2]
          parentDir = _normalize3([dx, dy, dz])
        }
        // Build a unit perp basis (u0, v0) in the plane ⟂ parentDir.
        // Fall back to X-up if parentDir is nearly vertical (cross with Y
        // collapses there).
        let upRef = [0, 1, 0]
        if (Math.abs(_dot3(parentDir, upRef)) > 0.98) upRef = [1, 0, 0]
        const u0 = _normalize3(_cross3(parentDir, upRef))
        const v0 = _cross3(parentDir, u0)  // already unit
        // Rotate by 0° or 90° per generation (decussate plane flip).
        const azim = (newDepth & 1) ? Math.PI / 2 : 0
        const c = Math.cos(azim), s = Math.sin(azim)
        const u = [u0[0] * c + v0[0] * s, u0[1] * c + v0[1] * s, u0[2] * c + v0[2] * s]
        const sa = Math.sin(PAIR_HALF_ANGLE_RAD)
        const dirA = _normalize3([pullDir[0] + sa * u[0], pullDir[1] + sa * u[1], pullDir[2] + sa * u[2]])
        const dirB = _normalize3([pullDir[0] - sa * u[0], pullDir[1] - sa * u[1], pullDir[2] - sa * u[2]])
        const jA = _jitterPerp(seedN, jitterIdx + 0, parentDirForJitter, jitterScale)
        const jB = _jitterPerp(seedN, jitterIdx + 1, parentDirForJitter, jitterScale)
        const childA = {
          pos: [
            node.pos[0] + dirA[0] * stepLength + jA[0],
            node.pos[1] + dirA[1] * stepLength + jA[1],
            node.pos[2] + dirA[2] * stepLength + jA[2],
          ],
          parent: node, children: [], radius: 0,
          pathLenFromTrunk: newPathLen, pairDepth: newDepth,
          localTropism: node.localTropism,
        }
        const childB = {
          pos: [
            node.pos[0] + dirB[0] * stepLength + jB[0],
            node.pos[1] + dirB[1] * stepLength + jB[1],
            node.pos[2] + dirB[2] * stepLength + jB[2],
          ],
          parent: node, children: [], radius: 0,
          pathLenFromTrunk: newPathLen, pairDepth: newDepth,
          localTropism: node.localTropism,
        }
        node.children.push(childA, childB)
        newNodes.push(childA, childB)
      } else {
        const j = _jitterPerp(seedN, jitterIdx, parentDirForJitter, jitterScale)
        const child = {
          pos: [
            node.pos[0] + pullDir[0] * stepLength + j[0],
            node.pos[1] + pullDir[1] * stepLength + j[1],
            node.pos[2] + pullDir[2] * stepLength + j[2],
          ],
          parent: node, children: [], radius: 0,
          pathLenFromTrunk: newPathLen, pairDepth: newDepth,
          localTropism: node.localTropism,
        }
        node.children.push(child)
        newNodes.push(child)
      }
    }
    for (const n of newNodes) nodes.push(n)

    // 3. Kill attractors within killRadius of any (new or existing) node.
    //    Cheap brute-force; at our scale 600 × ~few-hundred = fine.
    attractors = attractors.filter(a => {
      for (let i = 0; i < nodes.length; i++) {
        if (squaredDistance(a, nodes[i].pos) <= killSq) return false
      }
      return true
    })
  }
  return { nodes, attractorsRemaining: attractors.length }
}

// Murray's law: leaf nodes get tipRadius; every internal node's radius is
// sqrt(sum(child_radius²)). Walks once post-order so radii are stable in
// O(N). Trunk's radius is whatever Murray's law gives the SCA root.
function computeRadii(root, tipRadius) {
  // Iterative post-order to avoid recursion stack overflow on deep trees.
  const stack = [{ node: root, visited: false }]
  while (stack.length) {
    const frame = stack[stack.length - 1]
    if (!frame.visited) {
      frame.visited = true
      for (const c of frame.node.children) stack.push({ node: c, visited: false })
    } else {
      stack.pop()
      const n = frame.node
      if (n.children.length === 0) {
        n.radius = tipRadius
      } else {
        let sumSq = 0
        for (const c of n.children) sumSq += c.radius * c.radius
        n.radius = Math.sqrt(sumSq)
      }
    }
  }
}

// ── Public entry point ──────────────────────────────────────────────────

export function runSCA({
  envelope,
  sca,
  seedN,
  trunkBase,
  tipRadius = 0.015,
  // Phase D.2 deformers — passed through from generator. Defaults make the
  // function bit-identical to the pre-D.2 behaviour for legacy callers.
  deformers = {},
}) {
  const trunkWander     = deformers.trunkWander ?? 0
  const trunkWavelength = deformers.trunkWavelength ?? 2.0
  const wanderOriginY   = deformers.wanderOriginY ?? 0
  const branchJitter    = deformers.branchJitter ?? 0
  // Use a derived seed offset so the SCA's PRNG stream doesn't collide
  // with the v1 seed() hash that generate-procedural.js still uses for
  // trunk lean / leaf-card jitter / etc.
  const rng = mulberry32((seedN | 0) * 1664525 + 1013904223)

  // Envelope sits relative to trunkBase: profile-y=0 maps to
  //   trunkBase[1] + offsetYFrac * envelope.height
  // Default offsetYFrac=0 means the envelope's bottom sits AT the trunk
  // top (canopy grows upward from the trunk). Weeping uses offsetYFrac<0
  // so the envelope hangs below the trunk top — required for the willow
  // curtain to have space to drape into.
  const env = {
    profile:   envelope.profile,
    width:     envelope.width,
    height:    envelope.height,
    asymmetry: envelope.asymmetry || 0,
  }
  const yOffset = (envelope.offsetYFrac || 0) * envelope.height
  const localAttractors = scatterAttractors(env, sca.attractorCount, rng)
  const attractors = localAttractors.map(([x, y, z]) => [
    x + trunkBase[0],
    y + trunkBase[1] + yOffset,
    z + trunkBase[2],
  ])

  // Initialize tree. Trunk auto-grow: extend up by stepLength until any
  // attractor falls into influenceRadius — prevents stalling when trunk
  // top starts below the envelope's lowest point. Wander (if configured)
  // displaces each axial node's XZ so the chain follows the visible-trunk
  // shaft sinuosity.
  const rootWander = getTrunkWander(seedN, trunkBase[1], wanderOriginY, trunkWander, trunkWavelength)
  const root = {
    pos: [trunkBase[0] + rootWander[0], trunkBase[1], trunkBase[2] + rootWander[1]],
    parent: null, children: [], radius: 0, axial: true,
  }
  const nodes = [root]
  const inflSq = sca.influenceRadius * sca.influenceRadius
  for (let lift = 0; lift < 8; lift++) {  // hard cap — never lift more than 8×stepLength
    let inRange = false
    for (const a of attractors) {
      if (squaredDistance(a, nodes[nodes.length - 1].pos) <= inflSq) { inRange = true; break }
    }
    if (inRange) break
    const last = nodes[nodes.length - 1]
    const newY = last.pos[1] + sca.stepLength
    const w = getTrunkWander(seedN, newY, wanderOriginY, trunkWander, trunkWavelength)
    const next = {
      pos: [trunkBase[0] + w[0], newY, trunkBase[2] + w[1]],
      parent: last, children: [], radius: 0, axial: true,
    }
    last.children.push(next)
    nodes.push(next)
  }

  // ── Phase C.1: deterministic axial trunk extension to branching-start
  // height. Eliminates the single-tip bias-amplification window. Weeping
  // morphology uses a much smaller frac so the trunk doesn't pierce above
  // the curtain zone. See file-top constants.
  //
  // Phase G.0 (strong-leader, 2026-05-19): in `strong-leader` architecture
  // the axial chain continues past branchingStartY to `leaderStrength` of
  // envelope height — the central trunk threads through the crown the way
  // Rauh's-model species (Sugar Maple / ash / basswood) topologically work.
  // Lateral scaffolds attach AT distributed Y positions along this chain
  // (not all bundled at one apex), each carrying a sustained per-scaffold
  // +Y tropism. `spreading` architecture (oak / elm / weeping / dogwood)
  // keeps the original behaviour: axial stops at branchingStartY, N
  // scaffolds emerge azimuthally distributed across the upper zone.
  const architecture = sca.architecture || 'spreading'
  const leaderStrength = sca.leaderStrength ?? 1.0
  const isWeeping = (envelope.profile === 'umbrella') ||
                    (envelope.offsetYFrac !== undefined && envelope.offsetYFrac < -0.1)
  const fallbackFrac = isWeeping ? BRANCHING_START_FRAC_WEEPING : BRANCHING_START_FRAC_DEFAULT
  const branchingStartFrac = (sca.branchingStartFrac !== undefined)
    ? sca.branchingStartFrac : fallbackFrac
  const branchingStartY = trunkBase[1] + yOffset + envelope.height * branchingStartFrac
  const axialTopY = (architecture === 'strong-leader')
    ? trunkBase[1] + yOffset + envelope.height * Math.max(branchingStartFrac, leaderStrength)
    : branchingStartY
  for (let seg = 0; seg < MAX_AXIAL_EXTENSION_SEGS; seg++) {
    const last = nodes[nodes.length - 1]
    if (last.pos[1] >= axialTopY) break
    const newY = last.pos[1] + sca.stepLength
    const w = getTrunkWander(seedN, newY, wanderOriginY, trunkWander, trunkWavelength)
    const next = {
      pos: [trunkBase[0] + w[0], newY, trunkBase[2] + w[1]],
      parent: last, children: [], radius: 0, axial: true,
    }
    last.children.push(next)
    nodes.push(next)
  }

  // ── Phase C.1 + D.1a: seed N azimuthally-distributed initial children
  // STAGGERED across the upper axial chain (not all at the topmost node).
  // C.1 originally parented all N to trunkTopNode — that produces the
  // canonical "umbrella spider" topology where all primary scaffolds
  // radiate from one shared point. Real broadleaves emerge scaffolds at
  // different heights over a 1–3 m zone.
  //
  // The original wedge-balancing rationale survives: azimuths still span
  // TAU uniformly, so per-seed iter-1 bias on one sector is still
  // balanced by tips on opposing sectors. The only change is that the
  // tips are now at different Ys, sharing different axial parents.
  //
  // `sca.scaffoldZoneFrac` controls how much of the axial chain hosts
  // scaffold emergences. 0 = all at the top (legacy / weeping). 0.5 =
  // top half of the axial chain. 1.0 = the entire axial chain. Weeping
  // is force-pinned to 0 so the curtain stays tight at the trunk top.
  const initialChildCount = (sca.initialChildCount !== undefined)
    ? Math.max(1, sca.initialChildCount | 0) : INITIAL_CHILD_COUNT_DEFAULT
  const seedStep = isWeeping
    ? sca.stepLength * 0.5
    : Math.max(sca.stepLength * 0.5, envelope.width * 0.25)

  // Collect axial-node indices into the global `nodes` array.
  const axialNodeIndices = []
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].axial) axialNodeIndices.push(i)
  }
  const totalAxial = axialNodeIndices.length

  if (architecture === 'strong-leader') {
    // ── Phase G.0 strong-leader (Rauh's botanical model, 2026-05-19).
    // Lateral scaffolds at N distributed Y positions along the axial
    // chain, between `branchingStartFrac` and 0.9 of envelope height.
    // Each scaffold seed carries a `localTropism` of [0, leaderStrength*0.4, 0]
    // that propagates to every descendant of the chain — produces the
    // fasciculate Sugar Maple silhouette where scaffolds arc up and run
    // near-parallel to the trunk instead of spreading wide. Per-scaffold
    // azimuth is drawn from the rng (random, not evenly distributed)
    // since lateral emission in real Rauh's-model species is sparse +
    // helical, not radially symmetric.
    const yLo = trunkBase[1] + yOffset + envelope.height * branchingStartFrac
    const yHi = trunkBase[1] + yOffset + envelope.height * 0.9
    const localTropism = [0, leaderStrength * 0.4, 0]
    for (let k = 0; k < initialChildCount; k++) {
      const t = initialChildCount === 1 ? 0.5 : k / (initialChildCount - 1)
      const targetY = yLo + (yHi - yLo) * t
      // Find the axial node whose Y is closest to targetY.
      let parent = nodes[axialNodeIndices[0]]
      let bestDy = Math.abs(parent.pos[1] - targetY)
      for (let i = 1; i < totalAxial; i++) {
        const n = nodes[axialNodeIndices[i]]
        const dy = Math.abs(n.pos[1] - targetY)
        if (dy < bestDy) { bestDy = dy; parent = n }
      }
      const az = rng() * TAU
      const child = {
        pos: [
          parent.pos[0] + Math.cos(az) * seedStep,
          parent.pos[1] + seedStep * 0.5,
          parent.pos[2] + Math.sin(az) * seedStep,
        ],
        parent, children: [], radius: 0,
        pathLenFromTrunk: 0, pairDepth: 0,
        localTropism,
      }
      parent.children.push(child)
      nodes.push(child)
    }
    // When the leader doesn't thread all the way through, seed a single
    // apical SCA tip at the topmost axial node so the upper envelope still
    // gets growth. The tip has NO localTropism — it grows by attractor
    // pull alone, taking over as a regular spreading-mode top. Per the
    // brief: "0.5 = halfway then becomes a normal SCA tip."
    if (leaderStrength < 0.95) {
      const topAxial = nodes[axialNodeIndices[totalAxial - 1]]
      const apical = {
        pos: [topAxial.pos[0], topAxial.pos[1] + seedStep * 0.5, topAxial.pos[2]],
        parent: topAxial, children: [], radius: 0,
        pathLenFromTrunk: 0, pairDepth: 0,
      }
      topAxial.children.push(apical)
      nodes.push(apical)
    }
  } else {
    // ── Phase C.1 + D.1a spreading architecture: seed N azimuthally-
    // distributed initial children STAGGERED across the upper axial
    // chain (not all at the topmost node). C.1 originally parented all
    // N to trunkTopNode — that produces the canonical "umbrella spider"
    // topology where all primary scaffolds radiate from one shared
    // point. Real broadleaves emerge scaffolds at different heights
    // over a 1–3 m zone.
    //
    // The original wedge-balancing rationale survives: azimuths still
    // span TAU uniformly, so per-seed iter-1 bias on one sector is
    // still balanced by tips on opposing sectors. The only change is
    // that the tips are now at different Ys, sharing different axial
    // parents.
    //
    // `sca.scaffoldZoneFrac` controls how much of the axial chain hosts
    // scaffold emergences. 0 = all at the top (legacy / weeping). 0.5
    // = top half of the axial chain. 1.0 = the entire axial chain.
    // Weeping is force-pinned to 0 so the curtain stays tight at the
    // trunk top.
    const scaffoldZoneFrac = isWeeping
      ? 0
      : (sca.scaffoldZoneFrac !== undefined ? sca.scaffoldZoneFrac : 0.5)
    const zoneCount = Math.max(1, Math.round(totalAxial * scaffoldZoneFrac))
    const zoneStart = totalAxial - zoneCount
    for (let k = 0; k < initialChildCount; k++) {
      const tInZone = initialChildCount === 1 ? 0 : k / (initialChildCount - 1)
      const zoneIdx = Math.min(zoneCount - 1, Math.floor(tInZone * zoneCount))
      const parent = nodes[axialNodeIndices[zoneStart + zoneIdx]]
      const az = (k / initialChildCount) * TAU
      const child = {
        pos: [
          parent.pos[0] + Math.cos(az) * seedStep,
          parent.pos[1] + seedStep * 0.5,
          parent.pos[2] + Math.sin(az) * seedStep,
        ],
        parent, children: [], radius: 0,
        pathLenFromTrunk: 0, pairDepth: 0,
      }
      parent.children.push(child)
      nodes.push(child)
    }
  }

  runGrowthLoop({ nodes, attractors, sca, seedN, branchJitter })
  computeRadii(root, tipRadius)

  return { root, nodes }
}
