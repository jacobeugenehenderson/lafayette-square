// Why does park (ring 67) drop only 1 vert when its duplicate has the same shape as ring 99 (-17 verts)?
// Instrument: log span emission per ring with the fix in place.
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

// Walk park ring (67) and ring 99 with the dedupe applied; count matches.
for (const ringIdx of [67, 99, 2, 100]) {
  const ring = v2.blockSharp[ringIdx]
  const n = ring.length
  const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
  const matched = new Array(n).fill(null)
  for (let i=0;i<n;i++) for (const c of corners) {
    if (Math.hypot(ring[i][0]-c.point[0], ring[i][1]-c.point[1]) < 0.5) { matched[i] = c; break }
  }
  // Pre-dedupe count
  const preCount = matched.filter(Boolean).length
  // Dedupe by best |cross|
  const bestFor = new Map()
  for (let i=0;i<n;i++){
    const c = matched[i]; if (!c) continue
    const prev=ring[(i-1+n)%n], cur=ring[i], next=ring[(i+1)%n]
    const inDir=unit([cur[0]-prev[0],cur[1]-prev[1]])
    const outDir=unit([next[0]-cur[0],next[1]-cur[1]])
    const a=Math.abs(inDir[0]*outDir[1]-inDir[1]*outDir[0])
    const prior = bestFor.get(c)
    if (!prior || a>prior.a) bestFor.set(c,{i,a})
  }
  for (let i=0;i<n;i++) { const c=matched[i]; if (c && bestFor.get(c).i!==i) matched[i]=null }
  const postCount = matched.filter(Boolean).length

  // Count convex (would-fire) post-dedupe
  let fired = 0
  for (let i=0;i<n;i++){
    if (!matched[i]) continue
    const prev=ring[(i-1+n)%n], cur=ring[i], next=ring[(i+1)%n]
    const inDir=unit([cur[0]-prev[0],cur[1]-prev[1]])
    const outDir=unit([next[0]-cur[0],next[1]-cur[1]])
    const cross=inDir[0]*outDir[1]-inDir[1]*outDir[0]
    if (cross*ringSign>0) fired++
  }
  console.log(`ring ${ringIdx}: sharp=${n} matches pre-dedupe=${preCount} post=${postCount} fired-convex=${fired}`)
}
