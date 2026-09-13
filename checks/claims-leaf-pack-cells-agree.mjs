/**
 * A leaf pack's CELLS MUST BE INTERCHANGEABLE — the system assumes it and nothing checked.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR (Jacob's eye, 2026-08-25). `generate-salon`'s
 * `rewriteCardUVs` does PER-CARD RANDOM TILE ASSIGNMENT across a pack's tileGrid: every
 * leaf card draws a random cell. That is only sound if the cells are variations of the
 * SAME leaf. `eastern_black_oak` is a 2×2 of four arbitrary scans — one green, three
 * autumn — so a random draw produced a roughly 3:1 RED canopy on every white oak, mixed
 * green through maroon exactly as random assignment predicts.
 *
 * ⭐ Jacob spotted it as "the leaf pack is 4 leaves; one of which is red." I had sampled
 * the pack's whole atlas REGION and read its MEAN as green — the average across one green
 * cell and three red ones hid the very thing that was visible on screen. A mean over cells
 * that are not the same thing is not a measurement of anything.
 *
 * ⛔ Reports only. Which season a pack should be is curation, never a script's call —
 * `eastern_black_oak`'s own metadata says "~20 leaves available for atlas/curation".
 *
 *   node scratch/claims-leaf-pack-cells-agree.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.join(import.meta.dirname, '..')
const SHAPES = path.join(ROOT, 'public/textures/leaves/shapes')

// Hue in degrees from RGB — the axis that separates a green leaf from an autumn one.
// ⛔ NOT brightness: a dark green and a bright green are the same leaf in different light,
// while a green and a red at identical luminance are different seasons.
function hue(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return 0
  let h
  if (mx === r) h = ((g - b) / d) % 6
  else if (mx === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}
// Circular distance in degrees.
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

const HUE_TOLERANCE = 25   // green scans of one leaf vary; a season change does not stay inside this

let fail = 0, checked = 0
const packs = existsSync(SHAPES) ? readdirSync(SHAPES) : []

for (const name of packs.sort()) {
  const dir = path.join(SHAPES, name)
  const metaPath = path.join(dir, 'meta.json')
  const imgPath = path.join(dir, 'shape.png')
  if (!existsSync(metaPath) || !existsSync(imgPath)) continue
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const grid = Array.isArray(meta.tileGrid) && meta.tileGrid.length === 2 ? meta.tileGrid : [1, 1]
  const [cols, rows] = grid.map(n => Math.max(1, n | 0))
  if (cols * rows < 2) continue          // single-cell packs cannot disagree with themselves
  checked++

  const img = sharp(imgPath)
  const m = await img.metadata()
  const cw = Math.floor(m.width / cols), ch = Math.floor(m.height / rows)
  const cells = []
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const { data, info } = await sharp(imgPath)
        .extract({ left: cx * cw, top: ry * ch, width: cw, height: ch }).raw().toBuffer({ resolveWithObject: true })
      let R = 0, G = 0, B = 0, n = 0
      for (let i = 0; i < data.length; i += info.channels) {
        const a = info.channels === 4 ? data[i + 3] : 255
        if (a < 40) continue                       // ⛔ ignore the transparent surround
        R += data[i]; G += data[i + 1]; B += data[i + 2]; n++
      }
      if (!n) { cells.push({ cx, ry, empty: true }); continue }
      const r = R / n, g = G / n, b = B / n
      cells.push({ cx, ry, r: Math.round(r), g: Math.round(g), b: Math.round(b), hue: Math.round(hue(r, g, b)) })
    }
  }

  const filled = cells.filter(c => !c.empty)
  if (filled.length < 2) continue
  const hues = filled.map(c => c.hue)
  const worst = Math.max(...hues.map(h1 => Math.max(...hues.map(h2 => hueGap(h1, h2)))))
  const empties = cells.filter(c => c.empty)

  if (worst > HUE_TOLERANCE || empties.length) {
    fail++
    console.error(`  ⛔ ${name}  (${cols}×${rows})  max hue spread ${worst}°`)
    for (const c of cells) {
      console.error(c.empty
        ? `       cell ${c.cx},${c.ry}  EMPTY — a random draw lands on nothing`
        : `       cell ${c.cx},${c.ry}  RGB ${String(c.r).padStart(3)},${String(c.g).padStart(3)},${String(c.b).padStart(3)}  hue ${String(c.hue).padStart(3)}°`)
    }
  }
}

console.log(`\nmulti-cell packs checked: ${checked}`)
if (fail) {
  console.error(`\n❌ FAIL — ${fail} pack(s) whose cells are NOT interchangeable.`)
  console.error('   generate-salon assigns a cell PER CARD AT RANDOM, so a mixed-season pack')
  console.error('   paints a canopy in whatever proportion its cells happen to be.')
  console.error('   ⛔ Curation, not a script fix: choose the cells that belong to one season.')
  process.exit(1)
}
console.log('✅ PASS — every multi-cell pack has colour-consistent cells.')
