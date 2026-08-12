// READ-ONLY forensic: what a re-pour / clip-removal moves.
// Writes nothing. Reads skeleton.json (PRE-clip) + ribbons.json (POST-clip).
import { readFileSync } from 'fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'

const SK = JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const RB = JSON.parse(readFileSync('src/data/ribbons.json','utf8'))
const NB = JSON.parse(readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const D  = JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf8'))

const cx = NB.center?.[0] ?? 0, cz = NB.center?.[1] ?? 0
const keepR = (NB.streetFade?.outer ?? NB.radius ?? Infinity) + 30
const R2 = keepR*keepR
console.log(`clip params: center=[${cx},${cz}] keepR=${keepR}`)

// EXACT copy of pipeline.js clipRun (lines 176-205), but instrumented to return ALL pieces.
function clipPieces(pts){
  if (!Array.isArray(pts) || pts.length < 2) return [pts]
  const inC=(x,z)=>(x-cx)**2+(z-cz)**2<=R2
  const pieces=[]; let cur=null
  const close=()=>{ if(cur&&cur.length>=2) pieces.push(cur); cur=null }
  const push=(p)=>{ if(!cur){cur=[p];return} const l=cur[cur.length-1]; if(l[0]!==p[0]||l[1]!==p[1]) cur.push(p) }
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],A=dx*dx+dz*dz
    const ts=[]
    if(A>1e-12){ const fx=a[0]-cx,fz=a[1]-cz,B=2*(fx*dx+fz*dz),C=fx*fx+fz*fz-R2,disc=B*B-4*A*C
      if(disc>0){const sq=Math.sqrt(disc); for(const t of [(-B-sq)/(2*A),(-B+sq)/(2*A)]) if(t>1e-9&&t<1-1e-9) ts.push(t)} }
    ts.sort((x,y)=>x-y)
    const stops=[0,...ts,1]
    for(let s=0;s<stops.length-1;s++){
      const t0=stops[s],t1=stops[s+1]; if(t1-t0<1e-9) continue
      const mt=(t0+t1)/2
      if(inC(a[0]+dx*mt,a[1]+dz*mt)){push([a[0]+dx*t0,a[1]+dz*t0]);push([a[0]+dx*t1,a[1]+dz*t1])} else close()
    }
  }
  close()
  return pieces
}
const len=(p)=>{let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return L}

// ── PRE-clip streets, as [x,z] ──
const pre = SK.streets.map(s=>({ skelId:s.id, name:s.name, points:(s.points||[]).map(p=>[p.x,p.z]) }))
console.log(`\n=== A. CLIP CENSUS (applied to skeleton.json's ${pre.length} chains) ===`)
let untouched=0, trimmed=0, multiPiece=0, fullyOut=0
let totalPre=0, totalPost=0, lostInsidePieces=0, lostInsideM=0
const clipped=[]
for(const s of pre){
  const L0=len(s.points); totalPre+=L0
  const pieces=clipPieces(s.points)
  if(!pieces.length){ fullyOut++; clipped.push({...s, post:null, pieces:0}); continue }
  const best=pieces.reduce((p,q)=>q.length>p.length?q:p)
  const L1=len(best); totalPost+=L1
  if(pieces.length>1){ multiPiece++; for(const p of pieces) if(p!==best){lostInsidePieces++; lostInsideM+=len(p)} }
  if(Math.abs(L1-L0)<1e-6 && pieces.length===1) untouched++; else trimmed++
  clipped.push({...s, post:best, pieces:pieces.length})
}
console.log(`  untouched (whole chain inside): ${untouched}`)
console.log(`  trimmed  (geometry removed):    ${trimmed}`)
console.log(`  of which multi-piece (an INSIDE run was discarded): ${multiPiece}  → ${lostInsidePieces} pieces, ${lostInsideM.toFixed(1)} m`)
console.log(`  dropped entirely (fully outside): ${fullyOut}`)
console.log(`  street length: pre ${totalPre.toFixed(0)} m → post ${totalPost.toFixed(0)} m  (removed ${(totalPre-totalPost).toFixed(0)} m = ${((1-totalPost/totalPre)*100).toFixed(1)}%)`)

