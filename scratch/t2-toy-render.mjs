import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json', import.meta.url)))
const pr = buildTileGround(ribbons, { stencil: bnd.boundary, smooth: 0.5 })
const COL = { lu:'#cdebb0', sidewalk:'#d8d2c4', treelawn:'#8fcf63', curb:'#666', asphalt:'#4a4a4a' }
const order = [['lu',pr.lu],['sidewalk',pr.sidewalk],['treelawn',pr.treelawn],['curb',pr.curb],['asphalt',pr.asphalt]]
function view(minx, miny, w, h, stroke=0.25) {
  const sc = 1000 / w, Y=(y)=>(y-miny)*sc, X=(x)=>(x-minx)*sc
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${(h*sc).toFixed(0)}" viewBox="0 0 1000 ${(h*sc).toFixed(0)}" style="background:#161616">`
  for (const [k, rings] of order) { let d=''; for (const r of rings){ if(!r||r.length<3)continue; d += r.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z ' } if(d) svg += `<path d="${d}" fill="${COL[k]}" fill-rule="nonzero" stroke="#0a0a0a" stroke-width="${stroke}" stroke-opacity="0.5"/>` }
  return svg+'</svg>'
}
writeFileSync(new URL('./t2-toy-full.svg', import.meta.url), view(-185,-185,370,370))
// zoom on the roundabout area (top-right, ~85,-105 .. Benton loop center 85,-80)
writeFileSync(new URL('./t2-toy-loop.svg', import.meta.url), view(40,-130,110,110,0.5))
console.log('ok')
