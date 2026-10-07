// G1 proof (Argon): LS's lamp census through the bake's own exported step, written to a file for a before/after diff.
//   node scratch/ls-gates/census.mjs <out.json>
import { writeFileSync } from 'node:fs'
import { readLampCensus } from '../../cartograph/bake-lamps.js'
for (const scene of ['lafayette-square', 'huron', 'hipointedemun', 'provincetown']) {
  const c = readLampCensus(scene)
  writeFileSync(process.argv[2].replace('.json', `-${scene}.json`), JSON.stringify(c))
  console.log(scene, JSON.stringify(c.perWell ?? Object.keys(c)))
}
