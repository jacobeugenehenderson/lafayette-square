import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
})

// --- replicate tileGround constants + tests EXACTLY ---
const FILLET_TURN_TOL = 18 * Math.PI / 180
const RING_DUP_EPS = 0.02
const MIN_CORNER_LEG = 0.05
function signedArea(r){let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
function dedupeRing(ring){const n=ring.length;if(n<3)return ring;const out=[];for(let i=0;i<n;i++){const p=ring[i],q=out[out.length-1];if(q&&Math.hypot(p[0]-q[0],p[1]-q[1])<RING_DUP_EPS)continue;out.push(p)}while(out.length>=3&&Math.hypot(out[0][0]-out[out.length-1][0],out[0][1]-out[out.length-1][1])<RING_DUP_EPS)out.pop();return out.length>=3?out:ring}

// classify each vertex of a ring exactly like filletRing pass-1
function classifyRing(ring0){
  const ring=dedupeRing(ring0); const n=ring.length
  const sign=signedArea(ring)>=0?1:-1
  const buckets={straight:0,convexCorner:0,concave:0,shortLeg:0,nearStraightBand:0}
  const convexCornerIdx=[]
  for(let i=0;i<n;i++){
    const A=ring[(i-1+n)%n],V=ring[i],B=ring[(i+1)%n]
    let inx=V[0]-A[0],iny=V[1]-A[1],outx=B[0]-V[0],outy=B[1]-V[1]
    const li=Math.hypot(inx,iny),lo=Math.hypot(outx,outy)
    if(li<MIN_CORNER_LEG||lo<MIN_CORNER_LEG){buckets.shortLeg++;continue}
    inx/=li;iny/=li;outx/=lo;outy/=lo
    const cross=(inx*outy-iny*outx)*sign
    const turn=Math.acos(Math.max(-1,Math.min(1,inx*outx+iny*outy)))
    if(cross<=0){ buckets.concave++; continue }           // concave/reflex — filletRing skips
    if(turn<FILLET_TURN_TOL){ buckets.straight++; continue }
    buckets.convexCorner++; convexCornerIdx.push(i)
  }
  return {ring,buckets,convexCornerIdx}
}

const tiles=r._tiles||[]
const agg={straight:0,convexCorner:0,concave:0,shortLeg:0}
let tileConvex=0
for(const t of tiles){ if(!t.ring||t.ring.length<3)continue
  const c=classifyRing(t.ring)
  for(const k of Object.keys(agg)) agg[k]+=c.buckets[k]
  tileConvex+=c.buckets.convexCorner
}
console.log('=== TILE.RING vertex classification (filletRing convex test) ===')
console.log(JSON.stringify(agg,null,0))
console.log('tile.ring CONVEX sharp corners (true handle candidates):', tileConvex)

const cf=r.cornerFillets||{}
const cfKeys=Object.keys(cf)
console.log('cornerFillets stamped:', cfKeys.length)
console.log('GAP (tile-ring convex corners - stamped):', tileConvex - cfKeys.length)

// match each cornerFillet apex to its containing tile + nearest convex corner
function pointInRing(px,py,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))inside=!inside}return inside}

// per-tile: convex corners vs stamped fillets whose apex lands in this tile
const perTile=[]
for(let ti=0;ti<tiles.length;ti++){const t=tiles[ti];if(!t.ring||t.ring.length<3){perTile.push(null);continue}
  const c=classifyRing(t.ring)
  let stamped=0
  for(const k of cfKeys){const f=cf[k];const ap=f.apex;if(ap&&pointInRing(ap[0],ap[1],t.ring))stamped++}
  perTile.push({ti,convex:c.buckets.convexCorner,stamped,area:Math.abs(signedArea(t.ring)),nVerts:t.ring.length})
}
// tiles where convex > stamped
const deficit=perTile.filter(Boolean).filter(p=>p.convex>p.stamped)
console.log('\n=== per-tile deficits (convex corners > stamped fillets) ===')
console.log('tiles with deficit:', deficit.length, '/', perTile.filter(Boolean).length)
let totDef=0
for(const p of deficit.sort((a,b)=>(b.convex-b.stamped)-(a.convex-a.stamped))){
  totDef+=p.convex-p.stamped
  if(p.convex-p.stamped>=1) console.log(`  tile#${p.ti}: convex=${p.convex} stamped=${p.stamped} deficit=${p.convex-p.stamped} area=${p.area.toFixed(1)} nVerts=${p.nVerts}`)
}
console.log('total deficit across tiles:', totDef)

// how many tiles are slivers (<0.5 m2 blockring would be dropped) — proxy by tile area
const small=perTile.filter(Boolean).filter(p=>p.area<5)
console.log('\ntiles with area<5 m2 (sliver candidates):', small.length)
