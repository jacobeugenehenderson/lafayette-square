#!/usr/bin/env node
/**
 * CLAIM: the prominence rank is a SORT and never a filter, hand-promotion outranks
 *        the score, an absent well is dropped rather than zero-filled — and the
 *        cheap signals predict human judgement well enough to beat chance by a
 *        wide margin on the one town where human judgement is written down.
 *
 * ⭐⭐ THE HARD PROBLEM THIS EXISTS FOR. A ranking always produces a plausible
 * ordered list. It CANNOT FAIL VISIBLY — the output IS the plausible-looking
 * success, which is `CLAUDE.md` Layer 0 q2 at its most dangerous. So the score
 * needs an instrument that can say it is wrong, and we own exactly one:
 * Lafayette Square's 87 hand-curated landmarks, chosen by people, over years.
 *
 * ⛔ THE SCORE NEVER SEES THEM. `bake-content` reads the baked slab, clean/map.json,
 * raw/osm.json and the assessor parcels. It does not read `src/data/landmarks.json`,
 * and LS has no `content/` dir and no override sidecars at all — so the LS run is
 * blind by construction, not by promise. This file is the only thing here that
 * opens the landmark list.
 *
 * ⛔⛔ THE HIT RATE IS REPORTED, NOT ASSERTED, AND THAT IS DELIBERATE.
 * `BRIEF-roster-prominence-C §7`: do not tune the score until it recovers all 87 —
 * that is overfitting to the mould the kit was cast around, and it would make the
 * rank fail worst on the towns least like LS. The weights in `prominence.mjs` were
 * set from `INTAKE-CATALOGUE §4.1`'s prose ordering BEFORE this check was first run
 * and have not been touched since. What IS asserted is a floor no honest score
 * could miss (`A4`): beat random selection by 4×. A score that cannot clear that
 * is not a weak guess, it is noise wearing numbers.
 *
 * ⭐ AND READ THE MISSES. The landmarks the score cannot see are `§4.3`'s constraint
 * ① population — the beloved corner bar — and they are printed in full below,
 * because they are the argument for the resident-promotion path, not a bug list.
 *
 * ⛔ MUTATION-TESTED, BY NAME (`MEMORY §C` — a passing check proves nothing until
 * seen to fail). Each `--mutate` injects the exact defect its assertion exists to
 * catch, into the real run's output, and the check must go RED:
 *   ▶ node checks/claims-prominence-recovers-ls-landmarks.mjs
 *   ▶ node checks/claims-prominence-recovers-ls-landmarks.mjs --mutate filter
 *   ▶ node checks/claims-prominence-recovers-ls-landmarks.mjs --mutate ignore-promotion
 *   ▶ node checks/claims-prominence-recovers-ls-landmarks.mjs --mutate zero-fill
 *   ▶ node checks/claims-prominence-recovers-ls-landmarks.mjs --mutate shuffle
 * The SUBJECT under test in the un-mutated run is the production `rankRoster` /
 * `scoreProminence`, reached through `bakeContent` — not a mock of them.
 *
 * ⚠️ TIER: same `live`/unreadable position as `claims-an-external-base-survives-a-bake`
 * — importing the bake taints on `scene.js`'s `RegExp.exec`. It contacts nothing and
 * writes nothing (`dryRun: true`). Run it deliberately, after any weight change.
 */

import { readFileSync } from 'fs'
import { bakeContent } from '../cartograph/bake-content.js'
import { scoreProminence, prominenceContext } from '../cartograph/prominence.mjs'

const MUTATE = (() => { const i = process.argv.indexOf('--mutate'); return i >= 0 ? process.argv[i + 1] : null })()
const fails = []
const ok = []
// ⛔ The detail is the FAILURE's explanation, so it prints only on failure — a pass
// that reads "landed at rank 1, not 1" teaches the reader to skim the check's output.
const assert = (name, cond, detail) => cond ? ok.push(name) : fails.push(`${name}${detail ? ` — ${detail}` : ''}`)

// ── The blind run. `force` is required because LS content is hand-curated and the
// bake refuses to touch it; `dryRun` means NOTHING IS WRITTEN, so the pair is safe
// and LS's curated files are never at risk. ─────────────────────────────────────
const { roster } = bakeContent({ scene: 'lafayette-square', force: true, dryRun: true })

