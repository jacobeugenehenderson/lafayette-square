/**
 * decimate-tree.mjs — Brief 6 (Spindle): tree-aware geometry decimation.
 *
 * Runs inside publish-glb.js (post variant-load, pre LoD emit). Two levers:
 *
 *   Lever 3 — silhouette-preserving leaf-card reduction
 *     For each primitive with `atlasKind === 'leaf'` whose vertex-use pattern
 *     marks it card-based (max vert-use === 1, i.e. Robinia-class), compute
 *     per-triangle XZ centroids, form the XZ convex hull of those centroids,
 *     and drop a deterministic-hash-selected fraction of INTERIOR triangles
 *     (those whose centroid is > outerHullToleranceM from the hull boundary).
 *     Outer triangles (silhouette-defining) are NEVER dropped. Connected-mesh
 *     leaf primitives (Linden-class, max vert-use > 1) are left intact for
 *     the downstream MeshoptSimplifier to handle generically.
 *
 *   Lever 4 — adaptive simplify-to-bracket  (lives in publish-glb.js's emitLod,
 *     not here — operates on already-Lever-3-reduced docs)
 *
 * Scope drift from Brief 6 (surfaced to Boz + Jacob 2026-05-22): Levers 1
 * (Order-N twig pruning) and 2 (parallel-branch collapse) require per-branch
 * node identity in the source GLB; vendor + procedural chassis arrive flat-
 * merged (1–3 wood primitives, no walkable branch hierarchy). Filed as
 * Brief 6.1 candidate operating PRE-merge inside generate-procedural.js
 * (SCA graph) and bake-tree.py (LiDAR cylinder graph).
 *
 * Determinism: Triangle drop is selected by Knuth multiplicative hash on the
 * triangle's original index in the source's index buffer; same source +
 * same config → byte-identical output. Idempotent: re-running on already-
 * decimated output is a no-op (Lever 3 short-circuits when tri count is
 * already at/below target).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptSimplifier } from 'meshoptimizer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULTS_PATH = path.join(__dirname, 'decimation-defaults.json')

// ── Public API ─────────────────────────────────────────────────────────────

// Apply Lever 3 to every leaf primitive in `doc` in place.
// Returns a per-prim report array for the survey.
export function decimateLeafPrimitives(doc, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) }
  if (!cfg.innerCanopyLeafReduction?.enabled) return []

  const reports = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const kind = (prim.getExtras() || {}).atlasKind
      if (kind !== 'leaf') continue
      const r = decimateOnePrim(prim, cfg)
      if (r) reports.push({ mesh: mesh.getName() || '<mesh>', ...r })
    }
  }
  return reports
}

// Config defaults: also written to decimation-defaults.json for operator edit.
export const DEFAULT_CONFIG = {
  qualityBracket: {
    lod0: { minTris: 5000, maxTris: 15000 },
    lod1: { minTris: 1500, maxTris:  5000 },
    lod2: { minTris:  300, maxTris:  1500 },
  },
  innerCanopyLeafReduction: {
    enabled: true,
    innerHullDropFactor: 0.6,       // fraction of interior tris dropped
    outerHullToleranceFrac: 0.05,   // tris within this fraction of bbox-diag of hull = "outer", never dropped
    minTrisToFire: 1000,            // skip tiny leaf prims (italian cypress etc.)
  },
  barkDecimation: {
    // Brief 6.2 (Adze, 2026-05-23) — connected-mesh bark decimation, Lever 5.
    // Fires before Lever 4 emitLod to break MeshoptSimplifier's topology
    // floor on Linden-class heavyweights. Naturally-light bark (Cypress,
    // procedural cylinders) below vertexThreshold no-ops.
    enabled: true,
    vertexThreshold: 100000,        // skip bark prims with fewer verts (only fire on Linden-class)
    errorTolerance: 0.05,           // MeshoptSimplifier target_error — much higher than emitLod's 0.0005
    targetRatio: 0.15,              // target index count = ratio × original (cap; error may stop earlier)
    algorithm: 'meshopt',           // 'meshopt' (simplifyWithAttributes, UV-preserving) | 'auto'
    uvWeight: 0.5,                  // simplifyWithAttributes UV stream weighting
  },
  leafDecimation: {
    // Brief 6.3 (Gnomon, 2026-05-23) — connected-mesh leaf decimation, Lever 6.
    // Sibling to Lever 5: same MeshoptSimplifier, gated on `atlasKind === 'leaf'`
    // AND connected-mesh topology (maxVertUse > 1). Card-based leaves
    // (maxVertUse === 1) are Spindle's Lever 3 territory and are skipped here.
    // Fires before emitLod (Lever 4) to break the simplifier's topology floor
    // on Linden-class 400-500K-tri sculpted leaves. Naturally-light connected-
    // mesh leaves (Sugar Maple ~4K-tri prims, Italian Cypress) below
    // vertexThreshold no-op.
    //
    // uvWeight is MAX (1.0), higher than Lever 5's 0.5: vendor leaf prims UV
    // into a sub-region of a shared atlas page (Linden's leaf + bark share one
    // material, disjoint UV sub-regions per [[feedback_atlas_subregion_uv_recovery]]).
    // UV drift across sub-region boundaries makes leaves sample bark pixels.
    //
    // positionWeight: meshoptimizer's simplifyWithAttributes does NOT expose a
    // separate position-stream weight (position is the intrinsic quadric base;
    // attribute_weights only weight the UV stream). Silhouette discipline rides
    // on the position quadric + the tight errorTolerance. Field retained in the
    // defaults JSON as documentation but not passed to the simplifier.
    enabled: true,
    vertexThreshold: 100000,        // skip leaf prims with fewer verts (only fire on Linden-class connected-mesh)
    errorTolerance: 0.02,           // tighter than Lever 5's 0.05 (silhouette + atlas-UV constraints) — looser than emitLod's 0.0005
    targetRatio: 0.20,              // target index count = ratio × original (cap; error may stop earlier)
    algorithm: 'meshopt',           // 'meshopt' (simplifyWithAttributes, UV-preserving) | 'auto'
    uvWeight: 1.0,                  // MAX — atlas-sub-region UV preservation is load-bearing
    positionWeight: 1.0,            // documented intent; API exposes no separate knob (see note above)
    perLeafRef: {},                 // reserved per-species overrides (empty); structure TBD
  },
}

// Load operator-tunable defaults from disk (falls back to DEFAULT_CONFIG).
export async function loadDecimationConfig() {
  try {
    const raw = await fs.readFile(DEFAULTS_PATH, 'utf8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

// ── Lever 3: card-aware leaf-card reduction ────────────────────────────────

function decimateOnePrim(prim, cfg) {
  const posAttr = prim.getAttribute('POSITION')
  const idxAttr = prim.getIndices()
  if (!posAttr || !idxAttr) return null

  const vcount = posAttr.getCount()
  const indices = idxAttr.getArray()
  const tcount = Math.floor(indices.length / 3)
  const opts = cfg.innerCanopyLeafReduction

  const existingExtras = prim.getExtras() || {}
  if (existingExtras.spindleDecimated) {
    return { reason: 'already-decimated', vcount, tcount, kept: tcount, dropped: 0 }
  }
  if (tcount < opts.minTrisToFire) {
    return { reason: 'below-minTris', vcount, tcount, kept: tcount, dropped: 0 }
  }

  // Topology classify: max vert-use across indices. > 1 → connected-mesh → skip.
  const useCount = new Uint32Array(vcount)
  for (let i = 0; i < indices.length; i++) useCount[indices[i]]++
  let maxUse = 0
  for (let i = 0; i < vcount; i++) if (useCount[i] > maxUse) { maxUse = useCount[i]; if (maxUse > 1) break }
  if (maxUse > 1) {
    return { reason: 'connected-mesh', vcount, tcount, kept: tcount, dropped: 0, maxUse }
  }

  const pos = posAttr.getArray()

  // Compute per-tri XZ centroids; also gather bbox for relative threshold.
  const centroidsXZ = new Float32Array(tcount * 2)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let t = 0; t < tcount; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2]
    const cx = (pos[a * 3]     + pos[b * 3]     + pos[c * 3])     / 3
    const cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3
    centroidsXZ[t * 2] = cx
    centroidsXZ[t * 2 + 1] = cz
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz
  }
  const bboxDiag = Math.hypot(maxX - minX, maxZ - minZ)
  if (bboxDiag < 1e-6) {
    return { reason: 'degenerate-bbox', vcount, tcount, kept: tcount, dropped: 0 }
  }
  const outerTol = bboxDiag * opts.outerHullToleranceFrac

  // 2D convex hull (Andrew's monotone chain) over tri centroids.
  const hull = convexHullXZ(centroidsXZ, tcount)

  // For each tri, compute min signed-distance to any hull edge. Inside-hull
  // points are positive; treat "outer" as min-distance <= outerTol.
  // Hull is CCW after monotone chain.
  const dropMask = new Uint8Array(tcount)
  const dropThresh = opts.innerHullDropFactor // [0..1] — fraction of interior tris dropped
  let droppedCount = 0
  for (let t = 0; t < tcount; t++) {
    const cx = centroidsXZ[t * 2], cz = centroidsXZ[t * 2 + 1]
    const d = minDistToHullBoundary(cx, cz, hull)
    if (d <= outerTol) continue  // outer-silhouette: keep
    // Interior: drop by deterministic hash.
    // Knuth's multiplicative hash; tri index is the seed.
    const h = ((t * 2654435761) >>> 0) / 0x100000000
    if (h < dropThresh) { dropMask[t] = 1; droppedCount++ }
  }

  if (droppedCount === 0) {
    return { reason: 'no-interior-drops', vcount, tcount, kept: tcount, dropped: 0, hullSize: hull.length }
  }

  // Build new index buffer: kept tris only. Also compact verts (drop unreferenced).
  const keptTris = tcount - droppedCount
  const newIndicesPre = new Uint32Array(keptTris * 3)
  let w = 0
  for (let t = 0; t < tcount; t++) {
    if (dropMask[t]) continue
    newIndicesPre[w++] = indices[t * 3]
    newIndicesPre[w++] = indices[t * 3 + 1]
    newIndicesPre[w++] = indices[t * 3 + 2]
  }

  // Compact: build old→new vert map in scan order.
  const remap = new Int32Array(vcount).fill(-1)
  let nextVert = 0
  for (let i = 0; i < newIndicesPre.length; i++) {
    const v = newIndicesPre[i]
    if (remap[v] < 0) remap[v] = nextVert++
  }
  const newVcount = nextVert
  const newIndices = new Uint32Array(newIndicesPre.length)
  for (let i = 0; i < newIndicesPre.length; i++) newIndices[i] = remap[newIndicesPre[i]]

  // Rewrite POSITION + every other vertex attribute through the same remap.
  rewriteAttribute(prim, 'POSITION', remap, newVcount, 3)
  for (const sem of ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
    if (prim.getAttribute(sem)) {
      const dim = prim.getAttribute(sem).getElementSize()
      rewriteAttribute(prim, sem, remap, newVcount, dim)
    }
  }
  // Rewrite indices.
  const idxArr = pickIndexArrayType(newVcount, newIndices)
  idxAttr.setArray(idxArr)

  // Stamp idempotency marker.
  prim.setExtras({ ...existingExtras, spindleDecimated: true })

  return {
    reason: 'decimated',
    vcount, vcountAfter: newVcount,
    tcount, kept: keptTris, dropped: droppedCount,
    hullSize: hull.length,
    bboxDiag, outerTol,
  }
}

// Replace `prim`'s named attribute with a new accessor containing only the
// verts in `remap` (where remap[old] >= 0 maps to a new slot).
function rewriteAttribute(prim, semantic, remap, newVcount, elementSize) {
  const acc = prim.getAttribute(semantic)
  if (!acc) return
  const src = acc.getArray()
  const out = new Float32Array(newVcount * elementSize)
  for (let i = 0; i < remap.length; i++) {
    const ni = remap[i]
    if (ni < 0) continue
    for (let k = 0; k < elementSize; k++) out[ni * elementSize + k] = src[i * elementSize + k]
  }
  acc.setArray(out)
}

function pickIndexArrayType(vcount, newIndices) {
  if (vcount < 65536) return new Uint16Array(newIndices)
  return newIndices // Uint32Array OK
}

// ── Lever 5-pre: smooth-weld bark topology (Linden, 2026-06-23) ──────────────
//
// THE WALL we thought was UV-lock is FLAT NORMALS. Vendor chassis are exported
// flat-shaded, so the bark prim carries per-face normals that split every
// triangle into its own vertex island (ash_green: 200,940 verts for only
// 62,608 unique positions). MeshoptSimplifier collapses edges by index
// topology; a soup has no shared edges, so `simplify` returns the mesh
// byte-identical — the "127K floor / lod0=lod1=lod2" symptom, long misread as
// an atlas UV-lock requiring re-UV + render-to-texture re-bake.
//
// The fix needs NO re-UV and NO texture work: recompute smooth (position-
// grouped) normals, then weld by (position+UV). Normals become identical per
// position so welding merges the soup back into a connected mesh (200,940 →
// 84,752 verts, UV tiling seams preserved); the existing Lever-5 simplify and
// emitLod brackets then collapse it as intended (82,822 → ~12K at ratio 0.15).
//
// Self-targeting: only fires on prims whose vert count exceeds unique-position
// count by `splitRatioGate` — i.e. actual flat-normal soup. Already-clean bark
// (cylinder/procedural, verts ≈ shared) is left untouched. Idempotent via
// `extras.lindenSmoothWeld`.
const SMOOTH_WELD_SPLIT_GATE = 1.3   // fire when verts > 1.3× unique positions

export function smoothWeldBark(doc) {
  const reports = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if ((prim.getExtras() || {}).atlasKind !== 'bark') continue
      const r = smoothWeldBarkOnePrim(prim)
      if (r) reports.push({ mesh: mesh.getName() || '<mesh>', ...r })
    }
  }
  return reports
}

function smoothWeldBarkOnePrim(prim) {
  const posAttr = prim.getAttribute('POSITION')
  const idxAttr = prim.getIndices()
  if (!posAttr || !idxAttr) return null
  const ex = prim.getExtras() || {}
  const pos = posAttr.getArray()
  const idx = idxAttr.getArray()
  const nv = posAttr.getCount()
  const tcount = Math.floor(idx.length / 3)

  if (ex.lindenSmoothWeld) return { reason: 'already', vBefore: nv, vAfter: nv, tcount }

  const pkey = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`

  // Gate: only soup (flat-normal-split) bark. Skip already-welded clean bark.
  const uniqPos = new Set()
  for (let i = 0; i < nv; i++) uniqPos.add(pkey(i))
  if (nv <= uniqPos.size * SMOOTH_WELD_SPLIT_GATE) {
    return { reason: 'not-split', vBefore: nv, vAfter: nv, tcount, uniqPos: uniqPos.size }
  }

  // 1. Position-grouped smooth normals (area-weighted face normals; shared
  //    across the normal/UV splits at each position so the seam disappears).
  const nacc = new Map()
  for (let t = 0; t < tcount; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2]
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2]
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx
    for (const vi of [a, b, c]) {
      const k = pkey(vi)
      const g = nacc.get(k)
      if (g) { g[0] += fx; g[1] += fy; g[2] += fz } else nacc.set(k, [fx, fy, fz])
    }
  }
  const sn = new Float32Array(nv * 3)
  for (let i = 0; i < nv; i++) {
    const g = nacc.get(pkey(i)) || [0, 1, 0]
    const L = Math.hypot(g[0], g[1], g[2]) || 1
    sn[i * 3] = g[0] / L; sn[i * 3 + 1] = g[1] / L; sn[i * 3 + 2] = g[2] / L
  }
  const nrmAttr = prim.getAttribute('NORMAL')
  if (nrmAttr) nrmAttr.setArray(sn)

  // 2. Weld by (position + UV): normals are now identical per position, so the
  //    only surviving splitter is the UV tiling seam (kept, so tiling is safe).
  const uvAttr = prim.getAttribute('TEXCOORD_0')
  const uv = uvAttr ? uvAttr.getArray() : null
  const vkey = (i) => (uv ? `${pkey(i)}|${Math.round(uv[i * 2] * 1e4)},${Math.round(uv[i * 2 + 1] * 1e4)}` : pkey(i))
  const remap = new Int32Array(nv).fill(-1)
  const seen = new Map()
  let next = 0
  for (let i = 0; i < nv; i++) {
    const k = vkey(i)
    let ni = seen.get(k)
    if (ni === undefined) { ni = next++; seen.set(k, ni) }
    remap[i] = ni
  }
  const newVcount = next

  rewriteAttribute(prim, 'POSITION', remap, newVcount, 3)
  for (const sem of ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
    const a = prim.getAttribute(sem)
    if (a) rewriteAttribute(prim, sem, remap, newVcount, a.getElementSize())
  }
  const newIdx = new Uint32Array(idx.length)
  for (let i = 0; i < idx.length; i++) newIdx[i] = remap[idx[i]]
  idxAttr.setArray(pickIndexArrayType(newVcount, newIdx))

  prim.setExtras({ ...ex, lindenSmoothWeld: true })
  return { reason: 'welded', vBefore: nv, vAfter: newVcount, tcount, uniqPos: uniqPos.size }
}

// Andrew's monotone-chain convex hull on (x,z) pairs stored interleaved.
// Returns array of {x,z} points in CCW order.
function convexHullXZ(centroidsXZ, count) {
  // Build index list, sort by (x, then z).
  const idx = new Uint32Array(count)
  for (let i = 0; i < count; i++) idx[i] = i
  idx.sort ? null : null // typed-array sort works in-place numerically — desired
  // Convert to plain Array for stable comparator; large but unavoidable.
  const order = Array.from(idx).sort((a, b) => {
    const ax = centroidsXZ[a * 2], bx = centroidsXZ[b * 2]
    if (ax !== bx) return ax - bx
    return centroidsXZ[a * 2 + 1] - centroidsXZ[b * 2 + 1]
  })
  const n = order.length
  if (n < 3) {
    return order.map(i => ({ x: centroidsXZ[i * 2], z: centroidsXZ[i * 2 + 1] }))
  }
  const cross = (o, a, b) => {
    const ox = centroidsXZ[o * 2], oz = centroidsXZ[o * 2 + 1]
    const ax = centroidsXZ[a * 2], az = centroidsXZ[a * 2 + 1]
    const bx = centroidsXZ[b * 2], bz = centroidsXZ[b * 2 + 1]
    return (ax - ox) * (bz - oz) - (az - oz) * (bx - ox)
  }
  const lower = []
  for (const i of order) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop()
    lower.push(i)
  }
  const upper = []
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop()
    upper.push(i)
  }
  lower.pop(); upper.pop()
  const hullIdx = lower.concat(upper)
  return hullIdx.map(i => ({ x: centroidsXZ[i * 2], z: centroidsXZ[i * 2 + 1] }))
}

// Minimum perpendicular distance from point (px,pz) to any hull edge.
// Hull is in CCW order; we treat each consecutive pair as a segment and
// return min distance to any of them. For points inside the convex hull
// this is the standard "depth to boundary" measure.
function minDistToHullBoundary(px, pz, hull) {
  const n = hull.length
  if (n < 2) return 0
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % n]
    const d = pointSegDist(px, pz, a.x, a.z, b.x, b.z)
    if (d < best) best = d
  }
  return best
}

// ── Lever 5: connected-mesh bark decimation (Brief 6.2, Adze, 2026-05-23) ──
//
// Operates ONLY on primitives with `extras.atlasKind === 'bark'` whose vertex
// count exceeds `barkDecimation.vertexThreshold` — the Linden-class single-
// primitive 700K-vert connected-mesh bark targets. Smaller bark prims (Cypress,
// procedural cylinder bark, etc.) no-op naturally.
//
// Why MeshoptSimplifier hits a floor on these: emitLod's per-LoD `error`
// budget (0.0005 for lod0) is intentionally tight to preserve leaf-card
// silhouettes. Applied uniformly to bark, that error wall refuses to collapse
// the connected mesh below its topology floor. Bark continuity matters more
// than micro-detail at Browse distance, so we run a separate pass at much
// looser error (0.05 default) BEFORE emitLod runs — giving the per-LoD
// simplifier a smaller bark mesh to work with.
//
// UV preservation: bark UVs carry atlas-region addressing after bake-look
// rewrites them into sub-regions. `simplifyWithAttributes` weights UV
// continuity into the collapse cost so atlas sampling stays coherent across
// surviving edges. Per [[feedback_atlas_subregion_uv_recovery]] this matters
// downstream even if it looks redundant here.
//
// Idempotency: stamps `extras.adzeDecimatedBark = true` on success; re-runs
// short-circuit. Connected-mesh check (maxVertUse > 1) skipped — bark prims
// are always connected meshes when above the vertex threshold; non-connected
// per-cylinder bark is below threshold by construction.
export async function decimateBarkPrimitives(doc, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) }
  const opts = cfg.barkDecimation
  if (!opts?.enabled) return []
  await MeshoptSimplifier.ready

  const reports = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const kind = (prim.getExtras() || {}).atlasKind
      if (kind !== 'bark') continue
      const r = decimateBarkOnePrim(prim, opts)
      if (r) reports.push({ mesh: mesh.getName() || '<mesh>', ...r })
    }
  }
  return reports
}

// Major-seam vertex lock (Linden, 2026-06-23). The bark UVs TILE (range far
// outside [0,1]); the texture-safe simplifier still smears the visible TILING
// SEAMS when it collapses a vertex across a UV discontinuity — a triangle then
// bridges e.g. U≈2.0 to U≈−0.18 and stretches/mip-blurs the texture (the cross
// + swirl the operator saw on the Street bark). A position carrying two UVs
// that differ by > `threshold` is a real seam vertex (the cylinder wrap / tile
// boundary); lock those so collapses can't bridge them. Cheap (≈0.7% of verts
// at threshold 1.0) and reduction-preserving — only the major discontinuities
// are pinned, the interior collapses freely.
function computeMajorSeamLock(positions, uvs, vcount, threshold) {
  if (!uvs) return null
  const byPos = new Map()
  for (let i = 0; i < vcount; i++) {
    const k = `${Math.round(positions[i * 3] * 1e4)},${Math.round(positions[i * 3 + 1] * 1e4)},${Math.round(positions[i * 3 + 2] * 1e4)}`
    let a = byPos.get(k); if (!a) { a = []; byPos.set(k, a) } a.push(i)
  }
  const lock = new Uint8Array(vcount)
  let locked = 0
  for (const arr of byPos.values()) {
    if (arr.length < 2) continue
    let spread = 0
    for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) {
      const i = arr[x], j = arr[y]
      spread = Math.max(spread, Math.abs(uvs[i * 2] - uvs[j * 2]), Math.abs(uvs[i * 2 + 1] - uvs[j * 2 + 1]))
    }
    if (spread > threshold) { for (const i of arr) { if (!lock[i]) { lock[i] = 1; locked++ } } }
  }
  return locked ? lock : null
}

// ── Distant-LOD bark floor fallback (Linden, 2026-06-23) ────────────────────
//
// Some bark is genuinely UV-seam-dense (linden_american: 156K verts for only
// 88K positions — ~1.8 UVs per position). The texture-safe simplifier FLOORS on
// it (~60K tris, won't collapse across the seam-walls) even after smooth-weld +
// max uvWeight. That floored bark, instanced across the park, is what black-
// screens the overhead Browse view (linden alone = 1.8M of 2.5M rendered tris).
//
// At DISTANT LODs (lod1/lod2 = hero/browse/overhead) bark texture detail is
// invisible, so we trade it: position-only weld (merge coincident verts across
// the UV-tiling seams — breaks tiling, smears, fine at distance) then PLAIN
// position simplify, which finally crushes it (60K → ~1.3K). NOT used at lod0
// (near/street keeps the careful, seam-locked result). The handoff's sanctioned
// "sloppy for far/overhead". Only fires on bark still above `floorThreshold`.
export function crushFlooredBark(doc, targetTris, floorThreshold = 8000) {
  const reports = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if ((prim.getExtras() || {}).atlasKind !== 'bark') continue
      const t = (prim.getIndices()?.getCount() || 0) / 3
      if (t <= floorThreshold) continue   // careful path already reduced it; leave alone
      const r = crushOneBarkPrim(prim, targetTris)
      if (r) reports.push({ mesh: mesh.getName() || '<mesh>', ...r })
    }
  }
  return reports
}

// ── Browse trunk-cut (Linden, 2026-06-23, operator-endorsed) ────────────────
//
// Browse is overhead/top-down: the leaf canopy occludes the trunk and lower
// branches from above, so at lod2 we DELETE the bark below the canopy base
// (the lowest leaf vertex). The trunk is the bulk of the bark (and, for
// linden-class, the un-reducible UV-seam-dense part) — deleting it makes Browse
// light AND removes the trunk smear for the one view that never sees the trunk.
// Operator: "in Browse the trunks are cut off, and the branches can be flat
// shaded." lod2-only; lod0/lod1 keep full trunks (street/hero see them).
export function trunkCutBark(doc, opts = {}) {
  const dropFrac = opts.dropFrac ?? 0   // optionally lift the cut a touch above the lowest leaf
  let leafMinY = Infinity, leafMaxY = -Infinity, hasLeaf = false
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if ((prim.getExtras() || {}).atlasKind !== 'leaf') continue
    const a = prim.getAttribute('POSITION')?.getArray(); if (!a) continue
    hasLeaf = true
    for (let i = 1; i < a.length; i += 3) { if (a[i] < leafMinY) leafMinY = a[i]; if (a[i] > leafMaxY) leafMaxY = a[i] }
  }
  if (!hasLeaf || !isFinite(leafMinY)) return []
  const cutY = leafMinY + (leafMaxY - leafMinY) * dropFrac
  const reports = []
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if ((prim.getExtras() || {}).atlasKind !== 'bark') continue
    const r = trunkCutOnePrim(prim, cutY)
    if (r) reports.push({ mesh: mesh.getName() || '<mesh>', ...r })
  }
  return reports
}

function trunkCutOnePrim(prim, cutY) {
  const posAttr = prim.getAttribute('POSITION')
  const idxAttr = prim.getIndices()
  if (!posAttr || !idxAttr) return null
  const pos = posAttr.getArray()
  const idx = idxAttr.getArray()
  const nv = posAttr.getCount()
  const tBefore = Math.floor(idx.length / 3)
  const keep = []
  for (let t = 0; t < idx.length / 3; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2]
    const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
    if (cy >= cutY) keep.push(a, b, c)
  }
  if (keep.length === idx.length) return { reason: 'no-cut', tBefore, tAfter: tBefore }
  const used = new Map()
  const newIdx = new Uint32Array(keep.length)
  for (let i = 0; i < keep.length; i++) { let ni = used.get(keep[i]); if (ni === undefined) { ni = used.size; used.set(keep[i], ni) } newIdx[i] = ni }
  const fv = used.size
  const remap = new Int32Array(nv).fill(-1)
  for (const [o, n] of used) remap[o] = n
  rewriteAttribute(prim, 'POSITION', remap, fv, 3)
  for (const sem of ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
    const a = prim.getAttribute(sem)
    if (a) rewriteAttribute(prim, sem, remap, fv, a.getElementSize())
  }
  idxAttr.setArray(pickIndexArrayType(fv, newIdx))
  return { reason: 'trunk-cut', tBefore, tAfter: Math.floor(keep.length / 3), cutY: +cutY.toFixed(2) }
}

function crushOneBarkPrim(prim, targetTris) {
  const posAttr = prim.getAttribute('POSITION')
  const idxAttr = prim.getIndices()
  if (!posAttr || !idxAttr) return null
  const pos = posAttr.getArray()
  const idx = idxAttr.getArray()
  const nv = posAttr.getCount()
  const tBefore = Math.floor(idx.length / 3)

  // 1. Position-only weld — collapse coincident verts regardless of UV.
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`
  const pmap = new Map()
  const remap1 = new Uint32Array(nv)
  for (let i = 0; i < nv; i++) { const k = key(i); let ni = pmap.get(k); if (ni === undefined) { ni = pmap.size; pmap.set(k, ni) } remap1[i] = ni }
  const wv = pmap.size
  const wpos = new Float32Array(wv * 3)
  { const seen = new Uint8Array(wv); for (let i = 0; i < nv; i++) { const ni = remap1[i]; if (seen[ni]) continue; seen[ni] = 1; wpos[ni * 3] = pos[i * 3]; wpos[ni * 3 + 1] = pos[i * 3 + 1]; wpos[ni * 3 + 2] = pos[i * 3 + 2] } }
  const widx = new Uint32Array(idx.length)
  for (let i = 0; i < idx.length; i++) widx[i] = remap1[idx[i]]

  // 2. Plain (position-only) simplify — no attribute seams to block it now.
  const target = Math.max(3, Math.floor(targetTris) * 3)
  const res = MeshoptSimplifier.simplify(widx, wpos, 3, target, 0.2, [])
  const newIdx = res[0]
  const tAfter = Math.floor(newIdx.length / 3)
  if (tAfter >= tBefore) return { reason: 'crush-noop', tBefore, tAfter }

  // 3. Compaction (welded → final) and 4. compose original → final remap.
  const remap2 = new Int32Array(wv).fill(-1)
  let fv = 0
  for (let i = 0; i < newIdx.length; i++) { const v = newIdx[i]; if (remap2[v] < 0) remap2[v] = fv++ }
  const finalRemap = new Int32Array(nv)
  for (let i = 0; i < nv; i++) finalRemap[i] = remap2[remap1[i]]

  // 5. Rewrite attributes (first-occurrence wins; UV seam-dup is intentionally dropped) + indices.
  rewriteAttribute(prim, 'POSITION', finalRemap, fv, 3)
  for (const sem of ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
    const a = prim.getAttribute(sem)
    if (a) rewriteAttribute(prim, sem, finalRemap, fv, a.getElementSize())
  }
  const finalIdx = new Uint32Array(newIdx.length)
  for (let i = 0; i < newIdx.length; i++) finalIdx[i] = remap2[newIdx[i]]
  idxAttr.setArray(pickIndexArrayType(fv, finalIdx))
  return { reason: 'crushed', tBefore, tAfter, vBefore: nv, vAfter: fv }
}

function decimateBarkOnePrim(prim, opts) {
  const posAttr = prim.getAttribute('POSITION')
  const idxAttr = prim.getIndices()
  if (!posAttr || !idxAttr) return null

  const vcount = posAttr.getCount()
  const tcountBefore = Math.floor(idxAttr.getCount() / 3)
  const existingExtras = prim.getExtras() || {}

  if (existingExtras.adzeDecimatedBark) {
    return { reason: 'already-decimated', vcount, tcount: tcountBefore, kept: tcountBefore }
  }
  if (vcount < opts.vertexThreshold) {
    return { reason: 'below-vertexThreshold', vcount, tcount: tcountBefore, threshold: opts.vertexThreshold }
  }

  const positions = new Float32Array(posAttr.getArray())   // copy; simplifier may read repeatedly
  const indicesSrc = idxAttr.getArray()
  const indices = indicesSrc instanceof Uint32Array ? indicesSrc.slice() : new Uint32Array(indicesSrc)

  const targetIndexCount = Math.max(3, Math.floor(indices.length * opts.targetRatio / 3) * 3)
  const flags = []

  // Use UV-preserving variant when a UV stream + the 'meshopt' or 'auto' algo
  // is selected. Falls back to plain simplify otherwise.
  const uvAttr = prim.getAttribute('TEXCOORD_0')
  let newIndices, achievedError
  if ((opts.algorithm === 'meshopt' || opts.algorithm === 'auto') && uvAttr && typeof MeshoptSimplifier.simplifyWithAttributes === 'function') {
    const uvs = new Float32Array(uvAttr.getArray())
    const seamLock = computeMajorSeamLock(positions, uvs, vcount, opts.seamLockThreshold ?? 0.5)
    const result = MeshoptSimplifier.simplifyWithAttributes(
      indices,
      positions, 3,
      uvs, 2,
      [opts.uvWeight ?? 0.5, opts.uvWeight ?? 0.5],
      seamLock,                      // vertex_lock — pin major tiling-seam verts (no smear)
      targetIndexCount,
      opts.errorTolerance,
      flags,
    )
    newIndices = result[0]
    achievedError = result[1]
  } else {
    const result = MeshoptSimplifier.simplify(
      indices,
      positions, 3,
      targetIndexCount,
      opts.errorTolerance,
      flags,
    )
    newIndices = result[0]
    achievedError = result[1]
  }

  const tcountAfter = Math.floor(newIndices.length / 3)
  if (tcountAfter >= tcountBefore) {
    // Simplifier couldn't collapse further at this error budget. Stamp anyway
    // so retries are no-ops; surface as 'floor-hit' in the report.
    prim.setExtras({ ...existingExtras, adzeDecimatedBark: true })
    return { reason: 'floor-hit', vcount, tcount: tcountBefore, kept: tcountBefore, achievedError, targetIndexCount: targetIndexCount / 3 }
  }

  // Compact: build old→new vert map in scan order across new indices.
  const remap = new Int32Array(vcount).fill(-1)
  let nextVert = 0
  for (let i = 0; i < newIndices.length; i++) {
    const v = newIndices[i]
    if (remap[v] < 0) remap[v] = nextVert++
  }
  const newVcount = nextVert
  const remappedIndices = new Uint32Array(newIndices.length)
  for (let i = 0; i < newIndices.length; i++) remappedIndices[i] = remap[newIndices[i]]

  rewriteAttribute(prim, 'POSITION', remap, newVcount, 3)
  for (const sem of ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
    if (prim.getAttribute(sem)) {
      const dim = prim.getAttribute(sem).getElementSize()
      rewriteAttribute(prim, sem, remap, newVcount, dim)
    }
  }
  const idxArr = pickIndexArrayType(newVcount, remappedIndices)
  idxAttr.setArray(idxArr)

  prim.setExtras({ ...existingExtras, adzeDecimatedBark: true })

  return {
    reason: 'decimated',
    vcount, vcountAfter: newVcount,
    tcount: tcountBefore, kept: tcountAfter, dropped: tcountBefore - tcountAfter,
    achievedError,
    targetIndexCount: targetIndexCount / 3,
  }
}

// ── Lever 6: connected-mesh leaf decimation (Brief 6.3, Gnomon, 2026-05-23) ─
//
// Operates ONLY on primitives with `extras.atlasKind === 'leaf'` whose vertex
// count exceeds `leafDecimation.vertexThreshold` AND whose topology is
// connected-mesh (maxVertUse > 1). The Linden-class single-primitive sculpted
// leaf (~470K verts / ~417K tris) is the headline target; the broader firing
// set spans birch / red maple / aspen / white oak / tall pine / juniper /
// peach / white fir — every chassis carrying a heavy connected-mesh leaf prim.
//
// Disjoint from Spindle's Lever 3: card-based leaves (maxVertUse === 1, e.g.
// Robinia, where every vertex is referenced once) are silhouette-culled by
// Lever 3 and SKIPPED here. The maxVertUse > 1 gate is the discriminator —
// Lever 3 owns === 1, Lever 6 owns > 1. Both gate on atlasKind === 'leaf'.
//
// Why a separate pre-emitLod pass: emitLod's per-LoD `error` budget (0.0005
// for lod0) is tuned tight to preserve leaf-card silhouettes and refuses to
// collapse a 417K-tri connected mesh below its topology floor — Linden's lod2
// never reached bracket. Running simplifyWithAttributes at a looser error
// (0.02) here hands emitLod a far smaller leaf mesh to bracket from.
//
// UV preservation (load-bearing): vendor leaf prims UV into a sub-region of a
// shared atlas page. On Linden the leaf and bark prims share ONE material and
// occupy disjoint UV sub-regions (leaf U[0.45,0.99] V[0.62,0.77], bark
// U[0.01,0.43] V[0.02,0.98]); UV drift across that boundary makes leaves
// sample bark pixels. uvWeight defaults to MAX (1.0) for this reason, per
// [[feedback_atlas_subregion_uv_recovery]].
//
// positionWeight: meshoptimizer exposes no separate position-stream weight
// (position is the quadric base; attribute_weights weight only UV). The
// defaults field is documentation; it is not passed to the simplifier.
//
// Idempotency: stamps `extras.gnomonDecimatedLeaf = true` on success; re-runs
// short-circuit. Determinism: meshopt simplify is deterministic for a fixed
// input + target + error, so same chassis → byte-identical output.
export async function decimateLeafPrimitivesConnectedMesh(doc, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) }
  const opts = cfg.leafDecimation
  if (!opts?.enabled) return []
  await MeshoptSimplifier.ready

  const reports = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const kind = (prim.getExtras() || {}).atlasKind
      if (kind !== 'leaf') continue
      const r = decimateLeafConnectedOnePrim(prim, opts)
      if (r) reports.push({ mesh: mesh.getName() || '<mesh>', ...r })
    }
  }
  return reports
}

function decimateLeafConnectedOnePrim(prim, opts) {
  const posAttr = prim.getAttribute('POSITION')
  const idxAttr = prim.getIndices()
  if (!posAttr || !idxAttr) return null

  const vcount = posAttr.getCount()
  const tcountBefore = Math.floor(idxAttr.getCount() / 3)
  const existingExtras = prim.getExtras() || {}

  if (existingExtras.gnomonDecimatedLeaf) {
    return { reason: 'already-decimated', vcount, tcount: tcountBefore, kept: tcountBefore }
  }
  if (vcount < opts.vertexThreshold) {
    return { reason: 'below-vertexThreshold', vcount, tcount: tcountBefore, threshold: opts.vertexThreshold }
  }

  // Topology gate: card-based (maxVertUse === 1) is Lever 3's. Only fire on
  // connected-mesh (maxVertUse > 1).
  const indicesSrc = idxAttr.getArray()
  const useCount = new Uint32Array(vcount)
  for (let i = 0; i < indicesSrc.length; i++) useCount[indicesSrc[i]]++
  let maxUse = 0
  for (let i = 0; i < vcount; i++) if (useCount[i] > maxUse) { maxUse = useCount[i]; if (maxUse > 1) break }
  if (maxUse <= 1) {
    return { reason: 'card-based', vcount, tcount: tcountBefore, kept: tcountBefore, maxUse }
  }

  const positions = new Float32Array(posAttr.getArray())   // copy; simplifier may read repeatedly
  const indices = indicesSrc instanceof Uint32Array ? indicesSrc.slice() : new Uint32Array(indicesSrc)

  const targetIndexCount = Math.max(3, Math.floor(indices.length * opts.targetRatio / 3) * 3)
  const flags = []

  // UV-preserving variant when a UV stream + the 'meshopt' or 'auto' algo is
  // selected. Falls back to plain simplify otherwise (rare — leaf prims carry
  // TEXCOORD_0 by construction).
  const uvAttr = prim.getAttribute('TEXCOORD_0')
  let newIndices, achievedError
  if ((opts.algorithm === 'meshopt' || opts.algorithm === 'auto') && uvAttr && typeof MeshoptSimplifier.simplifyWithAttributes === 'function') {
    const uvs = new Float32Array(uvAttr.getArray())
    const result = MeshoptSimplifier.simplifyWithAttributes(
      indices,
      positions, 3,
      uvs, 2,
      [opts.uvWeight ?? 1.0, opts.uvWeight ?? 1.0],
      null,                          // vertex_lock — none
      targetIndexCount,
      opts.errorTolerance,
      flags,
    )
    newIndices = result[0]
    achievedError = result[1]
  } else {
    const result = MeshoptSimplifier.simplify(
      indices,
      positions, 3,
      targetIndexCount,
      opts.errorTolerance,
      flags,
    )
    newIndices = result[0]
    achievedError = result[1]
  }

  const tcountAfter = Math.floor(newIndices.length / 3)
  if (tcountAfter >= tcountBefore) {
    // Simplifier couldn't collapse further at this error budget. Stamp anyway
    // so retries are no-ops; surface as 'floor-hit'.
    prim.setExtras({ ...existingExtras, gnomonDecimatedLeaf: true })
    return { reason: 'floor-hit', vcount, tcount: tcountBefore, kept: tcountBefore, achievedError, targetIndexCount: targetIndexCount / 3, maxUse }
  }

  // Compact: build old→new vert map in scan order across new indices.
  const remap = new Int32Array(vcount).fill(-1)
  let nextVert = 0
  for (let i = 0; i < newIndices.length; i++) {
    const v = newIndices[i]
    if (remap[v] < 0) remap[v] = nextVert++
  }
  const newVcount = nextVert
  const remappedIndices = new Uint32Array(newIndices.length)
  for (let i = 0; i < newIndices.length; i++) remappedIndices[i] = remap[newIndices[i]]

  rewriteAttribute(prim, 'POSITION', remap, newVcount, 3)
  for (const sem of ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']) {
    if (prim.getAttribute(sem)) {
      const dim = prim.getAttribute(sem).getElementSize()
      rewriteAttribute(prim, sem, remap, newVcount, dim)
    }
  }
  const idxArr = pickIndexArrayType(newVcount, remappedIndices)
  idxAttr.setArray(idxArr)

  prim.setExtras({ ...existingExtras, gnomonDecimatedLeaf: true })

  return {
    reason: 'decimated',
    vcount, vcountAfter: newVcount,
    tcount: tcountBefore, kept: tcountAfter, dropped: tcountBefore - tcountAfter,
    achievedError,
    targetIndexCount: targetIndexCount / 3,
    maxUse,
  }
}

function pointSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-12) return Math.hypot(px - ax, pz - az)
  let t = ((px - ax) * dx + (pz - az) * dz) / len2
  if (t < 0) t = 0; else if (t > 1) t = 1
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

// ── CLI (standalone testing / inspection) ──────────────────────────────────

async function cliMain() {
  const argv = process.argv.slice(2)
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      args[k] = v
    }
  }
  if (!args.input || !args.output) {
    console.error('Usage: node arborist/decimate-tree.mjs --input <src.glb> --output <dst.glb> [--config <path>]')
    process.exit(1)
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(args.input)
  let config = await loadDecimationConfig()
  if (args.config) {
    const raw = await fs.readFile(args.config, 'utf8')
    config = { ...config, ...JSON.parse(raw) }
  }
  const startTris = countTris(doc)
  const reports = decimateLeafPrimitives(doc, config)
  const endTris = countTris(doc)
  console.log(`[decimate-tree] ${path.basename(args.input)}: ${startTris.toLocaleString()} → ${endTris.toLocaleString()} tris (${reports.length} leaf prim(s) examined)`)
  for (const r of reports) {
    console.log(`  ${r.mesh}: ${r.reason}${r.dropped ? ` — dropped ${r.dropped}/${r.tcount}` : ''}`)
  }
  await io.write(args.output, doc)
}

function countTris(doc) {
  let n = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      if (idx) n += idx.getCount() / 3
      else {
        const p = prim.getAttribute('POSITION')
        if (p) n += p.getCount() / 3
      }
    }
  }
  return Math.round(n)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cliMain().catch(err => { console.error(err); process.exit(1) })
}
