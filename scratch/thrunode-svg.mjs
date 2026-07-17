#!/usr/bin/env node
// Render a through-node throat (asphalt/treelawn/sidewalk) to SVG, thruTNode
// off vs on, so the eye can see the ped fragmentation + the bridge.
//   node scratch/thrunode-svg.mjs <cx> <cz> [half]   (default Kennett, half=45)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

const CX = +(process.argv[2] ?? 386.5), CZ = +(process.argv[3] ?? 149.0), H = +(process.argv[4] ?? 45)
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const bnd = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/neighborhood_boundary.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json')))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const build = (thruTNode) => buildTileGround(ribbons, {
  stencil: clip, smooth: 0, curbWidth: design.curbWidth, blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: design.cornerRadiusScale ?? 1, blockCustoms: design.blockCustoms || null,
  emitArtifact: true, thruTNode,
})
const signedArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const inBox = (r) => r.some(p => p[0] >= CX - H && p[0] <= CX + H && p[1] >= CZ - H && p[1] <= CZ + H)
const S = 460 / (2 * H)                                   // px per metre
const X = (x) => (x - (CX - H)) * S, Y = (z) => (z - (CZ - H)) * S   // +z south → down
const pathD = (r) => 'M' + r.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L') + 'Z'

function panel(pr, label, ox) {
  const asph = (pr.asphalt || []).filter(inBox)
  const tl = Object.values(pr.treelawnByLu || {}).flat().filter(r => r && r.length >= 3 && inBox(r))
  const sw = (pr.sidewalk || []).filter(r => r && r.length >= 3 && inBox(r))
  let s = `<g transform="translate(${ox},0)">`
  s += `<rect x="0" y="0" width="460" height="460" fill="#1a1a1a"/>`
  for (const r of asph) s += `<path d="${pathD(r)}" fill="#3a3a3a"/>`
  for (const r of tl) s += `<path d="${pathD(r)}" fill="#4a7a3a" stroke="#6a9a5a" stroke-width="0.4"/>`
  for (const r of sw) s += `<path d="${pathD(r)}" fill="#b0b0a8" stroke="#d0d0c8" stroke-width="0.4"/>`
  // mark slivers (<8m²) in red
  for (const r of [...tl, ...sw]) { const a = Math.abs(signedArea(r)); if (a < 8) { const c = r.reduce((o, p) => [o[0] + p[0] / r.length, o[1] + p[1] / r.length], [0, 0]); s += `<circle cx="${X(c[0]).toFixed(1)}" cy="${Y(c[1]).toFixed(1)}" r="3" fill="none" stroke="#ff3030" stroke-width="1.5"/>` } }
  s += `<circle cx="${X(CX).toFixed(1)}" cy="${Y(CZ).toFixed(1)}" r="3" fill="#ffd000"/>`
  s += `<text x="8" y="20" fill="#fff" font-family="monospace" font-size="14">${label}</text></g>`
  return s
}
function panelV(pr, label, oy) { return panel(pr, label, 0).replace('translate(0,0)', `translate(0,${oy})`) }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="936" viewBox="0 0 460 936">`
  + panelV(build(false), `thruTNode OFF  @(${CX},${CZ})`, 0)
  + panelV(build(true), `thruTNode ON`, 476)
  + `</svg>`
const out = path.join(HERE, `thrunode-${CX}_${CZ}.svg`)
fs.writeFileSync(out, svg)
console.log('wrote', out)
