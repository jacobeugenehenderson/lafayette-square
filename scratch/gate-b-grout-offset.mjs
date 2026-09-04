#!/usr/bin/env node
/**
 * GATE B of the grout build. READ-ONLY, no src touched.
 *
 * Gate A proved the grout's TOPOLOGY at ε. Gate B gives it the AUTHORED WIDTHS and asks the
 * two questions that can still kill it:
 *   B1. Does the resulting block boundary reproduce the frozen curb (`tile.iA`)?
 *   B2. DOES THE FOLD CLASS SURVIVE? `POLYGON-FIRST D6a` marks the offset NOT robust — ~70% of
 *       crossings at the averaged-normal branch of the chain-side offset. Offsetting a CONTOUR
 *       instead should fail differently: a too-narrow block VANISHES (loud) rather than folding.
 *
 * CONSTRUCTION (Jacob's model, not Clipper's stroke): per chain, walk stations; at each, read the
 * station-local authored half-width PER SIDE out of the tile's own `runs[].measure`; emit the left
 * boundary and the right boundary; close them into one ribbon. Round caps get the RULED bulb
 * (radius (hwL+hwR)/2, centre displaced (hwR-hwL)/2 — bbf4adf6). Union everything.
 * ⛔ right-perp = (-dz,dx), derived from the artifact twice (claims-spur-leg-offset,
 *    claims-inboard-side-convention). ⛔ NO FALLBACK WIDTH: a span with no resolvable width is
 *    counted and reported, never defaulted.
 *
 *   node scratch/gate-b-grout-offset.mjs [scene ...] [--step 0.5]
 */
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { Clipper, ClipperOffset, JoinType, EndType, ClipType, PolyType, PolyFillType, PolyTree } = clipperLib
const args = process.argv.slice(2)
const STEP = args.includes('--step') ? Number(args[args.indexOf('--step') + 1]) : 0.5
const SCENES = args.filter(a => !a.startsWith('--') && !/^[\d.]+$/.test(a)).length
  ? args.filter(a => !a.startsWith('--') && !/^[\d.]+$/.test(a)) : ['lafayette-square', 'hipointe-demun', 'altadena']
const SCALE = 1000, ARC = 0.01 * SCALE
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromC = p => [p.X / SCALE, p.Y / SCALE]
const areaC = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i].X * r[j].Y - r[j].X * r[i].Y } return a / 2 / (SCALE * SCALE) }
const cenC = r => { let a = 0, cx = 0, cy = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; const cr = r[i].X * r[j].Y - r[j].X * r[i].Y; a += cr; cx += (r[i].X + r[j].X) * cr; cy += (r[i].Y + r[j].Y) * cr } a /= 2; return a ? [cx / (6 * a) / SCALE, cy / (6 * a) / SCALE] : fromC(r[0]) }
const inRing = (q, rg) => { let ins = false; for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const xi = rg[i][0], zi = rg[i][1], xj = rg[j][0], zj = rg[j][1]; if ((zi > q[1]) !== (zj > q[1]) && q[0] < (xj - xi) * (q[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const distToRings = (p, rings) => { let b = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length], ex = c[0] - a[0], ez = c[1] - a[1], L2 = ex * ex + ez * ez || 1; let u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u)); b = Math.min(b, Math.hypot(p[0] - (a[0] + ex * u), p[1] - (a[1] + ez * u))) } return b }
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * f)] : NaN }
const o = console.log

