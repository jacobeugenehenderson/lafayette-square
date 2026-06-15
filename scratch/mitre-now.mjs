import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: 1, blockCustoms: d.blockCustoms||null, emitArtifact: true })
const T = pr._shapeArtifact[16]
const ring = T.iA[0], n = ring.length
// dump all turns > 12 around the whole West-18th edge of the tile (the curving top)
console.log('=== all bumps (turn>12°) on tile-16 iA ===')
for (let i=0;i<n;i++){ const v=ring[i],a=ring[(i-1+n)%n],b=ring[(i+1)%n]
  const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1],li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
  const t=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
  if(t>12) console.log(`  iA[${i}] @[${v[0].toFixed(1)},${v[1].toFixed(1)}] turn=${t.toFixed(0)}° segIn=${li.toFixed(2)} segOut=${lo.toFixed(2)}`) }
// wide render of the whole tile-16 curb
const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1])
const cx=(Math.min(...xs)+Math.max(...xs))/2, cy=(Math.min(...ys)+Math.max(...ys))/2
const W=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1.1, ppx=1300,sc=ppx/W,minx=cx-W/2,miny=cy-W/2
const X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#16243a">`
s+=`<path d="${ring.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="#5a8fd0" stroke-width="2"/>`
for(let i=0;i<n;i++){const v=ring[i],a=ring[(i-1+n)%n],b=ring[(i+1)%n],ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1],li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1
  const t=Math.acos(Math.max(-1,Math.min(1,(ix/li)*(ox/lo)+(iy/li)*(oy/lo))))*180/Math.PI
  if(t>12)s+=`<circle cx="${X(v[0])}" cy="${Y(v[1])}" r="5" fill="#f44"/>`}
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./mitre-now.png',import.meta.url).pathname)
console.log('wrote mitre-now.png (red dots = turn>12° bumps)')
