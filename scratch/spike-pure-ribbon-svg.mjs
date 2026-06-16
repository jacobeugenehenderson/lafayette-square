import { readFileSync, writeFileSync } from 'fs'
import { buildPureRibbonShape } from '../cartograph/spike-pure-ribbon.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json', import.meta.url)))
const pr = buildPureRibbonShape(ribbons, { stencil: bnd.boundary })

// Render each material as ONE path with all rings as subpaths + fill-rule
// nonzero — Clipper output carries correct CCW-outer / CW-hole winding, so
// nonzero fills holes exactly. No manual hole pairing (that was the bug).
const COL = { lu:'#cdebb0', sidewalk:'#d8d2c4', treelawn:'#8fcf63', curb:'#666', asphalt:'#4a4a4a' }
const order = [['lu',pr.lu],['sidewalk',pr.sidewalk],['treelawn',pr.treelawn],['curb',pr.curb],['asphalt',pr.asphalt]]
function view(minx, miny, w, h, stroke=0.3) {
  const sc = 1000 / w, Y=(y)=>(y-miny)*sc, X=(x)=>(x-minx)*sc
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${(h*sc).toFixed(0)}" viewBox="0 0 1000 ${(h*sc).toFixed(0)}" style="background:#161616">`
  for (const [k, rings] of order) {
    let d=''
    for (const r of rings) { if(!r||r.length<3)continue; d += r.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z ' }
    if(d) svg += `<path d="${d}" fill="${COL[k]}" fill-rule="nonzero" stroke="#0a0a0a" stroke-width="${stroke}" stroke-opacity="0.55"/>`
  }
  return svg+'</svg>'
}
writeFileSync(new URL('./spike-full.svg', import.meta.url), view(-185,-185,370,370,0.25))
writeFileSync(new URL('./spike-ix.svg', import.meta.url), view(-72,-72,64,64,0.4))
writeFileSync(new URL('./spike-block.svg', import.meta.url), view(-62,-62,124,124,0.4))
writeFileSync(new URL('./spike-edge.svg', import.meta.url), view(-5,42,85,125,0.5))
console.log('rendered nonzero')
