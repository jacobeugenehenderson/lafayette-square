import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const rd=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))
const ribbons=rd('cartograph/data/hipointe-demun/clean/ribbons.json')
const node=[-4.4,931.3]
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const ang=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI
const ids=['clayton-road-0','de-mun-avenue-2','de-mun-avenue-3','alamo-avenue-0','seminary-place-1']
for(const st of ribbons.streets){
  if(!ids.includes(st.skelId||st.id)) continue
  const P=st.points
  console.log(`\n### ${st.skelId||st.id}  (${P.length} pts)  phase.role=${st.phase?.role||'-'} pairId=${st.pairId||'-'} innerSign=${st.innerSign??'-'}`)
  console.log(`  measure.left.pavementHW=${st.measure?.left?.pavementHW}  right=${st.measure?.right?.pavementHW}`)
  console.log(`  START [${P[0][0].toFixed(2)},${P[0][1].toFixed(2)}]  END [${P[P.length-1][0].toFixed(2)},${P[P.length-1][1].toFixed(2)}]`)
  console.log(`  dist(START,node)=${len(P[0],node).toFixed(2)}  dist(END,node)=${len(P[P.length-1],node).toFixed(2)}`)
  // which end is at the node?
  const atStart=len(P[0],node)<len(P[P.length-1],node)
  const tip=atStart?0:P.length-1
  console.log(`  --> tip-at-node is ${atStart?'START':'END'}; last 5 verts approaching the node:`)
  const seq=atStart?P.slice(0,6):P.slice(-6).reverse()
  for(let i=0;i<seq.length;i++) console.log(`      [${seq[i][0].toFixed(2)},${seq[i][1].toFixed(2)}]${i>0?`  seg len=${len(seq[i],seq[i-1]).toFixed(2)} heading=${ang(seq[i],seq[i-1]).toFixed(1)}°`:''}`)
  // prevailing direction: chord over the ~last 15m of body approaching the node
  let acc=0,far=tip
  const step=atStart?1:-1
  let j=tip
  while(acc<15 && j+step>=0 && j+step<P.length){ acc+=len(P[j],P[j+step]); j+=step; far=j }
  console.log(`  prevailing dir over ~${acc.toFixed(1)}m (tip->body): heading ${ang(P[far],P[tip]).toFixed(1)}° from far[${P[far][0].toFixed(2)},${P[far][1].toFixed(2)}] to tip[${P[tip][0].toFixed(2)},${P[tip][1].toFixed(2)}]`)
}
