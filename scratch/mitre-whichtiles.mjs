import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null, emitArtifact: true })
const dolmanRoad = new Set(['west-18th-street','south-18th-street-3','dolman-street-1'])
for (const ti of [4,22,23,27,32,77,78,92,93]){
  const T=pr._shapeArtifact[ti]; if(!T) continue
  const roads=[...new Set(T.runs.map(x=>x.skelId))]
  const onRoad = roads.some(x=>dolmanRoad.has(x))
  console.log(`tile ${ti}: ${onRoad?'*** 18th/Dolman ***':'(other)'} runs=${roads.join(',')}`)
}
