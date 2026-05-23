// Stage 6 — Corner-interior regime audit.
// For every block-corner arc-span in V2's blockRounded, classify which
// regime fires (ASYM / SYM-WITH-RAMP / SYM-NO-RAMP / NEITHER-EMITTED)
// and whether the emission is doctrine-correct (concentric inset arcs).
// Diagnostic only. No source edits, no fixes.
//
// Replicates buildFrontageBandsV2's regime predicates (lines 1578-1655
// of src/lib/buildBlockGeometryV2.js) by:
//  1. Loading V2 via the same scaffolding as scratch/h1-backfill-dryrun.
//  2. Partitioning each blockRounded ring into spans by comparing each
//     vertex to its blockSharp counterpart (literal vs arc-sample).
//  3. Matching arc-spans to corner records by point proximity.
//  4. Probing flanking straight-span midpoints with the same
//     findAdjacentChainForBlockEdge logic to get tl_A/sw_A/tl_B/sw_B.
//  5. Applying the same isAsym / hasRamp predicates + cusp guard.
import { readFileSync, writeFileSync } from 'fs'
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
const stenScale = radius > 0 ? targetR / radius : 1
const stencil = sten.boundary.map(([x,z]) => [center[0]+(x-center[0])*stenScale, center[1]+(z-center[1])*stenScale])

const cornerRadiusScale = design.cornerRadiusScale ?? 1
const blockCustoms = design.blockCustoms || null

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms,
  blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? 0.45,
})

const curbWidth = design.curbWidth ?? 0.45
const streets = ribbons.streets

// ---- helpers (duplicated from buildBlockGeometryV2.js) --------------

const RAD = Math.PI / 180

function blockKeyFromRing(ring){let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
  for(const p of ring){if(p[0]<minX)minX=p[0];if(p[0]>maxX)maxX=p[0];if(p[1]<minY)minY=p[1];if(p[1]>maxY)maxY=p[1]}
  const cx=Math.round(((minX+maxX)/2)*2)/2, cy=Math.round(((minY+maxY)/2)*2)/2
  return `${cx.toFixed(1)},${cy.toFixed(1)}`}
function ringSignedArea2D(r){let a=0;for(let i=0,n=r.length;i<n;i++){const [x1,y1]=r[i], [x2,y2]=r[(i+1)%n]; a+=(x1*y2-x2*y1)} return a/2}
function depthForSide(s){if(s?.terminal!=='sidewalk')return 0;return (s?.treelawn||0)+(s?.sidewalk||0)}
function tlOf(s){return s?.terminal==='sidewalk'?(s?.treelawn||0):0}
function swOf(s){return s?.terminal==='sidewalk'?(s?.sidewalk||0):0}

// findAdjacentChainForBlockEdge — full-scan port (no spatial index).
function findAdjacentChainForBlockEdge(edgePoints, ringCcw){
  const N=edgePoints.length
  if(N<2)return null
  const mid=Math.floor(N/2)
  const a=edgePoints[Math.max(0,mid-1)], b=edgePoints[Math.min(N-1,mid)]
  const tx=b[0]-a[0], tz=b[1]-a[1]
  const tL=Math.hypot(tx,tz); if(tL<1e-6)return null
  const sign=ringCcw?+1:-1
  const nx=sign*tz/tL, nz=sign*(-tx)/tL
  const mx=(a[0]+b[0])*0.5, mz=(a[1]+b[1])*0.5
  const PROBE_MAX=30
  let bestDist=Infinity, bestChainIdx=-1, bestSegA=null, bestSegB=null
  for(let probe=1; probe<=PROBE_MAX; probe+=2){
    const px=mx+nx*probe, pz=mz+nz*probe
    for(let chainIdx=0; chainIdx<streets.length; chainIdx++){
      const s=streets[chainIdx]
      if(!s||s.disabled||!s.points||s.points.length<2||!s.measure)continue
      const cps=s.points
      for(let i=0;i<cps.length-1;i++){
        const ca=cps[i], cb=cps[i+1]
        const cdx=cb[0]-ca[0], cdz=cb[1]-ca[1]
        const cL2=cdx*cdx+cdz*cdz; if(cL2<1e-9)continue
        const t=Math.max(0,Math.min(1,((px-ca[0])*cdx+(pz-ca[1])*cdz)/cL2))
        const qx=ca[0]+t*cdx, qz=ca[1]+t*cdz
        const dist=Math.hypot(px-qx,pz-qz)
        if(dist<bestDist){bestDist=dist; bestChainIdx=chainIdx; bestSegA=ca; bestSegB=cb}
      }
    }
    if(bestDist<3)break
  }
  if(bestChainIdx<0||bestDist>PROBE_MAX)return null
  const cdx=bestSegB[0]-bestSegA[0], cdz=bestSegB[1]-bestSegA[1]
  const leftPx=-cdz, leftPz=cdx
  const projL=(mx-bestSegA[0])*leftPx+(mz-bestSegA[1])*leftPz
  const side=projL>0?'right':'left'
  return {chainIdx:bestChainIdx, side, dist:bestDist}
}

