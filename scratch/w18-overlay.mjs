// READ-ONLY forensic — attribution overlay. Stroke tile#4 and tile#16 ped bands
// SEPARATELY (distinct colors) + asphalt + junction aprons + iA outlines, so the
// throat sliver's true source is visible (band-overlap vs apron vs round-tip wrap).
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround, sectionPass } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth, customs = d.blockCustoms || null
const stripMat = { outer:'LU', inner:'SW' }
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: customs, emitArtifact: true })
const tiles = pr._shapeArtifact
const sp = (idx) => sectionPass([tiles[idx]], cw, stripMat, customs)
const A = sp(4), B = sp(16)
const flat = (byLu) => Object.values(byLu||{}).flat()

async function crop(name, cx, cy, W, px=1300){
  const sc=px/W, minx=cx-W/2, miny=cy-W/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#d8cfb0">`
  const fill=(rings,f,op=1)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${f}" fill-rule="evenodd" fill-opacity="${op}"/>`}
  const line=(rings,col,w=1.5)=>{for(const rr of(rings||[])){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="${col}" stroke-width="${w}"/>`}}
  fill(pr.asphalt,'#4a4a4a')
  // tile#4 (the big block w/ cul-de-sac tips) — warm; tile#16 — cool. overlap shows as mix.
  fill(flat(A.tlByLu),'#2e8b2e',0.7); fill(A.Wacc,'#ff7755',0.7)
  fill(flat(B.tlByLu),'#1144aa',0.7); fill(B.Wacc,'#ffd11a',0.7)
  // iA outlines
  line(tiles[4].iA,'#aa0000',1.2); line(tiles[16].iA,'#0000aa',1.2)
  // junction aprons (E3.2) + corner cuts
  line(pr._jPolys||[],'#ff00ff',2); line(pr._jCornerCuts||[],'#00ffff',2)
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./w18-ov-${name}.png`,import.meta.url).pathname)
  console.log('wrote w18-ov-'+name+'.png')
}
await crop('rcorner', 609, -391, 70)
await crop('lcorner', 516, -414, 70)
await crop('mid', 562, -402, 120)
console.log('legend: asphalt grey | tile4 TL=green SW=salmon | tile16 TL=blue SW=yellow | iA red/blue | apron magenta | cornercut cyan')
