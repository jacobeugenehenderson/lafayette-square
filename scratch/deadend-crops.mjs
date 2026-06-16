import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse })
async function crop(name, cx, cy, W=120, px=700){
  const sc=px/W, minx=cx-W/2, miny=cy-W/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path=(rings,fill)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.4"/>`}
  path(pr.asphalt,'#3a3a3a')
  for(const[k,rings]of Object.entries(pr.luByClass||{}))path(rings,k==='median'?'#6aa84f':'#2a2218')
  for(const rings of Object.values(pr.treelawnByLu))path(rings,'#6aa84f')
  path(pr.sidewalk,'#e8e2d4');path(pr.curb,'#888')
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./deadend-${name}.png`,import.meta.url).pathname)
  console.log('wrote deadend-'+name+'.png')
}
await crop('vail',295,85)
await crop('albion',-361,-109)
await crop('simpson',-163,271)
