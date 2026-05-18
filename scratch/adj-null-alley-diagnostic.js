// Stage 10.5 — adj=null alley-hypothesis diagnostic.
// For every adj=null flank surfaced in Stage 10's wrong_flanking /
// flanking_skip corners, walk the same outward probe path
// findAdjacentChainForBlockEdge uses and check for any
// non-ribbon OSM highway feature (service, footway, alley, path,
// steps, cycleway, pedestrian, etc.) within 15m of any probe step.
//
// Classifies each adj=null flank as:
//   alley_present       — non-named-street OSM highway feature within 15m
//   truly_void          — no highway feature within 15m of any probe step
//   something_unexpected — a NAMED street that IS in ribbons.streets is
//                         within 15m but probe missed it (real probe bug)
//
// Diagnostic only. No production-code edits.
//
// Source for raw OSM features: cartograph/data/lafayette-square/raw/osm.json
// (chosen because (a) it carries `ground.highway` with the full OSM tag set
// including unnamed footways/services/alleys, (b) coords are already in
// LS-projection x/z (verified: same coords as ribbons.streets vertices),
// (c) the alternative `clean/map.json` carries only the post-classify
// derivative geometry, not raw highway features).

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENE = 'lafayette-square'

const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design  = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', SCENE, 'design.json'), 'utf-8'))
const sten    = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', SCENE, 'neighborhood_boundary.json'), 'utf-8'))
const osm     = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', SCENE, 'raw', 'osm.json'), 'utf-8'))

const center = sten.center, radius = sten.radius
const streetFade = sten.streetFade || null
const targetR = streetFade ? streetFade.outer + 50 : radius
const stenScale = radius > 0 ? targetR / radius : 1
const stencil = sten.boundary.map(([x, z]) => [
  center[0] + (x - center[0]) * stenScale,
  center[1] + (z - center[1]) * stenScale,
])

const cornerRadiusScale = design.cornerRadiusScale ?? 1
const blockCustoms      = design.blockCustoms || null
const curbWidth         = design.curbWidth ?? 0.45

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale,
  cornerRadiusOverrides:       design.cornerRadiusOverrides       || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms,
  blockLandUse: design.blockLandUse || null,
  curbWidth,
})

const streets = ribbons.streets
const TOL_MATCH = 0.5
const RAD = Math.PI / 180
const BEZIER_N = 16
const PROBE_MAX = 30        // same as findAdjacentChainForBlockEdge
const PROBE_STEP = 2        // same as findAdjacentChainForBlockEdge
const ALLEY_HIT_DIST = 15   // brief: "within, say, 15m"

