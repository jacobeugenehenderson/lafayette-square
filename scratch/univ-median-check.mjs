// READ-ONLY — verify the universal (walked-face) median: median grass present per
// divided road, no divided median RINGS (walked faces only), render the 4 sites.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const base = { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true }
const out = buildTileGround(r, { ...base })
const area = rings => rings.reduce((s,ring)=>{let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return s+Math.abs(a)/2},0)
const med = (out.luByClass && out.luByClass.median) || []
const dividedRings = (r.medians||[]).filter(m=>m.kind==='median' && m.chains).length  // divided rings (have chains[])
const loopRings = (r.medians||[]).filter(m=>m.kind==='median' && m.loopId).length
console.log('medians[]: divided RINGS=%d (expect 0), loop islands=%d, merge=%d', dividedRings, loopRings, (r.medians||[]).filter(m=>m.kind==='merge').length)
console.log('rendered median grass: %d rings, total area %s m²', med.length, area(med).toFixed(0))
// frozen-artifact median tiles (isMedian flag)
const sa = out._shapeArtifact || []
const medTiles = sa.filter(t=>t.isMedian)
console.log('isMedian shape tiles: %d  (areas: %s)', medTiles.length, medTiles.map(t=>area([t.ring]).toFixed(0)).join(','))
const asph = out.asphalt || []
async function crop(name, cx, cy, W, H) {
  const ppx=1000, sc=ppx/Math.max(W,H), minx=cx-W/2, miny=cy-H/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${(W*sc).toFixed(0)}" height="${(H*sc).toFixed(0)}" style="background:#cfcfcf">`
  for(const rr of asph){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="#222"/>`}
  for(const rr of med){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="#3a3"/>`}
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./${name}.png`,import.meta.url).pathname)
}
await crop('umed-chouteau', 420,-520, 320, 160)
await crop('umed-lafayette', 250,250, 420, 200)
await crop('umed-sjefferson', -392,-60, 200, 460)
await crop('umed-park', 620,-30, 320, 200)
console.log('wrote umed-{chouteau,lafayette,sjefferson,park}.png')
// suspicious-tile guard: a real median tile is MOSTLY asphalt (carriageways through
// it) → grass should be a fraction of the tile. Flag any isMedian tile whose grass
// fills >55% of it AND is large (>800 m²) — that would be a block mis-flagged.
const A = ring => { let a=0; for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1} return Math.abs(a)/2 }
let flagged=0
for (const t of (out._shapeArtifact||[]).filter(t=>t.isMedian)) {
  const ta = A(t.ring)
  const g = (out.luByClass.median||[]).filter(r=>{ // grass rings whose centroid is in this tile bbox
    const cx=r.reduce((s,p)=>s+p[0],0)/r.length, cy=r.reduce((s,p)=>s+p[1],0)/r.length
    const xs=t.ring.map(p=>p[0]),ys=t.ring.map(p=>p[1])
    return cx>=Math.min(...xs)&&cx<=Math.max(...xs)&&cy>=Math.min(...ys)&&cy<=Math.max(...ys)
  })
  const ga = g.reduce((s,r)=>s+A(r),0)
  if (ta>800 && ga>0.55*ta) { console.log('  ⚠️ SUSPECT block-as-median: tile %s m², grass %s m² (%d%%)', ta.toFixed(0), ga.toFixed(0), (100*ga/ta).toFixed(0)); flagged++ }
}
console.log(flagged ? `${flagged} suspicious tiles` : '✅ no block-sized tile flooded as median (all median tiles are mostly asphalt)')
