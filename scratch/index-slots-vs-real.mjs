import { readFileSync } from 'fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'
const RB=JSON.parse(readFileSync('src/data/ribbons.json','utf8'))
const D =JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf8'))
const streets=RB.streets.filter(s=>Array.isArray(s.points)&&s.points.length>=2)
const ix=resolveChainSegmentation(streets)
const segs=new Map()
for(const s of streets){
  const n=s.points.length, set=ix.get(s)
  const ixs=set?[...set].filter(i=>Number.isInteger(i)&&i>0&&i<n-1).sort((a,b)=>a-b):[]
  const out=[];let prev=0
  if(!ixs.length)out.push({start:0,end:n-1})
  else{for(const i of ixs){if(i>prev)out.push({start:prev,end:i});prev=i}if(prev<n-1)out.push({start:prev,end:n-1})}
  segs.set(s.skelId,out.map(g=>{const sl=s.points.slice(g.start,g.end+1);let L=0
    for(let i=1;i<sl.length;i++)L+=Math.hypot(sl[i][0]-sl[i-1][0],sl[i][1]-sl[i-1][1]);return{...g,len:L}}))
}
console.log('AUTHORED SLOTS vs the ACTUAL committed src/data/ribbons.json (the world the operator authored in)\n')
const bc=D.blockCustoms||{}; let ok=0,bad=0,caps=0
for(const skel of Object.keys(bc))for(const side of Object.keys(bc[skel]))for(const so of Object.keys(bc[skel][side])){
  const n=Number(so); const S=segs.get(skel)
  if(n<0){caps++;console.log(`  ${`${skel}|${side}|${so}`.padEnd(36)} CAP — chain ${S?'present':'⛔ ABSENT'}`);continue}
  if(!S){bad++;console.log(`  ${`${skel}|${side}|${n}`.padEnd(36)} ⛔ CHAIN ABSENT from ribbons`);continue}
  if(n>=S.length){bad++;console.log(`  ${`${skel}|${side}|${n}`.padEnd(36)} ⛔ ORPHAN — chain has ${S.length} segs`);continue}
  ok++
}
console.log(`\n  resolve: ${ok}   orphan/absent: ${bad}   caps: ${caps}`)
// zero-length phantom segments across the whole map
let phantom=0, chainsWithPhantom=0
for(const [id,S] of segs){const p=S.filter(g=>g.len<0.01);if(p.length){phantom+=p.length;chainsWithPhantom++}}
console.log(`\n  ZERO-LENGTH phantom segments in committed ribbons: ${phantom} across ${chainsWithPhantom} chains`)
console.log(`  (each one consumes a segOrd and shifts every later slot on its chain)`)
