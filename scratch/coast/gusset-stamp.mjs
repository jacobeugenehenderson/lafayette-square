// gusset-stamp.mjs — stamp the gusset record onto a copy of a slab's shape.json with bake-ground's own module, no bake.
// For exercising checks/claims-the-gusset-is-recorded.mjs's town half before a real bake. Writes only <out>/shape.json.
// Usage: CARTOGRAPH_TERRAIN_DIR=<terrain> node scratch/coast/gusset-stamp.mjs <scene> <in shape.json> <out dir> [corrupt]
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain, mapTerrainPaths } from '../../cartograph/terrainLoad.js'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
import { gussetReach, gussetAlong } from '../../cartograph/shoreGusset.mjs'
import { drawnWaterTest, drawnWaterItems } from '../../cartograph/shore-armour.mjs'
const [scene, inPath, outDir, corrupt] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const shape = JSON.parse(readFileSync(inPath))
const T = loadSceneTerrain(scene), W = waterLevels(T.water)
const bed = JSON.parse(readFileSync(mapTerrainPaths(scene).json)).bed
const wetAt = drawnWaterTest(drawnWaterItems(JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/map.json'))).layers?.water))
const { reachM, from } = gussetReach({ bed, levels: W, stepM: T.stepM })
const tally = { stations: 0, reached: 0, notReached: 0, noSide: 0 }
for (const t of shape.tiles) for (const run of t.runs || []) if (run.skelId === '__water__') {
  const g = gussetAlong(run.poly, { ground: T.getElevationRaw, lowAt: W.lowAt, wetAt, stepM: T.stepM, reachM })
  run.gusset = { ground: g.ground, toLow: g.toLow }
  tally.stations += g.ground.length; tally.reached += g.reached; tally.notReached += g.notReached; tally.noSide += g.noSide
}
shape.gusset = { stepM: T.stepM, reachM, reachFrom: from, low: W.lowName, high: W.highName, ...tally }
if (corrupt) { const r = shape.tiles.flatMap(t => t.runs || []).find(r => r.gusset?.toLow.some(v => v == null)); const i = r.gusset.toLow.indexOf(null); r.gusset.toLow[i] = reachM; console.log('corrupted one null → reach') }
writeFileSync(join(outDir, 'shape.json'), JSON.stringify(shape))
console.log(JSON.stringify(shape.gusset))
