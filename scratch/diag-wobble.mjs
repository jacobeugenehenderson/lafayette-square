import fs from 'fs'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { buildTileGround } = await import(ROOT + '/src/lib/tileGround.js')
const ribbons = JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json'))
const bnd = JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json'))
const design = JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const sa=(r)=>{let a=0;for(let i=0;i<r.length;i++){const j=(i+1)%r.length;a+=r[i][0]*r[j][1]-r[j][0]*r[i][1]}return a/2}
function mk(sm){ return buildTileGround(ribbons,{stencil:clip,smooth:sm,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true}) }
// take a big healthy tile, measure curb-edge concentricity: for each iA vertex, find
// nearest distance to the tile.ring (the centerline-following face boundary). On a clean
// parallel offset that distance = pavementHW (const per run). Wobble = variance.
const tg=mk(1.5)
const tiles=tg._shapeArtifact||[]
// pick 3 large non-median tiles
const big=tiles.map((t,i)=>({i,t,a:Math.abs(sa(t.ring))})).filter(x=>!x.t.med).sort((a,b)=>b.a-a.a).slice(0,3)
for(const {i,t} of big){
  const ring=t.ring
  // distance from each iA vertex to nearest ring EDGE
  const distToRing=(p)=>{let m=1e9;for(let k=0;k<ring.length;k++){const a=ring[k],b=ring[(k+1)%ring.length];const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1;let u=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2;u=Math.max(0,Math.min(1,u));const px=a[0]+dx*u,py=a[1]+dy*u;m=Math.min(m,Math.hypot(p[0]-px,p[1]-py))}return m}
  const ds=[]
  for(const r of t.iA) for(const v of r) ds.push(distToRing(v))
  ds.sort((a,b)=>a-b)
  const mean=ds.reduce((s,x)=>s+x,0)/ds.length
  const variance=ds.reduce((s,x)=>s+(x-mean)**2,0)/ds.length
  console.log(`tile ${i} ringArea=${Math.abs(sa(ring)).toFixed(0)} iAverts=${ds.length}  offset-to-ring dist: min=${ds[0].toFixed(2)} median=${ds[Math.floor(ds.length/2)].toFixed(2)} max=${ds[ds.length-1].toFixed(2)} mean=${mean.toFixed(2)} sd=${Math.sqrt(variance).toFixed(2)}`)
}
