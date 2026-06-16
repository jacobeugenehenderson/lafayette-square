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
const perim=(r)=>{let p=0;for(let i=0;i<r.length;i++){const j=(i+1)%r.length;p+=dist(r[i],r[j])}return p}
process.env.NOMED='1'
const tg=buildTileGround(ribbons,{stencil:clip,smooth:1.5,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true})
const tiles=tg._shapeArtifact||[]
const targets={ 'site1(118,523)':[118.7,523.7], 'A(-421,108)':[-421,108], 'B(-406,-266)':[-406,-266] }
for(const [name,T] of Object.entries(targets)){
  let best=null
  tiles.forEach((t,ti)=>{for(const r of(t.iA||[]))for(const v of r){const d=dist(v,T);if(!best||d<best.d)best={ti,d}}})
  const t=tiles[best.ti]
  const A=t.iA.reduce((s,r)=>s+Math.abs(signedArea(r)),0), P=t.iA.reduce((s,r)=>s+perim(r),0)
  console.log(name,'tile',best.ti,'isMed='+!!t.med,'iA area='+A.toFixed(0),'perim='+P.toFixed(0),'meanW='+(2*A/P).toFixed(2))
}
