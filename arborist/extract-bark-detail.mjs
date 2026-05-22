/**
 * extract-bark-detail.mjs — Brief 2.1a (Cinder) bark Detail Texturing layer.
 *
 * For each bark ref under public/textures/bark/<ref>/, read color.jpg, apply
 * sharp's Gaussian blur, subtract blurred from original + center on 0.5 grey,
 * write detail.png alongside. Greyscale single-channel PNG; idempotent.
 *
 * Output composes at runtime via Overlay-blend (Unreal Detail Texture /
 * Unity HDRP Detail Albedo). detail PNGs get packed into the master
 * trees-atlas-color.png as a 4th sub-region by bake-look.js#unifyAtlases.
 *
 * CLI: node arborist/extract-bark-detail.mjs
 */
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const BARK_DIR = path.join(REPO_ROOT, 'public/textures/bark')

// High-pass sigma. 15px on 1024-source bark approximates the spatial cut
// between the "broad lighting" the gradient layer should drive and the
// "crevice/ridge micro-detail" the detail layer carries.
const SIGMA = 15

async function extractDetail(barkRef) {
  const colorPath = path.join(BARK_DIR, barkRef, 'color.jpg')
  const detailPath = path.join(BARK_DIR, barkRef, 'detail.png')

  const { data: origRaw, info } = await sharp(colorPath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: blurRaw } = await sharp(colorPath)
    .greyscale()
    .blur(SIGMA)
    .raw()
    .toBuffer({ resolveWithObject: true })

  // detail[i] = clamp(orig[i] − blur[i] + 128, 0, 255)
  const detailRaw = Buffer.alloc(origRaw.length)
  for (let i = 0; i < origRaw.length; i++) {
    const v = origRaw[i] - blurRaw[i] + 128
    detailRaw[i] = v < 0 ? 0 : (v > 255 ? 255 : v)
  }

  const next = await sharp(detailRaw, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer()

  // writeIfChanged + mtime-touch: byte-identical output keeps content but
  // updates mtime so downstream bake scripts that depend on detail.png
  // re-run when this script runs (per project_writeifchanged_touches_mtime).
  let prev = null
  try { prev = await fs.readFile(detailPath) } catch {}
  if (!prev || !prev.equals(next)) {
    await fs.writeFile(detailPath, next)
  } else {
    const now = new Date()
    await fs.utimes(detailPath, now, now)
  }
  return { ref: barkRef, w: info.width, h: info.height, bytes: next.length, changed: !prev || !prev.equals(next) }
}

async function main() {
  const entries = await fs.readdir(BARK_DIR, { withFileTypes: true })
  const refs = entries
    .filter(e => e.isDirectory() && /^Bark/.test(e.name))
    .map(e => e.name)
    .sort()
  const results = []
  for (const ref of refs) {
    try {
      const r = await extractDetail(ref)
      results.push(r)
      console.log(`[detail] ${r.ref}/detail.png ${r.w}×${r.h} ${(r.bytes / 1024).toFixed(1)}KB ${r.changed ? '(updated)' : '(unchanged)'}`)
    } catch (err) {
      console.error(`[detail] ${ref} failed: ${err.message}`)
      process.exitCode = 1
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