function resolveMeasureForEdge(edgePts, ringCcw, blockKey){
  const adj=findAdjacentChainForBlockEdge(edgePts, ringCcw)
  if(!adj)return null
  const street=streets[adj.chainIdx]
  // Need sharpFeByKey lookup → we don't have feLookup here, so probe
  // frontageEdges from v2 instead.
  let sharpFe=null
  for(const fe of v2.frontageEdges||[]){
    if(fe.chainIdx===adj.chainIdx && fe.side===adj.side && fe.blockKey===blockKey){sharpFe=fe; break}
  }
  const blockOverride=(sharpFe && blockCustoms?.[sharpFe.blockKey]?.[sharpFe.edgeOrd])||null
  const eff=blockOverride || street?.measure?.[adj.side] || {}
  return {chainIdx:adj.chainIdx, side:adj.side, edgeOrd:sharpFe?.edgeOrd, tl:tlOf(eff), sw:swOf(eff), terminal:eff.terminal||null, dist:adj.dist, sharpFeFound:!!sharpFe}
}

// SELFINT detector — same as scratch/all-band-selfint-scan.js
function segIntersect(a,b,c,d){const x1=a[0],y1=a[1],x2=b[0],y2=b[1],x3=c[0],y3=c[1],x4=d[0],y4=d[1];const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-9)return false;const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den;const u=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/den;return t>1e-6&&t<1-1e-6&&u>1e-6&&u<1-1e-6}
function ringSelfInt(r){const n=r.length;for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(segIntersect(r[i],r[(i+1)%n],r[j],r[(j+1)%n]))return true}return false}

