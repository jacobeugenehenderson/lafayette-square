/**
 * claims-verify-taxon.mjs — asserts vocabulary.mjs `verifyTaxon`.
 *
 * ⭐ The live cases are READ OUT OF scratch/dossier-raw-observations.jsonl, not
 * restated here, so this cannot drift from what the sources actually returned.
 * Only the hand-written rows below are literals, and each is a case the harvest
 * did not happen to produce.
 */
import { readFileSync, existsSync } from 'node:fs'
import { verifyTaxon } from '../arborist/vocabulary.mjs'

let fail = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(62)} ${got}${ok ? '' : `  (expected ${want})`}`)
}

console.log('── literals: cases the harvest did not produce ──')
for (const [q, r, want, why] of [
  ['Tilia cordata', 'Tiarella cordifolia L.', 'mismatch', 'THE TICO CASE — a foamflower for a linden'],
  ['Quercus rubra', 'Quercus palustris', 'mismatch', 'epithet differs'],
  ['Acer freemanii', 'Acer ×freemanii A.E. Murray', 'hybrid-mark', '× on the returned side only'],
  ['Acer ×freemanii', 'Acer freemanii', 'hybrid-mark', '× on the queried side only'],
  ['Tilia cordata', 'Tilia cordata', 'exact', 'identical'],
  ['Cercis canadensis', 'Cercis canadensis var. texensis', 'exact', 'infraspecific below a matching species'],
  ['Malus', "Malus 'Beverly'", 'exact', 'genus-level query, cultivar returned'],
  ['Tilia cordata', '', 'mismatch', 'empty returned name'],
]) check(`${why}`, verifyTaxon(q, r).match, want)

console.log('\n── live: every _matched_taxon the harvest actually recorded ──')
const P = 'scratch/dossier-raw-observations.jsonl'
if (!existsSync(P)) { console.log('  (no observations file — skipped)') }
else {
  const obs = readFileSync(P, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const queried = new Map()
  for (const o of obs) if (o.field === '_taxon_queried') queried.set(o.species, o.value)
  let exact = 0, hybrid = 0, authority = 0, mismatch = 0, flagged = 0
  for (const o of obs) {
    if (o.field !== '_matched_taxon') continue
    const v = verifyTaxon(queried.get(o.species), o.value)
    const tally = { exact: () => exact++, 'hybrid-mark': () => hybrid++, 'authority-only': () => authority++, mismatch: () => mismatch++ }
    tally[v.match]()
    if (v.returnedRank) flagged++
    if (v.match === 'mismatch' || v.returnedRank) {
      console.log(`  ${v.match === 'mismatch' ? '⛔' : '⚠️ '} ${o.source.padEnd(10)} ${o.species.padEnd(22)} ${v.reason}`)
    }
  }
  console.log(`  exact ${exact} · hybrid-mark ${hybrid} · authority-only ${authority} · mismatch ${mismatch} · returnedRank flagged ${flagged}`)
  // ⭐ The harvest already rejects a bad symbol before emitting, so a mismatch here
  // would mean a poisoned taxon reached the JSONL. That must stay zero.
  if (mismatch) { console.log('  ❌ a mismatched taxon reached the observations file'); fail++ }
}

console.log(fail ? `\n❌ FAIL — ${fail} case(s)` : '\n✅ PASS — verifyTaxon behaves as contracted')
process.exit(fail ? 1 : 0)
