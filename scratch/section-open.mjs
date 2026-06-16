import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { sectionOpen } from '../src/lib/tileGround.js'
// args: tag cx cy width  — renders the EXACT Section path: sectionOpen(frozen shape.json)
const tag = process.argv[2] || 'x'
const cxw = +process.argv[3], cyw = +process.argv[4], W = +(process.argv[5] || 40)
const frozen = JSON.parse(readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const stencil = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const blockCustoms = d.blockCustoms || null
const sg = sectionOpen(frozen, d.curbWidth, { outer: 'LU', inner: 'SW' }, stencil, blockCustoms)
const minx = cxw - W / 2, miny = cyw - W / 2, px = 1400, sc = px / W
const X = x => ((x - minx) * sc).toFixed(1), Y = y => ((y - miny) * sc).toFixed(1)
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
const path = (rings, fill) => { let dd = ''; for (const rr of (rings || [])) { if (!rr || rr.length < 3) continue; dd += rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' } if (dd) s += `<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.5"/>` }
path(sg.asphalt, '#3a3a3a')
for (const rings of Object.values(sg.luByClass || {})) path(rings, '#2a2218')
for (const rings of Object.values(sg.treelawnByLu || {})) path(rings, '#5aa02a')
path(sg.sidewalk, '#e8e2d4')
path(sg.curb, '#888')
s += '</svg>'
writeFileSync(new URL(`./section-open-${tag}.png`, import.meta.url).pathname, '')
await sharp(Buffer.from(s)).png().toFile(new URL(`./section-open-${tag}.png`, import.meta.url).pathname)
console.log('wrote section-open-' + tag, 'tiles', frozen.length, 'blockCustoms', !!blockCustoms)