// ---- applyRoundCornersToRing + Bezier helpers (inlined verbatim) ---
const BEZIER_N = 16
function unit(v){const l=Math.hypot(v[0],v[1]);return l>1e-9?[v[0]/l,v[1]/l]:[1,0]}
function cubicBezierEval(p0,p1,p2,p3,t){const u=1-t;const uu=u*u,tt=t*t;const uuu=uu*u,ttt=tt*t;const b0=uuu,b1=3*uu*t,b2=3*u*tt,b3=ttt;return [b0*p0[0]+b1*p1[0]+b2*p2[0]+b3*p3[0],b0*p0[1]+b1*p1[1]+b2*p2[1]+b3*p3[1]]}
function bezierReplaceCorner(cur,R,theta,tangentA,tangentB){
  if(R<=0)return [cur]
  const halfTheta=theta/2
  const tanH=Math.tan(halfTheta)
  if(tanH<=1e-6)return [cur]
  const inset=R/tanH
  const handleLen=(4/3)*R*Math.tan((Math.PI-theta)/4)
  const tA=[cur[0]+inset*tangentA[0], cur[1]+inset*tangentA[1]]
  const tB=[cur[0]+inset*tangentB[0], cur[1]+inset*tangentB[1]]
  const P1=[tA[0]-handleLen*tangentA[0], tA[1]-handleLen*tangentA[1]]
  const P2=[tB[0]-handleLen*tangentB[0], tB[1]-handleLen*tangentB[1]]
  const out=[tA]
  for(let k=1;k<BEZIER_N;k++){const t=k/BEZIER_N; out.push(cubicBezierEval(tA,P1,P2,tB,t))}
  out.push(tB)
  return out
}
function defaultR_local(theta,d_min){
  if(theta<5*RAD||theta>175*RAD)return 0
  if(d_min<=1e-6)return 0
  const sin=Math.sin(theta/2)
  const denom=1-sin
  if(denom<1e-6)return Math.min(4.5,d_min)
  const Rmax=d_min*(1-0.5*sin)/denom
  return Math.max(0,Math.min(4.5,Rmax))
}
function applyRoundCornersToRing(ring, corners, scale=1, __dbg=null){
  const TOL=0.5
  const n=ring.length
  if(n===0)return {ring:[],arcMeta:[]}
  const ringSign=ringSignedArea2D(ring)>=0?+1:-1
  const matched=new Array(n).fill(null)
  for(let i=0;i<n;i++){
    const cur=ring[i]
    for(const c of corners){
      if(Math.hypot(cur[0]-c.point[0],cur[1]-c.point[1])<TOL){matched[i]=c;break}
    }
  }
  if(__dbg){__dbg.matched=matched.filter(Boolean).length; __dbg.ringSign=ringSign; __dbg.notConvex=0; __dbg.smallR=0; __dbg.passedAll=0}
  const spans=[]
  const consumed=new Array(n).fill(-1)
  for(let i=0;i<n;i++){
    const m=matched[i]; if(!m)continue
    const prev=ring[(i-1+n)%n], cur=ring[i], next=ring[(i+1)%n]
    const inDir=unit([cur[0]-prev[0],cur[1]-prev[1]])
    const outDir=unit([next[0]-cur[0],next[1]-cur[1]])
    const cross=inDir[0]*outDir[1]-inDir[1]*outDir[0]
    if(cross*ringSign<=0){if(__dbg)__dbg.notConvex++; continue}
    const baseR=Number.isFinite(m.R_authored)?m.R_authored:defaultR_local(m.theta,m.d_min)
    const R=baseR*scale
    if(R<=0.05){if(__dbg)__dbg.smallR++; continue}
    if(__dbg)__dbg.passedAll++
    const halfTheta=m.theta/2
    const tanH=Math.tan(halfTheta)
    if(tanH<=1e-6)continue
    const inset=R/tanH
    let start=i, walkedBack=0
    while(true){
      const prevIdx=(start-1+n)%n
      if(prevIdx===i)break
      if(matched[prevIdx])break
      const d=Math.hypot(ring[start][0]-ring[prevIdx][0],ring[start][1]-ring[prevIdx][1])
      if(walkedBack+d>inset)break
      walkedBack+=d; start=prevIdx
    }
    let end=i, walkedFwd=0
    while(true){
      const nextIdx=(end+1)%n
      if(nextIdx===i)break
      if(matched[nextIdx])break
      const d=Math.hypot(ring[end][0]-ring[nextIdx][0],ring[end][1]-ring[nextIdx][1])
      if(walkedFwd+d>inset)break
      walkedFwd+=d; end=nextIdx
    }
    const spanIdx=spans.length
    spans.push({start,end,cornerIdx:i,corner:m,R})
    let k=start
    while(true){consumed[k]=spanIdx; if(k===end)break; k=(k+1)%n}
  }
  if(spans.length===0)return {ring:ring.slice(),arcMeta:new Array(n).fill(null)}
  let i0=0
  while(i0<n && consumed[i0]!==-1)i0++
  if(i0>=n)i0=0
  const out=[], outMeta=[], emittedSpan=new Set()
  for(let k=0;k<n;k++){
    const i=(i0+k)%n
    const sIdx=consumed[i]
    if(sIdx===-1){out.push(ring[i]); outMeta.push(null); continue}
    if(emittedSpan.has(sIdx))continue
    emittedSpan.add(sIdx)
    const span=spans[sIdx]
    const cornerVertex=ring[span.cornerIdx]
    let arc=bezierReplaceCorner(cornerVertex,span.R,span.corner.theta,span.corner.T_A,span.corner.T_B)
    const N1=arc.length
    const arcMetaForSpan=new Array(N1)
    for(let m=0;m<N1;m++)arcMetaForSpan[m]={corner:span.corner,R:span.R,arcPositionFrac:m/(N1-1)}
    arc=arc.slice().reverse()
    arcMetaForSpan.reverse()
    for(let m=0;m<N1;m++)arcMetaForSpan[m]={corner:arcMetaForSpan[m].corner,R:arcMetaForSpan[m].R,arcPositionFrac:1-arcMetaForSpan[m].arcPositionFrac}
    for(let m=0;m<arc.length;m++){out.push(arc[m]); outMeta.push(arcMetaForSpan[m])}
  }
  return {ring:out, arcMeta:outMeta}
}

