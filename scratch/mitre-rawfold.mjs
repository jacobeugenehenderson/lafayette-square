import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const T = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: 0, blockCustoms: d.blockCustoms||null, emitArtifact: true })._shapeArtifact[16]
const ring = T.iA[0], n = ring.length
const focus = [519, -409]
// print the raw (square) ring through the fold with running tangent + projection onto a reference dir
for (let i = 0; i < n; i++) { const v = ring[i]; if (Math.hypot(v[0]-focus[0],v[1]-focus[1]) > 9) continue
  const a = ring[(i-1+n)%n], b = ring[(i+1)%n]
  const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1]
  const li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
  const turn=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
  const cross=(ix/li)*(oy/lo)-(iy/li)*(ox/lo)  // sign of turn (convex/concave)
  console.log(`iA[${i}] @[${v[0].toFixed(2)},${v[1].toFixed(2)}] turn=${turn.toFixed(0)}° ${cross>0?'L':'R'} segIn=${li.toFixed(2)} segOut=${lo.toFixed(2)}`)
}
