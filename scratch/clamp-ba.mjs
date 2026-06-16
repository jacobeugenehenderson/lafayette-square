import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR=bnd.streetFade.outer+50,scl=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*scl,cz+(z-cz)*scl])
const base={stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:1,cornerRadiusOverrides:null,cornerCornerRadiusOverrides:d.cornerCornerRadiusOverrides||null,blockCustoms:d.blockCustoms||null}
const OFF=buildTileGround(r,{...base,dividedClamp:false})
const ON =buildTileGround(r,{...base,dividedClamp:true})
// render a corner, both states side by side
function panel(pr, c, W, label){
  const px=900, sc=px/W, minx=c[0]-W/2,maxx=c[0]+W/2,miny=c[1]-W/2,maxy=c[1]+W/2
  const X=x=>((maxx-x)*sc).toFixed(1), Y=y=>((maxy-y)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#fff">`
  const fill=(rings,col)=>{let dd='';for(const rr of (rings||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${col}"/>`}
  fill(pr.asphalt,'#cfcfcf')
  for(const rr of (pr.block||[])){if(!rr||rr.length<3)continue;if(!rr.some(p=>Math.abs(p[0]-c[0])<W&&Math.abs(p[1]-c[1])<W))continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#e0007f" stroke-width="2"/>`}
  for(const st of r.streets){if(!["park-avenue-0","park-avenue-3","park-avenue-1"].includes(st.skelId))continue;s+=`<path d="${st.points.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="#06c" stroke-width="1.5"/>`}
  s+=`<text x="12" y="30" font-size="26" fill="#000">${label}</text>`
  s+='</svg>'
  return s
}
// both park-corner transitions; window covers the carriageway-outer blocks
for(const [name,c,W] of [["park",[440,-60],120],["nw",[150,235],120]]){
  for(const [tag,pr] of [["OFF",OFF],["ON",ON]]){
    const svg=panel(pr,c,W,name+" "+tag)
    await sharp(Buffer.from(svg)).png().toFile(new URL(`./clamp-${name}-${tag}.png`,import.meta.url).pathname)
  }
}
console.log("ok")
