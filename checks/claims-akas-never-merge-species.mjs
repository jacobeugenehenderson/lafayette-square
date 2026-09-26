// claims-akas-never-merge-species.mjs — DO COLLOQUIAL NAMES ROUTE WITHOUT MERGING TWO SPECIES INTO ONE?
//
// Jacob, 2026-09-25: a species is its SCIENTIFIC name WITH AKAs, and routing matches on any AKA.
// Sources share colloquial names — "black oak" is Quercus velutina's accepted name AND an NCSU AKA
// of Quercus coccinea — and vocabulary.mjs's merge pass unions any two species sharing a key. So:
//   ① two dossiers with different binomials never resolve to the same species;
//   ② an AKA only one species claims resolves to that species;
//   ③ an AKA two species claim (and neither holds as its own name) resolves to NEITHER.
// Reads the real dossiers through the real resolver.
//
// ▶ MUTATION-TEST IT: in vocabulary.mjs speciesIndex's dossier loop, add
//   `for (const a of d.akas || []) add(canon, a.name)` (AKAs into the merge pass) → ① RED.
//
//   node checks/claims-akas-never-merge-species.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveSpecies } from '../arborist/vocabulary.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(REPO, 'arborist/dossiers')
const bin = (x) => String(x || '').toLowerCase().replace(/[×']/g, ' ').split(/\s+/).filter(w => w && w !== 'x').slice(0, 2).join(' ')
const ds = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }

console.log('① DISTINCT SPECIES STAY DISTINCT')
const bySpecies = new Map()
for (const d of ds) { const b = bin(d.scientific); if (!b.includes(' ')) continue
  const rep = resolveSpecies(d.scientific).value
  if (!bySpecies.has(rep)) bySpecies.set(rep, new Set()); bySpecies.get(rep).add(b) }
const merged = [...bySpecies].filter(([, s]) => s.size > 1)
merged.length ? merged.forEach(([rep, s]) => bad(`"${rep}" is ${[...s].join(' + ')}`))
  : console.log(`   ✅ ${bySpecies.size} species, none merged`)

console.log('② ③ AKAs ROUTE, OR REFUSE')
const claims = new Map()   // aka -> Set(binomial)
for (const d of ds) for (const a of d.akas || []) { if (!claims.has(a.name)) claims.set(a.name, new Set()); claims.get(a.name).add(bin(d.scientific)) }
let routed = 0, refused = 0
for (const [aka, owners] of claims) {
  const r = resolveSpecies(aka)
  if (r.via === 'name' || r.via === 'word-order') continue          // someone's own name; ① covers it
  if (owners.size === 1) { const want = resolveSpecies([...owners][0]).value
    r.resolved && r.value === want ? routed++ : bad(`"${aka}" should route to ${want}, got ${JSON.stringify(r)}`) }
  else { !r.resolved && r.via === 'ambiguous' ? refused++ : bad(`"${aka}" is claimed by ${[...owners].join(' + ')} but resolved to ${r.value}`) }
}
if (!claims.size) bad('no dossier carries AKAs — the check tested nothing')
console.log(`   ✅ ${routed} AKA(s) route to their one species · ${refused} shared AKA(s) refused${refused ? '' : ' (no live shared AKA outside a primary name yet)'}`)
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
