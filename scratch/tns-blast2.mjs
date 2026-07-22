import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const scene = process.argv[2] || 'hipointe-demun'
const r = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/clean/ribbons.json`, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse }
const stripped = JSON.parse(JSON.stringify(r))
let nStrip=0; for (const s of (stripped.streets || stripped)) { if(s.throughId!=null)nStrip++; delete s.throughId; delete s.through }
console.log('stripped throughId from', nStrip, 'streets; sample new-side has throughId:', (r.streets||r).filter(s=>s.throughId!=null).length)
const A = buildTileGround(stripped, opts), B = buildTileGround(r, opts)
const sig = rings => JSON.stringify((rings||[]).map(rr=>rr.map(p=>[Math.round(p[0]*100),Math.round(p[1]*100)])))
for(const k of ['curb','asphalt']){
  console.log(`${k}: base rings=${(A[k]||[]).length} new rings=${(B[k]||[]).length} identical=${sig(A[k])===sig(B[k])}`)
}
