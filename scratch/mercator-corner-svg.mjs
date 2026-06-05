// Mercator — render the Mississippi×Lafayette corner: tile#11 ring, its asphalt,
// block rings, chains, operator strokes, true corner. North-up east-right
// (axes: +x=WEST, +z=NORTH → mirror both for the render).
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
import clipperLib from 'clipper-lib'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const marks = JSON.parse(readFileSync(new URL('./correct-target-mississippi-lafayette.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const base = { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null }

const pr = buildTileGround(r, base)

const c = [215, 210], W = 170, px = 1600, sc = px / W
const maxx = c[0] + W / 2, maxy = c[1] + W / 2
const X = x => ((maxx - x) * sc).toFixed(1), Y = y => ((maxy - y) * sc).toFixed(1)
const path = (pts, getx = p => p[0], gety = p => p[1]) => pts.map((p, i) => (i ? 'L' : 'M') + X(getx(p)) + ' ' + Y(gety(p))).join(' ')

let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
// asphalt (all, light gray)
let dd = ''
for (const rr of pr.asphalt) { if (!rr || rr.length < 3) continue; if (!rr.some(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)) continue; dd += path(rr) + ' Z ' }
s += `<path d="${dd}" fill="#ddd" fill-rule="evenodd"/>`
// block rings near window — magenta
for (let i = 0; i < pr.block.length; i++) {
  const rr = pr.block[i]
  if (!rr.some(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)) continue
  s += `<path d="${path(rr)} Z" fill="none" stroke="#e0007f" stroke-width="2.5"/>`
  // label at nearest vertex to window center
  let b = rr[0], bd = Infinity
  for (const p of rr) { const dd2 = (p[0]-c[0])**2 + (p[1]-c[1])**2; if (dd2 < bd) { bd = dd2; b = p } }
  s += `<text x="${X(b[0])}" y="${Y(b[1])}" font-size="22" fill="#e0007f">#${i}</text>`
}
// chains
const chains = { 'lafayette-avenue-3': '#0a0', 'lafayette-avenue-5': '#06c', 'lafayette-avenue-6': '#f80', 'mississippi-avenue': '#90c', 'kennett-place': '#a52', 'missouri-avenue': '#577' }
for (const st of r.streets) {
  const col = chains[st.skelId]
  if (!st.points.some(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)) continue
  s += `<path d="${path(st.points)}" fill="none" stroke="${col || '#bbb'}" stroke-width="${col ? 2 : 1}"/>`
  if (col) { const mid = st.points[Math.floor(st.points.length / 2)]; }
}
// operator strokes (black dashed) + true corner + node
for (const k of ['0', '1']) s += `<path d="${path(marks[k], p => p.x, p => p.z)}" fill="none" stroke="#000" stroke-width="3" stroke-dasharray="9 5"/>`
s += `<circle cx="${X(174.1)}" cy="${Y(208.3)}" r="7" fill="none" stroke="#0a0" stroke-width="3"/>`
s += `<circle cx="${X(166.5)}" cy="${Y(221.9)}" r="6" fill="red"/>`
s += `<circle cx="${X(214.0)}" cy="${Y(216.2)}" r="7" fill="none" stroke="#f00" stroke-width="3"/>`
let ly = 30
for (const [k, col] of Object.entries(chains)) { s += `<text x="14" y="${ly}" font-size="20" fill="${col}">${k}</text>`; ly += 24 }
s += `<text x="14" y="${ly}" font-size="20" fill="#000">dashed = operator correct curbs · green ○ true · red ○ false · red ● node</text>`
s += `<text x="${px / 2}" y="26" font-size="24" fill="#080" text-anchor="middle">N</text><text x="${px - 24}" y="${px / 2}" font-size="24" fill="#080">E</text>`
s += '</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./mercator-corner.png', import.meta.url).pathname)
console.log('wrote scratch/mercator-corner.png')
