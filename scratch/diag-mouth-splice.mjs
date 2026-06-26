import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const d = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const tiles = Array.isArray(d) ? d : d.tiles
const cw = 0.1524
const stripMat = { outer: 'LU', inner: 'SW' }

const tipKey = (p) => `${Math.round(p[0]*1000)},${Math.round(p[1]*1000)}`
const dist = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])

// ring area via shoelace, summed over all rings (Wacc rings come as ClipperPaths-ish [{X,Y}] or [[x,y]])
function ringArea(ring){
  // ring may be array of {X,Y} (clipper) or [x,y]
  const pt = (p)=> Array.isArray(p) ? p : [p.X, p.Y]
  let a=0
  for(let i=0;i<ring.length;i++){const p=pt(ring[i]),q=pt(ring[(i+1)%ring.length]);a += p[0]*q[1]-q[0]*p[1]}
  return Math.abs(a)/2
}
function totalArea(rings){ return (rings||[]).reduce((s,r)=>s+ringArea(r),0) }
function bbox(rings){
  let xn=1e9,yn=1e9,xx=-1e9,yx=-1e9
  for(const r of rings||[]) for(const p0 of r){const p=Array.isArray(p0)?p0:[p0.X,p0.Y]; xn=Math.min(xn,p[0]);yn=Math.min(yn,p[1]);xx=Math.max(xx,p[0]);yx=Math.max(yx,p[1])}
  return {xn,yn,xx,yx}
}

// deep clone a tile so we can mutate runs
function clone(t){ return JSON.parse(JSON.stringify(t)) }

// build a collapsed version: for each spur (skelId with both left & right runs that end on
// distinct fillet apexes near a shared mouth) snap the two spur mouth-ends to their midpoint.
// We detect spliced ends = run-ends that coincide (within 0.2m) with a fillet apex AND whose
// partner (other side, same skelId) ends at a DIFFERENT apex within ~MOUTH chord.
function collapse(t){
  const c = clone(t)
  const fillets = c.fillets||[]
  const isApex = (p)=> fillets.some(f=>dist(f.apex,p)<0.2)
  // group runs by skelId
  const bySkel = new Map()
  for(const r of c.runs){ if(!bySkel.has(r.skelId)) bySkel.set(r.skelId,[]); bySkel.get(r.skelId).push(r) }
  let collapsedMouths = 0
  for(const [skel,rs] of bySkel){
    if(!rs.some(r=>r.side==='left')||!rs.some(r=>r.side==='right')) continue
    // candidate mouth-ends = ends sitting exactly on an apex
    const cands = []
    for(const r of rs){
      for(const idx of [0, r.poly.length-1]){
        const p = r.poly[idx]
        if(isApex(p)) cands.push({r,idx,p})
      }
    }
    // need two cands on opposite sides within ~16m of each other → a spliced mouth pair
    for(let i=0;i<cands.length;i++) for(let j=i+1;j<cands.length;j++){
      const A=cands[i],B=cands[j]
      if(A.r.side===B.r.side) continue
      if(dist(A.p,B.p)>16) continue
      const mid=[(A.p[0]+B.p[0])/2,(A.p[1]+B.p[1])/2]
      A.r.poly[A.idx]=[mid[0],mid[1]]
      B.r.poly[B.idx]=[mid[0],mid[1]]
      collapsedMouths++
    }
  }
  return {tile:c, collapsedMouths}
}

for(const idx of [53,11]){
  const t = tiles[idx]
  const spliced = sectionPassTile(t, cw, stripMat, null)
  const {tile:ct, collapsedMouths} = collapse(t)
  const collapsed = sectionPassTile(ct, cw, stripMat, null)
  console.log(`\n=== tile[${idx}] === collapsedMouths=${collapsedMouths}`)
  console.log(`  SPLICED  : SW rings=${spliced.Wacc.length} area=${totalArea(spliced.Wacc).toFixed(2)}`)
  console.log(`  COLLAPSED: SW rings=${collapsed.Wacc.length} area=${totalArea(collapsed.Wacc).toFixed(2)}`)
  console.log(`  ΔSW area = ${(totalArea(spliced.Wacc)-totalArea(collapsed.Wacc)).toFixed(2)} m²,  Δringcount=${spliced.Wacc.length-collapsed.Wacc.length}`)
}
