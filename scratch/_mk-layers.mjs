// One pane per band, same crop — so nothing about the stack is guessed.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const i = Number(process.argv[2] || 9)
const f = feed('lafayette-square'); const tg = buildProto(f)
const strokes = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/clean/marker_strokes.json','utf8'))
const st = strokes[i]
const PAD = 30
let a=1/0,b=-1/0,c=1/0,d=-1/0; for(const p of st){if(p.x<a)a=p.x;if(p.x>b)b=p.x;if(p.z<c)c=p.z;if(p.z>d)d=p.z}
const v = { x:a-PAD, z:c-PAD, w:(b-a)+2*PAD, h:(d-c)+2*PAD }
const sw = (v.w/400).toFixed(3)
const PANES = [['asphalt+highway',[...tg.asphalt,...tg.highway]],['curb',tg.protoBands.curb],['treelawn',tg.protoBands.treelawn],['sidewalk',tg.protoBands.sidewalk],['lu',tg.protoBands.lu]]
const bb=(r)=>{let A=1/0,B=-1/0,C=1/0,D=-1/0;for(const p of r){if(p[0]<A)A=p[0];if(p[0]>B)B=p[0];if(p[1]<C)C=p[1];if(p[1]>D)D=p[1]}return{A,B,C,D}}
const hit=(o)=>!(o.B<v.x||o.A>v.x+v.w||o.D<v.z||o.C>v.z+v.h)
const ar=(r)=>{let s=0;for(let k=0,n=r.length;k<n;k++){const p=r[k],q=r[(k+1)%n];s+=p[0]*q[1]-q[0]*p[1]}return s/2}
let g=''
PANES.forEach(([name,rings],k)=>{
  const ox = v.x - k*(v.w*1.02)
  let body=''
  const list=(rings||[]).filter(r=>r.length>=3&&hit(bb(r))).map(r=>({r,a:ar(r)})).sort((x,y)=>Math.abs(y.a)-Math.abs(x.a))
  for(const {r,a} of list) body+=`<polygon points="${r.map(p=>p[0]+','+p[1]).join(' ')}" fill="${a<0?'#e55':'#7aa'}" fill-opacity="0.75" stroke="#123" stroke-width="${sw}"/>`
  g+=`<g transform="translate(${-ox},${-v.z})" clip-path="url(#c${k})"><rect x="${v.x}" y="${v.z}" width="${v.w}" height="${v.h}" fill="#fff"/>${body}<polyline points="${st.map(p=>p.x+','+p.z).join(' ')}" fill="none" stroke="#e00" stroke-width="${sw*3}"/><text x="${v.x+2}" y="${v.z+v.h*0.06}" font-size="${v.w*0.05}" fill="#000">${name}</text></g>`
})
const defs = PANES.map((_,k)=>`<clipPath id="c${k}"><rect x="${v.x}" y="${v.z}" width="${v.w}" height="${v.h}"/></clipPath>`).join('')
fs.writeFileSync(`scratch/_mk-layers-${i}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="${420*5}" height="${Math.round(420*v.h/v.w)}" viewBox="0 0 ${v.w*5.1} ${v.h}"><defs>${defs}</defs>${g}</svg>`)
console.log('wrote', i)
