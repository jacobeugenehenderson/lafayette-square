import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const {buildTileGround}=await import(ROOT+'/src/lib/tileGround.js')
const r=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json'))
const b=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json'))
const tR=b.streetFade.outer+50,sc=tR/b.radius
const clip=b.boundary.map(([x,z])=>[b.center[0]+(x-b.center[0])*sc,b.center[1]+(z-b.center[1])*sc])
const tg=buildTileGround(r,{stencil:clip,smooth:1.5,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null})
// curb is the band (iA-iC). Measure wiggle on the OUTER boundary of each big curb ring.
let flips=0, big=0, verts=0
for(const g of tg.curb){ if(g.length<20) continue
  verts+=g.length
  let prev=0
  for(let i=0;i<g.length;i++){const a=g[(i-1+g.length)%g.length],v=g[i],c=g[(i+1)%g.length];const ix=v[0]-a[0],iy=v[1]-a[1],ox=c[0]-v[0],oy=c[1]-v[1];const li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1;const cr=(ix/li)*(oy/lo)-(iy/li)*(ox/lo);const t=Math.asin(Math.max(-1,Math.min(1,cr)))*180/Math.PI
    if(Math.abs(t)>5) big++
    if(Math.abs(t)>2){ if(prev && Math.sign(t)!==Math.sign(prev)) flips++; prev=Math.sign(t) }
  }
}
console.log(`curb rings(>=20v): verts=${verts}  turns>5°:${big}  sign-flips(>2°):${flips}`)
