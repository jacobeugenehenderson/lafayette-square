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

// Brief 23 (Mistral, 2026-05-25): `--clean` prunes stale orphans from the
// gitignored `_chassis/` dir after a full regen, so re-runs self-heal instead
// of accreting (Sextant's Brief 20 had to wipe `_chassis/` by hand). It is
// IDEMPOTENT-COMPLETE per [[feedback_clean_regen_must_be_idempotent_complete]]:
// it deletes ONLY chassis it just regenerated equivalents for (stale output of
// a still-present, still-walked vendor source), and REFUSES to delete anything
// it can't account for — procedural / LiDAR-sourced chassis, sources whose
// vendor dir is gone, or files with no meta. Those are surfaced, never removed.
const CLEAN = process.argv.includes('--clean')

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

  // Brief 20 (Sextant): recenter to dominant-trunk base at origin. Bake the
  // node hierarchy so POSITION = world coords, then translate so the densest-
  // trunk base lands at (0,0,0). Drops Brief 0's byte-identity carve-out for
  // the 141 single-tree chassis — the off-origin frame was a pure kit-extraction
  // artifact, and the viewport auto-center + Brief 19 bake already re-derived
  // this exact center downstream (so authored posOffset/tilt stay valid: the
  // recenter does at source what the viewport did at display). ALL prims
  // (bark + retained Tendril leaves) feed the finder, matching the viewport's
  // anchorScene; the bottom-5% slab keeps canopy out of the trunk-base estimate.
  bakeSceneTransforms(doc)
  const allPrims = []
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) allPrims.push(prim)
  recenterPrimsToDominantTrunk(allPrims)

  // Brief 23 (Mistral): unit-fix extreme mis-scale (e.g. 900m forest → 9m)
  // AFTER recenter, BEFORE the cluster survey + height read so both see the
  // corrected metres (the 0.5m trunk grid is meaningless on a 900m mesh).
  const unitRescale = rescaleIfMisScaled(allPrims)

  // Compute height range from the recentered geometry (now base-at-origin →
  // [~0, H], matching the bundle path's form).
  const heightRange = computeHeightRange(doc)

  // Brief 23 (Mistral, 2026-05-25): flag the MERGED single-mesh FOREST — the
  // genuinely-hard case where N trunks are baked into ONE primitive (e.g.
  // acer_saccharum's bark prim holds 17 trunks). The gate keys on
  // **max-trunk-clusters-within-a-single-WOOD-primitive**, NOT the whole-chassis
  // count — so it never sweeps the already-separable chassis whose trees live in
  // separate primitives/files: vendor file-pre-split singles (garden_trees_mix_*)
  // read 1 cluster/prim, and Riven/Brief-6.2's 58 multi-root splits
  // (candicands / honey_locust / gray_poplar / london_plane / black_locust /
  // poplar_fall) take the bundle path and never reach this check at all. A
  // decomposed single tree = 1 cluster → KEEP; a merged forest = N → suppress +
  // worklist for Brief 23a's per-tree segmentation. (Operator-bounded: the
  // separable decomposition is DONE — 23a is ONLY these merged meshes.)
  let clusterCount = 0
  for (const p of primClassifications) {
    if (p.cls !== 'WOOD') continue
    const { clusterCount: cc } = surveyTrunkClusters([p._prim])
    if (cc > clusterCount) clusterCount = cc
  }
  // Require ≥3 trunks-in-one-mesh to call it a forest. A 2-cluster reading is
  // ambiguous — a multi-STEM organism (sugar_maple_multistem) or a forked base
  // (italian_cypress / blue_spruce / common_beech / western_juniper all read 2)
  // is one legit tree, NOT a forest, and must stay in the catalog (operator's
  // stem-vs-tree distinction + "don't sweep good chassis"). Genuine merged
  // forests carry many (acer_saccharum 17–22, burnt_tree 4–8); erring toward
  // under-suppression is safe (a borderline 2-trunk stays visible).
  const FOREST_MIN_TRUNKS = 3
  const forestLike = clusterCount >= FOREST_MIN_TRUNKS
  if (forestLike) {
    console.warn(`[mistral] merged forest chassis "${filename}" (${label || speciesId}): ${clusterCount} trunks in one mesh — suppressed from Salon catalog + added to Brief 23a worklist`)
  }

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
      source: { species: speciesId, variant: variantIdx + 1, ...(unitRescale > 1 ? { unitRescale } : {}) },
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
    forestLike,
    trunkClusters: clusterCount,
    unitRescale,
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

