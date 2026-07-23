// plot-label-lod.mjs — eyeball Step 3: the runtime zoom-LOD.
// Runs the shared layout, then renders the SAME placements at three simulated
// zoom levels (thinned far → mid → filled near) so we can see density thin/fill
// while ≥1 per street survives. Each panel filters to the LOD-visible set for a
// targetSpacing standing in for a camera zoom.
//   node scratch/plot-label-lod.mjs [scene] [out.png]
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { layoutStreetLabels } from '../src/lib/labelLayout.js'
import { prepareLabelLod, assignLabelLod } from '../src/lib/labelLod.js'

const scene = process.argv[2] || 'lafayette-square'
const out = process.argv[3] || `scratch/label-lod-${scene}.png`

const polylines = JSON.parse(readFileSync(`public/baked/${scene}/labels.json`, 'utf8')).labels
const placements = layoutStreetLabels(polylines, { letterSpacing: 0.05 })
const groups = prepareLabelLod(placements)

// three zoom stops (targetSpacing world-m): far (primaries only) → mid → near
const STOPS = [
  { label: 'ZOOMED OUT  (whole hood)', spacing: 800 },
  { label: 'MID', spacing: 300 },
  { label: 'ZOOMED IN  (few blocks)', spacing: 110 },
]

let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
for (const pl of polylines) for (const p of pl.points) {
  minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1])
}
const PW = 900, PAD = 30
const scale = (PW - 2 * PAD) / (maxX - minX)
const PH = Math.round((maxZ - minZ) * scale + 2 * PAD) + 40
const X = x => PAD + (x - minX) * scale
const Y = z => PAD + 40 + (z - minZ) * scale
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

function panel(stop) {
  const visible = new Array(placements.length).fill(false)
  assignLabelLod(placements, groups, stop.spacing, (i, v) => { if (v) visible[i] = true })
  const shown = visible.filter(Boolean).length
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}"><rect width="${PW}" height="${PH}" fill="#0d0d14"/>`
  svg += `<text x="${PAD}" y="26" font-family="Helvetica,Arial" font-size="20" fill="#cfcfe0" font-weight="700">${esc(stop.label)}  —  ${shown} labels</text>`
  for (const pl of polylines) {
    const d = pl.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')
    svg += `<path d="${d}" fill="none" stroke="#22222e" stroke-width="1"/>`
  }
  placements.forEach((p, i) => {
    if (!visible[i]) return
    const deg = (p.angle * 180 / Math.PI).toFixed(1)
    const fs = Math.max(5, p.fontSize * scale)
    const color = p.name !== p.fullName ? '#ffbf5b' : '#8ee06a'
    svg += `<g transform="translate(${X(p.x).toFixed(1)} ${Y(p.z).toFixed(1)}) rotate(${deg})">`
      + `<text x="0" y="0" font-family="Helvetica,Arial" font-weight="600" font-size="${fs.toFixed(1)}" `
      + `fill="${color}" stroke="#14141c" stroke-width="${(fs * 0.06).toFixed(2)}" paint-order="stroke" `
      + `text-anchor="middle" dominant-baseline="central">${esc(p.name)}</text></g>`
  })
  svg += `</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer().then(buf => ({ buf, shown }))
}

const panels = await Promise.all(STOPS.map(panel))
const GAP = 8
const W = PW * 3 + GAP * 2
await sharp({ create: { width: W, height: PH, channels: 3, background: '#000' } })
  .composite(panels.map((p, i) => ({ input: p.buf, left: i * (PW + GAP), top: 0 })))
  .png().toFile(out)
console.log(`wrote ${out} (${W}x${PH})`)
console.log('visible per stop:', STOPS.map((s, i) => `${s.spacing}m→${panels[i].shown}`).join('  '))
