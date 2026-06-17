import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const pr = buildTileGround(ribbons, { emitArtifact: true })
const tiles = pr._shapeArtifact || []
const dist = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const marks = { '#2':[196,221], '#3':[-365,127] }

function turnProfile(ring){
  const n=ring.length, out=[]
  for(let i=0;i<n;i++){
    const a=ring[(i-1+n)%n],v=ring[i],b=ring[(i+1)%n]
    const e1=dist(a,v),e2=dist(v,b)
    if(e1<1e-6||e2<1e-6){out.push({v,turn:0,e1,e2});continue}
    const d=((v[0]-a[0])/e1)*((b[0]-v[0])/e2)+((v[1]-a[1])/e1)*((b[1]-v[1])/e2)
    const turn=Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI
    out.push({v:[+v[0].toFixed(1),+v[1].toFixed(1)],turn:+turn.toFixed(0),e1:+e1.toFixed(1),e2:+e2.toFixed(1)})
  }
  return out
}

for(const [name,M] of Object.entries(marks)){
  console.log(`\n================ MARK ${name} @[${M}] ================`)
  // find tiles with any iA vertex within 35m of the mark
  const hits=[]
  tiles.forEach((t,ti)=>{
    if(!t.iA) return
    let mind=Infinity
    for(const r of t.iA) for(const v of r) mind=Math.min(mind,dist(v,M))
    if(mind<35) hits.push({ti,mind,t})
  })
  hits.sort((a,b)=>a.mind-b.mind)
  for(const {ti,mind,t} of hits.slice(0,4)){
    const area=t.iA.reduce((s,r)=>{let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1]}return s+Math.abs(a/2)},0)
    const names=[...new Set((t.runs||[]).map(r=>r.name||r.skelId))].join(', ')
    console.log(`\n  tile ${ti}  nearest-iA-vert=${mind.toFixed(1)}m  isMedian=${!!t.isMedian}  iA-rings=${t.iA.length}  iA-area=${area.toFixed(0)}`)
    console.log(`    runs: ${names}`)
    for(const r of t.iA){
      const prof=turnProfile(r)
      // show vertices within 25m of mark with their turn
      const local=prof.map((p,i)=>({...p,i})).filter(p=>dist(p.v,M)<25)
      if(!local.length) continue
      console.log(`    ring(${r.length}v): local verts near mark (turn° / edge-in / edge-out):`)
      for(const p of local) console.log(`      [${p.v}] turn=${p.turn}° e=(${p.e1},${p.e2})`)
    }
  }
}
