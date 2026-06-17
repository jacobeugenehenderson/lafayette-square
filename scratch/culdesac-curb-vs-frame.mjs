// Cul-de-sac CURB-vs-FRAME probe (2026-06-16, Boz).
// Decides where the keyhole notch is born: in the frozen tile.ring (FRAME) or in
// the inward offset that makes the curb (CURB). Method:
//   • locate the cul-de-sac tile (ring wraps the bulb near C),
//   • fit the bulb circle to the arc-run of the tile.ring,
//   • find the NECK vertices (where a straight stem edge joins the bulb arc),
//   • FRAME tangency = angle between the stem edge and the circle tangent there,
//   • CURB notch     = worst turn on the live curb ring near each neck.
// frame≈0 + curb-notch large  ⇒ born in the offset (curb layer).
// frame already large          ⇒ ring non-tangent → fix upstream (frame).
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const out = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true })

// Park = the Park Place loop centroid (street #159, local frame). NOT [650.9,-557]
// — that was a false circle-fit on the South-18th/Papin junction (a 2026-06-16 trap).
const SITES = { SV: [-409.2, -160.1], Park: [772.5, 97.3] }
const DEG = 180 / Math.PI

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) }
function turnAt(ring, i) {
  const n = ring.length, a = ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n]
  const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]]
  const m1 = Math.hypot(...v1), m2 = Math.hypot(...v2); if (m1 < 1e-7 || m2 < 1e-7) return null
  const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0]*v2[0]+v1[1]*v2[1])/(m1*m2)))) * DEG
  const cross = v1[0]*v2[1] - v1[1]*v2[0]
  return { ang, reflex: cross < 0 }
}
// least-squares circle fit over a set of points
function fitCircle(pts) {
  let sx=0,sy=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0,sz=0,N=pts.length
  for (const [x,y] of pts){ const z=x*x+y*y; sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;sxz+=x*z;syz+=y*z;sz+=z }
  // solve [sxx sxy sx; sxy syy sy; sx sy N] [A B C] = [sxz syz sz]
  const M=[[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,N]], V=[sxz,syz,sz]
  const det3=(m)=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
  const D=det3(M); if(Math.abs(D)<1e-9) return null
  const rep=(col)=>M.map((row,ri)=>row.map((v,ci)=>ci===col?V[ri]:v))
  const A=det3(rep(0))/D, B=det3(rep(1))/D, C=det3(rep(2))/D
  const cx=A/2, cy=B/2, R=Math.sqrt(Math.max(0,C+cx*cx+cy*cy))
  let res=0; for(const[x,y]of pts){res+=Math.abs(Math.hypot(x-cx,y-cy)-R)}; res/=N
  return { c:[cx,cy], R, res }
}

// Find the bulb arc-run in a ring: longest run of vertices ~equidistant from a fitted centre.
function findBulb(ring) {
  const n = ring.length
  // try every window of consecutive verts >= 6 long; keep best circle fit with small residual
  let best = null
  for (let len = Math.min(n, 40); len >= 6; len--) {
    for (let s = 0; s < n; s++) {
      const pts = []; for (let k = 0; k < len; k++) pts.push(ring[(s + k) % n])
      const f = fitCircle(pts); if (!f || f.R < 1.5 || f.R > 12) continue
      const span = 2 * Math.PI * f.R   // crude; prefer low residual & decent radius
      if (f.res < 0.25 && (!best || len > best.len || (len === best.len && f.res < best.f.res))) {
        best = { s, len, f }
      }
    }
    if (best && best.len >= len) break  // longest acceptable run found
  }
  return best
}

