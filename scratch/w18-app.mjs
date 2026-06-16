import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const tag = process.argv[2] || 'x'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer+50, sc0=tR/bnd.radius, cx0=bnd.center[0], cz0=bnd.center[1]
const clip = bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0, cz0+(z-cz0)*sc0])
const pr = buildTileGround(r,{stencil:clip,smooth:0,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null})
async function crop(name,cx,cy,W,ppx=1400){
  const minx=cx-W/2,miny=cy-W/2,maxx=cx+W/2,maxy=cy+W/2,sc=ppx/W,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
  const hit=rr=>{for(const p of rr)if(p[0]>minx-10&&p[0]<maxx+10&&p[1]>miny-10&&p[1]<maxy+10)return true;return false}
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#8fbf5f">`
  const fill=(rings,f)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3||!hit(rr))continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${f}" fill-rule="evenodd"/>`}
  for(const rings of Object.values(pr.luByClass||{}))fill(rings,'#8fbf5f')
  for(const rings of Object.values(pr.treelawnByLu||{}))fill(rings,'#8fbf5f')
  fill(pr.curb,'#cbb89a'); fill(pr.sidewalk,'#eef0ea'); fill(pr.asphalt,'#4a4a4a')
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./w18-app-${name}-${tag}.png`,import.meta.url).pathname)
  console.log(`wrote w18-app-${name}-${tag}.png (svg ${(s.length/1024).toFixed(0)}kb)`)
}
await crop('wide', 575, -400, 175)
