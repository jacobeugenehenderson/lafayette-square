/**
 * extract-bark-posterized.mjs — Brief 10B (Vellum) bark substrate posterization.
 *
 * For each bark ref under public/textures/bark/<ref>/, read color.jpg, quantize
 * to N colors via sharp's libimagequant-backed palette PNG encoder (median-cut
 * + Floyd–Steinberg dither at configurable strength), resize to tileSize, write
 * posterized.png alongside color.jpg + normal.jpg + roughness.jpg + detail.png.
 *
 * Output: indexed PNG. sharp's composite/raw decode handles indexed input
 * transparently — bake-look.js + salon-preview-atlas.js read it as a normal
 * tile buffer and the atlas pipeline never sees the palette.
 *
 * Two entry-points:
 *   - CLI:        node arborist/extract-bark-posterized.mjs
 *   - Library:    import { posterizeBarkRef } from './extract-bark-posterized.mjs'
 *
 * bake-look.js (full LS bake) and salon-preview-atlas.js (per-composition
 * preview) both call posterizeBarkRef(ref) when posterized.png is missing for
 * a ref they need — first cold bake per ref pays ~1–3s of quantization; all
 * subsequent runs are zero-latency.
 *
 * Defaults live in posterize-defaults.json (operator-tunable, hand-authored)
 * with a posterize-defaults.defaults.json immutable backstop. perBarkRef map
 * lets specific refs override colors / tileSize / ditherStrength.
 */
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const BARK_DIR = path.join(REPO_ROOT, 'public/textures/bark')
const DEFAULTS_PATH = path.join(__dirname, 'posterize-defaults.json')

let _defaultsCache = null
async function loadDefaults() {
  if (_defaultsCache) return _defaultsCache
  try {
    const raw = await fs.readFile(DEFAULTS_PATH, 'utf8')
    _defaultsCache = JSON.parse(raw)
  } catch {
    _defaultsCache = { colors: 32, tileSize: 256, ditherStrength: 0.5, perBarkRef: {} }
  }
  return _defaultsCache
}

function resolveParams(defaults, ref) {
  const per = defaults.perBarkRef?.[ref] || {}
  return {
    colors:         per.colors         ?? defaults.colors         ?? 32,
    tileSize:       per.tileSize       ?? defaults.tileSize       ?? 256,
    ditherStrength: per.ditherStrength ?? defaults.ditherStrength ?? 0.5,
  }
}

export async function posterizeBarkRef(ref, opts = {}) {
  const defaults = opts.defaults || (await loadDefaults())
  const { colors, tileSize, ditherStrength } = resolveParams(defaults, ref)
  const colorPath = path.join(BARK_DIR, ref, 'color.jpg')
  const outPath = path.join(BARK_DIR, ref, 'posterized.png')

  // Median-cut quantization to N colors with Floyd–Steinberg dither.
  // sharp.png({palette:true,...}) routes through libimagequant; `colors` is
  // the palette size, `dither` is the FS error-diffusion strength [0,1].
  // Resize first so the quantizer operates at tileSize — quantizing the 1024
  // source then downsampling would re-blend palette colors and defeat the
  // "discrete luminance buckets" goal that drives gradient LUT coherence.
  const next = await sharp(colorPath)
    .resize(tileSize, tileSize, { fit: 'fill' })
    .png({ palette: true, colors, dither: ditherStrength, compressionLevel: 9 })
    .toBuffer()

  // writeIfChanged + mtime-touch — byte-identical output preserves content
  // but bumps mtime so downstream bake scripts re-run. Same discipline as
  // extract-bark-detail.mjs (per project_writeifchanged_touches_mtime).
  let prev = null
  try { prev = await fs.readFile(outPath) } catch {}
  const changed = !prev || !prev.equals(next)
  if (changed) {
    await fs.writeFile(outPath, next)
  } else {
    const now = new Date()
    await fs.utimes(outPath, now, now)
  }
  return { ref, w: tileSize, h: tileSize, bytes: next.length, colors, ditherStrength, changed }
}

export async function ensurePosterizedForRef(ref, opts = {}) {
  const outPath = path.join(BARK_DIR, ref, 'posterized.png')
  try {
    await fs.access(outPath)
    return { ref, existed: true }
  } catch {
    const r = await posterizeBarkRef(ref, opts)
    return { ...r, existed: false }
  }
}

async function main() {
  const defaults = await loadDefaults()
  const entries = await fs.readdir(BARK_DIR, { withFileTypes: true })
  const refs = entries
    .filter(e => e.isDirectory() && /^Bark/.test(e.name))
    .map(e => e.name)
    .sort()
  for (const ref of refs) {
    try {
      const r = await posterizeBarkRef(ref, { defaults })
      console.log(
        `[posterized] ${r.ref}/posterized.png ${r.w}×${r.h} ` +
        `colors=${r.colors} dither=${r.ditherStrength} ` +
        `${(r.bytes / 1024).toFixed(1)}KB ${r.changed ? '(updated)' : '(unchanged)'}`
      )
    } catch (err) {
      console.error(`[posterized] ${ref} failed: ${err.message}`)
      process.exitCode = 1
    }
  }
}

// Run as CLI when invoked directly; stay quiet when imported as a library.
const isMain = (() => {
  try { return fileURLToPath(import.meta.url) === process.argv[1] }
  catch { return false }
})()
if (isMain) main().catch(e => { console.error(e); process.exit(1) })
