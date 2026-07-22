/**
 * bake-look.js — per-Look tree atlas pipeline.
 *
 * Reads `public/looks/<look>/design.json#/trees`, produces:
 *   public/baked/<look>/trees-atlas-bark-color.png
 *   public/baked/<look>/trees-atlas-bark-normal.png
 *   public/baked/<look>/trees-atlas-leaves-color.png
 *   public/baked/<look>/trees-atlas-leaves-normal.png
 *   public/baked/<look>/trees-atlas.json
 *   public/baked/<look>/trees-atlas-bark-viz.png       (optional)
 *   public/baked/<look>/trees-atlas-leaves-viz.png     (optional)
 *   public/baked/<look>/trees/<species>/skeleton-<vid>-<lod>.glb  (UV-rewritten)
 *
 * Empty roster → no outputs, returns { skipped: true, reason: 'empty-roster' }.
 *
 * CLI:    node arborist/bake-look.js --look <name> [--no-viz] [--no-rewrite]
 * Module: import { bakeLook } from './bake-look.js'
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import crypto from 'node:crypto'
import { surveyRoster } from './atlas-survey.js'
import { packSkyline } from './atlas-pack.js'
import { computeTreeBounds } from './tree-bounds.js'
import { measureCanopyBase, captureImpostor, captureOpaque } from './bake-impostors.js'
import { ensurePosterizedForRef } from './extract-bark-posterized.mjs'

// Per-tile mip-safe gutter (pixels). Edge pixels of each placed rect are
// clamp-extended into the gutter so mip blending doesn't bleed across atlas
// neighbors. 4px covers ~3 mip levels of safe sampling.
const GUTTER = 4
// Soft cap on atlas width — packer grows down, not right, past this.
const MAX_ATLAS_WIDTH = 4096
// Per-classification quality ceiling. Source textures larger than this are
// downsampled to fit (aspect preserved); smaller sources keep their dims.
// Matches the previous fixed-cell sizes so existing visual quality is held
// constant — the win comes from packing per-tile rather than per-cell.
const CONTENT_CAP = {
  bark: { w: 512, h: 1024 },
  leaf: { w: 512, h: 512 },
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const LOOKS_DIR = path.join(REPO_ROOT, 'public/looks')
const TREES_DIR = path.join(REPO_ROOT, 'public/trees')
const BAKED_DIR = path.join(REPO_ROOT, 'public/baked')
const LODS = ['lod0', 'lod1', 'lod2']

const ATLAS_NAMES = { bark: 'AtlasBark', leaves: 'AtlasLeaves' }
const ATLAS_DEFAULTS = {
  bark:   { alphaMode: 'OPAQUE', alphaCutoff: 0,   doubleSided: false, alphaTest: 0 },
  leaves: { alphaMode: 'MASK',   alphaCutoff: 0.5, doubleSided: true,  alphaTest: 0.5 },
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

// ── helpers ──────────────────────────────────────────────────────────────
const docCache = new Map()
async function loadDoc(file) {
  if (!docCache.has(file)) docCache.set(file, await io.read(file))
  return docCache.get(file)
}
function clearDocCache() { docCache.clear() }

async function ensureDir(d) { await fs.mkdir(d, { recursive: true }) }
async function rmrf(p) { try { await fs.rm(p, { recursive: true, force: true }) } catch {} }

// Parse "WxH" or "W×H" dim strings the survey emits.
function parseDims(s) {
  if (!s) return null
  const m = String(s).split(/[×x]/).map(n => parseInt(n, 10))
  if (m.length !== 2 || !m[0] || !m[1]) return null
  return { w: m[0], h: m[1] }
}

// Content rect for a tile: derived from the color texture's aspect ratio
// (normal is resampled to match — same as previous behavior), capped to
// CONTENT_CAP[classification] so a single oversized source can't blow out
// the atlas. Smaller sources retain their actual dims.
function tileContentDims(tile) {
  const src = parseDims(tile.colorDims) || parseDims(tile.normalDims) || { w: 512, h: 512 }
  const cap = CONTENT_CAP[tile.classification] || { w: 512, h: 512 }
  if (src.w <= cap.w && src.h <= cap.h) return { w: src.w, h: src.h }
  const sa = src.w / src.h, da = cap.w / cap.h
  if (sa > da) return { w: cap.w, h: Math.max(1, Math.round(cap.w / sa)) }
  return { w: Math.max(1, Math.round(cap.h * sa)), h: cap.h }
}

async function fetchTextures(tile) {
  const ref = tile.refs[0]
  for (const lod of LODS) {
    const file = path.join(TREES_DIR, ref.species, `skeleton-${ref.variantId}-${lod}.glb`)
    let doc
    try { doc = await loadDoc(file) } catch { continue }
    for (const mat of doc.getRoot().listMaterials()) {
      if (mat.getName() !== ref.matName) continue
      const color = mat.getBaseColorTexture()?.getImage()
      const normal = mat.getNormalTexture()?.getImage()
      if (color) return { color: Buffer.from(color), normal: normal ? Buffer.from(normal) : null }
    }
  }
  return { color: null, normal: null }
}

async function flatNormalBuf(w, h) {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 128, g: 128, b: 255, alpha: 1 } }
  }).png().toBuffer()
}

// ── Brief 2 (Holm): bark gradient LUTs ───────────────────────────────────
//
// Salon compositions may carry a multi-stop gradient ramp per variant
// (manifest.json#/variants[i].bark.gradientStops). bake-look compiles each
// ramp to a 256×1 RGBA buffer, packs them into a third sub-atlas page
// alongside bark + leaves, and emits per-variant uvTransforms into the
// manifest so the runtime fragment shader can sample them as a 1D LUT
// indexed by a per-instance hash.
//
// Interpolation is linear-in-sRGB (matches Three.js's loader which tags
// the unified atlas PNG as SRGBColorSpace, so the GPU linearizes on
// sample). Stops outside [0,1] clamp to nearest authored stop.
const GRADIENT_LUT_W = 256
const GRADIENT_LUT_H = 1

function parseHexColor(hex) {
  if (typeof hex !== 'string') return [255, 255, 255]
  const s = hex.replace(/^#/, '').trim()
  if (s.length === 3) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)]
  }
  if (s.length === 6) {
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  }
  return [255, 255, 255]
}

// Compile a stops array → 256×1 raw RGBA buffer (1024 bytes). Stops are
// {t, color} where t∈[0,1] and color is "#RRGGBB". The output is in sRGB
// byte space — Three.js's SRGBColorSpace decode happens on sample.
// Brief 7 (Cambium): named export so the Salon preview-atlas builder can
// reuse this helper without re-implementing the stops → 256×1 LUT bytes
// math. Preview atlas compiles one LUT per composition; bake-look compiles
// one per unique sha1 across the per-Look roster. Same function body, same
// output shape — drift-free.
export function compileGradientLUT(stops) {
  // Sort + clamp + dedup-by-t to make sampling robust to operator input
  const sorted = (stops || [])
    .filter(s => s && typeof s.t === 'number' && typeof s.color === 'string')
    .map(s => ({ t: Math.max(0, Math.min(1, s.t)), rgb: parseHexColor(s.color) }))
    .sort((a, b) => a.t - b.t)
  if (sorted.length === 0) {
    // Defensive fallback — never called in practice since caller checks
    sorted.push({ t: 0, rgb: [255, 255, 255] }, { t: 1, rgb: [255, 255, 255] })
  }
  if (sorted.length === 1) sorted.push({ t: 1, rgb: sorted[0].rgb })
  const buf = Buffer.alloc(GRADIENT_LUT_W * GRADIENT_LUT_H * 4)
  for (let x = 0; x < GRADIENT_LUT_W; x++) {
    const t = x / (GRADIENT_LUT_W - 1)
    // Find the bracket. Outside-range clamps to nearest.
    let lo = sorted[0], hi = sorted[sorted.length - 1]
    if (t <= sorted[0].t) { lo = hi = sorted[0] }
    else if (t >= sorted[sorted.length - 1].t) { lo = hi = sorted[sorted.length - 1] }
    else {
      for (let i = 1; i < sorted.length; i++) {
        if (t <= sorted[i].t) { lo = sorted[i - 1]; hi = sorted[i]; break }
      }
    }
    const span = hi.t - lo.t
    const u = span > 1e-6 ? (t - lo.t) / span : 0
    const r = Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * u)
    const g = Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * u)
    const b = Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * u)
    const o = x * 4
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255
  }
  return buf
}

// sha1 over the raw LUT bytes — identical gradients across different
// (species, variantId) collapse to one atlas tile (matches the
// (colorSha1, normalSha1) dedup that atlas-survey applies to texture tiles).
function gradientSha1(lutBuf) {
  return crypto.createHash('sha1').update(lutBuf).digest('hex').slice(0, 12)
}

// Bake a gradient sub-atlas. Tiles are {key, lutBuffer, refs:[{species,variantId}]};
// callers dedup by sha1 before passing in. Layout mirrors bakeAtlas — skyline-pack
// with GUTTER, content+gutter rects, edge-clamp via sharp.extend('copy'). One PNG
// per Look. Returns the shape unifyAtlases consumes (uvTransform per tile).
async function bakeGradientAtlas(tiles, outDir, lookName) {
  if (tiles.length === 0) return null
  const contents = tiles.map(() => ({ w: GRADIENT_LUT_W, h: GRADIENT_LUT_H }))
  const rects = contents.map(d => ({ w: d.w + GUTTER * 2, h: d.h + GUTTER * 2 }))
  const pack = packSkyline(rects, { maxWidth: MAX_ATLAS_WIDTH })
  const atlasW = pack.width
  const atlasH = pack.height

  const colorBase = sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
  const colorParts = []
  const tileEntries = []

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const place = pack.placements[i]
    const content = contents[i]
    const cx = place.x + GUTTER
    const cy = place.y + GUTTER
    const extendOpts = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
    const colorBuf = await sharp(t.lutBuffer, { raw: { width: content.w, height: content.h, channels: 4 } })
      .extend(extendOpts)
      .png()
      .toBuffer()
    colorParts.push({ input: colorBuf, left: place.x, top: place.y })
    tileEntries.push({
      tileIndex: i,
      key: t.key,
      atlas: 'barkGradient',
      classification: 'barkGradient',
      refs: t.refs,
      content: { x: cx, y: cy, w: content.w, h: content.h },
      uvTransform: {
        offsetU: cx / atlasW,
        offsetV: cy / atlasH,
        scaleU: content.w / atlasW,
        scaleV: content.h / atlasH,
      },
    })
  }

  const colorRel = `trees-atlas-bark-gradient-color.png`
  await colorBase.composite(colorParts).png({ compressionLevel: 9 }).toFile(path.join(outDir, colorRel))

  return {
    width: atlasW, height: atlasH,
    colorPath: `/baked/${lookName}/${colorRel}`,
    tiles: tileEntries,
  }
}

// ── Brief 2.1a (Cinder): bark Detail Texturing layer ────────────────────
//
// High-pass detail maps (per bark ref under public/textures/bark/<ref>/
// detail.png, produced one-shot by arborist/extract-bark-detail.mjs) get
// packed into a fourth sub-atlas page alongside bark + leaves + gradient.
// Runtime composites each fragment's bark color with the detail sample via
// Overlay-blend (Unreal Detail Texture / Unity HDRP Detail Albedo). One
// extra texture2D per bark fragment; zero new programs, zero new bindings.
//
// Detail tiles dedup by bark ref (multiple species sharing Bark003 share
// the detail tile). Per-species manifest emission resolves through the
// species's barkBySpecies.materialRef; for region-split species the trunk
// ref wins (surfaced in NOTES — branch fragments composite trunk's detail).
async function bakeDetailAtlas(tiles, outDir, lookName) {
  if (tiles.length === 0) return null
  const contents = tiles.map(t => ({ w: t.w, h: t.h }))
  const rects = contents.map(d => ({ w: d.w + GUTTER * 2, h: d.h + GUTTER * 2 }))
  const pack = packSkyline(rects, { maxWidth: MAX_ATLAS_WIDTH })
  const atlasW = pack.width
  const atlasH = pack.height

  const colorBase = sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } }
  })
  const colorParts = []
  const tileEntries = []
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const place = pack.placements[i]
    const content = contents[i]
    const cx = place.x + GUTTER
    const cy = place.y + GUTTER
    const extendOpts = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
    const colorBuf = await sharp(t.buffer)
      .resize(content.w, content.h, { fit: 'fill' })
      .extend(extendOpts)
      .png()
      .toBuffer()
    colorParts.push({ input: colorBuf, left: place.x, top: place.y })
    tileEntries.push({
      tileIndex: i,
      key: t.key,
      atlas: 'barkDetail',
      classification: 'barkDetail',
      refs: t.refs,
      content: { x: cx, y: cy, w: content.w, h: content.h },
      uvTransform: {
        offsetU: cx / atlasW,
        offsetV: cy / atlasH,
        scaleU: content.w / atlasW,
        scaleV: content.h / atlasH,
      },
    })
  }
  const colorRel = `trees-atlas-bark-detail-color.png`
  await colorBase.composite(colorParts).png({ compressionLevel: 9 }).toFile(path.join(outDir, colorRel))
  return {
    width: atlasW, height: atlasH,
    colorPath: `/baked/${lookName}/${colorRel}`,
    tiles: tileEntries,
  }
}

// ── Brief 10B (Vellum): bark Posterized Substrate layer ─────────────────
//
// Per-bark-ref colour-quantized substrate tiles (median-cut palette, light
// FS dither — produced by arborist/extract-bark-posterized.mjs, auto-fired
// from this script if the source posterized.png is missing). Packs as a
// fifth `barkPosterized` sub-atlas page alongside bark/leaves/gradient/
// detail. Runtime (tier ≤ 1) replaces `<map_fragment>`'s vendor sample
// with a posterized sample at the same tile-local UV BEFORE Brief 2.1's
// luminance gradient REPLACE runs — kit posterized look + cleaner LUT
// indexing. Tier 2 (street) stays on vendor (forward-compat with 10C).
//
// One extra texture2D per bark fragment under tier ≤ 1; zero new programs,
// zero new bindings (single unified atlas + single `map` sampler).
//
// Posterized tiles dedup by bark ref (same dedup pattern as Brief 2.1a
// detail). Per-species manifest emission resolves through
// barkBySpecies.materialRef; for region-split species the trunk ref wins.
async function bakePosterizedAtlas(tiles, outDir, lookName) {
  if (tiles.length === 0) return null
  const contents = tiles.map(t => ({ w: t.w, h: t.h }))
  const rects = contents.map(d => ({ w: d.w + GUTTER * 2, h: d.h + GUTTER * 2 }))
  const pack = packSkyline(rects, { maxWidth: MAX_ATLAS_WIDTH })
  const atlasW = pack.width
  const atlasH = pack.height

  const colorBase = sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
  const colorParts = []
  const tileEntries = []
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const place = pack.placements[i]
    const content = contents[i]
    const cx = place.x + GUTTER
    const cy = place.y + GUTTER
    const extendOpts = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }
    // sharp transparently decodes the source indexed PNG to RGBA on read;
    // .toBuffer() emits a non-palette PNG so the master atlas composite never
    // sees palette mode.
    const colorBuf = await sharp(t.buffer)
      .resize(content.w, content.h, { fit: 'fill' })
      .extend(extendOpts)
      .png()
      .toBuffer()
    colorParts.push({ input: colorBuf, left: place.x, top: place.y })
    tileEntries.push({
      tileIndex: i,
      key: t.key,
      atlas: 'barkPosterized',
      classification: 'barkPosterized',
      refs: t.refs,
      content: { x: cx, y: cy, w: content.w, h: content.h },
      uvTransform: {
        offsetU: cx / atlasW,
        offsetV: cy / atlasH,
        scaleU: content.w / atlasW,
        scaleV: content.h / atlasH,
      },
    })
  }
  const colorRel = `trees-atlas-bark-posterized-color.png`
  await colorBase.composite(colorParts).png({ compressionLevel: 9 }).toFile(path.join(outDir, colorRel))
  return {
    width: atlasW, height: atlasH,
    colorPath: `/baked/${lookName}/${colorRel}`,
    tiles: tileEntries,
  }
}

// ── atlas baking ─────────────────────────────────────────────────────────
//
// Skyline-packed atlas: each tile occupies its actual source content rect
// (max of color/normal dims), surrounded by a `GUTTER`-px clamp-extended
// border so mip blending stays clean. No uniform cells, no PoT padding —
// the atlas is exactly as tall as the packer needed.
async function bakeAtlas(tiles, atlasName, outDir, lookName) {
  if (tiles.length === 0) return null

  // Resolve content dims, then pack the rects (content + 2*GUTTER on each axis).
  const contents = tiles.map(tileContentDims)
  const rects = contents.map(d => ({ w: d.w + GUTTER * 2, h: d.h + GUTTER * 2 }))
  const pack = packSkyline(rects, { maxWidth: MAX_ATLAS_WIDTH })
  const atlasW = pack.width
  const atlasH = pack.height

  const colorBase = sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
  const normalBase = sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 128, g: 128, b: 255, alpha: 1 } }
  })

  const colorParts = []
  const normalParts = []
  const tileEntries = []

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const place = pack.placements[i]            // outer rect (includes gutter)
    const content = contents[i]                  // inner rect (actual pixels)
    const cx = place.x + GUTTER                  // content origin in atlas
    const cy = place.y + GUTTER

    const { color, normal } = await fetchTextures(t)

    // sharp.extend with 'copy' clamps edge pixels outward into the gutter so
    // mip downsamples don't bleed neighboring tiles into the sample.
    const extendOpts = { top: GUTTER, bottom: GUTTER, left: GUTTER, right: GUTTER, extendWith: 'copy' }

    const colorBuf = color
      ? await sharp(color).resize(content.w, content.h, { fit: 'fill' }).extend(extendOpts).toBuffer()
      : await sharp({ create: { width: content.w + GUTTER * 2, height: content.h + GUTTER * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    colorParts.push({ input: colorBuf, left: place.x, top: place.y })

    const normalBuf = normal
      ? await sharp(normal).resize(content.w, content.h, { fit: 'fill' }).extend(extendOpts).toBuffer()
      : await flatNormalBuf(content.w + GUTTER * 2, content.h + GUTTER * 2)
    normalParts.push({ input: normalBuf, left: place.x, top: place.y })

    tileEntries.push({
      tileIndex: i,
      key: t.key,
      atlas: atlasName,
      classification: t.classification,
      refs: t.refs,
      content: { x: cx, y: cy, w: content.w, h: content.h },
      uvTransform: {
        offsetU: cx / atlasW,
        offsetV: cy / atlasH,
        scaleU: content.w / atlasW,
        scaleV: content.h / atlasH,
      },
      sourceColorDims: t.colorDims,
      sourceNormalDims: t.normalDims,
    })
  }

  const colorRel = `trees-atlas-${atlasName}-color.png`
  const normalRel = `trees-atlas-${atlasName}-normal.png`
  await colorBase.composite(colorParts).png({ compressionLevel: 9 }).toFile(path.join(outDir, colorRel))
  await normalBase.composite(normalParts).png({ compressionLevel: 9 }).toFile(path.join(outDir, normalRel))

  return {
    width: atlasW, height: atlasH,
    colorPath: `/baked/${lookName}/${colorRel}`,
    normalPath: `/baked/${lookName}/${normalRel}`,
    tiles: tileEntries,
  }
}

// Composite the per-classification color/normal PNGs into a single unified
// atlas, and rewrite every tile's uvTransform to point into the unified
// image. One atlas means runtime can use a single shared MeshStandardMaterial
// (one shader program) regardless of bark vs leaves classification — Bloom
// is intolerant of more than one tree shader program in this scene, so this
// is non-negotiable.
// Brief 7 (Cambium): named export for Salon preview atlas reuse.
export async function unifyAtlases(bark, leaves, gradient, detail, posterized, outDir, lookName) {
  if (!bark && !leaves && !gradient && !detail && !posterized) return null

  // Pack the sub-atlas pages as rects; skyline picks side-by-side or stacked
  // based on which wastes less. No fixed gutter here — sub-atlas edges are
  // already mip-safe (the sub-atlases include alpha=0 / flat normal
  // background past their packed content). Brief 2 (Holm) added a third
  // sub-atlas for bark gradient LUTs; Brief 2.1a (Cinder) added a fourth
  // for bark detail high-pass maps; Brief 10B (Vellum) adds a fifth for
  // posterized bark substrate. None of these three carry normal maps (LUTs
  // are sampled by the fragment shader, detail is greyscale, posterized
  // is substrate-only) so the unified normal map gets a flat-normal blit
  // for those footprints.
  const pages = []
  if (bark)       pages.push({ kind: 'bark',       src: bark,       w: bark.width,       h: bark.height })
  if (leaves)     pages.push({ kind: 'leaves',     src: leaves,     w: leaves.width,     h: leaves.height })
  if (gradient)   pages.push({ kind: 'gradient',   src: gradient,   w: gradient.width,   h: gradient.height })
  if (detail)     pages.push({ kind: 'detail',     src: detail,     w: detail.width,     h: detail.height })
  if (posterized) pages.push({ kind: 'posterized', src: posterized, w: posterized.width, h: posterized.height })
  const pack = packSkyline(pages.map(p => ({ w: p.w, h: p.h })), { maxWidth: MAX_ATLAS_WIDTH })
  const unifiedW = Math.max(pack.width, 1)
  const unifiedH = Math.max(pack.height, 1)
  pages.forEach((p, i) => { p.x = pack.placements[i].x; p.y = pack.placements[i].y })
  const placedBark = pages.find(p => p.kind === 'bark')
  const placedLeaves = pages.find(p => p.kind === 'leaves')
  const placedGradient = pages.find(p => p.kind === 'gradient')
  const placedDetail = pages.find(p => p.kind === 'detail')
  const placedPosterized = pages.find(p => p.kind === 'posterized')

  const colorOut = path.join(outDir, 'trees-atlas-color.png')
  const normalOut = path.join(outDir, 'trees-atlas-normal.png')

  const colorBase = sharp({
    create: { width: unifiedW, height: unifiedH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
  const normalBase = sharp({
    create: { width: unifiedW, height: unifiedH, channels: 4, background: { r: 128, g: 128, b: 255, alpha: 1 } }
  })

  const colorParts = []
  const normalParts = []
  if (placedBark) {
    const barkColor = await fs.readFile(path.join(outDir, `trees-atlas-bark-color.png`))
    const barkNormal = await fs.readFile(path.join(outDir, `trees-atlas-bark-normal.png`))
    colorParts.push({ input: barkColor, left: placedBark.x, top: placedBark.y })
    normalParts.push({ input: barkNormal, left: placedBark.x, top: placedBark.y })
  }
  if (placedLeaves) {
    const leavesColor = await fs.readFile(path.join(outDir, `trees-atlas-leaves-color.png`))
    const leavesNormal = await fs.readFile(path.join(outDir, `trees-atlas-leaves-normal.png`))
    colorParts.push({ input: leavesColor, left: placedLeaves.x, top: placedLeaves.y })
    normalParts.push({ input: leavesNormal, left: placedLeaves.x, top: placedLeaves.y })
  }
  if (placedGradient) {
    // Brief 2 (Holm): gradient sub-atlas color only; its normal footprint
    // gets the unified normal map's flat-tangent background by default.
    const gradColor = await fs.readFile(path.join(outDir, `trees-atlas-bark-gradient-color.png`))
    colorParts.push({ input: gradColor, left: placedGradient.x, top: placedGradient.y })
  }
  if (placedDetail) {
    // Brief 2.1a (Cinder): detail sub-atlas color only. Detail is greyscale
    // high-pass + 0.5-grey baseline; the unified normal map's flat-tangent
    // background fills the detail footprint (detail isn't normal-shaded).
    const detailColor = await fs.readFile(path.join(outDir, `trees-atlas-bark-detail-color.png`))
    colorParts.push({ input: detailColor, left: placedDetail.x, top: placedDetail.y })
  }
  if (placedPosterized) {
    // Brief 10B (Vellum): posterized substrate sub-atlas color only. Tier
    // ≤ 1 runtime resamples from this region instead of the vendor color
    // tile via uBarkPosterizedTileScale/Offset. Normal map flat-tangent.
    const postColor = await fs.readFile(path.join(outDir, `trees-atlas-bark-posterized-color.png`))
    colorParts.push({ input: postColor, left: placedPosterized.x, top: placedPosterized.y })
  }
  await colorBase.composite(colorParts).png({ compressionLevel: 9 }).toFile(colorOut)

  // Source GLB normal maps often have garbage pixels in alpha-cutout regions
  // (zero-length vectors). At runtime those decode to (0,0,0); the shader's
  // normalize() then produces NaN, which cascades through Bloom's mipmap
  // downsample and blacks out the entire framebuffer. Sanitize: any pixel
  // whose decoded normal length is below a small threshold is replaced with
  // a flat tangent-space normal (128, 128, 255).
  {
    const composed = await normalBase.composite(normalParts).raw().toBuffer({ resolveWithObject: true })
    const { data, info } = composed
    const ch = info.channels
    let fixed = 0
    for (let i = 0; i < data.length; i += ch) {
      const nx = data[i] / 127.5 - 1
      const ny = data[i + 1] / 127.5 - 1
      const nz = data[i + 2] / 127.5 - 1
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len < 0.5) {
        data[i] = 128
        data[i + 1] = 128
        data[i + 2] = 255
        if (ch === 4) data[i + 3] = 255
        fixed++
      }
    }
    if (fixed > 0) {
      console.log(`[bake-look] sanitized ${fixed} zero-length normal pixels`)
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
      .png({ compressionLevel: 9 })
      .toFile(normalOut)
  }

  // Remap each tile's uvTransform from its per-classification atlas
  // coordinates into the unified atlas. Each sub-atlas keeps its scale
  // (w / unifiedW, h / unifiedH) and is offset by its packer placement.
  const remap = (page) => {
    if (!page) return []
    const sU = page.w / unifiedW
    const sV = page.h / unifiedH
    const oU = page.x / unifiedW
    const oV = page.y / unifiedH
    return page.src.tiles.map(t => ({
      ...t,
      atlas: 'unified',
      uvTransform: {
        offsetU: t.uvTransform.offsetU * sU + oU,
        offsetV: t.uvTransform.offsetV * sV + oV,
        scaleU: t.uvTransform.scaleU * sU,
        scaleV: t.uvTransform.scaleV * sV,
      },
    }))
  }
  const tiles = [...remap(placedBark), ...remap(placedLeaves)]
  // Gradient tiles ride in the same unified atlas but stay segregated from
  // `tiles` (which is the GLB-rewriter lookup keyed by material name).
  // Gradient tiles aren't bound to any GLB primitive — they're sampled
  // shader-side via uniform-driven UVs — so a parallel array keeps the GLB
  // rewrite path's invariants intact.
  const gradientTiles = remap(placedGradient)
  const detailTiles = remap(placedDetail)
  const posterizedTiles = remap(placedPosterized)

  return {
    width: unifiedW,
    height: unifiedH,
    colorPath: `/baked/${lookName}/trees-atlas-color.png`,
    normalPath: `/baked/${lookName}/trees-atlas-normal.png`,
    tiles,
    gradientTiles,
    detailTiles,
    posterizedTiles,
  }
}

// ── viz ──────────────────────────────────────────────────────────────────
function svgLabel(text, w, h) {
  const fontSize = Math.max(12, Math.floor(w / 28))
  const lineH = Math.floor(fontSize * 1.25)
  const lines = text.split('\n')
  const bannerH = lines.length * lineH + 8
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const tspans = lines.map((ln, i) => `<tspan x="6" y="${4 + (i + 1) * lineH - 4}">${escape(ln)}</tspan>`).join('')
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${w}" height="${bannerH}" fill="rgba(0,0,0,0.72)"/>
    <text font-family="monospace" font-size="${fontSize}" fill="#fff">${tspans}</text>
    <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#ff0" stroke-width="2"/>
  </svg>`)
}

// Renders the packed atlas with per-tile labels overlaid on each placement,
// so an operator can sanity-check what landed where in the skyline pack.
async function buildViz(rosterTiles, baked, atlasName, outDir) {
  if (!baked || rosterTiles.length === 0) return null
  const { width: w, height: h, tiles: bakedTiles } = baked
  const base = sharp({
    create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } }
  })
  const byKey = new Map(rosterTiles.map(t => [t.key, t]))
  const composites = []
  for (let i = 0; i < bakedTiles.length; i++) {
    const bt = bakedTiles[i]
    const t = byKey.get(bt.key)
    if (!t) continue
    const { x, y, w: cw, h: ch } = bt.content
    const { color } = await fetchTextures(t)
    const fitted = color
      ? await sharp(color).resize(cw, ch, { fit: 'fill' }).png().toBuffer()
      : await sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer()
    composites.push({ input: fitted, left: x, top: y })
    const refLabel = t.refs.length === 1 ? '' : `  ×${t.refs.length}`
    const label = `#${i} ${t.classification}${refLabel}\n${t.refs[0].species}\n${t.refs[0].matName.slice(0, 30)}\n${t.colorDims}`
    composites.push({ input: svgLabel(label, cw, ch), left: x, top: y })
  }
  const out = path.join(outDir, `trees-atlas-${atlasName}-viz.png`)
  await base.composite(composites).png({ compressionLevel: 6 }).toFile(out)
  return out
}

// ── GLB UV rewriter ──────────────────────────────────────────────────────
function transformUVs(uvArr, t) {
  const { offsetU, offsetV, scaleU, scaleV } = t
  for (let i = 0; i < uvArr.length; i += 2) {
    let u = uvArr[i], v = uvArr[i + 1]
    u = u - Math.floor(u); v = v - Math.floor(v)
    uvArr[i]     = u * scaleU + offsetU
    uvArr[i + 1] = v * scaleV + offsetV
  }
}

// Brief 7 (Cambium): named export so the Salon preview-atlas builder can
// UV-rewrite a single-composition chassis GLB using the same code path that
// rewrites runtime LS GLBs. Identical contract: srcFile read, dstFile
// written, lookupIdx is `${lookupKey}|${matName}` → tile. Preview uses
// lookupKey='preview' with two entries (salonBark, salonLeaves).
export async function rewriteGLB(srcFile, dstFile, lookupKey, lookupIdx, scale = 1) {
  const doc = await io.read(srcFile)
  const root = doc.getRoot()

  // Apply variant scale (scaleOverride ?? normalizeScale) to the GLB so the
  // runtime renders at scale=1. Scale is multiplied into each scene-root
  // node's existing scale; trunk-rooted trees (the convention) stay anchored
  // at origin. Done before atlas/UV rewriting so prune doesn't drop nodes.
  if (scale !== 1) {
    for (const scene of root.listScenes()) {
      for (const node of scene.listChildren()) {
        const s = node.getScale()
        node.setScale([s[0] * scale, s[1] * scale, s[2] * scale])
      }
    }
  }

  // Single placeholder material — every primitive routes here. Atlas keeps
  // bark + leaf tiles in one image, so one material suffices and the runtime
  // sees one shader program (Bloom-stable). alphaMode=MASK with cutoff 0.5
  // works for both classifications: bark fragments are alpha=1 and always
  // pass; leaves use the cutoff as before.
  let placeholder = null
  function getPlaceholder() {
    if (placeholder) return placeholder
    placeholder = doc.createMaterial('TreeAtlas')
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)
      .setDoubleSided(true)
      .setRoughnessFactor(0.85)
      .setMetallicFactor(0.0)
      .setBaseColorFactor([1, 1, 1, 1])
    placeholder.setExtras({ atlasKind: 'unified' })
    return placeholder
  }

  // Track which UV accessors we've transformed; if a single accessor is
  // shared between primitives mapping to different tiles, we'd double-apply
  // the transform — clone for the second-and-onward consumer.
  const seenUV = new Map() // accessor → uvTransform applied
  let primCount = 0, missCount = 0
  const missed = new Set()
  for (const mesh of root.listMeshes()) {
    // Phase L Cycle 2 (per-region bark binding): the LiDAR-baked GLB
    // carries two primitives `trunkBark` / `branchBark` keyed by mesh
    // name. lidar-publish.js's LOD pass dedups them down to a single
    // shared bark material, so we can't differentiate at the material
    // level any more — but mesh.getName() survives. Resolve the region
    // here and stamp it onto primitive extras alongside atlasKind.
    const meshNameLower = (mesh.getName() || '').toLowerCase()
    const meshBarkRegion = /trunk/.test(meshNameLower) ? 'trunk'
      : /branch/.test(meshNameLower) ? 'branch'
      : null
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial()
      if (!mat) continue
      const tile = lookupIdx.get(`${lookupKey}|${mat.getName() || '<unnamed>'}`)
      if (!tile) {
        missCount++
        missed.add(mat.getName() || '<unnamed>')
        continue
      }
      const uvAttr = prim.getAttribute('TEXCOORD_0')
      if (uvAttr) {
        const prevT = seenUV.get(uvAttr)
        if (!prevT) {
          // First time we see this accessor — transform in place.
          const arr = uvAttr.getArray()
          // Make sure we have a writable typed array; replace if needed.
          const writable = (arr instanceof Float32Array) ? arr : new Float32Array(arr)
          transformUVs(writable, tile.uvTransform)
          if (writable !== arr) uvAttr.setArray(writable)
          seenUV.set(uvAttr, tile.uvTransform)
        } else if (prevT !== tile.uvTransform) {
          // Accessor was transformed for a different tile — clone, transform fresh.
          const src = uvAttr.getArray()
          // Source UVs were already mutated by prevT; we need the ORIGINAL.
          // We don't have it. Bail loudly — this is rare in practice.
          throw new Error(`shared UV accessor mapped to two different tiles in ${path.basename(srcFile)}`)
        }
      }
      prim.setMaterial(getPlaceholder())
      // atlasKind carries the tile classification ('bark' or 'leaf') —
      // load-bearing for Phase B's runtime bark retint (InstancedTrees stamps
      // a per-vertex aBark attribute from this at merge time so the fragment
      // shader can gate uBarkTintBase/jitter/roughness to bark fragments).
      const extras = { ...(prim.getExtras() || {}), atlasKind: tile.classification, atlasTileIndex: tile.tileIndex }
      if (meshBarkRegion) extras.barkRegion = meshBarkRegion
      prim.setExtras(extras)
      primCount++
    }
  }

  // Drop original materials (we've reassigned all mapped prims). Anything
  // unmapped retains its old material — detach via reassignment to the
  // single placeholder so prune cleans up.
  for (const m of root.listMaterials()) {
    if (m === placeholder) continue
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMaterial() === m) prim.setMaterial(getPlaceholder())
      }
    }
  }

  // Normalize vertex-attribute layout across every primitive to a single
  // canonical set { POSITION, NORMAL, TEXCOORD_0 }. Three.js compiles a
  // separate shader program per (material × attribute layout); inconsistent
  // attributes across variants spawn extra programs even when materials
  // share, which destabilizes Bloom past ~4 unique programs.
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      // Strip COLOR_0 — atlas materials don't sample vertex color, and its
      // presence/absence flips the USE_COLOR define per-program.
      if (prim.getAttribute('COLOR_0')) prim.setAttribute('COLOR_0', null)
      // Strip TANGENT if any GLB carries it; atlas normalmap doesn't need
      // attribute-supplied tangents.
      if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null)
      // Synthesize zero-filled TEXCOORD_0 for any prim that's missing it.
      // Without this the shader has uv undefined; with this it samples a
      // single atlas pixel (acceptable rendering for the rare miss).
      if (!prim.getAttribute('TEXCOORD_0')) {
        const pos = prim.getAttribute('POSITION')
        if (pos) {
          const uvAcc = doc.createAccessor()
            .setType('VEC2')
            .setArray(new Float32Array(pos.getCount() * 2))
          prim.setAttribute('TEXCOORD_0', uvAcc)
        }
      }
    }
  }

  // keepAttributes: true preserves TEXCOORD_0 even though our placeholder
  // materials reference no textures (atlas materials are assembled at
  // runtime; UVs map into them).
  await doc.transform(prune({ keepAttributes: true, keepIndices: true }))
  // Hero-tier dims (Azimuth): the doc is now the clean, scale-applied tree the
  // runtime renders (scale was multiplied into the node transforms above, so
  // these bounds are REAL METRES). The prominence pass reads canopyRadiusM +
  // heightM per rendered roster variant — measured here, at the stage with the
  // real input, not from publish-glb's dirty whole-scene source (finding #7).
  const bounds = computeTreeBounds(doc)
  // Impostor capture (Phase 1): the canopy-base fraction, measured by
  // separating leaf vs bark prims (atlasKind was stamped above). Tells the
  // impostor runtime how tall the bare trunk card is vs where the canopy slabs
  // stack. Cheap (one extra bbox pass) and only meaningful on the shipped tier.
  const impostor = measureCanopyBase(doc)
  await ensureDir(path.dirname(dstFile))
  await io.write(dstFile, doc)
  return { primCount, missCount, missed: [...missed], bounds, impostor }
}

// ── orchestrator ─────────────────────────────────────────────────────────
export async function bakeLook(lookName, opts = {}) {
  const { viz = true, rewrite = true } = opts
  const designPath = path.join(LOOKS_DIR, lookName, 'design.json')
  let design
  try { design = JSON.parse(await fs.readFile(designPath, 'utf8')) }
  catch (err) { return { ok: false, error: `cannot read ${designPath}: ${err.message}` } }

  const roster = Array.isArray(design.trees) ? design.trees : []
  const outDir = path.join(BAKED_DIR, lookName)

  if (roster.length === 0) {
    // Wipe any prior atlas outputs so the bake is consistent with state.
    for (const f of [
      'trees-atlas-color.png', 'trees-atlas-normal.png',
      'trees-atlas-bark-color.png', 'trees-atlas-bark-normal.png',
      'trees-atlas-leaves-color.png', 'trees-atlas-leaves-normal.png',
      'trees-atlas-bark-gradient-color.png',
      'trees-atlas-bark-detail-color.png',
      'trees-atlas-bark-posterized-color.png',
      'trees-atlas-bark-viz.png', 'trees-atlas-leaves-viz.png',
      'trees-atlas.json',
    ]) await rmrf(path.join(outDir, f))
    await rmrf(path.join(outDir, 'trees'))
    return { ok: true, lookName, skipped: true, reason: 'empty-roster', rosterSize: 0 }
  }

  await ensureDir(outDir)
  clearDocCache()

  const t0 = Date.now()
  const survey = await surveyRoster(roster, TREES_DIR)
  const tSurvey = Date.now() - t0

  const barkTiles = survey.tiles.filter(t => t.classification === 'bark')
  const leafTiles = survey.tiles.filter(t => t.classification === 'leaf')

  // Brief 2 (Holm): collect per-variant bark gradients from species
  // manifests. Authored as `manifest.json#/variants[i].bark.gradientStops`
  // by generate-salon's publish step (Salon UI's gradient editor commits
  // them through the overlay POST → compositions.json → generate-salon
  // patchManifestForSalon → variant block). Scoped to roster variants so a
  // species's unused variants don't waste atlas tiles.
  //
  // Sha1 dedup over the compiled LUT bytes — two compositions with
  // byte-identical ramps collapse to one tile in the atlas. Matches the
  // texture-tile dedup pattern atlas-survey uses for bark/leaf.
  const gradientSeenSha = new Map() // sha1 -> { key, lutBuffer, refs:[] }
  const gradientStopsByRef = new Map() // "species|variantId" -> stops array (for downstream)
  // Brief 2.1 (Birch): per-variant cross-tree hash amp authored alongside
  // gradientStops. NOT folded into the LUT sha1 dedup — two variants with
  // identical ramps but different hashAmps still share one atlas tile;
  // the amp travels as a slot field consumed by applyBarkUniforms at runtime.
  const gradientHashAmpByRef = new Map() // "species|variantId" -> number
  {
    const manifestCache = new Map()
    for (const v of roster) {
      const refKey = `${v.species}|${v.variantId}`
      if (gradientStopsByRef.has(refKey)) continue
      const mPath = path.join(TREES_DIR, v.species, 'manifest.json')
      let m = manifestCache.get(v.species)
      if (m === undefined) {
        try { m = JSON.parse(await fs.readFile(mPath, 'utf8')) }
        catch { m = null }
        manifestCache.set(v.species, m)
      }
      if (!m) continue
      const variant = m.variants?.find(x => String(x.id) === String(v.variantId))
      const stops = variant?.bark?.gradientStops
      if (!Array.isArray(stops) || stops.length < 2) continue
      gradientStopsByRef.set(refKey, stops)
      gradientHashAmpByRef.set(refKey,
        typeof variant.bark.gradientHashAmp === 'number' ? variant.bark.gradientHashAmp : 0)
      const lutBuffer = compileGradientLUT(stops)
      const sha = gradientSha1(lutBuffer)
      const existing = gradientSeenSha.get(sha)
      const ref = { species: v.species, variantId: v.variantId }
      if (existing) {
        existing.refs.push(ref)
      } else {
        gradientSeenSha.set(sha, { key: `gradient-${sha}`, lutBuffer, refs: [ref] })
      }
    }
  }
  const gradientTiles = [...gradientSeenSha.values()]

  // Brief 2.1a (Cinder): collect per-bark-ref detail maps for every species
  // in roster. Resolves each species's bark.materialRef (or trunk.materialRef
  // for region-split species) → public/textures/bark/<ref>/detail.png. Dedup
  // by bark ref so multiple species sharing Bark003 collapse to one tile.
  // Missing detail.png is skipped silently (script must be run first).
  const detailSeenRef = new Map() // barkRef -> { key, buffer, w, h, refs:[{species}] }
  const speciesPrimaryBarkRef = new Map() // species -> barkRef
  {
    const manifestCache = new Map()
    const fileCache = new Map() // barkRef -> {buffer, w, h} | null
    const speciesSeen = new Set()
    for (const v of roster) {
      if (speciesSeen.has(v.species)) continue
      speciesSeen.add(v.species)
      const mPath = path.join(TREES_DIR, v.species, 'manifest.json')
      let m = manifestCache.get(v.species)
      if (m === undefined) {
        try { m = JSON.parse(await fs.readFile(mPath, 'utf8')) }
        catch { m = null }
        manifestCache.set(v.species, m)
      }
      if (!m?.bark) continue
      // Region-split species: prefer trunk's ref (visually dominant).
      const primaryRef = m.bark.materialRef
        ?? m.bark.trunk?.materialRef
        ?? m.bark.branch?.materialRef
        ?? null
      if (!primaryRef) continue
      speciesPrimaryBarkRef.set(v.species, primaryRef)
      if (!fileCache.has(primaryRef)) {
        const detailPath = path.join(REPO_ROOT, 'public/textures/bark', primaryRef, 'detail.png')
        try {
          const buf = await fs.readFile(detailPath)
          const meta = await sharp(buf).metadata()
          fileCache.set(primaryRef, { buffer: buf, w: meta.width, h: meta.height })
        } catch {
          fileCache.set(primaryRef, null)
        }
      }
      const slot = fileCache.get(primaryRef)
      if (!slot) continue
      const existing = detailSeenRef.get(primaryRef)
      const ref = { species: v.species }
      if (existing) {
        if (!existing.refs.some(r => r.species === ref.species)) existing.refs.push(ref)
      } else {
        detailSeenRef.set(primaryRef, { key: `detail-${primaryRef}`, buffer: slot.buffer, w: slot.w, h: slot.h, refs: [ref] })
      }
    }
  }
  const detailTilesIn = [...detailSeenRef.values()]

  // Brief 10B (Vellum): collect per-bark-ref posterized substrate tiles for
  // every species in roster, mirroring the Brief 2.1a detail collection
  // above. Resolves each species's primary bark ref (trunk-wins for region-
  // split), auto-triggers extract-bark-posterized.mjs#posterizeBarkRef when
  // the source posterized.png is missing (idempotent — re-bakes no-op),
  // then reads + dedupes by bark ref into the posterized sub-atlas page.
  // First cold bake per new ref pays ~0.1-0.3s of quantization; subsequent
  // bakes are zero-latency (file exists, fs.access returns).
  const posterizedSeenRef = new Map() // barkRef -> { key, buffer, w, h, refs:[{species}] }
  {
    const fileCache = new Map() // barkRef -> {buffer, w, h} | null
    for (const [species, primaryRef] of speciesPrimaryBarkRef.entries()) {
      if (!fileCache.has(primaryRef)) {
        try {
          await ensurePosterizedForRef(primaryRef)
        } catch (err) {
          console.warn(`[bake-look] posterize auto-trigger failed for ${primaryRef}: ${err.message}`)
        }
        const postPath = path.join(REPO_ROOT, 'public/textures/bark', primaryRef, 'posterized.png')
        try {
          const buf = await fs.readFile(postPath)
          const meta = await sharp(buf).metadata()
          fileCache.set(primaryRef, { buffer: buf, w: meta.width, h: meta.height })
        } catch {
          fileCache.set(primaryRef, null)
        }
      }
      const slot = fileCache.get(primaryRef)
      if (!slot) continue
      const existing = posterizedSeenRef.get(primaryRef)
      const ref = { species }
      if (existing) {
        if (!existing.refs.some(r => r.species === ref.species)) existing.refs.push(ref)
      } else {
        posterizedSeenRef.set(primaryRef, { key: `posterized-${primaryRef}`, buffer: slot.buffer, w: slot.w, h: slot.h, refs: [ref] })
      }
    }
  }
  const posterizedTilesIn = [...posterizedSeenRef.values()]

  const t1 = Date.now()
  const bark = await bakeAtlas(barkTiles, 'bark', outDir, lookName)
  const leaves = await bakeAtlas(leafTiles, 'leaves', outDir, lookName)
  const gradient = await bakeGradientAtlas(gradientTiles, outDir, lookName)
  const detail = await bakeDetailAtlas(detailTilesIn, outDir, lookName)
  const posterized = await bakePosterizedAtlas(posterizedTilesIn, outDir, lookName)
  // Composite bark+leaves(+gradient)(+detail)(+posterized) into a single atlas
  // so the runtime can use a single shared material. Tile uvTransforms are
  // remapped into unified coordinates here.
  const unified = await unifyAtlases(bark, leaves, gradient, detail, posterized, outDir, lookName)
  const tBake = Date.now() - t1

  // Phase B (2026-05-15): gather per-species bark spec from each species's
  // manifest.json#/bark (stamped by generate-procedural → patchManifest, and
  // eventually by the Workstage Bark panel in Phase B.1). The runtime uses
  // these to drive per-draw uniforms on the shared tree material — same
  // compiled shader program for every species (Bloom-friendly), different
  // tint+jitter+roughness values uploaded per (species, draw call) via
  // onBeforeRender. The materialColors[<speciesId>] Look-level override
  // wins over barkBySpecies[<speciesId>].tintBase at runtime.
  const barkBySpecies = {}
  // Brief 3A (Cant): per-species deformer ranges surfaced from
  // manifest.json#deformer.range (written by generate-salon#patchManifestForSalon).
  // Runtime-consumed only (InstancedTrees sets per-draw uniforms) — nothing is
  // baked into the atlas or GLB, so this is a pass-through, single-spec-per-
  // species like barkBySpecies.
  const deformerBySpecies = {}
  const speciesSeen = new Set()
  for (const v of roster) {
    if (speciesSeen.has(v.species)) continue
    speciesSeen.add(v.species)
    const mPath = path.join(TREES_DIR, v.species, 'manifest.json')
    try {
      const m = JSON.parse(await fs.readFile(mPath, 'utf8'))
      if (m?.deformer?.range) {
        deformerBySpecies[v.species] = { range: m.deformer.range }
      }
      if (m?.bark) {
        // Per-region bark binding (Phase L Cycle 2): manifest.bark may
        // carry { trunk, branch, regionThreshold } (LiDAR variants) or
        // a single-spec { materialRef, ... } (procedural variants). Mirror
        // whichever shape is on disk so the runtime resolves both via the
        // same channel; InstancedTrees picks trunk/branch by aBarkRegion
        // when present, falls back to legacy single-spec when not.
        const flatten = (spec) => ({
          materialRef: spec.materialRef ?? null,
          uvScale: spec.uvScale ?? [1, 1],
          tintBase: spec.tintBase ?? '#ffffff',
          tintJitterRange: typeof spec.tintJitterRange === 'number' ? spec.tintJitterRange : 0,
          roughnessOverride: typeof spec.roughnessOverride === 'number' ? spec.roughnessOverride : -1,
        })
        if (m.bark.trunk || m.bark.branch) {
          barkBySpecies[v.species] = {
            trunk: m.bark.trunk ? flatten(m.bark.trunk) : null,
            branch: m.bark.branch ? flatten(m.bark.branch) : null,
            regionThreshold: typeof m.bark.regionThreshold === 'number' ? m.bark.regionThreshold : null,
          }
        } else {
          barkBySpecies[v.species] = flatten(m.bark)
        }
      }
    } catch { /* species without a manifest.json — skip silently */ }
  }

  // Brief 2 (Holm): per-variant gradient slot index. Maps every
  // (species, variantId) in the roster that authored gradientStops to the
  // unified-atlas uvTransform of its LUT tile. The runtime
  // (`InstancedTrees.jsx#applyBarkUniforms`) reads this to set
  // `uBarkGradientTileOffset/Scale` per draw and flip `uUseBarkGradient=1`.
  // Variants without an entry render through the legacy single-tint path,
  // preserving Brief 1.5a back-compat.
  const barkGradientByVariant = {}
  for (const gt of unified?.gradientTiles || []) {
    for (const ref of gt.refs) {
      if (!barkGradientByVariant[ref.species]) barkGradientByVariant[ref.species] = {}
      // Brief 2.1: hashAmp travels per-(species, variantId) — two variants
      // sharing one deduped LUT tile may still carry different amps.
      const amp = gradientHashAmpByRef.get(`${ref.species}|${ref.variantId}`) ?? 0
      barkGradientByVariant[ref.species][ref.variantId] = {
        offsetU: gt.uvTransform.offsetU,
        offsetV: gt.uvTransform.offsetV,
        scaleU: gt.uvTransform.scaleU,
        scaleV: gt.uvTransform.scaleV,
        hashAmp: amp,
      }
    }
  }

  // Brief 2.1a (Cinder): per-species detail uvTransform. Each detail tile
  // covers one bark ref; expand `refs:[{species}]` into per-species slots.
  // Also emit `barkTileUV` (the species's primary bark tile uvTransform in
  // unified-atlas space) so the runtime shader can recover local-UV from
  // vMapUv before mapping into the detail tile — vMapUv alone ranges only
  // over the bark sub-region, so the brief's `vMapUv * detailScale +
  // detailOffset` would alias to a tiny corner of the detail map. See
  // arborist/NOTES.md (Cinder, 2026-05-21) for the correction rationale.
  // For region-split species we use the trunk tile (consistent with detail).
  const barkDetailBySpecies = {}
  // Build species → primary bark tile uvTransform lookup from the unified
  // tiles. We match species via tile.refs[].species + the resolved
  // primary bark ref's matName encoded by atlas-survey.
  const tileBySpeciesBark = new Map() // species -> uvTransform (first bark match)
  for (const t of unified?.tiles || []) {
    if (t.classification !== 'bark') continue
    for (const ref of t.refs) {
      if (!tileBySpeciesBark.has(ref.species)) {
        tileBySpeciesBark.set(ref.species, t.uvTransform)
      }
    }
  }
  // Impostor capture (Phase 1, Hero): the leaf-tile UV rect parallels the bark
  // one. The impostor's canopy slabs sample the LEAF rect, the trunk card the
  // BARK rect — the SAME unified-atlas pixels the near trees use, so the
  // impostor color/normal/season match the real geometry for free (see
  // bake-impostors.js). Built here so impostorBySpecies can ride into the
  // manifest; per-species trunkFrac is filled during the GLB rewrite loop below.
  const tileBySpeciesLeaf = new Map() // species -> uvTransform (first leaf match)
  for (const t of unified?.tiles || []) {
    if (t.classification !== 'leaf') continue
    for (const ref of t.refs) {
      if (!tileBySpeciesLeaf.has(ref.species)) {
        tileBySpeciesLeaf.set(ref.species, t.uvTransform)
      }
    }
  }
  for (const dt of unified?.detailTiles || []) {
    const slot = {
      offsetU: dt.uvTransform.offsetU,
      offsetV: dt.uvTransform.offsetV,
      scaleU: dt.uvTransform.scaleU,
      scaleV: dt.uvTransform.scaleV,
    }
    for (const ref of dt.refs) {
      const barkTileUV = tileBySpeciesBark.get(ref.species)
      if (!barkTileUV) continue
      barkDetailBySpecies[ref.species] = { uvTransform: slot, barkTileUV }
    }
  }

  // Brief 10B (Vellum): per-species posterized substrate uvTransform. The
  // runtime reads this to set uBarkPosterizedTileScale/Offset per draw — at
  // tier ≤ 1 it resamples the posterized region instead of vendor color via
  // localUV. Same shape + key convention as barkDetailBySpecies (re-uses
  // tileBySpeciesBark since the local-UV recovery rides the same bark tile
  // bounds the detail layer already needs).
  const barkPosterizedBySpecies = {}
  for (const pt of unified?.posterizedTiles || []) {
    const slot = {
      offsetU: pt.uvTransform.offsetU,
      offsetV: pt.uvTransform.offsetV,
      scaleU: pt.uvTransform.scaleU,
      scaleV: pt.uvTransform.scaleV,
    }
    for (const ref of pt.refs) {
      const barkTileUV = tileBySpeciesBark.get(ref.species)
      if (!barkTileUV) continue
      barkPosterizedBySpecies[ref.species] = { uvTransform: slot, barkTileUV }
    }
  }

  // Hero-tier canopy dims (Azimuth) — real-metre { heightM, canopyRadiusM } per
  // rendered roster variant (species → variantId), consumed by bake-trees'
  // prominence pass. Declared here so the manifest holds the reference; the GLB
  // rewrite loop below MUTATES this object (dims are measured from the clean
  // scale-applied lod2 GLB), and the manifest is written AFTER that loop. When
  // rewrite=false (atlas-only rebuild) the GLBs are untouched → carry forward
  // the prior manifest's dims rather than dropping them.
  let canopyByVariant = {}
  // Impostor trunk-frac per species, filled from the lod2 rewrite below
  // (parallel to canopyByVariant). species -> trunkFrac (canopy-base ÷ height).
  const impostorTrunkFracBySpecies = {}
  if (!rewrite) {
    try {
      const prior = JSON.parse(await fs.readFile(path.join(outDir, 'trees-atlas.json'), 'utf8'))
      canopyByVariant = prior.canopyByVariant || {}
      // Carry forward prior impostor trunk-fracs on an atlas-only rebuild
      // (GLBs untouched → can't re-measure).
      for (const [sp, rec] of Object.entries(prior.impostorBySpecies || {})) {
        if (rec?.trunkFrac != null) impostorTrunkFracBySpecies[sp] = rec.trunkFrac
      }
    } catch { /* no prior manifest */ }
  }

  // Manifest
  const tilesByKey = {}
  for (const t of unified?.tiles || []) tilesByKey[t.key] = t
  // Single shared material settings: alphaTest=0.5 with alphaToCoverage at
  // runtime works for both classifications because bark fragments are
  // always alpha=1 (always pass), leaves use the cutoff as before.
  const manifest = {
    generatedAt: new Date().toISOString(),
    lookName,
    rosterSize: roster.length,
    materialDefaults: { roughness: 0.85, metalness: 0.0 },
    atlas: unified ? {
      width: unified.width, height: unified.height,
      colorPath: unified.colorPath, normalPath: unified.normalPath,
      alphaMode: 'MASK', alphaCutoff: 0.5, alphaTest: 0.5,
      doubleSided: true,
    } : null,
    tiles: unified?.tiles || [],
    tilesByKey,
    barkBySpecies,
    barkGradientByVariant,
    barkDetailBySpecies,
    barkPosterizedBySpecies,
    deformerBySpecies,
    // Hero-tier canopy dims (Azimuth) — real-metre bounding sphere per rendered
    // roster variant, consumed by bake-trees' prominence pass. {species:{variantId:
    // {heightM, canopyRadiusM}}}. Measured from the clean scale-applied lod2 GLB.
    canopyByVariant,
  }
  // NB: trees-atlas.json is written AFTER the GLB rewrite loop below, so the
  // freshly-measured canopyByVariant dims land in it (the loop mutates the
  // object the manifest holds).

  // Overhead browse-impostor snapshots (overheadBySpecies) are authored ONLY in
  // the browser — the Salon Browse capture POSTs them to serve.js, which writes
  // the band PNGs under trees/overhead/<species>/ and merges the manifest entry.
  // The CLI has no way to regenerate them, so — UNLIKE impostorBySpecies, which
  // captureImpostor re-derives above — bake-look must ALWAYS carry the prior
  // field forward, on rewrite AND atlas-only bakes. Otherwise every re-bake
  // rebuilds the manifest without it and browse silently degrades to the
  // hero-culled MESH group (the "missing trees" swath). The on-disk PNGs already
  // survive a bake untouched; this preserves the manifest that points at them.
  // (Fixes the serve.js:~1431 TODO at its source.)
  try {
    const priorAtlas = JSON.parse(await fs.readFile(path.join(outDir, 'trees-atlas.json'), 'utf8'))
    if (priorAtlas.overheadBySpecies) manifest.overheadBySpecies = priorAtlas.overheadBySpecies
    // HERO canopy-impostor (heroImpostorBySpecies) — same trapdoor as overhead:
    // browser-authored (HeroImpostorBaker POSTs to serve.js), CLI can't regenerate
    // it, so carry it forward on EVERY bake or a re-bake silently drops the field.
    if (priorAtlas.heroImpostorBySpecies) manifest.heroImpostorBySpecies = priorAtlas.heroImpostorBySpecies
  } catch { /* no prior manifest (first bake) — nothing to preserve */ }

  // Optional viz (uses raw grid w/h, not pow2)
  let tViz = 0
  if (viz) {
    const v0 = Date.now()
    await buildViz(barkTiles, bark, 'bark', outDir)
    await buildViz(leafTiles, leaves, 'leaves', outDir)
    tViz = Date.now() - v0
  }

  // Build (species|variantId|matName) → tile lookup for rewriter
  const lookupIdx = new Map()
  for (const tile of manifest.tiles) {
    for (const ref of tile.refs) lookupIdx.set(`${ref.species}|${ref.variantId}|${ref.matName}`, tile)
  }

  // Resolve per-variant scale from manifest.json: scaleOverride wins,
  // otherwise normalizeScale. Default 1 if neither is set. Baked into the
  // rewritten GLB so runtime renders at scale=1.
  const variantScale = new Map()
  const manifestCache = new Map()
  for (const v of survey.perVariant) {
    if (!manifestCache.has(v.species)) {
      const mPath = path.join(TREES_DIR, v.species, 'manifest.json')
      try { manifestCache.set(v.species, JSON.parse(await fs.readFile(mPath, 'utf8'))) }
      catch { manifestCache.set(v.species, null) }
    }
    const m = manifestCache.get(v.species)
    const vEntry = m?.variants?.find(x => x.id === v.variantId)
    const scale = vEntry?.scaleOverride ?? vEntry?.normalizeScale ?? 1
    variantScale.set(`${v.species}|${v.variantId}`, scale)
  }

  // Rewrite GLBs into per-Look path
  const rewriteStats = []
  let tRewrite = 0
  if (rewrite) {
    const r0 = Date.now()
    // Wipe any prior rewritten tree dir for this Look so stale variants don't linger.
    await rmrf(path.join(outDir, 'trees'))
    for (const v of survey.perVariant) {
      const scale = variantScale.get(`${v.species}|${v.variantId}`) ?? 1
      for (const lod of LODS) {
        const src = path.join(TREES_DIR, v.species, `skeleton-${v.variantId}-${lod}.glb`)
        const dst = path.join(outDir, 'trees', v.species, `skeleton-${v.variantId}-${lod}.glb`)
        try {
          const r = await rewriteGLB(src, dst, `${v.species}|${v.variantId}`, lookupIdx, scale)
          rewriteStats.push({ species: v.species, variantId: v.variantId, lod, scale, ...r })
          // Capture dims from the SHIPPED tier (lod2) — what the runtime renders.
          if (lod === 'lod2' && r.bounds?.canopyRadiusM != null) {
            ;(canopyByVariant[v.species] ||= {})[v.variantId] = {
              heightM: r.bounds.heightM,
              canopyRadiusM: r.bounds.canopyRadiusM,
            }
          }
          // Impostor (Phase 1): capture the canopy-base fraction from the same
          // shipped tier. One per species (first variant wins) — the impostor
          // is a per-species cheap proxy, not per-variant.
          if (lod === 'lod2' && r.impostor && impostorTrunkFracBySpecies[v.species] == null) {
            impostorTrunkFracBySpecies[v.species] = r.impostor.trunkFrac
          }
        } catch (err) {
          rewriteStats.push({ species: v.species, variantId: v.variantId, lod, error: err.message })
        }
      }
    }
    tRewrite = Date.now() - r0
  }

  // ── Impostor manifest (Phase 1, Hero) ─────────────────────────────────────
  // Assemble per-species impostor records now that the rewrite loop has filled
  // trunkFrac + canopyByVariant. Each record carries the bark/leaf atlas UV
  // rects (so the runtime samples the SAME unified atlas the near trees use) +
  // the per-season layer plans. Consumed by ImpostorTrees at runtime, keyed by
  // species (impostors are a cheap per-species proxy, not per-variant).
  // bake-impostors.js documents the full approach + Phase-1 tradeoffs.
  const impostorBySpecies = {}
  const speciesSet = new Set([
    ...tileBySpeciesBark.keys(),
    ...tileBySpeciesLeaf.keys(),
  ])
  for (const species of speciesSet) {
    const barkUV = tileBySpeciesBark.get(species) || null
    const leafUV = tileBySpeciesLeaf.get(species) || null
    if (!barkUV && !leafUV) continue
    // Representative dims: the first variant's measured canopy bounds.
    const vars = canopyByVariant[species] || {}
    const firstDims = Object.values(vars)[0] || {}
    const trunkFrac = impostorTrunkFracBySpecies[species] ?? 0.35
    impostorBySpecies[species] = captureImpostor({
      species,
      variantId: Object.keys(vars)[0] != null ? Number(Object.keys(vars)[0]) : null,
      heightM: firstDims.heightM ?? null,
      canopyRadiusM: firstDims.canopyRadiusM ?? null,
      trunkFrac,
      barkRect: barkUV ? { offsetU: barkUV.offsetU, offsetV: barkUV.offsetV, scaleU: barkUV.scaleU, scaleV: barkUV.scaleV } : null,
      leafRect: leafUV ? { offsetU: leafUV.offsetU, offsetV: leafUV.offsetV, scaleU: leafUV.scaleU, scaleV: leafUV.scaleV } : null,
    })
  }
  manifest.impostorBySpecies = impostorBySpecies

  // ── Opaque-articulated manifest (Phase B, 2026-06-25) ─────────────────────
  // The MIDDLE tier of the 3-tier depth model. Reuses the exact same per-species
  // measurements the impostor record uses (heightM, canopyRadiusM, trunkFrac,
  // leafRect) to emit a canopy-shell ellipsoid spec. The runtime (OpaqueSpecies)
  // keeps the REAL bark prims of the species' lod GLB (articulated trunk/branches)
  // and adds ONE solid OPAQUE leaf-textured hull (early-Z → ~zero overdraw, the
  // real fix for the near-but-not-front trees). bake-impostors.js documents the
  // approach. Keyed by species (one shell per species, instanced across placements).
  const opaqueBySpecies = {}
  for (const species of speciesSet) {
    const leafUV = tileBySpeciesLeaf.get(species) || null
    if (!leafUV) continue   // no foliage rect → no canopy shell (e.g. winter-only/bare ref)
    const vars = canopyByVariant[species] || {}
    const firstDims = Object.values(vars)[0] || {}
    const trunkFrac = impostorTrunkFracBySpecies[species] ?? 0.35
    opaqueBySpecies[species] = captureOpaque({
      species,
      heightM: firstDims.heightM ?? null,
      canopyRadiusM: firstDims.canopyRadiusM ?? null,
      trunkFrac,
      leafRect: { offsetU: leafUV.offsetU, offsetV: leafUV.offsetV, scaleU: leafUV.scaleU, scaleV: leafUV.scaleV },
    })
  }
  manifest.opaqueBySpecies = opaqueBySpecies

  // Write the manifest now that the rewrite loop has populated canopyByVariant
  // (the loop mutated the object the manifest object holds a reference to).
  await fs.writeFile(path.join(outDir, 'trees-atlas.json'), JSON.stringify(manifest, null, 2))

  return {
    ok: true,
    lookName,
    skipped: false,
    rosterSize: roster.length,
    tiles: { bark: barkTiles.length, leaf: leafTiles.length, total: survey.tiles.length },
    atlas: {
      bark: bark ? `${bark.width}×${bark.height}` : null,
      leaves: leaves ? `${leaves.width}×${leaves.height}` : null,
    },
    rewrite: rewrite ? { glbsWritten: rewriteStats.filter(s => !s.error).length, errors: rewriteStats.filter(s => s.error) } : null,
    timings: { survey: tSurvey, bake: tBake, viz: tViz, rewrite: tRewrite, total: Date.now() - t0 },
  }
}

// CLI
const isCli = import.meta.url === `file://${process.argv[1]}`
if (isCli) {
  const args = process.argv.slice(2)
  const lookIdx = args.indexOf('--look')
  if (lookIdx === -1) {
    console.error('Usage: node arborist/bake-look.js --look <name> [--no-viz] [--no-rewrite]')
    process.exit(2)
  }
  const lookName = args[lookIdx + 1]
  const viz = !args.includes('--no-viz')
  const rewrite = !args.includes('--no-rewrite')
  bakeLook(lookName, { viz, rewrite }).then(r => {
    console.log(JSON.stringify(r, null, 2))
    if (!r.ok) process.exit(1)
  }).catch(err => { console.error(err); process.exit(1) })
}
