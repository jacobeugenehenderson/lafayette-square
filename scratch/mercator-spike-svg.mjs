// Mercator — spike proof render: production block (magenta) vs the corridor-leg
// corner construction (green legs + corner), over the operator's correct strokes.
// North-up, east-right (+x=WEST, +z=NORTH → mirror both).
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const marks = JSON.parse(readFileSync(new URL('./correct-target-mississippi-lafayette.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const pr = buildTileGround(r, { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null })

// — the construction (mirrors mercator-spike.mjs, hwB = 6.70) —
const NODE = [166.5, 221.9], TRUE_C = [174.1, 208.3], FALSE_C = [214.0, 216.2]
const byId = new Map(r.streets.map(s => [s.skelId, s]))
const cwB = byId.get('lafayette-avenue-6')
const body = { p: [181.6, 220.2], q: [246.8, 230.5] }   // straight body (taper dropped)
const dB = (() => { const v = [body.q[0] - body.p[0], body.q[1] - body.p[1]]; const L = Math.hypot(...v); return [v[0] / L, v[1] / L] })()
let perpB = [-dB[1], dB[0]]; if (perpB[1] > 0) perpB = [dB[1], -dB[0]]
const hwB = 6.70
const pBo = [body.p[0] + perpB[0] * hwB, body.p[1] + perpB[1] * hwB]
const miss = byId.get('mississippi-avenue')
const ci = miss.points.findIndex(p => Math.hypot(p[0] - NODE[0], p[1] - NODE[1]) < 0.5)
const segDown = [miss.points[ci], miss.points[ci + 1][1] < miss.points[ci - 1][1] ? miss.points[ci + 1] : miss.points[ci - 1]]
const dA = (() => { const v = [segDown[1][0] - segDown[0][0], segDown[1][1] - segDown[0][1]]; const L = Math.hypot(...v); return [v[0] / L, v[1] / L] })()
let perpA = [-dA[1], dA[0]]; if (perpA[0] < 0) perpA = [dA[1], -dA[0]]
const hwA = 7.52
const pA = [segDown[0][0] + perpA[0] * hwA, segDown[0][1] + perpA[1] * hwA]
function lineIntersect(p1, d1, p2, d2) {
  const det = d1[0] * d2[1] - d1[1] * d2[0]
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / det
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t]
}
const CORNER = lineIntersect(pA, dA, pBo, dB)

const c = [205, 195], W = 150, px = 1500, sc = px / W
const maxx = c[0] + W / 2, maxy = c[1] + W / 2
const X = x => ((maxx - x) * sc).toFixed(1), Y = y => ((maxy - y) * sc).toFixed(1)
const path = (pts, gx = p => p[0], gy = p => p[1]) => pts.map((p, i) => (i ? 'L' : 'M') + X(gx(p)) + ' ' + Y(gy(p))).join(' ')

let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
let dd = ''
for (const rr of pr.asphalt) { if (rr?.length >= 3 && rr.some(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)) dd += path(rr) + ' Z ' }
s += `<path d="${dd}" fill="#e6e6e6" fill-rule="evenodd"/>`
for (const rr of pr.block) { if (rr?.length >= 3 && rr.some(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)) s += `<path d="${path(rr)} Z" fill="none" stroke="#e0007f" stroke-width="2"/>` }
// chains
for (const st of r.streets) {
  if (!st.points.some(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)) continue
  s += `<path d="${path(st.points)}" fill="none" stroke="#c9c9ff" stroke-width="1.2"/>`
}
// operator strokes
for (const k of ['0', '1']) s += `<path d="${path(marks[k], p => p.x, p => p.z)}" fill="none" stroke="#000" stroke-width="2.5" stroke-dasharray="8 5"/>`
// THE CONSTRUCTION: leg B (corridor outer edge) from far east to corner; leg A down Mississippi curb
const legBfar = [CORNER[0] + dB[0] * 110, CORNER[1] + dB[1] * 110]
const legAfar = [CORNER[0] + dA[0] * 95, CORNER[1] + dA[1] * 95]
s += `<path d="${path([legBfar, CORNER, legAfar])}" fill="none" stroke="#0a0" stroke-width="3.5"/>`
s += `<circle cx="${X(CORNER[0])}" cy="${Y(CORNER[1])}" r="9" fill="none" stroke="#0a0" stroke-width="3.5"/>`
s += `<circle cx="${X(TRUE_C[0])}" cy="${Y(TRUE_C[1])}" r="6" fill="#0a0"/>`
s += `<circle cx="${X(FALSE_C[0])}" cy="${Y(FALSE_C[1])}" r="8" fill="none" stroke="#f00" stroke-width="3"/>`
s += `<circle cx="${X(NODE[0])}" cy="${Y(NODE[1])}" r="5" fill="red"/>`
const lines = [
  ['#e0007f', 'magenta = production block (the needle-fillet defect)'],
  ['#0a0', 'green = corridor-leg construction: straight body ⊕ 6.7 × Mississippi curb ⊕ 7.52'],
  ['#0a0', `green ○ = constructed corner (${CORNER[0].toFixed(1)},${CORNER[1].toFixed(1)}) · ● = operator true (174.1,208.3) · 4.0m apart`],
  ['#f00', 'red ○ = production false corner (214,216), 40.7m off · red ● = the transition node'],
  ['#000', 'black dashed = operator correct-target strokes'],
]
let ly = 28
for (const [col, txt] of lines) { s += `<text x="14" y="${ly}" font-size="19" fill="${col}">${txt}</text>`; ly += 24 }
s += `<text x="${px / 2}" y="26" font-size="24" fill="#080" text-anchor="middle">N</text><text x="${px - 24}" y="${px / 2}" font-size="24" fill="#080">E</text>`
s += '</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./mercator-spike-proof.png', import.meta.url).pathname)
console.log('corner:', CORNER.map(v => v.toFixed(2)).join(','), '→ wrote scratch/mercator-spike-proof.png')
