import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const pr = buildTileGround(r, { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null })
const ring = pr.block[20]
const inWin = p => p[0] > 140 && p[0] < 290 && p[1] > 100 && p[1] < 245
let last = null
ring.forEach((p, i) => {
  if (!inWin(p)) { last = null; return }
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return
  console.log('v' + i + ' (' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ')')
  last = p
})
