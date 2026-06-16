import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const pr = buildTileGround(r, { stencil: clip, curbWidth: design.curbWidth, smooth: design.streetSmooth ?? 0.5, blockLandUse: design.blockLandUse, cornerRadiusScale: design.cornerRadiusScale ?? 1, cornerRadiusOverrides: design.cornerRadiusOverrides || null, blockCustoms: design.blockCustoms || null })
const turn=(A,V,B)=>{let ix=V[0]-A[0],iy=V[1]-A[1],ox=B[0]-V[0],oy=B[1]-V[1];const li=Math.hypot(ix,iy),lo=Math.hypot(ox,oy);if(li<1e-6||lo<1e-6)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iy*oy)/(li*lo))))*180/Math.PI}
// find worst spike cluster in sidewalk
let worst=null
for(const rr of pr.sidewalk||[]){const n=rr.length;for(let i=0;i<n;i++){const t=turn(rr[(i-1+n)%n],rr[i],rr[(i+1)%n]);if(t>160){worst={p:rr[i],t};break}}if(worst)break}
console.log('worst sidewalk spike', worst)
const c = worst ? worst.p : [0,0]
function view(minx,miny,w,h,px=1800){
  const sc=px/w,H=h*sc,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${H.toFixed(0)}" style="background:#161616">`
  const path=(rings,fill,sw=0.3)=>{let d='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;d+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${fill}" stroke="#000" stroke-width="${sw}" stroke-opacity="0.5"/>`}
  for(const rings of Object.values(pr.treelawnByLu)) path(rings,'#5aa02a')
  path(pr.sidewalk,'#e8e2d4'); path(pr.curb,'#888'); path(pr.asphalt,'#4a4a4a')
  return s+'</svg>'
}
const W=40
const svg=view(c[0]-W/2,c[1]-W/2,W,W,1800)
writeFileSync(new URL('./spike-zoom.svg',import.meta.url),svg)
await sharp(Buffer.from(svg)).png().toFile(new URL('./spike-zoom.png',import.meta.url).pathname)
console.log('wrote spike-zoom.png centered', c, 'window', W,'m')
