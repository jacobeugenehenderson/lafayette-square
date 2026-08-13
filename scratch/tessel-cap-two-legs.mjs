// READ-ONLY, scratch. THE CONTROLLED COMPARISON at one dead-end cap:
// same tip, same gesture, same geometry — what differs between the two legs?
//
// ⚠️ UNION FIRST (claims-band-is-one-ring.mjs's own warning): sectionPassTile
// returns CLAIMS that abut but are not merged; the union happens downstream in
// buildTileGround. Counting claims measures the construction, not the map.
//
//   node scratch/tessel-cap-two-legs.mjs [tileIdx] [skelId] [capEnd]
import fs from 'node:fs'
import clipperLib from 'clipper-lib'
import { sectionPassTile, resolvePedDepths } from '../src/lib/tileGround.js'
import { readCapCustom } from '../src/lib/feCustomKey.js'

const TI = +(process.argv[2] ?? 10)
const SKEL = process.argv[3] || 'south-18th-street-3'
const CAPEND = process.argv[4] || 'end'
const o = console.log

const sh = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8'))
const bc = design.blockCustoms || null
const CW = design.curbWidth ?? 0.381
const st = sh.tiles[TI]

const SC = 1e5
const unionAll = (rings) => {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper(); let n = 0
  for (const r of rings) if (r && r.length >= 3) { c.AddPath(r.map(p => ({ X: Math.round(p[0] * SC), Y: Math.round(p[1] * SC) })), PolyType.ptSubject, true); n++ }
  if (!n) return []
  const out = []; c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(q => [q.X / SC, q.Y / SC]))
}
const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const H = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])

// ── the tip, and its two legs ─────────────────────────────────────────────
const tip = (st.roundTips || []).concat(st.bluntTips || []).find(t => t.skelId === SKEL && t.capEnd === CAPEND)
if (!tip) { o(`no cap ${SKEL}|${CAPEND} on tile ${TI}`); process.exit(1) }
o(`tile ${TI} · cap ${SKEL} | ${CAPEND} · tip (${tip.p[0].toFixed(2)}, ${tip.p[1].toFixed(2)}) · cap hw ${tip.hw.toFixed(4)} · curbWidth ${CW}`)
const capCustom = readCapCustom(bc, SKEL, CAPEND)
o(`cap custom: ${JSON.stringify(capCustom) || 'none'}   ⇒ FLIPPED = ${!!capCustom?.capFlip}`)

const legs = (st.runs || []).filter(r => r.skelId === SKEL && r.poly.some(p => H(p, tip.p) < 1.5))
o(`\nlegs of this finger: ${legs.length}`)

// tileGround.js:1622-1644 — the rr entry, replicated here (edgeDepth is not
// exported). ⛔ Replication, not a re-derivation of intent: any drift from the
// producer invalidates this probe, so the values are cross-checked against the
// measured band below.
const edgeDepth = (m, side, cw, level) => {
  const s = m?.[side]
  const a = Math.max(0, Number.isFinite(s?.pavementHW) ? s.pavementHW : 0)
  if (level === 'A' || a <= 0) return a
  const c = a + cw
  if (level === 'C') return c
  const t = c + Math.max(0, Number.isFinite(s?.treelawn) ? s.treelawn : 0)
  if (level === 'T') return t
  return t + Math.max(0, Number.isFinite(s?.sidewalk) ? s.sidewalk : 0)
}
const runCustomOf = (run) => bc?.[run.skelId]?.[run.side]?.[run.segOrd] || null
const E = legs.map(run => {
  const aBase = edgeDepth(run.baseMeasure, run.side, CW, 'A')
  const c = runCustomOf(run)
  const ped = resolvePedDepths(run.baseMeasure, run.side, c)
  const oo = ped.hasTL ? ped.tl : ped.sw
  const inn = ped.hasTL ? ped.sw : ped.tl
  const stripMat = { outer: 'LU', inner: 'SW' }
  const defMat = ped.hasTL ? { outer: stripMat.outer, inner: stripMat.inner } : { outer: stripMat.inner, inner: stripMat.outer }
  const cm = c?.materials
  const mat = cm ? { outer: cm.outer === 'SW' ? 'SW' : 'LU', inner: cm.inner === 'LU' ? 'LU' : 'SW' } : defMat
  return { run, aBase, a: edgeDepth(run.measure, run.side, CW, 'A'), hasTL: ped.hasTL, o: oo, inn, total: oo + inn, mat, custom: c }
})
const gkOf = e => `${e.o.toFixed(4)}|${e.total.toFixed(4)}|${e.mat.outer}|${e.mat.inner}`
o('')
for (const e of E) {
  o(`  ${e.run.side.padEnd(5)} segOrd ${String(e.run.segOrd).padStart(2)}  aBase ${e.aBase.toFixed(4)}  a ${e.a.toFixed(4)}  hasTL ${e.hasTL}  o ${e.o.toFixed(2)}  inn ${e.inn.toFixed(2)}  total ${e.total.toFixed(2)}  mat ${e.mat.outer}/${e.mat.inner}  custom ${JSON.stringify(e.custom) || '—'}`)
  o(`        groupKey  ${gkOf(e)}`)
  o(`        band occupies ${(e.aBase + CW).toFixed(2)} … ${(e.aBase + CW + e.total).toFixed(2)} m from the centerline`)
}
if (E.length === 2) {
  const same = gkOf(E[0]) === gkOf(E[1])
  o(`\n  groupKeys EQUAL? ${same}   ⇒ the [DEAD-END PENDANT · per-side claim] split at tileGround.js:1785-1812 ${same ? 'DOES NOT fire (identical → old peel)' : 'FIRES'}`)
  if (!same) {
    const owner = E.find(e => e.run.side === 'left') || E[0]
    o(`  ⇒ capOwner := the 'left' leg (tileGround.js:1812, a stated tie-break, not peel order) = ${owner.run.side}, total ${owner.total.toFixed(2)}, aBase ${owner.aBase.toFixed(4)}`)
    o(`  ⇒ the OTHER leg (${E.find(e => e !== owner).run.side}) is clipped to its own side, ENDING AT THE SHOULDER, and depends on the END COUPLER (tileGround.js:2307-2380) to reconnect.`)
  }
  // The coupler places its quad at `hw + cw + d` off the CAP AXIS (:2372,
  // P(s,d) = tip + a*s + p*(hw+cw+d)) — one hw for both shoulders.
  o(`\n  COUPLER PLACEMENT (tileGround.js:2372 — a single cap hw serves BOTH shoulders):`)
  o(`     coupler band offset  = capHW + cw + d = ${tip.hw.toFixed(4)} + ${CW} + d`)
  for (const e of E) o(`     ${e.run.side.padEnd(5)} leg band offset = aBase + cw + d = ${e.aBase.toFixed(4)} + ${CW} + d      ⇒ offset gap vs coupler ${Math.abs(tip.hw - e.aBase).toFixed(4)} m`)
}

