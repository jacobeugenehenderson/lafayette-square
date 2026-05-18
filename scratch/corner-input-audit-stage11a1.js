// Stage 10 — Corner-input-preparation audit.
// For every (IX_V, blockKey, corner-in-block) tuple, dump the
// input-preparation state the Stage 9 single-polygon emitter saw:
// vertex-to-corner match, Bezier consume-span, flanking-meta resolution,
// cusp-guard activation, RAMP_MIN floor, and the resulting pad.
//
// Classifies each row into one failure-mode bucket (no_match,
// flanking_skip, cusp_ramp_collision, selfint, wrong_flanking, ok, other).
// Outputs:
//   - scratch/corner-input-audit-stage11a1.csv          (one row per corner)
//   - scratch/corner-input-audit-stage11a1-mississippi-park.json (deep dump)
//   - scratch/corner-input-audit-report.md    (TL;DR + anomalies)
//
// Diagnostic only. No production-code edits, no threshold tuning.
//
// Duplicated production helpers (kept in sync by reading src/lib/
// buildBlockGeometryV2.js line-by-line; line ranges noted inline):
//   - findAdjacentChainForBlockEdge: src 1228-1314 (full-scan port).
//   - applyRoundCornersToRing:       src 677-836 (instrumented copy).
//   - blockKeyFromRing:              src 65-72.
//   - ringSignedArea2D:              src 1715-1720.
//   - computePerps:                  src 95-... (rewritten minimally).
//   - depthForSide / tlOf / swOf:    src 204-... .
//   - bezierReplaceCorner / cubicBezierEval: src 614-643 / 576-585.
//   - defaultR (R class rule):       src 214-...
//   - findFrontageBands span-partition: src 1480-1493 (re-derived).
//
// If any of those drift in production, this audit will diverge silently.

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENE = 'lafayette-square'

// ---- inputs --------------------------------------------------------
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design  = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', SCENE, 'design.json'), 'utf-8'))
const sten    = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', SCENE, 'neighborhood_boundary.json'), 'utf-8'))

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
const RAMP_MIN_M = 1.5

// ---- helpers (duplicated from production) -----------------------------

function unit(v) { const l = Math.hypot(v[0], v[1]); return l > 1e-9 ? [v[0]/l, v[1]/l] : [1, 0] }
function blockKeyFromRing(ring) {
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity
  for (const p of ring) {
    if (p[0]<minX)minX=p[0]; if (p[0]>maxX)maxX=p[0]
    if (p[1]<minY)minY=p[1]; if (p[1]>maxY)maxY=p[1]
  }
  const cx = Math.round(((minX+maxX)/2)*2)/2
  const cy = Math.round(((minY+maxY)/2)*2)/2
  return `${cx.toFixed(1)},${cy.toFixed(1)}`
}
function ringSignedArea2D(r) {
  let a=0; for (let i=0,n=r.length;i<n;i++){const [x1,y1]=r[i],[x2,y2]=r[(i+1)%n]; a+=(x1*y2-x2*y1)} return a/2
}
function computePerps(pts) {
  const n = pts.length
  const perps = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0,i-1)], b = pts[Math.min(n-1,i+1)]
    const tx = b[0]-a[0], tz = b[1]-a[1]
    const L = Math.hypot(tx,tz)
    perps[i] = L > 1e-9 ? [-tz/L, tx/L] : [0,1]
  }
  return perps
}
function depthForSide(s){if(s?.terminal!=='sidewalk')return 0;return (s?.treelawn||0)+(s?.sidewalk||0)}
function tlOf(s){return s?.terminal==='sidewalk'?(s?.treelawn||0):0}
function swOf(s){return s?.terminal==='sidewalk'?(s?.sidewalk||0):0}
function defaultR(theta, d_min){
  if (theta<5*RAD||theta>175*RAD)return 0
  if (d_min<=1e-6)return 0
  const sin=Math.sin(theta/2)
  const denom=1-sin
  if (denom<1e-6)return Math.min(4.5,d_min)
  return Math.max(0,Math.min(4.5, d_min*(1-0.5*sin)/denom))
}
function cubicBezierEval(p0,p1,p2,p3,t){
  const u=1-t; const uu=u*u, tt=t*t, uuu=uu*u, ttt=tt*t
  const b0=uuu,b1=3*uu*t,b2=3*u*tt,b3=ttt
  return [b0*p0[0]+b1*p1[0]+b2*p2[0]+b3*p3[0], b0*p0[1]+b1*p1[1]+b2*p2[1]+b3*p3[1]]
}
function bezierReplaceCorner(cur, R, theta, tA_dir, tB_dir){
  if (R<=0) return [cur]
  const halfTheta = theta/2
  const tanH = Math.tan(halfTheta)
  if (tanH<=1e-6) return [cur]
  const inset = R/tanH
  const handleLen = (4/3)*R*Math.tan((Math.PI-theta)/4)
  const tA=[cur[0]+inset*tA_dir[0], cur[1]+inset*tA_dir[1]]
  const tB=[cur[0]+inset*tB_dir[0], cur[1]+inset*tB_dir[1]]
  const P1=[tA[0]-handleLen*tA_dir[0], tA[1]-handleLen*tA_dir[1]]
  const P2=[tB[0]-handleLen*tB_dir[0], tB[1]-handleLen*tB_dir[1]]
  const out=[tA]
  for (let k=1; k<BEZIER_N; k++){const t=k/BEZIER_N; out.push(cubicBezierEval(tA,P1,P2,tB,t))}
  out.push(tB)
  return out
}