// ---- regime constants (copied verbatim) -----------------------------
const PHASE2_ASYM_EPS_M = 1.0
const PHASE2_ASYM_RATIO = 0.7
const PHASE2_RAMP_MAX_M = 2.0
const PHASE2_RAMP_FRAC  = 0.4
const PHASE2_RAMP_MIN_M = 0.5
const PHASE2_STEP_FRAC  = 0.5  // (unused in audit; recorded for posterity)

// ---- audit ----------------------------------------------------------

// Step 1: build (blockSharp ring, blockRounded ring) pairs.
// blockRounded as returned from V2 already filters length<3; reconstitute
// pairing by best-match centroid + bbox — but the source applies
// applyRoundCornersToRing one-to-one over blockSharp (line 2177). So
// pre-filter rounded results aligns with blockSharp; the post-filter
// (length<3) only drops a handful. We pair by blockKeyFromRing match.
const sharpRings = v2.blockSharp || []
const corners = v2.corners || []

// Step 2: re-derive (rounded ring, arcMeta) pairs by inlining
// applyRoundCornersToRing on each sharp ring. Use the same allCorners
// the V2 pipeline produced.
const blockRoundedResults = sharpRings.map(r => applyRoundCornersToRing(r, corners, cornerRadiusScale))

// Step 3: per rounded ring, partition into spans by arcMeta corner identity.
// Re-implements buildFrontageBandsV2's partition (lines 1480-1493).
const arcSpans = [] // { blockKey, rRing, arcIdxs, prevIdxs, nextIdxs, corner }
for(const {ring:rRing, arcMeta} of blockRoundedResults){
  if(!rRing||rRing.length<3||!arcMeta)continue
  const N=rRing.length
  const key=blockKeyFromRing(rRing)
  // partition
  const spans=[]
  let curSpan={type: arcMeta[0]?.corner?'arc':'straight', idxs:[0], corner:arcMeta[0]?.corner||null}
  for(let i=1;i<N;i++){
    const c=arcMeta[i]?.corner||null
    if(c===curSpan.corner)curSpan.idxs.push(i)
    else {spans.push(curSpan); curSpan={type:c?'arc':'straight', idxs:[i], corner:c}}
  }
  spans.push(curSpan)
  // wraparound merge
  if(spans.length>1 && spans[0].corner===spans[spans.length-1].corner){
    const last=spans.pop()
    spans[0].idxs=[...last.idxs, ...spans[0].idxs]
  }
  // emit arc-spans with flanking neighbors
  for(let si=0; si<spans.length; si++){
    const span=spans[si]
    if(span.type!=='arc')continue
    const prev=spans[(si-1+spans.length)%spans.length]
    const next=spans[(si+1)%spans.length]
    arcSpans.push({
      blockKey:key, rRing, arcIdxs:span.idxs,
      prevIdxs: prev.type==='straight'?prev.idxs:[],
      nextIdxs: next.type==='straight'?next.idxs:[],
      corner: span.corner,
      arcMid: rRing[span.idxs[Math.floor(span.idxs.length/2)]],
    })
  }
}

// Step 4: cross-reference each arc-span to the matching v2.frontageBands entry.
// Match by (blockKey, corner identity). corner identity uses object ref
// when possible; fallback to point proximity.
const fbsByKey = new Map()
for(const fb of v2.frontageBands){
  if(!fb||!fb.corner)continue
  const arr = fbsByKey.get(fb.blockKey)||[]
  arr.push(fb)
  fbsByKey.set(fb.blockKey, arr)
}
function findFbForArcSpan(span){
  const bucket=fbsByKey.get(span.blockKey)||[]
  for(const fb of bucket){
    if(span.corner && fb.corner===span.corner)return fb
  }
  // fallback: nearest corner.point
  let best=null, bestD=Infinity
  for(const fb of bucket){
    const d=Math.hypot(fb.corner.point[0]-span.arcMid[0], fb.corner.point[1]-span.arcMid[1])
    if(d<bestD){bestD=d; best=fb}
  }
  return bestD<3 ? best : null
}

