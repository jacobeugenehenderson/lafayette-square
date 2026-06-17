// Cul-de-sac KEYHOLE construction — prove the prebake tile.ring splice in a harness
// BEFORE wiring into derive.js. At each stem↔loop neck, splice a tangent line↔circle
// fillet (curb-return) into the centerline face ring, then offset (buildTileGround)
// and render SVG so the eye confirms the notch is gone.
//
// Usage: node scratch/culdesac-keyhole.mjs [rf] [signE] [signTan]
//   rf      curb-return fillet radius (default 3)
//   signE   ±1 — which side of the stem line the fillet centre sits (default try both)
//   signTan internal(-1)/external(+1) tangency to the loop circle (default -1)
import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const rf = +(process.argv[2] || 3)
const FORCE_E = process.argv[3] ? +process.argv[3] : null
const FORCE_T = process.argv[4] ? +process.argv[4] : null

const r0 = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ── fit loop circles: closed-ish streets (first≈last) that circle-fit tightly ──
function fitCircle(pts) {
  let sx=0,sy=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0,sz=0,N=pts.length
  for (const [x,y] of pts){ const z=x*x+y*y; sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;sxz+=x*z;syz+=y*z;sz+=z }
  const M=[[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,N]], V=[sxz,syz,sz]
  const det3=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
  const D=det3(M); if(Math.abs(D)<1e-9) return null
  const rep=c=>M.map((row,ri)=>row.map((v,ci)=>ci===c?V[ri]:v))
  const cx=det3(rep(0))/(2*D), cy=det3(rep(1))/(2*D), C=det3(rep(2))/D
  const R=Math.sqrt(Math.max(0,C+cx*cx+cy*cy))
  let res=0; for(const[x,y]of pts) res+=Math.abs(Math.hypot(x-cx,y-cy)-R); res/=N
  return {C:[cx,cy],R,res}
}
const xy = p => [p[0]??p.x, p[1]??p.z??p[1]]
const loops = []   // {skelId, C, R}
for (const s of r0.streets) {
  const pts = (s.points||s.pts||[]).map(xy)
  if (pts.length < 8) continue
  if (dist(pts[0], pts.at(-1)) > 1.0) continue            // not closed
  const f = fitCircle(pts); if (!f || f.res > 0.3 || f.R < 3 || f.R > 12) continue
  loops.push({ skelId: s.skelId || s.name, ...f })
}
console.log(`loops: ${loops.map(l=>`${l.skelId}(R${l.R.toFixed(1)})`).join(', ')}`)

// ── the line↔circle fillet splice at one neck vertex ──
// ring/fe: the tile ring + per-edge {skelId,side}. i: neck index. loop: {C,R}.
// Returns {tA, arc:[...], tC} or null. tA = tangent pt on stem line (kept),
// arc = fillet arc pts, tC = tangent pt on circle (kept). The caller rebuilds
// the ring: stem→tA→arc→tC→circle.
function filletAtNeck(ring, i, loop, rf, eForce, tForce) {
  const n = ring.length, V = ring[i]
  const prev = ring[(i-1+n)%n], next = ring[(i+1)%n]
  const prevOn = Math.abs(dist(prev, loop.C) - loop.R) < 0.6
  const nextOn = Math.abs(dist(next, loop.C) - loop.R) < 0.6
  if (prevOn === nextOn) return null                      // need exactly one circle side
  const stemPt = prevOn ? next : prev                     // the off-circle neighbour
  // stem unit dir (V → stemPt)
  let s = [stemPt[0]-V[0], stemPt[1]-V[1]]; const sl=Math.hypot(...s)||1; s=[s[0]/sl,s[1]/sl]
  const nperp = [-s[1], s[0]]
  const w = [V[0]-loop.C[0], V[1]-loop.C[1]]
  const candidates = []
  for (const e of (eForce!=null?[eForce]:[1,-1])) for (const t of (tForce!=null?[tForce]:[-1,1])) {
    // O = V + a*s + e*rf*nperp ; |O - C| = R + t*rf
    const wn = w[0]*nperp[0]+w[1]*nperp[1], ws = w[0]*s[0]+w[1]*s[1]
    const C2 = (w[0]*w[0]+w[1]*w[1]) + rf*rf + 2*e*rf*wn - (loop.R + t*rf)**2
    const B2 = 2*ws, A2 = 1
    const disc = B2*B2 - 4*A2*C2; if (disc < 0) continue
    for (const a of [(-B2+Math.sqrt(disc))/2, (-B2-Math.sqrt(disc))/2]) {
      const O = [V[0]+a*s[0]+e*rf*nperp[0], V[1]+a*s[1]+e*rf*nperp[1]]
      const tA = [V[0]+a*s[0], V[1]+a*s[1]]                // foot on stem line
      const oc = dist(O, loop.C); if (oc < 1e-6) continue
      const tC = [loop.C[0]+(O[0]-loop.C[0])/oc*loop.R, loop.C[1]+(O[1]-loop.C[1])/oc*loop.R]
      // both tangent pts must be near V (a sane local return) and a must put tA on the stem side
      if (dist(tA,V) > 3*rf+2 || dist(tC,V) > 3*rf+2) continue
      if ((tA[0]-V[0])*s[0]+(tA[1]-V[1])*s[1] < -0.05) continue   // tA on the stem side of V
      candidates.push({ O, tA, tC, e, t, score: dist(tA,V)+dist(tC,V) })
    }
  }
  if (!candidates.length) return null
  candidates.sort((x,y)=>x.score-y.score)
  const { O, tA, tC } = candidates[0]
  // tessellate the arc tA→tC about O
  const aA = Math.atan2(tA[1]-O[1], tA[0]-O[0]), aC = Math.atan2(tC[1]-O[1], tC[0]-O[0])
  let delta = aC - aA; while (delta > Math.PI) delta -= 2*Math.PI; while (delta < -Math.PI) delta += 2*Math.PI
  const segs = Math.max(2, Math.round(Math.abs(delta)/(Math.PI/24)))
  const arc = []; for (let k=0;k<=segs;k++){ const a=aA+delta*(k/segs); arc.push([O[0]+rf*Math.cos(a),O[1]+rf*Math.sin(a)]) }
  return { stemOnPrev: !prevOn, tA, arc, tC }
}

