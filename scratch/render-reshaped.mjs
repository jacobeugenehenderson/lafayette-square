import fs from 'fs'
import { buildTileGround, sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(fs.readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const opts = { blockCustoms: design.blockCustoms || null, smooth:0 }
const cw=CURB_WIDTH, mouth=[-177.5,-78.7]

function reshape(rib, EPS){
  rib.tiles.forEach((ft)=>{
    const ring=ft.ring, edges=ft.edges, n=edges.length
    for(let i=0;i<n;i++){
      const e=edges[i], en=edges[(i+1)%n]
      if(e.skelId===en.skelId && e.side!==en.side){
        // is the shared vertex (i+1) a deg-1 tip? approximate: spur. split mouth verts i and i+2
        const iA=i, iB=(i+2)%n
        const prev=ring[(i-1+n)%n], next=ring[(i+3)%n]
        let dx=ring[iA][0]-prev[0], dy=ring[iA][1]-prev[1]; let L=Math.hypot(dx,dy)||1; dx/=L;dy/=L
        ring[iA]=[ring[iA][0]-dx*EPS, ring[iA][1]-dy*EPS]
        let ex=next[0]-ring[iB][0], ey=next[1]-ring[iB][1]; let L2=Math.hypot(ex,ey)||1; ex/=L2;ey/=L2
        ring[iB]=[ring[iB][0]+ex*EPS, ring[iB][1]+ey*EPS]
      }
    }
  })
}
const rib2=JSON.parse(JSON.stringify(ribbons)); reshape(rib2, 2.0)
const g=buildTileGround(rib2, opts)
// find tile with mouth
let ti=-1,bd=1e9; g._tiles.forEach((t,i)=>{for(const v of t.ring){const d=Math.hypot(v[0]-mouth[0],v[1]-mouth[1]);if(d<bd){bd=d;ti=i}}})
const st=g._tiles[ti]
const r=sectionPassTile(st,cw,{outer:'LU',inner:'SW'},opts.blockCustoms)
const cx=-180,cy=-78,span=55,SC=900/span
const sx=(x)=>(x-(cx-span/2))*SC, sy=(y)=>((cy+span/2)-y)*SC
const path=(rings,fill,op=1)=>rings.filter(g=>g.length>=3).map(ring=>`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="${fill}" fill-opacity="${op}"/>`).join('')
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" style="background:#444">`
svg+=path(st.iA,'#666',1)
for(const k in r.luByLu) svg+=path(r.luByLu[k],'#2a4',0.7)
for(const k in r.tlByLu) svg+=path(r.tlByLu[k],'#6b3',0.95)
svg+=path(r.Wacc,'#f0e0a0',1)
for(const ring of st.iA) svg+=`<path d="M${ring.map(p=>sx(p[0]).toFixed(1)+','+sy(p[1]).toFixed(1)).join('L')}Z" fill="none" stroke="#000" stroke-width="0.8"/>`
svg+='</svg>'; fs.writeFileSync(new URL('../scratch/tile53-reshaped.svg',import.meta.url),svg)
console.log('rendered reshaped tile idx',ti)
