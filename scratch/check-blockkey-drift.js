import { readFileSync } from 'fs'
import { buildBlockGeometryV2, intersectRings } from '../src/lib/buildBlockGeometryV2.js'
const ribbons = JSON.parse(readFileSync('src/data/ribbons.json','utf-8'))
const design = JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf-8'))
const sten = JSON.parse(readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf-8'))
const center=sten.center, radius=sten.radius
const streetFade=sten.streetFade||null
const targetR=streetFade?streetFade.outer+50:radius
const scale=radius>0?targetR/radius:1
const stencil=sten.boundary.map(([x,z])=>[center[0]+(x-center[0])*scale, center[1]+(z-center[1])*scale])
const v2=buildBlockGeometryV2(ribbons,{stencil, cornerRadiusScale:design.cornerRadiusScale??1, cornerRadiusOverrides:design.cornerRadiusOverrides||{}, cornerCornerRadiusOverrides:design.cornerCornerRadiusOverrides||{}, blockCustoms:design.blockCustoms||null, blockLandUse:design.blockLandUse||null, curbWidth:design.curbWidth??0.45})
function blockKeyFromRing(r){let mx=Infinity,Mx=-Infinity,mz=Infinity,Mz=-Infinity;for(const[x,z]of r){if(x<mx)mx=x;if(x>Mx)Mx=x;if(z<mz)mz=z;if(z>Mz)Mz=z}const cx=Math.round(((mx+Mx)/2)*2)/2,cz=Math.round(((mz+Mz)/2)*2)/2;return `${cx.toFixed(1)},${cz.toFixed(1)}`}
const brKeys=new Set(v2.blockRounded.map(r=>blockKeyFromRing(r)))
let hit=0,miss=0,missKeys=new Set()
for(const fb of v2.frontageBands){if(!fb||fb.corner)continue;if(brKeys.has(fb.blockKey))hit++;else{miss++;missKeys.add(fb.blockKey)}}
console.log({straightHit:hit, straightMiss:miss, sampleMissKeys:[...missKeys].slice(0,8)})
console.log('blockRounded sample keys:', [...brKeys].slice(0,8))
