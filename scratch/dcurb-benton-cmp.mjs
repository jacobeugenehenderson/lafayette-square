import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
for(const [lbl,path] of [["HEAD","/tmp/ribbons-HEAD.json"],["CURRENT","./src/data/ribbons.json"]]){
  const r=JSON.parse(fs.readFileSync(path,"utf8"))
  const b=buildTileGround(r,{emitArtifact:true})
  const meds=(b._shapeArtifact||[]).filter(t=>t.isMedian)
  const areas=meds.map(t=>t.iA.reduce((s,rr)=>{let a=0;for(let i=0;i<rr.length;i++){const p=rr[i],q=rr[(i+1)%rr.length];a+=p[0]*q[1]-q[0]*p[1]}return s+Math.abs(a/2)},0))
  console.log(lbl,"median tiles:",meds.length,"areas 1000-2000:",areas.filter(a=>a>1000&&a<2000).map(a=>a.toFixed(0)).sort())
}
