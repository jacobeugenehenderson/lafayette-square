// plot-label-placements.mjs — eyeball Step 2 of the street-label overhaul.
// Runs the SHARED pure layout (src/lib/labelLayout.js) over the baked polylines
// and draws each placement as its (possibly abbreviated) text at the computed
// position / heading / fontSize, over the faint polylines. So we can see: repeat
// along streets, size ∝ width, and the fit/abbreviate gate firing.
//   node scratch/plot-label-placements.mjs [scene] [sizeK] [out.png]
import { readFileSync, existsSync } from 'node:fs'
import sharp from 'sharp'
import { layoutStreetLabels } from '../src/lib/labelLayout.js'

const scene = process.argv[2] || 'lafayette-square'
const sizeK = process.argv[3] ? Number(process.argv[3]) : undefined   // undefined = Auto
const out = process.argv[4] || `scratch/label-placements-${scene}.png`

const polylines = JSON.parse(readFileSync(`public/baked/${scene}/labels.json`, 'utf8')).labels
const placements = layoutStreetLabels(polylines, { sizeK, letterSpacing: 0.05 })

// bounds over the polylines
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
for (const pl of polylines) for (const p of pl.points) {
  minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1])
}
const W = 1800, PAD = 60
const scale = (W - 2 * PAD) / (maxX - minX)
const H = Math.round((maxZ - minZ) * scale + 2 * PAD)
const X = x => PAD + (x - minX) * scale
const Y = z => PAD + (z - minZ) * scale
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0d0d14"/>`
// faint polylines for context
for (const pl of polylines) {
  const d = pl.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')
  svg += `<path d="${d}" fill="none" stroke="#2a2a38" stroke-width="1"/>`
}
// placements — text at heading + size; green = full name, amber = abbreviated
for (const p of placements) {
  const px = X(p.x), py = Y(p.y ?? p.z)
  const deg = (p.angle * 180 / Math.PI).toFixed(1)
  const fs = Math.max(6, p.fontSize * scale)
  const abbreviated = p.name !== p.fullName
  const color = abbreviated ? '#ffbf5b' : '#8ee06a'
  svg += `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${deg})">`
    + `<text x="0" y="0" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="${fs.toFixed(1)}" `
    + `fill="${color}" stroke="#14141c" stroke-width="${(fs * 0.06).toFixed(2)}" paint-order="stroke" `
    + `text-anchor="middle" dominant-baseline="central">${esc(p.name)}</text></g>`
}
svg += `</svg>`

await sharp(Buffer.from(svg)).png().toFile(out)
const abbr = placements.filter(p => p.name !== p.fullName).length
console.log(`wrote ${out} (${W}x${H}) — ${placements.length} placements from ${polylines.length} polylines; `
  + `${abbr} abbreviated, sizeK=${sizeK ?? 'Auto'}`)
console.log('fontSize range m:', Math.min(...placements.map(p => p.fontSize)).toFixed(2), '→', Math.max(...placements.map(p => p.fontSize)).toFixed(2))
