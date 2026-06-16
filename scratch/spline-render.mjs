import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const RB = process.argv[2] || '../src/data/ribbons.json'
const TAG = process.argv[3] || 'live'
const r = JSON.parse(readFileSync(new URL(RB, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
async function crop(name, cx, cy, W, H, px=1100){
  const sc=px/W, Hpx=Math.round(H*sc), minx=cx-W/2, miny=cy-H/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${Hpx}" style="background:#6f9b52">`
  const path=(rings,fill,stroke,sw)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" fill-rule="evenodd" ${stroke?`stroke="${stroke}" stroke-width="${sw||1}"`:''}/>`}
  for(const rings of Object.values(pr.treelawnByLu))path(rings,'#7aa356')
  for(const[k,rings]of Object.entries(pr.luByClass||{}))path(rings,k==='median'?'#7aa356':'#cfc3a8')
  path(pr.sidewalk,'#e8e3d6'); path(pr.curb,'#b07a48'); path(pr.asphalt,'#4a4a4a')
  for(const st of r.streets){ if(!st.points||st.points.length<2)continue; const p=st.points; let inside=false; for(const q of p) if(q[0]>minx&&q[0]<minx+W&&q[1]>miny&&q[1]<miny+H){inside=true;break;} if(!inside)continue; s+=`<path d="${p.map((q,i)=>(i?'L':'M')+X(q[0])+' '+Y(q[1])).join(' ')}" fill="none" stroke="#1466ff" stroke-width="2"/>`; // dead-end markers
    const dd=st.caps; }
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./spline-${name}-${TAG}.png`,import.meta.url).pathname)
  console.log('wrote spline-'+name+'-'+TAG+'.png  ('+px+'x'+Hpx+')')
}
// full horseshoe: x 360..710, z -420..255  => center (535,-82), W=360, H=690
await crop('full', 535, -82, 380, 700)
// upper dead-end region: x 360..510, z 90..260 => center (435,175) W=170 H=190
await crop('upper', 435, 175, 180, 200)