// Step 5: classify regime for each arc-span.
const rows=[]
let neitherEmitted=0
let cornerRecordCountByBlock=new Map()
for(const span of arcSpans){
  // ringCcw
  const ringCcw = ringSignedArea2D(span.rRing) >= 0
  // prevMeta = straight resolution on prevIdxs; nextMeta = on nextIdxs.
  const prevPts = span.prevIdxs.map(k=>span.rRing[k])
  const nextPts = span.nextIdxs.map(k=>span.rRing[k])
  const Bmeta = prevPts.length>=2 ? resolveMeasureForEdge(prevPts, ringCcw, span.blockKey) : null
  const Ameta = nextPts.length>=2 ? resolveMeasureForEdge(nextPts, ringCcw, span.blockKey) : null
  // source's spanMeta marks skip when !isSidewalk || tl<=0 && sw<=0.
  const skip = (m) => !m || m.terminal!=='sidewalk' || (m.tl<=0 && m.sw<=0)
  const Bok = !skip(Bmeta) ? Bmeta : null
  const Aok = !skip(Ameta) ? Ameta : null
  // No emission if BOTH skip
  let regime
  let tl_A=0, sw_A=0, tl_B=0, sw_B=0
  let arcR=Infinity
  if(span.corner){
    const baseR=Number.isFinite(span.corner.R_authored)?span.corner.R_authored:(()=>{
      const sin=Math.sin(span.corner.theta/2)
      const denom=1-sin
      if(span.corner.theta<5*RAD||span.corner.theta>175*RAD)return 0
      if(span.corner.d_min<=1e-6)return 0
      if(denom<1e-6)return Math.min(4.5, span.corner.d_min)
      const Rmax=span.corner.d_min*(1-0.5*sin)/denom
      return Math.max(0, Math.min(4.5, Rmax))
    })()
    arcR = baseR * cornerRadiusScale
  }
  if(!Bok && !Aok){
    regime='NEITHER-EMITTED'
    neitherEmitted++
  } else {
    tl_B = Bok?.tl ?? Aok?.tl ?? 0
    sw_B = Bok?.sw ?? Aok?.sw ?? 0
    tl_A = Aok?.tl ?? Bok?.tl ?? 0
    sw_A = Aok?.sw ?? Bok?.sw ?? 0
    // cusp guard
    const cw=curbWidth
    const safeMax=Math.max(cw+0.05, arcR*0.9)
    const totalMax=Math.max(cw+tl_A+sw_A, cw+tl_B+sw_B)
    let cuspFired=false
    if(totalMax>safeMax){
      const k=(safeMax-cw)/Math.max(1e-9,totalMax-cw)
      tl_A*=k; sw_A*=k; tl_B*=k; sw_B*=k
      cuspFired=true
    }
    span._cuspFired=cuspFired
    const d_A=cw+tl_A+sw_A
    const d_B=cw+tl_B+sw_B
    const diff=Math.abs(d_A-d_B)
    const dMax=Math.max(d_A,d_B), dMin=Math.min(d_A,d_B)
    const ratio=dMax>1e-9?dMin/dMax:1
    const isAsym = diff>PHASE2_ASYM_EPS_M || ratio<PHASE2_ASYM_RATIO
    const hasRamp = !isAsym && tl_A>0 && tl_B>0
    if(isAsym) regime='ASYM'
    else if(hasRamp) regime='SYM-WITH-RAMP'
    else regime='SYM-NO-RAMP'
    span._d_A=d_A; span._d_B=d_B; span._diff=diff; span._ratio=ratio
  }

  // Locate fb output
  const fb = findFbForArcSpan(span)
  const tlRings = fb?.treelawnRings?.length || 0
  const swRings = fb?.sidewalkRings?.length || 0
  const aspRings = fb?.asphaltRings?.length || 0

  // arc total length (along blockRounded vertices)
  let arcLen=0
  for(let k=1;k<span.arcIdxs.length;k++){
    const a=span.rRing[span.arcIdxs[k-1]], b=span.rRing[span.arcIdxs[k]]
    arcLen += Math.hypot(b[0]-a[0], b[1]-a[1])
  }

  // ramp stats when SYM-WITH-RAMP
  let rampLen=null, rampRatio=null
  if(regime==='SYM-WITH-RAMP'){
    rampLen = Math.min(PHASE2_RAMP_MAX_M, PHASE2_RAMP_FRAC*arcLen)
    rampRatio = arcLen>0 ? rampLen/arcLen : 0
  }

  // Doctrine-correct concentric: requires tl>0+sw>0 on both sides AND
  // SYM-WITH-RAMP regime AND tl ring(s) AND sw ring(s) emitted.
  const bothTlSw = Bok && Aok && Bok.tl>0 && Bok.sw>0 && Aok.tl>0 && Aok.sw>0
  const concentric = bothTlSw && regime==='SYM-WITH-RAMP' && tlRings>=1 && swRings>=1

  // SELFINT in this fb's rings
  let selfInt=false
  if(fb){
    for(const k of ['treelawnRings','sidewalkRings','asphaltRings']){
      for(const r of (fb[k]||[])){
        if(r.length>=3 && ringSelfInt(r)){selfInt=true;break}
      }
      if(selfInt)break
    }
  }

  const C=span.corner
  const cornerR = arcR
  const theta_deg = C?(C.theta*180/Math.PI):null

  // Doctrine-violation flag: both sides authored tl>0+sw>0 but no tl emitted
  const dropTreeLawn = bothTlSw && tlRings===0

  // Chain names
  const aName = Aok ? (streets[Aok.chainIdx]?.name||`#${Aok.chainIdx}`) : null
  const bName = Bok ? (streets[Bok.chainIdx]?.name||`#${Bok.chainIdx}`) : null

  // Track per-IX corner count
  if(C){
    const vKey = C.V ? `${C.V[0].toFixed(2)},${C.V[1].toFixed(2)}` : 'null'
    cornerRecordCountByBlock.set(vKey, (cornerRecordCountByBlock.get(vKey)||0)+1)
  }

  rows.push({
    blockKey: span.blockKey,
    cornerPt_x: C?C.point[0].toFixed(2):'',
    cornerPt_z: C?C.point[1].toFixed(2):'',
    V_x: C?.V?.[0]?.toFixed(2)||'',
    V_z: C?.V?.[1]?.toFixed(2)||'',
    theta_deg: theta_deg!=null?theta_deg.toFixed(1):'',
    R: cornerR!==Infinity?cornerR.toFixed(2):'',
    R_authored: C?.R_authored!=null?'yes':'no',
    tl_A: Aok?Aok.tl.toFixed(2):'',
    sw_A: Aok?Aok.sw.toFixed(2):'',
    tl_B: Bok?Bok.tl.toFixed(2):'',
    sw_B: Bok?Bok.sw.toFixed(2):'',
    d_A: span._d_A!=null?span._d_A.toFixed(2):'',
    d_B: span._d_B!=null?span._d_B.toFixed(2):'',
    diff: span._diff!=null?span._diff.toFixed(2):'',
    ratio: span._ratio!=null?span._ratio.toFixed(2):'',
    regime,
    cuspFired: span._cuspFired?'1':'0',
    arcLen: arcLen.toFixed(2),
    rampLen: rampLen!=null?rampLen.toFixed(2):'',
    rampRatio: rampRatio!=null?rampRatio.toFixed(2):'',
    tlRings, swRings, aspRings,
    concentric: concentric?'1':'0',
    dropTreeLawn: dropTreeLawn?'1':'0',
    selfInt: selfInt?'1':'0',
    aChain: aName||'', aSide: Aok?.side||'',
    bChain: bName||'', bSide: Bok?.side||'',
    nArcVerts: span.arcIdxs.length,
    nPrevStraightVerts: span.prevIdxs.length,
    nNextStraightVerts: span.nextIdxs.length,
    fbFound: fb?'1':'0',
  })
}

