import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
const cx=-373, cy=-116, W=15, px=1100
const sc=px/W, minx=cx-W/2, miny=cy-W/2
const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#222">`
const path=(rings,fill,stroke,sw)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" fill-rule="evenodd" ${stroke?`stroke="${stroke}" stroke-width="${sw||1}"`:''}/>`}
path(pr.asphalt,'#4a4a4a')
for(const rings of Object.values(pr.treelawnByLu))path(rings,'#3a7a3aaa','#0f0',1.5)   // treelawn green outline
path(pr.sidewalk,'#e8e3d6aa','#f00',1.5)   // sidewalk red outline
// draw tile rings (frozen) as cyan outlines
for(const t of r.tiles){
  const ring=t.ring; const bb=ring.reduce((a,p)=>[Math.min(a[0],p[0]),Math.min(a[1],p[1]),Math.max(a[2],p[0]),Math.max(a[3],p[1])],[1e9,1e9,-1e9,-1e9])
  if(bb[2]<minx||bb[0]>minx+W||bb[3]<miny||bb[1]>miny+W) continue
  s+=`<path d="${ring.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#0ff" stroke-width="2" stroke-opacity="0.9"/>`
}
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./notch-diag.png',import.meta.url).pathname)
console.log('wrote notch-diag.png (cyan=tile rings, red=sidewalk, green=treelawn)')
