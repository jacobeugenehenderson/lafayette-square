// Plumb, 2026-09-24 — does ③'s inward strike KEEP the offset's inverted lobe?
// ③ strikes every band with `offsetRingVariable(ring, d, …, clean=false)`: a per-edge miter offset, then
// `unionRings` at pftNonZero. Where the contour is narrower than 2·d the offset crosses itself, and the part
// past the crossing runs the OTHER way (winding −1). NonZero fills |winding| ≥ 1, so it KEEPS that lobe;
// the ruling (`RIBBONS §1`, 2026-09-06) is that it goes to ZERO there. This re-runs the same offset
// (the same seg/miter/clamp arithmetic, copied — the function is not exported) and reports, per ② contour,
// the area NonZero keeps that the orientation-correct fill (pftPositive for the contour's own sign) drops.
// No threshold: an inverted lobe is any area of winding −1, full stop.
//   node scratch/plumb-inverted-lobe.mjs <scene> [--d=cw|<metres>] [--at=x,z --span=m]
import clipperLib from 'clipper-lib'
import { feed, buildProto } from './_proto-feed.mjs'
const scene = process.argv[2]
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const f = feed(scene); if (!f) process.exit(2)
const w0 = console.warn; console.warn = () => {}
const tg = buildProto(f, { emitArtifact: true, protoProducer: true, protoArtifact: true }); console.warn = w0
const cw = f.curbWidth, D = arg('d') && arg('d') !== 'cw' ? +arg('d') : cw
const S = 1000, toC = (r) => r.map(p => ({ X: Math.round(p[0]*S), Y: Math.round(p[1]*S) }))
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i+1)%r.length]; s += p[0]*q[1]-q[0]*p[1] } return s / 2 }
const areaC = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i+1)%r.length]; s += p.X*q.Y-q.X*p.Y } return s / 2 / S / S }
function offsetRaw(ring, d, noClamp = false) {       // offsetRingVariable's vertex loop, scalar depth, cornerAt true, capAt null
  const n = ring.length, ccw = area(ring) > 0, seg = []
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i+1)%n]; let dx = b[0]-a[0], dy = b[1]-a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx; seg.push({ dir: [dx, dy], P: [a[0]+nx*d, a[1]+ny*d], nrm: [nx, ny] }) }
  const W = []
  for (let i = 0; i < n; i++) { const A = seg[(i-1+n)%n], B = seg[i]; const det = A.dir[0]*B.dir[1]-A.dir[1]*B.dir[0]
    if (Math.abs(det) < 1e-9) { let mx = A.nrm[0]+B.nrm[0], my = A.nrm[1]+B.nrm[1]; const mL = Math.hypot(mx, my) || 1; W.push([ring[i][0]+mx/mL*d, ring[i][1]+my/mL*d]); continue }
    const t = ((B.P[0]-A.P[0])*A.dir[1]-(B.P[1]-A.P[1])*A.dir[0]) / det, X = [B.P[0]+B.dir[0]*t, B.P[1]+B.dir[1]*t]
    const lim = noClamp ? Infinity : 2.5 * Math.max(d, 0.5) + 1
    if (Math.hypot(X[0]-ring[i][0], X[1]-ring[i][1]) > lim) {
      const pA = (ring[i][0]-A.P[0])*A.dir[0]+(ring[i][1]-A.P[1])*A.dir[1], pB = (ring[i][0]-B.P[0])*B.dir[0]+(ring[i][1]-B.P[1])*B.dir[1]
      W.push([A.P[0]+A.dir[0]*pA, A.P[1]+A.dir[1]*pA]); W.push([B.P[0]+B.dir[0]*pB, B.P[1]+B.dir[1]*pB])
    } else W.push(X) }
  return W
}
const fill = (W, pft) => { const c = new clipperLib.Clipper(); c.AddPath(toC(W), clipperLib.PolyType.ptSubject, true); const o = []; c.Execute(clipperLib.ClipType.ctUnion, o, pft, pft); return o }
const [cx, cz] = (arg('at') || 'NaN,NaN').split(',').map(Number), span = +(arg('span') || Infinity)
const inWin = (r) => !Number.isFinite(cx) || r.some(p => Math.abs(p[0]-cx) < span && Math.abs(p[1]-cz) < span)
let nTiles = 0, nLobe = 0, tot = 0; const rows = []
for (const [ti, t] of (tg.protoShapeTiles || []).entries()) {
  for (const r of (process.argv.includes("--proto") ? [t.ring] : (t.iaFull || []))) { if (!(r?.length >= 3) || !inWin(r)) continue
    nTiles++
    const W = offsetRaw(r, D), own = area(r) > 0 ? clipperLib.PolyFillType.pftPositive : clipperLib.PolyFillType.pftNegative
    const nz = fill(W, clipperLib.PolyFillType.pftNonZero), or = fill(W, own)
    const a = nz.reduce((s, x) => s + Math.abs(areaC(x)), 0) - or.reduce((s, x) => s + Math.abs(areaC(x)), 0)
    if (a > 1e-4) { nLobe++; tot += a
      // locate: the NonZero-only region
      const c = new clipperLib.Clipper(); for (const x of nz) c.AddPath(x, clipperLib.PolyType.ptSubject, true); for (const x of or) c.AddPath(x, clipperLib.PolyType.ptClip, true)
      const dd = []; c.Execute(clipperLib.ClipType.ctDifference, dd, clipperLib.PolyFillType.pftNonZero, clipperLib.PolyFillType.pftNonZero)
      const big = dd.sort((x, y) => Math.abs(areaC(y)) - Math.abs(areaC(x)))[0]
      const at = big ? [big.reduce((s, p) => s + p.X, 0)/big.length/S, big.reduce((s, p) => s + p.Y, 0)/big.length/S] : [NaN, NaN]
      rows.push({ ti, lu: t.lu, a, at }) }
  }
}
rows.sort((x, y) => y.a - x.a)
console.log(`${scene}: strike depth ${D.toFixed(3)} m (${arg('d') ? 'given' : 'curbWidth'}) · ${nTiles} ② contour(s) · ${nLobe} keep an INVERTED lobe under NonZero · ${tot.toFixed(2)} m² total`)
for (const r of rows.slice(0, +(arg('top') || 12))) console.log(`   tile ${r.ti} (${r.lu}) ${r.a.toFixed(3)} m² — largest at (${r.at[0].toFixed(1)}, ${r.at[1].toFixed(1)})`)
// --pts=x,z;x,z  — for each point, the strike depths (0.05 m sweep up to --dmax) at which it lies in an inverted lobe of any ② contour
if (arg('pts')) {
  const pts = arg('pts').split(';').map(s => s.split(',').map(Number)), dmax = +(arg('dmax') || 6)
  const inPoly = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.Y > p[1]*S) !== (b.Y > p[1]*S) && p[0]*S < (b.X-a.X)*(p[1]*S-a.Y)/(b.Y-a.Y)+a.X) c = !c } return c }
  for (const p of pts) { const hitsAt = []
    for (const [ti, t] of (tg.protoShapeTiles || []).entries()) for (const r of (t.iaFull || [])) { if (!r.some(q => Math.hypot(q[0]-p[0], q[1]-p[1]) < 60)) continue
      for (let d = 0.05; d <= dmax; d += 0.05) { const W = offsetRaw(r, d), own = area(r) > 0 ? clipperLib.PolyFillType.pftPositive : clipperLib.PolyFillType.pftNegative
        const nz = fill(W, clipperLib.PolyFillType.pftNonZero), or = fill(W, own)
        if (nz.some(x => inPoly(p, x)) && !or.some(x => inPoly(p, x))) hitsAt.push(`t${ti}@${d.toFixed(2)}`) } }
    console.log(`point (${p}) in an inverted lobe at: ${hitsAt.length ? hitsAt.slice(0, 3).join(' ') + (hitsAt.length > 3 ? ` … ${hitsAt.at(-1)} (${hitsAt.length} depths)` : '') : 'NO depth'}`) }
}
