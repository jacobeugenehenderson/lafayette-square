// Re-run Stage 1's overshoot classification globally but with signed
// distance instead of strict pointInRing. Distinguishes boundary-noise
// (|d| ≤ 0.01m) from real overshoot (d > 0.01m).
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = 'lafayette-square'
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', scene, 'design.json'), 'utf-8'))
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

function blockKeyFromRing(ring){let mx=Infinity,Mx=-Infinity,my=Infinity,My=-Infinity;for(const p of ring){if(p[0]<mx)mx=p[0];if(p[0]>Mx)Mx=p[0];if(p[1]<my)my=p[1];if(p[1]>My)My=p[1]}return `${(Math.round(((mx+Mx)/2)*2)/2).toFixed(1)},${(Math.round(((my+My)/2)*2)/2).toFixed(1)}`}
function pointInRing(p, ring){const x=p[0],y=p[1];let i=false;for(let j=ring.length-1,k=0;k<ring.length;j=k++){const xi=ring[k][0],yi=ring[k][1],xj=ring[j][0],yj=ring[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi))i=!i}return i}
function signedDist(p, ring){let best=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];const dx=b[0]-a[0],dy=b[1]-a[1];const ll=dx*dx+dy*dy;let t=ll>1e-12?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/ll:0;t=t<0?0:t>1?1:t;const cx=a[0]+dx*t,cy=a[1]+dy*t;const d=Math.hypot(p[0]-cx,p[1]-cy);if(d<best)best=d}return pointInRing(p,ring)?-best:best}

const ringByKey = new Map()
for (const r of v2.blockRounded) { const k = blockKeyFromRing(r); if (!ringByKey.has(k)) ringByKey.set(k,r) }

let straight=0, drifted=0, lookupOk=0, anyVertexOutsidePIR=0, realOvershoot=0, largeOvershoot=0
const realDetails = []
// Stage 3 fix-the-fix: resolve owning ring by interior-probe containment
// against blockRounded, matching the corrected runtime in buildFrontageBands.
// The pass-2 keymap (ringByKey above) drops pass-1 collisions and gives
// false-positive overshoots; containment resolution is the canonical join.
function findOwningRing(fb) {
  const probe = fb.treelawnRings?.[0]?.[0] || fb.sidewalkRings?.[0]?.[0]
  if (!probe) return null
  for (const r of v2.blockRounded) if (pointInRing(probe, r)) return r
  return null
}
for (const fb of v2.frontageBands) {
  if (!fb || fb.corner) continue
  straight++
  const owning = findOwningRing(fb)
  if (!owning) { drifted++; continue }
  lookupOk++
  let anyPIRout = false
  let maxD = -Infinity
  for (const k of ['treelawnRings','sidewalkRings']) for (const r of (fb[k]||[])) for (const v of r) {
    const d = signedDist(v, owning)
    if (d > maxD) maxD = d
    if (!pointInRing(v, owning)) anyPIRout = true
  }
  if (anyPIRout) anyVertexOutsidePIR++
  if (maxD > 0.01) realOvershoot++
  if (maxD > 0.5) { largeOvershoot++; realDetails.push({ chainIdx: fb.chainIdx, name: ribbons.streets[fb.chainIdx]?.name, side: fb.side, blockKey: fb.blockKey, edgeOrd: fb.edgeOrd, maxD: maxD.toFixed(3) }) }
}
console.log(`straight fes:                       ${straight}`)
console.log(`  drifted (blockKey ∉ blockRounded): ${drifted}`)
console.log(`  blockKey-lookup OK:                ${lookupOk}`)
console.log(`    any vertex !pointInRing:         ${anyVertexOutsidePIR} (${(100*anyVertexOutsidePIR/lookupOk).toFixed(1)}%) — what Stage 1 reported`)
console.log(`    max signed dist > 0.01m (real):  ${realOvershoot} (${(100*realOvershoot/lookupOk).toFixed(1)}%)`)
console.log(`    max signed dist > 0.5m (large):  ${largeOvershoot} (${(100*largeOvershoot/lookupOk).toFixed(1)}%)`)
if (realDetails.length) {
  console.log(`\n  large-overshoot details:`)
  for (const d of realDetails.slice(0,15)) console.log(`    ${d.name} side=${d.side} blockKey=${d.blockKey} edgeOrd=${d.edgeOrd} maxD=${d.maxD}m`)
}