// ---- helpers (duplicated from Stage 10 audit) ----------------------
function unit(v) { const l = Math.hypot(v[0], v[1]); return l > 1e-9 ? [v[0]/l, v[1]/l] : [1, 0] }
function blockKeyFromRing(ring) {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
  for (const p of ring){if(p[0]<minX)minX=p[0];if(p[0]>maxX)maxX=p[0];if(p[1]<minY)minY=p[1];if(p[1]>maxY)maxY=p[1]}
  const cx=Math.round(((minX+maxX)/2)*2)/2, cy=Math.round(((minY+maxY)/2)*2)/2
  return `${cx.toFixed(1)},${cy.toFixed(1)}`
}
function ringSignedArea2D(r){let a=0;for(let i=0,n=r.length;i<n;i++){const [x1,y1]=r[i],[x2,y2]=r[(i+1)%n];a+=(x1*y2-x2*y1)}return a/2}
function computePerps(pts){const n=pts.length;const perps=new Array(n);for(let i=0;i<n;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(n-1,i+1)];const tx=b[0]-a[0],tz=b[1]-a[1];const L=Math.hypot(tx,tz);perps[i]=L>1e-9?[-tz/L,tx/L]:[0,1]}return perps}
function defaultR(theta,d_min){if(theta<5*RAD||theta>175*RAD)return 0;if(d_min<=1e-6)return 0;const sin=Math.sin(theta/2),denom=1-sin;if(denom<1e-6)return Math.min(4.5,d_min);return Math.max(0,Math.min(4.5,d_min*(1-0.5*sin)/denom))}
function cubicBezierEval(p0,p1,p2,p3,t){const u=1-t,uu=u*u,tt=t*t,uuu=uu*u,ttt=tt*t;return [uuu*p0[0]+3*uu*t*p1[0]+3*u*tt*p2[0]+ttt*p3[0],uuu*p0[1]+3*uu*t*p1[1]+3*u*tt*p2[1]+ttt*p3[1]]}
function bezierReplaceCorner(cur,R,theta,tA_dir,tB_dir){if(R<=0)return[cur];const halfTheta=theta/2,tanH=Math.tan(halfTheta);if(tanH<=1e-6)return[cur];const inset=R/tanH;const handleLen=(4/3)*R*Math.tan((Math.PI-theta)/4);const tA=[cur[0]+inset*tA_dir[0],cur[1]+inset*tA_dir[1]];const tB=[cur[0]+inset*tB_dir[0],cur[1]+inset*tB_dir[1]];const P1=[tA[0]-handleLen*tA_dir[0],tA[1]-handleLen*tA_dir[1]];const P2=[tB[0]-handleLen*tB_dir[0],tB[1]-handleLen*tB_dir[1]];const out=[tA];for(let k=1;k<BEZIER_N;k++){const t=k/BEZIER_N;out.push(cubicBezierEval(tA,P1,P2,tB,t))}out.push(tB);return out}

// findAdjacentChainForBlockEdge — full-scan port (must match Stage 10).
function findAdjacentChainForBlockEdge(edgePoints, ringCcw) {
  const N = edgePoints.length
  if (N < 2) return null
  const mid = Math.floor(N / 2)
  const a = edgePoints[Math.max(0, mid-1)], b = edgePoints[Math.min(N-1, mid)]
  const tx=b[0]-a[0], tz=b[1]-a[1]
  const tL=Math.hypot(tx,tz); if (tL<1e-6) return null
  const sign = ringCcw ? +1 : -1
  const nx = sign*tz/tL, nz = sign*(-tx)/tL
  const mx = (a[0]+b[0])*0.5, mz = (a[1]+b[1])*0.5
  let bestDist=Infinity, bestChainIdx=-1
  for (let probe=1; probe<=PROBE_MAX; probe+=PROBE_STEP) {
    const px=mx+nx*probe, pz=mz+nz*probe
    for (let chainIdx=0; chainIdx<streets.length; chainIdx++) {
      const s=streets[chainIdx]
      if (!s||s.disabled||!s.points||s.points.length<2||!s.measure) continue
      const cps=s.points
      for (let i=0;i<cps.length-1;i++){
        const ca=cps[i], cb=cps[i+1]
        const cdx=cb[0]-ca[0], cdz=cb[1]-ca[1]
        const cL2=cdx*cdx+cdz*cdz; if (cL2<1e-9) continue
        const t=Math.max(0,Math.min(1,((px-ca[0])*cdx+(pz-ca[1])*cdz)/cL2))
        const qx=ca[0]+t*cdx, qz=ca[1]+t*cdz
        const dist=Math.hypot(px-qx,pz-qz)
        if (dist<bestDist){bestDist=dist;bestChainIdx=chainIdx}
      }
    }
    if (bestDist<3) break
  }
  return (bestChainIdx<0 || bestDist>PROBE_MAX) ? null : { chainIdx: bestChainIdx, dist: bestDist }
}

