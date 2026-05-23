// Q3 dry-run: simulate the H1 backfill correction and measure its effect
// on drift count + overshoot count. No source edits.
//
// Mechanism: the defect is that buildFrontageBands builds ringByKey from
// pass-2 blockRounded (so keys are pass-2 blockKeys), but fe.blockKey has
// been backfilled to pass-1 by line 2145. The two systems don't agree on
// the same key, so the per-block clip is a no-op for drifted entries.
//
// The "correct" join: for each band entry, find the blockRounded ring
// whose interior contains the band's own interior probe. This is what a
// drift-aware clip would resolve to. Re-clip against THAT ring and
// re-classify.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2, intersectRings } from '../src/lib/buildBlockGeometryV2.js'

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
function ringSignedArea(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]);return -s/2}
function ringInteriorProbe(ring){if(!ring||ring.length<3)return null;const ccw=ringSignedArea(ring)>0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<1e-3)continue;const px=ccw?-dy/l:dy/l,py=ccw?dx/l:-dx/l;return[(a[0]+b[0])/2+px*0.01,(a[1]+b[1])/2+py*0.01]}return null}

// SELFINT detector — verbatim from all-band-selfint-scan.js
function segIntersect(a,b,c,d){const x1=a[0],y1=a[1],x2=b[0],y2=b[1],x3=c[0],y3=c[1],x4=d[0],y4=d[1];const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-9)return false;const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den;const u=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/den;return t>1e-6&&t<1-1e-6&&u>1e-6&&u<1-1e-6}
function ringSelfInt(r){const n=r.length;for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(segIntersect(r[i],r[(i+1)%n],r[j],r[(j+1)%n]))return true}return false}

// Build two indices over blockRounded:
//  - keyMap: pass-2 blockKey → ring   (current state — what buildFrontageBands does)
//  - by interior containment, for any probe → ring
const blockRounded = v2.blockRounded
const keyMap = new Map()
for (const r of blockRounded) keyMap.set(blockKeyFromRing(r), r)

function findOwningBlockRoundedRing(probe) {
  for (const r of blockRounded) if (pointInRing(probe, r)) return r
  return null
}

function maxSignedDist(rings, owning) {
  let maxD = -Infinity
  for (const r of rings) for (const v of r) { const d = signedDist(v, owning); if (d > maxD) maxD = d }
  return maxD
}
function anyVertexOutsidePIR(rings, owning) {
  for (const r of rings) for (const v of r) if (!pointInRing(v, owning)) return true
  return false
}
function anySelfInt(rings) { for (const r of rings) if (r && r.length >= 3 && ringSelfInt(r)) return true; return false }

// PRE — current state.
let pre = { straight:0, drifted:0, lookupOk:0, pirOut:0, realOvershoot:0, selfInt:0 }
const straightFbs = v2.frontageBands.filter(fb => fb && !fb.corner && fb.points)
for (const fb of straightFbs) {
  pre.straight++
  const owning = keyMap.get(fb.blockKey)
  if (!owning) { pre.drifted++; continue }
  pre.lookupOk++
  const rings = [...(fb.treelawnRings||[]), ...(fb.sidewalkRings||[])]
  if (anyVertexOutsidePIR(rings, owning)) pre.pirOut++
  if (maxSignedDist(rings, owning) > 0.01) pre.realOvershoot++
  if (anySelfInt(rings)) pre.selfInt++
}

