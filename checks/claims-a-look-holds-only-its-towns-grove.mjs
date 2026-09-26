// claims-a-look-holds-only-its-towns-grove.mjs — DOES ANY LOOK'S ROSTER HOLD A SPECIES ITS OWN TOWN DOESN'T ROUTE TO?
//
// Jacob, 2026-09-25: "The LS species should come out of ALL LISTS FOREVER EVERYWHERE." A Grove bake used to
// add EVERY composed species to the Look it ran in, so a town's roster filled with Lafayette Square's trees,
// which its own bake builds no GLB for (Provincetown's six red sticks).
//   ① FOREVER: every Look's design.json#trees ⊆ the species its town routes to (tree-species-map.json).
//     A Look with no routing holds NO trees — empty and loud, never a borrowed grove.
//   ② generate-salon's rosterAdditions: a full regen adds only routed species; a town with no routing
//     gains nothing; an explicit `--species X` publish still adds X.
//
// ▶ MUTATION-TEST IT:
//     · add any unrouted species to a Look's trees[] → ① RED
//     · rosterAdditions: `return speciesList.filter(...)` → `return speciesList` → ② RED
//
//   node checks/claims-a-look-holds-only-its-towns-grove.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MOD = process.env.GENERATE_SALON_SRC || '../arborist/generate-salon.js'
const { rosterAdditions, routedSpeciesForLook } = await import(MOD)
const warn = console.warn; console.warn = () => {}          // rosterAdditions is loud by design; the check judges its RESULT
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }

console.log('① EVERY LOOK HOLDS ONLY ITS TOWN\'S GROVE')
const idx = JSON.parse(fs.readFileSync(path.join(REPO, 'public/looks/index.json'), 'utf8'))
let looks = 0
for (const { id } of idx.looks || idx) {
  const f = path.join(REPO, 'public/looks', id, 'design.json')
  if (!fs.existsSync(f)) continue
  looks++
  const roster = [...new Set((JSON.parse(fs.readFileSync(f, 'utf8')).trees || []).map(t => t.species))]
  const routed = routedSpeciesForLook(id, REPO)
  const stray = routed ? roster.filter(s => !routed.has(s)) : roster
  stray.length ? bad(`${id}: ${stray.length} roster species its town doesn't route to${routed ? '' : ' (it has NO routing)'}: ${stray.join(' ')}`)
    : console.log(`   ✅ ${id}: ${roster.length} roster species, all routed${routed ? '' : ' (no routing — roster empty, as it must be)'}`)
}
if (!looks) bad('no Look design.json found — the check tested nothing')

console.log('② A GROVE BAKE ADDS ONLY WHAT THE TOWN ROUTES')
{
  const routed = new Set(['a', 'b'])
  const full = rosterAdditions({ lookName: 't', speciesList: ['a', 'b', 'ls_only'], routed })
  JSON.stringify(full) === '["a","b"]' ? console.log('   ✅ full regen adds only routed species') : bad(`full regen added ${JSON.stringify(full)}`)
  const none = rosterAdditions({ lookName: 't', speciesList: ['a'], routed: null })
  none.length === 0 ? console.log('   ✅ a town with no routing gains nothing') : bad(`an unrouted town gained ${JSON.stringify(none)}`)
  const named = rosterAdditions({ lookName: 't', speciesList: ['x'], onlySpecies: 'x', routed })
  JSON.stringify(named) === '["x"]' ? console.log('   ✅ an explicit --species publish still adds that species') : bad(`an explicit publish added ${JSON.stringify(named)}`)
}
console.warn = warn
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
