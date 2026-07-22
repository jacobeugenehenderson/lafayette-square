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
for (const s of (stripped.streets || stripped)) { delete s.throughId; delete s.through }
const A = buildTileGround(stripped, opts), B = buildTileGround(r, opts)
const sig = t => JSON.stringify((t.iA||[]).map(rr=>rr.map(p=>[Math.round(p[0]*100),Math.round(p[1]*100)])))
const ta=A._tiles||[], tb=B._tiles||[]
let changed=0, centroids=[]
for(let i=0;i<Math.min(ta.length,tb.length);i++){ if(sig(ta[i])!==sig(tb[i])){ changed++; const r0=ta[i].ring||[]; const c=r0.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>+(v/(r0.length||1)).toFixed(0)); centroids.push(c) } }
console.log(`${scene}: tiles ${ta.length} base / ${tb.length} new; CURB CHANGED in ${changed} tiles`)
console.log('changed-tile centroids:', JSON.stringify(centroids))
