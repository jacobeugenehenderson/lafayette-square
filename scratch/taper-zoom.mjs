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
const c=[178,214], W=80, px=1500, sc=px/W
const minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
const X=x=>((maxx-x)*sc).toFixed(1), Y=y=>((maxy-y)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
const fill=(rings,col)=>{let dd='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
fill(pr.asphalt,'#d0d0d0')
for(const rr of (pr.block||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#e0007f" stroke-width="2.5"/>`}
// carrB centerline (orange), thick + vertices
const cb=r.streets.find(x=>x.skelId==="lafayette-avenue-6").points
s+=`<path d="${cb.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="#f80" stroke-width="3"/>`
for(const p of cb){if(Math.abs(p[0]-c[0])<W/2&&Math.abs(p[1]-c[1])<W/2)s+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5" fill="#f80"/>`}
// straight-section projection (dashed orange): line through pts[3],[4] extended
const p3=cb[3], p4=cb[4]; let ux=p4[0]-p3[0],uz=p4[1]-p3[1]; const ul=Math.hypot(ux,uz); ux/=ul; uz/=ul
const A=[p4[0]+ux*40, p4[1]+uz*40], B=[p4[0]-ux*40, p4[1]-uz*40]
s+=`<path d="M${X(A[0])} ${Y(A[1])} L${X(B[0])} ${Y(B[1])}" stroke="#c60" stroke-width="2" stroke-dasharray="10 6"/>`
// mark #1
const m=marks[1]; s+=`<path d="${m.map((p,i)=>(i?'L':'M')+X(p.x)+' '+Y(p.z)).join(' ')}" fill="none" stroke="#000" stroke-width="2.5" stroke-dasharray="8 4"/>`
s+=`<circle cx="${X(166.5)}" cy="${Y(221.9)}" r="7" fill="red"/><text x="${X(166.5)+10}" y="${Y(221.9)}" font-size="20" fill="red">node</text>`
s+=`<text x="14" y="30" font-size="22" fill="#f80">orange=carrB centerline (solid) + straight projection (dashed)</text>`
s+=`<text x="14" y="56" font-size="22" fill="#e0007f">pink=parcel/curb edge</text><text x="14" y="82" font-size="22" fill="#000">black=your mark #1 · grey fill=road</text>`
s+=`<text x="${px/2}" y="26" font-size="24" fill="#080" text-anchor="middle">N</text><text x="${px-26}" y="${px/2}" font-size="24" fill="#080">E</text>`
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./taper-zoom.png',import.meta.url).pathname)
console.log('ok')
