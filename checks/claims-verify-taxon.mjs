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
  console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(58)} ${got}${ok ? '' : `  (expected ${want})`}`)
}

// ⛔ EACH CASE MUST ISOLATE ONE GUARD. Mutation-tested 2026-08-25: disabling the
// genus test did NOT fail this check, because the original TICO literal
// (Tilia cordata / Tiarella cordifolia) differs in genus AND epithet, so the
// epithet guard caught it and the check could not tell which one was working.
// A case that two guards catch proves neither. Hence the genus-ONLY and
// epithet-ONLY rows below.
console.log('── verdicts: one guard per case ──')
for (const [q, r, want, why] of [
  ['Tilia cordata', 'Tiarella cordata',      'mismatch', 'GENUS ONLY differs — isolates the genus guard'],
  ['Quercus rubra', 'Quercus palustris',     'mismatch', 'EPITHET ONLY differs — isolates the epithet guard'],
  ['Tilia cordata', 'Tiarella cordifolia L.','mismatch', 'the real TICO string (both differ)'],
  ['Acer freemanii', 'Acer \u00d7freemanii A.E. Murray', 'hybrid-mark', '\u00d7 on the returned side only'],
  ['Acer \u00d7freemanii', 'Acer freemanii', 'hybrid-mark', '\u00d7 on the queried side only'],
  ['Acer x freemanii', 'Acer &times freemanii', 'exact', 'SelecTree ships &times with NO semicolon'],
  ['Tilia cordata', 'Tilia cordata Mill.',   'authority-only', 'authority on the returned side'],
  ['Tilia cordata', 'Tilia cordata',         'exact', 'identical'],
  ['Cercis canadensis', 'Cercis canadensis var. texensis', 'exact', 'infraspecific below a matching species'],
  ['Malus', "Malus 'Beverly'",               'exact', 'genus-level query, cultivar returned'],
  ['Ulmus', 'Ulmus americana',               'exact', 'genus-level query, species returned'],
  ['Tilia cordata', '',                      'mismatch', 'empty returned name'],
  ['', 'Tilia cordata',                      'mismatch', 'empty queried name'],
]) check(why, verifyTaxon(q, r).match, want)

// ⚠️ returnedRank is ADVISORY — it never moves the verdict, so nothing above can
// assert it. Rook's mint treats a non-null rank as DISQUALIFYING, which means this
// is load-bearing and untested until here. Mutation-tested: deleting the flag
// passed the old check silently.
console.log('\n── returnedRank: advisory, and the only thing guarding the cultivar class ──')
const rank = (q, r) => { const v = verifyTaxon(q, r); return v.returnedRank ? (v.returnedRank.cultivar || v.returnedRank.infraspecific) : null }
check("'Armstrong' cultivar is FLAGGED (columnar where the species is not)", rank('Acer rubrum', "Acer rubrum 'Armstrong'"), 'Armstrong')
check('var. texensis is FLAGGED below a matching species', rank('Cercis canadensis', 'Cercis canadensis var. texensis'), 'texensis')
check('a clean species record is NOT flagged', rank('Tilia cordata', 'Tilia cordata Mill.'), null)
check('a genus-level cultivar record is FLAGGED', rank('Malus', "Malus 'Beverly'"), 'Beverly')

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
