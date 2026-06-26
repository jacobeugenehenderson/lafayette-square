import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(fs.readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const opts = { blockCustoms: design.blockCustoms || null, smooth:0, emitArtifact:true }
const tipKey=(p)=>Math.round(p[0]*1000)+','+Math.round(p[1]*1000)
const streets=(ribbons.streets||[]).filter(s=>s?.points?.length>=2&&!s.gradeSeparated)
const nodeDeg=new Map()
for(const s of streets){const pts=s.points; for(let i=0;i<pts.length;i++){const inc=(i===0||i===pts.length-1)?1:2; const k=tipKey(pts[i]); nodeDeg.set(k,(nodeDeg.get(k)||0)+inc)}}
function reshape(rib, EPS){ let c=0; rib.tiles.forEach((ft)=>{ const ring=ft.ring, edges=ft.edges, n=edges.length
  for(let i=0;i<n;i++){ const e=edges[i], en=edges[(i+1)%n]
    if(e.skelId===en.skelId && e.side!==en.side && nodeDeg.get(tipKey(ring[(i+1)%n]))===1){
      const iA=i, iB=(i+2)%n, prev=ring[(i-1+n)%n], next=ring[(i+3)%n]
      let dx=ring[iA][0]-prev[0], dy=ring[iA][1]-prev[1]; let L=Math.hypot(dx,dy)||1; dx/=L;dy/=L
      ring[iA]=[ring[iA][0]-dx*EPS, ring[iA][1]-dy*EPS]
      let ex=next[0]-ring[iB][0], ey=next[1]-ring[iB][1]; let L2=Math.hypot(ex,ey)||1; ex/=L2;ey/=L2
      ring[iB]=[ring[iB][0]+ex*EPS, ring[iB][1]+ey*EPS]; c++ } } }); return c }
const iaHash=(st)=>JSON.stringify((st.iA||[]).map(r=>r.map(p=>[Math.round(p[0]*1000),Math.round(p[1]*1000)])))
const bbox=(st)=>{let a=[1e9,1e9,-1e9,-1e9];for(const r of (st.iA||[]))for(const p of r){a[0]=Math.min(a[0],p[0]);a[1]=Math.min(a[1],p[1]);a[2]=Math.max(a[2],p[0]);a[3]=Math.max(a[3],p[1])}return a.map(x=>Math.round(x*100)).join(',')}
const g0=buildTileGround(JSON.parse(JSON.stringify(ribbons)), opts)
const baseByBox=new Map(); g0._shapeArtifact.forEach(t=>baseByBox.set(bbox(t), iaHash(t)))
const rib2=JSON.parse(JSON.stringify(ribbons)); const nS=reshape(rib2,2.0)
const g1=buildTileGround(rib2, opts)
let identical=0,moved=0,unmatched=0, movers=[]
g1._shapeArtifact.forEach(t=>{ const b=baseByBox.get(bbox(t)); if(b===undefined){unmatched++;movers.push('UNMATCHED bbox='+bbox(t));return} if(iaHash(t)===b)identical++; else {moved++; movers.push('MOVED bbox='+bbox(t))} })
console.log(`spurs split=${nS}`)
console.log(`REAL iA (shapeArtifact): identical=${identical} moved=${moved} unmatched=${unmatched} total=${g1._shapeArtifact.length}`)
const allHash=(g)=>JSON.stringify(g._shapeArtifact.map(iaHash).sort())
console.log(`FULL-MAP iA byte-identical: ${allHash(g0)===allHash(g1)}`)
const sumV=(g)=>g._shapeArtifact.reduce((s,t)=>s+(t.iA||[]).reduce((a,r)=>a+r.length,0),0)
console.log(`total iA verts: base=${sumV(g0)} reshaped=${sumV(g1)}`)
if(movers.length) console.log(movers.slice(0,10).join('\n'))
