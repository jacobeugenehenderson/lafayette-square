import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const scene='hipointe-demun', NODE=[153.6,386.1]
const r = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/clean/ribbons.json`, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse }
const stripped = JSON.parse(JSON.stringify(r)); for (const s of (stripped.streets||stripped)){delete s.throughId;delete s.through}
const A=buildTileGround(stripped,opts), B=buildTileGround(r,opts)
const near=(rings)=>{ // count vertices within 12m of NODE
  let n=0; for(const rr of (rings||[])) for(const p of rr){ if(Math.hypot(p[0]-NODE[0],p[1]-NODE[1])<12) n++ } return n }
// find shapeTiles whose ring touches NODE (within 15m), compare iA vertex count near node
const touch=(t)=>(t.ring||[]).some(p=>Math.hypot(p[0]-NODE[0],p[1]-NODE[1])<15)
const ta=(A._tiles||[]).filter(touch), tb=(B._tiles||[]).filter(touch)
console.log('tiles touching node: base',ta.length,'new',tb.length)
for(let i=0;i<Math.max(ta.length,tb.length);i++){
  const a=ta[i],b=tb[i]
  const aiA=a?near(a.iA):'-', biA=b?near(b.iA):'-'
  const asig=a?JSON.stringify((a.iA||[]).map(rr=>rr.length)):'-', bsig=b?JSON.stringify((b.iA||[]).map(rr=>rr.length)):'-'
  console.log(`tile#${i}: base iA-verts-near=${aiA} rings=${asig} | new iA-verts-near=${biA} rings=${bsig} | iA-same=${JSON.stringify(a?.iA)===JSON.stringify(b?.iA)}`)
}
console.log('curb verts near node: base',near(A.curb),'new',near(B.curb))
