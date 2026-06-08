// One-time migration (per-edge FILL build, SECTION §3.3): strip `treelawn`/
// `sidewalk` from existing blockCustoms entries in design.json.
//
// WHY: before this build the FILL never read depth fields from blockCustoms, so
// every existing entry's treelawn/sidewalk is SEED BAGGAGE — whole surveyed
// measures copied in by Survey pavementHW drags (SurveyorOverlay seeded from
// chainSeed), not ped authoring intent (a ped drag rendered nothing, so none
// stuck as intent). Now that sectionPass DOES read them (resolvePedDepths),
// leaving them in would silently repaint those edges to surveyed depths nobody
// authored — breaking the "byte-identical when nothing is overridden" gate.
// pavementHW (the actual Survey intent), terminal, and materials are kept.
//   node scratch/metcalf-migrate-customs.mjs [--write]
import { readFileSync, writeFileSync } from 'fs'

const write = process.argv.includes('--write')
const path = new URL('../public/looks/lafayette-square/design.json', import.meta.url)
const d = JSON.parse(readFileSync(path))
let stripped = 0
for (const sk of Object.keys(d.blockCustoms || {})) {
  for (const side of Object.keys(d.blockCustoms[sk])) {
    for (const so of Object.keys(d.blockCustoms[sk][side])) {
      const v = d.blockCustoms[sk][side][so]
      if (Number.isFinite(v.treelawn) || Number.isFinite(v.sidewalk)) {
        delete v.treelawn
        delete v.sidewalk
        stripped++
      }
    }
  }
}
console.log(`${stripped} entries stripped of ped-depth baggage${write ? ' (written)' : ' (dry run — pass --write)'}`)
if (write) writeFileSync(path, JSON.stringify(d, null, 2) + '\n')
