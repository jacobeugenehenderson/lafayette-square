import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
function bumpsNear(ring,fx,fy,R=14){const n=ring.length;const out=[]
  for(let i=0;i<n;i++){const v=ring[i];if(Math.hypot(v[0]-fx,v[1]-fy)>R)continue
    const a=ring[(i-1+n)%n],b=ring[(i+1)%n],ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1],li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
    if(li>3||lo>3)continue
    const t=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
    if(t>15)out.push(`@[${v[0].toFixed(1)},${v[1].toFixed(1)}]${t.toFixed(0)}°`)}return out}
for (const fix of [false,true]){
  const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
  if(fix){const s=r.streets.find(x=>x.skelId==='dolman-street-1'); s.measure.left.pavementHW=5.49}
  const T=buildTileGround(r,{stencil:clip,smooth:0,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null,emitArtifact:true})._shapeArtifact
  const b4=[]; for(const ring of T[4].iA) b4.push(...bumpsNear(ring,612.9,-394.8))
  console.log(`${fix?'Dolman.left=5.49':'Dolman.left=3.76'}: tile-4 bumps near W18/Dolman seam = ${b4.length?b4.join(' '):'NONE'}`)
}
