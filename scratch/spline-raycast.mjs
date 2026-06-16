import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
// gather all curb ring segments
const segs=[]
for(const ring of (pr.curb||[])){ for(let i=0;i<ring.length;i++){ const a=ring[i],b=ring[(i+1)%ring.length]; segs.push([a[0],a[1],b[0],b[1]]); } }
function rayHit(px,pz,dx,dz){ // nearest t>0 along (px,pz)+(dx,dz)
  let best=Infinity
  for(const[x1,z1,x2,z2] of segs){ const ex=x2-x1,ez=z2-z1; const den=dx*ez-dz*ex; if(Math.abs(den)<1e-9)continue; const t=((x1-px)*ez-(z1-pz)*ex)/den; const u=((x1-px)*dz-(z1-pz)*dx)/den; if(t>0.05&&u>=0&&u<=1&&t<best)best=t; }
  return best
}
for(const id of ["south-18th-street-3","dolman-street-1"]){
  const s=r.streets.find(x=>(x.skelId||x.id)===id); const p=s.points
  console.log(`\n=== ${id} (left.hw=${s.measure?.left?.pavementHW} right.hw=${s.measure?.right?.pavementHW}) ===`)
  console.log(" z      pt           leftRay  rightRay")
  for(let i=1;i<p.length;i++){ const a=p[i-1],b=p[i]; const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2
    const tx=b[0]-a[0],tz=b[1]-a[1]; const L=Math.hypot(tx,tz)||1; const ux=tx/L,uz=tz/L
    const lx=-uz,lz=ux; // left normal
    const lr=rayHit(mx,mz,lx,lz), rr=rayHit(mx,mz,-lx,-lz)
    console.log(`${mz.toFixed(0).padStart(5)}  (${mx.toFixed(0)},${mz.toFixed(0)})`.padEnd(22)+`  ${lr.toFixed(1).padStart(6)}  ${rr.toFixed(1).padStart(7)}`)
  }
}
