// Gunter (D1): map-wide tile sanity — block ring count + total block area,
// HEAD data vs re-derived, both under the current code. Catches pathological
// regressions (vanished blocks, exploded slivers) beyond the park corridor.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null }
const area = (ring) => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return Math.abs(a / 2) }

for (const [label, path] of [['BEFORE', 'scratch/gunter-ribbons-HEAD.json'], ['AFTER', 'src/data/ribbons.json']]) {
  const r = JSON.parse(readFileSync(new URL('../' + path, import.meta.url)))
  const pr = buildTileGround(r, opts)
  const tot = pr.block.reduce((s, ring) => s + area(ring), 0)
  console.log(`${label}: block rings=${pr.block.length}  total block area=${(tot / 1e3).toFixed(1)}k m²  asphalt rings=${pr.asphalt?.length ?? '—'}`)
}
