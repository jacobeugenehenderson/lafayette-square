import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(fs.readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const opts = { blockCustoms: design.blockCustoms || null, smooth:0, emitArtifact:true }
const tipKey=(p)=>Math.round(p[0]*1000)+','+Math.round(p[1]*1000)
const streets=(ribbons.streets||[]).filter(s=>s?.points?.length>=2&&!s.gradeSeparated)
const nodeDeg=new Map()
for(const s of streets){const pts=s.points; for(let i=0;i<pts.length;i++){const inc=(i===0||i===pts.length-1)?1:2; const k=tipKey(pts[i]); nodeDeg.set(k,(nodeDeg.get(k)||0)+inc)}}
function reshape(rib, EPS){ rib.tiles.forEach((ft)=>{ const ring=ft.ring, edges=ft.edges, n=edges.length
  for(let i=0;i<n;i++){ const e=edges[i], en=edges[(i+1)%n]
    if(e.skelId===en.skelId && e.side!==en.side && nodeDeg.get(tipKey(ring[(i+1)%n]))===1){
      const iA=i, iB=(i+2)%n, prev=ring[(i-1+n)%n], next=ring[(i+3)%n]
      let dx=ring[iA][0]-prev[0], dy=ring[iA][1]-prev[1]; let L=Math.hypot(dx,dy)||1; dx/=L;dy/=L
      ring[iA]=[ring[iA][0]-dx*EPS, ring[iA][1]-dy*EPS]
      let ex=next[0]-ring[iB][0], ey=next[1]-ring[iB][1]; let L2=Math.hypot(ex,ey)||1; ex/=L2;ey/=L2
      ring[iB]=[ring[iB][0]+ex*EPS, ring[iB][1]+ey*EPS] } } }) }
const iaHash=(st)=>JSON.stringify((st.iA||[]).map(r=>r.map(p=>[Math.round(p[0]*1000),Math.round(p[1]*1000)])))
const allHash=(g)=>JSON.stringify(g._shapeArtifact.map(iaHash).sort())
const g0=buildTileGround(JSON.parse(JSON.stringify(ribbons)), opts); const h0=allHash(g0)
for(const EPS of [0.002,0.01,0.05,0.1,0.25,0.5,1.0]){
  const rib2=JSON.parse(JSON.stringify(ribbons)); reshape(rib2,EPS)
  const g1=buildTileGround(rib2, opts)
  console.log(`EPS=${EPS}  iA byte-identical=${allHash(g1)===h0}`)
}
