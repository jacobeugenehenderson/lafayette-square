// claims-a-missing-revetment-is-not-a-shoreless-town.mjs
//
// ⭐⭐ THE INVARIANT: the renderer may draw "no shore" only when it has been TOLD there is
// no shore. A response it cannot read is not permission to draw nothing quietly.
//
// ⛔⛔ WHY THIS EXISTS (Marram, 2026-09-24). `bake-revetment` writes no artifact for a town
// with no shoreline, so a 404 is the ordinary case and most towns give one. SlabRevetment
// therefore branched on `r.status === 404`. But vite answers a missing file with its HTML
// index at **status 200**, so in dev:
//   · the "absent is normal" branch was UNREACHABLE — never once executed
//   · `r.ok` was true, `r.json()` threw on HTML, and the LOUD branch fired for every
//     ordinary coastless town, logging "FAILED to load"
// Both branches inverted, and in the worse direction: a real load failure became
// indistinguishable from a normal absence. ⛔ Layer 0's second question, failing inside the
// code that decides whether a coast gets drawn at all.
//
// ⭐ SO THE ANSWER IS THREE-STATE, not a boolean — the shape `intake-rows.mjs` already uses
// for an input well. A server that answers 200-HTML for a missing file CANNOT verify
// absence, and claiming "this town has no revetment" on its word is a guess wearing a
// fact's clothes. It must report `unverifiable` and the caller must say so out loud.
//
// ⛔ WHAT THIS CHECK REFUSES TO ALLOW: the tempting one-line "fix" of catching the parse
// error and treating it as absent. That passes every eye test and swallows a genuinely
// corrupt artifact — the same bug with a wider mouth. The `unverifiable` case exists
// precisely so that repair is not available.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. `return 'unverifiable'` → `return 'absent'`   (the tempting repair)
//   2. drop the content-type test, so any 2xx is 'present'
//   3. `if (status === 404) return 'absent'` → `return 'failed'`
//
//   node checks/claims-a-missing-revetment-is-not-a-shoreless-town.mjs
// Read-only. Exits 1 if any case resolves the wrong way.
import { revetmentResponseKind } from '../src/lib/revetmentFromSlab.js'

// [status, content-type, expected, why it matters]
const CASES = [
  [200, 'application/json',              'present',      'the artifact, plainly'],
  [200, 'application/json; charset=utf-8','present',      'a charset suffix must not un-JSON it'],
  [404, 'text/html',                     'absent',       'the ordinary coastless town — the server KNOWS'],
  [404, 'application/json',              'absent',       '404 decides regardless of body type'],
  [200, 'text/html',                     'unverifiable', "⛔ vite's index standing in for a missing file — NOT proof of no coast"],
  [200, 'text/html; charset=utf-8',      'unverifiable', 'the exact header vite sends'],
  [200, '',                              'unverifiable', 'no content-type at all is not a JSON promise'],
  [200, null,                            'unverifiable', 'a header the fetch did not return'],
  [500, 'text/html',                     'failed',       'a broken server must be LOUD, never a quiet no-shore'],
  [503, 'application/json',              'failed',       'a JSON error body is still a failure'],
  [302, 'text/html',                     'failed',       'an unfollowed redirect is not an absence'],
]

let failed = false
for (const [status, ct, want, why] of CASES) {
  const got = revetmentResponseKind(status, ct)
  const ok = got === want
  if (!ok) failed = true
  console.log(`  ${ok ? '✅' : '⛔'} ${String(status).padEnd(4)} ${String(ct === null ? '(null)' : ct || '(empty)').padEnd(32)} → ${got.padEnd(13)} ${ok ? '' : `WANT ${want} · `}${why}`)
}

// ⛔ AND THE THREE STATES MUST STAY THREE. A classifier that collapsed to two would pass
// every case above if the cases were also edited; this asserts the vocabulary itself, so
// deleting `unverifiable` cannot be made green by adjusting a table.
const kinds = new Set(CASES.map(([s, c]) => revetmentResponseKind(s, c)))
for (const need of ['present', 'absent', 'unverifiable', 'failed']) {
  if (!kinds.has(need)) {
    console.error(`  ⛔ THE STATE '${need}' IS NEVER REACHED — the three-state distinction has collapsed, and an unreadable response is being resolved as something it is not.`)
    failed = true
  }
}

console.log(`\n${failed ? '⛔ RED' : `✅ GREEN — ${CASES.length} cases, all four states reachable.`}`)
process.exit(failed ? 1 : 0)
