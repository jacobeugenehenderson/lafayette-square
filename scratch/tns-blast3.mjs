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
// match tiles by ring centroid; report those whose iA differs
const cen = t => { const r0=t.ring||[]; const c=r0.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]); return [c[0]/(r0.length||1), c[1]/(r0.length||1)] }
const sig = t => JSON.stringify((t.iA||[]).map(rr=>rr.map(p=>[Math.round(p[0]*100),Math.round(p[1]*100)])))
const ta=A._tiles||[], tb=B._tiles||[]
const bBy = tb.map(t=>({c:cen(t),s:sig(t)}))
let changed=[]
for(const t of ta){ const c=cen(t); let best=null,bd=9; for(const o of bBy){const dd=Math.hypot(o.c[0]-c[0],o.c[1]-c[1]); if(dd<bd){bd=dd;best=o}} if(best&&sig(t)!==best.s) changed.push([Math.round(c[0]),Math.round(c[1])]) }
console.log(`${scene}: ${ta.length} tiles; iA CHANGED in ${changed.length} tiles (matched by centroid)`) 
console.log('centroids:', JSON.stringify(changed))