// ---- CSV output -----------------------------------------------------
const cols=Object.keys(rows[0]||{})
const csv=[cols.join(',')]
for(const r of rows) csv.push(cols.map(c => {
  const v = r[c]; const s = String(v??'')
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
}).join(','))
writeFileSync(join(ROOT,'scratch','corner-regime-audit.csv'), csv.join('\n')+'\n')

// ---- Roll-up --------------------------------------------------------
const total = rows.length
const countByRegime = {}
for(const r of rows) countByRegime[r.regime]=(countByRegime[r.regime]||0)+1
let concCount=0, nonConc=0
for(const r of rows){
  if(r.concentric==='1') concCount++; else nonConc++
}

// Doctrine violation buckets
const dropTL = rows.filter(r=>r.dropTreeLawn==='1').length
const bigRamp = rows.filter(r=>r.regime==='SYM-WITH-RAMP' && parseFloat(r.rampRatio||'0')>0.8).length
const asymOverEager = rows.filter(r=>r.regime==='ASYM' && parseFloat(r.diff||'0')<1.5).length

// Distributions
function histo(values, binW){
  const m=new Map()
  for(const v of values){
    if(!Number.isFinite(v))continue
    const b=Math.floor(v/binW)*binW
    m.set(b,(m.get(b)||0)+1)
  }
  return [...m.entries()].sort((a,b)=>a[0]-b[0])
}
const Rvals = rows.map(r=>parseFloat(r.R)).filter(Number.isFinite)
const thetaVals = rows.map(r=>parseFloat(r.theta_deg)).filter(Number.isFinite)
const arcLenVals = rows.map(r=>parseFloat(r.arcLen)).filter(Number.isFinite)
const ratioVals = rows.map(r=>parseFloat(r.ratio)).filter(Number.isFinite)