// findAdjacentChainForBlockEdge — full-scan port (src lines 1228-1314).
function findAdjacentChainForBlockEdge(edgePoints, ringCcw){
  const N = edgePoints.length
  if (N<2) return null
  const mid = Math.floor(N/2)
  const a = edgePoints[Math.max(0,mid-1)], b = edgePoints[Math.min(N-1,mid)]
  const tx=b[0]-a[0], tz=b[1]-a[1]
  const tL=Math.hypot(tx,tz); if(tL<1e-6)return null
  const sign = ringCcw ? +1 : -1
  const nx=sign*tz/tL, nz=sign*(-tx)/tL
  const mx=(a[0]+b[0])*0.5, mz=(a[1]+b[1])*0.5
  const PROBE_MAX = 30
  let bestDist=Infinity, bestChainIdx=-1, bestSegA=null, bestSegB=null
  for (let probe=1; probe<=PROBE_MAX; probe+=2) {
    const px=mx+nx*probe, pz=mz+nz*probe
    for (let chainIdx=0; chainIdx<streets.length; chainIdx++) {
      const s = streets[chainIdx]
      if (!s || s.disabled || !s.points || s.points.length<2 || !s.measure) continue
      const cps = s.points
      for (let i=0; i<cps.length-1; i++) {
        const ca=cps[i], cb=cps[i+1]
        const cdx=cb[0]-ca[0], cdz=cb[1]-ca[1]
        const cL2=cdx*cdx+cdz*cdz; if (cL2<1e-9) continue
        const t = Math.max(0, Math.min(1, ((px-ca[0])*cdx+(pz-ca[1])*cdz)/cL2))
        const qx=ca[0]+t*cdx, qz=ca[1]+t*cdz
        const dist=Math.hypot(px-qx,pz-qz)
        if (dist<bestDist){bestDist=dist; bestChainIdx=chainIdx; bestSegA=ca; bestSegB=cb}
      }
    }
    if (bestDist<3) break
  }
  if (bestChainIdx<0 || bestDist>PROBE_MAX) return null
  const cdx=bestSegB[0]-bestSegA[0], cdz=bestSegB[1]-bestSegA[1]
  const leftPx=-cdz, leftPz=cdx
  const projL = (mx-bestSegA[0])*leftPx + (mz-bestSegA[1])*leftPz
  const side = projL>0 ? 'right' : 'left'
  return {chainIdx: bestChainIdx, side, dist: bestDist}
}

// sharp-fe lookup mirroring buildFrontageBandsV2 (line 1462).
const sharpFeByKey = new Map()
for (const fe of v2.frontageEdges || []) {
  if (fe.chainIdx == null) continue
  sharpFeByKey.set(`${fe.blockKey}|${fe.chainIdx}|${fe.side}`, fe)
}
function resolveStraightMeta(pts, ringCcw, blockKey) {
  const adj = findAdjacentChainForBlockEdge(pts, ringCcw)
  if (!adj) return { skip: true, adj: null }
  const sharpFe = sharpFeByKey.get(`${blockKey}|${adj.chainIdx}|${adj.side}`)
  const street = streets[adj.chainIdx]
  const blockOverride = (sharpFe && blockCustoms?.[sharpFe.blockKey]?.[sharpFe.edgeOrd]) || null
  const eff = blockOverride || street?.measure?.[adj.side] || {}
  const terminal = eff.terminal || null
  const isSidewalk = terminal === 'sidewalk'
  const tl = isSidewalk ? (eff.treelawn||0) : 0
  const sw = isSidewalk ? (eff.sidewalk||0) : 0
  return {
    skip: false,
    authoredZero: !isSidewalk || (tl<=0 && sw<=0),
    chainIdx: adj.chainIdx, side: adj.side, edgeOrd: sharpFe?.edgeOrd,
    terminal, tl, sw,
    adj,
  }
}

// SELFINT detector (Stage 6 pattern).
function segIntersect(a,b,c,d){const x1=a[0],y1=a[1],x2=b[0],y2=b[1],x3=c[0],y3=c[1],x4=d[0],y4=d[1];const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-9)return false;const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den;const u=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/den;return t>1e-6&&t<1-1e-6&&u>1e-6&&u<1-1e-6}
function ringSelfInt(r){const n=r.length;for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(segIntersect(r[i],r[(i+1)%n],r[j],r[(j+1)%n]))return true}return false}
function ringArea(r){return Math.abs(ringSignedArea2D(r))}

