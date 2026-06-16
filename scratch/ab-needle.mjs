import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const tag = process.argv[2] || 'x'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:d.streetSmooth??0.5,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,cornerRadiusOverrides:d.cornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null})
const turn=(A,V,B)=>{let ix=V[0]-A[0],iy=V[1]-A[1],ox=B[0]-V[0],oy=B[1]-V[1];const li=Math.hypot(ix,iy),lo=Math.hypot(ox,oy);if(li<1e-6||lo<1e-6)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iy*oy)/(li*lo))))*180/Math.PI}
let worst=0;for(const rr of pr.sidewalk||[]){const m=rr.length;for(let i=0;i<m;i++){const t=turn(rr[(i-1+m)%m],rr[i],rr[(i+1)%m]);if(t>worst)worst=t}}
console.log(tag,'worst sidewalk turn:',worst.toFixed(1)+'°')
function view(minx,miny,w,h,px=1400){const sc=px/w,H=h*sc,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${H.toFixed(0)}" style="background:#161616">`
  const path=(rings,fill)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.4" stroke-opacity="0.6"/>`}
  for(const rings of Object.values(pr.treelawnByLu))path(rings,'#5aa02a');path(pr.sidewalk,'#e8e2d4');path(pr.curb,'#888');path(pr.asphalt,'#4a4a4a');return s+'</svg>'}
const svg=view(0,-380,120,120)
writeFileSync(new URL(`./ab-loop-${tag}.svg`,import.meta.url),svg)
await sharp(Buffer.from(svg)).png().toFile(new URL(`./ab-loop-${tag}.png`,import.meta.url).pathname)
console.log('wrote ab-loop-'+tag+'.png')
