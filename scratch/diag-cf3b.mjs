import fs from 'fs'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const mod = await import(ROOT + '/src/lib/tileGround.js')
const { buildTileGround } = mod
const ribbons = JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json'))
const bnd = JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json'))
const design = JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const signedArea = (r) => { let a=0; for(let i=0;i<r.length;i++){const j=(i+1)%r.length; a += r[i][0]*r[j][1]-r[j][0]*r[i][1]} return a/2 }
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const tg=buildTileGround(ribbons,{stencil:clip,smooth:1.5,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true})
const tiles = tg._shapeArtifact || []
console.log('cw =', design.curbWidth, ' tiles:', tiles.length)
const targets=[[118.7,523.7],[774.8,108.0],[647.3,-647.9]]
for(const T of targets){
  // find tile whose iA has a vertex nearest T
  let best=null
  tiles.forEach((t,ti)=>{ for(const r of (t.iA||[])) for(const v of r){ const d=dist(v,T); if(!best||d<best.d) best={ti,d,v} } })
  console.log('\n=== target',T,'-> tile',best.ti,'nearest iA vtx',best.v.map(x=>+x.toFixed(2)),'d=',best.d.toFixed(2))
  const t=tiles[best.ti]
  // dump iA verts within 12m of T, with turn angle
  for(const r of t.iA){
    const idxs=[]; r.forEach((v,i)=>{ if(dist(v,T)<10) idxs.push(i) })
    if(!idxs.length) continue
    console.log(' iA ring n='+r.length+' area='+signedArea(r).toFixed(1))
    for(const i of idxs){ const p0=r[(i-1+r.length)%r.length],v=r[i],p1=r[(i+1)%r.length]
      const e1=dist(p0,v),e2=dist(v,p1)
      const cr=((v[0]-p0[0])*(p1[1]-v[1])-(v[1]-p0[1])*(p1[0]-v[0]))
      const dot=((v[0]-p0[0])/(e1||1))*((p1[0]-v[0])/(e2||1))+((v[1]-p0[1])/(e1||1))*((p1[1]-v[1])/(e2||1))
      const turn=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI
      console.log('   i='+i,'v=',v.map(x=>+x.toFixed(2)),'e1='+e1.toFixed(2),'e2='+e2.toFixed(2),'turn='+turn.toFixed(1),'cross='+(cr>0?'+':'-'))
    }
  }
}
