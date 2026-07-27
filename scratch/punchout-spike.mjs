// Does "outer polygon MINUS the roads" already resolve the dead-end that the
// centerline-graph face turns into a slit? V2 builds block rings exactly that way
// (blockSharp = differenceRings([stencil], asphaltSharp)). Measure the NOTCH at the
// tips that the face freeze collapses.
import fs from 'fs'
const o=console.log;console.log=()=>{}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const ribbons=JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const nb=JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
let design={};try{design=JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json','utf8'))}catch{}
const sc0=((nb?.streetFade?.outer??nb.radius)+50)/nb.radius,[cx,cz]=nb.center
const stencil=nb.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const v2=buildBlockGeometryV2(ribbons,{stencil,blockCustoms:design.blockCustoms||null,curbWidth:design.curbWidth??0.15,blockLandUse:design.blockLandUse,__debugRings:true})
console.log=o
const rings=v2.__blockRings||[]
const area=(r)=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return a/2}
o(`block rings from stencil − asphalt: ${rings.length}   (total |area| ${rings.reduce((s,r)=>s+Math.abs(area(r)),0).toFixed(0)} m2)`)

// the 9 chains whose FACE tip is an unpatched slit
const SLITS=['south-18th-street-3','dolman-street-1','mackay-place-1','waverly-place-1','carroll-street-0','papin-street-0','park-avenue-3','geyer-avenue-0','south-jefferson-avenue-8']
const chain=new Map()
for(const s of (ribbons.streets||[])){const k=s.skelId||s.name;if(k&&s.points?.length>1)chain.set(k,s.points)}
o(`\nDoes the punch-out give BOTH sides a frontage edge at these tips?`)
for(const k of SLITS){
  const pts=chain.get(k); if(!pts){o(`  ${k}: no chain`);continue}
  const fes=v2.frontageEdges.filter(f=>(f.chainSkelId||f.chainName)===k)
  const sides=new Set(fes.map(f=>f.side))
  // notch width near the tip: nearest block-ring vertex on each side of the last segment
  const n=pts.length,a=pts[n-2],b=pts[n-1]
  const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz)||1,nx=-dz/L,nz=dx/L
  const probe=[b[0]-dx/L*6, b[1]-dz/L*6]      // 6 m back from the tip
  let dPos=1/0,dNeg=1/0
  for(const r of rings) for(const p of r){
    const s=(p[0]-probe[0])*nx+(p[1]-probe[1])*nz, perp=Math.abs(s)
    const along=Math.abs((p[0]-probe[0])*dx/L+(p[1]-probe[1])*dz/L)
    if(along>4)continue
    if(s>0)dPos=Math.min(dPos,perp); else dNeg=Math.min(dNeg,perp)
  }
  const w=(dPos+dNeg)
  o(`  ${k.padEnd(26)} fes on sides {${[...sides].sort().join(',')}}  notch ≈ ${isFinite(w)?w.toFixed(2)+' m':'—'} (${isFinite(dNeg)?dNeg.toFixed(1):'-'} + ${isFinite(dPos)?dPos.toFixed(1):'-'})`)
}
