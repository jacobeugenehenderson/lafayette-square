/**
 * salon-preview-atlas.js — Salon-side per-composition atlas + UV-rewritten
 * chassis GLB build. The piece of Brief 7 (Cambium) that retires Birch's
 * interim chunk-replication from SpecimenViewport.jsx: with this helper in
 * place, the workstage preview mounts the SAME treeAtlasMaterial as the LS
 * runtime — one shader implementation across both surfaces.
 *
 * Pipeline shape (mirrors arborist/bake-look.js but for one composition):
 *   1. read effective composition from arborist/state/<species>/compositions.json
 *   2. snapshot vs. previous → pick path: full | gradient-only | noop
 *   3. full:
 *        - generateSingleCompositionGLB → in-memory GLB buffer
 *        - bake bark color + bark normal sub-page (one tile)
 *        - bake leaves color sub-page (one tile)
 *        - compileGradientLUT + bake gradient sub-page (one tile, when stops authored)
 *        - bake detail sub-page (one tile, when detail.png exists)
 *        - unifyAtlases (the same helper bake-look uses)
 *        - rewriteGLB (the same helper bake-look uses) on the chassis bytes
 *        - emit a single-entry preview manifest in trees-atlas.json shape
 *        - atomic temp+rename writes
 *      gradient-only:
 *        - re-compile LUT, sharp.composite onto existing atlas-color.png
 *          AT THE STORED LUT TILE COORDS, no GLB regen, no chassis re-bake
 *        - re-emit manifest with new hashAmp (composition-identical otherwise)
 *
 * Output dir: arborist/_cache/salon-preview/<species>/<slot>/
 *   atlas-color.png, atlas-normal.png, chassis.glb, manifest.json,
 *   snapshot.json  (the composition state that produced this build)
 *
 * The cache dir is gitignored (arborist/_cache/). Cleanup on server restart
 * + ad-hoc rm; LRU eviction is v1.6 per Brief 7's out-of-scope.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  compileGradientLUT, unifyAtlases, rewriteGLB,
} from './bake-look.js'
import {
  DEFAULTS, generateSingleCompositionGLB,
} from './generate-salon.js'
import { ensurePosterizedForRef } from './extract-bark-posterized.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.dirname(__dirname)
const CACHE_ROOT = path.join(__dirname, '_cache', 'salon-preview')
const BARK_DIR   = path.join(REPO_ROOT, 'public/textures/bark')
const LEAF_SHAPES_DIR = path.join(REPO_ROOT, 'public/textures/leaves/shapes')

const GUTTER = 4
const LUT_W = 256
const LUT_H = 1
// Synthetic species/variant key for the preview manifest. SpecimenViewport
// uses this to look up the bark/gradient/detail slots in applyBarkUniforms.
const PREVIEW_SPECIES = 'preview'
const PREVIEW_VARIANT = 1

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

// ── public API ──────────────────────────────────────────────────────────

export function previewDir(species, slot) {
  return path.join(CACHE_ROOT, species, String(slot))
}

/**
 * Build (or fast-rebuild) the preview atlas + UV-rewritten chassis GLB for
 * (species, slot). Returns { path: 'full'|'gradient-only'|'noop', ms, ... }.
 *
 * `composition` is the in-flight composition state from the workstage store
 * (shape: `{ chassis, bark, leaves }` — same as /salon/generate). It is NOT
 * read from disk: the workstage's per-keystroke preview must work BEFORE
 * the operator clicks Adopt, and forcing every edit through compositions.json
 * would break the existing "edits aren't committed till Adopt" UX (scope
 * drift from Brief 7's original disk-read flow, surfaced in NOTES).
 *
 * Throws on missing chassis.
 */
