import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const marks = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/marker_strokes.json', import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
const base={stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:1,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null}
const c=[230,170], W=230, px=1700, sc=px/W
const minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1), Y=y=>((maxy-y)*sc).toFixed(1)
function render(tag, clampOn){
  const pr=buildTileGround(r,{...base,dividedClamp:clampOn})
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
  const fill=(rings,col)=>{let dd='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
  fill(pr.asphalt,'#d8d8d8')
  for(const rr of (pr.block||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#e0007f" stroke-width="2"/>`}
  const chains={'lafayette-avenue-3':['#0a0','laf-spine'],'lafayette-avenue-5':['#06c','laf-carrA'],'lafayette-avenue-6':['#f80','laf-carrB'],'mississippi-avenue':['#90c','mississippi']}
  for(const st of r.streets){const c2=chains[st.skelId];if(!c2)continue;s+=`<path d="${st.points.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="${c2[0]}" stroke-width="1.5"/>`}
  for(const mi of [0,1]){const m=marks[mi];s+=`<path d="${m.map((p,i)=>(i?'L':'M')+X(p.x)+' '+Y(p.z)).join(' ')}" fill="none" stroke="#000" stroke-width="3" stroke-dasharray="9 5"/>`}
  s+=`<circle cx="${X(166.5)}" cy="${Y(221.9)}" r="6" fill="red"/>`
  let ly=34;for(const k in chains){s+=`<text x="14" y="${ly}" font-size="20" fill="${chains[k][0]}">${chains[k][1]}</text>`;ly+=24}
  s+=`<text x="14" y="${ly}" font-size="20" fill="#000">black dashed = marks #0,#1</text>`
  s+=`<text x="14" y="${ly+26}" font-size="22" fill="#000">${tag}</text>`
  s+=`<text x="${px/2}" y="28" font-size="24" fill="#080" text-anchor="middle">N</text><text x="${px-26}" y="${px/2}" font-size="24" fill="#080">E</text>`
  s+='</svg>'
  return s
}
for(const [tag,on] of [["nw OFF",false],["nw ON",true]]){
  await sharp(Buffer.from(render(tag,on))).png().toFile(new URL(`./pin-nw-${on?'ON':'OFF'}.png`,import.meta.url).pathname)
}
console.log('ok')
