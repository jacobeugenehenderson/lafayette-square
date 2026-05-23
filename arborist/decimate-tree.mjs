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
    const result = MeshoptSimplifier.simplifyWithAttributes(
      indices,
      positions, 3,
      uvs, 2,
      [opts.uvWeight ?? 0.5, opts.uvWeight ?? 0.5],
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