export async function buildPreviewAtlas({ species, slot, composition }) {
  const t0 = Date.now()
  if (!species || slot == null) throw new Error('species + slot required')
  if (!composition || !composition.chassis) {
    throw new Error(`composition for ${species}/${slot} has no chassis`)
  }
  // Layer DEFAULTS so the builder sees the same effective shape the runtime
  // uses (mirrors generateSingleCompositionGLB which calls the same layering).
  composition = {
    chassis: composition.chassis,
    bark:    { ...DEFAULTS.bark,    ...(composition.bark    || {}) },
    leaves:  { ...DEFAULTS.leaves,  ...(composition.leaves  || {}) },
  }

  const dir = previewDir(species, slot)
  await fs.mkdir(dir, { recursive: true })

  const snapshotPath = path.join(dir, 'snapshot.json')
  let prev = null
  try { prev = JSON.parse(await fs.readFile(snapshotPath, 'utf8')) } catch {}
  const cur = snapshotFromComposition(composition)
  const pathChoice = pickPath(prev, cur)

  if (pathChoice === 'noop') {
    return { ms: Date.now() - t0, path: 'noop', ...outputDescriptor(species, slot) }
  }
  if (pathChoice === 'gradient-only' && (await haveExistingBuild(dir))) {
    return await fastGradientPath({ species, slot, composition, dir, cur, t0 })
  }
  return await fullRebuild({ species, slot, composition, dir, cur, t0 })
}

// ── full path ───────────────────────────────────────────────────────────

