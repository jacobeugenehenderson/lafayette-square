// Identify duplicate corner-record matches across ALL block rings.
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

function ringSignedArea2D(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]);return s}
function unit(v){const m=Math.hypot(v[0],v[1])||1;return [v[0]/m,v[1]/m]}

const corners = v2.corners
const blockSharp = v2.blockSharp
const TOL = 0.5

let totalDup = 0
let ringsWithDup = 0
for (let ringIdx = 0; ringIdx < blockSharp.length; ringIdx++) {
  const ring = blockSharp[ringIdx]
  const n = ring.length
  const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
  // For each ring, find all (vertex i → corner index) matches, with convex passing.
  const passing = []  // {i, cIdx, cross}
  for (let i = 0; i < n; i++) {
    const cur = ring[i]
    for (let cIdx = 0; cIdx < corners.length; cIdx++) {
      const c = corners[cIdx]
      if (Math.hypot(cur[0]-c.point[0], cur[1]-c.point[1]) < TOL) {
        const prev = ring[(i-1+n)%n], next = ring[(i+1)%n]
        const inDir = unit([cur[0]-prev[0], cur[1]-prev[1]])
        const outDir = unit([next[0]-cur[0], next[1]-cur[1]])
        const cross = inDir[0]*outDir[1] - inDir[1]*outDir[0]
        if (cross * ringSign > 0) passing.push({i, cIdx, cross})
        break  // mimic current "first match wins"
      }
    }
  }
  // Group by cIdx
  const byCorner = new Map()
  for (const p of passing) {
    if (!byCorner.has(p.cIdx)) byCorner.set(p.cIdx, [])
    byCorner.get(p.cIdx).push(p)
  }
  let dupHere = 0
  for (const [cIdx, arr] of byCorner) {
    if (arr.length > 1) {
      dupHere++
      if (totalDup < 10) {
        console.log(`ring ${ringIdx} (verts=${n})  corner cIdx=${cIdx}  matched at ${arr.length} vertices:`)
        for (const a of arr) {
          const cur = ring[a.i]
          console.log(`    i=${a.i}  pt=[${cur[0].toFixed(2)},${cur[1].toFixed(2)}]  cross=${a.cross.toFixed(3)}`)
        }
      }
    }
  }
  if (dupHere > 0) { totalDup += dupHere; ringsWithDup++ }
}
console.log(`\nTotal duplicate-corner cases: ${totalDup} across ${ringsWithDup} rings`)