let ranked = [...roster].sort((a, b) => a.prominence.rank - b.prominence.rank)

// ── Mutations. Each is the defect, not a flag the subject reads. ───────────────
if (MUTATE === 'filter') {
  // The defect: a threshold that hides the buildings with no signal.
  const SIZE_ONLY = new Set(['footprint_area', 'stories'])
  ranked = ranked.filter(b => Object.keys(b.prominence.signals).some(k => !SIZE_ONLY.has(k)))
  ranked.forEach((b, i) => { b.prominence.rank = i + 1 })
} else if (MUTATE === 'shuffle') {
  // The defect: the order is not the score's order.
  let seed = 7
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  ranked = ranked.map(b => [rnd(), b]).sort((a, b) => a[0] - b[0]).map(x => x[1])
  ranked.forEach((b, i) => { b.prominence.rank = i + 1 })
}

// ── A1 · THE RANK IS A SORT, NEVER A FILTER ───────────────────────────────────
// Every building in the roster leaves with a rank, the ranks are exactly 1..N, and
// N is the whole roster. ⛔ There is no reachability argument to make about rank
// N+1 if N is the population.
{
  const rs = ranked.map(b => b.prominence.rank)
  const distinct = new Set(rs)
  assert('A1 sort-not-filter: every building ranked',
    ranked.length === roster.length, `${ranked.length} ranked of ${roster.length} in the roster`)
  assert('A1 sort-not-filter: ranks are exactly 1..N',
    distinct.size === roster.length && Math.min(...rs) === 1 && Math.max(...rs) === roster.length,
    `${distinct.size} distinct ranks, ${Math.min(...rs)}..${Math.max(...rs)}`)
  assert('A1 sort-not-filter: no building was suppressed for scoring zero',
    !roster.some(b => b.prominence.rank == null), 'a null rank is a hidden building')
}

// ── A2 · HAND-PROMOTION OUTRANKS THE SCORE ────────────────────────────────────
// Take the WORST-ranked building in town, promote it, re-rank, and it must come
// out first. ⭐ This is the §4.3 constraint that the guess never overrules the
// person who knows, and it is the whole reason the resident seam can exist.
{
  const { rankRoster } = await import('../cartograph/prominence.mjs')
  const clone = roster.map(b => ({ id: b.id, promoted: null }))
  const bundles = new Map(roster.map(b => [b.id, { tags: {}, poi_count: 0, footprint_area: null }]))
  // give them a spread so there is a real order to overrule
  roster.forEach((b, i) => bundles.get(b.id).footprint_area = i + 1)
  const worst = clone[0]
  worst.promoted = { by: 'operator', note: 'mutation-test promotion' }
  let out = rankRoster(clone, bundles).order
  if (MUTATE === 'ignore-promotion') {
    out = [...clone].sort((a, b) => b.prominence.score - a.prominence.score)
    out.forEach((r, i) => { r.prominence.rank = i + 1 })
  }
  assert('A2 promotion outranks the score',
    worst.prominence.rank === 1,
    `a promoted building landed at rank ${worst.prominence.rank}, not 1`)
}

// ── A3 · AN ABSENT WELL IS DROPPED; AN UNMATCHED BUILDING IS "UNKNOWN", NOT ZERO ─
// Two different absences, and conflating them is the confident-wrong class.
{
  const present = [{ appraised_value: 100 }, { appraised_value: 900 }]
  const absent  = [{ appraised_value: null }, { appraised_value: null }]
  const ctxA = prominenceContext(absent)
  assert('A3 a well no building supplies is dropped town-wide',
    ctxA.wells.appraised_value === false, 'an empty well was reported as present')

  const ctxP = prominenceContext(present)
  let r = scoreProminence({ appraised_value: null }, ctxP)
  if (MUTATE === 'zero-fill') r = { ...r, signals: { ...r.signals, appraised_value: 0 }, unknown: [] }
  assert('A3 an unmatched building scores NO appraised_value entry',
    !('appraised_value' in r.signals),
    'a zero was written where the answer is "we do not know"')
  assert('A3 the ignorance is NAMED in prominence.unknown',
    r.unknown.includes('appraised_value'),
    'the building was ranked on less evidence than its neighbour and did not say so')

  // And the town-wide drop must be RANK-NEUTRAL: a sort does not move under a constant.
  const bundles = [{ footprint_area: 10 }, { footprint_area: 30 }, { footprint_area: 20 }]
  const ctx = prominenceContext(bundles)
  const order = bundles.map(b => scoreProminence(b, ctx).score)
  const withWell = bundles.map(b => scoreProminence({ ...b, appraised_value: null }, ctx).score)
  assert('A3 dropping an absent well leaves the order unchanged',
    JSON.stringify(order) === JSON.stringify(withWell), 'the absent well moved the sort')
}