async function fullRebuild({ species, slot, composition, dir, cur, t0 }) {
  // 1. Chassis GLB in memory. Pre-flight check that the chassis file
  // exists; otherwise generateSingleCompositionGLB's gltf-transform read
  // throws an ENOENT bubble that surfaces in the workstage as an opaque
  // 500. A 404 with the missing chassis name is easier to read.
  const chassisPath = path.join(REPO_ROOT, 'public/trees/_chassis', `${composition.chassis}.glb`)
  try { await fs.access(chassisPath) }
  catch {
    const err = new Error(`chassis '${composition.chassis}' not found at ${chassisPath}`)
    err.statusCode = 404
    throw err
  }
  const chassisBuf = await generateSingleCompositionGLB({
    chassis: composition.chassis,
    bark:    composition.bark,
    leaves:  composition.leaves,
    lod: 0,
    slotLabel: `${species}-${slot}`,
  })

  // 2. Load raw textures from disk (bark color + normal, leaf shape, optional
  //    bark detail). Sharp determines content dimensions per page.
  const barkRef = composition.bark.ref
  const [barkColorBuf, barkNormalBuf] = await Promise.all([
    fs.readFile(path.join(BARK_DIR, barkRef, 'color.jpg')),
    fs.readFile(path.join(BARK_DIR, barkRef, 'normal.jpg')),
  ])
  const barkDetailBuf = await fs.readFile(path.join(BARK_DIR, barkRef, 'detail.png')).catch(() => null)
  // Brief 10B (Vellum): posterized substrate. Auto-trigger the extract if
  // the source posterized.png is missing for this composition's bark ref —
  // identical pattern to bake-look.js's auto-trigger so Salon preview and
  // LS runtime share substrate identity from the very first cold-boot
  // operator interaction (load-bearing per feedback_salon_preview_is_authoring_surface).
  try { await ensurePosterizedForRef(barkRef) } catch (err) {
    console.warn(`[salon-preview-atlas] posterize auto-trigger failed for ${barkRef}: ${err.message}`)
  }
  const barkPosterizedBuf = await fs.readFile(path.join(BARK_DIR, barkRef, 'posterized.png')).catch(() => null)

  const leafShapeBuf = await fs.readFile(path.join(LEAF_SHAPES_DIR, composition.leaves.pack, 'shape.png'))
    .catch(() => null)

  const stops = Array.isArray(composition.bark.gradientStops) && composition.bark.gradientStops.length >= 2
    ? composition.bark.gradientStops
    : null
  const lutBuf = stops ? compileGradientLUT(stops) : null
  const hashAmp = typeof composition.bark.gradientHashAmp === 'number' ? composition.bark.gradientHashAmp : 0

  // 3. Build sub-atlas pages (one tile each). Each page emits the matching
  //    sub-atlas PNG into `dir`; unifyAtlases reads them by filename. Match
  //    bake-look's filename convention so unifyAtlases is unchanged.
  const barkDims = await imgDims(barkColorBuf)
  const bark = await bakeBarkPage(barkColorBuf, barkNormalBuf, barkDims, dir)
  let leaves = null
  if (leafShapeBuf) {
    const leafDims = await imgDims(leafShapeBuf)
    leaves = await bakeLeavesPage(leafShapeBuf, leafDims, dir)
  }
  let gradient = null
  if (lutBuf) gradient = await bakeGradientPage(lutBuf, dir)
  let detail = null
  if (barkDetailBuf) {
    const detailDims = await imgDims(barkDetailBuf)
    detail = await bakeDetailPage(barkDetailBuf, detailDims, dir)
  }
  let posterized = null
  if (barkPosterizedBuf) {
    const postDims = await imgDims(barkPosterizedBuf)
    posterized = await bakePosterizedPage(barkPosterizedBuf, postDims, dir)
  }

  // 4. Unify into one master atlas using bake-look's helper. lookName is
  //    synthetic — only used as a colorPath prefix that we rewrite below.
  const unifiedLookName = `__salon-preview__/${species}/${slot}`
  const unified = await unifyAtlases(bark, leaves, gradient, detail, posterized, dir, unifiedLookName)

  // unifyAtlases writes trees-atlas-color.png + trees-atlas-normal.png to
  // `dir`. Rename to our atlas-color/normal.png convention.
  await fs.rename(path.join(dir, 'trees-atlas-color.png'), path.join(dir, 'atlas-color.png'))
  await fs.rename(path.join(dir, 'trees-atlas-normal.png'), path.join(dir, 'atlas-normal.png'))

  // 5. UV-rewrite the in-memory chassis bytes. rewriteGLB takes file paths,
  //    so stage the input as a tmp file and produce a tmp output that we
  //    atomically rename into place.
  // Filename must end in `.glb` — gltf-transform's NodeIO.write picks
  // GLB-binary vs glTF-JSON-plus-bin from the extension. A `.tmp` suffix at
  // the very end made it emit a sidecar `.bin` for the buffer, and the
  // renamed `chassis.glb` was 8 KB of empty JSON pointing at the missing
  // bin. Suffix `tmp` BEFORE `.glb` instead.
  const tmpSrc = path.join(dir, 'chassis.tmp-in.glb')
  const tmpDst = path.join(dir, 'chassis.tmp-out.glb')
  await fs.writeFile(tmpSrc, chassisBuf)
  const lookupIdx = buildLookupIdx(unified)
  await rewriteGLB(tmpSrc, tmpDst, `${PREVIEW_SPECIES}|${PREVIEW_VARIANT}`, lookupIdx, 1)
  await fs.rename(tmpDst, path.join(dir, 'chassis.glb'))
  await fs.unlink(tmpSrc).catch(() => {})

  // 6. Emit single-entry preview manifest (trees-atlas.json shape). Per
  //    Brief 7 option (a): the existing applyBarkUniforms keys by
  //    (species, variantId) so the preview manifest fakes a one-species,
  //    one-variant world with PREVIEW_SPECIES / PREVIEW_VARIANT.
  const manifest = buildPreviewManifest({ species, slot, composition, unified, hashAmp })
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  // 7. Snapshot — written LAST so any partial write above leaves snapshot
  //    on the previous build's value (fast-path safety).
  await fs.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(cur, null, 2))

  return {
    ms: Date.now() - t0, path: 'full',
    ...outputDescriptor(species, slot),
  }
}

// ── fast (gradient-only) path ───────────────────────────────────────────

