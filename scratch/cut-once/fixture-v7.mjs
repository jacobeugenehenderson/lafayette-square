// the Huron opened-1mm fixture, re-derived at coast v7 (Zob's ruling, 2026-10-29) as fixture-v6.mjs derived v6: a PLANTED coast (its
// water is not re-traced, nor re-opened), so the water, arcs and records carry over and the version moves; v7's topology record is
// written as v7 requires, always present: empty, since a planted coast's open/close made no change. node scratch/cut-once/fixture-v7.mjs <repo root>
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
const ROOT = process.argv[2], { COAST_VERSION } = await import(ROOT + '/cartograph/coastFile.mjs')
const d = JSON.parse(readFileSync(ROOT + '/checks/fixtures/coast-huron-v6-opened-1mm.json', 'utf8'))
if (d.version !== 6) throw new Error(`the source fixture is v${d.version}, not v6`)
if (COAST_VERSION !== 7) throw new Error(`the kit reads v${COAST_VERSION}, not 7`)
d.version = COAST_VERSION; d.waterTopology = []; d.decksTopology = []
writeFileSync(ROOT + '/checks/fixtures/coast-huron-v7-opened-1mm.json', JSON.stringify(d)); unlinkSync(ROOT + '/checks/fixtures/coast-huron-v6-opened-1mm.json')
console.log(`v${d.version}: ${d.water.length} bodies, ${d.arcs.length} arcs`)
