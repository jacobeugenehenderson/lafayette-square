import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(fs.readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const opts = { blockCustoms: design.blockCustoms || null, smooth:0 }
const tipKey=(p)=>Math.round(p[0]*1000)+','+Math.round(p[1]*1000)

// deg-1 nodes (geometric) to confirm a spur tip
const streets=(ribbons.streets||[]).filter(s=>s?.points?.length>=2&&!s.gradeSeparated)
const nodeDeg=new Map()
for(const s of streets){const pts=s.points; for(let i=0;i<pts.length;i++){const inc=(i===0||i===pts.length-1)?1:2; const k=tipKey(pts[i]); nodeDeg.set(k,(nodeDeg.get(k)||0)+inc)}}

function reshape(rib, EPS){
  let count=0
  rib.tiles.forEach((ft)=>{ const ring=ft.ring, edges=ft.edges, n=edges.length
    for(let i=0;i<n;i++){ const e=edges[i], en=edges[(i+1)%n]
      if(e.skelId===en.skelId && e.side!==en.side && nodeDeg.get(tipKey(ring[(i+1)%n]))===1){
        const iA=i, iB=(i+2)%n
        const prev=ring[(i-1+n)%n], next=ring[(i+3)%n]
        let dx=ring[iA][0]-prev[0], dy=ring[iA][1]-prev[1]; let L=Math.hypot(dx,dy)||1; dx/=L;dy/=L
        ring[iA]=[ring[iA][0]-dx*EPS, ring[iA][1]-dy*EPS]
        let ex=next[0]-ring[iB][0], ey=next[1]-ring[iB][1]; let L2=Math.hypot(ex,ey)||1; ex/=L2;ey/=L2
        ring[iB]=[ring[iB][0]+ex*EPS, ring[iB][1]+ey*EPS]
        count++
      } } })
  return count
}
const iaHash=(st)=>JSON.stringify((st.iA||[]).map(r=>r.map(p=>[Math.round(p[0]*1000),Math.round(p[1]*1000)])))
const ringKey=(t)=>{ // stable identity for matching tiles across builds: centroid rounded
  const c=t.ring.reduce((a,v)=>[a[0]+v[0]/t.ring.length,a[1]+v[1]/t.ring.length],[0,0]); return Math.round(c[0])+','+Math.round(c[1]) }

const g0=buildTileGround(JSON.parse(JSON.stringify(ribbons)), opts)
const base=new Map(); g0._tiles.forEach(t=>base.set(ringKey(t), iaHash(t)))

const rib2=JSON.parse(JSON.stringify(ribbons)); const nSplit=reshape(rib2, 2.0)
const g1=buildTileGround(rib2, opts)
console.log(`spurs split: ${nSplit}`)
let moved=0, identical=0, missing=0, maxMove=0, movedTiles=[]
g1._tiles.forEach(t=>{
  const k=ringKey(t), b=base.get(k)
  if(b===undefined){missing++;return}
  if(iaHash(t)===b) identical++
  else { moved++; movedTiles.push(k) }
})
console.log(`iA identical tiles: ${identical}, MOVED: ${moved}, unmatched(centroid shifted): ${missing}`)
if(moved) console.log(`moved tile centroids: ${movedTiles.join(' | ')}`)
