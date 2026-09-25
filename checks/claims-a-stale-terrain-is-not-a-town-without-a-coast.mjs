// claims-a-stale-terrain-is-not-a-town-without-a-coast.mjs
//
// ⭐⭐ THE INVARIANT: bake-revetment may report "this town has no coast" only when the SLAB
// agrees. A stale terrain is not an absent shoreline, and the two are decided by different
// artifacts written at different times.
//
// ⛔⛔ WHY THIS EXISTS, and it was a live falsehood in the producer's own file. The gate read
// `terrain.json`'s datum ALONE:
//     if (tm.datum !== 'water') { console.log(`... this town has no coast. Nothing to
//                                 build.`); return { arcs: [], reason: 'no-water-datum' } }
// But "the terrain datum is not water" and "this town has no coast" are DIFFERENT FACTS.
// `bake-terrain` derives the datum from the scene's water rings, so a terrain baked BEFORE
// the coast closed falls to `local minimum` — and then y = 0 is the lowest hole in the
// envelope rather than the sea.
//
// ⭐ MEASURED on the town that exposed it, 2026-09-24: Provincetown's terrain was baked at
// 17:48 with datum "local minimum" and baseElev −2.13. Hours later its slab carried 420
// `__water__` runs and 122,204 m of shoreline. The old gate would have read the stale datum,
// announced that a town with 122 km of Atlantic coast has none, built nothing, and EXITED 0.
// The operator sees a bare shore and no reason — Layer 0's second question failing inside the
// one place that decides whether a shoreline gets stone.
//
// ⛔ AND THE REPAIR THIS CHECK REFUSES TO ALLOW: "just treat a non-water datum as no coast,
// it's only a log line." It is not a log line — it is the difference between a town that has
// no sea and a town whose every height is measured from the wrong zero. The 'stale-terrain'
// state exists precisely so that collapse is unavailable.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. `return waterRunCount > 0 ? 'stale-terrain' : 'inland'` → `return 'inland'`
//      (the tempting collapse: a non-water datum always means no coast)
//   2. `if (datum === 'water') return 'build'` → `return 'stale-terrain'`
//   3. `waterRunCount > 0` → `waterRunCount > 1`  (an off-by-one that hides a single-run coast)
//
//   node checks/claims-a-stale-terrain-is-not-a-town-without-a-coast.mjs
// Read-only. Exits 1 if any case resolves the wrong way.
import { coastAgreement } from '../cartograph/bake-revetment.js'

// [datum, water runs in the slab, expected, why it matters]
const CASES = [
  ['water',          420, 'build',         'the ordinary coastal town'],
  ['water',           14, 'build',         'huron, as it stands today'],
  ['water',            0, 'build',         "⭐ datum decides: a water datum with no frozen runs is NOT stale — the terrain found water. Its own branch downstream says so."],
  ['local minimum',    0, 'inland',        'the two AGREE — a genuinely inland town, and the only case where silence is right'],
  [undefined,          0, 'inland',        'an unset datum with no shoreline is still agreement'],
  ['local minimum',  420, 'stale-terrain', "⛔ PROVINCETOWN: 122 km of coast in the slab, a terrain that predates it"],
  ['local minimum',    1, 'stale-terrain', '⛔ ONE run is still a coast the terrain does not know about'],
  [undefined,          1, 'stale-terrain', 'an unset datum is not permission to deny a shoreline'],
  ['',                 7, 'stale-terrain', 'an empty datum string is not "water"'],
  ['Water',            3, 'stale-terrain', '⭐ case matters — bake-terrain writes exactly "water"'],
]

let failed = false
for (const [datum, runs, want, why] of CASES) {
  const got = coastAgreement(datum, runs)
  const ok = got === want
  if (!ok) failed = true
  console.log(`  ${ok ? '✅' : '⛔'} datum ${String(datum === undefined ? '(unset)' : `"${datum}"`).padEnd(17)} runs ${String(runs).padStart(4)} → ${got.padEnd(14)} ${ok ? '' : `WANT ${want} · `}${why}`)
}

// ⛔ AND THE THREE STATES MUST STAY THREE. A classifier collapsed to two would pass every
// case above if the table were edited to match; this asserts the VOCABULARY itself, so
// deleting 'stale-terrain' cannot be made green by adjusting a row.
const kinds = new Set(CASES.map(([d, n]) => coastAgreement(d, n)))
for (const need of ['build', 'inland', 'stale-terrain']) {
  if (!kinds.has(need)) {
    console.error(`  ⛔ THE STATE '${need}' IS NEVER REACHED — the distinction has collapsed, and a disagreement between the slab and the terrain is being resolved as something it is not.`)
    failed = true
  }
}

console.log(`\n${failed ? '⛔ RED' : `✅ GREEN — ${CASES.length} cases, all three states reachable.`}`)
process.exit(failed ? 1 : 0)