// ---- applyRoundCornersToRing — INSTRUMENTED copy of src 677-836 ----
// Returns { ring, arcMeta, instr: { matched[], walkedBack[], walkedFwd[], spans[] } }
function applyRoundCornersToRingI(ring, corners, scale=1) {
  const TOL = TOL_MATCH
  const n = ring.length
  const instr = {
    perVertexMinDist: new Array(n).fill(Infinity), // min distance from each vertex to any corner.point
    matched: new Array(n).fill(null),
    spans: [],
    notConvexCount: 0,
    smallRCount: 0,
  }
  if (n === 0) return { ring: [], arcMeta: [], instr }
  const ringSign = ringSignedArea2D(ring) >= 0 ? +1 : -1
  for (let i = 0; i < n; i++) {
    const cur = ring[i]
    let best = Infinity, bestC = null
    for (const c of corners) {
      const d = Math.hypot(cur[0]-c.point[0], cur[1]-c.point[1])
      if (d < best) { best = d; bestC = c }
    }
    instr.perVertexMinDist[i] = best
    if (best < TOL) instr.matched[i] = bestC
  }
  const spans = []
  const consumed = new Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const m = instr.matched[i]; if (!m) continue
    const prev = ring[(i-1+n)%n], cur = ring[i], next = ring[(i+1)%n]
    const inDir = unit([cur[0]-prev[0], cur[1]-prev[1]])
    const outDir = unit([next[0]-cur[0], next[1]-cur[1]])
    const cross = inDir[0]*outDir[1] - inDir[1]*outDir[0]
    if (cross*ringSign <= 0) { instr.notConvexCount++; continue }
    const baseR = Number.isFinite(m.R_authored) ? m.R_authored : defaultR(m.theta, m.d_min)
    const R = baseR * scale
    if (R <= 0.05) { instr.smallRCount++; continue }
    const halfTheta = m.theta/2
    const tanH = Math.tan(halfTheta)
    if (tanH <= 1e-6) continue
    const inset = R/tanH
    let start=i, walkedBack=0
    while (true) {
      const prevIdx = (start-1+n)%n
      if (prevIdx===i) break
      if (instr.matched[prevIdx]) break
      const d = Math.hypot(ring[start][0]-ring[prevIdx][0], ring[start][1]-ring[prevIdx][1])
      if (walkedBack + d > inset) break
      walkedBack += d; start = prevIdx
    }
    let end=i, walkedFwd=0
    while (true) {
      const nextIdx = (end+1)%n
      if (nextIdx===i) break
      if (instr.matched[nextIdx]) break
      const d = Math.hypot(ring[end][0]-ring[nextIdx][0], ring[end][1]-ring[nextIdx][1])
      if (walkedFwd + d > inset) break
      walkedFwd += d; end = nextIdx
    }
    const spanIdx = spans.length
    const span = { start, end, cornerIdx: i, corner: m, R, inset, walkedBack, walkedFwd }
    spans.push(span)
    instr.spans.push(span)
    let k = start
    while (true) { consumed[k] = spanIdx; if (k===end) break; k = (k+1)%n }
  }
  if (spans.length === 0) {
    return { ring: ring.slice(), arcMeta: new Array(n).fill(null), instr }
  }
  let i0 = 0
  while (i0 < n && consumed[i0] !== -1) i0++
  if (i0 >= n) i0 = 0
  const out = [], outMeta = [], emittedSpan = new Set()
  for (let k = 0; k < n; k++) {
    const i = (i0+k)%n
    const sIdx = consumed[i]
    if (sIdx === -1) { out.push(ring[i]); outMeta.push(null); continue }
    if (emittedSpan.has(sIdx)) continue
    emittedSpan.add(sIdx)
    const span = spans[sIdx]
    const cornerVertex = ring[span.cornerIdx]
    let arc = bezierReplaceCorner(cornerVertex, span.R, span.corner.theta, span.corner.T_A, span.corner.T_B)
    const N1 = arc.length
    let arcMetaForSpan = new Array(N1)
    for (let m=0; m<N1; m++) arcMetaForSpan[m] = { corner: span.corner, R: span.R, arcPositionFrac: m/(N1-1) }
    arc = arc.slice().reverse(); arcMetaForSpan.reverse()
    for (let m=0; m<N1; m++) arcMetaForSpan[m] = { corner: arcMetaForSpan[m].corner, R: arcMetaForSpan[m].R, arcPositionFrac: 1 - arcMetaForSpan[m].arcPositionFrac }
    for (let m=0; m<arc.length; m++) { out.push(arc[m]); outMeta.push(arcMetaForSpan[m]) }
  }
  return { ring: out, arcMeta: outMeta, instr }
}

// ---- build per-block rounded rings with instrumentation ------------
const sharpRings = v2.blockSharp || []
const allCorners = v2.corners || []
const blockRounded = sharpRings.map(r => applyRoundCornersToRingI(r, allCorners, cornerRadiusScale))

// Index v2.frontageBands arc-entries by corner identity for quick lookup.
const fbByCorner = new Map()
for (const fb of v2.frontageBands || []) {
  if (fb?.corner) fbByCorner.set(fb.corner, fb)
}

// ---- chain-name attribution for corner legs ------------------------
// Re-derive (legA chain, legB chain) for each corner by finding the two
// chains whose vertices coincide with corner.V, then matching the
// corner's T_A/T_B directions to plausible leg tangents.
function legNamesForCorner(corner) {
  const V = corner.V
  if (!V) return { aName: '?', aSkel: '?', bName: '?', bSkel: '?', legCount: 0 }
  // Collect candidate legs at this IX: every chain vertex within 0.5m.
  const legs = []
  for (let chainIdx=0; chainIdx<streets.length; chainIdx++) {
    const s = streets[chainIdx]
    if (!s?.points) continue
    for (let i=0; i<s.points.length; i++) {
      if (Math.hypot(s.points[i][0]-V[0], s.points[i][1]-V[1]) < 0.5) {
        // build both directions if applicable
        if (i > 0) {
          const dx = s.points[i-1][0]-V[0], dz = s.points[i-1][1]-V[1]
          const L = Math.hypot(dx,dz)
          if (L>1e-6) legs.push({ name: s.name||`#${chainIdx}`, skel: s.skelId||s.name||`#${chainIdx}`, T:[dx/L, dz/L], chainIdx, dir:-1, ixIdx:i })
        }
        if (i < s.points.length-1) {
          const dx = s.points[i+1][0]-V[0], dz = s.points[i+1][1]-V[1]
          const L = Math.hypot(dx,dz)
          if (L>1e-6) legs.push({ name: s.name||`#${chainIdx}`, skel: s.skelId||s.name||`#${chainIdx}`, T:[dx/L, dz/L], chainIdx, dir:+1, ixIdx:i })
        }
      }
    }
  }
  // For T_A and T_B: corner.T_A and T_B are LOCAL-polyline tangents at Vc
  // (out from V along each leg). They should be close in DIRECTION to one
  // leg's at-V T each. Match by max dot product.
  const matchLeg = (T) => {
    let best=-Infinity, bestLeg=null
    for (const l of legs) {
      const dot = T[0]*l.T[0] + T[1]*l.T[1]
      if (dot > best) { best=dot; bestLeg=l }
    }
    return bestLeg
  }
  const lA = matchLeg(corner.T_A)
  const lB = matchLeg(corner.T_B)
  return {
    aName: lA?.name||'?', aSkel: lA?.skel||'?',
    bName: lB?.name||'?', bSkel: lB?.skel||'?',
    legCount: legs.length,
  }
}