// ── B. SEGMENTATION: unclipped vs clipped ──
const mkSegs=(streets)=>{
  const ix=resolveChainSegmentation(streets)
  const out=new Map()
  for(const s of streets){
    const n=(s.points||[]).length
    if(n<2){ out.set(s.skelId,[]); continue }
    const set=ix.get(s)
    let ixs=set?[...set].filter(i=>Number.isInteger(i)&&i>0&&i<n-1).sort((a,b)=>a-b):[]
    const segs=[]
    if(!ixs.length) segs.push({start:0,end:n-1})
    else{ let prev=0; for(const i of ixs){ if(i>prev) segs.push({start:prev,end:i}); prev=i } if(prev<n-1) segs.push({start:prev,end:n-1}) }
    out.set(s.skelId, segs.map(g=>({...g, mid:[ (s.points[g.start][0]+s.points[g.end][0])/2, (s.points[g.start][1]+s.points[g.end][1])/2 ], len:len(s.points.slice(g.start,g.end+1))})))
  }
  return out
}
const unclippedStreets = pre.filter(s=>s.points.length>=2)
const clippedStreets   = clipped.filter(c=>c.post).map(c=>({skelId:c.skelId,name:c.name,points:c.post}))
const segU = mkSegs(unclippedStreets)
const segC = mkSegs(clippedStreets)

console.log(`\n=== B. SEGMENTATION SHIFT (segOrd = index into naturalSegments) ===`)
let same=0, shifted=0, gone=0
const shiftRows=[]
for(const s of unclippedStreets){
  const a=segU.get(s.skelId)||[], b=segC.get(s.skelId)
  if(!b){ gone++; continue }
  if(a.length===b.length) same++
  else { shifted++; shiftRows.push([s.skelId, a.length, b.length]) }
}
console.log(`  chains with SAME segment count clipped vs unclipped: ${same}`)
console.log(`  chains whose segment COUNT changes:                  ${shifted}`)
console.log(`  chains that vanish under the clip:                   ${gone}`)

// C. Did an UNTOUCHED chain's segmentation change? (the catastrophic case)
console.log(`\n=== C. UNTOUCHED CHAINS whose segOrd partition still moved ===`)
const untouchedIds=new Set(clipped.filter(c=>c.post&&c.pieces===1&&Math.abs(len(c.post)-len(c.points))<1e-6).map(c=>c.skelId))
let untouchedMoved=0
for(const id of untouchedIds){
  const a=segU.get(id)||[], b=segC.get(id)||[]
  if(a.length!==b.length){ untouchedMoved++; console.log(`  ⛔ ${id}: ${a.length} → ${b.length} segments (its own geometry did NOT change)`) }
}
console.log(`  total: ${untouchedMoved} of ${untouchedIds.size} geometrically-untouched chains change segOrd partition`)

// D. The authored slots
console.log(`\n=== D. AUTHORED SLOT RESOLUTION (design.json blockCustoms) ===`)
const bc=D.blockCustoms||{}
let ok=0, orphanU=0, capSlots=0
for(const skel of Object.keys(bc)) for(const side of Object.keys(bc[skel])) for(const so of Object.keys(bc[skel][side])){
  const n=Number(so)
  if(n<0){ capSlots++; const alive=segC.has(skel); console.log(`  CAP  ${skel}|${side}|${so}  chain present clipped=${segC.has(skel)} unclipped=${segU.has(skel)}`); continue }
  const c=segC.get(skel), u=segU.get(skel)
  const inC = c && n < c.length, inU = u && n < u.length
  if(inC&&inU) ok++
  if(!inU) orphanU++
  const flag = (inC===inU) ? '' : '  ⛔ RESOLUTION CHANGES'
  if(!inC||!inU||flag) console.log(`  ${skel}|${side}|${n}: clipped segs=${c?c.length:'CHAIN GONE'} unclipped segs=${u?u.length:'CHAIN GONE'}${flag}`)
}
console.log(`  cap slots (negative segOrd, chain-keyed only): ${capSlots}`)

// E. skelId set drift: skeleton vs committed ribbons
console.log(`\n=== E. skelId SET: skeleton.json vs committed ribbons.json ===`)
const skIds=new Set(pre.map(s=>s.skelId))
const rbIds=new Set(RB.streets.map(s=>s.skelId))
const missing=[...skIds].filter(i=>!rbIds.has(i))
const extra=[...rbIds].filter(i=>!skIds.has(i))
console.log(`  skeleton ${skIds.size} · ribbons ${rbIds.size}`)
console.log(`  in skeleton but NOT in ribbons (${missing.length}): ${missing.join(', ')}`)
console.log(`  in ribbons but NOT in skeleton (${extra.length}): ${extra.join(', ')}`)
const dupSk = pre.length - skIds.size, dupRb = RB.streets.length - rbIds.size
console.log(`  DUPLICATE skelIds — skeleton: ${dupSk}, ribbons: ${dupRb}`)
