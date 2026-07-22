// Map-wide A/B on the FROZEN shape. Confirms cornerAt-on-throughId changes iA
// ONLY at identity-seam nodes (two edge-adjacent pieces: same throughId, diff
// roadId) — a split-carriageway / dogleg / name seam — and NOWHERE a clean
// crossing (different identities) loses a corner.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const scene = process.argv[2] || 'hipointe-demun'
const rib = scene==='lafayette-square' ? '../src/data/ribbons.json' : `../cartograph/data/${scene}/clean/ribbons.json`
const r = JSON.parse(readFileSync(new URL(rib, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse, emitArtifact: true }
const streets = r.streets || r
// identity-seam nodes: a node where two DIFFERENT-roadId pieces share the SAME throughId
const vk=p=>Math.round(p[0]*100)/100+','+Math.round(p[1]*100)/100
const atNode=new Map()
for(const s of streets){const p=s.points;if(!p||p.length<2)continue;for(const q of [p[0],p[p.length-1]]){const k=vk(q);(atNode.get(k)||atNode.set(k,[]).get(k)).push({roadId:s.roadId,throughId:s.throughId})}}
const seamNodes=[]
for(const [k,list] of atNode){ for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){ if(list[i].throughId===list[j].throughId && list[i].roadId!==list[j].roadId){ seamNodes.push(k.split(',').map(Number)); break } } }
console.log(`${scene}: ${seamNodes.length} identity-seam nodes (same throughId, diff roadId)`)
// build A/B frozen
const stripped = JSON.parse(JSON.stringify(r)); for (const s of (stripped.streets||stripped)){delete s.throughId;delete s.through}
const A=buildTileGround(stripped,opts), B=buildTileGround(r,opts)
const cen=t=>{const g=t.ring||[];const c=g.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]);return [c[0]/(g.length||1),c[1]/(g.length||1)]}
const sig=t=>JSON.stringify((t.iA||[]).map(rr=>rr.map(p=>[Math.round(p[0]*100),Math.round(p[1]*100)])))
const sa=A._shapeArtifact||[], sb=B._shapeArtifact||[]
const bBy=sb.map(t=>({c:cen(t),s:sig(t)}))
let changed=[], nearSeam=0, farFromSeam=[]
for(const t of sa){ const c=cen(t); let best=null,bd=9; for(const o of bBy){const dd=Math.hypot(o.c[0]-c[0],o.c[1]-c[1]);if(dd<bd){bd=dd;best=o}} if(best&&sig(t)!==best.s){ changed.push(c);
  // is this tile adjacent to a seam node?
  const dSeam=Math.min(...seamNodes.map(n=>Math.min(...(t.ring||[]).map(p=>Math.hypot(p[0]-n[0],p[1]-n[1])))))
  if(dSeam<20) nearSeam++; else farFromSeam.push([Math.round(c[0]),Math.round(c[1]),+dSeam.toFixed(1)]) } }
console.log(`iA changed in ${changed.length} tiles: ${nearSeam} adjacent to a seam node, ${farFromSeam.length} NOT near any seam`)
if(farFromSeam.length) console.log('  ⚠️ far-from-seam changes (possible regression):', JSON.stringify(farFromSeam))
else console.log('  ✅ every changed tile borders an identity-seam node — no clean-crossing corner touched')
