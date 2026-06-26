// PHASE 1 (C) — the decisive check, mirroring tileGround.js's EXACT corner gate.
// Replicates: cornerT keying (by vertex tipKey), the nearest-fillet pairing, and
// the bent-sector pad GATE at line 1124 (bestD <= best.r + c.trim + 1). If, after
// splicing the two mouth run-ends to the two fillet apexes, BOTH mouth corners
// produce a distinct cornerT key that passes the sector gate (and each pairs with
// a DIFFERENT fillet), the FILL builds a bent sector at EACH → the cream wraps both.
// Compared against (a) base (collapsed) and (b) the prior FAILED 0.5m-nudge.
import fs from 'fs'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const tiles = shape.tiles
const D = (x) => +x.toFixed(3)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)

// The gate as in tileGround.js:1122-1124 — pair the corner with the nearest
// fillet apex; a corner builds a bent sector iff bestD <= best.r + c.trim + 1.
// (c.trim is the tangentTrim; for the mouth corners after splice it is ~the
//  fillet tangent projection — small. We test with trim=0, the strictest case.)
function nearestFillet(p, fillets) {
  let best = null, bestD = Infinity
  for (const f of fillets) { const d = dist(f.apex, p); if (d < bestD) { bestD = d; best = f } }
  return { best, bestD }
}

function analyze(tileIdx, skel, label, mover) {
  const t = JSON.parse(JSON.stringify(tiles[tileIdx]))
  const fillets = t.fillets || []
  // find mouth node + the two mouth fillets (nearest two, generous gate)
  const runs = t.runs.filter(r => r.skelId === skel)
  // mouth = the run-end shared by both sides that is NOT the dead-end tip
  const tips = new Set((t.roundTips || []).concat(t.bluntTips || []).map(x => tipKey(x.p)))
  let mouth = null
  const allEnds = new Map()
  for (const r of t.runs) for (const p of [r.poly[0], r.poly[r.poly.length - 1]]) {
    const k = tipKey(p); allEnds.set(k, (allEnds.get(k) || new Set())); allEnds.get(k).add(r.skelId)
  }
  for (const r of runs) for (const p of [r.poly[0], r.poly[r.poly.length - 1]]) {
    const k = tipKey(p); if (!tips.has(k) && allEnds.get(k).size >= 2) mouth = p
  }
  if (!mouth) { console.log(`  [${label}] no mouth found`); return }
  const fl = fillets.map(f => ({ f, d: dist(f.apex, mouth) })).sort((a, b) => a.d - b.d).slice(0, 2)
  const a1 = fl[0].f.apex, a2 = fl[1].f.apex

  // mover: transforms the run-ends sitting on the mouth → returns the moved coords
  mover(t.runs, mouth, a1, a2)

  // Build cornerT keys exactly as the FILL does (by tipKey of run-ends), then test
  // the sector gate for each distinct key near the mouth.
  const cornerKeys = new Map()  // tipKey -> point
  for (const r of t.runs) {
    for (const p of [r.poly[0], r.poly[r.poly.length - 1]]) {
      // skip dead-end tips and through-continuations (same skel/side >=2) — they bid no corner
      const k = tipKey(p)
      if (tips.has(k)) continue
      cornerKeys.set(k, p)
    }
  }
  // restrict to keys within 12m of the mouth
  const mouthKeys = [...cornerKeys.values()].filter(p => dist(p, mouth) < 12)
  console.log(`  [${label}] distinct corner keys near mouth: ${mouthKeys.length}`)
  let sectors = 0; const used = new Set()
  for (const p of mouthKeys) {
    const { best, bestD } = nearestFillet(p, fillets)
    const trim = 0
    const pass = best && bestD <= best.r + trim + 1
    const apexK = best ? tipKey(best.apex) : 'none'
    const distinctFillet = pass && !used.has(apexK)
    if (pass) used.add(apexK)
    console.log(`     corner ${p.map(D)} -> nearest fillet apex ${best?.apex.map(D)} d=${D(bestD)} r=${D(best?.r)} GATE(d<=r+1): ${pass ? 'PASS' : 'fail'}${pass ? (distinctFillet ? ' [distinct fillet]' : ' [SAME fillet as another corner!]') : ''}`)
    if (distinctFillet) sectors++
  }
  console.log(`     => bent sectors that build at DISTINCT fillets: ${sectors}  ${sectors >= 2 ? '✅ WRAPS BOTH' : '❌ does not wrap both'}`)
}

const near = (p, m) => dist(p, m) < 0.01
const moveToApex = (runs, mouth, a1, a2) => {
  for (const r of runs) {
    const last = r.poly.length - 1
    for (const idx of [0, last]) {
      if (!near(r.poly[idx], mouth)) continue
      const inner = r.poly[idx === 0 ? 1 : last - 1]
      const pick = dist(inner, a1) <= dist(inner, a2) ? a1 : a2
      r.poly[idx] = [pick[0], pick[1]]
    }
  }
}
const noMove = () => {}
const nudge05 = (runs, mouth, a1, a2) => {   // the prior FAILED attempt: 0.5m toward fillets
  const dir = (f) => { const dx = f[0] - mouth[0], dy = f[1] - mouth[1]; const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] }
  for (const r of runs) {
    const last = r.poly.length - 1
    for (const idx of [0, last]) {
      if (!near(r.poly[idx], mouth)) continue
      const inner = r.poly[idx === 0 ? 1 : last - 1]
      const pick = dist(inner, a1) <= dist(inner, a2) ? a1 : a2
      const d = dir(pick)
      r.poly[idx] = [mouth[0] + d[0] * 0.5, mouth[1] + d[1] * 0.5]
    }
  }
}

for (const [ti, sk] of [[53, 'albion-place'], [53, 'whittemore-place']]) {
  console.log(`\n=== tile[${ti}] ${sk} ===`)
  analyze(ti, sk, 'BASE (collapsed)', noMove)
  analyze(ti, sk, 'PRIOR 0.5m nudge', nudge05)
  analyze(ti, sk, 'SPLICE→fillet apexes', moveToApex)
}
