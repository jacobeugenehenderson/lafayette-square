// Hadrian · Phase-D evidence — SVG of the Section ground composed by
// sectionOpen() from the FROZEN artifact alone (shape.json, no chains).
// Axes: LS local frame is +x=WEST, +z=NORTH (reference_ls_local_frame_axes)
// → north-up/east-right SVG needs BOTH flipped: sx = -x, sy = -z… with SVG's
// y-down that means sy = +(-z) flipped again → sy = z? No: north-up means
// larger z (north) plots HIGHER → smaller svg-y → sy = -z. East-right: east
// = -x → sx = -x. (Proxy renders are evidence only — Jacob's eye is the gate.)
import { readFileSync, writeFileSync } from 'node:fs'
import { sectionOpen } from '../src/lib/tileGround.js'

const shapeTiles = JSON.parse(readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const out = sectionOpen(shapeTiles, 0.1524, { outer: 'LU', inner: 'SW' })

let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
const tx = p => [-p[0], -p[1]]   // [x,z] → [east-right, north-up(svg-y-down)]
for (const r of out.block) for (const p of r) { const [a, b] = tx(p); minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, b); maxY = Math.max(maxY, b) }
const W = 1600, H = Math.round(W * (maxY - minY) / (maxX - minX))
const sc = W / (maxX - minX)
const P = p => { const [a, b] = tx(p); return `${((a - minX) * sc).toFixed(1)},${((b - minY) * sc).toFixed(1)}` }
const path = rings => rings.map(r => 'M' + r.map(P).join('L') + 'Z').join(' ')
const layer = (rings, fill, op = 1) => rings.length ? `<path d="${path(rings)}" fill="${fill}" fill-opacity="${op}" fill-rule="evenodd"/>` : ''

const LU = { residential: '#b9c4a5', recreation: '#a5c4b2', commercial: '#c4b3a5', park: '#8fbf8f', parking: '#b5b5b5', institutional: '#c0aec6', island: '#cccccc', unknown: '#bdbdb0' }
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#2a2a26"/>`
svg += layer(out.block, '#3b7dd8', 0.25)                                  // frozen block silhouette
for (const [lu, r] of Object.entries(out.luByClass)) svg += layer(r, LU[lu] || '#bdbdb0')
for (const [lu, r] of Object.entries(out.treelawnByLu)) svg += layer(r, '#7da86b')
svg += layer(out.sidewalk, '#d8d2c4')
svg += layer(out.curb, '#9a9488')
svg += layer(out.asphalt, '#4a4a48')
svg += `<text x="12" y="28" fill="#fff" font-family="monospace" font-size="20">Section ← FROZEN shape.json (sectionOpen, no chains) · north-up/east-right</text></svg>`
writeFileSync(new URL('./hadrian-section-frozen.svg', import.meta.url), svg)
console.log(`wrote scratch/hadrian-section-frozen.svg (${W}×${H})`)
