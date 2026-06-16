import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
async function crop(name, cx, cy, W, px=1000){
  const sc=px/W, minx=cx-W/2, miny=cy-W/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#7aa356">`
  const path=(rings,fill,stroke,sw)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" fill-rule="evenodd" ${stroke?`stroke="${stroke}" stroke-width="${sw||1}"`:''}/>`}
  for(const rings of Object.values(pr.treelawnByLu))path(rings,'#7aa356')
  for(const[k,rings]of Object.entries(pr.luByClass||{}))path(rings,k==='median'?'#7aa356':'#cfc3a8')
  path(pr.sidewalk,'#e8e3d6'); path(pr.curb,'#c89b6a'); path(pr.asphalt,'#4a4a4a')
  // centerlines (blue) for context
  for(const st of r.streets){ if(!st.points||st.points.length<2)continue; const p=st.points; let inside=false; for(const q of p) if(q[0]>minx&&q[0]<minx+W&&q[1]>miny&&q[1]<miny+W){inside=true;break;} if(!inside)continue; s+=`<path d="${p.map((q,i)=>(i?'L':'M')+X(q[0])+' '+Y(q[1])).join(' ')}" fill="none" stroke="#1414ff" stroke-width="2.5"/>` }
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./handle-${name}.png`,import.meta.url).pathname)
  console.log('wrote handle-'+name+'.png')
}
await crop('18th-kennett',388,110,95)
await crop('carroll',540,120,130)
