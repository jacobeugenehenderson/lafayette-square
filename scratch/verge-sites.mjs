// READ-ONLY — render 3 divided sites: asphalt(black) + rendered median grass(green)
// + frozen median ring(blue outline). Shows the needle: green vs the blue healthy ring.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const base = { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true }
const out = buildTileGround(r, { ...base })
const asph = out.asphalt || []
const med = (out.luByClass && out.luByClass.median) || []
const fz = (r.medians||[]).filter(m=>m.kind==='median').map(m=>m.ring)
async function crop(name, cx, cy, W, H) {
  const ppx=1000, sc=ppx/Math.max(W,H), minx=cx-W/2, miny=cy-H/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${(W*sc).toFixed(0)}" height="${(H*sc).toFixed(0)}" style="background:#cfcfcf">`
  for(const rr of asph){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="#222" stroke="none"/>`}
  for(const rr of med){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="#3a3" stroke="none"/>`}
  for(const rr of fz){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#08f" stroke-width="2" stroke-dasharray="6 4"/>`}
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./${name}.png`,import.meta.url).pathname)
  console.log('wrote',name)
}
// Chouteau divided pair around [420,-520]
await crop('verge-chouteau', 420,-520, 320, 160)
// Lafayette divided (tiles 33,34,100) around [300,250]
await crop('verge-lafayette', 250,250, 420, 200)
// S-Jefferson vertical (tile 102) around [-392,-60]
await crop('verge-sjefferson', -392,-60, 200, 460)
// Park Ave around [650,0] (tiles 30,88,89)
await crop('verge-park', 620,-30, 320, 200)