// ---- per-corner row emission ---------------------------------------

function nearestVertex(ring, pt) {
  let best=Infinity, bestIdx=-1
  for (let i=0; i<ring.length; i++) {
    const d = Math.hypot(ring[i][0]-pt[0], ring[i][1]-pt[1])
    if (d<best) { best=d; bestIdx=i }
  }
  return { dist: best, idx: bestIdx }
}

// Partition rounded ring by arcMeta corner identity. Returns spans[].
function partitionRing(rRing, arcMeta) {
  const N = rRing.length
  if (!N) return []
  const spans = []
  let curSpan = { type: arcMeta[0]?.corner ? 'arc' : 'straight', idxs:[0], corner: arcMeta[0]?.corner||null }
  for (let i=1; i<N; i++) {
    const c = arcMeta[i]?.corner || null
    if (c === curSpan.corner) curSpan.idxs.push(i)
    else { spans.push(curSpan); curSpan = { type: c?'arc':'straight', idxs:[i], corner: c } }
  }
  spans.push(curSpan)
  if (spans.length>1 && spans[0].corner === spans[spans.length-1].corner) {
    const last = spans.pop()
    spans[0].idxs = [...last.idxs, ...spans[0].idxs]
  }
  return spans
}

// Compute the corner pad polygon emission for instrumentation.
function emitCornerPad(pts, dCorner, inwardSign) {
  const perps = computePerps(pts)
  const outer = pts
  const inner = pts.map((p,k) => [p[0]+perps[k][0]*inwardSign*dCorner, p[1]+perps[k][1]*inwardSign*dCorner])
  // closeBandRingV2 = outer fwd + inner rev
  const ring = [...outer, ...inner.slice().reverse()]
  return ring
}

// Find which block this corner sits on. A corner is "on" a block if its
// blockSharp ring has at least one vertex within TOL_MATCH (otherwise
// the rounded ring's arcMeta would have no matched span).
function findBlockForCorner(corner) {
  let bestI = -1, bestD = Infinity
  for (let bi=0; bi<sharpRings.length; bi++) {
    const ring = sharpRings[bi]
    const nv = nearestVertex(ring, corner.point)
    if (nv.dist < bestD) { bestD = nv.dist; bestI = bi }
  }
  return { blockIdx: bestI, vertexMatchDist: bestD }
}

