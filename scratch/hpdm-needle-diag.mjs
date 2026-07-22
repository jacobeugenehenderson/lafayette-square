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
const node=[-4.4,931.3]
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const build=(opts)=>buildTileGround(ribbons,{stencil:clip,smooth:0,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true,...opts})

function cluster(ring){ // count near-coincident runs (<0.15m consecutive)
  let mx=0,cur=1
  for(let i=1;i<ring.length;i++){ if(len(ring[i],ring[i-1])<0.15){cur++; mx=Math.max(mx,cur)} else cur=1 }
  return mx
}
function report(label,opts){
  const pr=build(opts)
  const tiles=pr._shapeArtifact||[]
  console.error(`\n===== ${label} =====`)
  tiles.forEach((st,ti)=>{
    const iA=st.iA||[]
    const rings=(Array.isArray(iA[0])&&typeof iA[0][0]==='number')?[iA]:iA
    for(const ring of rings){
      if(!ring||ring.length<3)continue
      const near=ring.filter(p=>len(p,node)<18)
      if(near.length<3)continue
      const cl=cluster(ring)
      const runIds=(st.runs||[]).map(r=>r.skelId||r.streetIdx).filter((v,i,a)=>a.indexOf(v)===i)
      console.error(`tile#${ti} ring=${ring.length} near=${near.length} maxCluster=${cl} isMedian=${!!st.isMedian} thruEnds=${st.thruNodeEnds?st.thruNodeEnds.length:0}`)
      console.error(`   runs: ${runIds.join(', ')}`)
    }
  })
}
report('DEFAULT (offset on)',{})
report('iaOffset:false (force legacy carve)',{iaOffset:false})
