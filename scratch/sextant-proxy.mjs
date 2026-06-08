// Sextant PROXY render (labelled proxy — NOT the operator eye). One node:
// Mackay->Park [-48,-203.9]. Draws the block ring (curb line iA) + avenue
// centerline + node + the two THRU blend kinks on the no-mouth (north) curb.
import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design  = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const pr = buildTileGround(ribbons, {
  curbWidth: 0.381, smooth: 0, cornerRadiusScale: 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null, emitArtifact: true,
})
const node = [-48.0, -203.9]
const av = ribbons.streets.find(s => (s.skelId||s.name) === 'park-avenue-1')
// window
const cx = node[0], cy = node[1], R = 22
// world->svg: x->right is WEST in LS, but for a clean proxy plot raw x right, z UP (flip).
const W = 720, H = 520, pad = 30
const sx = (W - 2*pad)/(2*R), sy = (H - 2*pad)/(2*R)
const sc = Math.min(sx, sy)
const PX = p => (W/2 + (p[0]-cx)*sc).toFixed(1)
const PY = p => (H/2 - (p[1]-cy)*sc).toFixed(1)   // flip z up
const near = p => Math.abs(p[0]-cx) < R+5 && Math.abs(p[1]-cy) < R+5
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="monospace" font-size="11">`
svg += `<rect width="${W}" height="${H}" fill="#0e1116"/>`
// block rings (curb line) in cyan
for (const ring of pr.block) {
  if (!ring.some(near)) continue
  let d = 'M' + ring.map(p => `${PX(p)},${PY(p)}`).join(' L') + 'Z'
  svg += `<path d="${d}" fill="none" stroke="#37c0c0" stroke-width="1.4"/>`
}
// avenue centerline in amber, vertices as dots
const cl = av.points.filter(near)
svg += `<polyline points="${cl.map(p=>`${PX(p)},${PY(p)}`).join(' ')}" fill="none" stroke="#e0a030" stroke-width="1" stroke-dasharray="4 3"/>`
for (const p of cl) svg += `<circle cx="${PX(p)}" cy="${PY(p)}" r="2" fill="#e0a030"/>`
// node marker
svg += `<circle cx="${PX(node)}" cy="${PY(node)}" r="4" fill="none" stroke="#ff4060" stroke-width="2"/>`
svg += `<text x="${PX(node)}" y="${(+PY(node)+16)}" fill="#ff4060">deg-3 T node [-48,-203.9]</text>`
// the two kink points measured earlier on the no-mouth (north) curb: s=+/-3.75, r=11.62/13.82
// no-mouth normal nNo=[-0.158,0.987] (north), avenue tangent tAv=[0.987,0.158]
const tAv=[0.987,0.158], nNo=[-0.158,0.987]
const kpt = (s,r)=>[node[0]+tAv[0]*s+nNo[0]*r, node[1]+tAv[1]*s+nNo[1]*r]
const k1 = kpt(-3.75,11.62), k2 = kpt(3.75,13.82)
for (const [k,lab] of [[k1,'kink A 16.4°'],[k2,'kink B 16.4°']]) {
  svg += `<circle cx="${PX(k)}" cy="${PY(k)}" r="4" fill="#ffe000"/>`
  svg += `<text x="${(+PX(k)-20)}" y="${(+PY(k)-8)}" fill="#ffe000">${lab}</text>`
}
// labels
svg += `<text x="10" y="18" fill="#bbb">PROXY (not operator eye) — Mackay->Park no-mouth dogleg. cyan=curb(iA) amber=avenue CL red=node yellow=THRU blend kinks</text>`
svg += `<text x="10" y="${H-26}" fill="#999">no-mouth (north) curb steps 11.62m -> 13.82m across node (dw=2.20m authored pavementHW step); THRU window W=3.75 each side; blend held ~16.4° &lt; 18° fillet tol -> stays a visible jog</text>`
svg += `<text x="10" y="${H-12}" fill="#777">axes: raw [x right, z UP]. Note LS frame +x=WEST,+z=NORTH so this proxy is mirrored E-W vs the live map.</text>`
svg += `</svg>`
writeFileSync(new URL('../scratch/sextant-mackay-proxy.svg', import.meta.url), svg)
console.log('wrote scratch/sextant-mackay-proxy.svg')
console.log('kink A', k1.map(v=>v.toFixed(2)), 'kink B', k2.map(v=>v.toFixed(2)))
