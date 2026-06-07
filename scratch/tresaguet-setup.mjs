// Tresaguet intersection-everywhere — shared setup: production-parity
// buildTileGround on THIS worktree's ribbons (trunk tip, post-Telford) + the
// operator's design params. Mirrors bake-ground.js buildTileBakeShape exactly.
import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAIN = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
export const R = JSON.parse(fs.readFileSync(HERE + '/src/data/ribbons.json', 'utf8'))
const bnd = JSON.parse(fs.readFileSync(MAIN + '/cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
export const design = JSON.parse(fs.readFileSync(MAIN + '/public/looks/lafayette-square/design.json', 'utf8'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
export const stencil = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
export const marks = JSON.parse(fs.readFileSync(MAIN + '/cartograph/data/lafayette-square/clean/marker_strokes.json', 'utf8'))
export const markPts = Object.values(marks).map(s => s.map(p => [p.x, p.z]))
export function build(overrides = {}) {
  return buildTileGround(R, {
    stencil,
    curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : 0.381,
    smooth: 0,
    blockLandUse: design.blockLandUse || null,
    cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
    cornerRadiusOverrides: design.cornerRadiusOverrides || null,
    cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
    blockCustoms: (design.blockCustoms && typeof design.blockCustoms === 'object') ? design.blockCustoms : null,
    emitArtifact: true,
    ...overrides,
  })
}
// SVG render of polygons near a center, LS frame: +x=WEST, +z=NORTH → flip
// both for north-up/east-right.
export function svg(file, { center, half = 60, layers }) {
  const [cx0, cz0] = center
  const X = (x) => (cx0 - x) * 6 + half * 6   // +x west → screen-left
  const Y = (z) => (cz0 - z) * 6 + half * 6   // +z north → screen-up handled by flip
  const w = half * 12
  const path = (ring) => 'M' + ring.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L') + 'Z'
  const open = (pts) => 'M' + pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L')
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}"><rect width="${w}" height="${w}" fill="#fff"/>`
  for (const L of layers) {
    if (L.rings) for (const r of L.rings) out += `<path d="${path(r)}" fill="${L.fill || 'none'}" fill-rule="evenodd" stroke="${L.stroke || 'none'}" stroke-width="${L.sw || 1}" opacity="${L.op ?? 1}"/>`
    if (L.lines) for (const p of L.lines) out += `<path d="${open(p)}" fill="none" stroke="${L.stroke || '#000'}" stroke-width="${L.sw || 1}" opacity="${L.op ?? 1}"/>`
    if (L.dots) for (const p of L.dots) out += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${L.r || 3}" fill="${L.fill || '#f0f'}"/>`
  }
  out += `<text x="6" y="16" font-size="12" font-family="monospace">N↑ E→ center(${cx0.toFixed(0)},${cz0.toFixed(0)}) ±${half}m</text></svg>`
  fs.writeFileSync(file, out)
  console.log('wrote', file)
}