async function fastGradientPath({ species, slot, composition, dir, cur, t0 }) {
  // The atlas + chassis + manifest from the prior full build are still on
  // disk and remain valid; only the LUT tile bytes change, and the manifest
  // needs hashAmp updated. Splice the LUT into atlas-color.png at the
  // gradient sub-region recorded in the manifest.
  const manifestPath = path.join(dir, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const slotRec = manifest.barkGradientByVariant?.[PREVIEW_SPECIES]?.[PREVIEW_VARIANT]
  if (!slotRec) {
    // No gradient was bound before. Convert to full rebuild.
    return await fullRebuild({ species, slot, composition, dir, cur, t0 })
  }

  const stops = Array.isArray(composition.bark.gradientStops) && composition.bark.gradientStops.length >= 2
    ? composition.bark.gradientStops
    : null
  const hashAmp = typeof composition.bark.gradientHashAmp === 'number' ? composition.bark.gradientHashAmp : 0

  if (!stops) {
    // Gradient toggled OFF. Manifest's barkGradientByVariant slot is removed;
    // atlas-color.png pixels left alone (they're sampled only when
    // uUseBarkGradient=1, which won't fire without a slot). Update manifest
    // + snapshot only.
    delete manifest.barkGradientByVariant[PREVIEW_SPECIES][PREVIEW_VARIANT]
    if (Object.keys(manifest.barkGradientByVariant[PREVIEW_SPECIES]).length === 0) {
      delete manifest.barkGradientByVariant[PREVIEW_SPECIES]
    }
    await atomicWriteJson(manifestPath, manifest)
    await fs.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(cur, null, 2))
    return { ms: Date.now() - t0, path: 'gradient-only', ...outputDescriptor(species, slot) }
  }

  // Re-compile the LUT and splice into atlas-color.png at the slot's pixel
  // box (offsetU * width, offsetV * height, scaleU * width, scaleV * height).
  const atlasW = manifest.atlas.width
  const atlasH = manifest.atlas.height
  const lutBuf = compileGradientLUT(stops)
  const left = Math.round(slotRec.offsetU * atlasW)
  const top  = Math.round(slotRec.offsetV * atlasH)
  // LUT itself is 256×1 raw RGBA. Encode as PNG for sharp.composite input.
  const lutPng = await sharp(lutBuf, { raw: { width: LUT_W, height: LUT_H, channels: 4 } }).png().toBuffer()
  const atlasPath = path.join(dir, 'atlas-color.png')
  const tmp = atlasPath + '.tmp'
  // compressionLevel 1 (not 9): the preview atlas is rebuilt frequently
  // during gradient authoring; max compression dominates the fast path
  // (>200ms at 4MB+). Level 1 produces a ~2× larger PNG but encodes in a
  // fraction of the time. The atlas is served once per build over LAN and
  // the larger PNG decodes in the browser in negligible time.
  await sharp(atlasPath)
    .composite([{ input: lutPng, left, top }])
    .png({ compressionLevel: 1 })
    .toFile(tmp)
  await fs.rename(tmp, atlasPath)

  // hashAmp lives on the manifest slot (atlas pixels don't carry it).
  slotRec.hashAmp = hashAmp
  await atomicWriteJson(manifestPath, manifest)
  await fs.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(cur, null, 2))

  return { ms: Date.now() - t0, path: 'gradient-only', ...outputDescriptor(species, slot) }
}

// ── snapshot + change detection ─────────────────────────────────────────

function snapshotFromComposition(c) {
  return {
    chassis: c.chassis,
    bark: {
      ref: c.bark?.ref ?? null,
      uvScale: c.bark?.uvScale ?? null,
      tintBase: c.bark?.tintBase ?? null,
      tintJitterRange: c.bark?.tintJitterRange ?? null,
      roughnessOverride: c.bark?.roughnessOverride ?? null,
    },
    leaves: {
      pack: c.leaves?.pack ?? null,
      scale: c.leaves?.scale ?? null,
      occupancy: c.leaves?.occupancy ?? null,
      show: c.leaves?.show ?? null,
      ways: c.leaves?.ways ?? null,        // §5 Leaf Ways — changing it must rebuild
      mode: c.leaves?.mode ?? null,        // Authored vs Synthesized — must rebuild
      tintFront: c.leaves?.tintFront ?? null,
      tintBack: c.leaves?.tintBack ?? null,
    },
    gradient: {
      stops: c.bark?.gradientStops ?? null,
      hashAmp: c.bark?.gradientHashAmp ?? 0,
    },
    // Cache-buster for CODE changes (emission / populator / Ways grammar): the
    // composition params don't change when the build LOGIC does, so a re-preview
    // would otherwise 'noop' to a stale build. Bump this on any leaf-emission
    // logic change to force a full rebuild.
    buildVersion: 'leaf-model-2026-06-23d-natural-cc-scale',
  }
}

