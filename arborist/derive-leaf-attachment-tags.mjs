// derive-leaf-attachment-tags.mjs — Salon leaf-attachment bake (baby Sorrel, 2026-05-22)
//
// Walks every chassis at `public/trees/_chassis/<name>.glb`, derives a set of
// leaf-attachment anchor points from the wood mesh, and writes them to the
// paired `<name>.meta.json#leafAttachmentTags` as `[[x, y, z], ...]`.
//
// ── Coordinate-space contract (v2 — Brief 2.1c, 2026-05-22) ───────────────
//
// Tags are stored in **chassis-root-local space** (≈ world-space — what each
// wood vertex's world position would be before the chassis is instanced into
// a scene). NOT mesh-space.
//
// Why: `generate-salon.js#buildCompositionDocument` (post-2.1c) attaches the
// leaf primitive to a NEW mesh under a NEW node at chassis root with
// identity transform. So leaf POSITION accessor values land directly at
// chassis-root-local coordinates — no intermediate per-mesh transform to
// worry about. This decouples leaves from any specific bark mesh's node
// transform, which was the v1 multi-mesh bug:
//
//   v1 (mesh-space) bug: consumer attached leaf primitive to chassis's
//   meshes[0]; if the picked anchor came from a different mesh with a
//   different node transform, the leaf inherited the WRONG transform and
//   landed off in space. Affected 4 multi-mesh chassis: candicands_b,
//   american_linden_a (transforms happened to agree, lucky), poplar_fall_b_*,
//   poplar_fall_f_*. The single-mesh majority (155 chassis) worked
//   correctly under v1 by coincidence.
//
// The world-space contract is also cleaner to reason about: a stored Y of
// 5.37 means 5.37 m above the chassis base, period. No node-transform
// math required to interpret the data.
//
// Sampling: gathers each wood vertex's `worldCoord` (= accumulated node
// transform applied to its mesh-space POSITION), runs the upper-bbox +
// XZ-grid sampler in world space, stores the world coord directly.
// Bucketing was already world-aware in v1 to handle Y-up vs Z-up
// inconsistencies across vendor packs.
//
// Note: Riven's bundle-decompose path in survey-deleaf.js bakes transforms
// into primitives + resets node TRS to identity. For those chassis,
// mesh-space == world-space and v1 vs v2 produce identical tags. v2 is
// uniformly correct across all chassis lineages.
//
// Heuristic: subdivide the chassis bbox into a `gridDensity × gridDensity`
// XZ grid (WORLD-space XZ) over the top `topYFrac` of the WORLD-space
// Y bbox; per cell, pick the vertex farthest from the trunk axis (world-XZ
// centroid). Cells with no wood verts produce no anchor — sparse-canopy
// chassis naturally end up with fewer anchors.
//
// Determinism: same chassis + same config → byte-identical tag array
// (mesh coords rounded to 4 decimals; cells iterated in fixed order).
// Idempotent: re-running on unchanged inputs touches mtime only.
//
// Run: node arborist/derive-leaf-attachment-tags.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CHASSIS_DIR = path.join(REPO_ROOT, 'public/trees/_chassis')
const CONFIG_PATH = path.join(REPO_ROOT, 'arborist/leaf-attachment-defaults.json')
const BACKSTOP_PATH = path.join(REPO_ROOT, 'arborist/leaf-attachment-defaults.defaults.json')

async function loadConfig() {
  for (const p of [CONFIG_PATH, BACKSTOP_PATH]) {
    try {
      const raw = JSON.parse(await fs.readFile(p, 'utf8'))
      const { gridDensity, topYFrac, minAnchors, maxAnchors, densityMultiplier } = raw
      return {
        gridDensity:       Number.isFinite(gridDensity)       ? gridDensity       : 8,
        topYFrac:          Number.isFinite(topYFrac)          ? topYFrac          : 0.6,
        minAnchors:        Number.isFinite(minAnchors)        ? minAnchors        : 30,
        maxAnchors:        Number.isFinite(maxAnchors)        ? maxAnchors        : 250,
        densityMultiplier: Number.isFinite(densityMultiplier) ? densityMultiplier : 1.0,
      }
    } catch { /* try next */ }
  }
  throw new Error('no leaf-attachment-defaults file found (looked for live + .defaults.json backstop)')
}

function makeIO() { return new NodeIO().registerExtensions(ALL_EXTENSIONS) }