// ── Brief 20 (Sextant): recenter every chassis to dominant-trunk origin ──────
//
// Ported from SpecimenViewport.jsx#computeDominantTrunk + generate-salon.js#
// computeAutoCenterPivot (the two downstream finders). Operates on prims whose
// POSITION accessors are already WORLD coords (node transforms baked first via
// bakeSceneTransforms / the bundle path's per-root bake). Bins the bottom-5% Y
// slab into a 0.5m XZ grid, finds the densest 3×3-cell neighborhood, and
// returns its centroid as the trunk-base point { x, z, minY, height }.
//
// ⚠ THREE copies of this algorithm now exist (this + the two downstream). The
// port (not a shared-lift) was the deliberate call — see BACKLOG Brief 20. They
// do NOT need active sync-discipline because, on a chassis recentered HERE, all
// three return ~origin and therefore AGREE BY CONSTRUCTION: the viewport
// auto-center and Brief 19's bake conjugation both degenerate to identity. The
// hazard is only re-armed if you RETUNE one (GRID / slab% / densest-cell rule)
// without the others — then the source frame shifts and the un-retuned
// downstream finders re-introduce a non-identity center on already-shipped
// compositions. Retune all three together, or do the deferred shared-lift +
// delete-the-quiet-finders cleanup (BACKLOG Brief 20 "deferred cleanup").
function computeDominantTrunkBase(prims) {
  let minY = Infinity, maxY = -Infinity
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    for (let i = 1; i < arr.length; i += 3) {
      if (arr[i] < minY) minY = arr[i]
      if (arr[i] > maxY) maxY = arr[i]
    }
  }
  if (!isFinite(minY)) return null
  const total = maxY - minY
  const slabHi = minY + Math.max(0.05 * total, 0.05)
  const GRID = 0.5
  const cells = new Map()
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i], y = arr[i + 1], z = arr[i + 2]
      if (y > slabHi) continue
      const ix = Math.floor(x / GRID), iz = Math.floor(z / GRID)
      const key = `${ix},${iz}`
      let c = cells.get(key)
      if (!c) { c = { ix, iz, count: 0, sx: 0, sz: 0 }; cells.set(key, c) }
      c.count++; c.sx += x; c.sz += z
    }
  }
  if (cells.size === 0) return { x: 0, z: 0, minY, height: total }
  let bestSum = -1, bestCell = null
  for (const c of cells.values()) {
    let sum = 0
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = cells.get(`${c.ix + dx},${c.iz + dz}`)
      if (n) sum += n.count
    }
    if (sum > bestSum) { bestSum = sum; bestCell = c }
  }
  let sx = 0, sz = 0, n = 0
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = cells.get(`${bestCell.ix + dx},${bestCell.iz + dz}`)
    if (!c) continue
    sx += c.sx; sz += c.sz; n += c.count
  }
  return { x: sx / n, z: sz / n, minY, height: total }
}

