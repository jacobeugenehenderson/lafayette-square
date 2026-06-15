// READ-ONLY — is the notch driven by the width STEP at the continuesAs seam?
// Patch south-18th-street-3's left pavHW 3.25 -> 5.49 (match west-18th) in-memory
// and remeasure tile-16's iA notch.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const focus = [519, -409]
function maxTurn(ring, R = 12) { const n=ring.length; let mt=0,at=null
  for (let i=0;i<n;i++){const v=ring[i];if(Math.hypot(v[0]-focus[0],v[1]-focus[1])>R)continue
    const a=ring[(i-1+n)%n],b=ring[(i+1)%n];const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1]
    const li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
    const t=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
    if(t>mt){mt=t;at=v}} return {mt:mt.toFixed(1),at:at?at.map(x=>x.toFixed(1)):null} }
for (const patch of [false, true]) {
  const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
  if (patch) { const s = r.streets.find(x=>(x.skelId||x.name)==='south-18th-street-3'); s.measure.left.pavementHW = 5.49; s.measure.symmetric=false
    if (s.segmentMeasures) for (const k in s.segmentMeasures) if (s.segmentMeasures[k].left) s.segmentMeasures[k].left.pavementHW = 5.49 }
  const T = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: 1, blockCustoms: d.blockCustoms||null, emitArtifact: true })._shapeArtifact[16]
  const p = maxTurn(T.iA[0])
  console.log(`${patch?'EQUALIZED (S18.left=5.49)':'ORIGINAL  (S18.left=3.25)'}: iA maxTurn near seam = ${p.mt}° @${p.at}`)
}