// EXPOSED variant: returns probe walk path + null reason for analysis.
function probeWithTrace(edgePoints, ringCcw) {
  const N = edgePoints.length
  if (N<2) return { adj: null, reason: 'degenerate', probePts: [], mid: null, normal: null }
  const mid = Math.floor(N/2)
  const a = edgePoints[Math.max(0,mid-1)], b = edgePoints[Math.min(N-1,mid)]
  const tx=b[0]-a[0], tz=b[1]-a[1]
  const tL=Math.hypot(tx,tz)
  if (tL<1e-6) return { adj: null, reason: 'zero-tangent', probePts: [], mid: null, normal: null }
  const sign = ringCcw ? +1 : -1
  const nx = sign*tz/tL, nz = sign*(-tx)/tL
  const mx = (a[0]+b[0])*0.5, mz = (a[1]+b[1])*0.5
  const probePts = []
  let bestDist=Infinity, bestChainIdx=-1
  for (let probe=1; probe<=PROBE_MAX; probe+=PROBE_STEP) {
    const px=mx+nx*probe, pz=mz+nz*probe
    probePts.push([px,pz])
    for (let chainIdx=0; chainIdx<streets.length; chainIdx++) {
      const s=streets[chainIdx]
      if (!s||s.disabled||!s.points||s.points.length<2||!s.measure) continue
      const cps=s.points
      for (let i=0;i<cps.length-1;i++){
        const ca=cps[i], cb=cps[i+1]
        const cdx=cb[0]-ca[0], cdz=cb[1]-ca[1]
        const cL2=cdx*cdx+cdz*cdz; if (cL2<1e-9) continue
        const t=Math.max(0,Math.min(1,((px-ca[0])*cdx+(pz-ca[1])*cdz)/cL2))
        const qx=ca[0]+t*cdx, qz=ca[1]+t*cdz
        const dist=Math.hypot(px-qx,pz-qz)
        if (dist<bestDist){bestDist=dist;bestChainIdx=chainIdx}
      }
    }
    if (bestDist<3) break
  }
  const adj = (bestChainIdx<0 || bestDist>PROBE_MAX) ? null : { chainIdx: bestChainIdx, dist: bestDist }
  return { adj, reason: adj ? 'ok' : (bestChainIdx<0 ? 'no-segment-found' : `bestDist=${bestDist.toFixed(1)}>${PROBE_MAX}`), probePts, mid:[mx,mz], normal:[nx,nz] }
}

// ---- applyRoundCornersToRing (instrumented copy from Stage 10) -----
function applyRoundCornersToRingI(ring, corners, scale=1) {
  const TOL = TOL_MATCH
  const n = ring.length
  if (n===0) return { ring:[], arcMeta:[], spans:[] }
  const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
  const matched = new Array(n).fill(null)
  for (let i=0;i<n;i++){
    const cur = ring[i]
    let best = Infinity, bestC = null
    for (const c of corners) {
      const d = Math.hypot(cur[0]-c.point[0], cur[1]-c.point[1])
      if (d<best){best=d;bestC=c}
    }
    if (best<TOL) matched[i] = bestC
  }
  const spans = []
  const consumed = new Array(n).fill(-1)
  for (let i=0;i<n;i++){
    const m = matched[i]; if (!m) continue
    const prev = ring[(i-1+n)%n], cur = ring[i], next = ring[(i+1)%n]
    const inDir = unit([cur[0]-prev[0],cur[1]-prev[1]])
    const outDir = unit([next[0]-cur[0],next[1]-cur[1]])
    const cross = inDir[0]*outDir[1]-inDir[1]*outDir[0]
    if (cross*ringSign<=0) continue
    const baseR = Number.isFinite(m.R_authored)?m.R_authored:defaultR(m.theta,m.d_min)
    const R = baseR*scale
    if (R<=0.05) continue
    const halfTheta=m.theta/2, tanH=Math.tan(halfTheta)
    if (tanH<=1e-6) continue
    const inset=R/tanH
    let start=i, walkedBack=0
    while (true){const prevIdx=(start-1+n)%n;if(prevIdx===i)break;if(matched[prevIdx])break;const d=Math.hypot(ring[start][0]-ring[prevIdx][0],ring[start][1]-ring[prevIdx][1]);if(walkedBack+d>inset)break;walkedBack+=d;start=prevIdx}
    let end=i, walkedFwd=0
    while (true){const nextIdx=(end+1)%n;if(nextIdx===i)break;if(matched[nextIdx])break;const d=Math.hypot(ring[end][0]-ring[nextIdx][0],ring[end][1]-ring[nextIdx][1]);if(walkedFwd+d>inset)break;walkedFwd+=d;end=nextIdx}
    const spanIdx = spans.length
    spans.push({start,end,cornerIdx:i,corner:m,R,inset})
    let k=start
    while (true){consumed[k]=spanIdx;if(k===end)break;k=(k+1)%n}
  }
  if (spans.length===0) return { ring:ring.slice(), arcMeta:new Array(n).fill(null), spans }
  let i0=0
  while (i0<n && consumed[i0]!==-1) i0++
  if (i0>=n) i0=0
  const out=[], outMeta=[], emitted=new Set()
  for (let k=0;k<n;k++){
    const i=(i0+k)%n
    const sIdx=consumed[i]
    if (sIdx===-1){out.push(ring[i]);outMeta.push(null);continue}
    if (emitted.has(sIdx)) continue
    emitted.add(sIdx)
    const span=spans[sIdx]
    const cornerVertex=ring[span.cornerIdx]
    let arc=bezierReplaceCorner(cornerVertex,span.R,span.corner.theta,span.corner.T_A,span.corner.T_B)
    const N1=arc.length
    let arcMetaForSpan=new Array(N1)
    for (let m=0;m<N1;m++) arcMetaForSpan[m]={corner:span.corner,R:span.R}
    arc=arc.slice().reverse(); arcMetaForSpan.reverse()
    for (let m=0;m<arc.length;m++){out.push(arc[m]);outMeta.push(arcMetaForSpan[m])}
  }
  return { ring:out, arcMeta:outMeta, spans }
}