// 4x4 column-major matrix helpers.
function identity4() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] }
function mul4(a, b) {
  const o = new Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3]
    }
  }
  return o
}
function transformPoint(m, x, y, z) {
  return [
    m[0]  * x + m[4]  * y + m[8]   * z + m[12],
    m[1]  * x + m[5]  * y + m[9]   * z + m[13],
    m[2]  * x + m[6]  * y + m[10]  * z + m[14],
  ]
}

// Walk scene, gather { meshCoord, worldCoord } per bark-mesh vertex.
async function gatherVerts(glbPath) {
  const io = makeIO()
  const doc = await io.read(glbPath)
  const out = []  // [ [mx, my, mz, wx, wy, wz], ... ] flat for cache locality
  // Walk every root node (no parent). Falls through scenes correctly AND
  // picks up orphan-rooted chassis like Quill's `candicands_*` series, where
  // the bark node sits at root but isn't added to any scene's children list.
  const visited = new Set()
  for (const node of doc.getRoot().listNodes()) {
    if (node.getParentNode()) continue
    if (visited.has(node)) continue
    visited.add(node)
    walk(node, identity4())
  }
  // Safety net: any mesh whose node was orphaned out of even the node graph
  // gets sampled with identity transform — better to ship slightly-off-axis
  // tags than zero tags.
  const meshesSeen = new Set()
  function markMeshesUnder(n) {
    const m = n.getMesh(); if (m) meshesSeen.add(m)
    for (const c of n.listChildren()) markMeshesUnder(c)
  }
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getParentNode()) markMeshesUnder(node)
  }
  for (const mesh of doc.getRoot().listMeshes()) {
    if (meshesSeen.has(mesh)) continue
    for (const prim of mesh.listPrimitives()) {
      const ex = prim.getExtras() || {}
      if (ex.atlasKind && ex.atlasKind !== 'bark') continue
      const acc = prim.getAttribute('POSITION')
      if (!acc) continue
      const arr = acc.getArray()
      for (let i = 0; i < arr.length; i += 3) {
        const mx = arr[i], my = arr[i + 1], mz = arr[i + 2]
        out.push(mx, my, mz, mx, my, mz)
      }
    }
  }
  function walk(node, parentMat) {
    const local = node.getMatrix()  // column-major 4x4
    const world = mul4(parentMat, local)
    const mesh = node.getMesh()
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const ex = prim.getExtras() || {}
        // Only sample bark/wood primitives (or untagged — matches generate-salon.js:497).
        if (ex.atlasKind && ex.atlasKind !== 'bark') continue
        const acc = prim.getAttribute('POSITION')
        if (!acc) continue
        const arr = acc.getArray()
        for (let i = 0; i < arr.length; i += 3) {
          const mx = arr[i], my = arr[i + 1], mz = arr[i + 2]
          const [wx, wy, wz] = transformPoint(world, mx, my, mz)
          out.push(mx, my, mz, wx, wy, wz)
        }
      }
    }
    for (const c of node.listChildren()) walk(c, world)
  }
  return out
}

// `verts` is flat: [mx, my, mz, wx, wy, wz] per vertex (6 floats each).
// Returns array of mesh-space [x, y, z] tags.
function deriveAttachments(verts, cfg) {
  const STRIDE = 6
  const N = verts.length / STRIDE
  if (N < 1) return []

  // World-space bbox + XZ centroid.
  let minWX =  Infinity, minWY =  Infinity, minWZ =  Infinity
  let maxWX = -Infinity, maxWY = -Infinity, maxWZ = -Infinity
  let sumWX = 0, sumWZ = 0
  for (let i = 0; i < verts.length; i += STRIDE) {
    const wx = verts[i + 3], wy = verts[i + 4], wz = verts[i + 5]
    if (wx < minWX) minWX = wx; if (wx > maxWX) maxWX = wx
    if (wy < minWY) minWY = wy; if (wy > maxWY) maxWY = wy
    if (wz < minWZ) minWZ = wz; if (wz > maxWZ) maxWZ = wz
    sumWX += wx; sumWZ += wz
  }
  const cWX = sumWX / N, cWZ = sumWZ / N
  const yThresh = minWY + (maxWY - minWY) * cfg.topYFrac

  const G = cfg.gridDensity
  const dxSpan = maxWX - minWX
  const dzSpan = maxWZ - minWZ
  if (dxSpan === 0 || dzSpan === 0) {
    // Degenerate: pick the highest-world-Y vertex, store its world coord.
    let bestI = -1, bestWY = -Infinity
    for (let i = 0; i < verts.length; i += STRIDE) {
      if (verts[i + 4] > bestWY) { bestWY = verts[i + 4]; bestI = i }
    }
    return bestI < 0 ? [] : [round4(verts[bestI + 3], verts[bestI + 4], verts[bestI + 5])]
  }
  const dx = dxSpan / G
  const dz = dzSpan / G

  // best[cell] keeps the vertex farthest from trunk axis in XZ. Stores the
  // world coord — that's what we serialize (v2 contract).
  const best = new Array(G * G).fill(null)
  for (let i = 0; i < verts.length; i += STRIDE) {
    const wy = verts[i + 4]
    if (wy < yThresh) continue
    const wx = verts[i + 3], wz = verts[i + 5]
    let ix = Math.floor((wx - minWX) / dx); if (ix >= G) ix = G - 1; if (ix < 0) ix = 0
    let iz = Math.floor((wz - minWZ) / dz); if (iz >= G) iz = G - 1; if (iz < 0) iz = 0
    const cell = ix * G + iz
    const ddx = wx - cWX, ddz = wz - cWZ
    const d2 = ddx * ddx + ddz * ddz
    const prev = best[cell]
    if (!prev || d2 > prev.distSq) {
      best[cell] = { wx, wy, wz, distSq: d2 }
    }
  }

  let tags = []
  for (let ix = 0; ix < G; ix++) {
    for (let iz = 0; iz < G; iz++) {
      const b = best[ix * G + iz]
      if (b) tags.push(round4(b.wx, b.wy, b.wz))
    }
  }

  if (cfg.densityMultiplier < 1.0 && tags.length > 1) {
    const keep = Math.max(1, Math.round(tags.length * cfg.densityMultiplier))
    tags = tags.slice(0, keep)
  }

  return tags
}

