// Companion to h1-backfill-dryrun.js. Among the 295 pre-drifted straight
// entries (where ringByKey lookup failed → NO CLIP applied), measure
// their actual geometric overshoot against the true owning blockRounded
// ring (resolved by interior probe). If pre-drift entries DO overshoot,
// the missing clip matters; if they don't, the drift is symptomless.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(readFileSync(join(ROOT,'src/data/ribbons.json'),'utf-8'))
const design = JSON.parse(readFileSync(join(ROOT,'public/looks/lafayette-square/design.json'),'utf-8'))
const sten = JSON.parse(readFileSync(join(ROOT,'cartograph/data/lafayette-square/neighborhood_boundary.json'),'utf-8'))
const center=sten.center,radius=sten.radius
const targetR=sten.streetFade?sten.streetFade.outer+50:radius
const scale=radius>0?targetR/radius:1
const stencil=sten.boundary.map(([x,z])=>[center[0]+(x-center[0])*scale,center[1]+(z-center[1])*scale])
const v2 = buildBlockGeometryV2(ribbons, { stencil, cornerRadiusScale: design.cornerRadiusScale ?? 1, cornerRadiusOverrides: design.cornerRadiusOverrides || {}, cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {}, blockCustoms: design.blockCustoms || null, blockLandUse: design.blockLandUse || null, curbWidth: design.curbWidth ?? 0.45 })

function bkRing(r){let mx=Infinity,Mx=-Infinity,my=Infinity,My=-Infinity;for(const p of r){if(p[0]<mx)mx=p[0];if(p[0]>Mx)Mx=p[0];if(p[1]<my)my=p[1];if(p[1]>My)My=p[1]}return `${(Math.round(((mx+Mx)/2)*2)/2).toFixed(1)},${(Math.round(((my+My)/2)*2)/2).toFixed(1)}`}
function pir(p,r){let i=false;for(let j=r.length-1,k=0;k<r.length;j=k++){const xi=r[k][0],yi=r[k][1],xj=r[j][0],yj=r[j][1];if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/((yj-yi)||1e-12)+xi))i=!i}return i}
function sd(p,r){let b=Infinity;for(let i=0;i<r.length;i++){const a=r[i],bb=r[(i+1)%r.length];const dx=bb[0]-a[0],dy=bb[1]-a[1];const ll=dx*dx+dy*dy;let t=ll>1e-12?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/ll:0;t=t<0?0:t>1?1:t;const cx=a[0]+dx*t,cy=a[1]+dy*t;const d=Math.hypot(p[0]-cx,p[1]-cy);if(d<b)b=d}return pir(p,r)?-b:b}
function rsa(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]);return -s/2}
function probe(r){if(!r||r.length<3)return null;const ccw=rsa(r)>0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<1e-3)continue;const px=ccw?-dy/l:dy/l,py=ccw?dx/l:-dx/l;return[(a[0]+b[0])/2+px*0.01,(a[1]+b[1])/2+py*0.01]}return null}

const keyMap = new Map(); for (const r of v2.blockRounded) keyMap.set(bkRing(r), r)
function findOwning(p){for (const r of v2.blockRounded) if (pir(p,r)) return r; return null}

const drifted = v2.frontageBands.filter(fb => fb && !fb.corner && fb.points && !keyMap.has(fb.blockKey))
let probeResolved=0, probeUnresolved=0, overshootReal=0, overshootLarge=0, overshootSmall=0
let maxOverall=-Infinity
const offenders=[]
for (const fb of drifted) {
  const sr = (fb.treelawnRings||[])[0] || (fb.sidewalkRings||[])[0]
  if (!sr) { probeUnresolved++; continue }
  const pp = probe(sr); if (!pp) { probeUnresolved++; continue }
  const owning = findOwning(pp)
  if (!owning) { probeUnresolved++; continue }
  probeResolved++
  let m=-Infinity
  for (const k of ['treelawnRings','sidewalkRings']) for (const rr of (fb[k]||[])) for (const v of rr) { const d=sd(v,owning); if (d>m) m=d }
  if (m > maxOverall) maxOverall = m
  if (m > 0.5) overshootLarge++
  else if (m > 0.01) overshootSmall++
  if (m > 0.01) { overshootReal++; offenders.push({ name: ribbons.streets[fb.chainIdx]?.name, side: fb.side, blockKey: fb.blockKey, edgeOrd: fb.edgeOrd, maxD: m.toFixed(3) }) }
}
console.log(`Drifted (pre-clip-skipped) entries: ${drifted.length}`)
console.log(`  probe → blockRounded ring resolved: ${probeResolved}`)
console.log(`  probe unresolvable (no containment): ${probeUnresolved}`)
console.log(`  among resolved:`)
console.log(`    max signed-dist > 0.01m (real overshoot): ${overshootReal}/${probeResolved} (${(100*overshootReal/probeResolved).toFixed(1)}%)`)
console.log(`      small (0.01–0.5m): ${overshootSmall}`)
console.log(`      LARGE (>0.5m):     ${overshootLarge}`)
console.log(`    max overshoot magnitude overall: ${maxOverall.toFixed(3)}m`)
console.log(``)
console.log(`Top 15 real overshoots:`)
offenders.sort((a,b)=>parseFloat(b.maxD)-parseFloat(a.maxD)).slice(0,15).forEach(o=>console.log(`  chain=${o.name} side=${o.side} blockKey=${o.blockKey} edgeOrd=${o.edgeOrd} maxD=${o.maxD}m`))
