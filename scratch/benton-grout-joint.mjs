#!/usr/bin/env node
/**
 * ONE QUESTION, READ-ONLY: at Benton Place's loop joint, does the GROUT contour have the
 * wedge that the frozen chain-side curb has?
 *
 * Construction is Gate B's, verbatim in shape (scratch/gate-b-grout-offset.mjs): per chain,
 * walk stations, read the station-local authored half-width per side out of the tile's own
 * runs, emit both boundaries, close into a ribbon, union everything -> the grout. Blocks =
 * stencil - grout. Then: dump the turn angle at every block-boundary vertex near the joint
 * and compare against the frozen iA's own turn angles at the same place.
 *
 * ⛔ NO FALLBACK WIDTH — a span with no resolvable width is counted and reported.
 *   node scratch/benton-grout-joint.mjs [--node x,z] [--radius m] [--step m]
 */
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { Clipper, ClipType, PolyType, PolyFillType, PolyTree } = clipperLib
const args = process.argv.slice(2)
const argOf = (f, d) => args.includes(f) ? args[args.indexOf(f) + 1] : d
const NODE = argOf('--node', '58.69,-233.97').split(',').map(Number)
const RAD = Number(argOf('--radius', 30))
const STEP = Number(argOf('--step', 0.5))
const SCALE = 1000
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromC = p => [p.X / SCALE, p.Y / SCALE]
const areaC = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i].X * r[j].Y - r[j].X * r[i].Y } return a / 2 / (SCALE * SCALE) }

const rb = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const sh = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))

