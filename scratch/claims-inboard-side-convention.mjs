#!/usr/bin/env node
/**
 * READ-ONLY. Two questions left by claims-side-chain-falsifiers.mjs:
 *
 *  Q1. WHICH SIDE LABEL IS RIGHT? `innerSideSign` (derive.js:3223, writes the persisted
 *      `innerSign`) and `inboardKeyGeom`/`inboardSideOf` (derive.js:3799 == tileGround.js:1246,
 *      BYTE-IDENTICAL duplicates) use the SAME perp (-dz,dx) and map it to OPPOSITE labels.
 *      They disagree on 160/164 chains — deterministic, not noisy.
 *      ⛔ Neither comment can settle it: `innerSideSign` pins its convention to
 *      `tileGround.isMedianFacing` (retired at E2) and `streetProfiles.innerEdgeMeasure`
 *      (deleted 2026-08-13). Its stated authority no longer exists.
 *      ⭐ So ASK THE POLYGON — read production's own `side` labels off `shape.json` runs and
 *      see which geometric side each label actually lands on. That is face adjacency, which is
 *      what the answer was always supposed to come from.
 *
 *  Q2. WHAT ARE THE 5? Inner-edge chains whose inboard ped was NOT zeroed. `innerEdgeAssign`
 *      returns `m` untouched when `!m.left || !m.right`, and only runs for chains in
 *      `dividedPairs` — so an operator-set `anchor:'inner-edge'` with no mate never gets it.
 *
 *   node scratch/claims-inboard-side-convention.mjs [scene ...]
 */
import fs from 'fs'
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointe-demun']
const o = console.log
const mid = p => p[Math.floor(p.length / 2)]