// ── apply splices to a tile; returns {ring, edges} (centerline face) ──
function keyholeRing(ring, fe) {
  const n = ring.length
  const isLoopEdge = e => loops.some(l => l.skelId === e.skelId)
  const splices = new Map()   // i → {tA, arc, tC, stemOnPrev, loopEdge}
  for (let i=0;i<n;i++){
    const eIn = fe[(i-1+n)%n], eOut = fe[i]
    const inL = isLoopEdge(eIn), outL = isLoopEdge(eOut)
    if (inL === outL) continue
    const loopSkel = inL ? eIn.skelId : eOut.skelId
    const loop = loops.find(l => l.skelId === loopSkel)
    if (!loop) continue
    if (Math.abs(dist(ring[i], loop.C) - loop.R) > 0.8) continue
    const sp = filletAtNeck(ring, i, loop, rf, FORCE_E, FORCE_T)
    if (sp) { sp.loopEdge = inL ? eIn : eOut; splices.set(i, sp) }
  }
  if (!splices.size) return null
  // rebuild ring + aligned edges. edges[k] = edge LEAVING outRing[k]. For the
  // curb-return sequence we tag every edge with the LOOP edge {skelId,side} so
  // the offset reads it as one smooth same-street run (cornerAt=false), depth =
  // loop depth — the return rides the bulb, no spurious corner.
  const outR = [], outE = []
  for (let i=0;i<n;i++){
    const sp = splices.get(i)
    if (!sp) { outR.push(ring[i]); outE.push(fe[i]); continue }
    const seq = sp.stemOnPrev ? [sp.tA, ...sp.arc, sp.tC] : [sp.tC, ...sp.arc.slice().reverse(), sp.tA]
    for (let k=0;k<seq.length;k++){ outR.push(seq[k]); outE.push(sp.loopEdge) }
    // the vertex AFTER the last seq point inherits the original leaving edge fe[i],
    // but we've consumed vertex i; the next loop iteration pushes ring[i+1] with fe[i+1].
    // So the LAST seq edge should be fe[i] (leaving the neck region toward i+1):
    outE[outE.length-1] = fe[i]
  }
  return { ring: outR, edges: outE }
}

// ── rewrite ribbons.tiles with keyhole rings, then build + render ──
const r = JSON.parse(JSON.stringify(r0))
let spliced = 0
r.tiles = r.tiles.map(t => {
  const nr = keyholeRing(t.ring, t.edges)
  if (!nr) return t
  spliced++
  return { ...t, ring: nr.ring, edges: nr.edges, _keyhole: true }
})
console.log(`spliced ${spliced} tile(s)`)
writeFileSync(new URL('../scratch/_ribbons_keyhole.json', import.meta.url), JSON.stringify(r))

// render BOTH the original and keyholed curb for SV + Park
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
for (const [tag, rib] of [['orig', r0], ['keyhole', r]]) {
  let out
  try { out = buildTileGround(rib, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null }) }
  catch (e) { console.log(`${tag}: build FAILED ${e.message}`); continue }
  for (const [name, C, R] of [['SV',[-409.2,-160.1],16],['Park',[772.5,97.3],16]]) {
    const W=600, pad=15, sc=(W-2*pad)/(2*R)
    const X=x=>pad+(x-(C[0]-R))*sc, Y=y=>pad+(y-(C[1]-R))*sc
    const near=ring=>ring.some(p=>dist(p,C)<R)
    const path=(ring,st,fi,w)=>`<path d="M${ring.map(p=>`${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}Z" fill="${fi}" stroke="${st}" stroke-width="${w}"/>`
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#1a2530"/>`
    // tile.ring (the centerline face we splice) in grey — the layer under test
    for(const t of (rib.tiles||[])) if(t.ring && near(t.ring)) svg+=path(t.ring, t._keyhole?'#fa0':'#778','none', t._keyhole?2:1)
    for(const a of (out.asphalt||[])) if(near(a)) svg+=path(a,'none','#2a2a2a',0)
    for(const c of (out.curb||[])) if(near(c)) svg+=path(c,'#4af','none',1.2)
    svg+=`<circle cx="${X(C[0])}" cy="${Y(C[1])}" r="2" fill="red"/></svg>`
    writeFileSync(new URL(`../scratch/kh-${name}-${tag}.svg`, import.meta.url), svg)
  }
}
console.log('wrote scratch/kh-{SV,Park}-{orig,keyhole}.svg')