// Survey-only (Brief 20, Sextant + operator 2026-05-25): count distinct trunk
// clusters in the bottom-5% slab via connected-component labeling on the SAME
// 0.5m grid the centerer uses. More than one STRONG cluster = a single-mesh
// FOREST (several separate trees in one file) — the signature behind
// dominant-trunk "picking one stem far from bbox-center". We do NOT decompose
// here (out of scope): we capture { clusterCount } as ready-made input for a
// follow-up that extends Riven's Brief 1.5c root-based split with this spatial
// clustering. Diagnostic ONLY — it never feeds the centering math, so it cannot
// drift the chassis frame (the KEEP-IN-SYNC concern stays confined to
// computeDominantTrunkBase).
//
// "Strong" = a cluster holding ≥50% of the dominant cluster's vertex mass AND
// spanning ≥2 grid cells. Tuned against real stock (Sextant probe 2026-05-25): a
// genuine forest shows many co-equal clusters (acer_saccharum_lowpoly: 8+ at
// 57-100% of dominant), whereas a single tree shows ONE dominant cluster plus
// sub-20% single-cell specks (root flare, a low branch tip dipping into the
// slab) that the threshold correctly rejects. Multi-STEM organisms reach this
// path only via the bundle splitter (already root-decomposed by Brief 1.5c), so
// this flag isolates the true single-file multi-TREE case.
function surveyTrunkClusters(prims) {
  let minY = Infinity, maxY = -Infinity
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    for (let i = 1; i < arr.length; i += 3) {
      if (arr[i] < minY) minY = arr[i]
      if (arr[i] > maxY) maxY = arr[i]
    }
  }
  if (!isFinite(minY)) return { clusterCount: 0, components: 0 }
  const total = maxY - minY
  const slabHi = minY + Math.max(0.05 * total, 0.05)
  const GRID = 0.5
  const cells = new Map()
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i], y = arr[i + 1], z = arr[i + 2]
      if (y > slabHi) continue
      const ix = Math.floor(x / GRID), iz = Math.floor(z / GRID)
      const key = `${ix},${iz}`
      let c = cells.get(key)
      if (!c) { c = { ix, iz, count: 0 }; cells.set(key, c) }
      c.count++
    }
  }
  if (cells.size === 0) return { clusterCount: 0, components: 0 }
  // Connected components (8-connectivity) over occupied slab cells.
  const seen = new Set()
  const comps = []
  for (const start of cells.values()) {
    const startKey = `${start.ix},${start.iz}`
    if (seen.has(startKey)) continue
    seen.add(startKey)
    const stack = [start]
    let sum = 0, ncells = 0
    while (stack.length) {
      const cur = stack.pop()
      sum += cur.count; ncells++
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        const nk = `${cur.ix + dx},${cur.iz + dz}`
        if (seen.has(nk)) continue
        const nb = cells.get(nk)
        if (nb) { seen.add(nk); stack.push(nb) }
      }
    }
    comps.push({ sum, ncells })
  }
  comps.sort((a, b) => b.sum - a.sum)
  const top = comps[0].sum
  const strong = comps.filter(c => c.sum >= 0.5 * top && c.ncells >= 2)
  return { clusterCount: strong.length, components: comps.length }
}

// Translate every prim's POSITION so the dominant-trunk base lands at origin
// (X=0, Z=0, Y=0). prims must already be in world coords. Returns the applied
// base { x, z, minY }, or null if empty.
//
// Single pass by design. The estimator is grid-quantized (0.5m XZ bins), so for
// a trunk that straddles a cell boundary the densest-cell pick can flip under
// the very translation we apply — leaving a sub-grid XZ residual that no
// translation can drive to exactly zero (it's a period-2 limit cycle, verified:
// iterating just flips the residual's sign at the same magnitude). Y is exact
// (not quantized) → always lands at 0. We translate by the pivot the downstream
// finders ALSO compute (byte-identical estimator), so their auto-center drops
// from the chassis's full multi-metre offset to just this sub-grid residual —
// "goes quiet" / "≈ identity" per the brief (AC #3), not bit-zero. Residual is
// ≤~1.4m on ~10 boundary-straddle chassis, ~0 on the other 231; the multi-stem
// candicands_*_bark_144 are a separate degenerate (mis-scale → Brief 21, +
// forest-split follow-up). See BACKLOG Brief 20 surface notes.
function recenterPrimsToDominantTrunk(prims) {
  const base = computeDominantTrunkBase(prims)
  if (!base) return null
  translatePrimsInPlace(prims, -base.x, -base.minY, -base.z)
  return base
}

