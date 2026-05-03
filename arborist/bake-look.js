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
import { surveyRoster } from './atlas-survey.js'
import { packSkyline } from './atlas-pack.js'

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
async function unifyAtlases(bark, leaves, outDir, lookName) {
  if (!bark && !leaves) return null

  // Pack the two sub-atlas pages as rects; skyline picks side-by-side or
  // stacked based on which wastes less. No fixed gutter here — sub-atlas
  // edges are already mip-safe (the sub-atlases include alpha=0 / flat
  // normal background past their packed content).
  const pages = []
  if (bark)   pages.push({ kind: 'bark',   src: bark,   w: bark.width,   h: bark.height })
  if (leaves) pages.push({ kind: 'leaves', src: leaves, w: leaves.width, h: leaves.height })
  const pack = packSkyline(pages.map(p => ({ w: p.w, h: p.h })), { maxWidth: MAX_ATLAS_WIDTH })
  const unifiedW = Math.max(pack.width, 1)
  const unifiedH = Math.max(pack.height, 1)
  pages.forEach((p, i) => { p.x = pack.placements[i].x; p.y = pack.placements[i].y })
  const placedBark = pages.find(p => p.kind === 'bark')
  const placedLeaves = pages.find(p => p.kind === 'leaves')

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

  return {
    width: unifiedW,
    height: unifiedH,
    colorPath: `/baked/${lookName}/trees-atlas-color.png`,
    normalPath: `/baked/${lookName}/trees-atlas-normal.png`,
    tiles,
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

async function rewriteGLB(srcFile, dstFile, lookupKey, lookupIdx, scale = 1) {
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
      prim.setExtras({ ...(prim.getExtras() || {}), atlasKind: 'unified', atlasTileIndex: tile.tileIndex })
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
  await ensureDir(path.dirname(dstFile))
  await io.write(dstFile, doc)
  return { primCount, missCount, missed: [...missed] }
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

  const t1 = Date.now()
  const bark = await bakeAtlas(barkTiles, 'bark', outDir, lookName)
  const leaves = await bakeAtlas(leafTiles, 'leaves', outDir, lookName)
  // Composite bark+leaves into a single atlas so the runtime can use a
  // single shared material. Tile uvTransforms are remapped into unified
  // coordinates here.
  const unified = await unifyAtlases(bark, leaves, outDir, lookName)
  const tBake = Date.now() - t1

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
  }
  await fs.writeFile(path.join(outDir, 'trees-atlas.json'), JSON.stringify(manifest, null, 2))

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
        } catch (err) {
          rewriteStats.push({ species: v.species, variantId: v.variantId, lod, error: err.message })
        }
      }
    }
    tRewrite = Date.now() - r0
  }

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