// ---- OSM feature setup ---------------------------------------------
// Named-street set = unique names in ribbons.streets (these are the
// features findAdjacentChainForBlockEdge knows about). Any OSM highway
// feature whose name is in this set is "in ribbons" — finding one of
// THOSE near an adj=null probe indicates a real probe bug. Anything
// else is the alley hypothesis.
const ribbonNames = new Set()
for (const s of streets) { if (s?.name) ribbonNames.add(s.name) }

const osmWays = osm.ground.highway.map(w => ({
  highway: w.tags?.highway || 'unknown',
  name: w.tags?.name || null,
  service: w.tags?.service || null,
  coords: (w.coords || []).map(c => [c.x, c.z]),
}))
// Split: in-ribbons (named match) vs absent (alleys + unnamed + named-but-absent)
const osmInRibbons   = osmWays.filter(w => w.name && ribbonNames.has(w.name))
const osmAbsent      = osmWays.filter(w => !w.name || !ribbonNames.has(w.name))
console.log(`OSM ways total: ${osmWays.length}`)
console.log(`  in ribbons (name match): ${osmInRibbons.length}`)
console.log(`  absent from ribbons:     ${osmAbsent.length}`)

// Distance from point to polyline (returns nearest distance + segment).
function distPointToPolyline(px, pz, coords) {
  let best=Infinity
  for (let i=0;i<coords.length-1;i++){
    const ca=coords[i], cb=coords[i+1]
    const cdx=cb[0]-ca[0], cdz=cb[1]-ca[1]
    const cL2=cdx*cdx+cdz*cdz
    if (cL2<1e-9) continue
    const t=Math.max(0,Math.min(1,((px-ca[0])*cdx+(pz-ca[1])*cdz)/cL2))
    const qx=ca[0]+t*cdx, qz=ca[1]+t*cdz
    const d=Math.hypot(px-qx,pz-qz)
    if (d<best) best=d
  }
  return best
}

