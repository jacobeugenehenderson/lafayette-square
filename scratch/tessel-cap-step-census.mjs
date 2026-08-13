// READ-ONLY, scratch. THE CAP SHOULDER STEP, sized across every LS cap.
//
// Measured at south-18th-street-3: the cap ring is built at ONE half-width —
// `deadEndTips` (tileGround.js:2817) takes `Math.max(left.pavementHW,
// right.pavementHW)` — while each leg's band sits at its OWN aBase. So the leg
// whose authored width equals the max is flush with the cap, and the other leg
// meets it at a step of exactly the difference.
//
// This census asks one thing per cap: what is |left − right| of the two legs'
// authored pavementHW, and does the union ring actually carry a step that size
// at the narrow shoulder?
//
//   node scratch/tessel-cap-step-census.mjs
import fs from 'node:fs'
import clipperLib from 'clipper-lib'
import { sectionPassTile, resolvePedDepths } from '../src/lib/tileGround.js'

const o = console.log
const sh = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8'))
const bc = design.blockCustoms || null
const CW = design.curbWidth ?? 0.381
const H = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
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
const edgeA = (m, side) => Math.max(0, Number.isFinite(m?.[side]?.pavementHW) ? m[side].pavementHW : 0)

let nAsym = 0, nSym = 0, nUnpaired = 0
const rows = []
sh.tiles.forEach((st, ti) => {
  for (const t of (st.roundTips || []).concat(st.bluntTips || [])) {
    if (!t.skelId) continue
    const legs = (st.runs || []).filter(r => r.skelId === t.skelId && r.poly.some(p => H(p, t.p) < 1.5))
    const bySide = new Map()
    for (const r of legs) if (!bySide.has(r.side)) bySide.set(r.side, r)
    if (bySide.size < 2) { nUnpaired++; rows.push({ ti, t, note: `only ${bySide.size} leg(s) of this chain reach the tip — not a paired finger` }); continue }
    const L = bySide.get('left'), R = bySide.get('right')
    const aL = edgeA(L.baseMeasure, 'left'), aR = edgeA(R.baseMeasure, 'right')
    const step = Math.abs(aL - aR)
    const pedL = resolvePedDepths(L.baseMeasure, 'left', bc?.[L.skelId]?.left?.[L.segOrd] || null)
    const pedR = resolvePedDepths(R.baseMeasure, 'right', bc?.[R.skelId]?.right?.[R.segOrd] || null)
    const totL = pedL.tl + pedL.sw, totR = pedR.tl + pedR.sw
    // the union, and whether a ring vertex sits at BOTH the narrow leg's outer
    // band edge and the cap's, near the tip — the step, present in the geometry
    const out = sectionPassTile(st, CW, { outer: 'LU', inner: 'SW' }, bc)
    const comps = unionAll([...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()]).filter(r => r.length >= 3 && area(r) > 0.05)
    const capOuter = t.hw + CW + (t.tl || 0) + (t.sw || 0)
    const narrowOuter = Math.min(aL, aR) + CW + (aL < aR ? totL : totR)
    let hitCap = 0, hitNarrow = 0
    for (const r of comps) for (const p of r) {
      const d = H(p, t.p)
      if (d > 25) continue
      if (Math.abs(d - capOuter) < 0.05) hitCap++
      if (Math.abs(d - narrowOuter) < 0.05) hitNarrow++
    }
    if (step > 0.01) nAsym++; else nSym++
    rows.push({ ti, t, aL, aR, step, totL, totR, capHW: t.hw, capOuter, narrowOuter, hitCap, hitNarrow, comps: comps.length })
  }
})

o(`THE CAP SHOULDER STEP — lafayette-square, authored state (curbWidth ${CW})\n`)
o(`   the cap disk radius is Math.max(left.pavementHW, right.pavementHW)  (tileGround.js:2817)`)
o(`   each leg's band starts at its OWN aBase + curbWidth`)
o(`   ⇒ predicted step at the narrow shoulder = |left − right|\n`)
o('tile skelId                       end    leg aBase L/R      step    capHW   cap band outer   narrow band outer  comps')
for (const r of rows.sort((a, b) => (b.step ?? -1) - (a.step ?? -1))) {
  if (r.note) { o(`${String(r.ti).padStart(4)} ${r.t.skelId.padEnd(28)} ${String(r.t.capEnd).padEnd(5)}  — ${r.note}`); continue }
  o(`${String(r.ti).padStart(4)} ${r.t.skelId.padEnd(28)} ${String(r.t.capEnd).padEnd(5)} ${r.aL.toFixed(2).padStart(6)}/${r.aR.toFixed(2).padEnd(6)} ${r.step.toFixed(3).padStart(7)}  ${r.capHW.toFixed(3).padStart(6)}  ${r.capOuter.toFixed(2).padStart(8)}${r.hitCap ? ' ✓' : ' ·'}      ${r.narrowOuter.toFixed(2).padStart(8)}${r.hitNarrow ? ' ✓' : ' ·'}      ${r.comps}`)
}
o(`\ncaps with a paired finger: ${nAsym + nSym}   ⛔ asymmetric legs (step > 1 cm): ${nAsym}   symmetric: ${nSym}   unpaired: ${nUnpaired}`)
o(`✓ = the union ring actually carries a vertex at that radius from the tip (±5 cm, within 25 m)`)
