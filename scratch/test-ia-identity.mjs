import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(fs.readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const opts = { blockCustoms: design.blockCustoms || null, smooth:0 }
const iaHash=(st)=>JSON.stringify((st.iA||[]).map(r=>r.map(p=>[Math.round(p[0]*1000),Math.round(p[1]*1000)])))

// BASELINE
const g0 = buildTileGround(JSON.parse(JSON.stringify(ribbons)), opts)
// find tile53 in _tiles by matching the albion mouth in its ring
const findTile=(tiles)=>{ let bi=-1,bd=1e9; tiles.forEach((t,i)=>{ for(const v of (t.ring||[])){ const d=Math.hypot(v[0]+177.5,v[1]+78.7); if(d<bd){bd=d;bi=i} } }); return bi }
const t0i = findTile(g0._tiles)
const base = iaHash(g0._tiles[t0i])
console.log(`baseline tile idx in _tiles = ${t0i}`)

// RESHAPE: in ribbons.tiles, find the frozen tile with the albion mouth, split the mouth vertex.
const rib2 = JSON.parse(JSON.stringify(ribbons))
const mouth=[-177.5,-78.7]
let ftile=-1
rib2.tiles.forEach((t,i)=>{ if(t.ring.some(v=>Math.hypot(v[0]-mouth[0],v[1]-mouth[1])<0.01)) ftile=i })
console.log(`frozen tile with mouth = ${ftile}`)
const ft = rib2.tiles[ftile]
// find the two mouth vertices (albion edges flank them). Identify edges with skelId albion-place.
const ring=ft.ring, edges=ft.edges, n=edges.length
// the spur: edge i (albion left) then edge i+1 (albion right); tip=ring[i+1]; mouthA=ring[i], mouthB=ring[i+2]
for(let i=0;i<n;i++){
  if(edges[i].skelId==='albion-place' && edges[(i+1)%n].skelId==='albion-place' && edges[i].side!==edges[(i+1)%n].side){
    const iMouthA=i, iMouthB=(i+2)%n
    // split: nudge mouthA and mouthB apart along the through-street direction (missouri).
    // missouri direction = from ring[i-1] to ring[i] (the incoming missouri edge)
    const prev=ring[(i-1+n)%n], next=ring[(i+3)%n]
    // perpendicular to spur = along missouri frontage. Use the two flanking edges' directions.
    const EPS=2.0
    // direction of incoming missouri (prev->mouthA)
    let dx=ring[iMouthA][0]-prev[0], dy=ring[iMouthA][1]-prev[1]; let L=Math.hypot(dx,dy)||1; dx/=L;dy/=L
    // move mouthA backward along missouri (toward prev) by EPS, mouthB forward (toward next)
    ring[iMouthA]=[ring[iMouthA][0]-dx*EPS, ring[iMouthA][1]-dy*EPS]
    let ex=next[0]-ring[iMouthB][0], ey=next[1]-ring[iMouthB][1]; let L2=Math.hypot(ex,ey)||1; ex/=L2;ey/=L2
    ring[iMouthB]=[ring[iMouthB][0]+ex*EPS, ring[iMouthB][1]+ey*EPS]
    console.log(`split mouth at edge ${i}: mouthA->${ring[iMouthA].map(x=>+x.toFixed(2))}, mouthB->${ring[iMouthB].map(x=>+x.toFixed(2))}`)
    break
  }
}
const g1 = buildTileGround(rib2, opts)
const t1i = findTile(g1._tiles)
const after = iaHash(g1._tiles[t1i])
console.log(`\niA IDENTICAL: ${base===after}`)
if(base!==after){
  // measure movement
  const A=g0._tiles[t0i].iA.flat(), B=g1._tiles[t1i].iA.flat()
  let maxd=0; const nn=Math.min(A.length,B.length)
  for(let k=0;k<nn;k++){ const d=Math.hypot(A[k][0]-B[k][0],A[k][1]-B[k][1]); if(d>maxd)maxd=d }
  console.log(`  iA vert counts: base=${A.length} after=${B.length}; max per-index move=${maxd.toFixed(3)}m`)
}
