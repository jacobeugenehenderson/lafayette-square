// READ-ONLY — diagnose S-Jefferson median in the LIT-APP layer order:
// block(blue) → median grass(green) → asphalt(dark) → curb(gray). Shows whether
// the grass is covered by asphalt and where the hairline seam is. Plus median widths.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const out = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null, emitArtifact: true })
const layers = [['#5a8a3a', out.block||[]], ['#3a3a3a', out.asphalt||[]], ['#cfc6b0', out.sidewalk||[]], ['#9bb84a', out.luByClass?.median||[]]]
async function crop(name, cx, cy, W, H) {
  const ppx=520, sc=ppx/W, minx=cx-W/2, miny=cy-H/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${(W*sc).toFixed(0)}" height="${(H*sc).toFixed(0)}" style="background:#0e1830">`
  for(const [col,rings] of layers) for(const rr of rings){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="${col}"/>`}
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./${name}.png`,import.meta.url).pathname)
}
await crop('diag-sjeff', -392,-60, 200, 460)
// median ring widths (approx via area/perimeter*2) for S-Jefferson region
const A=ring=>{let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const P=ring=>{let p=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];p+=Math.hypot(x2-x1,y2-y1)}return p}
const med=(out.luByClass?.median||[]).filter(rr=>{const cx=rr.reduce((s,p)=>s+p[0],0)/rr.length;const cy=rr.reduce((s,p)=>s+p[1],0)/rr.length;return cx>-492&&cx<-292&&cy>-290&&cy<170})
console.log('S-Jeff region median rings: %d', med.length)
for(const rr of med){const a=A(rr),p=P(rr);console.log('  area=%s m²  ~width=%s m  (len~%s m)',a.toFixed(0),(2*a/(p/2)).toFixed(1),(p/2).toFixed(0))}
