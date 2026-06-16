import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { mergeLiveRibbons } from '../src/lib/mergeLiveRibbons.js'
const toyRibbons = JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json', import.meta.url)))
// live path: mergeLiveRibbons(ribbons, []) with no live edits
const liveRibbons = mergeLiveRibbons(toyRibbons, [])
const stencil = bnd.boundary
const live = buildTileGround(liveRibbons, { stencil, curbWidth: 0.1524 })
// bake path: same module, file ribbons
const bake = buildTileGround(toyRibbons, { stencil, curbWidth: 0.1524 })
const ct = (o)=>['asphalt','curb','treelawn','sidewalk','lu'].map(k=>k+':'+(o[k]?.length||0)).join(' ')
console.log('LIVE rings ', ct(live))
console.log('BAKE rings ', ct(bake))
// quick area sum equality check (WYSIWYG)
function totArea(rings){let a=0;for(const r of rings){for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}}return Math.abs(a/2)}
for(const k of ['asphalt','curb','treelawn','sidewalk','lu']){
  const la=totArea(live[k]||[]).toFixed(1), ba=totArea(bake[k]||[]).toFixed(1)
  console.log(k.padEnd(9), 'live area', la, '| bake area', ba, la===ba?'✓ MATCH':'✗ DIFFER')
}
