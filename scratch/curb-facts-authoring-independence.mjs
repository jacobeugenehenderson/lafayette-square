import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { buildTileGround } = await import(ROOT+'/scratch/.kerb-probe/tg.facts.mjs')
const run=(rb,bc,cw=0.15)=>{globalThis.__KERB=[];buildTileGround(rb,{stencil:null,curbWidth:cw,smooth:0,blockLandUse:null,cornerRadiusScale:1,cornerRadiusOverrides:null,cornerCornerRadiusOverrides:null,blockCustoms:bc,emitArtifact:true});return globalThis.__KERB}
const cmp=(A,B,lbl)=>{let seg=0,hw=0,nul=0,oth=0,rp=0
 for(let t=0;t<A.length;t++){const a=A[t].facts,d=B[t].facts
   if(JSON.stringify(A[t].runs.map(r=>[r.streetIdx,r.side,r.n]))!==JSON.stringify(B[t].runs.map(r=>[r.streetIdx,r.side,r.n])))rp++
   for(let i=0;i<a.length;i++){const x=a[i],y=d[i]
     if(!x!==!y){nul++;continue} if(!x)continue
     if(x.segOrd!==y.segOrd)seg++
     if(x.baseHW!==y.baseHW)hw++
     if(x.skelId!==y.skelId||x.side!==y.side||x.streetKey!==y.streetKey||x.roadKey!==y.roadKey||JSON.stringify(x.prof)!==JSON.stringify(y.prof))oth++}}
 console.log(`  ${lbl.padEnd(24)} segOrd:${String(seg).padStart(4)} baseHW:${hw} null:${nul} id/prof:${oth} runPartition:${rp}`)}
for(const [scene,rbp] of [['lafayette-square',ROOT+'/src/data/ribbons.json'],['hipointe-demun',ROOT+'/cartograph/data/hipointe-demun/clean/ribbons.json']]){
  const rb=JSON.parse(fs.readFileSync(rbp))
  let bc={};try{bc=JSON.parse(fs.readFileSync(`${ROOT}/public/looks/${scene}/design.json`,'utf8')).blockCustoms||{}}catch{}
  const nAuth=Object.keys(bc).length
  console.log(`\n${scene}: tiles=${rb.tiles?.length}, authored streets=${nAuth}`)
  const A=run(rb,bc), E=run(rb,{}), N=run(rb,null), W=run(rb,{},0.9)
  cmp(A,E,'authored vs empty{}')
  cmp(A,N,'authored vs null')
  cmp(E,W,'curbWidth .15 vs .9')
}