// Returns 'full' if non-gradient fields differ, 'gradient-only' if only
// gradient.{stops,hashAmp} differ, 'noop' if identical.
function pickPath(prev, cur) {
  if (!prev) return 'full'
  const stripG = (s) => ({ ...s, gradient: null })
  if (JSON.stringify(stripG(prev)) !== JSON.stringify(stripG(cur))) return 'full'
  if (JSON.stringify(prev.gradient) !== JSON.stringify(cur.gradient)) return 'gradient-only'
  return 'noop'
}

async function haveExistingBuild(dir) {
  try {
    await Promise.all([
      fs.access(path.join(dir, 'atlas-color.png')),
      fs.access(path.join(dir, 'atlas-normal.png')),
      fs.access(path.join(dir, 'chassis.glb')),
      fs.access(path.join(dir, 'manifest.json')),
    ])
    return true
  } catch { return false }
}

// ── sub-atlas pages — one tile each ─────────────────────────────────────

async function imgDims(buf) {
  const m = await sharp(buf).metadata()
  return { w: m.width, h: m.height }
}

async function bakeBarkPage(colorBuf, normalBuf, dims, outDir) {
  const { w, h } = dims
  const W = w + GUTTER * 2
  const H = h + GUTTER * 2
  const cx = GUTTER, cy = GUTTER
  const ext = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
  const cPng = await sharp(colorBuf).extend(ext).png().toBuffer()
  const nPng = normalBuf
    ? await sharp(normalBuf).extend(ext).png().toBuffer()
    : await sharp({ create: { width: W, height: H, channels: 4, background: { r: 128, g: 128, b: 255, alpha: 1 } } }).png().toBuffer()
  await fs.writeFile(path.join(outDir, 'trees-atlas-bark-color.png'), cPng)
  await fs.writeFile(path.join(outDir, 'trees-atlas-bark-normal.png'), nPng)
  return {
    width: W, height: H,
    colorPath: 'unused', normalPath: 'unused',
    tiles: [{
      tileIndex: 0,
      key: 'preview-bark',
      atlas: 'bark',
      classification: 'bark',
      classifiedBy: 'preview',
      refs: [{ species: PREVIEW_SPECIES, variantId: PREVIEW_VARIANT, matName: 'salonBark' }],
      content: { x: cx, y: cy, w, h },
      uvTransform: { offsetU: cx / W, offsetV: cy / H, scaleU: w / W, scaleV: h / H },
    }],
  }
}

async function bakeLeavesPage(shapeBuf, dims, outDir) {
  const { w, h } = dims
  const W = w + GUTTER * 2
  const H = h + GUTTER * 2
  const cx = GUTTER, cy = GUTTER
  const ext = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
  const cPng = await sharp(shapeBuf).extend(ext).png().toBuffer()
  const nPng = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 128, g: 128, b: 255, alpha: 1 } } }).png().toBuffer()
  await fs.writeFile(path.join(outDir, 'trees-atlas-leaves-color.png'), cPng)
  await fs.writeFile(path.join(outDir, 'trees-atlas-leaves-normal.png'), nPng)
  return {
    width: W, height: H,
    colorPath: 'unused', normalPath: 'unused',
    tiles: [{
      tileIndex: 0,
      key: 'preview-leaves',
      atlas: 'leaves',
      classification: 'leaf',
      classifiedBy: 'preview',
      refs: [{ species: PREVIEW_SPECIES, variantId: PREVIEW_VARIANT, matName: 'salonLeaves' }],
      content: { x: cx, y: cy, w, h },
      uvTransform: { offsetU: cx / W, offsetV: cy / H, scaleU: w / W, scaleV: h / H },
    }],
  }
}

