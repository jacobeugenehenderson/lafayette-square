import { readFileSync } from 'fs'
const B='public/baked/ksi-y-m-yn'
const man=JSON.parse(readFileSync(`${B}/buildings.json`,'utf8'))
const bb=readFileSync(`${B}/${man.bin}`); const bin=bb.buffer.slice(bb.byteOffset,bb.byteOffset+bb.byteLength)
const fp=new Float32Array(bin,man.footprintByteOffset,man.footprintPointCount*2)
const boxes=man.buildings.map(b=>{const[s,c]=b.footprintRange
  let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9
  for(let i=0;i<c;i++){const x=fp[(s+i)*2],z=fp[(s+i)*2+1]
    if(x<x0)x0=x; if(x>x1)x1=x; if(z<z0)z0=z; if(z>z1)z1=z}
  return {id:b.id,x0,z0,x1,z1}})
const viz=JSON.parse(readFileSync('/tmp/matchviz.json','utf8'))
const U=viz.filter(o=>!o.m)
let b0=0,b10=0,b50=0,bhi=0
const suspects=[]
for(const o of U){
  const a=(o.x1-o.x0)*(o.z1-o.z0); let best=0,bid=null
  for(const q of boxes){
    const ix=Math.min(o.x1,q.x1)-Math.max(o.x0,q.x0), iz=Math.min(o.z1,q.z1)-Math.max(o.z0,q.z0)
    if(ix>0&&iz>0){const v=(ix*iz)/a; if(v>best){best=v;bid=q.id}}
  }
  if(best<=0.001)b0++; else if(best<0.1)b10++; else if(best<0.5)b50++; else {bhi++; if(suspects.length<6)suspects.push({a:Math.round(a),h:o.h,ov:(best*100).toFixed(0),bid})}
}
console.log('  UNMATCHED vs the BAKED footprints the join actually tests:')
console.log(`     0%  (nothing baked there)      ${b0}  (${(100*b0/U.length).toFixed(1)}%)`)
console.log(`     <10%                           ${b10}`)
console.log(`     10-50%                         ${b50}`)
console.log(`     >50%  GENUINE MISS             ${bhi}  (${(100*bhi/U.length).toFixed(1)}%)`)
console.log(`\n  genuine misses: ${bhi} of ${U.length} unmatched, i.e. ${(100*bhi/1066).toFixed(1)}% of all solids`)
if(suspects.length) console.log('  e.g.',suspects.map(s=>`${s.a}m² h${s.h} ov${s.ov}% →${s.bid}`).join('  '))