// ── A4 · THE LS MEASUREMENT — reported in full, asserted only against chance ────
const lm = JSON.parse(readFileSync(new URL('../src/data/landmarks.json', import.meta.url), 'utf8'))
const landmarks = lm.landmarks || lm
const attached = landmarks.filter(l => l.building_id)
const truth = new Set(attached.map(l => l.building_id))
const inRoster = [...truth].filter(b => ranked.some(r => r.id === b))
const nameOf = b => attached.filter(l => l.building_id === b).map(l => l.name).join(' / ')

console.log('\n─────────────────────────────────────────────────────────────────────────')
console.log('LS RECOVERY — the score scored LS blind; these 87 were chosen by people.')
console.log('─────────────────────────────────────────────────────────────────────────')
console.log(`  87 landmarks · ${attached.length} carry a building_id · ${truth.size} distinct buildings`)
console.log(`  ⛔ ${landmarks.length - attached.length} landmarks are attached to NO building — unreachable by ANY`)
console.log(`     building rank, whatever its weights. They are not misses; they are out of frame.`)
console.log(`  ${inRoster.length} of the ${truth.size} landmark buildings are in the roster.`)

const rankOf = new Map(ranked.map(b => [b.id, b.prominence.rank]))
console.log(`\n  top-N recovery (chance = N × ${truth.size} / ${ranked.length}):`)
let atTruthN = 0
for (const N of [20, 50, truth.size, 100, 200, 400]) {
  if (N > ranked.length) break
  const hit = [...truth].filter(b => (rankOf.get(b) ?? Infinity) <= N).length
  const chance = (N * truth.size) / ranked.length
  if (N === truth.size) atTruthN = hit
  console.log(`    top ${String(N).padStart(3)}: ${String(hit).padStart(2)}/${truth.size}` +
    ` (${String(Math.round(100 * hit / truth.size)).padStart(3)}%) · chance would give ${chance.toFixed(1)}` +
    ` · ${(hit / Math.max(0.01, chance)).toFixed(1)}× chance`)
}

const missed = [...truth].filter(b => (rankOf.get(b) ?? Infinity) > truth.size)
  .sort((a, b) => (rankOf.get(a) ?? Infinity) - (rankOf.get(b) ?? Infinity))
console.log(`\n  ⭐ THE MISSES AT top-${truth.size} (${missed.length}) — §4.3 constraint ①'s population.`)
console.log(`     These are what the cheap data CANNOT see, and the case for the resident path.`)
for (const b of missed) {
  const r = ranked.find(x => x.id === b)
  const sig = r ? Object.keys(r.prominence.signals).filter(k => !['footprint_area', 'stories'].includes(k)) : []
  console.log(`     rank ${String(rankOf.get(b) ?? '—').padStart(4)}  ${b}  ${nameOf(b)}`)
  console.log(`              signal: ${sig.length ? sig.join(', ') : '⛔ NOTHING — no source has noticed this building'}`)
}

const chanceAtN = (truth.size * truth.size) / ranked.length
assert(`A4 beats chance by 4× at top-${truth.size}`,
  atTruthN >= chanceAtN * 4,
  `recovered ${atTruthN}, chance is ${chanceAtN.toFixed(1)}, floor is ${(chanceAtN * 4).toFixed(1)}`)

// ── verdict ───────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────────────────────────')
for (const o of ok) console.log(`  ✓ ${o}`)
for (const f of fails) console.log(`  ✗ ${f}`)
if (MUTATE) {
  console.log(`\n  MUTATION "${MUTATE}" — this run MUST be red.`)
  if (!fails.length) { console.log('  ⛔ IT IS GREEN. The assertion does not catch its own defect.'); process.exit(1) }
  console.log('  ✓ red, as required.')
  process.exit(0)
}
if (fails.length) { console.log(`\n⛔ ${fails.length} FAILED`); process.exit(1) }
console.log(`\n✓ ${ok.length} claims hold`)