async function bakeGradientPage(lutBuf, outDir) {
  const w = LUT_W, h = LUT_H
  const W = w + GUTTER * 2
  const H = h + GUTTER * 2
  const cx = GUTTER, cy = GUTTER
  const ext = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
  const cPng = await sharp(lutBuf, { raw: { width: w, height: h, channels: 4 } })
    .extend(ext).png().toBuffer()
  await fs.writeFile(path.join(outDir, 'trees-atlas-bark-gradient-color.png'), cPng)
  return {
    width: W, height: H,
    colorPath: 'unused',
    tiles: [{
      tileIndex: 0,
      key: 'preview-gradient',
      atlas: 'barkGradient',
      classification: 'barkGradient',
      classifiedBy: 'preview',
      refs: [{ species: PREVIEW_SPECIES, variantId: PREVIEW_VARIANT }],
      content: { x: cx, y: cy, w, h },
      uvTransform: { offsetU: cx / W, offsetV: cy / H, scaleU: w / W, scaleV: h / H },
    }],
  }
}

async function bakeDetailPage(detailBuf, dims, outDir) {
  const { w, h } = dims
  const W = w + GUTTER * 2
  const H = h + GUTTER * 2
  const cx = GUTTER, cy = GUTTER
  const ext = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
  const cPng = await sharp(detailBuf).extend(ext).png().toBuffer()
  await fs.writeFile(path.join(outDir, 'trees-atlas-bark-detail-color.png'), cPng)
  return {
    width: W, height: H,
    colorPath: 'unused',
    tiles: [{
      tileIndex: 0,
      key: 'preview-detail',
      atlas: 'barkDetail',
      classification: 'barkDetail',
      classifiedBy: 'preview',
      refs: [{ species: PREVIEW_SPECIES }],
      content: { x: cx, y: cy, w, h },
      uvTransform: { offsetU: cx / W, offsetV: cy / H, scaleU: w / W, scaleV: h / H },
    }],
  }
}

// Brief 10B (Vellum): mirror bakeDetailPage for the posterized substrate
// tile. The source posterized.png is an indexed PNG (median-cut quantized);
// sharp transparently decodes it to RGBA on the .extend().png() roundtrip,
// so the master atlas composite never sees palette mode.
async function bakePosterizedPage(postBuf, dims, outDir) {
  const { w, h } = dims
  const W = w + GUTTER * 2
  const H = h + GUTTER * 2
  const cx = GUTTER, cy = GUTTER
  const ext = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
  const cPng = await sharp(postBuf).extend(ext).png().toBuffer()
  await fs.writeFile(path.join(outDir, 'trees-atlas-bark-posterized-color.png'), cPng)
  return {
    width: W, height: H,
    colorPath: 'unused',
    tiles: [{
      tileIndex: 0,
      key: 'preview-posterized',
      atlas: 'barkPosterized',
      classification: 'barkPosterized',
      classifiedBy: 'preview',
      refs: [{ species: PREVIEW_SPECIES }],
      content: { x: cx, y: cy, w, h },
      uvTransform: { offsetU: cx / W, offsetV: cy / H, scaleU: w / W, scaleV: h / H },
    }],
  }
}

// ── GLB UV-rewrite lookup ───────────────────────────────────────────────

function buildLookupIdx(unified) {
  const map = new Map()
  for (const t of unified.tiles || []) {
    for (const ref of t.refs) {
      // Match rewriteGLB's `${lookupKey}|${matName}` convention.
      // lookupKey is `${species}|${variantId}` (PREVIEW_SPECIES|PREVIEW_VARIANT
      // for preview), then matName ('salonBark' / 'salonLeaves').
      map.set(`${ref.species}|${ref.variantId}|${ref.matName}`, t)
    }
  }
  return map
}

// ── manifest emission (single-entry trees-atlas.json shape) ─────────────

