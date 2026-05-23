// Dig into each matched corner record on the park ring: what IX is it from?
// what legs? what theta? what skel?
import { readFileSync, existsSync } from 'fs'
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

const parkFace = ribbons.faces.find(f => f.use === 'park')
let cx=0,cy=0;for(const p of parkFace.ring){cx+=p[0];cy+=p[1]}
const parkC = [cx/parkFace.ring.length, cy/parkFace.ring.length]

let parkIdx = -1
for (let i=0;i<v2.blockSharp.length;i++) if (pointInRing(parkC[0],parkC[1],v2.blockSharp[i])) { parkIdx = i; break }

const ring = v2.blockSharp[parkIdx]
const n = ring.length
const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
const corners = v2.corners

console.log('park sharp verts:', n)
console.log()

// For each vertex, find ALL corner records within 0.5m (not just first)
for (let i = 0; i < n; i++) {
  const cur = ring[i]
  const nearby = corners.filter(c => Math.hypot(cur[0]-c.point[0], cur[1]-c.point[1]) < 0.5)
  if (!nearby.length) continue
  const prev = ring[(i-1+n)%n], next = ring[(i+1)%n]
  const inDir = unit([cur[0]-prev[0], cur[1]-prev[1]])
  const outDir = unit([next[0]-cur[0], next[1]-cur[1]])
  const cross = inDir[0]*outDir[1] - inDir[1]*outDir[0]
  const convex = cross * ringSign > 0
  console.log(`i=${i}  pt=[${cur[0].toFixed(1)},${cur[1].toFixed(1)}]  cross=${cross.toFixed(3)}  convex=${convex}  nearby=${nearby.length}`)
  for (const c of nearby) {
    const d = Math.hypot(cur[0]-c.point[0], cur[1]-c.point[1])
    console.log(`   d=${d.toFixed(2)}m  V=[${c.V[0].toFixed(1)},${c.V[1].toFixed(1)}]  theta=${(c.theta*180/Math.PI).toFixed(1)}°  T_A=[${c.T_A[0].toFixed(2)},${c.T_A[1].toFixed(2)}]  T_B=[${c.T_B[0].toFixed(2)},${c.T_B[1].toFixed(2)}]`)
    // dot of corner.point - V with -inDir (toward V from cur) — is V "behind" cur along the ring?
    const dV = Math.hypot(c.V[0]-cur[0], c.V[1]-cur[1])
    console.log(`   |V-cur|=${dV.toFixed(1)}m`)
  }
}
