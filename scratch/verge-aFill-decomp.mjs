// READ-ONLY — for needle median tiles, decompose aFill: which streets'
// strokeOpen covers them, and is it the CARRIAGEWAY asphalt (width too wide)
// or the junction/through windows (construction flood)?
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const base = { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true }
const out = buildTileGround(r, { ...base })
const art = out._shapeArtifact
const tiles = out._tiles
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
// For a needle tile, print its bounding runs (skelId/side/pavementHW) so we see
// whether wide carriageway strokes flood the gap.
const meta = out._perRunMeta
const TARGETS=[30,33,34,71,82,88,89,95,100,102]
for(const ti of TARGETS){
  const t=tiles[ti], rm=meta[ti], st=art[ti]
  const b=[1e9,1e9,-1e9,-1e9]; for(const[x,y]of t.ring){if(x<b[0])b[0]=x;if(y<b[1])b[1]=y;if(x>b[2])b[2]=x;if(y>b[3])b[3]=y}
  const w=(b[2]-b[0]).toFixed(0), h=(b[3]-b[1]).toFixed(0)
  console.log(`\ntile ${ti}  bbox[${b.map(v=>v.toFixed(0))}] ${w}x${h}  tileA=${area(t.ring).toFixed(0)}`)
  for(const run of rm){
    const m=run.measure||{}
    console.log(`  run ${run.skelId}:${run.side} hw=${(m[run.side]&&m[run.side].pavementHW)?.toFixed?.(2)} anchor=${run.anchor}`)
  }
}