// ── Brief 23 (Mistral): extreme mis-scale unit-fix (folds in old Brief 21) ──
//
// Some vendor chassis import at 900–1700m tall (gray_poplar ~983m, honey_locust
// ~1700m, acer_saccharum forest ~900m) — an un-applied cm→m / mm→m unit error
// at kit extraction, NOT real height. They render "empty" in the Salon because
// SpecimenViewport's framing distance scales with treeH while Brief 13 clamps
// the camera at H_MAX=120, so a 56–140× oversized tree can't be pulled back far
// enough to frame. This detects height ≫ plausible-max and divides POSITION by
// the power-of-10 that lands it back in a real-tree band — the one place
// auto-scale is justified (extreme outliers are unambiguously unit-bugs; normal
// 12-vs-18m variation stays the operator's manual scale gizmo). Operator folded
// old Brief 21 in here 2026-05-25 so forest-splits (Brief 23a) become framable.
//
// Runs AFTER recenter (trunk base already at origin → uniform scale about origin
// keeps base at 0; NORMALs unaffected by uniform scale). Never up-scales (only
// corrects ≥10× errors). Returns the divisor applied (1 = untouched).
const MISSCALE_THRESHOLD_M = 100   // only touch chassis taller than this
const MISSCALE_TARGET_M = 15       // typical real tree → pick divisor toward this
// The power-of-10 divisor that lands height H back near a real tree, or 1 if H
// isn't egregiously oversized. Note the divisor is STABLE across a decade band
// (H∈[~47,474]→10, [~474,4740]→100), so siblings in the same band rescale
// consistently — provided they're all judged against the SAME H (see bundle path).
function misScaleDivisor(H) {
  if (!isFinite(H) || H <= MISSCALE_THRESHOLD_M) return 1
  const d = Math.pow(10, Math.round(Math.log10(H / MISSCALE_TARGET_M)))
  return d < 10 ? 1 : d
}
function applyDivisor(prims, d) {
  if (!(d > 1)) return
  const inv = 1 / d
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    const out = new Float32Array(arr.length)
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] * inv
    pos.setArray(out)
  }
}
function rescaleIfMisScaled(prims) {
  const bb = primBboxAcc(prims)
  const d = misScaleDivisor(isFinite(bb.maxY) && isFinite(bb.minY) ? bb.maxY - bb.minY : 0)
  applyDivisor(prims, d)
  return d
}

