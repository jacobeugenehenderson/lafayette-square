// Probe LAFAYETTE PARK specifically (not the [-577,-101] park I was chasing).
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = 'lafayette-square'
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design  = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', scene, 'design.json'), 'utf-8'))
const sten = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json'), 'utf-8'))
const center = sten.center, radius = sten.radius
const streetFade = sten.streetFade || null
const targetR = streetFade ? streetFade.outer + 50 : radius
const scale = radius > 0 ? targetR / radius : 1
const stencil = sten.boundary.map(([x,z]) => [center[0]+(x-center[0])*scale, center[1]+(z-center[1])*scale])

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? 0.45,
})

function pointInRing(px,py,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],zi=r[i][1],xj=r[j][0],zj=r[j][1];if((zi>py)!==(zj>py)&&px<(xj-xi)*(py-zi)/(zj-zi)+xi)inside=!inside}return inside}
function ringSignedArea2D(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]);return s}
function unit(v){const m=Math.hypot(v[0],v[1])||1;return [v[0]/m,v[1]/m]}

// Lafayette Park = the authored 4-vert face at origin.
const lafPark = ribbons.faces.filter(f => f.use==='park').find(f => {
  if (f.ring.length !== 4) return false
  let cx=0,cy=0;for(const v of f.ring){cx+=v[0];cy+=v[1]}
  return Math.hypot(cx/4, cy/4) < 50
})
console.log('Lafayette Park face verts:', lafPark.ring.length, 'corners:', lafPark.ring)

// Find which blockSharp ring contains origin (≈ park interior).
let parkIdx = -1
for (let i=0;i<v2.blockSharp.length;i++) {
  if (pointInRing(0,0,v2.blockSharp[i])) { parkIdx = i; break }
}
console.log('Lafayette Park blockSharp idx:', parkIdx, '  verts:', v2.blockSharp[parkIdx]?.length)
console.log('Lafayette Park blockRounded verts:', v2.blockRounded[parkIdx]?.length)

const ring = v2.blockSharp[parkIdx]
const n = ring.length
const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
const corners = v2.corners
console.log(`ringSign=${ringSign}  total corners in V2:`, corners.length)

console.log('\nFull ring vertices:')
for (let i = 0; i < n; i++) {
  console.log(`  i=${i}  [${ring[i][0].toFixed(2)}, ${ring[i][1].toFixed(2)}]`)
}

console.log('\nCorner-matched vertices:')
let convexCount = 0
for (let i=0;i<n;i++) {
  const cur = ring[i]
  for (const c of corners) {
    if (Math.hypot(cur[0]-c.point[0], cur[1]-c.point[1]) < 0.5) {
      const prev=ring[(i-1+n)%n], next=ring[(i+1)%n]
      const inDir=unit([cur[0]-prev[0],cur[1]-prev[1]])
      const outDir=unit([next[0]-cur[0],next[1]-cur[1]])
      const cross=inDir[0]*outDir[1]-inDir[1]*outDir[0]
      const convex = cross*ringSign>0
      if (convex) convexCount++
      console.log(`  i=${i}  pt=[${cur[0].toFixed(1)},${cur[1].toFixed(1)}]  cross=${cross.toFixed(3)}  convex=${convex}  V=[${c.V[0].toFixed(1)},${c.V[1].toFixed(1)}]  theta=${(c.theta*180/Math.PI).toFixed(1)}°`)
      break
    }
  }
}
console.log('Convex-passing:', convexCount, '(expected: 4 for Lafayette Park)')