// ---- iterate corners and emit rows ---------------------------------
const rows = []
for (const corner of allCorners) {
  const ix_key = corner.V ? `${corner.V[0].toFixed(2)},${corner.V[1].toFixed(2)}` : 'null'
  const legNames = legNamesForCorner(corner)
  const { blockIdx, vertexMatchDist } = findBlockForCorner(corner)

  const baseR = Number.isFinite(corner.R_authored) ? corner.R_authored : defaultR(corner.theta, corner.d_min)
  const R_used = baseR * cornerRadiusScale

  // Defaults for row
  let row = {
    ix_key,
    V_x: corner.V?.[0]?.toFixed(2) ?? '',
    V_y: corner.V?.[1]?.toFixed(2) ?? '',
    blockKey: '',
    corner_legA_skel: legNames.aSkel,
    corner_legB_skel: legNames.bSkel,
    theta_deg: (corner.theta*180/Math.PI).toFixed(2),
    R_authored: Number.isFinite(corner.R_authored) ? corner.R_authored.toFixed(3) : '',
    R_used: R_used.toFixed(3),
    d_A: corner.rightDepth_A?.toFixed(2) ?? '',
    d_B: corner.leftDepth_B?.toFixed(2) ?? '',
    vertex_match_dist: vertexMatchDist.toFixed(3),
    vertex_matched: vertexMatchDist < TOL_MATCH ? '1' : '0',
    bezier_consumed_span_len: '',
    arc_span_present: '0',
    prevMeta_skip: '', nextMeta_skip: '',
    prevMeta_terminal: '', nextMeta_terminal: '',
    prevMeta_tl: '', prevMeta_sw: '',
    nextMeta_tl: '', nextMeta_sw: '',
    prevMeta_edgeOrd: '', nextMeta_edgeOrd: '',
    walk_steps_B: '', walk_steps_A: '', walk_wraps_to_other_side: '0',
    cw_plus_tl_sw_A: '', cw_plus_tl_sw_B: '',
    arc_R: '',
    cusp_safeMax: '', cusp_totalMax: '', cusp_fired: '0', cusp_scale_k: '',
    dCorner: '', ramp_min_fired: '0',
    pad_area_m2: '', pad_selfintersects: '0', pad_ring_vertex_count: '',
    failure_mode: 'other',
    notes: '',
  }

  if (blockIdx < 0 || vertexMatchDist >= TOL_MATCH) {
    row.failure_mode = 'no_match'
    row.notes = `min vertex dist ${vertexMatchDist.toFixed(3)}m exceeds TOL=${TOL_MATCH}`
    rows.push(row)
    continue
  }

  const blk = blockRounded[blockIdx]
  const rRing = blk.ring
  const arcMeta = blk.arcMeta
  const blockKey = blockKeyFromRing(rRing)
  row.blockKey = blockKey
  const ringCcw = ringSignedArea2D(rRing) >= 0
  const inwardSign = ringCcw ? +1 : -1

  // Locate the consume-span for this corner (from instr).
  const matchedSpan = blk.instr.spans.find(s => s.corner === corner)
  if (matchedSpan) {
    row.bezier_consumed_span_len = (matchedSpan.walkedBack + matchedSpan.walkedFwd).toFixed(3)
  }

  // Partition the rounded ring; find arc-span owned by this corner.
  const spans = partitionRing(rRing, arcMeta)
  const arcIdx = spans.findIndex(sp => sp.type === 'arc' && sp.corner === corner)
  if (arcIdx < 0) {
    // No arc-span emitted — applyRoundCornersToRing didn't produce one.
    // Could be notConvex or smallR skip at the corner.
    row.failure_mode = 'no_match'
    row.notes = `no arc-span partition for corner; vertexMatchDist=${vertexMatchDist.toFixed(3)} (likely notConvex or R<=0.05)`
    rows.push(row)
    continue
  }
  const arcSpan = spans[arcIdx]

  // Stage 11a: build full spanMeta array (one entry per span around
  // the ring), then ring-walk for first authored straight in each dir.
  const spanMetaArr = spans.map(sp => {
    if (sp.type === 'arc') return { type: 'arc' }
    const sp_pts = sp.idxs.map(i => rRing[i])
    if (sp_pts.length < 2) return { type: 'straight', skip: true }
    const m = resolveStraightMeta(sp_pts, ringCcw, blockKey)
    return { type: 'straight', ...m }
  })
  function walkMeta(fromIdx, dir) {
    const N = spanMetaArr.length
    for (let step = 1; step < N; step++) {
      const idx = ((fromIdx + dir * step) % N + N) % N
      const m = spanMetaArr[idx]
      if (m?.type !== 'straight') continue
      if (m.skip) continue                  // partition artifact
      return { meta: m, steps: step }       // authored (incl. authoredZero)
    }
    return { meta: null, steps: -1 }
  }
  const Bres = walkMeta(arcIdx, -1)
  const Ares = walkMeta(arcIdx, +1)
  const Bmeta = Bres.meta
  const Ameta = Ares.meta
  // Snapshot immediate-adjacent metas for CSV columns (preserves the
  // prevMeta_*/nextMeta_* schema for diff against Stage 10's CSV).
  const prevMeta = spanMetaArr[(arcIdx-1+spans.length)%spans.length] || { skip:true }
  const nextMeta = spanMetaArr[(arcIdx+1)%spans.length] || { skip:true }

  row.prevMeta_skip = prevMeta.skip ? '1' : '0'
  row.nextMeta_skip = nextMeta.skip ? '1' : '0'
  row.prevMeta_terminal = prevMeta.terminal || ''
  row.nextMeta_terminal = nextMeta.terminal || ''
  row.prevMeta_tl = prevMeta.tl != null ? prevMeta.tl.toFixed(2) : ''
  row.prevMeta_sw = prevMeta.sw != null ? prevMeta.sw.toFixed(2) : ''
  row.nextMeta_tl = nextMeta.tl != null ? nextMeta.tl.toFixed(2) : ''
  row.nextMeta_sw = nextMeta.sw != null ? nextMeta.sw.toFixed(2) : ''
  row.prevMeta_edgeOrd = prevMeta.edgeOrd != null ? prevMeta.edgeOrd : ''
  row.nextMeta_edgeOrd = nextMeta.edgeOrd != null ? nextMeta.edgeOrd : ''
  // Stage 11a instrumentation
  row.walk_steps_B = Bres.steps >= 0 ? Bres.steps : ''
  row.walk_steps_A = Ares.steps >= 0 ? Ares.steps : ''
  row.walk_wraps_to_other_side = (Bres.meta && Ares.meta && Bres.meta === Ares.meta) ? '1' : '0'

  // arc_span_present in v2 output?
  const fb = fbByCorner.get(corner) || null
  row.arc_span_present = fb ? '1' : '0'

  // Stage 11a.1: bilateral-authoredZero (or both unresolved) short-circuit.
  const Bzero = !Bmeta || Bmeta.authoredZero
  const Azero = !Ameta || Ameta.authoredZero
  if (Bzero && Azero) {
    row.failure_mode = 'flanking_skip'
    row.notes = !Bmeta && !Ameta ? 'both flanks unresolved' : 'bilateral authoredZero (terminal=none or tl=sw=0)'
    rows.push(row)
    continue
  }

  // Initial flanking depths.
  let tl_B = Bmeta?.tl ?? Ameta?.tl ?? 0
  let sw_B = Bmeta?.sw ?? Ameta?.sw ?? 0
  let tl_A = Ameta?.tl ?? Bmeta?.tl ?? 0
  let sw_A = Ameta?.sw ?? Bmeta?.sw ?? 0
  const cw = curbWidth

  const arcR = arcMeta[arcSpan.idxs[0]]?.R ?? Infinity
  row.arc_R = Number.isFinite(arcR) ? arcR.toFixed(3) : ''

  const safeMax = Math.max(cw + 0.05, arcR * 0.9)
  const totalMax_pre = Math.max(cw + tl_A + sw_A, cw + tl_B + sw_B)
  row.cusp_safeMax = safeMax.toFixed(3)
  row.cusp_totalMax = totalMax_pre.toFixed(3)
  let cuspFired = false, cuspK = 1
  if (totalMax_pre > safeMax) {
    cuspK = (safeMax - cw) / Math.max(1e-9, totalMax_pre - cw)
    tl_A *= cuspK; sw_A *= cuspK; tl_B *= cuspK; sw_B *= cuspK
    cuspFired = true
  }
  row.cusp_fired = cuspFired ? '1' : '0'
  row.cusp_scale_k = cuspK.toFixed(3)

  const d_A_post = cw + tl_A + sw_A
  const d_B_post = cw + tl_B + sw_B
  row.cw_plus_tl_sw_A = d_A_post.toFixed(3)
  row.cw_plus_tl_sw_B = d_B_post.toFixed(3)

  const dCornerRaw = Math.max(d_A_post, d_B_post)
  const dCorner = Math.max(dCornerRaw, RAMP_MIN_M)
  const rampMinFired = dCornerRaw < RAMP_MIN_M
  row.dCorner = dCorner.toFixed(3)
  row.ramp_min_fired = rampMinFired ? '1' : '0'

  // Compute the actual pad ring (mirror Stage 9 emission).
  const ptsArc = arcSpan.idxs.map(i => rRing[i])
  const padRing = ptsArc.length >= 2 ? emitCornerPad(ptsArc, dCorner, inwardSign) : null
  const padArea = padRing ? ringArea(padRing) : 0
  const padSelfInt = padRing ? ringSelfInt(padRing) : false
  row.pad_area_m2 = padArea.toFixed(3)
  row.pad_selfintersects = padSelfInt ? '1' : '0'
  row.pad_ring_vertex_count = padRing ? String(padRing.length) : '0'

  // Classification — first match wins.
  // Stage 11a.1: wrong_flanking now means unilateral-authoredZero (one
  // flank authored sidewalk, the other authored terminal=none/zero).
  // The pad emits symmetric at the authored side's depth — visibly
  // defective; Stage 11b's asymmetric emission resolves.
  const Bunilateral = (Bmeta && Bmeta.authoredZero) || !Bmeta
  const Aunilateral = (Ameta && Ameta.authoredZero) || !Ameta
  if (cuspFired && rampMinFired) {
    row.failure_mode = 'cusp_ramp_collision'
  } else if (padSelfInt) {
    row.failure_mode = 'selfint'
  } else if (Bunilateral !== Aunilateral) {
    row.failure_mode = 'wrong_flanking'
    row.notes = (Bunilateral?'B zero/null':'A zero/null') + ' — unilateral authoredZero; symmetric pad mirrors authored side (defer Stage 11b)'
  } else {
    row.failure_mode = 'ok'
  }

  rows.push(row)
}