function buildPreviewManifest({ species, slot, composition, unified, hashAmp }) {
  const tilesByKey = {}
  for (const t of unified.tiles || []) tilesByKey[t.key] = t

  const barkBySpecies = {}
  if (composition.bark?.ref) {
    barkBySpecies[PREVIEW_SPECIES] = {
      materialRef: composition.bark.ref,
      uvScale: composition.bark.uvScale ?? [1.5, 4],
      tintBase: composition.bark.tintBase ?? '#ffffff',
      tintJitterRange: typeof composition.bark.tintJitterRange === 'number' ? composition.bark.tintJitterRange : 0,
      roughnessOverride: typeof composition.bark.roughnessOverride === 'number' ? composition.bark.roughnessOverride : -1,
    }
  }

  const barkGradientByVariant = {}
  for (const gt of unified.gradientTiles || []) {
    if (!barkGradientByVariant[PREVIEW_SPECIES]) barkGradientByVariant[PREVIEW_SPECIES] = {}
    barkGradientByVariant[PREVIEW_SPECIES][PREVIEW_VARIANT] = {
      offsetU: gt.uvTransform.offsetU,
      offsetV: gt.uvTransform.offsetV,
      scaleU: gt.uvTransform.scaleU,
      scaleV: gt.uvTransform.scaleV,
      hashAmp,
    }
  }

  const barkDetailBySpecies = {}
  // Mirror bake-look's `barkTileUV` field (the species's primary bark tile in
  // unified-atlas space) so the runtime fragment chunk can recover local-UV.
  const primaryBark = unified.tiles?.find(t => t.classification === 'bark')
  for (const dt of unified.detailTiles || []) {
    if (!primaryBark) continue
    barkDetailBySpecies[PREVIEW_SPECIES] = {
      uvTransform: {
        offsetU: dt.uvTransform.offsetU,
        offsetV: dt.uvTransform.offsetV,
        scaleU: dt.uvTransform.scaleU,
        scaleV: dt.uvTransform.scaleV,
      },
      barkTileUV: primaryBark.uvTransform,
    }
  }

  // Brief 10B (Vellum): per-species posterized substrate uvTransform — same
  // shape as detail, runtime reads at tier ≤ 1 to resample from the
  // posterized region instead of the vendor bark color.
  const barkPosterizedBySpecies = {}
  for (const pt of unified.posterizedTiles || []) {
    if (!primaryBark) continue
    barkPosterizedBySpecies[PREVIEW_SPECIES] = {
      uvTransform: {
        offsetU: pt.uvTransform.offsetU,
        offsetV: pt.uvTransform.offsetV,
        scaleU: pt.uvTransform.scaleU,
        scaleV: pt.uvTransform.scaleV,
      },
      barkTileUV: primaryBark.uvTransform,
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    salonPreview: { species, slot, sourceSpecies: species },
    rosterSize: 1,
    materialDefaults: { roughness: 0.85, metalness: 0.0 },
    atlas: {
      width: unified.width, height: unified.height,
      colorPath: `/api/arborist/preview-atlas/${species}/${slot}/atlas-color.png`,
      normalPath: `/api/arborist/preview-atlas/${species}/${slot}/atlas-normal.png`,
      alphaMode: 'MASK', alphaCutoff: 0.5, alphaTest: 0.5,
      doubleSided: true,
    },
    tiles: unified.tiles || [],
    tilesByKey,
    barkBySpecies,
    barkGradientByVariant,
    barkDetailBySpecies,
    barkPosterizedBySpecies,
    previewKey: {
      species: PREVIEW_SPECIES,
      variantId: PREVIEW_VARIANT,
    },
  }
}

// ── output descriptor — returned to the HTTP caller ─────────────────────

function outputDescriptor(species, slot) {
  const base = `/api/arborist/preview-atlas/${species}/${slot}`
  return {
    atlasUrl: `${base}/atlas-color.png`,
    normalUrl: `${base}/atlas-normal.png`,
    glbUrl: `${base}/chassis.glb`,
    manifestUrl: `${base}/manifest.json`,
  }
}

// ── small file utilities ────────────────────────────────────────────────

async function atomicWriteJson(p, obj) {
  const tmp = p + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2))
  await fs.rename(tmp, p)
}

// Exposed so serve.js can serve static files from this dir.
export { CACHE_ROOT }
