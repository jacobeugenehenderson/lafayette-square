// Dry-run the tile bake shape on LS to catch errors before wiring adoption.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const design=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=(bnd.streetFade.outer+50),sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const t0=Date.now()
const pr=buildTileGround(r,{stencil:clip,curbWidth:design.curbWidth,smooth:design.streetSmooth??0.5})
console.log('LS tile build',Date.now()-t0,'ms')
for(const k of ['asphalt','curb','treelawn','sidewalk','lu']){
  const rings=pr[k]||[]; let pts=0; for(const rr of rings)pts+=rr.length
  console.log(k.padEnd(9),'rings',rings.length,'verts',pts)
}
