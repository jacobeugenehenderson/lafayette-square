import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(fs.readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const opts = { blockCustoms: design.blockCustoms || null, smooth:0 }
const mouth=[-177.5,-78.7]
function reshape(rib, EPS){
  rib.tiles.forEach((ft)=>{ const ring=ft.ring, edges=ft.edges, n=edges.length
    for(let i=0;i<n;i++){ const e=edges[i], en=edges[(i+1)%n]
      if(e.skelId===en.skelId && e.side!==en.side){ const iA=i, iB=(i+2)%n
        const prev=ring[(i-1+n)%n], next=ring[(i+3)%n]
        let dx=ring[iA][0]-prev[0], dy=ring[iA][1]-prev[1]; let L=Math.hypot(dx,dy)||1; dx/=L;dy/=L
        ring[iA]=[ring[iA][0]-dx*EPS, ring[iA][1]-dy*EPS]
        let ex=next[0]-ring[iB][0], ey=next[1]-ring[iB][1]; let L2=Math.hypot(ex,ey)||1; ex/=L2;ey/=L2
        ring[iB]=[ring[iB][0]+ex*EPS, ring[iB][1]+ey*EPS] } } })
}
function draw(g, fname){
  const cx=-180,cy=-78,span=55,SC=900/span
  const sx=(x)=>(x-(cx-span/2))*SC, sy=(y)=>((cy+span/2)-y)*SC
  const path=(rings,fill,op=1)=>(rings||[]).filter(g=>g&&g.length>=3).map(ring=>`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="${fill}" fill-opacity="${op}"/>`).join('')
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" style="background:#444">`
  svg+=path(g.asphalt,'#666',1)
  for(const k in (g.luByClass||{})) svg+=path(g.luByClass[k],'#2a4',0.7)
  for(const k in (g.treelawnByLu||{})) svg+=path(g.treelawnByLu[k],'#6b3',0.95)
  svg+=path(g.sidewalk,'#f0e0a0',1)
  svg+='</svg>'; fs.writeFileSync(new URL('../scratch/'+fname,import.meta.url),svg)
}
const g0=buildTileGround(JSON.parse(JSON.stringify(ribbons)), opts); draw(g0,'mouth-base.svg')
const rib2=JSON.parse(JSON.stringify(ribbons)); reshape(rib2,2.0)
const g1=buildTileGround(rib2, opts); draw(g1,'mouth-reshaped.svg')
console.log('done; asphalt keys', Object.keys(g0).filter(k=>!k.startsWith('_')))
