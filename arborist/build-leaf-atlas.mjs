/**
 * build-leaf-atlas.mjs — compose a varied tile-grid atlas for each scanned vendor
 * leaf pack, so the synth leaf path (generate-salon.js) shows DISTINCT leaves
 * across the canopy (it picks a random tile per card) instead of 35 copies of one
 * scan. Sources the hi-res scans in assets/leaf-packs-2026/<pack>/ (gitignored);
 * writes public/textures/leaves/shapes/<pack>/shape.png + sets meta.tileGrid.
 *
 * Run: node arborist/build-leaf-atlas.mjs
 */
import sharp from 'sharp'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const SRC = 'assets/leaf-packs-2026'
const OUT = 'public/textures/leaves/shapes'
const TILE = 1024          // px per tile (1024 → a 2×2 atlas is 2048², ~street-res per leaf)
const COLS = 2, ROWS = 2   // 4 distinct leaves per pack
const PACKS = ['american_sweetgum', 'ginkgo', 'bigleaf_maple', 'sycamore', 'california_black_oak', 'eastern_black_oak']
const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

for (const pack of PACKS) {
  const dir = join(SRC, pack)
  if (!existsSync(dir)) { console.log('skip (no source):', pack); continue }
  const scans = readdirSync(dir, { recursive: true })
    .filter(f => f.endsWith('.png') && !f.split('/').pop().startsWith('._') && !/_oc\.png$/i.test(f))
    .sort()
  if (scans.length < COLS * ROWS) { console.log('skip (too few scans):', pack, scans.length); continue }
  // pick COLS*ROWS scans evenly spaced across the pack for variety
  const pick = Array.from({ length: COLS * ROWS }, (_, i) => scans[Math.floor(i * scans.length / (COLS * ROWS))])
  const composites = []
  for (let i = 0; i < pick.length; i++) {
    const buf = await sharp(join(dir, pick[i]))
      .resize(TILE, TILE, { fit: 'contain', background: transparent })
      .png().toBuffer()
    composites.push({ input: buf, left: (i % COLS) * TILE, top: Math.floor(i / COLS) * TILE })
  }
  await sharp({ create: { width: COLS * TILE, height: ROWS * TILE, channels: 4, background: transparent } })
    .composite(composites).png().toFile(join(OUT, pack, 'shape.png'))

  const metaP = join(OUT, pack, 'meta.json')
  const meta = JSON.parse(readFileSync(metaP, 'utf8'))
  meta.tileGrid = [COLS, ROWS]
  meta.source = { ...(meta.source || {}), atlas: `${COLS}×${ROWS} from ${pick.length} scans`, atlasScans: pick }
  writeFileSync(metaP, JSON.stringify(meta, null, 2) + '\n')
  console.log(`✓ ${pack} → ${COLS}×${ROWS} atlas (${pick.join(', ')})`)
}
