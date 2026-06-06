// Voussoir E3 spike — shared setup: production-parity buildTileGround on the
// trunk (post-E2) ribbons + the operator's design params. Mirrors
// bake-ground.js buildTileBakeShape exactly (stencil, curbWidth, smooth:0,
// blockCustoms, corner overrides, emitArtifact).
import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const MAIN = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const HERE = MAIN + '/.claude/worktrees/lye-skeleton-tile-hygiene'
export const R = JSON.parse(fs.readFileSync(HERE + '/src/data/ribbons.json', 'utf8'))
const bnd = JSON.parse(fs.readFileSync(MAIN + '/cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
export const design = JSON.parse(fs.readFileSync(MAIN + '/public/looks/lafayette-square/design.json', 'utf8'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
export const stencil = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
export const marks = JSON.parse(fs.readFileSync(MAIN + '/cartograph/data/lafayette-square/clean/marker_strokes.json', 'utf8'))
  .map(s => Object.values(s))
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
export const turnDeg = (a, b, c) => {
  const ax = b[0] - a[0], az = b[1] - a[1], bx = c[0] - b[0], bz = c[1] - b[1]
  const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz)
  if (la < 1e-6 || lb < 1e-6) return 0
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)))) * 180 / Math.PI
}
// every divided transition end: carriageway endpoint that carries spineAtStart/End
export function transitionEnds() {
  const ends = []
  for (const s of R.streets) {
    const ph = s.phase
    if (!ph || ph.kind !== 'divided' || !/^carriageway/.test(ph.role || '')) continue
    if (ph.spineAtStart) ends.push({ id: s.skelId, spine: ph.spineAtStart, p: s.points[0], end: 'start' })
    if (ph.spineAtEnd) ends.push({ id: s.skelId, spine: ph.spineAtEnd, p: s.points[s.points.length - 1], end: 'end' })
  }
  return ends
}
