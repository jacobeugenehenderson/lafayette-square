import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const NODE=[386.3,149.1]
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const B=buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:d.streetSmooth??0.5,blockLandUse:d.blockLandUse,emitArtifact:true})
const sa=B._shapeArtifact||[]
const tk=p=>Math.round(p[0]*1000)+','+Math.round(p[1]*1000)
const nk=tk(NODE)
// which tiles have a run-END at the node, and the run identity
let tno=0
for(let i=0;i<sa.length;i++){ const t=sa[i]
  const ends=[]
  for(const run of (t.runs||[])){ if(!run.poly||run.poly.length<2)continue
    for(const p of [run.poly[0], run.poly[run.poly.length-1]]){ if(Math.hypot(p[0]-NODE[0],p[1]-NODE[1])<1.2) ends.push({skelId:run.skelId,side:run.side,roadId:run.roadId,throughId:run.throughId}) } }
  if(ends.length){ console.log(`tile#${i} thruNodeEnds=${JSON.stringify(t.thruNodeEnds||[])}`); for(const e of ends) console.log('   run-end @node:',JSON.stringify(e)) }
}
