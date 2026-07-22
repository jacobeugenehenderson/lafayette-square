import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const { buildTileGround } = await import(path.join(ROOT,'src/lib/tileGround.js'))
const rd=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))
const ribbons=rd('cartograph/data/hipointe-demun/clean/ribbons.json')
const bnd=rd('cartograph/data/hipointe-demun/neighborhood_boundary.json')
const design=rd('public/looks/hipointe-demun/design.json')
const tR=bnd.streetFade.outer+50, sc0=tR/bnd.radius, cx0=bnd.center[0], cz0=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0,cz0+(z-cz0)*sc0])
const pr=buildTileGround(ribbons,{stencil:clip,smooth:0,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true})
const tiles=pr._shapeArtifact||[]
const node=[-4.4,931.3]
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
console.error('\n=== ALL iA vertices within 18m of node, per tile ===')
for(const st of tiles){
  const iA=st.iA||[]
  const rings=(Array.isArray(iA[0])&&typeof iA[0][0]==='number')?[iA]:iA
  for(const ring of rings){
    if(!ring||ring.length<3)continue
    const near=ring.map((p,i)=>({p,i})).filter(o=>len(o.p,node)<18)
    if(!near.length)continue
    console.error(`tile skel=${st.skelId||'?'} (ring ${ring.length} verts):`)
    for(const {p} of near) console.error(`   [${p[0].toFixed(1)},${p[1].toFixed(1)}]`)
  }
}