// Worst-offender lists
const sortBy = (key, dir=-1) => [...rows].sort((a,b)=>{const av=parseFloat(a[key]||'NaN'), bv=parseFloat(b[key]||'NaN'); return dir*((Number.isFinite(av)?av:Infinity*-dir)-(Number.isFinite(bv)?bv:Infinity*-dir))})
const smallestR = sortBy('R',+1).slice(0,10)
const largestDiff = sortBy('diff',-1).slice(0,10)
const largestRamp = [...rows].filter(r=>r.regime==='SYM-WITH-RAMP').sort((a,b)=>parseFloat(b.rampRatio||'0')-parseFloat(a.rampRatio||'0')).slice(0,10)
const zeroEmitButAuthored = rows.filter(r=>r.dropTreeLawn==='1').slice(0,15)

// Asymmetry buckets
const diffOver1 = rows.filter(r=>parseFloat(r.diff||'0')>1.0).length
const diffOver2 = rows.filter(r=>parseFloat(r.diff||'0')>2.0).length
const diffOver3 = rows.filter(r=>parseFloat(r.diff||'0')>3.0).length

// SELFINT in arc-span entries
const selfIntCount = rows.filter(r=>r.selfInt==='1').length

// Cusp guard
const cuspFiredCount = rows.filter(r=>r.cuspFired==='1').length

// Corner records WITHOUT arc-span fb (NEITHER-EMITTED)
const neitherList = rows.filter(r=>r.regime==='NEITHER-EMITTED')

// Per-IX arc-span entry counts (anomaly check)
const perV = new Map()
for(const r of rows){
  const k = `${r.V_x},${r.V_z}`
  perV.set(k, (perV.get(k)||0)+1)
}
const perVCounts = {}
for(const [,n] of perV) perVCounts[n]=(perVCounts[n]||0)+1

