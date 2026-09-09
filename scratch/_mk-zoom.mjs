// Tight per-collection crop at an arbitrary point, plus the chains that feed it.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const [X,Z,R] = process.argv.slice(2).map(Number)
const f = feed('lafayette-square'); const tg = buildProto(f)
const v = { x:X-R, z:Z-R, w:2*R, h:2*R }, sw=(2*R/400).toFixed(3)
const bb=(r)=>{let A=1/0,B=-1/0,C=1/0,D=-1/0;for(const p of r){const x=p[0]??p.x,y=p[1]??p.z;if(x<A)A=x;if(x>B)B=x;if(y<C)C=y;if(y>D)D=y}return{A,B,C,D}}
const hit=(o)=>!(o.B<v.x||o.A>v.x+v.w||o.D<v.z||o.C>v.z+v.h)
const ar=(r)=>{let s=0;for(let k=0,n=r.length;k<n;k++){const p=r[k],q=r[(k+1)%n];s+=p[0]*q[1]-q[0]*p[1]}return s/2}
const PANES=[['① proto',tg.proto],['asphalt+highway',[...tg.asphalt,...tg.highway]],['curb band',tg.protoBands.curb],['treelawn',tg.protoBands.treelawn],['sidewalk',tg.protoBands.sidewalk],['lu',tg.protoBands.lu]]
let g='',defs=''
PANES.forEach(([name,rings],k)=>{
  const ox=v.x-k*(v.w*1.02); let body=''
  const list=(rings||[]).filter(r=>r.length>=3&&hit(bb(r))).map(r=>({r,a:ar(r)})).sort((x,y)=>Math.abs(y.a)-Math.abs(x.a))
  for(const {r,a} of list) body+=`<polygon points="${r.map(p=>p[0]+','+p[1]).join(' ')}" fill="${a<0?'#e88':'#8ac'}" fill-opacity="0.7" stroke="#123" stroke-width="${sw}"/><circle cx="${r[0][0]}" cy="${r[0][1]}" r="${sw*2}" fill="#000"/>`
  // chains on top, thin
  for(const st of (f.ribbons.streets||f.ribbons)) { const pts=st.points||st.pts||st.centerline; if(!pts) continue
    const P=pts.map(p=>[p.x??p[0],p.z??p[1]]); if(!hit(bb(P))) continue
    body+=`<polyline points="${P.map(p=>p[0]+','+p[1]).join(' ')}" fill="none" stroke="#c0f" stroke-width="${sw*1.2}"/>` }
  defs+=`<clipPath id="z${k}"><rect x="${v.x}" y="${v.z}" width="${v.w}" height="${v.h}"/></clipPath>`
  g+=`<g transform="translate(${-ox},${-v.z})" clip-path="url(#z${k})"><rect x="${v.x}" y="${v.z}" width="${v.w}" height="${v.h}" fill="#fff"/>${body}<text x="${v.x+1}" y="${v.z+v.h*0.07}" font-size="${v.w*0.06}" fill="#000">${name}</text></g>`
})
fs.writeFileSync('scratch/_mk-zoom.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="${380*PANES.length}" height="380" viewBox="0 0 ${v.w*(PANES.length+0.12)} ${v.h}"><defs>${defs}</defs>${g}</svg>`)
console.log('ok')
