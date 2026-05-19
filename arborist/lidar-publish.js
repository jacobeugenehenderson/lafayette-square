/**
 * lidar-publish.js — bridge between bake-tree.py's single-GLB output and the
 * downstream pipeline that expects per-LOD artifacts.
 *
 * bake-tree.py emits `skeleton-N.glb` (Python / trimesh) with two named
 * primitives `trunkBark` + `branchBark`. The atlas pass (bake-look.js) and
 * the runtime (InstancedTrees.jsx) both expect `skeleton-N-lod{0,1,2}.glb`
 * with the per-variant manifest carrying `skeletons: {lod0, lod1, lod2}`,
 * matching the procedural pipeline's publish-glb.js output schema.
 *
 * This helper:
 *   1. Reads each variant's `skeleton-N.glb` source
 *   2. Runs the same `weld → dedup → simplify` chain at three ratios as
 *      publish-glb.js's LOD primitive
 *   3. Writes `skeleton-N-lod{0,1,2}.glb`
 *   4. Promotes the per-variant manifest entry to the procedural shape
 *      (skeletons block + quality/category/normalizeScale stubs)
 *   5. Removes the original `skeleton-N.glb` (now redundant)
 *
 * Texture-compress step is omitted vs publish-glb's emitLod — the LiDAR
 * cylinders carry no source textures (atlas placeholder material is
 * assigned by bake-look at runtime).
 *
 * Usage:
 *   node arborist/lidar-publish.js --species acer_saccharum_procedural
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { cloneDocument, dedup, prune, weld, simplify } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import { rebuildIndex } from './build-index.js'

// Bind the bark photo pack as baseColorTexture + normalTexture on the
// material so atlas-survey can hash + tile it. Without this, the LiDAR
// material has no color texture → surveyRoster skips it → bake-look's
// rewriter never substitutes it onto the atlas placeholder. We attach
// the SAME photo for both trunk and branch materials by default (each
// region's manifest spec carries its own materialRef so the operator
// can bind different packs per region) — the per-instance retint
// shader takes care of the tint differentiation at runtime.
async function attachBarkTextures(doc, materialName, materialRef) {
  if (!materialRef) return false
  const mat = doc.getRoot().listMaterials().find(m => m.getName() === materialName)
  if (!mat) return false
  const packDir = path.join(BARK_DIR, materialRef)
  const colorPath = path.join(packDir, 'color.jpg')
  const normalPath = path.join(packDir, 'normal.jpg')
  try {
    const colorBytes = await fs.readFile(colorPath)
    const colorTex = doc.createTexture(`${materialRef}.color`)
      .setMimeType('image/jpeg')
      .setImage(colorBytes)
    mat.setBaseColorTexture(colorTex)
    try {
      const normalBytes = await fs.readFile(normalPath)
      const normalTex = doc.createTexture(`${materialRef}.normal`)
        .setMimeType('image/jpeg')
        .setImage(normalBytes)
      mat.setNormalTexture(normalTex)
    } catch { /* normal optional */ }
    // OPAQUE alpha mode keeps the atlas classifier on `cls=bark`.
    mat.setAlphaMode('OPAQUE')
    mat.setDoubleSided(false)
    return true
  } catch (err) {
    console.warn(`[lidar-publish] missing bark pack ${materialRef} (${colorPath})`)
    return false
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TREES_DIR = path.join(REPO_ROOT, 'public', 'trees')
const BARK_DIR = path.join(REPO_ROOT, 'public', 'textures', 'bark')

// Same ratios + error tolerances publish-glb.js uses.
const LODS = [
  { id: 'lod0', ratio: 0.85, error: 0.0005 },
  { id: 'lod1', ratio: 0.40, error: 0.0020 },
  { id: 'lod2', ratio: 0.10, error: 0.0080 },
]

async function emitLodFromSource(io, sourceDoc, lod) {
  const lodDoc = cloneDocument(sourceDoc)
  await lodDoc.transform(
    weld(),
    dedup(),
    simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: lod.error }),
    prune({ keepAttributes: true, keepIndices: true }),
  )
  return lodDoc
}

export async function publishLidarSpecies(species) {
  await MeshoptSimplifier.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const dir = path.join(TREES_DIR, species)
  const manifestPath = path.join(dir, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))

  // Resolve per-region bark spec from the manifest. Each region's
  // materialRef points at public/textures/bark/<id>/ — we attach the
  // photo pack's color.jpg + normal.jpg to the matching trunkBark /
  // branchBark material in the source GLB so atlas-survey can pick it
  // up (without a baseColorTexture, surveyRoster skips the material).
  const trunkRef = manifest?.bark?.trunk?.materialRef || null
  const branchRef = manifest?.bark?.branch?.materialRef || null

  const updatedVariants = []
  for (const v of manifest.variants || []) {
    const srcName = v.skeleton || `skeleton-${v.id}.glb`
    const srcPath = path.join(dir, srcName)
    const sourceDoc = await io.read(srcPath)

    await attachBarkTextures(sourceDoc, 'trunkBark', trunkRef)
    await attachBarkTextures(sourceDoc, 'branchBark', branchRef)

    const skeletons = {}
    for (const lod of LODS) {
      const lodDoc = await emitLodFromSource(io, sourceDoc, lod)
      const lodName = `skeleton-${v.id}-${lod.id}.glb`
      await io.write(path.join(dir, lodName), lodDoc)
      skeletons[lod.id] = lodName
    }

    // Drop the original single-LOD source; LOD tiers replace it.
    try { await fs.unlink(srcPath) } catch { /* already removed */ }

    // Promote manifest entry to procedural-style shape. Substitution logic
    // in bake-trees.js wins this variant via heroSpecies routing +
    // qualityOverride; runtime InstancedTrees picks the LOD from
    // skeletons.lod0/1/2.
    const { skeleton: _drop, ...rest } = v
    updatedVariants.push({
      ...rest,
      skeletons,
      // Defaults if absent — first publish writes these once.
      category: v.category || manifest.barkMorph === 'furrowed' ? 'broadleaf' : (v.category || 'broadleaf'),
      styles: v.styles || ['realistic'],
      approxHeightM: v.approxHeightM ?? v.treeH ?? null,
      normalizeScale: v.normalizeScale ?? 1.0,
      quality: v.quality ?? 0,
      qualityOverride: v.qualityOverride ?? manifest.qualityOverride ?? 4,
    })
  }

  // Promote top-level manifest fields.
  const promoted = {
    ...manifest,
    source: manifest.source || 'lidar',
    category: manifest.category || 'broadleaf',
    defaultStyles: manifest.defaultStyles || ['realistic'],
    variantMode: 'lidar',
    variants: updatedVariants,
  }
  await fs.writeFile(manifestPath, JSON.stringify(promoted, null, 2))
  // Refresh public/trees/index.json's flattened variants array so
  // bake-trees.js's pickVariant lottery can see the new hero. publish-glb.js
  // calls rebuildIndex at its tail for the same reason.
  const idx = await rebuildIndex()
  return {
    species,
    variantCount: updatedVariants.length,
    lods: LODS.map(l => l.id),
    indexCounts: { species: idx.speciesCount, variants: idx.variantCount },
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) { args[key] = next; i++ }
      else args[key] = true
    }
  }
  if (!args.species) {
    console.error('Usage: --species <id>')
    process.exit(1)
  }
  publishLidarSpecies(args.species)
    .then(r => { console.log('[lidar-publish] ok:', r); process.exit(0) })
    .catch(err => { console.error('[lidar-publish] FAILED:', err); process.exit(1) })
}