for (const [name, C0] of Object.entries(SITES)) {
  const tiles = out._tiles || []
  // candidate cul-de-sac tiles: a ring with an embedded arc-run (bulb)
  const cands = tiles.filter(t => t.ring && t.ring.length >= 8 && (C0 ? t.ring.some(p => dist(p, C0) < 30) : true))
    .map(t => ({ t, bulb: findBulb(t.ring) }))
    .filter(x => x.bulb)
  if (C0 && !cands.length) { console.log(`\n### ${name}: no bulb tile found near ${C0}`); continue }
  // pick the candidate whose bulb is nearest C0 (SV) or just all (Park=null → take small-radius bulbs)
  cands.sort((a,b)=> C0 ? dist(a.bulb.f.c,C0)-dist(b.bulb.f.c,C0) : a.bulb.f.R-b.bulb.f.R)
  const pick = cands[0]; if (!pick) continue
  const { t, bulb } = pick
  const ring = t.ring, n = ring.length
  console.log(`\n### ${name}: cul-de-sac tile — ${n} verts, bulb centre [${bulb.f.c.map(v=>+v.toFixed(1))}] R=${bulb.f.R.toFixed(2)} res=${bulb.f.res.toFixed(3)} arc-run ${bulb.len} verts`)
  // neck vertices = the two ends of the arc-run; measure FRAME tangency there.
  for (const which of ['start', 'end']) {
    const idx = which === 'start' ? bulb.s : (bulb.s + bulb.len - 1) % n
    const i = (idx + n) % n
    const prev = ring[(i - 1 + n) % n], here = ring[i], next = ring[(i + 1) % n]
    // stem edge = the one NOT on the arc; arc-tangent = perpendicular to radius at `here`
    const onArcPrev = Math.abs(dist(prev, bulb.f.c) - bulb.f.R) < 0.4
    const stemPt = onArcPrev ? next : prev
    const radial = [here[0]-bulb.f.c[0], here[1]-bulb.f.c[1]]; const rl=Math.hypot(...radial)
    const tang = [-radial[1]/rl, radial[0]/rl]
    let stem = [stemPt[0]-here[0], stemPt[1]-here[1]]; const sl=Math.hypot(...stem); stem=[stem[0]/sl,stem[1]/sl]
    const tangAng = Math.acos(Math.max(-1,Math.min(1,Math.abs(stem[0]*tang[0]+stem[1]*tang[1]))))*DEG
    console.log(`  NECK ${which} @[${here.map(v=>+v.toFixed(1))}]  FRAME tangency dev = ${tangAng.toFixed(1)}°  (0°=perfectly tangent flare; >~8° = ring kink)`)
  }
  // CURB at the NECKS: cumulative bend over a ±2.5 m window around the curb vertex
  // nearest each neck — catches the subtle MULTI-VERTEX dimple (not a single kink).
  const curbRings = (out.curb || []).filter(rr => rr.some(p => dist(p, bulb.f.c) < bulb.f.R + 10))
  const necks = [['start', bulb.s], ['end', (bulb.s + bulb.len - 1) % n]].map(([w, idx]) => [w, ring[(idx + n) % n]])
  for (const [w, neckPt] of necks) {
    // nearest curb ring + vertex to this neck
    let best = null
    curbRings.forEach((rr, k) => rr.forEach((p, i) => { const dd = dist(p, neckPt); if (!best || dd < best.dd) best = { dd, k, i, rr } }))
    if (!best) { console.log(`  CURB @neck ${w}: no curb vertex near`); continue }
    const { rr, i } = best, m = rr.length
    // walk ±2.5 m and sum |turn| (signed-net + total) → a dimple shows net≈0 but total large
    let total = 0, net = 0, span = 0, lo = i, hi = i
    for (let j = 1; j < 40 && span < 5; j++) {
      const a = (i - j + m) % m, b = (i + j) % m
      const ta = turnAt(rr, a), tb = turnAt(rr, b)
      if (ta) { total += ta.ang; net += ta.reflex ? -ta.ang : ta.ang }
      if (tb) { total += tb.ang; net += tb.reflex ? -tb.ang : tb.ang }
      span = dist(rr[(i - j + m) % m], rr[(i + j) % m]); lo = a; hi = b
    }
    const single = turnAt(rr, i)
    console.log(`  CURB @neck ${w}: nearest curb vtx [${rr[i].map(v=>+v.toFixed(1))}] dist=${best.dd.toFixed(2)}m | single-turn=${single?single.ang.toFixed(0):'-'}° | window±2.5m: TOTAL bend=${total.toFixed(0)}° NET=${net.toFixed(0)}°  (dimple = high total, low |net|)`)
  }
}

// ── RAW neck geometry dump + tile-seam check ─────────────────────────────────
console.log('\n\n========== RAW NECK / SEAM DIAGNOSTIC ==========')
for (const [name, C0] of [['SV',[-409.2,-160.1]], ['Park',[772.5,97.3]]]) {
  const tiles = out._tiles || []
  // how many tiles touch the bulb perimeter (within 11 m of C0)?
  const touching = tiles.filter(t => t.ring && t.ring.some(p => dist(p, C0) < 11))
  console.log(`\n${name} @${C0}: ${touching.length} tile(s) touch the bulb`)
  touching.forEach((t, ti) => {
    const near = t.ring.filter(p => dist(p, C0) < 13).length
    console.log(`  tile#${ti}: ${t.ring.length} verts, ${near} within 13 m of bulb centre`)
  })
}

// ── SLIVER + assembled-curb continuity at the seam ───────────────────────────
console.log('\n========== SLIVERS + ASSEMBLED CURB AT BULB ==========')
for (const [name, C0] of [['SV',[-409.2,-160.1]], ['Park',[772.5,97.3]]]) {
  const tiles = out._tiles || []
  const slivers = tiles.filter(t => t.ring && Math.abs(t.ring.reduce((s,p,i)=>{const q=t.ring[(i+1)%t.ring.length];return s+(p[0]*q[1]-q[0]*p[1])},0)/2) < 60 && t.ring.some(p=>dist(p,C0)<14))
  console.log(`\n${name}: ${slivers.length} sliver tile(s) (<60 m²) touching bulb`)
  slivers.forEach((t,i)=>{const area=Math.abs(t.ring.reduce((s,p,j)=>{const q=t.ring[(j+1)%t.ring.length];return s+(p[0]*q[1]-q[0]*p[1])},0)/2);console.log(`  sliver#${i}: ${t.ring.length}v area=${area.toFixed(1)}m² pts=${JSON.stringify(t.ring.map(p=>p.map(v=>+v.toFixed(1))))}`)})
  // assembled curb: count distinct curb rings touching the bulb + their worst near-bulb turn
  const cr = (out.curb||[]).filter(rr=>rr.some(p=>dist(p,C0)<14))
  console.log(`  assembled curb rings at bulb: ${cr.length}`)
  cr.forEach((rr,k)=>{let mx=0,mxp=null;for(let i=0;i<rr.length;i++){if(dist(rr[i],C0)>13)continue;const tt=turnAt(rr,i);if(tt&&tt.ang>mx){mx=tt.ang;mxp=rr[i]}}if(mx>10)console.log(`    curb#${k}(${rr.length}v): worst near-bulb turn ${mx.toFixed(0)}° @[${mxp.map(v=>+v.toFixed(1))}]`)})
}