// ---- emit CSV ------------------------------------------------------
const cols = Object.keys(rows[0] || {})
rows.sort((a,b) => {
  if (a.ix_key !== b.ix_key) return a.ix_key < b.ix_key ? -1 : 1
  if (a.blockKey !== b.blockKey) return a.blockKey < b.blockKey ? -1 : 1
  return parseFloat(a.theta_deg||'0') - parseFloat(b.theta_deg||'0')
})
const csv = [cols.join(',')]
for (const r of rows) {
  csv.push(cols.map(c => {
    const v = r[c]; const s = String(v ?? '')
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
  }).join(','))
}
writeFileSync(join(ROOT, 'scratch', 'corner-input-audit-stage11a1.csv'), csv.join('\n') + '\n')

// ---- failure-mode histogram ----------------------------------------
const modeCounts = {}
for (const r of rows) modeCounts[r.failure_mode] = (modeCounts[r.failure_mode]||0) + 1

// per-IX corner count distribution
const perIx = new Map()
for (const r of rows) perIx.set(r.ix_key, (perIx.get(r.ix_key)||0)+1)
const perIxHist = {}
for (const [,n] of perIx) perIxHist[n] = (perIxHist[n]||0)+1

// vertex match distance distribution (near-TOL bucket: 0.5–1.0)
const matchDists = rows.map(r => parseFloat(r.vertex_match_dist)).filter(Number.isFinite)
let nearTol = 0
for (const d of matchDists) if (d >= 0.5 && d < 1.0) nearTol++
const overTol = matchDists.filter(d => d >= TOL_MATCH).length

const cuspFiredCount = rows.filter(r => r.cusp_fired==='1').length
const rampMinFiredCount = rows.filter(r => r.ramp_min_fired==='1').length

console.log(`=== STAGE 10 — Corner Input-Prep Audit ===`)
console.log(`Total corners audited: ${rows.length}`)
console.log(``)
console.log(`Failure-mode histogram:`)
const modeOrder = ['ok','no_match','flanking_skip','cusp_ramp_collision','selfint','wrong_flanking','other']
for (const k of modeOrder) {
  const n = modeCounts[k] || 0
  console.log(`  ${k.padEnd(24)} ${String(n).padStart(4)}  ${(100*n/rows.length).toFixed(1)}%`)
}
console.log(``)
console.log(`Vertex-match audit:`)
console.log(`  matched (dist < ${TOL_MATCH}):              ${matchDists.length - overTol}`)
console.log(`  unmatched (dist >= ${TOL_MATCH}):           ${overTol}`)
console.log(`  near-tol bucket (0.5m ≤ dist < 1.0m): ${nearTol}`)
console.log(``)
console.log(`Cusp guard fired:        ${cuspFiredCount}  (${(100*cuspFiredCount/rows.length).toFixed(1)}%)`)
console.log(`RAMP_MIN floor fired:    ${rampMinFiredCount}  (${(100*rampMinFiredCount/rows.length).toFixed(1)}%)`)
console.log(``)
console.log(`Per-IX corner count:`)
for (const [n,k] of Object.entries(perIxHist).sort((a,b)=>+a[0]-+b[0])) console.log(`  ${n} corners → ${k} IXs`)

