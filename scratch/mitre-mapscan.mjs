// READ-ONLY — scan ALL curved (bezier'd) tiles for residual curb bumps (turn>20°
// on a segment-pair where both segs are short curve samples, i.e. a real bump not
// an authored corner). Reports tile + location so we see if the through-road (and
// the rest of the map) is clean after the name-aware + datum fix.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null, emitArtifact: true })
let total=0
for (let ti=0; ti<pr._shapeArtifact.length; ti++){
  const T=pr._shapeArtifact[ti]; if(!T.iA) continue
  for(const ring of T.iA){const n=ring.length
    for(let i=0;i<n;i++){const v=ring[i],a=ring[(i-1+n)%n],b=ring[(i+1)%n]
      const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1],li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
      // bump = sharp turn between two SHORT curve samples (not an authored corner with long legs)
      if(li>3||lo>3) continue
      const t=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
      if(t>20){console.log(`  tile ${ti} @[${v[0].toFixed(1)},${v[1].toFixed(1)}] turn=${t.toFixed(0)}° segs ${li.toFixed(2)}/${lo.toFixed(2)}`); total++}
    }}
}
console.log(`\nTOTAL curve bumps (turn>20° between short samples) map-wide: ${total}`)
