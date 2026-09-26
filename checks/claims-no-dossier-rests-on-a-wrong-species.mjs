// claims-no-dossier-rests-on-a-wrong-species.mjs — DOES ANY DOSSIER CITE A SOURCE THAT ANSWERED FOR ANOTHER SPECIES?
//
// A source asked about one species can answer about another: SelecTree fell back to its nearest
// record (Sorbus decora for Sorbus americana; Pinus albicaulis for Pinus rigida, fixed in the
// harvester 2026-09-25). The dossier writers verify each (species, source) pair's matched taxon
// with vocabulary.verifyTaxon and drop the values. This proves it on the DOSSIERS themselves:
// no required cell's `askedAs`, and no `provenance.sources`, names a source whose matched taxon
// fails that same verifier. Reads the real corpus + dossiers.
//
// ▶ MUTATION-TEST IT: add "selectree: tree_shape" to sorbus_americana.json's chassis.habit.askedAs
//   (or 'selectree' to its provenance.sources) → RED. Put it back.
//
//   node checks/claims-no-dossier-rests-on-a-wrong-species.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { verifyTaxon, normalize } from '../arborist/vocabulary.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const obs = fs.readFileSync(path.join(REPO, 'scratch/dossier-raw-observations.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const queried = new Map(), wrong = new Map()   // corpus species -> Set(source) whose taxon mismatched
for (const o of obs) if (o.field === '_taxon_queried') queried.set(o.species, o.value)
for (const o of obs) {
  const bad = o.field === '_taxon_mismatch' || (o.field === '_matched_taxon' && queried.has(o.species) && verifyTaxon(queried.get(o.species), o.value).match === 'mismatch')
  if (bad) { if (!wrong.has(o.species)) wrong.set(o.species, new Set()); wrong.get(o.species).add(o.source) }
}
const dir = path.join(REPO, 'arborist/dossiers')
let red = 0, checked = 0
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const names = new Set([d.key, ...(d.inventoryNames || [])].filter(Boolean).map(normalize))
  const srcs = new Set([...wrong].filter(([sp]) => names.has(normalize(sp))).flatMap(([, s]) => [...s]))
  if (!srcs.size) continue
  checked++
  const cites = [...(d.provenance?.sources || []).filter(s => srcs.has(s)).map(s => `provenance.sources ${s}`),
    ...Object.entries(d.required || {}).flatMap(([a, r]) => (r?.askedAs || []).filter(x => srcs.has(String(x).split(':')[0].trim())).map(x => `${a} askedAs "${x}"`))]
  if (cites.length) { red++; console.log(`   ⛔ ${f}: ${[...srcs].join(',')} answered for another species, yet the dossier cites it — ${cites.slice(0, 3).join(' · ')}`) }
}
console.log(`   ${wrong.size} corpus species had a source answer for another taxon; ${checked} of them have a dossier`)
if (!wrong.size) { console.log('⛔ FAIL — the corpus shows no mismatch at all; the check tested nothing'); process.exit(1) }
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS — no dossier cites a source that answered for another species')
process.exit(red ? 1 : 0)