// Bbox prefilter for speed: build per-way bboxes.
const osmAbsentBboxes = osmAbsent.map(w => {
  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity
  for (const c of w.coords){if(c[0]<mnx)mnx=c[0];if(c[0]>mxx)mxx=c[0];if(c[1]<mny)mny=c[1];if(c[1]>mxy)mxy=c[1]}
  return [mnx-ALLEY_HIT_DIST, mxx+ALLEY_HIT_DIST, mny-ALLEY_HIT_DIST, mxy+ALLEY_HIT_DIST]
})
const osmInRibbonsBboxes = osmInRibbons.map(w => {
  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity
  for (const c of w.coords){if(c[0]<mnx)mnx=c[0];if(c[0]>mxx)mxx=c[0];if(c[1]<mny)mny=c[1];if(c[1]>mxy)mxy=c[1]}
  return [mnx-ALLEY_HIT_DIST, mxx+ALLEY_HIT_DIST, mny-ALLEY_HIT_DIST, mxy+ALLEY_HIT_DIST]
})

// For each probe-point sweep, return best hit from either bucket.
function searchAlongProbe(probePts, bucket, bboxes) {
  let best={dist:Infinity, wayIdx:-1, probeIdx:-1}
  for (let pi=0; pi<probePts.length; pi++){
    const [px,pz] = probePts[pi]
    for (let wi=0; wi<bucket.length; wi++){
      const bb = bboxes[wi]
      if (px<bb[0]||px>bb[1]||pz<bb[2]||pz>bb[3]) continue
      const d = distPointToPolyline(px, pz, bucket[wi].coords)
      if (d < best.dist) best = {dist:d, wayIdx:wi, probeIdx:pi}
    }
  }
  return best
}

// ---- iterate corners + flanking spans, find adj=null sites ----------
const sharpRings = v2.blockSharp || []
const allCorners = v2.corners || []

function partitionRing(rRing, arcMeta) {
  const N = rRing.length
  if (!N) return []
  const spans = []
  let curSpan = { type: arcMeta[0]?.corner ? 'arc' : 'straight', idxs:[0], corner: arcMeta[0]?.corner||null }
  for (let i=1;i<N;i++){const c=arcMeta[i]?.corner||null;if(c===curSpan.corner)curSpan.idxs.push(i);else{spans.push(curSpan);curSpan={type:c?'arc':'straight',idxs:[i],corner:c}}}
  spans.push(curSpan)
  if (spans.length>1 && spans[0].corner===spans[spans.length-1].corner){const last=spans.pop();spans[0].idxs=[...last.idxs,...spans[0].idxs]}
  return spans
}

// Re-derive flanking metas, recording adj=null events for analysis.
const sharpFeByKey = new Map()
for (const fe of v2.frontageEdges || []) {
  if (fe.chainIdx == null) continue
  sharpFeByKey.set(`${fe.blockKey}|${fe.chainIdx}|${fe.side}`, fe)
}
function resolveStraightMetaWithTrace(pts, ringCcw, blockKey) {
  const trace = probeWithTrace(pts, ringCcw)
  if (!trace.adj) return { skip: true, terminal: null, trace }
  const adj = trace.adj
  const sharpFe = sharpFeByKey.get(`${blockKey}|${adj.chainIdx}|${(pts && computeSide(pts, ringCcw, adj))}`)
  // For our purposes (classifying adj=null), we don't need full term/tl/sw — the
  // ones that resolve are non-issue. Return enough to know it succeeded.
  return { skip: false, terminal: 'sidewalk', trace, adjChainIdx: adj.chainIdx }
}
// side computation matches src 1304-1313
function computeSide(pts, ringCcw, adj){
  const mid = Math.floor(pts.length/2)
  const a = pts[Math.max(0,mid-1)], b = pts[Math.min(pts.length-1, mid)]
  // Use the chain segment that's nearest the probe — for now we don't need it
  // since we only branch on skip vs not-skip.
  return null
}

const adjNullRows = []
let totalFlanksExamined = 0

