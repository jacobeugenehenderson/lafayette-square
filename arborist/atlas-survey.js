/**
 * atlas-survey.js — given a tree roster `[{species, variantId}, ...]`, walk
 * the source GLBs and produce the atlas tile list + layout.
 *
 * Pure helper, no file I/O for outputs. Used by bake-look.js for the per-Look
 * atlas pipeline.
 *
 * Returns:
 *   {
 *     perVariant: [{ species, variantId, materials: [{matName, classification, slots: {color, normal}, ...}] }],
 *     tiles: [{ key, classification, refs: [{species, variantId, matName}], colorSha1, normalSha1, colorDims, normalDims, hasMR, hasOcc, hasEmissive, tileIndex }],
 *   }
 *
 * Atlas layout (rect packing) lives in bake-look.js / atlas-pack.js — survey
 * just enumerates tiles and the dimensions of their source textures.
 */
import path from 'node:path'
import crypto from 'node:crypto'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const LODS = ['lod0', 'lod1', 'lod2']
const LOD_RANK = { lod0: 0, lod1: 1, lod2: 2 }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

// Classification: name keywords first (bark before leaf to handle
// "BroadleafBark"-style names where "leaf" is a substring of bark names),
// then alphaMode fallback (OPAQUE → bark, MASK|BLEND → leaf), default bark.
export function classifyMaterial(mat) {
  const name = (mat.getName() || '').toLowerCase()
  const alphaMode = mat.getAlphaMode()
  if (/bark|trunk|wood|stem/.test(name)) return { cls: 'bark', why: 'name' }
  if (/leaf|leaves|foliage|canopy|frond|needle|cap|branch/.test(name)) return { cls: 'leaf', why: 'name' }
  if (alphaMode === 'MASK' || alphaMode === 'BLEND') return { cls: 'leaf', why: `alphaMode=${alphaMode}` }
  if (alphaMode === 'OPAQUE') return { cls: 'bark', why: 'alphaMode=OPAQUE' }
  return { cls: 'bark', why: 'default' }
}

function texMeta(tex) {
  if (!tex) return null
  const img = tex.getImage()
  const sha1 = img ? crypto.createHash('sha1').update(img).digest('hex').slice(0, 12) : null
  const size = tex.getSize()
  return { sha1, width: size?.[0] ?? null, height: size?.[1] ?? null, mime: tex.getMimeType() }
}

async function surveyGLB(filePath) {
  const doc = await io.read(filePath)
  const out = []
  for (const mat of doc.getRoot().listMaterials()) {
    const { cls, why } = classifyMaterial(mat)
    out.push({
      matName: mat.getName() || '<unnamed>',
      classification: cls,
      classifiedBy: why,
      alphaMode: mat.getAlphaMode(),
      doubleSided: mat.getDoubleSided(),
      slots: {
        color: texMeta(mat.getBaseColorTexture()),
        normal: texMeta(mat.getNormalTexture()),
        mr: texMeta(mat.getMetallicRoughnessTexture()),
        occlusion: texMeta(mat.getOcclusionTexture()),
        emissive: texMeta(mat.getEmissiveTexture()),
      },
    })
  }
  return out
}

function collapseLODs(perLod) {
  const byName = new Map()
  for (const lod of LODS) {
    const mats = perLod[lod] || []
    for (const m of mats) {
      const e = byName.get(m.matName) || { occurrencesPerLod: {} }
      e.occurrencesPerLod[lod] = m
      byName.set(m.matName, e)
    }
  }
  const rows = []
  for (const [matName, e] of byName) {
    const present = LODS.filter(l => e.occurrencesPerLod[l]).sort((a, b) => LOD_RANK[a] - LOD_RANK[b])
    const canonical = e.occurrencesPerLod[present[0]]
    rows.push({ matName, ...canonical, presentInLODs: present, canonicalLod: present[0] })
  }
  return rows
}

/**
 * Survey a roster of {species, variantId} pairs. Returns the unified shape
 * downstream stages consume (bake, viz, rewrite).
 */
export async function surveyRoster(roster, treesDir) {
  const perVariant = []
  // Dedupe roster by (species, variantId) — same variant may appear twice in
  // a roster if the operator added it from two paths.
  const seen = new Set()
  const dedup = []
  for (const r of roster) {
    const k = `${r.species}|${r.variantId}`
    if (seen.has(k)) continue
    seen.add(k)
    dedup.push(r)
  }

  for (const { species, variantId } of dedup) {
    const dir = path.join(treesDir, species)
    const perLod = {}
    for (const lod of LODS) {
      const file = path.join(dir, `skeleton-${variantId}-${lod}.glb`)
      try { perLod[lod] = await surveyGLB(file) }
      catch (err) { perLod[lod] = [] }
    }
    perVariant.push({ species, variantId, materials: collapseLODs(perLod) })
  }

  // Tile dedup across the full roster: one tile per unique (colorSha1, normalSha1).
  const tilesByKey = new Map()
  for (const v of perVariant) {
    for (const m of v.materials) {
      const colorSha1 = m.slots.color?.sha1 || null
      const normalSha1 = m.slots.normal?.sha1 || null
      if (!colorSha1) continue // can't atlas a material with no color tex
      const key = `${colorSha1}|${normalSha1 || ''}`
      const ref = { species: v.species, variantId: v.variantId, matName: m.matName }
      const existing = tilesByKey.get(key)
      if (existing) {
        existing.refs.push(ref)
        if (m.classification === 'leaf') existing.classification = 'leaf'
        continue
      }
      tilesByKey.set(key, {
        key, colorSha1, normalSha1,
        colorDims: m.slots.color ? `${m.slots.color.width}×${m.slots.color.height}` : null,
        normalDims: m.slots.normal ? `${m.slots.normal.width}×${m.slots.normal.height}` : null,
        classification: m.classification,
        classifiedBy: m.classifiedBy,
        alphaMode: m.alphaMode,
        hasMR: !!m.slots.mr,
        hasOcc: !!m.slots.occlusion,
        hasEmissive: !!m.slots.emissive,
        refs: [ref],
      })
    }
  }
  const tiles = [...tilesByKey.values()].sort((a, b) =>
    a.classification === b.classification ? b.refs.length - a.refs.length : (a.classification === 'bark' ? -1 : 1)
  )
  let bIdx = 0, lIdx = 0
  for (const t of tiles) {
    t.tileIndex = (t.classification === 'bark') ? bIdx++ : lIdx++
  }

  return { perVariant, tiles }
}
