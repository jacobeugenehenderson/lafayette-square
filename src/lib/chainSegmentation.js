// Chain segmentation — which vertices of a chain are INTERSECTIONS.
//
// ⭐ EXTRACTED 2026-09-06 from `buildBlockGeometryV2.js`. It is pure chain
// TOPOLOGY over `streets[].points` — it asks no width, reads no authoring, and
// depends on nothing else in that module. It was the only thing prebake needed
// from it in order to mint the protopolygon's per-edge identity, and adding
// `derive.js` as a fourth consumer of a module **T3 exists to delete**
// (`RIBBONS §5`: "T3 needs an EXTRACTION step nobody has budgeted") would have
// deepened exactly the debt this repo is trying to pay off. So: one function
// out, one home, T3 correspondingly smaller.
//
// ⚠️ IT CARRIES A KNOWN DEFECT AND MOVING IT DOES NOT FIX IT (`ROADMAP A17`):
// indices are collected PER INDEX with no dedup by coordinate, so a duplicate
// vertex sitting on an intersection returns BOTH indices, `naturalSegments`
// mints a zero-length span, and every later `segOrd` on that chain shifts by
// one. Measured: 12 of 16 duplicate-carrying LS chains move. ⛔ Do not read this
// extraction as a cure — the key space is identical to what it was.

// Resolve true IX identity per chain by COORDINATE-MATCH rather than
// trusting `street.intersections[].ix` integers (which are stale on LS
// ~36% and broken on toy where chain interior bends shift point indices).
//
// Returns: Map<street, Set<pointIdx>> — for each chain, the set of point
// indices whose coordinate is shared by ≥2 distinct chains within EPS.
// Coordinate-shared = real IX. Index-only matches without coord-sharing =
// chain interior bend (saw-tooth jog, gentle curve, etc) — NOT an IX.
//
// Consumed by:
//   - buildFrontageEdges (walker): demote interior-bend block-ring
//     vertices from corner-detection regardless of turn angle.
//   - naturalSegments: partition chains by true IXs, not stale indices.
//   - cornersAtIx (via chain lookups inside naturalSegments): leg→segOrd
//     resolution uses the same partition that emitChain uses.
//
// Single source of truth for "what is an IX on this chain" — the contract
// the D.7a coordination note named.
export function resolveChainSegmentation(streets) {
  const EPS = 0.5  // meters — same scale as resolveIxRef tolerance
  const posKey = (x, z) => `${Math.round(x / EPS)}|${Math.round(z / EPS)}`
  // First pass: bucket every chain.point coord → which chains own it.
  const ownersByPos = new Map()
  for (let ci = 0; ci < streets.length; ci++) {
    const s = streets[ci]
    if (!s?.points) continue
    for (const p of s.points) {
      const k = posKey(p[0], p[1])
      let owners = ownersByPos.get(k)
      if (!owners) { owners = new Set(); ownersByPos.set(k, owners) }
      owners.add(ci)
    }
  }
  // Second pass: for each chain, mark indices whose coord is shared by
  // ≥2 distinct chains. Endpoints are eligible (T-intersection where one
  // chain terminates into another's middle).
  const out = new Map()
  for (let ci = 0; ci < streets.length; ci++) {
    const s = streets[ci]
    if (!s?.points) { out.set(s, new Set()); continue }
    const ix = new Set()
    for (let pi = 0; pi < s.points.length; pi++) {
      const k = posKey(s.points[pi][0], s.points[pi][1])
      if ((ownersByPos.get(k)?.size ?? 0) >= 2) ix.add(pi)
    }
    out.set(s, ix)
  }
  return out
}