// ── THE UNION, and where each component sits ──────────────────────────────
const out = sectionPassTile(st, CW, { outer: 'LU', inner: 'SW' }, bc)
const band = unionAll([...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()])
const comps = band.filter(r => r.length >= 3 && area(r) > 0.05)
o(`\nUNION: ${comps.length} positive-area component(s) on tile ${TI}   (areas ${comps.map(r => area(r).toFixed(0)).join(', ')})`)

// probe points: mid-band on each leg at stations down the finger, and on the cap
const axisRun = legs[0]
const bodyOf = (run) => { const n = run.poly.length; if (H(run.poly[0], tip.p) < 1.5) return run.poly[1]; if (H(run.poly[n - 1], tip.p) < 1.5) return run.poly[n - 2]; return null }
let ax = 0, az = 0, na = 0
for (const l of legs) { const b = bodyOf(l); if (!b) continue; const L = H(b, tip.p) || 1; ax += (b[0] - tip.p[0]) / L; az += (b[1] - tip.p[1]) / L; na++ }
const A = na ? [ax / Math.hypot(ax, az), az / Math.hypot(ax, az)] : [1, 0]
const perp = [-A[1], A[0]]
o(`cap axis (tip→body, averaged over both legs) = (${A[0].toFixed(3)}, ${A[1].toFixed(3)})`)

const whichComp = (p) => { for (let i = 0; i < comps.length; i++) if (inRing(p, comps[i])) return i; return -1 }
o(`\nMID-BAND PROBE — walk down each leg, ask which union component the band's midpoint is in`)
o(`   (offset = that leg's own aBase + cw + total/2; s = metres from the tip along the cap axis)`)
const STEPS = 21, DS = 4
o(`   s →      ${[...Array(STEPS).keys()].map(i => String(i * DS).padStart(4)).join('')}`)
for (const e of E) {
  const sign = (() => { const b = bodyOf(e.run); const off = (b[0] - tip.p[0]) * perp[0] + (b[1] - tip.p[1]) * perp[1]; return Math.sign(off) || 1 })()
  const dmid = e.aBase + CW + e.total / 2
  const row = []
  for (let i = 0; i < STEPS; i++) {
    const s = i * DS
    const p = [tip.p[0] + A[0] * s + perp[0] * sign * dmid, tip.p[1] + A[1] * s + perp[1] * sign * dmid]
    const c = whichComp(p)
    row.push(String(c < 0 ? '·' : c).padStart(4))
  }
  o(`   ${e.run.side.padEnd(5)}    ${row.join('')}`)
}
// the cap itself: sample the semicircle beyond the tip
{
  const row = []
  for (let k = 0; k <= 8; k++) {
    const th = Math.PI * (k / 8)
    const dmid = tip.hw + CW + (tip.tl + tip.sw) / 2
    const dir = [A[0] * -Math.cos(th) + perp[0] * Math.sin(th), A[1] * -Math.cos(th) + perp[1] * Math.sin(th)]
    const p = [tip.p[0] + dir[0] * dmid, tip.p[1] + dir[1] * dmid]
    const c = whichComp(p)
    row.push(String(c < 0 ? '·' : c).padStart(4))
  }
  o(`   CAP arc  ${row.join('')}   (0°=behind the tip … 180°, mid-band at capHW+cw+(tl+sw)/2)`)
}
o(`\n'·' = the band's own midpoint is in NO component — nothing painted there.`)