o(`GATE B — grout at AUTHORED widths vs the frozen curb.  station step ${STEP} m\n`)
for (const scene of SCENES) {
  const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
  const SHP = `public/baked/${scene}/shape.json`
  if (!fs.existsSync(RIB) || !fs.existsSync(SHP)) { o(`${scene}: missing artifact — SKIPPED LOUDLY\n`); continue }
  const rb = JSON.parse(fs.readFileSync(RIB, 'utf8')), sh = JSON.parse(fs.readFileSync(SHP, 'utf8'))
  const tiles = rb.tiles || []

  // station-local authored half-widths, from the producer's own runs
  const runsBy = new Map()
  for (const t of sh.tiles) for (const r of (t.runs || [])) {
    if (!r.poly?.length) continue
    const hw = r.measure?.[r.side]?.pavementHW
    if (!Number.isFinite(hw)) continue
    const e = runsBy.get(r.skelId) || []; e.push({ side: r.side, hw: +hw, poly: r.poly }); runsBy.set(r.skelId, e)
  }
  // ⭐ The chain's own `measure` is the AUTHORED BASE; a tile's `runs[]` is that base resolved
  // per block (blockCustoms fan out onto runs). So: use the run where one covers the station,
  // else the chain's base. That is reading authoring at a coarser grain, NOT defaulting — and
  // the two cases are counted separately so the report never hides which one it used.
  const baseHw = new Map(rb.streets.map(s2 => [s2.skelId, { left: s2.measure?.left?.pavementHW, right: s2.measure?.right?.pavementHW }]))
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
    for (const side of ['left', 'right']) if (out[side] == null && Number.isFinite(base[side])) { out[side] = +base[side]; out[`_base_${side}`] = true }
    return out
  }
  // degree-1 tips + cap style, for the ruled bulb
  const K = p => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`
  const deg = new Map()
  for (const s of rb.streets) { if (!(s.points?.length >= 2)) continue; for (const p of [s.points[0], s.points.at(-1)]) deg.set(K(p), (deg.get(K(p)) || 0) + 1) }

  const parts = []
  let noWidth = 0, built = 0, fromBase = 0
  for (const s of rb.streets) {
    if (!(s.points?.length >= 2) || s.gradeSeparated) continue
    const pts = s.points
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    const total = cum.at(-1); if (!(total > 0)) continue
    const at = t => { for (let i = 1; i < pts.length; i++) if (cum[i] >= t || i === pts.length - 1) { const a = pts[i - 1], b = pts[i], L = Math.max(1e-9, cum[i] - cum[i - 1]), u = (t - cum[i - 1]) / L; return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] } } return null }
    const Lb = [], Rb = []
    let bad = false, usedBase = false
    for (let t = 0; t <= total; t = Math.min(t + STEP, total)) {
      const st = at(t); if (!st) break
      const h = hwAt(s.skelId, st.p)
      const hl = h.left, hr = h.right
      if (!Number.isFinite(hl) || !Number.isFinite(hr)) { bad = true; break }   // ⛔ never default
      if (h._base_left || h._base_right) usedBase = true
      const R = [-st.t[1], st.t[0]]                                            // right-perp (-dz,dx)
      Lb.push([st.p[0] - R[0] * hl, st.p[1] - R[1] * hl])
      Rb.push([st.p[0] + R[0] * hr, st.p[1] + R[1] * hr])
      if (t >= total) break
    }
    if (bad || Lb.length < 2) { noWidth++; continue }
    if (usedBase) fromBase++
    parts.push([...Lb, ...Rb.reverse()].map(toC)); built++
    // the RULED bulb at a degree-1 tip whose cap style is round
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
  // ── union the parts → THE GROUT
  const cu = new Clipper(); cu.StrictlySimple = true
  for (const p of parts) cu.AddPath(p, PolyType.ptSubject, true)
  const grout = []
  cu.Execute(ClipType.ctUnion, grout, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  // ── stencil, from the artifact
  const cs = new Clipper()
  for (const t of tiles) if (t.ring?.length >= 3) cs.AddPath(t.ring.map(toC), PolyType.ptSubject, true)
  const stencil = []; cs.Execute(ClipType.ctUnion, stencil, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  // ── blocks = stencil − grout
  const cb = new Clipper(); cb.AddPaths(stencil, PolyType.ptSubject, true); cb.AddPaths(grout, PolyType.ptClip, true)
  const tree = new PolyTree(); cb.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const outs = Clipper.PolyTreeToPaths(tree).filter(p => areaC(p) > 0)
  const SLIVER = 1.0
  const blocks = outs.filter(p => Math.abs(areaC(p)) >= SLIVER)

  // ── B1: does each block reproduce the frozen curb?
  const shByCentroid = sh.tiles.filter(t => t.iA?.length)
  const devsLeg = [], devsCorner = [], vanished = []
  const CORNER_R = 12                        // m from an intersection node = "corner zone"
  const nodePts = []
  for (const s2 of rb.streets) { if (!(s2.points?.length >= 2)) continue; for (const p2 of [s2.points[0], s2.points.at(-1)]) if ((deg.get(K(p2)) || 0) >= 2) nodePts.push(p2) }
  let matched = 0
  for (const t of shByCentroid) {
    const iA = t.iA
    // the new block whose centroid sits inside this tile's iA
    let cand = null
    for (const b of blocks) { const c = cenC(b); if (iA.some(r => inRing(c, r))) { cand = b; break } }
    if (!cand) { vanished.push(t); continue }
    matched++
    // ⭐ PER-VERTEX, not per-block max: one bad corner must not condemn a whole block. And
    // split by distance to the nearest INTERSECTION node — the frozen curb is filleted there
    // with the operator's authored R, which this grout does NOT apply (the ruling puts R in the
    // node's handles; Gate B has no handles yet). So a corner miss is EXPECTED and must be
    // reported separately from a LEG miss, which would be a real defect.
    for (const v of cand) {
      const pv = fromC(v)
      const d = distToRings(pv, iA)
      let dn = Infinity
      for (const n of nodePts) { const dd = Math.hypot(pv[0] - n[0], pv[1] - n[1]); if (dd < dn) dn = dd }
      ;(dn < CORNER_R ? devsCorner : devsLeg).push(d)
    }
  }
  // ── B2: fold indicators on the grout itself
  let rep = 0, zero = 0
  for (const p of grout) { if (Math.abs(areaC(p)) < 1e-6) zero++; const seen = new Set(); for (const v of p) { const k2 = `${v.X},${v.Y}`; if (seen.has(k2)) { rep++; break } seen.add(k2) } }
  o(`${scene}`)
  o(`   chains built ${built}   (${fromBase} used the chain's authored base where no run covered a station)   ⛔ no width at all, skipped LOUDLY: ${noWidth}`)
  o(`   grout rings ${grout.length}   blocks ${blocks.length}   frozen tiles ${tiles.length}   tiles with iA ${shByCentroid.length}`)
  o(`   B2 fold indicators on the grout — repeated-vertex rings ${rep}   zero-area rings ${zero}`)
  o(`   B2 frozen iA tiles with NO surviving block (swallowed): ${vanished.length}${vanished.length ? `   e.g. ${vanished.slice(0, 4).map(t => t.producer || '?').join(', ')}` : ''}`)
  const rep2 = (nm, a) => o(`        ${nm.padEnd(22)} n=${String(a.length).padStart(6)}   median ${q(a, .5)?.toFixed(3)} m   p90 ${q(a, .9)?.toFixed(3)} m   within 0.10 m ${(100 * a.filter(d => d < 0.1).length / (a.length || 1)).toFixed(1)}%   within 0.25 m ${(100 * a.filter(d => d < 0.25).length / (a.length || 1)).toFixed(1)}%`)
  o(`   B1 block-boundary vertices vs the frozen iA (${matched} blocks matched):`)
  rep2('LEG (>12 m from a node)', devsLeg)
  rep2('CORNER zone (<12 m)', devsCorner)
  o(`        ⭐ the corner row is EXPECTED to miss — the authored corner R is not applied here.\n`)
}
