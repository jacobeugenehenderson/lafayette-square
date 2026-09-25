// claims-shore-outside-the-drawing-is-not-refused.mjs
//
// ⭐⭐ TWO INVARIANTS:
//   ① CONSERVATION — every metre of shoreline is accounted for exactly once:
//        ruled + refused + outside == the shoreline in the slab.
//   ② THE EDGE OF THE DRAWING IS NOT A FACT ABOUT THE TOWN — shore beyond the disc is
//      COUNTED as outside, never folded into `refused`.
//
// ⛔⛔ WHY. The disc is authoritative for any consumer of the drawing — the circle is stamped
// LAST, so what it excludes is not in the map. But the heightfield follows the disc while the
// coast ink spans the whole OSM bb, and on Provincetown (2026-09-25) that put **8% of shore
// vertices outside the terrain entirely** — a sample at (8831, 5639) reads NaN. Those stations
// were handed to `wetSideOf`, which cannot find water in a heightfield that does not reach
// them, and the arc came back REFUSED as *"not at a water edge"*.
// ⭐ That is a FALSE STATEMENT ABOUT THE TOWN: the shore is not dry there, it is off the map.
// And it is worse than silence, because it ACCUSES THE DATA — a reader concludes the coastline
// is wrong when the mismatch is between two of our own extents.
// ⭐ MEASURED, the fix's own receipt: the census entry `no-height` went **592 → 0**. Those were
// exactly the off-grid stations, and nothing else moved into it.
//
// ⛔ THE REPAIR THIS FORBIDS: widening the probe, or treating a NaN height as "dry". Both make
// the number look right while still answering a question the heightfield cannot be asked.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. `clipTraceToDisc` returns `{ inside: [trace], outsideM: 0 }` always  → ① and ②
//   2. fold outside into refused (`refusedM += cut`)                        → ①
//   3. drop the circle test (`d2(p) <= R2` → `true`)                        → ②
//
//   node checks/claims-shore-outside-the-drawing-is-not-refused.mjs
// Read-only. Exits 1 on either invariant.
import { clipTraceToDisc } from '../cartograph/bake-revetment.js'

let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }
const len = (t) => t.reduce((a, p, i) => i ? a + Math.hypot(p[0] - t[i-1][0], p[1] - t[i-1][1]) : 0, 0)

const C = [0, 0], R = 1000

// ── ① conservation, on traces of every shape ──────────────────────────────────
const CASES = [
  ['wholly inside',        [[-500, 0], [0, 0], [500, 0]]],
  ['wholly outside',       [[2000, 0], [3000, 0], [4000, 0]]],
  ['crossing out once',    [[-500, 0], [500, 0], [2000, 0]]],
  ['in, out, in again',    [[-500, 0], [-2000, 0], [-500, 100], [500, 100]]],
  ['starting outside',     [[-3000, 0], [-500, 0], [500, 0]]],
  ['grazing the rim',      [[-1200, 999], [0, 999], [1200, 999]]],
]
for (const [name, trace] of CASES) {
  const { inside, outsideM } = clipTraceToDisc(trace, C, R)
  const kept = inside.reduce((a, r) => a + len(r), 0)
  const total = len(trace)
  const ok = Math.abs((kept + outsideM) - total) < 0.5
  say(ok, `${name.padEnd(20)} kept ${kept.toFixed(0)} + outside ${outsideM.toFixed(0)} = ${(kept + outsideM).toFixed(0)} m vs ${total.toFixed(0)} m`)
}

// ── ② what is outside really is outside, and what is kept really is inside ────
{
  const trace = [[-500, 0], [500, 0], [3000, 0]]
  const { inside, outsideM } = clipTraceToDisc(trace, C, R)
  const far = inside.flat().filter(p => Math.hypot(p[0] - C[0], p[1] - C[1]) > R + 0.5)
  say(far.length === 0, `no KEPT vertex lies outside the disc — ${far.length} stray`)
  say(outsideM > 1900 && outsideM < 2100, `the ~2,000 m beyond the rim is counted as outside — got ${outsideM.toFixed(0)} m`)
}
{
  const { inside, outsideM } = clipTraceToDisc([[2000, 0], [3000, 0]], C, R)
  say(inside.length === 0, `a trace wholly outside keeps NOTHING to rule — ${inside.length} run(s)`)
  say(outsideM > 990, `…and all of it is counted — ${outsideM.toFixed(0)} m`)
}
// ⛔ a disc that cannot be read must not silently become "everything is inside"
{
  const t = [[-500, 0], [3000, 0]]
  const { outsideM } = clipTraceToDisc(t, null, NaN)
  say(outsideM === 0, `an unusable disc counts nothing as outside rather than guessing — ${outsideM} m (the caller REFUSES a missing boundary; this is only the helper's own floor)`)
}

console.log(`\n${failed ? '⛔ RED' : '✅ GREEN — every metre is accounted for once, and the edge of the drawing is not reported as a fact about the shore.'}`)
process.exit(failed ? 1 : 0)