// ---- Mississippi × Park deep-dump ----------------------------------

// Identify the IX programmatically. Scan corners for V near a vertex
// shared by a Mississippi-* and Park-* chain.
function chainNameMatches(name, sub) { return name && name.toLowerCase().includes(sub) }

const missIxs = new Map()  // V_key → { V, missLegs, parkLegs }
for (let chainIdx=0; chainIdx<streets.length; chainIdx++) {
  const s = streets[chainIdx]
  if (!s?.points) continue
  const isMiss = chainNameMatches(s.name, 'mississippi')
  const isPark = chainNameMatches(s.name, 'park') && !chainNameMatches(s.name, 'parkway') // exclude Truman Parkway
  if (!isMiss && !isPark) continue
  for (const p of s.points) {
    const key = `${p[0].toFixed(2)},${p[1].toFixed(2)}`
    let e = missIxs.get(key); if (!e) { e = { V:[p[0],p[1]], missLegs:0, parkLegs:0 }; missIxs.set(key, e) }
    if (isMiss) e.missLegs++
    if (isPark) e.parkLegs++
  }
}
const ixCandidates = [...missIxs.values()].filter(e => e.missLegs>0 && e.parkLegs>0)
// Sort by total leg count (descending) per brief.
ixCandidates.sort((a,b) => (b.missLegs+b.parkLegs) - (a.missLegs+a.parkLegs))
const targetIx = ixCandidates[0] || null

const deepDump = {
  ix_identification: {
    method: 'substring match: name includes "mississippi" or "park" (excluding "parkway")',
    candidate_count: ixCandidates.length,
    candidates: ixCandidates.map(c => ({ V: c.V, missLegs: c.missLegs, parkLegs: c.parkLegs })),
    chosen: targetIx,
  },
  corners: [],
  notes: [],
}