function round4(x, y, z) {
  return [Number(x.toFixed(4)), Number(y.toFixed(4)), Number(z.toFixed(4))]
}

async function writeIfChanged(p, text) {
  try {
    const cur = await fs.readFile(p, 'utf8')
    if (cur === text) {
      const now = new Date()
      await fs.utimes(p, now, now)
      return 'unchanged'
    }
  } catch { /* missing */ }
  await fs.writeFile(p, text)
  return 'written'
}

async function processChassis(name, cfg) {
  const glbPath  = path.join(CHASSIS_DIR, `${name}.glb`)
  const metaPath = path.join(CHASSIS_DIR, `${name}.meta.json`)
  const verts = await gatherVerts(glbPath)
  const tags = deriveAttachments(verts, cfg)
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
  meta.leafAttachmentTags = tags
  const next = JSON.stringify(meta, null, 2) + '\n'
  const action = await writeIfChanged(metaPath, next)
  return { name, count: tags.length, action }
}

async function main() {
  const cfg = await loadConfig()
  const entries = await fs.readdir(CHASSIS_DIR)
  const stems = entries
    .filter(e => e.endsWith('.meta.json'))
    .map(e => e.replace(/\.meta\.json$/, ''))
    .sort()

  console.log(`derive-leaf-attachment-tags: ${stems.length} chassis, config:`, cfg)

  const results = []
  for (const s of stems) {
    try { results.push(await processChassis(s, cfg)) }
    catch (e)  { results.push({ name: s, error: e.message }) }
  }

  const ok = results.filter(r => !r.error)
  const errs = results.filter(r => r.error)
  const written = ok.filter(r => r.action === 'written').length
  const unchanged = ok.filter(r => r.action === 'unchanged').length

  const sorted = [...ok].sort((a, b) => a.count - b.count)
  const counts = sorted.map(r => r.count)
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0

  console.log(`processed: ${ok.length}/${results.length}  (written ${written}, unchanged ${unchanged})`)
  console.log(`anchor count: min=${counts[0] ?? 0}  median=${median}  max=${counts.at(-1) ?? 0}`)

  const lo = ok.filter(r => r.count < cfg.minAnchors)
  const hi = ok.filter(r => r.count > cfg.maxAnchors)
  if (lo.length) {
    console.log(`\nbelow minAnchors (${cfg.minAnchors}): ${lo.length} chassis`)
    for (const r of lo.sort((a, b) => a.count - b.count)) {
      console.log(`  ${r.count.toString().padStart(4)}  ${r.name}`)
    }
  }
  if (hi.length) {
    console.log(`\nabove maxAnchors (${cfg.maxAnchors}): ${hi.length} chassis`)
    for (const r of hi.sort((a, b) => b.count - a.count)) {
      console.log(`  ${r.count.toString().padStart(4)}  ${r.name}`)
    }
  }
  if (errs.length) {
    console.log(`\nerrors: ${errs.length}`)
    for (const r of errs) console.log(`  ${r.name}: ${r.error}`)
    process.exit(2)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
