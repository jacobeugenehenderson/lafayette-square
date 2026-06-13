// READ-ONLY — is the throat a SHAPE defect (disrupted silhouette) or FILL (clean
// but locally narrow face)? Measure tile#4's iA: self-intersection? + local neck
// width at each throat vs the band depth (cw+tl+sw both sides).
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null, emitArtifact: true })
const tiles = pr._shapeArtifact
const T4 = tiles[4], T16 = tiles[16]

// segment-segment intersection test (proper crossing, excluding shared endpoints)
function segInt(a,b,c,e){const d1=[b[0]-a[0],b[1]-a[1]],d2=[e[0]-c[0],e[1]-c[1]];const den=d1[0]*d2[1]-d1[1]*d2[0];if(Math.abs(den)<1e-12)return false;const t=((c[0]-a[0])*d2[1]-(c[1]-a[1])*d2[0])/den;const u=((c[0]-a[0])*d1[1]-(c[1]-a[1])*d1[0])/den;return t>1e-9&&t<1-1e-9&&u>1e-9&&u<1-1e-9}
function selfInt(ring){let n=0;const m=ring.length;for(let i=0;i<m;i++){const a=ring[i],b=ring[(i+1)%m];for(let j=i+2;j<m;j++){if(i===0&&j===m-1)continue;const c=ring[j],e=ring[(j+1)%m];if(segInt(a,b,c,e))n++}}return n}

console.log('=== SHAPE integrity: does the frozen silhouette (iA) self-intersect? ===')
for (const [nm,T] of [['tile#4',T4],['tile#16',T16]]) {
  let tot=0; for (const rr of T.iA) tot+=selfInt(rr)
  console.log(`${nm}: iA rings=${T.iA.length}  self-intersections=${tot}  (0 = clean silhouette)`)
}

// local neck width near each throat: smallest gap between iA points that are
// SPATIALLY near (<band) but TOPOLOGICALLY distant (>8 verts apart) — a pinch.
const bandBoth = (cw + T4.tl + T4.sw) * 2   // two strips facing across the neck
console.log(`\nband depth one side = ${(cw+T4.tl+T4.sw).toFixed(2)}m → both sides need ${bandBoth.toFixed(2)}m of face to not overlap`)
const THROATS = { rcorner:[612,-400], lcorner:[540,-405], mid:[636,-410] }
for (const [nm,[px,py]] of Object.entries(THROATS)) {
  let best=1e9, bp=null
  for (const rr of T4.iA) {
    const m=rr.length
    for (let i=0;i<m;i++){
      const pi=rr[i]; if (Math.hypot(pi[0]-px,pi[1]-py)>30) continue
      for (let j=0;j<m;j++){
        const dd=Math.min((j-i+m)%m,(i-j+m)%m); if (dd<8) continue  // topologically distant
        const pj=rr[j], g=Math.hypot(pi[0]-pj[0],pi[1]-pj[1])
        if (g<best){best=g;bp=[pi,pj]}
      }
    }
  }
  const verdict = best<bandBoth ? `NECK ${best.toFixed(2)}m < ${bandBoth.toFixed(2)}m → strips overlap (FILL)` : `${best.toFixed(2)}m (ok)`
  console.log(`${nm} throat @(${px},${py}): local face neck = ${best.toFixed(2)}m  → ${verdict}`)
}