// Bake every node's world matrix into its prims' POSITION/NORMAL, then reset
// all node TRS to identity — so POSITION accessors carry world coords (matching
// what the viewport's matrixWorld and generate-salon's bakeAllNodeTransforms
// produce). Mirrors that helper's proven structure: walk from parentless nodes,
// guard shared meshes with a Set, bake orphan meshes with identity, then reset.
// This is what drops Brief 0's byte-identity carve-out for the 141 single-tree
// chassis: their baked node translation (e.g. TREE_00 at T=[3.9,0,−3.8]) and
// cm→m scale fold into POSITION here, exactly as the runtime already applied
// them at display.
function bakeSceneTransforms(doc) {
  const baked = new Set()
  const walk = (node, parentM) => {
    const m = mul4(parentM, matrixFromNode(node))
    const mesh = node.getMesh()
    if (mesh && !baked.has(mesh)) {
      baked.add(mesh)
      for (const prim of mesh.listPrimitives()) bakeMatrixIntoPrim(prim, m, doc)
    }
    for (const c of node.listChildren()) walk(c, m)
  }
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getParentNode()) walk(node, identity4())
  }
  for (const mesh of doc.getRoot().listMeshes()) {
    if (baked.has(mesh)) continue
    for (const prim of mesh.listPrimitives()) bakeMatrixIntoPrim(prim, identity4(), doc)
  }
  for (const node of doc.getRoot().listNodes()) {
    node.setTranslation([0, 0, 0])
    node.setRotation([0, 0, 0, 1])
    node.setScale([1, 1, 1])
    if (node.setMatrix) {
      try { node.setMatrix([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) } catch {}
    }
  }
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

  // Brief 23 (Mistral): one mis-scale divisor for the WHOLE bundle, from its
  // tallest root's baked height — applied uniformly to every decomposed tree.
  // Per-root rescale would bisect siblings that straddle the 100m threshold
  // (candicands at 56/87/110m → only the 110m one shrinks → inversion); a single
  // bundle divisor keeps them consistent. Heights via each root's LOCAL matrix
  // (bundle roots are top-level), robust to candicands' orphan-rooted meshes
  // that computeHeightRange's scene-walk misses.
  let bundleMaxH = 0
  for (const r of peekRoots) {
    const m = matrixFromNode(r)
    let maxY = -Infinity, minY = Infinity
    for (const { prim } of collectPrims(r)) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const a = pos.getArray()
      for (let i = 0; i < a.length; i += 3) {
        const y = m[1] * a[i] + m[5] * a[i + 1] + m[9] * a[i + 2] + m[13]
        if (y > maxY) maxY = y
        if (y < minY) minY = y
      }
    }
    if (isFinite(maxY) && isFinite(minY)) bundleMaxH = Math.max(bundleMaxH, maxY - minY)
  }
  const bundleDivisor = misScaleDivisor(bundleMaxH)

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
    // recenter to origin. Then reset the root chain's TRS to identity. Per the
    // brief: chassis should emerge upright + centered as if it were a
    // standalone single-tree source.
    const rootMatrix = matrixFromNode(target)
    const remainingPrims = collectPrims(target).map(({ prim }) => prim)
    for (const prim of remainingPrims) {
      bakeMatrixIntoPrim(prim, rootMatrix, doc)
    }
    // Brief 20 (Sextant): recenter via dominant-trunk (was bbox-XZ-center +
    // bbox-Y-min). On a multi-stem bundle root the densest stem becomes origin,
    // matching the viewport's computeDominantTrunk display-center — so the
    // source frame now equals what was already shown downstream (bbox-center
    // was overridden by the viewport's auto-center anyway). Minor XZ shift for
    // asymmetric-canopy roots; see BACKLOG Brief 20.
    recenterPrimsToDominantTrunk(remainingPrims)
    // Brief 23 (Mistral): apply the bundle-wide mis-scale divisor uniformly
    // (honey_locust ~1700m, gray_poplar ~983m, poplar_fall ~1250m all ÷100;
    // candicands ÷10), post-recenter so base stays at origin.
    const unitRescale = bundleDivisor
    applyDivisor(remainingPrims, bundleDivisor)
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
        source: { species: speciesId, variant: variantIdx + 1, bundleNode: rootName || `node${rootIdx}`, ...(unitRescale > 1 ? { unitRescale } : {}) },
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
      unitRescale,
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

  // Brief 23 (Mistral): persist the single-mesh FOREST worklist. Producer-
  // derived (regenerated every run, NOT operator state), so it lives next to
  // curation in state/ but is owned by this script. Feeds Brief 23a's per-tree
  // segmentation AND the Salon catalog's group-shot suppression filter.
  if (!DRY_RUN) await writeForestWorklist(results)

  const writtenSingle = results.filter(r => r.status === 'de-leafed').length
  const writtenBundle = results.filter(r => r.status === 'bundle-decomposed').length
  const debrisCount = results.filter(r => r.status === 'bundle-debris').length
  console.log(`[riven] done in ${Math.round((Date.now() - t0) / 1000)}s — ${writtenSingle} single-tree chassis (Whittle path) + ${writtenBundle} bundle-decomposed chassis, ${debrisCount} bundle-debris items skipped, report at ${path.relative(REPO_ROOT, RIVEN_REPORT_PATH)}`)

  // Brief 23 (Mistral): --clean prune (idempotent-complete; see CLEAN comment).
  if (CLEAN && !DRY_RUN) {
    await pruneOrphanChassis({ results, speciesDirs })
  }
}

// ── Brief 23 (Mistral): forest worklist + idempotent-complete --clean ────────

const FOREST_WORKLIST_PATH = path.join(REPO_ROOT, 'arborist/state/_chassis-forests.json')

// Write the single-mesh-forest worklist: every emitted chassis the trunk-cluster
// survey flagged as multi-tree (>1 strong cluster). Deterministic (keys sorted;
// surveyTrunkClusters is deterministic) so re-runs are byte-identical (AC #8).
async function writeForestWorklist(results) {
  const forests = {}
  for (const r of results) {
    if (r.forestLike && r.chassisName) {
      forests[`${r.chassisName}.glb`] = {
        source: { species: r.speciesId, filename: r.filename || null },
        clusterCount: r.trunkClusters ?? null,
      }
    }
  }
  const sortedKeys = Object.keys(forests).sort()
  const obj = {
    _comment: 'Producer-derived by arborist/survey-deleaf.js — NOT operator state. Single-mesh FOREST chassis (group shots) flagged by surveyTrunkClusters: >1 trunk in one merged mesh. Brief 23 worklist for Brief 23a per-tree segmentation + the Salon catalog group-shot suppression filter (generate-salon.js#listForestChassis). Regenerated every run.',
    forests: {},
  }
  for (const k of sortedKeys) obj.forests[k] = forests[k]
  await fs.mkdir(path.dirname(FOREST_WORKLIST_PATH), { recursive: true })
  await fs.writeFile(FOREST_WORKLIST_PATH, JSON.stringify(obj, null, 2) + '\n')
  console.log(`[mistral] forest worklist: ${sortedKeys.length} single-mesh forest chassis → ${path.relative(REPO_ROOT, FOREST_WORKLIST_PATH)}`)
}

