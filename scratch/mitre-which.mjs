import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d0 = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
function maxTurn(ring,seam=[519,-409],R=12){const n=ring.length;let mt=0;for(let i=0;i<n;i++){const v=ring[i];if(Math.hypot(v[0]-seam[0],v[1]-seam[1])>R)continue
  const a=ring[(i-1+n)%n],b=ring[(i+1)%n],ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1],li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
  const t=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI;if(t>mt)mt=t}return mt.toFixed(1)}
for (const mode of ['none','measure-only','blockCustoms-only','both']){
  const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
  const d = JSON.parse(JSON.stringify(d0))
  const s=r.streets.find(x=>x.skelId==='south-18th-street-3')
  if(mode==='measure-only'||mode==='both') s.measure.left.pavementHW=5.49
  if(mode==='blockCustoms-only'||mode==='both'){const bc=d.blockCustoms['south-18th-street-3'].left;for(const k in bc)bc[k].pavementHW=5.49}
  const T = buildTileGround(r, { stencil: clip, smooth:0, curbWidth:d.curbWidth, blockLandUse:d.blockLandUse||null, cornerRadiusScale:d.cornerRadiusScale??1, blockCustoms:d.blockCustoms||null, emitArtifact:true })._shapeArtifact[16]
  console.log(`${mode.padEnd(18)}: dimple = ${maxTurn(T.iA[0])}°`)
}
