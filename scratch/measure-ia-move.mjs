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
// Hausdorff-ish: for each reshaped tile, max distance from each new iA vert to the nearest base iA vert.
const g0=buildTileGround(JSON.parse(JSON.stringify(ribbons)), opts)
const bbox=(st)=>{let a=[1e9,1e9,-1e9,-1e9];for(const r of (st.iA||[]))for(const p of r){a[0]=Math.min(a[0],p[0]);a[1]=Math.min(a[1],p[1]);a[2]=Math.max(a[2],p[0]);a[3]=Math.max(a[3],p[1])}return a}
const baseTiles=g0._shapeArtifact.map(t=>({bb:bbox(t),pts:t.iA.flat()}))
const rib2=JSON.parse(JSON.stringify(ribbons)); reshape(rib2,2.0)
const g1=buildTileGround(rib2, opts)
let globalMax=0
g1._shapeArtifact.forEach(t=>{
  const bb=bbox(t)
  // find base tile by overlapping bbox center
  const c=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2]
  let bt=null,bd=1e9; for(const b of baseTiles){const bc=[(b.bb[0]+b.bb[2])/2,(b.bb[1]+b.bb[3])/2]; const d=Math.hypot(bc[0]-c[0],bc[1]-c[1]); if(d<bd){bd=d;bt=b}}
  let tmax=0
  for(const p of t.iA.flat()){ let nd=1e9; for(const q of bt.pts){const d=Math.hypot(p[0]-q[0],p[1]-q[1]); if(d<nd)nd=d} if(nd>tmax)tmax=nd }
  if(tmax>globalMax)globalMax=tmax
})
console.log(`EPS=2.0: max iA Hausdorff deviation across ALL tiles = ${globalMax.toFixed(4)} m`)
