// cap-fe-wrap-census.mjs — how many dead-end caps have their frontage emitted as
// ONE fe that WRAPS the tip (both sides of the finger under a single `side`
// token)? That is the root of the unwritable dead-end leg slots.
import fs from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
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
  blockLandUse: design.blockLandUse })
console.log = o
const fes = v2.frontageEdges || []
const caps = []
for (const t of shape.tiles) for (const v of [...(t.roundTips || []), ...(t.bluntTips || [])]) if (v.skelId) caps.push(v)
let wrap = 0, sides = { 1: 0, 2: 0, 0: 0 }
for (const c of caps) {
  const mine = fes.filter(fe => fe.chainSkelId === c.skelId)
  const wrappers = mine.filter(fe => fe.points.some(p => Math.hypot(p[0] - c.p[0], p[1] - c.p[1]) < 12))
  if (wrappers.length) wrap++
  const sideSet = new Set(wrappers.map(fe => fe.side))
  sides[sideSet.size] = (sides[sideSet.size] || 0) + 1
}
console.log(`caps: ${caps.length}`)
console.log(`  with an fe reaching the tip        : ${wrap}`)
console.log(`  those fes carry ONE side token     : ${sides[1]}`)
console.log(`  those fes carry BOTH side tokens   : ${sides[2]}`)
console.log(`  no fe reaches the tip at all       : ${sides[0]}`)
