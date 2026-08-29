/**
 * pack-impostor-ktx2.mjs — the KTX2/Basis fold-in at slab-packing that three code
 * comments have promised for months (OverheadBaker.jsx:70, HeroImpostorBaker.jsx:60,
 * captureImpostor.js:578) and that nothing performed.
 *
 * ⭐ WHY IT IS THE IMPOSTOR POOL AND NOT THE ATLAS. Measured 2026-08-28: a town's
 * textures are 106.8 MB / 260 MP, of which the hero+overhead impostor pool is 70 MB.
 * PNG is a FILE format — the GPU cannot read it, so every page is decompressed to raw
 * RGBA on upload: 260 MP × 4 bytes × mips ≈ 1,319 MB of VRAM against ~107 MB on the
 * wire. That 12× multiplier is what makes the embed unusable on a phone. ETC1S
 * transcodes to the device's native block format and STAYS compressed: ~1 byte/px.
 *
 * ⛔ THE ATLAS IS DELIBERATELY EXCLUDED. `treeAtlasMaterial#loadTexture` builds a CPU
 * COVERAGE-PRESERVING MIP CHAIN for the leaf atlas (`scaleAlphaToCoverage`) so the far
 * canopy keeps its silhouette "instead of eroding to specks". You cannot run that pass
 * on a compressed texture — its mips live in the file — and basisu's own mip filter is
 * the plain box filter that erosion pass exists to correct. Converting the atlas would
 * silently reintroduce the defect the chain was written to fix. It needs pre-generated
 * coverage-preserving levels fed to the encoder as explicit mips; that is its own job.
 *
 * ⭐ ETC1S over UASTC, measured on maple_silver's az0_leaf0 (1024², 4.4% opaque — the
 * roster's hardest silhouette): both flip ~10% of silhouette pixels at alphaTest 0.5,
 * but 96% of those are a ONE-PIXEL boundary wobble; interior specks are 202 (ETC1S) vs
 * 181 (UASTC) out of 1,048,576 — 0.02%. Alpha is a non-issue in both. The real
 * difference is colour (mean |dRGB| 10.7 vs 5.1) and ETC1S is half the size.
 * ⛔ VRAM IS IDENTICAL EITHER WAY — both land in a 4×4 block format — so the format
 * choice is purely wire-size vs hue, never memory.
 *
 * ⚠️ -y_flip IS LOAD-BEARING. TextureLoader defaults to flipY=true and three CANNOT
 * flip a compressed texture at upload, so the flip has to happen at encode or every
 * card renders upside down.
 *
 *   node arborist/pack-impostor-ktx2.mjs [--look=<id>] [--check]
 *
 * --check reports what would change and exits 2 if any declared .ktx2 is missing.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const args = process.argv.slice(2)
const CHECK = args.includes('--check')
const look = (args.find(a => a.startsWith('--look=')) || '--look=lafayette-square').split('=')[1]

const LOOK_DIR = path.join(ROOT, 'public/baked', look)
const ATLAS = path.join(LOOK_DIR, 'trees-atlas.json')
if (!existsSync(ATLAS)) { console.error(`[pack-ktx2] no trees-atlas.json for '${look}'`); process.exit(1) }

// ⛔ The encoder is a HARD requirement, not an optional accelerator. Silently
// skipping would leave the manifest pointing at .ktx2 files that do not exist.
try { execFileSync('basisu', ['-version'], { stdio: 'ignore' }) }
catch { console.error('[pack-ktx2] `basisu` not on PATH — install it (brew install basis_universal). Refusing to rewrite paths without an encoder.'); process.exit(1) }

const manifest = JSON.parse(readFileSync(ATLAS, 'utf8'))
let encoded = 0, reused = 0, missing = 0, pngBytes = 0, ktxBytes = 0

// Every page path the manifest declares, wherever it lives in the two records.
function* pagePaths(m) {
  for (const rec of Object.values(m.heroImpostorBySpecies || {})) for (const l of rec.layers || []) yield [l, 'albedo'], yield [l, 'ao']
  for (const rec of Object.values(m.overheadBySpecies || {})) for (const b of rec.bands || []) yield [b, 'albedo'], yield [b, 'ao']
}

for (const [holder, key] of pagePaths(manifest)) {
  const declared = holder[key]
  if (!declared || typeof declared !== 'string') continue
  if (declared.endsWith('.ktx2')) { reused++; continue }
  const rel = declared.replace(/^\//, '')
  const src = path.join(LOOK_DIR, rel)
  if (!existsSync(src)) { console.warn(`[pack-ktx2] ⛔ declared page missing on disk: ${declared}`); missing++; continue }
  const out = src.replace(/\.png$/i, '.ktx2')
  if (!CHECK && (!existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs)) {
    // ETC1S (basisu's default mode) + y_flip + mipmaps. -q 255 is the top ETC1S
    // quality level; the pool is authored once and served forever, so encode time
    // is irrelevant and quality is not.
    execFileSync('basisu', ['-ktx2', '-y_flip', '-mipmap', '-q', '255', '-file', src, '-output_file', out], { stdio: 'ignore' })
    encoded++
  }
  if (existsSync(out)) { pngBytes += statSync(src).size; ktxBytes += statSync(out).size }
  else { missing++; continue }
  holder[key] = declared.replace(/\.png$/i, '.ktx2')
}

if (missing && CHECK) {
  console.error(`[pack-ktx2] ⛔ ${missing} declared page(s) have no encoded .ktx2 — the manifest would point at nothing.`)
  process.exit(2)
}
if (!CHECK) writeFileSync(ATLAS, JSON.stringify(manifest, null, 2) + '\n')
const mb = (b) => (b / 1048576).toFixed(1)
console.log(`[pack-ktx2] ${look}: ${encoded} encoded, ${reused} already ktx2, ${missing} missing`)
console.log(`[pack-ktx2] pages: ${mb(pngBytes)} MB PNG → ${mb(ktxBytes)} MB KTX2` + (pngBytes ? `  (${(pngBytes / Math.max(1, ktxBytes)).toFixed(1)}× smaller)` : ''))
if (!CHECK) console.log(`[pack-ktx2] manifest rewritten: ${path.relative(ROOT, ATLAS)}`)
