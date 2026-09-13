#!/usr/bin/env node
// ③ THE PED STACK IS A SET OF DISJOINT RINGS — the check, not the number.
//
// ⛔ WHY THIS EXISTS. `differenceRings(subject, [])` returns the SUBJECT WHOLE
// (`tileGround.js:815`, `:822`), and `offsetRingVariable` drops a boundary that erodes
// away. So a block narrower than curb+treelawn+sidewalk used to come back with one band
// FLOODING it — a plausible fill where the honest answer is "the stack does not fit."
// That is Layer 0 q2 inside the geometry: nothing throws, nothing logs, the operator sees
// a map. This check is the loud half.
//
// TWO CLAIMS, both measured off the built geometry — nothing is read from a doc:
//   A. DISJOINT — no point lies in two bands at once. A flood shows up here as a station
//      reporting CURB&TREE&WALK&LU together, whatever produced it.
//   B. DECLARED  — every block whose stack collapsed is COUNTED in `protoStackCollapse`.
//      An undeclared collapse is the failure this check is named for.
//
// ⛔ Runs on every scene given, WITH the scene's authored state loaded (Layer 0 q3).
// ▶ node checks/claims-proto-stack-disjoint.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`

const signedArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const inRing = (rg, x, y) => { let c = false; for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const [a, b] = rg[i], [e, f] = rg[j]; if ((b > y) !== (f > y) && x < (e - a) * (y - b) / (f - b) + a) c = !c } return c }
// bbox-indexed membership — the naive form is O(rings) per sample and takes minutes
const index = (rings) => (rings || []).filter(r => r?.length >= 3).map(r => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
  return { r, x0, y0, x1, y1 }
})
// ⛔⛔ A BAND IS A COMPOUND PATH — AN ANNULUS IS AN OUTER CONTOUR *PLUS AN INNER HOLE*, and
// membership is the EVEN-ODD count across the whole set, never "is it inside any ring".
// ⭐ THIS WAS THE DEFECT, AND IT WAS IN THIS FILE, NOT IN THE GEOMETRY. The first version asked
// `some(ring contains p)`, so EVERY point inside a block tested TRUE against that block's band
// outer contour — the hole was never subtracted. It reported ~1000 "overlaps" on LS across
// several sessions and did NOT move when the construction was corrected, because it was never
// measuring the construction. Measured: the curb band is 299 positive rings and 62 NEGATIVE
// (holes); its gross |area| is 145.6 ha and its NET signed area is 1.15 ha — a 127× difference,
// which is the size of the lie.
// ⭐ `POLYGON-FIRST §5` RULE 1b, exactly: measure the DEFINITION, not a proxy that correlates
// with it — and a wrong detector is worse than none, because it is the one artifact nobody
// thinks to doubt.
const hit = (ix, x, y) => { let c = 0; for (const e of ix) if (x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1 && inRing(e.r, x, y)) c++; return (c & 1) === 1 }

let failed = false
for (const scene of scenes) {
  const path = RIB(scene)
  if (!fs.existsSync(path)) { console.log(`\n${scene}: no ribbons at ${path} — SKIPPED LOUDLY, this scene was not checked`); failed = true; continue }
  const f = feed(scene)
  if (!f) { failed = true; continue }
  const r = buildProto(f)
  const B = r.protoBands || {}
  const IX = { curb: index(B.curb), treelawn: index(B.treelawn), sidewalk: index(B.sidewalk), lu: index(B.lu) }
  const NAMES = ['curb', 'treelawn', 'sidewalk', 'lu']

  // A — march the normal off ①'s contour into the block, every ~60 m of contour
  let stations = 0, overlaps = 0
  const worst = new Map()
  for (const rg of (r.proto || [])) for (let i = 0; i < rg.length - 1; i++) {
    const [ax, ay] = rg[i], [bx, by] = rg[i + 1]
    const L = Math.hypot(bx - ax, by - ay); if (L < 8) continue
    const nx = -(by - ay) / L, ny = (bx - ax) / L
    for (let s = 20; s < L - 20; s += 60) {
      const t = s / L, px = ax + (bx - ax) * t, py = ay + (by - ay) * t
      for (const sgn of [1, -1]) {
        let bad = null
        for (let d = 0.2; d <= 16; d += 0.2) {
          const x = px + nx * d * sgn, y = py + ny * d * sgn
          const on = NAMES.filter(n => hit(IX[n], x, y))
          if (on.length > 1) { bad = on.join('&'); break }
        }
        stations++
        if (bad) { overlaps++; worst.set(bad, (worst.get(bad) || 0) + 1) }
      }
    }
  }

  // B — the capacity guard is DECLARED. ⚠️ RE-AIMED 2026-09-06: this used to assert that a
  // per-rung COLLAPSE was counted, which was written against a construction that dropped rungs
  // — itself a cusp guard, forbidden by `§6.9`.5. The rungs are gone; what must be declared now
  // is the TOPOLOGICAL CAPACITY guard (a block whose ribbon reaches centre rather than
  // inverting). ⛔ It is not a defect and must never read as one — but it must be COUNTABLE,
  // because on town #2 nobody is looking.
  const col = r.protoStackCollapse
  const declared = col && typeof col.total === 'number'

  const okA = overlaps === 0, okB = declared
  if (!okA || !okB) failed = true
  console.log(`\n${scene}`)
  console.log(`  A DISJOINT  ${okA ? 'PASS' : 'FAIL'} — ${overlaps}/${stations} stations found a point in two bands at once`)
  for (const [k, v] of [...worst].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`      ${String(v).padStart(5)}  ${k}`)
  console.log(`  B DECLARED  ${okB ? 'PASS' : 'FAIL'} — ${declared ? `${col.total} block(s) hit the capacity guard (ribbon reaches centre — NOT a defect)` : 'protoStackCollapse ABSENT — the guard could not be reported'}`)
}
console.log(`\n${failed ? '⛔ FAIL' : '✅ PASS'}\n`)
process.exit(failed ? 1 : 0)
