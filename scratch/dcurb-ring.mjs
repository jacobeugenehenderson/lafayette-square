import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const pr = buildTileGround(ribbons, { emitArtifact: true })
const tiles = pr._shapeArtifact || []
const dist = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
function prof(ring,M,rad){
  const n=ring.length,out=[]
  for(let i=0;i<n;i++){
    const a=ring[(i-1+n)%n],v=ring[i],b=ring[(i+1)%n]
    if(dist(v,M)>rad)continue
    const e1=dist(a,v),e2=dist(v,b)
    let turn=0
    if(e1>1e-6&&e2>1e-6){const d=((v[0]-a[0])/e1)*((b[0]-v[0])/e2)+((v[1]-a[1])/e1)*((b[1]-v[1])/e2);turn=Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI}
    out.push(`    [${v[0].toFixed(1)},${v[1].toFixed(1)}] turn=${turn.toFixed(0)}° e=(${e1.toFixed(1)},${e2.toFixed(1)})`)
  }
  return out
}
// tile 53 (mark#3) and tile 10 (mark#2)
const cases=[['#3 tile53',53,[-365,127]],['#2 tile10',10,[196,221]]]
for(const [lbl,ti,M] of cases){
  const t=tiles[ti]
  console.log(`\n===== ${lbl} =====  isMedian=${!!t.isMedian}`)
  console.log(`  INPUT FACE RING (tile.ring) near mark:`)
  prof(t.ring,M,28).forEach(l=>console.log(l))
  console.log(`  OUTPUT iA near mark:`)
  for(const r of t.iA) prof(r,M,28).forEach(l=>console.log(l))
}
