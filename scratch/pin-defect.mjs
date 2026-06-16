import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const marks = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/marker_strokes.json', import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
const pr=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:1,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null,dividedClamp:false})
const c=[400,-70], W=170, px=1700, sc=px/W
const minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1), Y=y=>((maxy-y)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
const fill=(rings,col)=>{let dd='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
fill(pr.asphalt,'#d8d8d8')
for(const rr of (pr.block||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#e0007f" stroke-width="2"/>`}
const chains={'park-avenue-1':['#0a0','spine'],'park-avenue-0':['#06c','carr-0'],'park-avenue-3':['#f80','carr-3'],'south-18th-street-3':['#90c','18th'],'vail-place':['#0aa','vail'],'kennett-place':['#a60','kennett']}
for(const st of r.streets){const c2=chains[st.skelId];if(!c2)continue;s+=`<path d="${st.points.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="${c2[0]}" stroke-width="1.5"/>`}
// marker #2 (Jacob's mark) bold
const m=marks[2]; s+=`<path d="${m.map((p,i)=>(i?'L':'M')+X(p.x)+' '+Y(p.z)).join(' ')}" fill="none" stroke="#000" stroke-width="3" stroke-dasharray="8 4"/>`
s+=`<circle cx="${X(424.4)}" cy="${Y(-88.7)}" r="6" fill="red"/>`
let ly=34; for(const k in chains){s+=`<text x="14" y="${ly}" font-size="20" fill="${chains[k][0]}">${chains[k][1]}</text>`;ly+=24}
s+=`<text x="14" y="${ly}" font-size="20" fill="#000">black dashed = Jacob's mark #2</text>`
s+=`<text x="${px/2}" y="28" font-size="24" fill="#080" text-anchor="middle">N</text><text x="${px-26}" y="${px/2}" font-size="24" fill="#080">E</text>`
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./pin-defect.png',import.meta.url).pathname)
console.log('ok')
