// the Huron v4 opened-1mm fixture, re-derived at coast v5 as bake-coast writes v5 over the same water: v5 changes the deck
// footprints (cut once) and holds embankments as land; this coast is a planted one (its water is not re-traced) and Huron has no
// embankment street, so the water and arcs carry over unchanged and the record gains v5's `embankments` (none held)
import { readFileSync, writeFileSync } from 'node:fs'
const ROOT = process.argv[2], { COAST_VERSION } = await import(ROOT + '/cartograph/coastFile.mjs')
const d = JSON.parse(readFileSync(ROOT + '/checks/fixtures/coast-huron-v4-opened-1mm.json', 'utf8'))
if (d.version !== 4) throw new Error(`the source fixture is v${d.version}, not v4`)
d.version = COAST_VERSION
d.embankments = { held: [], coarseCells: 0, cutM2: 0, contactRuns: 0, crossingsDropped: 0, excursionsDropped: 0 }
writeFileSync(ROOT + '/checks/fixtures/coast-huron-v5-opened-1mm.json', JSON.stringify(d))
console.log(`v${d.version}: ${d.water.length} bodies, ${d.arcs.length} arcs`)
