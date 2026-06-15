import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null, emitArtifact: true })
// render iA of tiles 16 + 4 over the through-road region (the screenshot area)
const cx=560, cy=-415, W=200, ppx=1500, sc=ppx/W, minx=cx-W/2, miny=cy-W/2
const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#16243a">`
for (const ti of [16,4]){ const T=pr._shapeArtifact[ti]; if(!T)continue
  for(const ring of T.iA) s+=`<path d="${ring.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#5a8fd0" stroke-width="2"/>` }
// navy centerline of the through-road
for(const id of ['west-18th-street','south-18th-street-3','dolman-street-1']){const st=r.streets.find(x=>(x.skelId)===id); if(st) s+=`<path d="${st.points.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="#0a1a4a" stroke-width="2.5"/>`}
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./mitre-road.png',import.meta.url).pathname)
console.log('wrote mitre-road.png')
