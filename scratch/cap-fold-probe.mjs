// cap-fold-probe.mjs — why did the ribbon fold NOT get chopped at this tip?
// Replays the shoulder detection against the real block ring.
import fs from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
const skelId = process.argv[2] || 'dolman-street-0'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const o = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2(ribbons, { stencil, blockCustoms: design.blockCustoms || null,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse, __debugRings: true })
console.log = o
let tip = null, hw = null, round = null
for (const t of shape.tiles) {
  for (const v of (t.roundTips || [])) if (v.skelId === skelId) { tip = v.p; hw = v.hw; round = true }
  for (const v of (t.bluntTips || [])) if (v.skelId === skelId) { tip = v.p; hw = v.hw; round = false }
}
console.log(`${skelId} tip ${tip} hw=${hw} ${round ? 'ROUND' : 'BLUNT'}`)
const rings = v2.__blockRings || []
console.log(`block rings: ${rings.length}`)
for (let ri = 0; ri < rings.length; ri++) {
  const ring = rings[ri], N = ring.length
  let bi = -1, bd = Infinity
  for (let i = 0; i < N; i++) { const d = Math.hypot(ring[i][0] - tip[0], ring[i][1] - tip[1]); if (d < bd) { bd = d; bi = i } }
  if (bd > 40) continue
  const lim = bd * 1.10 + 0.15
  const within = (i) => Math.hypot(ring[i][0] - tip[0], ring[i][1] - tip[1]) <= lim
  let lo = bi, hi = bi
  while (((lo - 1 + N) % N) !== hi && within((lo - 1 + N) % N)) lo = (lo - 1 + N) % N
  while (((hi + 1) % N) !== lo && within((hi + 1) % N)) hi = (hi + 1) % N
  const u = (i) => { const dx = ring[i][0] - tip[0], dz = ring[i][1] - tip[1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L] }
  const dot = lo === hi ? null : (u(lo)[0] * u(hi)[0] + u(lo)[1] * u(hi)[1])
  const span = (hi - lo + N) % N + 1
  console.log(`  ring#${ri} N=${N} nearest d=${bd.toFixed(2)} @${bi} lim=${lim.toFixed(2)} span=${span} lo=${lo} hi=${hi} dot=${dot === null ? 'n/a' : dot.toFixed(3)} ${dot !== null && dot <= -0.5 ? 'CHOP' : 'rejected'}`)
  // neighbourhood distances
  const ds = []
  for (let k = -4; k <= 4; k++) { const i = (bi + k + N) % N; ds.push(Math.hypot(ring[i][0] - tip[0], ring[i][1] - tip[1]).toFixed(2)) }
  console.log(`     d around nearest: ${ds.join(' ')}`)
}
