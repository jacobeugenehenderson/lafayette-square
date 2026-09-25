// claims-a-shore-is-not-traced-twice.mjs
//
// ⭐⭐ TWO INVARIANTS, one cure and one guard:
//   ① THE CURE — the same coastline way is never welded in twice. Two identical geometries
//      cannot both be shore; welded, they trace the coast out and back.
//   ② THE GUARD — a closed chain that encloses NOTHING is never used as a water face.
//
// ⛔⛔ WHAT HAPPENED, 2026-09-25, and ① is upstream of ②. Provincetown's intake delivered 26
// `natural=coastline` features that were only THIRTEEN distinct geometries, each present
// twice in the same direction — 142,947 m of "coastline" for a ~71 km shore. `weldCoastlines`
// chained all 26, so the path ran out along the coast and back, closing on itself with
// −0.0 m² of area. That ring became the town's sea. Nothing was inside it, so `bake-terrain`
// found ZERO grid samples under water and refused the whole town — which is the only reason
// anyone found out.
//
// ⭐ AND THE TEST THAT APPROVED IT IS THE LESSON: the bay-vs-island check asks "how many
// buildings are inside this ring?", got 0, and read 0 as "the interior is water". ZERO IS
// WHAT A ZERO-AREA RING ALWAYS RETURNS. It cannot tell "encloses water" from "encloses
// nothing" — and it is correct on huron, whose ring bounds 40,114,034 m². Invisible on the
// town it was built against, fatal on the next one.
//
// ⛔ The duplication is UPSTREAM of coastline.mjs and dropping it at the weld does not fix
// it. This check asserts the weld is defensive; it does NOT claim the intake is clean.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. drop the dedupe in `weldCoastlines` (keep `open = feats.map(...)`)  → ① red
//   2. `if (meanW < WELD_EPS_M)` → `if (false)`                            → ② red
//   3. compare shapes forward-only (drop the `fwd < rev ? fwd : rev` key)  → ① red on a
//      reversed duplicate, which is the form a relation member usually takes
//
//   node checks/claims-a-shore-is-not-traced-twice.mjs
// Read-only. Exits 1 on either invariant.
import { weldCoastlines, ringMeanWidth, coastRings } from '../cartograph/coastline.mjs'

let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }

// ── ① a duplicated shore welds to ONE chain, not a there-and-back ──────────────
// A simple open shore: four points across a notional frame.
const shore = [[0, 0], [100, 10], [200, 0], [300, 20]]
const asFeat = (pts) => ({ coords: pts.map(([x, z]) => ({ x, z })), tags: { natural: 'coastline' } })

{
  const note = []
  const one = weldCoastlines([asFeat(shore)], note)
  say(one.length === 1 && one[0]?.pts.length === 4,
      `a single shore welds to 1 chain of 4 pts — got ${one.length} chain(s) of ${one[0]?.pts.length} pts`)
}
{
  const note = []
  const two = weldCoastlines([asFeat(shore), asFeat(shore)], note)
  const w = two[0] ? ringMeanWidth(two[0].pts) : -1
  say(two.length === 1 && two[0].pts.length === 4,
      `the SAME shore delivered twice still welds to 1 chain of 4 pts — got ${two.length} chain(s) of ${two[0]?.pts.length} pts`)
  say(note.some(l => /duplicate/i.test(l)), `the duplicate is REPORTED, not swallowed`)
  // ⛔ NOT "it bounds area" — an open 4-point shore bounds none, and asserting that would be
  // testing the fixture rather than the fix. The fix is that the chain is not DOUBLED: the
  // duplicate must not be appended, which is what turns a shore into an out-and-back.
  const doubled = two[0] ? two[0].pts.length > shore.length : true
  say(!doubled, `the chain is not doubled — ${two[0]?.pts.length} pts, not ${2 * shore.length - 1}`)
}
{
  // ⭐ The reversed duplicate — the form a way emitted both standalone and as a relation
  // member usually takes. Direction must not hide it.
  const note = []
  const rev = weldCoastlines([asFeat(shore), asFeat([...shore].reverse())], note)
  say(rev.length === 1 && rev[0].pts.length === 4,
      `a REVERSED duplicate is the same shore — got ${rev.length} chain(s) of ${rev[0]?.pts.length} pts`)
}

// ── ② a ring that encloses nothing is not a face ───────────────────────────────
{
  const square = [[0, 0], [100, 0], [100, 100], [0, 100]]
  say(ringMeanWidth(square) > 24 && ringMeanWidth(square) < 26,
      `a 100 m square has mean width ${ringMeanWidth(square).toFixed(2)} m (area/perimeter = 10000/400)`)

  const outBack = [...shore, ...[...shore].reverse().slice(1)]
  say(ringMeanWidth(outBack) < 0.05,
      `a trace that doubles back bounds nothing — mean width ${ringMeanWidth(outBack).toFixed(6)} m, below the 0.05 m weld tolerance`)

  const big = []
  for (let i = 0; i <= 1000; i++) big.push([i * 70, Math.sin(i / 50) * 400])
  for (let i = 999; i >= 0; i--) big.push([i * 70, Math.sin(i / 50) * 400])
  say(ringMeanWidth(big) < 0.05,
      `a 140 km out-and-back is still nothing — mean width ${ringMeanWidth(big).toFixed(6)} m. ⭐ Size is not area.`)
}

// ── ③ AND THE GATE MUST FIRE INSIDE THE PRODUCER, NOT JUST IN THE HELPER ───────
// ⛔ An earlier cut of this check tested `ringMeanWidth` alone and PASSED with the gate in
// `coastRings` disabled — a blind check, the exact failure this repo keeps paying for. So
// this drives the real producer with a synthetic scene whose coastline is a closed trace
// that doubles back, and asserts the producer REFUSES it as a face.
{
  const R = 4000
  const bb = { x0: -R, x1: R, z0: -R, z1: R }
  // a shore crossing the frame, then retraced backwards: closes, bounds nothing
  const line = []
  for (let x = -6000; x <= 6000; x += 250) line.push([x, 500 + 300 * Math.sin(x / 1500)])
  const doubled = [...line, ...[...line].reverse().slice(1)]
  const feat = { tags: { natural: 'coastline' }, isClosed: false,
                 coords: doubled.map(([x, z]) => ({ x, z })) }
  const out = coastRings({ ground: { natural: [feat] }, buildings: [], center: [0, -2000], discR: R * 0.9, bb })
  const enclosesNothing = (out.rings || []).every(r => ringMeanWidth(r) >= 0.05)
  say(enclosesNothing,
      `coastRings emits NO zero-area face from a doubled-back coast — ${(out.rings || []).length} ring(s), mean widths ${(out.rings || []).map(r => ringMeanWidth(r).toFixed(2)).join(', ') || '(none)'}`)
  say((out.report || []).some(l => /ENCLOSES NOTHING|duplicate/i.test(l)),
      `and it SAYS so rather than passing quietly`)
}

console.log(`\n${failed ? '⛔ RED' : '✅ GREEN — a shore is welded once, and a ring that bounds nothing is not a face.'}`)
process.exit(failed ? 1 : 0)