// ── station-local authored half-widths, from the producer's own runs (Gate B)
const runsBy = new Map()
for (const t of sh.tiles) for (const r of (t.runs || [])) {
  if (!r.poly?.length) continue
  const hw = r.measure?.[r.side]?.pavementHW
  if (!Number.isFinite(hw)) continue
  const e = runsBy.get(r.skelId) || []; e.push({ side: r.side, hw: +hw, poly: r.poly }); runsBy.set(r.skelId, e)
}
const baseHw = new Map(rb.streets.map(s => [s.skelId, { left: s.measure?.left?.pavementHW, right: s.measure?.right?.pavementHW }]))
const hwAt = (skelId, p) => {
  const out = {}
  for (const r of (runsBy.get(skelId) || [])) {
    let best = Infinity
    for (let i = 0; i < r.poly.length - 1; i++) {
      const a = r.poly[i], b = r.poly[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1
      let u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u))
      best = Math.min(best, Math.hypot(p[0] - (a[0] + ex * u), p[1] - (a[1] + ez * u)))
    }
    if (best < 1.0 && (out[r.side] == null || best < out[`_d${r.side}`])) { out[r.side] = r.hw; out[`_d${r.side}`] = best }
  }
  const base = baseHw.get(skelId) || {}
  for (const side of ['left', 'right']) if (out[side] == null && Number.isFinite(base[side])) out[side] = +base[side]
  return out
}
const K = p => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`
const deg = new Map()
for (const s of rb.streets) { if (!(s.points?.length >= 2)) continue; for (const p of [s.points[0], s.points.at(-1)]) deg.set(K(p), (deg.get(K(p)) || 0) + 1) }

const parts = []; let noWidth = 0
for (const s of rb.streets) {
  if (!(s.points?.length >= 2) || s.gradeSeparated) continue
  const pts = s.points
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  const total = cum.at(-1); if (!(total > 0)) continue
  const at = t => { for (let i = 1; i < pts.length; i++) if (cum[i] >= t || i === pts.length - 1) { const a = pts[i - 1], b = pts[i], L = Math.max(1e-9, cum[i] - cum[i - 1]), u = (t - cum[i - 1]) / L; return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] } } return null }
  const Lb = [], Rb = []; let bad = false
  for (let t = 0; t <= total; t = Math.min(t + STEP, total)) {
    const st = at(t); if (!st) break
    const h = hwAt(s.skelId, st.p)
    if (!Number.isFinite(h.left) || !Number.isFinite(h.right)) { bad = true; break }
    const R = [-st.t[1], st.t[0]]
    Lb.push([st.p[0] - R[0] * h.left, st.p[1] - R[1] * h.left])
    Rb.push([st.p[0] + R[0] * h.right, st.p[1] + R[1] * h.right])
    if (t >= total) break
  }
  if (bad || Lb.length < 2) { noWidth++; continue }
  parts.push([...Lb, ...Rb.reverse()].map(toC))
  for (const [k, idx] of [['start', 0], ['end', pts.length - 1]]) {
    if (deg.get(K(pts[idx])) !== 1) continue
    const authored = s.capEnds?.[k] || (k === 'start' ? s.capStart : s.capEnd)
    const style = (authored && authored !== 'none') ? authored : (s.caps?.[k]?.cap || 'round')
    if (style !== 'round') continue
    const h = hwAt(s.skelId, pts[idx]); if (!Number.isFinite(h.left) || !Number.isFinite(h.right)) continue
    const nb = pts[idx === 0 ? 1 : pts.length - 2]
    const dx = (idx === 0 ? nb[0] - pts[idx][0] : pts[idx][0] - nb[0]), dz = (idx === 0 ? nb[1] - pts[idx][1] : pts[idx][1] - nb[1])
    const L = Math.hypot(dx, dz) || 1, R = [-dz / L, dx / L]
    const rr = (h.left + h.right) / 2, disp = (h.right - h.left) / 2
    const c = [pts[idx][0] + R[0] * disp, pts[idx][1] + R[1] * disp]
    const circ = []; for (let a = 0; a < 64; a++) circ.push(toC([c[0] + rr * Math.cos(a * Math.PI / 32), c[1] + rr * Math.sin(a * Math.PI / 32)]))
    parts.push(circ)
  }
}
const cu = new Clipper(); cu.StrictlySimple = true
for (const p of parts) cu.AddPath(p, PolyType.ptSubject, true)
const grout = []; cu.Execute(ClipType.ctUnion, grout, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const cs = new Clipper()
for (const t of (rb.tiles || [])) if (t.ring?.length >= 3) cs.AddPath(t.ring.map(toC), PolyType.ptSubject, true)
const stencil = []; cs.Execute(ClipType.ctUnion, stencil, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const cb = new Clipper(); cb.AddPaths(stencil, PolyType.ptSubject, true); cb.AddPaths(grout, PolyType.ptClip, true)
const tree = new PolyTree(); cb.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const blocks = Clipper.PolyTreeToPaths(tree).filter(p => Math.abs(areaC(p)) >= 1.0)

// ── the one question: turn angles near the joint
const turnDeg = (a, b, c) => {
  const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]]
  const l1 = Math.hypot(...v1) || 1, l2 = Math.hypot(...v2) || 1
  const cs2 = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))
  return Math.acos(cs2) * 180 / Math.PI                        // 0 = straight, 180 = reversal
}
const scan = (rings, label, minLeg) => {
  let n = 0, worst = [], legsSkipped = 0
  for (const r of rings) {
    const m = r.length
    for (let i = 0; i < m; i++) {
      const p = r[i]
      if (Math.hypot(p[0] - NODE[0], p[1] - NODE[1]) > RAD) continue
      n++
      const a = r[(i - 1 + m) % m], c = r[(i + 1) % m]
      if (Math.hypot(p[0] - a[0], p[1] - a[1]) < minLeg || Math.hypot(c[0] - p[0], c[1] - p[1]) < minLeg) { legsSkipped++; continue }
      worst.push({ t: turnDeg(a, p, c), p })
    }
  }
  worst.sort((x, y) => y.t - x.t)
  console.log(`\n${label}`)
  console.log(`   vertices within ${RAD} m of the joint: ${n}   (${legsSkipped} skipped: leg < ${minLeg} m, quantization residue)`)
  console.log(`   sharpest turns (180 deg = the contour doubles back on itself):`)
  for (const w of worst.slice(0, 6)) console.log(`      turn ${w.t.toFixed(1).padStart(6)} deg  at (${w.p[0].toFixed(2)}, ${w.p[1].toFixed(2)})`)
  const spikes = worst.filter(w => w.t > 120)
  console.log(`   turns over 120 deg (a wedge, not a corner): ${spikes.length}`)
  return spikes.length
}
console.log(`BENTON JOINT — grout contour vs frozen curb.   node (${NODE}), radius ${RAD} m, step ${STEP} m`)
console.log(`grout rings ${grout.length}   blocks ${blocks.length}   chains with no resolvable width, skipped LOUDLY: ${noWidth}`)
const gSpikes = scan(blocks.map(b => b.map(fromC)), 'GROUT-derived block boundary (the new subject)', 0.05)
const iaRings = []
for (const t of sh.tiles) for (const r of (t.iA || [])) iaRings.push(r)
const fSpikes = scan(iaRings, 'FROZEN iA — the chain-side curb on screen today', 0.05)
console.log(`\nVERDICT  grout wedges ${gSpikes}   frozen wedges ${fSpikes}`)

// ── how far does each curb STRAY from the road it belongs to?
const cents = []
for (const s of rb.streets) { if (!(s.points?.length >= 2)) continue; for (let i = 0; i < s.points.length - 1; i++) cents.push([s.points[i], s.points[i + 1]]) }
const dCent = p => { let b = Infinity; for (const [a, c] of cents) { const ex = c[0] - a[0], ez = c[1] - a[1], L2 = ex * ex + ez * ez || 1; let u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u)); b = Math.min(b, Math.hypot(p[0] - (a[0] + ex * u), p[1] - (a[1] + ez * u))) } return b }
const stray = (rings, label) => {
  const ds = []
  for (const r of rings) for (const p of r) if (Math.hypot(p[0] - NODE[0], p[1] - NODE[1]) <= RAD) ds.push(dCent(p))
  ds.sort((a, b) => a - b)
  console.log(`   ${label.padEnd(34)} n=${String(ds.length).padStart(4)}  median ${ds[Math.floor(ds.length * .5)].toFixed(2)} m   p95 ${ds[Math.floor(ds.length * .95)].toFixed(2)} m   MAX ${ds.at(-1).toFixed(2)} m`)
}
console.log(`\nDISTANCE FROM THE NEAREST STREET CENTRELINE, within ${RAD} m of the joint`)
console.log(`   (Benton's authored half-widths here: stem 2.71 m, loop body 3.96 m — so a correct curb should sit near those)`)
stray(blocks.map(b => b.map(fromC)), 'GROUT block boundary')
stray(iaRings.filter(r => r.some(p => Math.hypot(p[0] - NODE[0], p[1] - NODE[1]) <= RAD)), 'FROZEN iA (on screen today)')

// ── distribution, not just quantiles: which half-widths actually appear?
const hist = (rings, label) => {
  const m = new Map()
  for (const r of rings) for (const p of r) if (Math.hypot(p[0] - NODE[0], p[1] - NODE[1]) <= RAD) {
    const k = dCent(p).toFixed(2); m.set(k, (m.get(k) || 0) + 1)
  }
  const rows = [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
  console.log(`   ${label}: ${rows.map(([k, v]) => `${k}m x${v}`).join('  ')}`)
}
console.log(`\nWHICH DISTANCES ACTUALLY APPEAR (should show BOTH 2.71 stem and 3.96 loop):`)
hist(blocks.map(b => b.map(fromC)), 'GROUT')
hist(iaRings.filter(r => r.some(p => Math.hypot(p[0] - NODE[0], p[1] - NODE[1]) <= RAD)), 'FROZEN')