if (targetIx) {
  const V = targetIx.V
  // Find all corner records at this IX (V matches within 0.5m).
  const cornersHere = allCorners.filter(c => c.V && Math.hypot(c.V[0]-V[0], c.V[1]-V[1]) < 0.5)
  deepDump.notes.push(`Found ${cornersHere.length} corner records at IX V=${JSON.stringify(V)}`)

  // Build per-corner deep entries.
  // Pick SW corner as baseline: minimum (V_x_offset + V_y_offset) of corner.point
  // The corner with the LOWEST x AND LOWEST y is SW. Identify by which quadrant
  // corner.point relative to V falls in.
  function quadrant(corner) {
    const dx = corner.point[0] - V[0], dy = corner.point[1] - V[1]
    if (dx>=0 && dy>=0) return 'NE'
    if (dx<0 && dy>=0) return 'NW'
    if (dx<0 && dy<0) return 'SW'
    return 'SE'
  }

  const cornerEntries = []
  for (const corner of cornersHere) {
    const legNames = legNamesForCorner(corner)
    const { blockIdx, vertexMatchDist } = findBlockForCorner(corner)
    const blk = blockIdx >= 0 ? blockRounded[blockIdx] : null
    const sharpRing = blockIdx >= 0 ? sharpRings[blockIdx] : null
    const rRing = blk?.ring
    const arcMeta = blk?.arcMeta
    const blockKey = rRing ? blockKeyFromRing(rRing) : null

    const matchedSpan = blk?.instr.spans.find(s => s.corner === corner) || null
    const spans = (rRing && arcMeta) ? partitionRing(rRing, arcMeta) : []
    const arcIdx = spans.findIndex(sp => sp.type==='arc' && sp.corner === corner)
    const arcSpan = arcIdx >= 0 ? spans[arcIdx] : null
    const prevSpan = arcIdx >= 0 ? spans[(arcIdx-1+spans.length)%spans.length] : null
    const nextSpan = arcIdx >= 0 ? spans[(arcIdx+1)%spans.length] : null
    const ringCcw = rRing ? (ringSignedArea2D(rRing) >= 0) : null

    const prevPts = prevSpan?.idxs.map(i => rRing[i]) || []
    const nextPts = nextSpan?.idxs.map(i => rRing[i]) || []
    const prevMeta = (prevSpan?.type==='straight' && prevPts.length>=2) ? resolveStraightMeta(prevPts, ringCcw, blockKey) : { skip:true }
    const nextMeta = (nextSpan?.type==='straight' && nextPts.length>=2) ? resolveStraightMeta(nextPts, ringCcw, blockKey) : { skip:true }
    const Bmeta = !prevMeta.skip ? prevMeta : null
    const Ameta = !nextMeta.skip ? nextMeta : null

    let tl_B = Bmeta?.tl ?? Ameta?.tl ?? 0
    let sw_B = Bmeta?.sw ?? Ameta?.sw ?? 0
    let tl_A = Ameta?.tl ?? Bmeta?.tl ?? 0
    let sw_A = Ameta?.sw ?? Bmeta?.sw ?? 0
    const cw = curbWidth
    const arcR_val = arcSpan ? (arcMeta[arcSpan.idxs[0]]?.R ?? Infinity) : null
    const safeMax = arcR_val!=null ? Math.max(cw + 0.05, arcR_val * 0.9) : null
    const totalMax_pre = Math.max(cw + tl_A + sw_A, cw + tl_B + sw_B)
    let cuspFired = false, cuspK = 1
    if (safeMax!=null && totalMax_pre > safeMax) {
      cuspK = (safeMax - cw) / Math.max(1e-9, totalMax_pre - cw)
      tl_A *= cuspK; sw_A *= cuspK; tl_B *= cuspK; sw_B *= cuspK
      cuspFired = true
    }
    const d_A_post = cw + tl_A + sw_A
    const d_B_post = cw + tl_B + sw_B
    const dCornerRaw = Math.max(d_A_post, d_B_post)
    const dCorner = Math.max(dCornerRaw, RAMP_MIN_M)
    const rampMinFired = dCornerRaw < RAMP_MIN_M

    const inwardSign = ringCcw ? +1 : -1
    const ptsArc = arcSpan?.idxs.map(i => rRing[i]) || []
    const padRing = ptsArc.length>=2 ? emitCornerPad(ptsArc, dCorner, inwardSign) : null

    cornerEntries.push({
      quadrant: quadrant(corner),
      legA: { name: legNames.aName, skel: legNames.aSkel },
      legB: { name: legNames.bName, skel: legNames.bSkel },
      cornerRecord: {
        point: corner.point,
        V: corner.V,
        theta_deg: corner.theta*180/Math.PI,
        d_min: corner.d_min,
        R_authored: corner.R_authored,
        T_A: corner.T_A,
        T_B: corner.T_B,
        outerR_A: corner.outerR_A,
        outerL_B: corner.outerL_B,
        rightDepth_A: corner.rightDepth_A,
        leftDepth_B: corner.leftDepth_B,
      },
      block: {
        blockIdx,
        blockKey,
        sharpRingVertexCount: sharpRing?.length || 0,
        roundedRingVertexCount: rRing?.length || 0,
        vertexMatchDist,
        matched: vertexMatchDist < TOL_MATCH,
        consumedSpan: matchedSpan ? {
          start: matchedSpan.start,
          end: matchedSpan.end,
          cornerIdx: matchedSpan.cornerIdx,
          R: matchedSpan.R,
          inset: matchedSpan.inset,
          walkedBack: matchedSpan.walkedBack,
          walkedFwd: matchedSpan.walkedFwd,
        } : null,
      },
      partition: arcSpan ? {
        arcSpan_idxs: arcSpan.idxs,
        prevSpan_type: prevSpan?.type,
        prevSpan_idxs: prevSpan?.idxs,
        nextSpan_type: nextSpan?.type,
        nextSpan_idxs: nextSpan?.idxs,
      } : null,
      flanking: {
        prevMeta, nextMeta,
        Bmeta_used: Bmeta != null,
        Ameta_used: Ameta != null,
      },
      cuspGuard: {
        arcR: arcR_val,
        safeMax,
        totalMax_pre,
        fired: cuspFired,
        scale_k: cuspK,
      },
      emission: {
        d_A_post, d_B_post,
        dCornerRaw, dCorner,
        rampMinFired,
        padRing,
        padArea: padRing ? ringArea(padRing) : 0,
        padSelfIntersects: padRing ? ringSelfInt(padRing) : false,
      },
    })
  }

  // Identify SW corner (baseline) — quadrant SW
  const swCorner = cornerEntries.find(c => c.quadrant==='SW') || cornerEntries[0]
  deepDump.swBaseline = {
    quadrant: swCorner?.quadrant,
    legA: swCorner?.legA, legB: swCorner?.legB,
  }

  // Per-corner side-by-side diff vs SW.
  for (const c of cornerEntries) {
    c.diffVsSw = swCorner ? {
      theta_deg_delta: c.cornerRecord.theta_deg - swCorner.cornerRecord.theta_deg,
      R_authored_delta: (c.cornerRecord.R_authored ?? null) !== (swCorner.cornerRecord.R_authored ?? null) ? `${c.cornerRecord.R_authored} vs ${swCorner.cornerRecord.R_authored}` : 'same',
      vertexMatchDist_delta: c.block.vertexMatchDist - swCorner.block.vertexMatchDist,
      dCorner_delta: c.emission.dCorner - swCorner.emission.dCorner,
      cuspFired_diff: c.cuspGuard.fired !== swCorner.cuspGuard.fired,
      padArea_delta: c.emission.padArea - swCorner.emission.padArea,
      flanking_skip_diff: `prev:${c.flanking.prevMeta.skip}/sw:${swCorner.flanking.prevMeta.skip} next:${c.flanking.nextMeta.skip}/sw:${swCorner.flanking.nextMeta.skip}`,
    } : null
  }

  deepDump.corners = cornerEntries
} else {
  deepDump.notes.push('No Mississippi × Park IX candidate found.')
}

writeFileSync(
  join(ROOT, 'scratch', 'corner-input-audit-stage11a1-mississippi-park.json'),
  JSON.stringify(deepDump, null, 2),
)

// ---- summary stats for report --------------------------------------
const summary = {
  totalCorners: rows.length,
  modeCounts,
  perIxHist,
  cuspFiredCount,
  rampMinFiredCount,
  overTolCount: overTol,
  nearTolCount: nearTol,
  arcRDistribution: (() => {
    const m = new Map()
    for (const r of rows) {
      const v = parseFloat(r.arc_R)
      if (!Number.isFinite(v)) continue
      const b = Math.floor(v)
      m.set(b, (m.get(b)||0)+1)
    }
    return Object.fromEntries([...m.entries()].sort((a,b)=>a[0]-b[0]))
  })(),
}

// Save summary as JSON for the report to consume.
writeFileSync(
  join(ROOT, 'scratch', 'corner-input-audit-stage11a1-summary.json'),
  JSON.stringify(summary, null, 2),
)

console.log(``)
console.log(`Wrote: scratch/corner-input-audit-stage11a1.csv (${rows.length} rows)`)
console.log(`Wrote: scratch/corner-input-audit-stage11a1-mississippi-park.json`)
console.log(`Wrote: scratch/corner-input-audit-stage11a1-summary.json`)