for (const corner of allCorners) {
  // Find the block ring this corner is on (nearest-vertex match within TOL).
  let blockIdx=-1, bestD=Infinity
  for (let bi=0; bi<sharpRings.length; bi++){
    const ring = sharpRings[bi]
    for (let i=0;i<ring.length;i++){
      const d = Math.hypot(ring[i][0]-corner.point[0], ring[i][1]-corner.point[1])
      if (d<bestD){bestD=d;blockIdx=bi}
    }
  }
  if (blockIdx<0 || bestD>=TOL_MATCH) continue

  const sharpRing = sharpRings[blockIdx]
  const blk = applyRoundCornersToRingI(sharpRing, allCorners, cornerRadiusScale)
  const rRing = blk.ring, arcMeta = blk.arcMeta
  const ringCcw = ringSignedArea2D(rRing) >= 0
  const blockKey = blockKeyFromRing(rRing)
  const spans = partitionRing(rRing, arcMeta)
  const arcIdx = spans.findIndex(sp => sp.type==='arc' && sp.corner===corner)
  if (arcIdx<0) continue

  const prev = spans[(arcIdx-1+spans.length)%spans.length]
  const next = spans[(arcIdx+1)%spans.length]
  for (const [side, span] of [['prev', prev], ['next', next]]) {
    totalFlanksExamined++

    // Stage 10's resolveStraightMeta + production buildFrontageBandsV2 emit
    // {skip:true} for ANY non-straight or short flank — these show up as
    // adj=null in Stage 10's CSV but are NOT probe failures. Classify
    // separately so the alley/void/unexpected split is measured only over
    // spans that WERE actually probed.
    if (span.type !== 'straight') {
      const ixKey = corner.V ? `${corner.V[0].toFixed(2)},${corner.V[1].toFixed(2)}` : 'null'
      adjNullRows.push({
        ix_key: ixKey,
        V_x: corner.V?.[0]?.toFixed(2) ?? '',
        V_y: corner.V?.[1]?.toFixed(2) ?? '',
        blockKey, side,
        span_vertex_count: span.idxs.length,
        probe_mid_x: '', probe_mid_y: '',
        probe_normal_x: '', probe_normal_y: '',
        probe_path_len_m: '0', probe_steps: 0,
        probe_null_reason: 'flank-is-arc (adjacent corner, no straight between)',
        alley_class: 'adjacent_arc_span',
        feature_highway: '', feature_name: '', feature_distance: '', feature_source: '',
      })
      continue
    }
    const pts = span.idxs.map(i => rRing[i])
    if (pts.length < 2) {
      const ixKey = corner.V ? `${corner.V[0].toFixed(2)},${corner.V[1].toFixed(2)}` : 'null'
      adjNullRows.push({
        ix_key: ixKey,
        V_x: corner.V?.[0]?.toFixed(2) ?? '',
        V_y: corner.V?.[1]?.toFixed(2) ?? '',
        blockKey, side,
        span_vertex_count: pts.length,
        probe_mid_x: '', probe_mid_y: '',
        probe_normal_x: '', probe_normal_y: '',
        probe_path_len_m: '0', probe_steps: 0,
        probe_null_reason: 'span-length<2 (never probed)',
        alley_class: 'degenerate_span',
        feature_highway: '', feature_name: '', feature_distance: '', feature_source: '',
      })
      continue
    }
    const trace = probeWithTrace(pts, ringCcw)
    if (trace.adj) continue // resolved fine, not adj=null

    // adj=null — classify via OSM lookup
    const probePts = trace.probePts
    const hitAbsent = searchAlongProbe(probePts, osmAbsent, osmAbsentBboxes)
    const hitRibbon = searchAlongProbe(probePts, osmInRibbons, osmInRibbonsBboxes)

    let cls = 'truly_void', fType='', fName='', fDist=null, fSrc=''
    // Priority: if a NAMED-ribbon street is within 15m, that's "something_unexpected" (probe missed it).
    if (hitRibbon.dist <= ALLEY_HIT_DIST) {
      cls = 'something_unexpected'
      const w = osmInRibbons[hitRibbon.wayIdx]
      fType = w.highway; fName = w.name; fDist = hitRibbon.dist; fSrc='inRibbons'
    } else if (hitAbsent.dist <= ALLEY_HIT_DIST) {
      cls = 'alley_present'
      const w = osmAbsent[hitAbsent.wayIdx]
      fType = w.highway; fName = w.name||''; fDist = hitAbsent.dist; fSrc='absent'
      // refine subclass
      if (w.service === 'alley' || /alley/i.test(w.name||'')) fType = `${w.highway}:alley`
    } else {
      cls = 'truly_void'
      fDist = Math.min(hitRibbon.dist, hitAbsent.dist)
    }

    const ixKey = corner.V ? `${corner.V[0].toFixed(2)},${corner.V[1].toFixed(2)}` : 'null'
    const arcMid = pts[Math.floor(pts.length/2)]
    adjNullRows.push({
      ix_key: ixKey,
      V_x: corner.V?.[0]?.toFixed(2) ?? '',
      V_y: corner.V?.[1]?.toFixed(2) ?? '',
      blockKey,
      side,                                              // prev or next flank
      span_vertex_count: pts.length,
      probe_mid_x: trace.mid?.[0]?.toFixed(2) ?? '',
      probe_mid_y: trace.mid?.[1]?.toFixed(2) ?? '',
      probe_normal_x: trace.normal?.[0]?.toFixed(3) ?? '',
      probe_normal_y: trace.normal?.[1]?.toFixed(3) ?? '',
      probe_path_len_m: probePts.length>0 ? (probePts[probePts.length-1] && Math.hypot(probePts[probePts.length-1][0]-trace.mid[0], probePts[probePts.length-1][1]-trace.mid[1])).toFixed(2) : '0',
      probe_steps: probePts.length,
      probe_null_reason: trace.reason,
      alley_class: cls,
      feature_highway: fType,
      feature_name: fName,
      feature_distance: fDist!=null ? fDist.toFixed(2) : '',
      feature_source: fSrc,
    })
  }
}

