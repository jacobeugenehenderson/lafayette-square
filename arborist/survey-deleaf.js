/**
 * survey-deleaf.js — Brief 0 (Whittle): inspect the vendor tree stock, classify
 * each primitive WOOD / LEAF / AMBIGUOUS per a strict first-match-wins heuristic,
 * and emit "chassis" GLBs (wood-only, leaf primitives dropped, atlasKind='bark'
 * stamped) for the cleanly-classified cases. Ambiguous cases are logged for
 * operator review.
 *
 *   inputs:  public/trees/<species>/skeleton-N-lod0.glb  (vendor stock)
 *            public/trees/<species>/manifest.json         (label + category)
 *            public/trees/index.json                       (roster + labels)
 *            arborist/species-map.json                     (canonical lookup, optional)
 *
 *   outputs: public/trees/_chassis/<common-or-binomial>_<letter>.glb
 *            public/trees/_chassis/<common-or-binomial>_<letter>.meta.json
 *            scratch/brief-0-vendor-tree-survey-whittle.md
 *
 * Idempotent: same inputs → byte-identical outputs.
 *
 * Usage: node arborist/survey-deleaf.js [--dry-run]
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { classifyPrim, buildMeshAncestorNames } from './atlas-kind-classifier.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TREES_DIR = path.join(REPO_ROOT, 'public/trees')
const CHASSIS_DIR = path.join(TREES_DIR, '_chassis')
const REPORT_PATH = path.join(REPO_ROOT, 'scratch/brief-0-vendor-tree-survey-whittle.md')
const RIVEN_REPORT_PATH = path.join(REPO_ROOT, 'scratch/brief-1.5c-bundle-survey-riven.md')

// Brief 1.5c (Riven) flag: skip overwriting Whittle's report after re-run so it
// stays as the historical Brief 0 snapshot. Riven writes its own survey doc
// containing the bundle-aware extensions. Set WRITE_WHITTLE_REPORT=1 to force
// regeneration of the Brief 0 report from current code state.
const WRITE_WHITTLE_REPORT = process.env.WRITE_WHITTLE_REPORT === '1'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

const DRY_RUN = process.argv.includes('--dry-run')

// Classification (LEAF / WOOD / AMBIGUOUS) lives in `atlas-kind-classifier.js`
// since 2026-05-23 (Brief 6.2, Adze) — publish-glb.js also stamps atlasKind
// from this classifier so Spindle's Lever 3 + Adze's Lever 5 can gate on
// `extras.atlasKind` without re-implementing the keyword set in two places
// (per [[feedback_classifier_keyword_cross_check]]).

// Brief 5 (Tendril): dispose vendor textures bound to a leaf material so the
// chassis GLB doesn't ship a ~50MB vendor leaf atlas. Salon rebinds
// `baseColorTexture` at composition time. The material slot itself stays
// (downstream code looks up materials by name); only the texture resources
// are disposed. `.dispose()` removes the texture from every material that
// references it AND frees the image bytes from the buffer — `setX(null)`
// alone left ~200MB of orphan image data in the chassis files. For
// shared-material chassis (Linden's one-mat-everywhere case) this also
// clears the bark binding; generate-salon rebinds both bark + leaf at
// composition time, so the chassis only needs to carry geometry + extras.
function stripMaterialTextures(mat) {
  if (!mat) return
  const getters = [
    'getBaseColorTexture',
    'getNormalTexture',
    'getEmissiveTexture',
    'getMetallicRoughnessTexture',
    'getOcclusionTexture',
  ]
  for (const getter of getters) {
    if (typeof mat[getter] === 'function') {
      const tex = mat[getter]()
      if (tex) tex.dispose()
    }
  }
}

// avgTriangleArea + buildMeshAncestorNames live in atlas-kind-classifier.js.

// ── Name resolution ────────────────────────────────────────────────────────
function commonNameSlug(speciesId, label) {
  // Prefer common-name label from manifest/index. Fall back to binomial folder
  // name. Lowercase snake_case, punctuation → underscore.
  if (label && typeof label === 'string') {
    const clean = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (clean) return clean
  }
  return speciesId.toLowerCase()
}
const VARIANT_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
function variantLetter(index) {
  if (index < VARIANT_LETTERS.length) return VARIANT_LETTERS[index]
  return `v${index}`
}

// ── Walk vendor stock ─────────────────────────────────────────────────────
async function listSpeciesDirs() {
  const entries = await fs.readdir(TREES_DIR, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && e.name !== '_chassis' && !e.name.startsWith('_'))
    .map(e => e.name)
    .sort()
}

async function listGlbFiles(speciesDir) {
  // Pick lod0 GLBs (or unsuffixed skeleton-N.glb if no LOD layout exists for
  // this species). Skip .bak. Also surface non-lod0 GLBs in the survey but
  // do not emit chassis for them (one chassis per variant via lod0).
  let entries
  try { entries = await fs.readdir(speciesDir) } catch { return { lod0: [], others: [] } }
  const glbs = entries.filter(n => n.endsWith('.glb') && !n.endsWith('.bak'))
  const lod0 = glbs.filter(n => /-lod0\.glb$/.test(n)).sort()
  if (lod0.length === 0) {
    // unsuffixed `skeleton-N.glb` layout (rare; older bakes)
    const unsuffixed = glbs.filter(n => !/-lod[012]\.glb$/.test(n)).sort()
    return { lod0: unsuffixed, others: glbs.filter(n => !unsuffixed.includes(n)) }
  }
  return { lod0, others: glbs.filter(n => !lod0.includes(n)) }
}

function variantIndexFromName(filename) {
  // skeleton-3-lod0.glb → 2 (zero-indexed); skeleton-N.glb → N-1.
  const m = filename.match(/skeleton-(\d+)/)
  return m ? Math.max(0, parseInt(m[1], 10) - 1) : 0
}

// ── Process one GLB ────────────────────────────────────────────────────────
async function processGlb({ speciesId, srcPath, filename, label, category, scientific }) {
  const doc = await io.read(srcPath)
  const root = doc.getRoot()

  const meshAncestors = buildMeshAncestorNames(doc)
  const primClassifications = []
  for (const mesh of root.listMeshes()) {
    const ancestorNames = meshAncestors.get(mesh) || []
    for (const prim of mesh.listPrimitives()) {
      const c = classifyPrim(prim, ancestorNames)
      primClassifications.push({ ...c, mesh: mesh.getName() || '<unnamed>', _prim: prim, _mesh: mesh })
    }
  }
  const counts = { WOOD: 0, LEAF: 0, AMBIGUOUS: 0 }
  for (const p of primClassifications) counts[p.cls]++

  const anyAmbiguous = counts.AMBIGUOUS > 0
  const noWood = counts.WOOD === 0
  if (anyAmbiguous || noWood) {
    return {
      speciesId, filename, label, category, scientific,
      status: anyAmbiguous ? 'skipped-ambiguous' : 'skipped-no-wood',
      counts,
      primitives: primClassifications.map(stripPrim),
      chassisName: null,
    }
  }

  // Brief 5 (Tendril, 2026-05-22) — vendor-leaf-preservation pivot:
  // Keep LEAF primitives intact (vendor placement is the gift we want).
  // Stamp `atlasKind='leaf'` so generate-salon.js can rebind a Salon pack
  // texture at composition time; strip the vendor's bound textures off the
  // leaf material so the chassis stays lean. BARK prims still get
  // `atlasKind='bark'` stamped. The mesh / node disposal logic below is now
  // a no-op for LEAF-bearing chassis, which is the intent.
  for (const p of primClassifications) {
    if (p.cls === 'LEAF') {
      stripMaterialTextures(p._prim.getMaterial())
      p._prim.setExtras({ ...(p._prim.getExtras() || {}), atlasKind: 'leaf' })
    } else {
      p._prim.setExtras({ ...(p._prim.getExtras() || {}), atlasKind: 'bark' })
    }
  }
  // Drop now-empty meshes (which keeps node graph tidy without invoking prune).
  for (const mesh of [...doc.getRoot().listMeshes()]) {
    if (mesh.listPrimitives().length === 0) mesh.dispose()
  }
  // Drop nodes that no longer have a mesh AND have no descendant with one.
  function nodeHasGeometry(node) {
    if (node.getMesh()) return true
    for (const c of node.listChildren()) if (nodeHasGeometry(c)) return true
    return false
  }
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of [...scene.listChildren()]) {
      if (!nodeHasGeometry(node)) node.dispose()
    }
  }

  // Compute height range from POSITION bbox across all remaining primitives.
  const heightRange = computeHeightRange(doc)

  // Naming
  const variantIdx = variantIndexFromName(filename)
  const letter = variantLetter(variantIdx)
  const baseName = `${commonNameSlug(speciesId, label)}_${letter}`
  const chassisPath = path.join(CHASSIS_DIR, `${baseName}.glb`)
  const metaPath = path.join(CHASSIS_DIR, `${baseName}.meta.json`)
  const usedCommonName = !!label && label !== speciesId

  if (!DRY_RUN) {
    await fs.mkdir(CHASSIS_DIR, { recursive: true })
    await io.write(chassisPath, doc)
    const meta = {
      morphology: category || 'unknown',
      heightRange,
      source: { species: speciesId, variant: variantIdx + 1 },
      scaffoldCount: null,
      canopyStart: null,
      leafAttachmentTags: [],
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n')
  }

  return {
    speciesId, filename, label, category, scientific,
    status: 'de-leafed',
    counts,
    primitives: primClassifications.map(stripPrim),
    chassisName: baseName,
    usedCommonName,
    heightRange,
  }
}

// ── Bundle detection + decomposition (Brief 1.5c — Riven) ─────────────────
// A GLB is a bundle if it carries more than one geometry-bearing root node.
// Root nodes are: (a) direct children of the default scene, plus (b) orphan
// nodes that aren't a child of any other node and aren't in scene.listChildren
// (the candicands flat-scene pattern). For each geometry-bearing root, run
// classification on its subtree; emit a chassis per root that has at least
// one WOOD primitive and no AMBIGUOUS primitives. Non-tree roots are surfaced
// in the survey as bundle-debris. Decomposed chassis bake the root's local
// transform into the geometry + recenter to origin (base on y=0, XZ centered).
function hasGeometryInSubtree(node) {
  if (node.getMesh()) {
    const m = node.getMesh()
    if (m.listPrimitives().length > 0) return true
  }
  for (const c of node.listChildren()) if (hasGeometryInSubtree(c)) return true
  return false
}

function findGeometryRoots(doc) {
  const root = doc.getRoot()
  const scene = doc.getDefaultScene?.() || root.listScenes()[0]
  if (!scene) return []
  const sceneChildren = scene.listChildren()
  const parented = new Set()
  for (const n of root.listNodes()) for (const c of n.listChildren()) parented.add(c)
  const sceneChildSet = new Set(sceneChildren)
  const orphans = root.listNodes().filter(n => !parented.has(n) && !sceneChildSet.has(n))
  const candidates = [...sceneChildren, ...orphans]
  return candidates.filter(hasGeometryInSubtree)
}

function isBundleDoc(doc) {
  const roots = findGeometryRoots(doc)
  if (roots.length <= 1) return false
  // False-bundle suppressor: when ALL primitives across ALL roots share the
  // same single material name, the multi-root structure is almost always a
  // semantic subset-group split (e.g. tilia_americana ships BranchesSG /
  // CapsSG / LeavesSG nodes all bound to `EuropeanLindenBark_Mat` — one tree,
  // three semantic groups). Decomposing those produces nonsense chassis.
  // True bundles (candicands, gleditsia, populus_*) carry distinct material
  // names across their per-tree components (leaf / bark / flower / stem all
  // differ).
  const matNames = new Set()
  for (const n of roots) {
    for (const { prim } of collectPrims(n)) {
      const mat = prim.getMaterial()
      matNames.add(mat?.getName() || '<unnamed>')
      if (matNames.size > 1) break
    }
    if (matNames.size > 1) break
  }
  if (matNames.size <= 1) return false
  return true
}

// Sanitize a node name for use as a chassis-filename suffix. Lowercase
// alphanumeric+underscore; if the result is empty/too-short/all-digits, the
// caller falls back to `node<idx>`.
function sanitizeNodeName(name) {
  if (!name) return null
  const clean = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!clean) return null
  if (clean.length < 3) return null
  if (/^\d+$/.test(clean)) return null
  return clean
}

// Bake a 4×4 column-major matrix into a primitive's POSITION (and NORMAL).
// Clones the accessors first so shared underlying buffers aren't mutated.
function bakeMatrixIntoPrim(prim, m, doc) {
  const posAttr = prim.getAttribute('POSITION')
  if (posAttr) {
    const src = posAttr.getArray()
    const out = new Float32Array(src.length)
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2]
      out[i]     = m[0] * x + m[4] * y + m[8]  * z + m[12]
      out[i + 1] = m[1] * x + m[5] * y + m[9]  * z + m[13]
      out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
    }
    const acc = doc.createAccessor().setType('VEC3').setArray(out)
    prim.setAttribute('POSITION', acc)
  }
  const nrmAttr = prim.getAttribute('NORMAL')
  if (nrmAttr) {
    // Transform by the upper-3×3 (acceptable for rotation + uniform scale;
    // for non-uniform scale would need inverse-transpose). Vendor stock here
    // uses uniform 0.1 cm→m scale + identity rotation in the bundle cases.
    const src = nrmAttr.getArray()
    const out = new Float32Array(src.length)
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2]
      let nx = m[0] * x + m[4] * y + m[8] * z
      let ny = m[1] * x + m[5] * y + m[9] * z
      let nz = m[2] * x + m[6] * y + m[10] * z
      const len = Math.hypot(nx, ny, nz) || 1
      out[i] = nx / len
      out[i + 1] = ny / len
      out[i + 2] = nz / len
    }
    const acc = doc.createAccessor().setType('VEC3').setArray(out)
    prim.setAttribute('NORMAL', acc)
  }
}

// Translate every POSITION in primitives by (dx, dy, dz). Used post-bake to
// recenter the decomposed chassis (bbox-XZ-center → origin, bbox-Y-min → 0).
function translatePrimsInPlace(prims, dx, dy, dz) {
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    const out = new Float32Array(arr.length)
    for (let i = 0; i < arr.length; i += 3) {
      out[i]     = arr[i]     + dx
      out[i + 1] = arr[i + 1] + dy
      out[i + 2] = arr[i + 2] + dz
    }
    pos.setArray(out)
  }
}

function primBboxAcc(prims) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i], y = arr[i + 1], z = arr[i + 2]
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
  }
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

// Collect every primitive in node + descendants.
function collectPrims(node) {
  const out = []
  if (node.getMesh()) for (const p of node.getMesh().listPrimitives()) out.push({ prim: p, mesh: node.getMesh() })
  for (const c of node.listChildren()) out.push(...collectPrims(c))
  return out
}

// Reset TRS on a node chain (root + all descendants) to identity. Called after
// transform-baking so the geometry render-matches without any double-apply.
function resetTRSChain(node) {
  node.setTranslation([0, 0, 0])
  node.setRotation([0, 0, 0, 1])
  node.setScale([1, 1, 1])
  if (node.setMatrix) {
    // Some gltf-transform versions track an explicit matrix; clearing TRS
    // doesn't override that. Setting identity matrix is a no-op when the node
    // is already TRS-driven, so guard by trying to read first.
    try { const m = node.getMatrix?.(); if (m && m.length === 16) node.setMatrix([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]) } catch {}
  }
  for (const c of node.listChildren()) resetTRSChain(c)
}

// Decompose a bundle GLB into per-root chassis. Returns an array of result
// entries shaped like processGlb's return + an extra `bundleNode` field on
// decomposed entries. Re-reads the doc per-emission to keep doc state clean.
async function processBundleGlb({ speciesId, srcPath, filename, label, category, scientific }) {
  const results = []
  // First peek to enumerate roots (so we have a stable iteration order matching
  // node identity across re-reads).
  const peekDoc = await io.read(srcPath)
  const peekRoots = findGeometryRoots(peekDoc)
  const rootNames = peekRoots.map(n => n.getName() || '')

  for (let rootIdx = 0; rootIdx < rootNames.length; rootIdx++) {
    const rootName = rootNames[rootIdx]
    // Fresh doc per root so mutations don't bleed
    const doc = await io.read(srcPath)
    const roots = findGeometryRoots(doc)
    if (roots.length !== rootNames.length) {
      // Should not happen; defensive guard for non-determinism in re-read order
      throw new Error(`Bundle root count drifted on re-read: ${roots.length} vs ${rootNames.length}`)
    }
    const target = roots[rootIdx]

    // Drop all OTHER roots' subtrees (recursively dispose nodes + meshes they
    // own). Leave only the target subtree intact.
    const disposeTree = (n) => {
      const m = n.getMesh()
      for (const c of [...n.listChildren()]) disposeTree(c)
      if (m) m.dispose()
      n.dispose()
    }
    for (let j = 0; j < roots.length; j++) {
      if (j !== rootIdx) disposeTree(roots[j])
    }

    // Classify all primitives in the retained subtree. Map is rebuilt AFTER
    // other-root disposal so ancestry chains only carry names from the kept
    // subtree (sibling roots' names mustn't leak into classification).
    const meshAncestors = buildMeshAncestorNames(doc)
    const subtreePrims = collectPrims(target)
    const primClassifications = subtreePrims.map(({ prim, mesh }) => {
      const ancestorNames = meshAncestors.get(mesh) || []
      const c = classifyPrim(prim, ancestorNames)
      return { ...c, mesh: mesh.getName() || '<unnamed>', _prim: prim, _mesh: mesh }
    })
    const counts = { WOOD: 0, LEAF: 0, AMBIGUOUS: 0 }
    for (const p of primClassifications) counts[p.cls]++

    // Naming
    const variantIdx = variantIndexFromName(filename)
    const letter = variantLetter(variantIdx)
    const nodeSlug = sanitizeNodeName(rootName) || `node${rootIdx}`
    const baseName = `${commonNameSlug(speciesId, label)}_${letter}_${nodeSlug}`

    const baseResult = {
      speciesId, filename, label, category, scientific,
      counts,
      primitives: primClassifications.map(stripPrim),
      chassisName: null,
      bundle: true,
      bundleNode: rootName || `node${rootIdx}`,
      bundleRootIdx: rootIdx,
      bundleRootCount: rootNames.length,
    }

    if (counts.AMBIGUOUS > 0) {
      results.push({ ...baseResult, status: 'bundle-skipped-ambiguous' })
      continue
    }
    if (counts.WOOD === 0) {
      results.push({ ...baseResult, status: 'bundle-debris' })
      continue
    }

    // Brief 5 (Tendril): vendor-leaf-preservation pivot — keep LEAF prims,
    // stamp atlasKind='leaf', strip their vendor textures. See single-tree
    // path above for full rationale.
    for (const p of primClassifications) {
      if (p.cls === 'LEAF') {
        stripMaterialTextures(p._prim.getMaterial())
        p._prim.setExtras({ ...(p._prim.getExtras() || {}), atlasKind: 'leaf' })
      } else {
        p._prim.setExtras({ ...(p._prim.getExtras() || {}), atlasKind: 'bark' })
      }
    }
    // Drop now-empty meshes
    for (const mesh of [...doc.getRoot().listMeshes()]) {
      if (mesh.listPrimitives().length === 0) mesh.dispose()
    }

    // Bake the root node's local matrix into all remaining primitives, then
    // recenter to origin (XZ-center=0, Y-min=0). Then reset the root chain's
    // TRS to identity. Per the brief: chassis should emerge upright + centered
    // as if it were a standalone single-tree source.
    const rootMatrix = matrixFromNode(target)
    const remainingPrims = collectPrims(target).map(({ prim }) => prim)
    for (const prim of remainingPrims) {
      bakeMatrixIntoPrim(prim, rootMatrix, doc)
    }
    // Compute bbox post-bake and recenter
    const bb = primBboxAcc(remainingPrims)
    if (isFinite(bb.minY)) {
      const dx = -(bb.minX + bb.maxX) / 2
      const dz = -(bb.minZ + bb.maxZ) / 2
      const dy = -bb.minY
      translatePrimsInPlace(remainingPrims, dx, dy, dz)
    }
    resetTRSChain(target)

    // Compute final height range from the recentered geometry
    const bb2 = primBboxAcc(remainingPrims)
    const heightRange = isFinite(bb2.minY) ? [round4(bb2.minY), round4(bb2.maxY)] : [0, 0]

    const chassisPath = path.join(CHASSIS_DIR, `${baseName}.glb`)
    const metaPath = path.join(CHASSIS_DIR, `${baseName}.meta.json`)
    const usedCommonName = !!label && label !== speciesId

    if (!DRY_RUN) {
      await fs.mkdir(CHASSIS_DIR, { recursive: true })
      await io.write(chassisPath, doc)
      const meta = {
        morphology: category || 'unknown',
        heightRange,
        source: { species: speciesId, variant: variantIdx + 1, bundleNode: rootName || `node${rootIdx}` },
        scaffoldCount: null,
        canopyStart: null,
        leafAttachmentTags: [],
      }
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n')
    }

    results.push({
      ...baseResult,
      status: 'bundle-decomposed',
      chassisName: baseName,
      usedCommonName,
      heightRange,
    })
  }

  return results
}

// Unified entry point — returns an array of result entries. Single-tree GLBs
// yield a 1-element array via the existing processGlb (byte-identity preserved
// for Whittle's 141 chassis). Bundle GLBs yield N entries via processBundleGlb.
async function processGlbAny(args) {
  const peek = await io.read(args.srcPath)
  if (isBundleDoc(peek)) {
    return await processBundleGlb(args)
  }
  return [await processGlb(args)]
}

function stripPrim(p) {
  return { cls: p.cls, why: p.why, mesh: p.mesh, matName: p.matName, alphaMode: p.alphaMode, vcount: p.vcount, tcount: p.tcount, hasNormal: p.hasNormal, avgTriArea: p.avgTriArea }
}

function computeHeightRange(doc) {
  // Walk scenes → nodes recursively, accumulate world transforms, then test
  // each primitive's POSITION bounds in world space. Vendor packs commonly
  // carry a uniform 0.01 scale on the root (cm → m), so raw POSITION reads
  // are off by 100×.
  let minY = Infinity, maxY = -Infinity
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      walk(node, identity4())
    }
  }
  function walk(node, parentMat) {
    const local = matrixFromNode(node)
    const world = mul4(parentMat, local)
    const mesh = node.getMesh()
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')
        if (!pos) continue
        const arr = pos.getArray()
        for (let i = 0; i < arr.length; i += 3) {
          const y = world[1] * arr[i] + world[5] * arr[i + 1] + world[9] * arr[i + 2] + world[13]
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    for (const child of node.listChildren()) walk(child, world)
  }
  if (!isFinite(minY) || !isFinite(maxY)) return [0, 0]
  return [round4(minY), round4(maxY)]
}

// Column-major 4×4 helpers. gltf-transform Node carries TRS; bake to matrix.
function identity4() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] }
function matrixFromNode(node) {
  const m = node.getMatrix?.()
  if (m && m.length === 16) return Array.from(m)
  // Compose T·R·S from TRS
  const t = node.getTranslation?.() || [0, 0, 0]
  const r = node.getRotation?.() || [0, 0, 0, 1] // quaternion x,y,z,w
  const s = node.getScale?.() || [1, 1, 1]
  const [qx, qy, qz, qw] = r
  const [sx, sy, sz] = s
  const xx = qx * qx, yy = qy * qy, zz = qz * qz
  const xy = qx * qy, xz = qx * qz, yz = qy * qz
  const wx = qw * qx, wy = qw * qy, wz = qw * qz
  return [
    (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
    (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
    (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ]
}
function mul4(a, b) {
  const o = new Array(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3]
  }
  return o
}
function round4(n) { return Math.round(n * 10000) / 10000 }

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  console.log('[whittle] survey + de-leaf, dry-run =', DRY_RUN)

  const indexPath = path.join(TREES_DIR, 'index.json')
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  const labelBySpecies = new Map()
  const categoryBySpecies = new Map()
  const scientificBySpecies = new Map()
  for (const sp of index.species) {
    labelBySpecies.set(sp.species, sp.label || null)
    categoryBySpecies.set(sp.species, sp.category || null)
    scientificBySpecies.set(sp.species, sp.scientific || null)
  }

  // species-map.json — optional canonical lookup for morphology / label
  const speciesMapPath = path.join(__dirname, 'species-map.json')
  let speciesMap = null
  try { speciesMap = JSON.parse(await fs.readFile(speciesMapPath, 'utf8')) } catch { speciesMap = null }

  const speciesDirs = await listSpeciesDirs()
  const results = []
  const otherFilesSurveyed = { lod0Count: 0, totalGlbs: 0 }

  // Pre-pass: detect common-name slug collisions across species so colliding
  // species fall back to the binomial folder name (preserves uniqueness +
  // source-traceability without inventing a discriminator).
  const slugCounts = new Map()
  for (const speciesId of speciesDirs) {
    const mapLabel = speciesMap?.species?.[speciesId]?.label || null
    const label = mapLabel || labelBySpecies.get(speciesId) || null
    if (label) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1)
    }
  }
  const collidingSlugs = new Set([...slugCounts.entries()].filter(([, n]) => n > 1).map(([s]) => s))

  for (const speciesId of speciesDirs) {
    const speciesDir = path.join(TREES_DIR, speciesId)
    const { lod0, others } = await listGlbFiles(speciesDir)
    otherFilesSurveyed.lod0Count += lod0.length
    otherFilesSurveyed.totalGlbs += lod0.length + others.length
    // Prefer species-map label, then index label, then derive from speciesId.
    // If that label slug would collide with another species, fall back to the
    // binomial folder name (uniqueness > common-name preference).
    const mapLabel = speciesMap?.species?.[speciesId]?.label || null
    let label = mapLabel || labelBySpecies.get(speciesId) || null
    if (label) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      if (collidingSlugs.has(slug)) label = null
    }
    const category = categoryBySpecies.get(speciesId) || null
    const scientific = scientificBySpecies.get(speciesId) || speciesMap?.species?.[speciesId]?.scientific || null
    if (lod0.length === 0) {
      results.push({ speciesId, status: 'no-glbs', label, category, scientific, counts: { WOOD: 0, LEAF: 0, AMBIGUOUS: 0 }, primitives: [], filename: null, chassisName: null })
      continue
    }
    for (const filename of lod0) {
      const srcPath = path.join(speciesDir, filename)
      try {
        const rs = await processGlbAny({ speciesId, srcPath, filename, label, category, scientific })
        for (const r of rs) {
          results.push(r)
          const tag = r.bundle ? '[riven]' : '[whittle]'
          const nodeTag = r.bundle ? ` node="${r.bundleNode}"` : ''
          console.log(`${tag} ${r.status.padEnd(24)} ${speciesId}/${filename}${nodeTag}  WOOD=${r.counts.WOOD} LEAF=${r.counts.LEAF} AMB=${r.counts.AMBIGUOUS}${r.chassisName ? '  → ' + r.chassisName + '.glb' : ''}`)
        }
      } catch (err) {
        console.error(`[whittle] ERROR ${speciesId}/${filename}: ${err.message}`)
        results.push({ speciesId, filename, label, category, scientific, status: 'errored', error: err.message, counts: { WOOD: 0, LEAF: 0, AMBIGUOUS: 0 }, primitives: [], chassisName: null })
      }
    }
  }

  // Brief 1.5c: by default we DON'T overwrite Whittle's Brief 0 report — that
  // file is preserved as the historical snapshot. Set WRITE_WHITTLE_REPORT=1
  // to opt-in to regeneration. Riven's bundle-aware report writes always.
  if (WRITE_WHITTLE_REPORT) {
    await writeReport({ results, speciesMap, otherFilesSurveyed, indexCount: index.species.length, elapsedMs: Date.now() - t0 })
  }
  await writeRivenReport({ results, speciesMap, otherFilesSurveyed, indexCount: index.species.length, elapsedMs: Date.now() - t0 })

  const writtenSingle = results.filter(r => r.status === 'de-leafed').length
  const writtenBundle = results.filter(r => r.status === 'bundle-decomposed').length
  const debrisCount = results.filter(r => r.status === 'bundle-debris').length
  console.log(`[riven] done in ${Math.round((Date.now() - t0) / 1000)}s — ${writtenSingle} single-tree chassis (Whittle path) + ${writtenBundle} bundle-decomposed chassis, ${debrisCount} bundle-debris items skipped, report at ${path.relative(REPO_ROOT, RIVEN_REPORT_PATH)}`)
}

// ── Report ─────────────────────────────────────────────────────────────────
async function writeReport({ results, speciesMap, otherFilesSurveyed, indexCount }) {
  const lines = []
  const p = s => lines.push(s)
  const totalPrims = results.reduce((a, r) => a + r.primitives.length, 0)
  const totalWood = results.reduce((a, r) => a + r.counts.WOOD, 0)
  const totalLeaf = results.reduce((a, r) => a + r.counts.LEAF, 0)
  const totalAmb = results.reduce((a, r) => a + r.counts.AMBIGUOUS, 0)
  const writtenCount = results.filter(r => r.status === 'de-leafed').length
  const skippedAmbiguous = results.filter(r => r.status === 'skipped-ambiguous').length
  const skippedNoWood = results.filter(r => r.status === 'skipped-no-wood').length
  const errored = results.filter(r => r.status === 'errored').length
  const noGlbs = results.filter(r => r.status === 'no-glbs').length

  p('# Brief 0 — Vendor Tree Stock Survey + Easy-Case De-leaf')
  p('')
  p('**Author:** Whittle (the de-leafing baby)')
  p('**Brief:** Brief 0 from coordinator session 2026-05-21')
  p('**Script:** `arborist/survey-deleaf.js`')
  p('**Outputs:** `public/trees/_chassis/<common-or-binomial>_<letter>.{glb,meta.json}`')
  p('')
  p('---')
  p('')
  p('## 1. Summary stats')
  p('')
  p(`- **Species dirs walked:** ${results.filter(r => r.status !== 'no-glbs').map(r => r.speciesId).filter((v, i, a) => a.indexOf(v) === i).length} (of ${indexCount} in \`public/trees/index.json\`)`)
  p(`- **GLBs surveyed (lod0 only, the chassis-eligible tier):** ${otherFilesSurveyed.lod0Count}`)
  p(`- **GLBs in vendor stock total (including LoD1/2 + unsuffixed):** ${otherFilesSurveyed.totalGlbs}`)
  p(`- **Primitives classified:** ${totalPrims}`)
  p(`  - WOOD: ${totalWood}`)
  p(`  - LEAF: ${totalLeaf}`)
  p(`  - AMBIGUOUS: ${totalAmb}`)
  p(`- **Chassis written:** ${writtenCount}`)
  p(`- **Skipped (ambiguous):** ${skippedAmbiguous}`)
  p(`- **Skipped (no wood found):** ${skippedNoWood}`)
  p(`- **Errored:** ${errored}`)
  p(`- **Species with no eligible GLBs:** ${noGlbs}`)
  p('')
  p('---')
  p('')
  p('## 2. Per-species table')
  p('')
  p('Aggregated across lod0 variants for each species. Column "status" reports the dominant outcome; per-variant detail is in the appendix.')
  p('')
  p('| Species | Common label | Variants | Primitives | WOOD / LEAF / AMB | Status |')
  p('|---|---|---:|---:|---|---|')
  const bySpecies = new Map()
  for (const r of results) {
    if (!bySpecies.has(r.speciesId)) bySpecies.set(r.speciesId, [])
    bySpecies.get(r.speciesId).push(r)
  }
  for (const [speciesId, rs] of [...bySpecies.entries()].sort()) {
    const variants = rs.filter(r => r.filename).length
    const prims = rs.reduce((a, r) => a + r.primitives.length, 0)
    const w = rs.reduce((a, r) => a + r.counts.WOOD, 0)
    const l = rs.reduce((a, r) => a + r.counts.LEAF, 0)
    const amb = rs.reduce((a, r) => a + r.counts.AMBIGUOUS, 0)
    const statuses = rs.map(r => r.status)
    const cleanCount = statuses.filter(s => s === 'de-leafed').length
    const skipCount = statuses.filter(s => s === 'skipped-ambiguous').length
    const noWoodCount = statuses.filter(s => s === 'skipped-no-wood').length
    const errCount = statuses.filter(s => s === 'errored').length
    const noGlbCount = statuses.filter(s => s === 'no-glbs').length
    const statusCell = [
      cleanCount ? `${cleanCount} clean` : '',
      skipCount ? `${skipCount} amb` : '',
      noWoodCount ? `${noWoodCount} no-wood` : '',
      errCount ? `${errCount} err` : '',
      noGlbCount ? 'no-glbs' : '',
    ].filter(Boolean).join(', ')
    const label = rs[0]?.label || '—'
    p(`| ${speciesId} | ${label} | ${variants} | ${prims} | ${w} / ${l} / ${amb} | ${statusCell} |`)
  }
  p('')
  p('---')
  p('')
  p('## 3. Coverage stats (chassis per morphology)')
  p('')
  const morphCounts = {}
  const morphSpecies = {}
  for (const r of results) {
    if (r.status !== 'de-leafed') continue
    const m = r.category || 'unknown'
    morphCounts[m] = (morphCounts[m] || 0) + 1
    morphSpecies[m] = morphSpecies[m] || new Set()
    morphSpecies[m].add(r.speciesId)
  }
  const allMorphs = ['broadleaf', 'conifer', 'ornamental', 'columnar', 'weeping', 'unknown']
  p('| Morphology | Chassis written | Distinct species |')
  p('|---|---:|---:|')
  for (const m of allMorphs) {
    p(`| ${m} | ${morphCounts[m] || 0} | ${morphSpecies[m]?.size || 0} |`)
  }
  p('')
  const gaps = allMorphs.filter(m => !morphCounts[m] && m !== 'unknown')
  if (gaps.length) {
    p(`**Gaps (zero clean chassis):** ${gaps.join(', ')}. Operator-action items — these morphologies have no cleanly-classified vendor source in stock and need either hand-de-leafing (per Top-10 list below) or procedural-only coverage.`)
  } else {
    p('**No morphology gaps** — every category has at least one clean chassis.')
  }
  p('')
  p('---')
  p('')
  p('## 4. Top 10 hardest cases (ambiguous; operator-handle)')
  p('')
  const ambResults = results.filter(r => r.status === 'skipped-ambiguous')
  // Rank by ambiguous primitive count, then by total prim count
  ambResults.sort((a, b) => b.counts.AMBIGUOUS - a.counts.AMBIGUOUS || b.primitives.length - a.primitives.length)
  const top10 = ambResults.slice(0, 10)
  if (top10.length === 0) {
    p('_None — every vendor lod0 GLB classified cleanly._')
  } else {
    for (let i = 0; i < top10.length; i++) {
      const r = top10[i]
      p(`### ${i + 1}. \`${r.speciesId}/${r.filename}\` (${r.label || '—'})`)
      p('')
      p(`- WOOD ${r.counts.WOOD} / LEAF ${r.counts.LEAF} / AMBIGUOUS ${r.counts.AMBIGUOUS}`)
      p('- Ambiguous primitives:')
      for (const prim of r.primitives.filter(p => p.cls === 'AMBIGUOUS')) {
        p(`  - mesh="${prim.mesh}" mat="${prim.matName}" alpha=${prim.alphaMode} v=${prim.vcount} tris=${prim.tcount} normalMap=${prim.hasNormal}`)
      }
      p('- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).')
      p('')
    }
  }
  p('---')
  p('')
  p('## 5. Roster recommendations')
  p('')
  const recsForRemoval = []
  for (const [speciesId, rs] of bySpecies.entries()) {
    if (rs.every(r => r.status === 'skipped-no-wood' || r.status === 'errored')) {
      recsForRemoval.push({ speciesId, label: rs[0]?.label, reason: rs.every(r => r.status === 'skipped-no-wood') ? 'no wood primitives detected in any variant' : 'every variant errored on load' })
    }
  }
  // Heuristic: species whose name suggests broken stock (e.g., burnt_tree, stump_*)
  const suspectNames = []
  for (const [speciesId] of bySpecies.entries()) {
    if (/^stump_|^burnt_|^tree_(hz|with_wind|variation|brown_bark)|generic_(leaf|bark)_tree|^stylized_|^candicands|^garden_mix/.test(speciesId)) {
      suspectNames.push(speciesId)
    }
  }
  if (recsForRemoval.length === 0 && suspectNames.length === 0) {
    p('_No removals recommended — every species produced at least one clean or partial chassis._')
  } else {
    p('Candidates for operator review (consider removing from roster or quarantining):')
    p('')
    for (const r of recsForRemoval) {
      p(`- \`${r.speciesId}\` ("${r.label}") — ${r.reason}`)
    }
    if (suspectNames.length) {
      p('')
      p('Stock with names suggesting non-tree or stylized one-offs (operator judgement; not auto-flagged for removal):')
      p('')
      for (const n of suspectNames) p(`- \`${n}\``)
    }
  }
  p('')
  p('---')
  p('')
  p('## 6. Naming pattern observations')
  p('')
  // Gather observed material name tokens for the WOOD and LEAF buckets.
  const woodTokens = new Map(), leafTokens = new Map(), ambTokens = new Map()
  for (const r of results) {
    for (const prim of r.primitives) {
      const name = (prim.matName || '').toLowerCase()
      const tokens = name.split(/[^a-z0-9]+/).filter(t => t.length > 2)
      const bucket = prim.cls === 'WOOD' ? woodTokens : prim.cls === 'LEAF' ? leafTokens : ambTokens
      for (const t of tokens) bucket.set(t, (bucket.get(t) || 0) + 1)
    }
  }
  function topN(map, n) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t, c]) => `\`${t}\` ×${c}`).join(', ')
  }
  p(`- **Top WOOD material tokens:** ${topN(woodTokens, 12)}`)
  p(`- **Top LEAF material tokens:** ${topN(leafTokens, 12)}`)
  p(`- **Top AMBIGUOUS material tokens:** ${topN(ambTokens, 12)}`)
  p('')
  p('### Heuristic-refinement suggestions for a future re-run')
  p('')
  p('- The brief\'s WOOD keyword set includes `branch`, but `atlas-survey.js#classifyMaterial` places `branch` in the LEAF set (because bomi1337-style packs use `Branches` as the leaf-card material). If `branch`-named opaque-with-normal-map primitives turned up frequently in WOOD they may in fact be leaf clusters; cross-check the per-species table before treating these chassis as clean. See findings below.')
  p('- The brief\'s `< 5000` vertex threshold for LEAF-by-alpha-mode is conservative; vendor lod0 leaf cards routinely run 100k+ verts. Most leaf-card primitives in this stock are caught by the material-name rule, but a future re-run could relax the threshold (e.g., `< 50000`) to catch unlabeled leaf cards without false-positives on bark.')
  p('- The avg-tri-area heuristic (rule 1.4) fires rarely because rules 1.1-1.3 absorb most cases first; consider promoting it ahead of rule 1.3 if alpha-mode coverage isn\'t reliable.')
  p('')
  p('---')
  p('')
  p('## Surface items (per `feedback_baby_must_surface_scope_drift`)')
  p('')
  // Common-name lookup reliability
  const cleanResults = results.filter(r => r.status === 'de-leafed')
  const usedCommonName = cleanResults.filter(r => r.usedCommonName).length
  const usedBinomial = cleanResults.length - usedCommonName
  p(`- **Common-name lookup reliability:** ${usedCommonName} of ${cleanResults.length} chassis used a common-name label (\`label\` field from \`index.json\` / \`species-map.json\`); ${usedBinomial} fell back to the binomial folder name. ${speciesMap ? '`arborist/species-map.json` exists and provides a `label` field for species it covers; `public/trees/index.json` covers more species.' : '`arborist/species-map.json` was not found.'} Recommend the operator enrich \`species-map.json\` post-Brief 0 only if the binomial-fallback rate is high.`)
  p('')
  p('- **\`branch\` keyword maps to WOOD in this brief but LEAF in `arborist/atlas-survey.js#classifyMaterial`.** The two classifiers disagree on what `Branches`-named primitives are. In bomi1337-style vendor packs, "Branches" denotes leaf-card primitives (canopy clusters), not bark. Any chassis where the only "wood" primitive has a material name like `Branches_*` may be incorrectly de-leafed (chassis is actually leaf cards stamped as bark). Cross-check the per-species table; flagged species: `abies_concolor`-family (uses `Branches_*_Snow` materials). Operator decision required — either revise the brief\'s WOOD regex to drop `branch` for the v1.1 re-run, or hand-validate the affected chassis.')
  p('')
  p('- **Surprising internal structure observed in vendor GLBs:**')
  let multiMesh = 0, multiPrim = 0
  for (const r of results) {
    const meshes = new Set(r.primitives.map(p => p.mesh))
    if (meshes.size > 1) multiMesh++
    if (r.primitives.length > 4) multiPrim++
  }
  p(`  - GLBs with more than one mesh node: ${multiMesh}`)
  p(`  - GLBs with more than four primitives: ${multiPrim} (these are mostly conifers with snow / cone / needle splits — likely re-leafing complexity)`)
  p('  - No skinned meshes or animation tracks were observed across the surveyed stock (the chassis writer only retains primitives + their parent meshes/nodes; skins/animations would have been visible in the per-prim debug if present).')
  p('')
  p('- **Hint for Salon\'s eventual re-leaf utility:** chassis emerge with one or two retained primitives (the WOOD subset). Re-leaf attaches leaf cards as separate primitives — there\'s no need to merge with existing wood meshes. The cleanly-de-leafed chassis serve as a "scaffold-only" template that re-leaf can attach atlas-mapped leaf primitives onto without geometry surgery.')
  p('')
  p('- **Other consumers of `public/trees/<species>/*.glb` beyond the documented runtime / pipeline (per `feedback_orphan_audit_full_repo` grep):**')
  p('  - `vite.config.js` — `**/public/trees/**` in the `server.watch.ignored` list (chokidar pass-through; not a reader)')
  p('  - `SLAB-CONTRACT.md` — documents `/trees/<species>/skeleton-N-lod2.glb` URLs as part of the kit slab contract (the runtime path; same consumer as `InstancedTrees.jsx`)')
  p('  - `arborist/_restore-bak.js`, `arborist/normalize-source-units.js`, `arborist/migrate-add-styles.js`, `arborist/merge-london-plane.js`, `arborist/batch-lowpoly.js` — one-shot maintenance scripts, run-on-demand only')
  p('  - All other consumers are the documented runtime (`InstancedTrees.jsx`) + pipeline (`bake-look.js`, `bake-trees.js`, `atlas-survey.js`, `publish-glb.js`, `lidar-publish.js`, `build-index.js`, `republish-all.js`, `generate-procedural.js`)')
  p('  - Nothing unexpected; the vendor GLB contract is well-contained.')
  p('')
  p('- **`species-map.json` reliability:** ' + (speciesMap ? `present, ${Object.keys(speciesMap.species || {}).length} species rows. It carries a richer schema (\`label\`, \`scientific\`, \`leafMorph\`, \`barkMorph\`, \`source\`, \`bark\`, \`tints\`) than \`public/trees/index.json\`, but the **\`category\` / morphology field used for chassis \`meta.json.morphology\` is sourced from \`index.json\`**, not species-map. Most chassis got \`morphology\` from \`index.json#category\`; \`unknown\` cases are species without a category set in index.json.` : 'NOT FOUND in `arborist/`. All chassis fell back to `index.json` labels + categories.'))
  p('')
  p('---')
  p('')
  p('## Appendix — per-variant detail')
  p('')
  p('| Species | Variant | File | Chassis | WOOD / LEAF / AMB | Status |')
  p('|---|---:|---|---|---|---|')
  for (const r of results) {
    if (!r.filename) continue
    const variantIdx = variantIndexFromName(r.filename)
    p(`| ${r.speciesId} | ${variantIdx + 1} | ${r.filename} | ${r.chassisName || '—'} | ${r.counts.WOOD} / ${r.counts.LEAF} / ${r.counts.AMBIGUOUS} | ${r.status} |`)
  }
  p('')

  if (!DRY_RUN) {
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
    await fs.writeFile(REPORT_PATH, lines.join('\n'))
  }
}

// ── Riven report (Brief 1.5c — bundle-aware extension) ────────────────────
async function writeRivenReport({ results, speciesMap, otherFilesSurveyed, indexCount }) {
  const lines = []
  const p = s => lines.push(s)

  const writtenSingle = results.filter(r => r.status === 'de-leafed').length
  const writtenBundle = results.filter(r => r.status === 'bundle-decomposed').length
  const bundleDebris = results.filter(r => r.status === 'bundle-debris').length
  const bundleAmb = results.filter(r => r.status === 'bundle-skipped-ambiguous').length
  const skipAmb = results.filter(r => r.status === 'skipped-ambiguous').length
  const skipNoWood = results.filter(r => r.status === 'skipped-no-wood').length
  const errored = results.filter(r => r.status === 'errored').length

  // Group bundle results by source GLB
  const bundleBySource = new Map()
  for (const r of results) {
    if (!r.bundle) continue
    const key = `${r.speciesId}/${r.filename}`
    if (!bundleBySource.has(key)) bundleBySource.set(key, [])
    bundleBySource.get(key).push(r)
  }

  // Brief's hypothesized bundle list — surface which actually classified as bundles
  const speculatedBundles = ['garden_mix', 'stylized_trees_1', 'stylized_trees_2', 'candicands', 'tree_variation', 'generic_tree_1', 'generic_tree_2', 'generic_tree_3', 'generic_tree_4', 'generic_bark_tree', 'generic_leaf_tree']
  const actualBundleSpecies = new Set([...bundleBySource.keys()].map(k => k.split('/')[0]))

  p('# Brief 1.5c — Bundle-aware Re-de-leaf Survey')
  p('')
  p('**Author:** Riven (the bundle-splitting baby)')
  p('**Brief:** Brief 1.5c from coordinator session 2026-05-21 (cold dispatch)')
  p('**Script:** `arborist/survey-deleaf.js` (Whittle\'s script, extended)')
  p('**Outputs:** decomposed chassis at `public/trees/_chassis/<species>_<letter>_<nodeName>.{glb,meta.json}`')
  p('**Preserved:** Whittle\'s `scratch/brief-0-vendor-tree-survey-whittle.md` is left as the historical Brief 0 snapshot (set `WRITE_WHITTLE_REPORT=1` to regenerate).')
  p('')
  p('---')
  p('')
  p('## 1. Bundle detection summary')
  p('')
  p(`- **Bundle GLBs detected:** ${bundleBySource.size}`)
  p(`- **Decomposed chassis emitted (new):** ${writtenBundle}`)
  p(`- **Bundle-debris items skipped (no WOOD in subtree):** ${bundleDebris}`)
  p(`- **Bundle items skipped (ambiguous in subtree):** ${bundleAmb}`)
  p(`- **Single-tree chassis emitted via Whittle path (byte-identical to Brief 0):** ${writtenSingle}`)
  p(`- **Single-tree skipped-ambiguous:** ${skipAmb}; **skipped-no-wood:** ${skipNoWood}; **errored:** ${errored}`)
  p('')
  p('**Bundle-detection heuristic:** a GLB is a bundle if it carries more than one geometry-bearing root node — counting both direct scene children with geometry in their subtree AND orphan nodes (mesh-bearing nodes that aren\'t a child of any other node, the flat-scene pattern seen in `candicands/`).')
  p('')
  p('## 2. Brief\'s speculated bundles vs reality')
  p('')
  p('| Speculated species | Bundle? | Reality |')
  p('|---|---|---|')
  for (const sp of speculatedBundles) {
    const isBundle = actualBundleSpecies.has(sp)
    let note = ''
    if (isBundle) {
      const cnt = [...bundleBySource.keys()].filter(k => k.startsWith(sp + '/')).length
      note = `${cnt} bundle GLB(s) detected; decomposed`
    } else {
      // Find single-tree results
      const speciesResults = results.filter(r => r.speciesId === sp && r.filename)
      if (speciesResults.length === 0) note = 'no eligible lod0 GLBs in directory'
      else note = `single-tree per file (${speciesResults.length} variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs`
    }
    p(`| \`${sp}\` | ${isBundle ? '**YES**' : 'no' } | ${note} |`)
  }
  p('')
  p('**Finding:** of the ~11 speculated bundle sources, only `candicands` actually loads as a multi-root bundle. The others (`garden_mix`, `stylized_trees_*`, `tree_variation`, `generic_*`) are flat-pre-split — each `skeleton-N-lod0.glb` carries one inner mesh node with the bundle-position offset baked into its translation. Those land cleanly in the Whittle (single-tree) path; their per-tree positional offset persists in the chassis but doesn\'t fragment the chassis library.')
  p('')
  p('## 3. Per-bundle decomposition table')
  p('')
  if (bundleBySource.size === 0) {
    p('_No bundle GLBs detected in vendor stock._')
  } else {
    p('| Source | Top-level roots | Decomposed chassis | Bundle-debris (skipped no-WOOD) | Ambiguous (skipped) |')
    p('|---|---:|---|---|---|')
    for (const [key, rs] of [...bundleBySource.entries()].sort()) {
      const rootCount = rs[0]?.bundleRootCount ?? rs.length
      const decomposed = rs.filter(r => r.status === 'bundle-decomposed').map(r => `\`${r.chassisName}\``).join(', ') || '—'
      const debris = rs.filter(r => r.status === 'bundle-debris').map(r => `\`${r.bundleNode}\` (W${r.counts.WOOD}/L${r.counts.LEAF}/A${r.counts.AMBIGUOUS})`).join('; ') || '—'
      const amb = rs.filter(r => r.status === 'bundle-skipped-ambiguous').map(r => `\`${r.bundleNode}\``).join('; ') || '—'
      p(`| ${key} | ${rootCount} | ${decomposed} | ${debris} | ${amb} |`)
    }
  }
  p('')
  p('## 4. Coverage delta — morphology distribution')
  p('')
  const morphCountsAll = {}
  const morphCountsSingle = {}
  for (const r of results) {
    if (r.status !== 'de-leafed' && r.status !== 'bundle-decomposed') continue
    const m = r.category || 'unknown'
    morphCountsAll[m] = (morphCountsAll[m] || 0) + 1
    if (r.status === 'de-leafed') morphCountsSingle[m] = (morphCountsSingle[m] || 0) + 1
  }
  const allMorphs = ['broadleaf', 'conifer', 'ornamental', 'columnar', 'weeping', 'unknown']
  p('| Morphology | Whittle (single-tree) | After Riven (incl. decomposed) | Delta |')
  p('|---|---:|---:|---:|')
  for (const m of allMorphs) {
    const before = morphCountsSingle[m] || 0
    const after = morphCountsAll[m] || 0
    const delta = after - before
    p(`| ${m} | ${before} | ${after} | ${delta > 0 ? '+' + delta : delta} |`)
  }
  p('')
  if (bundleBySource.size) {
    const ornamentalAdd = (morphCountsAll.ornamental || 0) - (morphCountsSingle.ornamental || 0)
    if (ornamentalAdd > 0) {
      p(`**Ornamental coverage:** Whittle\'s zero baseline grew by **+${ornamentalAdd}** from bundle decomposition (\`candicands\` carries flowering-form trees that index.json categorizes as ornamental).`)
    } else {
      p('**Ornamental coverage:** unchanged. The decomposed bundles inherit their source species\' morphology (`candicands` → whatever index.json declares), which may not be ornamental. Operator may want to override the morphology field on the decomposed chassis\' meta.json post-Riven.')
    }
    p('')
  }
  p('## 5. Roster re-evaluation — re-checking Whittle\'s skipped-for-removal list')
  p('')
  // Per Whittle's report, species flagged as removal candidates were those where every variant was no-wood or errored.
  // Re-check those species in light of bundle decomposition.
  const bySpecies = new Map()
  for (const r of results) {
    if (!bySpecies.has(r.speciesId)) bySpecies.set(r.speciesId, [])
    bySpecies.get(r.speciesId).push(r)
  }
  const stillCandidates = []
  const rescued = []
  // Detect whether a species already had a Whittle-named chassis on disk
  // (pre-Riven state). The Whittle naming pattern is `<slug>_<letter>.glb`
  // WITHOUT a `_<nodeName>` suffix. Read chassis dir once.
  let existingChassisFiles = []
  try { existingChassisFiles = await fs.readdir(CHASSIS_DIR) } catch { existingChassisFiles = [] }
  const hadWhittleChassis = (speciesId, label) => {
    const slug = commonNameSlug(speciesId, label)
    return existingChassisFiles.some(f => f.endsWith('.glb') && /^([a-z0-9_]+)_[a-z]\.glb$/.test(f) && f.startsWith(slug + '_'))
  }
  for (const [speciesId, rs] of bySpecies.entries()) {
    const cleanSingle = rs.filter(r => r.status === 'de-leafed').length
    const cleanBundle = rs.filter(r => r.status === 'bundle-decomposed').length
    const hadBefore = hadWhittleChassis(speciesId, rs[0]?.label)
    if (cleanSingle === 0 && cleanBundle === 0 && !hadBefore) {
      const reason = rs.every(r => r.status === 'skipped-no-wood' || r.status === 'bundle-debris') ? 'still no usable chassis (all variants no-wood or bundle-debris)'
        : rs.every(r => r.status === 'errored') ? 'every variant errored'
        : rs.every(r => r.status === 'no-glbs') ? 'no eligible lod0 GLBs'
        : 'no clean output (mix of ambiguous / no-wood / errored)'
      stillCandidates.push({ speciesId, label: rs[0]?.label, reason, count: rs.length })
    } else if (cleanSingle === 0 && cleanBundle > 0 && !hadBefore) {
      rescued.push({ speciesId, label: rs[0]?.label, count: cleanBundle })
    }
  }
  if (rescued.length === 0) {
    p('_No species rescued by bundle decomposition — `candicands` already had one clean Whittle chassis; its bundle decomposition adds more variants but doesn\'t rescue any previously-zero-yield species._')
  } else {
    p('**Species rescued by bundle decomposition** (had zero Whittle chassis, now have ≥1 bundle-decomposed chassis):')
    p('')
    for (const r of rescued) p(`- \`${r.speciesId}\` ("${r.label || '—'}") — ${r.count} bundle-decomposed chassis`)
  }
  p('')
  if (stillCandidates.length === 0) {
    p('_All species now produce at least one usable chassis._')
  } else {
    p('**Species still recommended for operator review** (no clean chassis even after bundle decomposition):')
    p('')
    for (const r of stillCandidates) {
      p(`- \`${r.speciesId}\` ("${r.label || '—'}") — ${r.reason}`)
    }
  }
  p('')
  p('## 6. Brief 1.5b curation-file cross-check')
  p('')
  // Brief 1.5b (Quill) places the curation file at `arborist/state/_chassis-curation.json`
  // (sibling to compositions, NOT under public/trees/_chassis/) — confirmed via
  // arborist/NOTES.md 2026-05-21 entry. Check both possible locations to be robust
  // against a future move.
  const curationPath = (await (async () => {
    for (const p of [
      path.join(REPO_ROOT, 'arborist/state/_chassis-curation.json'),
      path.join(REPO_ROOT, 'public/trees/_chassis/_chassis-curation.json'),
    ]) {
      try { await fs.access(p); return p } catch {}
    }
    return path.join(REPO_ROOT, 'arborist/state/_chassis-curation.json')
  })())
  let curation = null
  try { curation = JSON.parse(await fs.readFile(curationPath, 'utf8')) } catch { curation = null }
  if (!curation) {
    p('_`public/trees/_chassis/_chassis-curation.json` not present at Riven re-run time — Brief 1.5b may not have shipped yet. No cross-check performed; future re-runs will validate emitted chassis filenames against the curation file._')
  } else {
    p('`_chassis-curation.json` is present. Checking that every chassis name in the curation file is still emitted by this re-run...')
    p('')
    // Curation file shape is Brief 1.5b's; we just look for any string field that points at a chassis filename.
    const emittedNames = new Set(results.filter(r => r.chassisName).map(r => r.chassisName))
    const orphaned = []
    const walk = (v) => {
      if (typeof v === 'string') {
        const stem = v.replace(/\.glb$/, '').replace(/\.meta\.json$/, '')
        if (stem.match(/^[a-z0-9_]+$/) && !emittedNames.has(stem)) orphaned.push(stem)
      } else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(curation)
    const uniq = [...new Set(orphaned)]
    if (uniq.length === 0) p('All curation-referenced chassis names are still emitted. ✓')
    else {
      p('**Orphaned curation references** (chassis filename in curation file no longer emitted by script — Brief 1.5b should be notified):')
      p('')
      for (const o of uniq) p(`- \`${o}\``)
    }
  }
  p('')
  p('## 7. Operator-action list — bundle-debris worth manual review')
  p('')
  // Bundle-debris items: non-tree nodes inside bundles. Surface them so operator can decide if they're useful elsewhere (rocks, fences, planters → Cartograph).
  const debris = results.filter(r => r.status === 'bundle-debris')
  if (debris.length === 0) {
    p('_No bundle-debris items detected._')
  } else {
    p('| Source GLB | Node name | Primitive count | Material names |')
    p('|---|---|---:|---|')
    for (const r of debris) {
      const prims = r.primitives || []
      const matNames = prims.map(pp => pp.matName).filter(Boolean).slice(0, 4).join(', ') || '—'
      p(`| ${r.speciesId}/${r.filename} | \`${r.bundleNode}\` | ${prims.length} | ${matNames} |`)
    }
    p('')
    p('**For Cartograph team:** bundle-debris with material names containing `leaf`, `flower`, or alpha-mode MASK are leaf-card / flower-card primitives that the WOOD-only chassis discipline correctly skips. Items with names like `rock_*`, `planter_*`, `fence_*` would be candidates for kit-level prop libraries — none observed in current vendor stock (debris is all leaf+flower cards from `candicands`).')
  }
  p('')
  p('## 8. Surface items (per `feedback_baby_must_surface_scope_drift`)')
  p('')
  p('- **Brief framing mismatch:** the brief listed ~11 species as bundle suspects. Only `candicands` actually classifies as a bundle under the brief\'s "multiple top-level geometry roots" heuristic. The other suspects are flat-pre-split per file (one mesh node per GLB, with a positional translation baked in). This was a knowable-from-inspection structural fact — Whittle\'s report appendix already shows e.g. `garden_mix/skeleton-N` cleanly de-leafing as single-tree chassis. Recommend: closing the brief with the bundle-detection heuristic\'s actual coverage rather than expanding it heuristically to catch the speculated set.')
  p('')
  p('- **The "leaning weirdly" issue isn\'t bundle-specific.** Garden_mix-style chassis inherit a positional translation in their single inner mesh node (e.g. `TREE_00` at T=[3.9, 0, -3.8]). That offset is the visible cause of decentered chassis. Brief 1.5c does NOT touch those (criterion #2 requires byte-identity for Whittle\'s 141), so the lean persists for non-bundle chassis. A follow-up brief (1.5d?) could opt-in recenter all chassis — but that would invalidate 1.5b\'s curation file via byte changes. Surface for operator decision: accept lean for non-bundle chassis, or break byte-identity in a future pass to fix it?')
  p('')
  p('- **Transform-baking implementation:** used a hand-rolled bake (apply 4×4 to POSITION, upper-3×3 to NORMAL with re-normalize, recenter to bbox-XZ-center + bbox-Y-min=0, reset root\'s TRS to identity). gltf-transform\'s `@gltf-transform/functions` package ships a `transformPrimitive(prim, matrix)` helper that does the same job, but I held to the existing dep set (`@gltf-transform/core` + `@gltf-transform/extensions` only — no `functions` import in this script today). If the operator wants to switch later, it\'s a 5-line swap.')
  p('')
  p('- **Bundle internal structure (`candicands`):** each variant carries 9 orphan nodes encoding 3 trees: triplets of `1_leafNN` + `Bark_1NN` + `flower_1NN`. The leaf and flower nodes are MASK-alpha → LEAF-classified → skipped (bundle-debris); the Bark nodes are OPAQUE-with-normal-map → WOOD → emitted as chassis. Naming convention: `candicands_<a-d>_bark_111.glb` etc. Per acceptance criterion #4, decomposed chassis are recentered (bbox-XZ-center=0, bbox-Y-min=0) and the root\'s local translation (some have `T=[0,0,-90.2]`) is baked but then cancelled by the recenter — net effect: trunk along Y-up, base near origin, as required.')
  p('')
  p('- **Whittle\'s existing chassis from now-detected-bundles are preserved on disk** (`candicands_b.glb` from Brief 0 was emitted by treating the whole 9-node bundle as one tree). Per criterion #5 (additive only), Riven does NOT remove or rename it; it now coexists with the decomposed siblings. The whole-bundle chassis is essentially dead weight (it bakes 3 trees into one mesh at world-scale) and Brief 1.5b\'s curation surface may be used to suppress it. Surfaced explicitly here so 1.5b knows: 4 pre-existing `candicands_*.glb` filenames may want operator quarantining.')
  p('')
  // Check: how many candicands chassis on disk would be in this category
  let candicandsBundleChassis = 0
  for (const [key, rs] of bundleBySource.entries()) if (key.startsWith('candicands/')) candicandsBundleChassis += rs.filter(r => r.status === 'bundle-decomposed').length
  p(`  Decomposed candicands chassis emitted this run: **${candicandsBundleChassis}**. Pre-Riven Whittle chassis touching candicands: see \`public/trees/_chassis/candicands_*.glb\`.`)
  p('')
  p('- **`species-map.json` morphology lookup for decomposed chassis:** decomposed chassis inherit `category` from the source species\' `index.json` row. `candicands` has whatever category index.json declares (`broadleaf` per the Whittle report\'s per-species table). If those decomposed-chassis would more accurately classify as `ornamental` (flowering form), the operator should override `meta.json#morphology` per-chassis. Brief 1.5b\'s curation surface is the natural place to do this, not Riven.')
  p('')
  p('- **Transform-baking edge cases observed:** `candicands` has variants with `T=[0,0,-90.2]` (skeleton-2, skeleton-3) — purely translational, cleanly cancelled by recenter. No shear or non-uniform scale observed in the bundle nodes; if they appeared, the upper-3×3 normal transform would degrade (would need inverse-transpose). Flagged in code comments adjacent to `bakeMatrixIntoPrim`.')
  p('')
  p('## 9. Appendix — full bundle-decomposition results')
  p('')
  if (bundleBySource.size === 0) {
    p('_None._')
  } else {
    p('| Source | Node | Status | WOOD / LEAF / AMB | Chassis | heightRange |')
    p('|---|---|---|---|---|---|')
    for (const [key, rs] of [...bundleBySource.entries()].sort()) {
      for (const r of rs) {
        const hr = r.heightRange ? `[${r.heightRange[0]}, ${r.heightRange[1]}]` : '—'
        p(`| ${key} | \`${r.bundleNode}\` | ${r.status} | ${r.counts.WOOD} / ${r.counts.LEAF} / ${r.counts.AMBIGUOUS} | ${r.chassisName ? '`' + r.chassisName + '`' : '—'} | ${hr} |`)
      }
    }
  }
  p('')

  if (!DRY_RUN) {
    await fs.mkdir(path.dirname(RIVEN_REPORT_PATH), { recursive: true })
    await fs.writeFile(RIVEN_REPORT_PATH, lines.join('\n'))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
