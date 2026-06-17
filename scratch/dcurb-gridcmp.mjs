import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const build=(p)=>{const r=JSON.parse(fs.readFileSync(p,'utf8'));return buildTileGround(r,{emitArtifact:true})._shapeArtifact||[]}
const A=build('/tmp/ribbons-HEAD.json'), B=build('./src/data/ribbons.json')
// match tiles by centroid (tile order may shift)
const cent=t=>{let x=0,y=0;for(const p of t.ring){x+=p[0];y+=p[1]}return [x/t.ring.length,y/t.ring.length]}
const sig=t=>JSON.stringify(t.iA)   // geometry signature
const bByCent=B.map(t=>({c:cent(t),t}))
let same=0,diff=0,unmatched=0; const diffs=[]
for(const ta of A){
  const ca=cent(ta)
  let best=null,bd=1e9
  for(const e of bByCent){const d=Math.hypot(e.c[0]-ca[0],e.c[1]-ca[1]);if(d<bd){bd=d;best=e}}
  if(bd>2){unmatched++;continue}
  if(sig(ta)===sig(best.t)) same++
  else { diff++; diffs.push({c:ca.map(v=>v.toFixed(0)),names:[...new Set((ta.runs||[]).map(r=>r.name))].filter(Boolean)}) }
}
console.log(`tiles A=${A.length} B=${B.length}  same=${same} diff=${diff} unmatched=${unmatched}`)
for(const d of diffs) console.log(`  DIFF @[${d.c}]  ${d.names.join(', ')}`)