// ---- emit CSV ------------------------------------------------------
adjNullRows.sort((a,b) => {
  if (a.ix_key !== b.ix_key) return a.ix_key < b.ix_key ? -1 : 1
  if (a.blockKey !== b.blockKey) return a.blockKey < b.blockKey ? -1 : 1
  return a.side < b.side ? -1 : 1
})
const cols = Object.keys(adjNullRows[0] || {ix_key:''})
const csv = [cols.join(',')]
for (const r of adjNullRows) {
  csv.push(cols.map(c => {
    const v=r[c]; const s=String(v??'')
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
  }).join(','))
}
writeFileSync(join(ROOT, 'scratch', 'adj-null-alley-diagnostic.csv'), csv.join('\n')+'\n')

// ---- classification summary ----------------------------------------
const classCounts = {}
for (const r of adjNullRows) classCounts[r.alley_class] = (classCounts[r.alley_class]||0)+1

const featTypeCounts = {}
for (const r of adjNullRows) {
  if (r.alley_class !== 'alley_present') continue
  featTypeCounts[r.feature_highway] = (featTypeCounts[r.feature_highway]||0)+1
}

// Specifically called out by brief: Mississippi × Park NE flank.
const missParkRows = adjNullRows.filter(r => r.ix_key === '229.00,-158.90')

console.log(`\n=== STAGE 10.5 — adj=null alley diagnostic ===`)
console.log(`Total flanks examined: ${totalFlanksExamined}`)
console.log(`adj=null flank count:  ${adjNullRows.length}`)
console.log(``)
console.log(`Classification:`)
for (const [k,v] of Object.entries(classCounts).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${k.padEnd(22)} ${v}  (${(100*v/adjNullRows.length).toFixed(1)}%)`)
}
console.log(``)
console.log(`alley_present highway-type breakdown:`)
for (const [k,v] of Object.entries(featTypeCounts).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${k.padEnd(22)} ${v}`)
}
console.log(``)
console.log(`Mississippi × Park (V=229,-158.9): ${missParkRows.length} adj=null flanks`)
for (const r of missParkRows) {
  console.log(`  block=${r.blockKey} side=${r.side} → ${r.alley_class}  feature=${r.feature_highway}${r.feature_name?'('+r.feature_name+')':''} dist=${r.feature_distance}m`)
}
console.log(``)
console.log(`Wrote: scratch/adj-null-alley-diagnostic.csv (${adjNullRows.length} rows)`)