// arc-span empty emission (slot present but tl+sw=0)
const emptyArc = rows.filter(r=>r.fbFound==='1' && r.tlRings==='0'.replace(/'/g,'')&&r.swRings===0)
const emptyArcCount = rows.filter(r=> r.fbFound==='1' && r.tlRings===0 && r.swRings===0).length
const noFilletAttribCount = rows.filter(r=> r.fbFound==='1' && r.aspRings===0).length

console.log(`=== CORNER REGIME AUDIT — LS ===`)
console.log(`Total arc-spans walked: ${total}`)
console.log(``)
console.log(`Regime counts:`)
for(const [k,v] of Object.entries(countByRegime).sort((a,b)=>b[1]-a[1])){
  console.log(`  ${k.padEnd(20)} ${v}`)
}
console.log(``)
console.log(`Concentric (doctrine-correct) vs non-concentric:`)
console.log(`  Concentric:      ${concCount}`)
console.log(`  Non-concentric:  ${nonConc}`)
console.log(``)
console.log(`Doctrine-violation buckets:`)
console.log(`  Both sides authored tl>0 + sw>0 but emitter dropped treelawn: ${dropTL}`)
console.log(`  Ramp consumed >80% of arc length: ${bigRamp}`)
console.log(`  ASYM despite |d_A − d_B| < 1.5m: ${asymOverEager}`)
console.log(``)
console.log(`Asymmetric corner buckets (|d_A − d_B|):`)
console.log(`  > 1m: ${diffOver1}`)
console.log(`  > 2m: ${diffOver2}`)
console.log(`  > 3m: ${diffOver3}`)
console.log(``)
console.log(`SELFINT in arc-span emission: ${selfIntCount}`)
console.log(`Cusp guard fired:             ${cuspFiredCount} (${(100*cuspFiredCount/total).toFixed(1)}%)`)
console.log(`Empty arc-span (slot pushed, no tl + no sw): ${emptyArcCount}`)
console.log(`Arc-span entries with no fillet asphaltRings: ${noFilletAttribCount}`)
console.log(``)
console.log(`Per-IX arc-span count distribution:`)
for(const [k,v] of Object.entries(perVCounts).sort((a,b)=>a[0]-b[0])) console.log(`  ${k} arc-spans per IX → ${v} IXs`)
console.log(``)
console.log(`R histogram (1m bins):`)
for(const [b,n] of histo(Rvals,1)) console.log(`  R ∈ [${b.toFixed(1)}, ${(b+1).toFixed(1)}): ${n}`)
console.log(``)
console.log(`theta histogram (10° bins):`)
for(const [b,n] of histo(thetaVals,10)) console.log(`  θ ∈ [${b.toFixed(0)}, ${b+10}): ${n}`)
console.log(``)
console.log(`arcLen histogram (1m bins):`)
for(const [b,n] of histo(arcLenVals,1)) console.log(`  arcLen ∈ [${b.toFixed(1)}, ${(b+1).toFixed(1)}): ${n}`)
console.log(``)
console.log(`d_min/d_max ratio histogram (0.05 bins):`)
for(const [b,n] of histo(ratioVals,0.05)) console.log(`  ratio ∈ [${b.toFixed(2)}, ${(b+0.05).toFixed(2)}): ${n}`)
console.log(``)
console.log(`--- Worst offenders ---`)
console.log(`Smallest R (top 10):`)
for(const r of smallestR) console.log(`  R=${r.R} θ=${r.theta_deg}° regime=${r.regime} blockKey=${r.blockKey} Vc=(${r.cornerPt_x}, ${r.cornerPt_z}) A=${r.aChain}/${r.aSide} B=${r.bChain}/${r.bSide} d_A=${r.d_A} d_B=${r.d_B}`)
console.log(``)
console.log(`Largest d-asymmetry (|d_A − d_B|) (top 10):`)
for(const r of largestDiff) console.log(`  diff=${r.diff} d_A=${r.d_A} d_B=${r.d_B} regime=${r.regime} blockKey=${r.blockKey} Vc=(${r.cornerPt_x}, ${r.cornerPt_z}) A=${r.aChain}/${r.aSide} B=${r.bChain}/${r.bSide}`)
console.log(``)
console.log(`Largest ramp ratio (SYM-WITH-RAMP only, top 10):`)
for(const r of largestRamp) console.log(`  rampRatio=${r.rampRatio} arcLen=${r.arcLen} R=${r.R} θ=${r.theta_deg}° blockKey=${r.blockKey} Vc=(${r.cornerPt_x}, ${r.cornerPt_z})`)
console.log(``)
console.log(`Doctrine-drop: authored tl>0+sw>0 both sides BUT no tl emitted (top 15):`)
for(const r of zeroEmitButAuthored) console.log(`  regime=${r.regime} R=${r.R} θ=${r.theta_deg}° d_A=${r.d_A} d_B=${r.d_B} diff=${r.diff} tlRings=${r.tlRings} swRings=${r.swRings} Vc=(${r.cornerPt_x}, ${r.cornerPt_z}) A=${r.aChain}/${r.aSide} B=${r.bChain}/${r.bSide}`)
console.log(``)
console.log(`NEITHER-EMITTED corners (no fb pushed, both sides skip): ${neitherList.length}`)
for(const r of neitherList.slice(0,10)) console.log(`  R=${r.R} θ=${r.theta_deg}° blockKey=${r.blockKey} Vc=(${r.cornerPt_x}, ${r.cornerPt_z})`)
console.log(``)
console.log(`CSV written: scratch/corner-regime-audit.csv (${rows.length} rows)`)
