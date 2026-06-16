import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
const LEGS={'south-18th-street-3':'#ff0000','dolman-street-1':'#ff00ff','west-18th-street':'#ff8800'}
async function crop(name, cx, cy, W, H, px=900){
  const sc=px/W, Hpx=Math.round(H*sc), minx=cx-W/2, miny=cy-H/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${Hpx}" style="background:#d000d0">`
  const path=(rings,fill,stroke,sw)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" fill-rule="evenodd" ${stroke?`stroke="${stroke}" stroke-width="${sw||1}"`:''}/>`}
  for(const[k,rings]of Object.entries(pr.luByClass||{}))path(rings,k==='median'?'#39a039':'#cfc3a8')
  for(const rings of Object.values(pr.treelawnByLu))path(rings,'#7aa356')
  path(pr.sidewalk,'#e8e3d6'); path(pr.curb,'#b07a48'); path(pr.asphalt,'#4a4a4a')
  for(const st of r.streets){const col=LEGS[st.skelId||st.id];if(!col)continue;const p=st.points;s+=`<path d="${p.map((q,i)=>(i?'L':'M')+X(q[0])+' '+Y(q[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`;for(const e of [p[0],p[p.length-1]]) s+=`<circle cx="${X(e[0])}" cy="${Y(e[1])}" r="4" fill="${col}"/>`}
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./spline-${name}.png`,import.meta.url).pathname)
  console.log('wrote spline-'+name+'.png')
}
await crop('zoom-uclose', 565, -402, 180, 130)   // bottom arc where U closes
await crop('zoom-carroll', 445, 108, 200, 150)    // Carroll crossing both legs
await crop('zoom-deadtops', 425, 230, 180, 120)   // the two dead-end tops
