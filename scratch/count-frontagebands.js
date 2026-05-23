import { readFileSync } from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
const ribbons = JSON.parse(readFileSync('src/data/ribbons.json','utf-8'))
const design = JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf-8'))
const sten = JSON.parse(readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf-8'))
const center=sten.center, radius=sten.radius
const streetFade=sten.streetFade||null
const targetR=streetFade?streetFade.outer+50:radius
const scale=radius>0?targetR/radius:1
const stencil=sten.boundary.map(([x,z])=>[center[0]+(x-center[0])*scale, center[1]+(z-center[1])*scale])
const v2=buildBlockGeometryV2(ribbons,{stencil, cornerRadiusScale:design.cornerRadiusScale??1, cornerRadiusOverrides:design.cornerRadiusOverrides||{}, cornerCornerRadiusOverrides:design.cornerCornerRadiusOverrides||{}, blockCustoms:design.blockCustoms||null, blockLandUse:design.blockLandUse||null, curbWidth:design.curbWidth??0.45})
let straight=0, arc=0, tlR=0, swR=0, aspR=0, stClipNoop=0
for(const fb of v2.frontageBands){if(!fb)continue;if(fb.corner)arc++;else straight++;tlR+=(fb.treelawnRings||[]).length;swR+=(fb.sidewalkRings||[]).length;aspR+=(fb.asphaltRings||[]).length}
console.log({total:v2.frontageBands.length, straight, arc, tlR, swR, aspR})