for (const scene of scenes) {
  const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
  const SHP = `public/baked/${scene}/shape.json`
  if (!fs.existsSync(RIB) || !fs.existsSync(SHP)) { o(`\n${scene}: missing artifact — SKIPPED LOUDLY`); continue }
  const rb = JSON.parse(fs.readFileSync(RIB, 'utf8')), sh = JSON.parse(fs.readFileSync(SHP, 'utf8'))
  const byId = new Map(rb.streets.map(s => [s.skelId, s]))
  const runsBy = new Map()
  for (const t of sh.tiles) for (const r of (t.runs || [])) {
    if (!r.poly?.length || !t.ring?.length) continue
    const e = runsBy.get(r.skelId) || []; e.push({ r, ring: t.ring }); runsBy.set(r.skelId, e)
  }
  const inRing = (p, rg) => { let ins = false; for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const xi = rg[i][0], zi = rg[i][1], xj = rg[j][0], zj = rg[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
  const ie = rb.streets.filter(s => s.anchor === 'inner-edge')
  let labelRight = 0, labelLeft = 0, resolved = 0
  const notZeroed = []
  for (const s of ie) {
    const mate = s.pairId ? byId.get(s.pairId) : null
    const pa = s.points
    if (!pa || pa.length < 2) continue
    const i = Math.max(1, Math.floor(pa.length / 2))
    const dx = pa[i][0] - pa[i - 1][0], dz = pa[i][1] - pa[i - 1][1], L = Math.hypot(dx, dz) || 1
    const perp = [-dz / L, dx / L]                       // the perp BOTH functions use
    const cm = pa[i]
    // ⭐ Q1: learn production's label→geometry mapping from the ARTIFACT, never from a comment.
    // ⛔ `run.poly` LIES ON THE CHAIN — it is a span of the tile RING (the centerline graph
    // face), not an offset edge. So the frozen run carries NO side geometry, and any probe that
    // measures the poly's offset from the chain returns nothing. ⭐ That absence is itself the
    // finding, and it is POLYGON-FIRST Check 3 in the artifact: `side` is a LABEL with no
    // geometry behind it, which is exactly what the grout would give it.
    // ⇒ Resolve the side from the TILE INTERIOR instead: step off the run's midpoint both ways
    // and ask which side is inside the tile ring.
    for (const { r, ring } of (runsBy.get(s.skelId) || [])) {
      const rm = mid(r.poly)
      let bd = Infinity, bt = null
      for (let k = 1; k < pa.length; k++) {
        const a2 = pa[k - 1], b2 = pa[k]
        const ex = b2[0] - a2[0], ez = b2[1] - a2[1], L2 = ex * ex + ez * ez || 1
        let u = ((rm[0] - a2[0]) * ex + (rm[1] - a2[1]) * ez) / L2; u = Math.max(0, Math.min(1, u))
        const dd = Math.hypot(rm[0] - (a2[0] + ex * u), rm[1] - (a2[1] + ez * u))
        if (dd < bd) { bd = dd; const LL = Math.hypot(ex, ez) || 1; bt = [ex / LL, ez / LL] }
      }
      if (!bt) continue
      const lp = [-bt[1], bt[0]]                        // the SAME (-dz,dx) perp, at this station
      const EPSD = 0.5
      const pPos = [rm[0] + lp[0] * EPSD, rm[1] + lp[1] * EPSD]
      const pNeg = [rm[0] - lp[0] * EPSD, rm[1] - lp[1] * EPSD]
      const inPos = inRing(pPos, ring), inNeg = inRing(pNeg, ring)
      if (inPos === inNeg) continue                     // ambiguous — no information
      resolved++
      const tileOnPerpSide = inPos
      if (r.side === 'right') { tileOnPerpSide ? labelRight++ : labelLeft++ }
      else                    { tileOnPerpSide ? labelLeft++  : labelRight++ }
    }
    // Q2: which inner-edge chains escaped the assign, and why
    const geomInb = ((-dz / L) * ((mate ? mid(mate.points) : cm)[0] - cm[0]) + (dx / L) * ((mate ? mid(mate.points) : cm)[1] - cm[1]) > 0) ? 'left' : 'right'
    const inb = s.measure?.[geomInb]
    if (inb && ((inb.treelawn || 0) > 0 || (inb.sidewalk || 0) > 0))
      notZeroed.push({ id: s.skelId, pairId: s.pairId || null, mate: !!mate,
                       hasBoth: !!(s.measure?.left && s.measure?.right), innerSign: s.innerSign,
                       tl: inb.treelawn, sw: inb.sidewalk })
  }
  o(`\n${scene}: ${ie.length} inner-edge chains`)
  o(`   Q1 — production's own \`side\` labels, read off shape.json runs (${resolved} informative runs):`)
  o(`        label 'right' lands on the (-dz,dx) perp side : ${labelRight}`)
  o(`        label 'right' lands on the OPPOSITE side      : ${labelLeft}`)
  const N = labelRight + labelLeft
  if (N < 20 || Math.abs(labelRight - labelLeft) / N < 0.9) {
    o(`        ⛔ REFUSING TO RULE — n=${N}, split ${labelRight}/${labelLeft}. A convention is all-or-nothing;`)
    o(`           anything less is the instrument, not the data. (Rule 2: refuse rather than print a clean-looking zero.)`)
  } else {
  const verdict = labelRight > labelLeft
    ? `(-dz,dx) IS the measure-RIGHT perp  =>  innerSideSign's mapping (+1 -> 'right') is CORRECT and inboardKeyGeom/inboardSideOf are INVERTED`
    : `(-dz,dx) is the measure-LEFT perp   =>  inboardKeyGeom/inboardSideOf are CORRECT and innerSideSign's pinned convention is INVERTED`
  o(`        ⇒ ${verdict}`)
  }
  // ⭐⭐ THE DECISIVE TEST — no labels at all: is the ped zeroed on the side the MATE is on?
  // Intent (tileGround.js:1222): "the median-facing side keeps pavement but drops curb/
  // treelawn/sidewalk, so the thin tile between the two carriageways floods to a bare median."
  const PERP_IS_RIGHT = labelRight > labelLeft
  let onMate = 0, onOther = 0, amb = 0
  for (const s2 of ie) {
    const mate = s2.pairId ? byId.get(s2.pairId) : null
    const pa2 = s2.points
    if (!mate?.points || !pa2 || pa2.length < 2) continue
    const i2 = Math.max(1, Math.floor(pa2.length / 2))
    const dx2 = pa2[i2][0] - pa2[i2 - 1][0], dz2 = pa2[i2][1] - pa2[i2 - 1][1], L3 = Math.hypot(dx2, dz2) || 1
    const cm2 = pa2[i2], cb2 = mid(mate.points)
    const dot2 = (-dz2 / L3) * (cb2[0] - cm2[0]) + (dx2 / L3) * (cb2[1] - cm2[1])
    const mateKey = PERP_IS_RIGHT ? (dot2 > 0 ? 'right' : 'left') : (dot2 > 0 ? 'left' : 'right')
    const other = mateKey === 'left' ? 'right' : 'left'
    const z = k => { const m = s2.measure?.[k]; return m && (m.treelawn || 0) === 0 && (m.sidewalk || 0) === 0 }
    if (z(mateKey) && !z(other)) onMate++
    else if (z(other) && !z(mateKey)) onOther++
    else amb++
  }
  o(`   ⭐ DECISIVE (label-free) — ped zeroed on the MATE-FACING side: ${onMate}   ⛔ on the OTHER side: ${onOther}   ambiguous: ${amb}`)
  o(`   Q2 — inner-edge chains whose inboard ped was NOT zeroed: ${notZeroed.length}`)
  for (const r of notZeroed)
    o(`        ${r.id.padEnd(26)} pairId=${String(r.pairId).padEnd(24)} mateResolved=${r.mate}  measure has both sides=${r.hasBoth}  innerSign=${r.innerSign}  tl=${r.tl} sw=${r.sw}`)
}
