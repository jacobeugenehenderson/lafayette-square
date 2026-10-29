// the Huron opened-1mm fixture, re-derived at coast v6 (BRIEF-cut-once-in-full-precision §3 step 4) as fixture-v5.mjs derived v5: this
// coast is a PLANTED one (its water is not re-traced), so the water, arcs and records carry over unchanged and only the version moves.
// v6 changes how a bake opens and closes the traced water and the decks (openClose.mjs); a planted coast is not re-opened.
// node scratch/cut-once/fixture-v6.mjs <repo root>
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
const ROOT = process.argv[2], { COAST_VERSION } = await import(ROOT + '/cartograph/coastFile.mjs')
const d = JSON.parse(readFileSync(ROOT + '/checks/fixtures/coast-huron-v5-opened-1mm.json', 'utf8'))
if (d.version !== 5) throw new Error(`the source fixture is v${d.version}, not v5`)
if (COAST_VERSION !== 6) throw new Error(`the kit reads v${COAST_VERSION}, not 6`)
d.version = COAST_VERSION
writeFileSync(ROOT + '/checks/fixtures/coast-huron-v6-opened-1mm.json', JSON.stringify(d)); unlinkSync(ROOT + '/checks/fixtures/coast-huron-v5-opened-1mm.json')
console.log(`v${d.version}: ${d.water.length} bodies, ${d.arcs.length} arcs`)