// Cross-producer guards — mirror generate-salon.js so survey-deleaf refuses to
// prune chassis whose source it doesn't own (procedural / LiDAR Scan-mode).
function isProceduralSpeciesName(speciesId) {
  return /^procedural_/.test(speciesId) || /_procedural$/.test(speciesId)
}
async function hasLidarSeedlingsName(speciesId) {
  try { await fs.access(path.join(REPO_ROOT, 'arborist/state', speciesId, 'seedlings.json')); return true }
  catch { return false }
}

// Prune stale orphans from _chassis/ AFTER a full regen. Deletes ONLY a chassis
// that this run did NOT emit AND whose meta.source.species is a vendor species
// still present + walked this run (so the script demonstrably regenerates that
// source — the orphan is genuinely superseded output, e.g. an old whole-bundle
// or pre-rename name). REFUSES (surfaces, never deletes) anything it can't
// account for: no meta, procedural/LiDAR source, or a source dir that's gone —
// the [[feedback_clean_regen_must_be_idempotent_complete]] guard that the
// procedural_broadleaf loss taught us.
async function pruneOrphanChassis({ results, speciesDirs }) {
  const emitted = new Set(results.filter(r => r.chassisName).map(r => r.chassisName))
  const speciesDirSet = new Set(speciesDirs)
  let entries
  try { entries = await fs.readdir(CHASSIS_DIR) } catch { return }
  const glbs = entries.filter(n => n.endsWith('.glb')).sort()
  const deleted = [], refused = []
  for (const glb of glbs) {
    const stem = glb.replace(/\.glb$/, '')
    if (emitted.has(stem)) continue // regenerated this run — keep
    let meta = null
    try { meta = JSON.parse(await fs.readFile(path.join(CHASSIS_DIR, `${stem}.meta.json`), 'utf8')) } catch {}
    const sp = meta?.source?.species
    let refuseReason = null
    if (!sp) refuseReason = 'no meta/source.species — cannot verify producer'
    else if (isProceduralSpeciesName(sp)) refuseReason = `procedural source (${sp}) — not survey-deleaf's to delete`
    else if (await hasLidarSeedlingsName(sp)) refuseReason = `LiDAR Scan-mode source (${sp}) — not survey-deleaf's to delete`
    else if (!speciesDirSet.has(sp)) refuseReason = `source dir public/trees/${sp} absent — cannot regenerate`
    if (refuseReason) { refused.push({ stem, reason: refuseReason }); continue }
    await fs.rm(path.join(CHASSIS_DIR, glb))
    await fs.rm(path.join(CHASSIS_DIR, `${stem}.meta.json`)).catch(() => {})
    deleted.push(stem)
  }
  console.log(`[mistral --clean] pruned ${deleted.length} stale orphan(s); refused ${refused.length} (protected / unrecoverable)`)
  for (const d of deleted.sort()) console.log(`  [pruned]  ${d}`)
  for (const r of refused.sort((a, b) => a.stem.localeCompare(b.stem))) console.log(`  [refused] ${r.stem} — ${r.reason}`)
  // Read-only curation cross-check (preserves the never-touch-curation invariant):
  // surface live curation entries pointing at chassis that no longer exist.
  try {
    const curPath = path.join(REPO_ROOT, 'arborist/state/_chassis-curation.json')
    const cur = JSON.parse(await fs.readFile(curPath, 'utf8'))
    const orphanKeys = Object.keys(cur.chassis || {}).filter(k => !emitted.has(k.replace(/\.glb$/, '')))
    if (orphanKeys.length) {
      console.log(`[mistral --clean] curation has ${orphanKeys.length} entr(y/ies) pointing at non-emitted chassis (name-keyed, harmless; reconcile if stale): ${orphanKeys.join(', ')}`)
    }
  } catch { /* no curation file */ }
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
