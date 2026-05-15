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
    sca: { tropism: [0, 0,     0], attractorCount: 600, influenceRadius: 4.0, killRadius: 1.0, stepLength: 0.4, maxIters: 200 },
  },
  broadleaf: {
    envelope: { profile: 'rounded_oval', asymmetry: 0, offsetYFrac: 0 },
    sca: { tropism: [0, 0,     0], attractorCount: 600, influenceRadius: 4.0, killRadius: 1.0, stepLength: 0.4, maxIters: 200 },
  },
  weeping: {
    // Envelope hangs 60% below the trunk top so attractors extend into the
    // curtain zone. Strong −Y tropism pulls branches down through them.
    envelope: { profile: 'umbrella',     asymmetry: 0, offsetYFrac: -0.6 },
    sca: { tropism: [0, -0.4,  0], attractorCount: 700, influenceRadius: 3.5, killRadius: 0.9, stepLength: 0.4, maxIters: 240 },
  },
  columnar: {
    envelope: { profile: 'tight_column', asymmetry: 0, offsetYFrac: 0 },
    sca: { tropism: [0, +0.3,  0], attractorCount: 450, influenceRadius: 3.0, killRadius: 0.9, stepLength: 0.4, maxIters: 180 },
  },
  ornamental: {
    envelope: { profile: 'broad_low',    asymmetry: 0, offsetYFrac: 0 },
    sca: { tropism: [0, -0.05, 0], attractorCount: 500, influenceRadius: 3.5, killRadius: 1.0, stepLength: 0.4, maxIters: 200 },
  },
}

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

// Returns null when no further growth is possible (either every attractor
// has been killed or no node is in influence range of any remaining
// attractor — the natural stopping condition).
function runGrowthLoop({ nodes, attractors, sca }) {
  const { tropism, influenceRadius, killRadius, stepLength, maxIters } = sca
  const inflSq = influenceRadius * influenceRadius
  const killSq = killRadius * killRadius

  for (let iter = 0; iter < maxIters; iter++) {
    if (attractors.length === 0) break

    // 1. Pull accumulation — for each attractor, find its nearest node;
    //    if that node is within influenceRadius, the attractor votes for
    //    it with unit-vector(attractor - node).
    const pullByNode = new Map()
    for (const a of attractors) {
      let bestIdx = -1, bestSq = Infinity
      for (let i = 0; i < nodes.length; i++) {
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

    // 2. Spawn one child per pulled node. growDir = normalize(avgPull +
    //    tropism). Tropism is added IN WORLD SPACE so the same vector
    //    produces consistent silhouettes regardless of branch position.
    const newNodes = []
    for (const [node, pull] of pullByNode) {
      const gx = pull[0] + tropism[0]
      const gy = pull[1] + tropism[1]
      const gz = pull[2] + tropism[2]
      const glen = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1
      const child = {
        pos: [
          node.pos[0] + (gx / glen) * stepLength,
          node.pos[1] + (gy / glen) * stepLength,
          node.pos[2] + (gz / glen) * stepLength,
        ],
        parent: node,
        children: [],
        radius: 0,
      }
      node.children.push(child)
      newNodes.push(child)
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
}) {
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

  // Initialize tree. Trunk auto-grow: extend straight up by stepLength
  // until any attractor falls into influenceRadius — prevents stalling
  // when trunk top starts below the envelope's lowest point.
  const root = { pos: [...trunkBase], parent: null, children: [], radius: 0 }
  const nodes = [root]
  const inflSq = sca.influenceRadius * sca.influenceRadius
  for (let lift = 0; lift < 8; lift++) {  // hard cap — never lift more than 8×stepLength
    let inRange = false
    for (const a of attractors) {
      if (squaredDistance(a, nodes[nodes.length - 1].pos) <= inflSq) { inRange = true; break }
    }
    if (inRange) break
    const last = nodes[nodes.length - 1]
    const next = {
      pos: [last.pos[0], last.pos[1] + sca.stepLength, last.pos[2]],
      parent: last, children: [], radius: 0,
    }
    last.children.push(next)
    nodes.push(next)
  }

  runGrowthLoop({ nodes, attractors, sca })
  computeRadii(root, tipRadius)

  return { root, nodes }
}