// POST — simulate the backfill correction.
// For each drifted entry, look up its true owning ring by interior probe,
// re-clip, then re-classify against that ring. Lookup-OK entries are
// re-classified unchanged (probe should still resolve to the same ring;
// confirm).
let post = { straight:0, drifted:0, lookupOk:0, pirOut:0, realOvershoot:0, selfInt:0, joinFailed:0, joinChanged:0 }
const reclippedRings = []
for (const fb of straightFbs) {
  post.straight++
  // Find true owning ring: interior probe a band ring, then containment.
  const sourceRing = (fb.treelawnRings && fb.treelawnRings[0]) || (fb.sidewalkRings && fb.sidewalkRings[0])
  if (!sourceRing) { post.joinFailed++; continue }
  const probe = ringInteriorProbe(sourceRing)
  if (!probe) { post.joinFailed++; continue }
  const owning = findOwningBlockRoundedRing(probe)
  if (!owning) { post.drifted++; post.joinFailed++; continue }
  post.lookupOk++

  // Did the join produce a different ring than the (broken) keyMap path?
  const broken = keyMap.get(fb.blockKey)
  if (broken !== owning) post.joinChanged++

  // Re-clip and re-classify.
  const tl = fb.treelawnRings?.length ? intersectRings(fb.treelawnRings, [owning]) : []
  const sw = fb.sidewalkRings?.length ? intersectRings(fb.sidewalkRings, [owning]) : []
  const rings = [...tl, ...sw]
  if (anyVertexOutsidePIR(rings, owning)) post.pirOut++
  if (maxSignedDist(rings, owning) > 0.01) post.realOvershoot++
  if (anySelfInt(rings)) post.selfInt++
  reclippedRings.push({ chainIdx: fb.chainIdx, side: fb.side, blockKey: fb.blockKey, edgeOrd: fb.edgeOrd, tlBefore: fb.treelawnRings?.length||0, tlAfter: tl.length, swBefore: fb.sidewalkRings?.length||0, swAfter: sw.length })
}

console.log(`Pre-backfill (current state):`)
console.log(`  straight: ${pre.straight}`)
console.log(`  drifted (no key-map hit): ${pre.drifted}`)
console.log(`  lookup-OK: ${pre.lookupOk}`)
console.log(`    PIR-outside (Stage 1 metric): ${pre.pirOut}`)
console.log(`    signed-dist > 0.01m (real overshoot): ${pre.realOvershoot}`)
console.log(`    SELFINT: ${pre.selfInt}`)
console.log(``)
console.log(`Post-backfill (interior-probe → blockRounded ring join, re-clip):`)
console.log(`  straight: ${post.straight}`)
console.log(`  drifted (no containment hit): ${post.drifted}`)
console.log(`  lookup-OK: ${post.lookupOk}`)
console.log(`    PIR-outside: ${post.pirOut}`)
console.log(`    signed-dist > 0.01m (real overshoot): ${post.realOvershoot}`)
console.log(`    SELFINT: ${post.selfInt}`)
console.log(`  join changed the owning ring vs broken key-lookup: ${post.joinChanged}`)
console.log(`  join failed (probe unresolvable): ${post.joinFailed}`)
console.log(``)
console.log(`Delta:`)
console.log(`  drifted:        ${pre.drifted} → ${post.drifted}  (Δ${post.drifted-pre.drifted})`)
console.log(`  PIR-outside:    ${pre.pirOut} → ${post.pirOut}  (Δ${post.pirOut-pre.pirOut})`)
console.log(`  real overshoot: ${pre.realOvershoot} → ${post.realOvershoot}  (Δ${post.realOvershoot-pre.realOvershoot})`)
console.log(`  SELFINT:        ${pre.selfInt} → ${post.selfInt}  (Δ${post.selfInt-pre.selfInt})`)

// Spot-check: did reclipping change ring count materially?
const changedClipCount = reclippedRings.filter(e => e.tlBefore !== e.tlAfter || e.swBefore !== e.swAfter).length
console.log(``)
console.log(`Reclip ring-count changes: ${changedClipCount}/${reclippedRings.length}`)
if (changedClipCount > 0) {
  const sample = reclippedRings.filter(e => e.tlBefore !== e.tlAfter || e.swBefore !== e.swAfter).slice(0,5)
  for (const s of sample) console.log(`  chain=${ribbons.streets[s.chainIdx]?.name} side=${s.side} blockKey=${s.blockKey} edgeOrd=${s.edgeOrd}: tl ${s.tlBefore}→${s.tlAfter}, sw ${s.swBefore}→${s.swAfter}`)
}
