import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
})
const fillets = Object.keys(r.cornerFillets || {}).length
const turnAt = (ring,i) => { const n=ring.length, a=ring[(i-1+n)%n],b=ring[i],c=ring[(i+1)%n]
  const v1=[b[0]-a[0],b[1]-a[1]],v2=[c[0]-b[0],c[1]-b[1]]; let d=Math.abs((Math.atan2(v2[1],v2[0])-Math.atan2(v1[1],v1[0]))*180/Math.PI)%360; return d>180?360-d:d }
// candidate corners = sharp vertices on each tile's CENTERLINE face ring (before rounding)
const buckets={'straight <18 (no corner)':0,'corner 18-160':0,'reflex >160':0}
let total=0
for (const t of r._tiles||[]) { const ring=t.ring; if(!ring||ring.length<3)continue
  for(let i=0;i<ring.length;i++){ const d=turnAt(ring,i); total++
    if(d<18) buckets['straight <18 (no corner)']++
    else if(d<=160) buckets['corner 18-160']++
    else buckets['reflex >160']++ } }
console.log('tiles:', (r._tiles||[]).length, '| total face-ring vertices:', total)
console.log('cornerFillets (corners WITH a handle):', fillets)
console.log('face-ring vertex turn buckets:', JSON.stringify(buckets,null,0))
