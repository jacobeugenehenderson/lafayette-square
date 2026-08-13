// READ-ONLY. THE CAP SHOULDER STEP — the CLASS GATE, per scene.
//
// ⭐ It answers for a town nobody has looked at: it reads each scene's own
// authored widths out of its own baked shape.json and asks whether the bulb
// discards one of them. Nothing here is LS-specific and nothing is a constant.
//
// Measured at south-18th-street-3: the cap ring is built at ONE half-width —
// `deadEndTips` (tileGround.js:2817) takes `Math.max(left.pavementHW,
// right.pavementHW)` — while each leg's band sits at its OWN aBase. So the leg
// whose authored width equals the max is flush with the cap, and the other leg
// meets it at a step of exactly the difference.
//
// ✅ FIXED 2026-08-12: the bulb is now a symmetric circle on the road's REAL
// centreline — radius (left+right)/2, centre displaced (right−left)/2 toward
// the wider side — so it is tangent to BOTH legs and neither shoulder steps.
// This census is the gate that keeps it that way: it reports the step each cap
// WOULD have carried under the old `Math.max`, and RED means a cap's frozen
// radius still equals that max on an asymmetric pair (⇒ a stale artifact, or
// the rule regressed).
//
//   node scratch/tessel-cap-step-census.mjs [scene]        (default all scenes)
import fs from 'node:fs'
import clipperLib from 'clipper-lib'
import { sectionPassTile, resolvePedDepths } from '../src/lib/tileGround.js'

const o = console.log
const SCENES = process.argv[2] ? [process.argv[2]]
  : fs.readdirSync('public/baked').filter(d => fs.existsSync(`public/baked/${d}/shape.json`))
let anyRed = false
for (const scene of SCENES) {
const sh = JSON.parse(fs.readFileSync(`public/baked/${scene}/shape.json`, 'utf8'))
const design = (() => { try { return JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8')) } catch { return {} } })()
const bc = design.blockCustoms || null
const CW = design.curbWidth ?? 0.1524
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
const TILES = Array.isArray(sh) ? sh : (sh.tiles || [])
TILES.forEach((st, ti) => {
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

o(`\n══ ${scene}   (curbWidth ${CW}, ${bc ? Object.keys(bc).length + ' authored blockCustoms entries' : '⛔ NO blockCustoms — measuring an unauthored map'})`)
if (!TILES.length) { o('   ⚠️ shape.json carries no tiles — NOT MEASURED'); continue }
if (!rows.length) { o('   no round caps in this scene'); continue }
const asym = rows.filter(r => !r.note && r.step > 0.01)
// RED: an asymmetric cap whose frozen radius still equals the old Math.max.
const stale = asym.filter(r => Math.abs(r.capHW - Math.max(r.aL, r.aR)) < 1e-9)
o(`   caps ${rows.length}   asymmetric legs ${asym.length}   ⛔ still built at Math.max (stale artifact or regression) ${stale.length}`)
if (asym.length) {
  o(`   worst asymmetry: ${asym.sort((a,b)=>b.step-a.step)[0].t.skelId} ${asym[0].step.toFixed(3)} m  (${asym[0].aL.toFixed(2)} / ${asym[0].aR.toFixed(2)})`)
  o(`   cap                                  legs L/R        radius   expected (L+R)/2   step it would carry`)
  for (const r of asym.slice(0, 10)) {
    const want = (r.aL + r.aR) / 2
    const bad = Math.abs(r.capHW - want) > 1e-9
    o(`   ${(r.t.skelId + '|' + r.t.capEnd).padEnd(34)} ${r.aL.toFixed(2).padStart(5)}/${r.aR.toFixed(2).padEnd(5)} ${r.capHW.toFixed(3).padStart(9)} ${want.toFixed(3).padStart(15)}   ${r.step.toFixed(3).padStart(8)}${bad ? '  ⛔' : '  ✅'}`)
  }
}
if (stale.length) anyRed = true
}
o(`\n${anyRed ? '⛔ RED — at least one scene\'s shape.json still carries a Math.max bulb on an asymmetric cap. Re-freeze it (Survey in → Survey out).' : '✅ GREEN — no scene carries a Math.max bulb on an asymmetric cap.'}`)
o(`⭐ A scene with 0 asymmetric caps proves nothing about the rule — it just has no instances.`)
process.exit(anyRed ? 1 : 0)
