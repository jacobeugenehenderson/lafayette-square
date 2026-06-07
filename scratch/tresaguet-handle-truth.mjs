// The handle-truth comparator. For each marked chain/side: build the HANDLE
// curb polyline (centerline ⊕ per-fe authored pavementHW — blockCustoms over
// chain base, the exact feWidthAt resolution) and measure (a) mark→handle
// residual (should be small if handles are truth), (b) production block
// ring→handle residual sampled along the marked stretch (the drawing error).
import { R, design, build, markPts } from './tresaguet-setup.mjs'

// fe segmentation: interior IX vertices (vertices shared with ≥1 other curbed
// chain or chain-end) — mirrors resolveChainSegmentation closely enough for
// these chains (their THROUGH vertices at junction nodes).
const curbed = R.streets.filter(s => !s.gradeSeparated && !s.disabled)
const vKeyN = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)
const nodeCount = new Map()
for (const s of curbed) for (const [i, p] of s.points.entries()) {
  const k = vKeyN(p)
  nodeCount.set(k, (nodeCount.get(k) || 0) + 1)
}
const ixIdxsOf = (s) => {
  const out = []
  for (let i = 1; i < s.points.length - 1; i++) if (nodeCount.get(vKeyN(s.points[i])) > 1) out.push(i)
  return out
}
const bc = design.blockCustoms || {}
const feW = (s, side, segOrd) => {
  const base = Math.max(0, s.measure?.[side]?.pavementHW || 0)
  const c = bc[s.skelId]?.[side]?.[segOrd]
  return (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
}
// handle curb polyline per (chain, side): per-segment offset at per-fe width
const handleCurb = (s, side) => {
  const ix = ixIdxsOf(s)
  const segs = []
  let segOrd = 0, lo = 0
  for (const b of [...ix, s.points.length - 1]) {
    const pts = s.points.slice(lo, b + 1)
    const w = feW(s, side, segOrd)
    const off = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)]
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz) || 1
      const nh = side === 'right' ? [-dz / L, dx / L] : [dz / L, -dx / L]
      off.push([pts[i][0] + nh[0] * w, pts[i][1] + nh[1] * w])
    }
    segs.push({ segOrd, w, off })
    lo = b; segOrd++
  }
  return segs
}
const dSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t))
}
const dPoly = (p, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, dSeg(p, pts[i], pts[i + 1])); return d }

const g = build()
const blocks = g.block || []
const CASES = [
  { mark: 1, chain: 'lafayette-avenue-3', side: 'left' },
  { mark: 2, chain: 'missouri-avenue-2', side: 'left' },
  { mark: 2, chain: 'missouri-avenue-2', side: 'right' },
  { mark: 0, chain: 'mississippi-avenue', side: 'left' },
  { mark: 0, chain: 'mississippi-avenue', side: 'right' },
  { mark: 5, chain: 'mackay-place-0', side: 'left' },
  { mark: 5, chain: 'mackay-place-0', side: 'right' },
  { mark: 6, chain: 'park-avenue-4', side: 'right' },
]
for (const C of CASES) {
  const s = R.streets.find(x => x.skelId === C.chain)
  const segs = handleCurb(s, C.side)
  const mk = markPts[C.mark]
  // mark→handle residual: distance from each mark pt to the handle curb
  const hc = segs.flatMap(sg => sg.off)
  const mres = mk.map(p => dPoly(p, hc)).sort((a, b) => a - b)
  // production→handle: densify the handle curb at 1m, keep samples near the
  // mark (<6m), measure to nearest block boundary
  const dense = []
  for (const sg of segs) for (let i = 0; i < sg.off.length - 1; i++) {
    const a = sg.off[i], b = sg.off[i + 1]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(L))
    for (let k = 0; k < n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])
  }
  const pres = []
  let worst = null
  for (const p of dense) {
    if (dPoly(p, mk) > 6) continue
    let d = 1e9
    for (const r of blocks) for (let i = 0; i < r.length; i++) d = Math.min(d, dSeg(p, r[i], r[(i + 1) % r.length]))
    pres.push(d)
    if (!worst || d > worst.d) worst = { d, p }
  }
  if (worst) console.log(`   worst @(${worst.p[0].toFixed(1)},${worst.p[1].toFixed(1)})`)
  pres.sort((a, b) => a - b)
  const q = (arr, f) => arr.length ? arr[Math.floor(arr.length * f)].toFixed(2) : '-'
  console.log(`mark#${C.mark} ${C.chain}/${C.side} segW=[${segs.map(sg => sg.w.toFixed(2)).join(',')}]`)
  console.log(`   mark→handle  med=${q(mres, 0.5)} p90=${q(mres, 0.9)} max=${mres.length ? mres[mres.length - 1].toFixed(2) : '-'}`)
  console.log(`   block→handle (near mark, ${pres.length} samples) med=${q(pres, 0.5)} p90=${q(pres, 0.9)} max=${pres.length ? pres[pres.length - 1].toFixed(2) : '-'}`)
}
