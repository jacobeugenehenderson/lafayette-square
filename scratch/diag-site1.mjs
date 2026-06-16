import fs from 'fs'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { buildTileGround } = await import(ROOT + '/src/lib/tileGround.js')
const ribbons = JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json'))
const bnd = JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json'))
const design = JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const signedArea = (r) => { let a=0; for(let i=0;i<r.length;i++){const j=(i+1)%r.length; a += r[i][0]*r[j][1]-r[j][0]*r[i][1]} return a/2 }
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const tg=buildTileGround(ribbons,{stencil:clip,smooth:1.5,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true})
const T=[118.7,523.7]
// the band spur lives in tg.curb. Find the curb ring with the 166° spur near T
for(const r of tg.curb){
  for(let i=0;i<r.length;i++){ const v=r[i]; if(dist(v,T)>3) continue
    const a=r[(i-1+r.length)%r.length],b=r[(i+1)%r.length]
    const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1];const li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
    const turn=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
    if(turn>150) console.log('CURB ring n='+r.length+' area='+signedArea(r).toFixed(1)+' spur@i'+i,v.map(x=>+x.toFixed(2)),'e1='+li.toFixed(2),'e2='+lo.toFixed(2),'turn='+turn.toFixed(1))
  }
}
// now the iA of the owning tile
const tiles = tg._shapeArtifact||[]
let best=null
tiles.forEach((t,ti)=>{ for(const r of (t.iA||[])) for(const v of r){ const d=dist(v,T); if(!best||d<best.d) best={ti,d} } })
const t=tiles[best.ti]
console.log('\nowning tile',best.ti)
for(const r of t.iA){ const idxs=[]; r.forEach((v,i)=>{if(dist(v,T)<8)idxs.push(i)}); if(!idxs.length)continue
  console.log(' iA ring n='+r.length+' area='+signedArea(r).toFixed(1))
  for(const i of idxs){const a=r[(i-1+r.length)%r.length],v=r[i],b=r[(i+1)%r.length];const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1];const li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1;const turn=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
    console.log('   i'+i,v.map(x=>+x.toFixed(2)),'e1='+li.toFixed(2),'e2='+lo.toFixed(2),'turn='+turn.toFixed(1))}
}