// ── every OTHER run on the tile: which component does its own band sit in? ──
o(`\nEVERY RUN ON THE TILE — mid-band component at 25%, 50%, 75% along its own polyline`)
for (const run of (st.runs || [])) {
  const aB = edgeDepth(run.baseMeasure, run.side, CW, 'A')
  const c2 = runCustomOf(run)
  const ped2 = resolvePedDepths(run.baseMeasure, run.side, c2)
  const tot = ped2.tl + ped2.sw
  if (aB <= 1e-6 || tot <= 1e-6) { o(`   ${run.skelId.padEnd(22)} ${run.side.padEnd(5)} seg ${String(run.segOrd).padStart(2)}   no band (aBase ${aB.toFixed(2)}, total ${tot.toFixed(2)})`); continue }
  const dmid = aB + CW + tot / 2
  // walk the polyline; the frontage is RIGHT of the run's own travel (tileGround.js:1798-1806)
  const cum = [0]; for (let i = 1; i < run.poly.length; i++) cum[i] = cum[i-1] + H(run.poly[i-1], run.poly[i])
  const L = cum[cum.length - 1]
  const at = (t) => { const s2 = t * L; for (let i = 1; i < run.poly.length; i++) if (cum[i] >= s2 || i === run.poly.length - 1) { const a2 = run.poly[i-1], b2 = run.poly[i], seg = Math.max(1e-9, cum[i]-cum[i-1]), u = (s2-cum[i-1])/seg; const tx = (b2[0]-a2[0])/seg, tz = (b2[1]-a2[1])/seg; return { p: [a2[0]+(b2[0]-a2[0])*u, a2[1]+(b2[1]-a2[1])*u], n: [-tz, tx] } } return null }
  const cells = [0.25, 0.5, 0.75].map(t => { const q = at(t); if (!q) return ' ?'; const pt = [q.p[0] + q.n[0]*dmid, q.p[1] + q.n[1]*dmid]; const ci = whichComp(pt); return ci < 0 ? ' ·' : String(ci).padStart(2) })
  o(`   ${run.skelId.padEnd(22)} ${run.side.padEnd(5)} seg ${String(run.segOrd).padStart(2)}  len ${L.toFixed(0).padStart(4)} m  band ${(aB+CW).toFixed(2)}…${(aB+CW+tot).toFixed(2)}   comps ${cells.join(' ')}`)
}

// ── THE JOINT ITSELF — component geometry within 20 m of the tip, in ring
// order, with the turn at each vertex. A "detached wedge" is a separate
// component or a flap; both are visible here.
o(`\nCOMPONENT GEOMETRY WITHIN 20 m OF THE TIP (ring order; turn = signed degrees)`)
const turn = (a, b, c) => { const u = [b[0]-a[0], b[1]-a[1]], v = [c[0]-b[0], c[1]-b[1]]
  const lu = Math.hypot(u[0],u[1]), lv = Math.hypot(v[0],v[1]); if (!lu || !lv) return 0
  return Math.atan2((u[0]*v[1]-u[1]*v[0])/(lu*lv), (u[0]*v[0]+u[1]*v[1])/(lu*lv)) * 180/Math.PI }
for (let ci = 0; ci < comps.length; ci++) {
  const r = comps[ci], m = r.length
  const near = r.map((p, i) => ({ p, i, d: H(p, tip.p) })).filter(x => x.d < 20)
  if (!near.length) { o(`   comp ${ci} (${area(r).toFixed(0)} m², ${m} verts): no vertex within 20 m of the tip`); continue }
  o(`   comp ${ci} (${area(r).toFixed(0)} m², ${m} verts): ${near.length} vertices within 20 m`)
  let prev = -99
  for (const x of near) {
    if (x.i !== prev + 1) o(`      ─── (ring gap: verts ${prev + 1}…${x.i - 1} are farther than 20 m)`)
    prev = x.i
    const t = turn(r[(x.i - 1 + m) % m], x.p, r[(x.i + 1) % m])
    // signed offset in the (axis, perp) frame of the cap
    const dx = x.p[0] - tip.p[0], dz = x.p[1] - tip.p[1]
    const sAx = dx * A[0] + dz * A[1], sPe = dx * perp[0] + dz * perp[1]
    o(`      v${String(x.i).padStart(4)}  (${x.p[0].toFixed(2)}, ${x.p[1].toFixed(2)})  axis ${sAx.toFixed(2).padStart(7)}  perp ${sPe.toFixed(2).padStart(7)}  |tip| ${x.d.toFixed(2).padStart(5)}  turn ${t.toFixed(0).padStart(5)}°`)
  }
}
