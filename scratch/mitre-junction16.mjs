import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const T = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: 1, blockCustoms: d.blockCustoms||null, emitArtifact: true })._shapeArtifact[16]
// centerlines of the runs
const cls = {}
for (const run of T.runs) { const so = r.streets.find(s => (s.skelId || s.name) === run.skelId); if (so) cls[run.skelId] = so.points }
const cx=519, cy=-409, W=70, ppx=1200, sc=ppx/W, minx=cx-W/2, miny=cy-W/2
const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#fff">`
for (const rr of T.iA){ s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="#eee" stroke="#000" stroke-width="1.5"/>` }
const colors={'west-18th-street':'#d00','south-18th-street-3':'#08c','dolman-street-1':'#0a0','hickory-street-0':'#c0c'}
for (const [k,pts] of Object.entries(cls)){ const c=colors[k]||'#888'; s+=`<path d="${pts.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="4 3"/>`; const m=pts[Math.floor(pts.length/2)]; s+=`<text x="${X(m[0])}" y="${Y(m[1])}" fill="${c}" font-size="16">${k}</text>` }
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./mitre-junction16.png', import.meta.url).pathname)
console.log('wrote mitre-junction16.png')
