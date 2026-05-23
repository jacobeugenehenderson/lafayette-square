// Brief 1.5e — Leaf Pack Library Expansion (baby: Fern)
//
// Deterministic compositor: vendor Color RGB + Opacity alpha → 1024x1024 RGBA
// shape.png per pack at public/textures/leaves/shapes/<pack>/shape.png.
//
// Matches Sequoia's Brief 1.5a method byte-for-byte (verified by stats on
// LeafSet010 → palmate). Re-running this script on an unchanged vendor trove
// produces byte-identical PNGs.
//
// Run: node scratch/compose-leaf-packs.mjs

import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const ASSETS = 'assets/botanical-reference-hires'
const OUT = 'public/textures/leaves/shapes'
const SIZE = 1024

// pack-id → { vendor source dir, morphology, naturalSize (cm), recommendedSpecies }
const PACKS = {
  palmate:        { src: 'LeafSet010', morphology: 'palmate',         naturalSize: 10, recommendedSpecies: ['acer_saccharum', 'acer_rubrum', 'platanus_occidentalis'] },
  lobed:          { src: 'LeafSet016', morphology: 'lobed',           naturalSize: 12, recommendedSpecies: ['quercus_alba', 'quercus_rubra'] },
  ovate:          { src: 'LeafSet005', morphology: 'ovate',           naturalSize: 8,  recommendedSpecies: ['morus_alba', 'cornus_florida', 'hydrangea_macrophylla'] },
  serrate_ovate:  { src: 'LeafSet001', morphology: 'serrate_ovate',   naturalSize: 8,  recommendedSpecies: ['ulmus_americana', 'carpinus_caroliniana'] },
  heart:          { src: 'LeafSet004', morphology: 'heart',           naturalSize: 10, recommendedSpecies: ['cercis_canadensis', 'syringa_vulgaris'] },
  elm_autumn:     { src: 'LeafSet007', morphology: 'seasonal_elm',    naturalSize: 8,  recommendedSpecies: ['ulmus_americana'] },
  oak_autumn:     { src: 'LeafSet012', morphology: 'seasonal_oak',    naturalSize: 12, recommendedSpecies: ['quercus_alba', 'quercus_rubra'] },
  lanceolate:     { src: 'LeafSet013', morphology: 'lanceolate',      naturalSize: 8,  recommendedSpecies: ['salix_alba', 'salix_babylonica'] },
  long_needle:    { src: 'LeafSet019', morphology: 'long_needle',     naturalSize: 15, recommendedSpecies: ['pinus_strobus', 'larix_decidua'] },
  ovate_large:    { src: 'Leaf001',    morphology: 'ovate_large',     naturalSize: 15, recommendedSpecies: ['morus_alba', 'hydrangea_macrophylla', 'magnolia_grandiflora'] },
}

async function writeIfChanged(p, bytes) {
  try {
    const cur = await fs.readFile(p)
    if (cur.equals(bytes)) {
      // touch mtime for downstream dependency tracking
      const now = new Date()
      await fs.utimes(p, now, now)
      return 'unchanged'
    }
  } catch { /* missing */ }
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, bytes)
  return 'written'
}

async function composePack(packId, spec) {
  // Don't stomp Sequoia's existing 3 packs (palmate / lobed / ovate). Their
  // shape.png bytes are load-bearing for any downstream cache that has
  // already hashed them; sharp's PNG encoder isn't byte-deterministic across
  // versions, and LeafSet005's non-square source crops differently here than
  // Sequoia's recipe. Sidecar meta.json gets written either way.
  const shapePath = path.join(OUT, packId, 'shape.png')
  try {
    const existing = await fs.readFile(shapePath)
    return {
      packId,
      sha1: crypto.createHash('sha1').update(existing).digest('hex'),
      bytes: existing.length,
      status: 'skip-existing',
    }
  } catch { /* missing — compose */ }

  const colorJpg = path.join(ASSETS, spec.src, `${spec.src}_4K-JPG_Color.jpg`)
  const opacityJpg = path.join(ASSETS, spec.src, `${spec.src}_4K-JPG_Opacity.jpg`)

  const color = await sharp(colorJpg).resize(SIZE, SIZE).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const opacity = await sharp(opacityJpg).resize(SIZE, SIZE).grayscale().raw().toBuffer({ resolveWithObject: true })

  const png = await sharp(color.data, { raw: color.info })
    .joinChannel(opacity.data, { raw: opacity.info })
    .png()
    .toBuffer()

  const sha1 = crypto.createHash('sha1').update(png).digest('hex')
  const status = await writeIfChanged(shapePath, png)
  return { packId, sha1, bytes: png.length, status }
}

async function writeMeta(packId, spec) {
  const meta = {
    morphology: spec.morphology,
    naturalSize: spec.naturalSize,
    recommendedSpecies: spec.recommendedSpecies,
    source: {
      vendor: 'botanical-reference-hires',
      pack: spec.src,
    },
  }
  // canonical 2-space JSON, trailing newline — stable across re-runs
  const bytes = Buffer.from(JSON.stringify(meta, null, 2) + '\n', 'utf8')
  return await writeIfChanged(path.join(OUT, packId, 'meta.json'), bytes)
}

const results = []
for (const [packId, spec] of Object.entries(PACKS)) {
  const r = await composePack(packId, spec)
  const m = await writeMeta(packId, spec)
  results.push({ ...r, meta: m })
}

const seen = new Map()
let dupes = 0
for (const r of results) {
  if (seen.has(r.sha1)) { dupes++; console.warn('DUP sha1', r.packId, '==', seen.get(r.sha1)) }
  else seen.set(r.sha1, r.packId)
}

let total = 0
for (const r of results) {
  total += r.bytes
  console.log(`  ${r.packId.padEnd(16)} ${r.status.padEnd(10)} ${(r.bytes/1024).toFixed(1).padStart(7)} KB  sha1=${r.sha1.slice(0,12)}  meta=${r.meta}`)
}
console.log(`\nTotal: ${(total/1024/1024).toFixed(2)} MB across ${results.length} packs, ${dupes} duplicate(s)`)
