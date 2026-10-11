// claims-a-dem-is-chosen-by-its-data.mjs — DOES EVERY TOWN'S ELEVATION LIST HOLD DATA OVER THE TOWN?
//
// ⭐ THE INVARIANT: the tiles a town's `raw/elevation-sources.txt` names carry VALUES over the town's fetched square —
// not merely a tile box that reaches it. Read off the list itself (range reads, nothing downloaded), so it cannot drift
// from what bake-terrain will read.
//
// ⛔ WHY (2026-10-10): `fetch-dem.mjs` scored surveys by tile bounding box, and USGS cuts every project into 10 km UTM
// tiles, so a survey flown east of the Mississippi owns tiles reaching west over Lafayette Square. It chose that one
// (IL_HicksDome_FluorsparDistrict_2019: 0% data over LS) over the one that covers it (MO_SaintLouis_2017: 100%), and the
// list would have baked a flat town. fetch-dem now ranks by data (`byData`).
//
// ⭐ MUTATION TEST: `--coverage-by=bbox --town=lafayette-square` re-runs fetch-dem's choice the OLD way (in memory, no
// file written) and must go RED: the survey it picks holds no data over LS.
//
//   node checks/claims-a-dem-is-chosen-by-its-data.mjs [--town=a,b] [--coverage-by=bbox]
// ⚠️ Reads the network (USGS S3 range requests; the TNM API for the mutation). Exits 1 on a list with no data.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { findDem, byData } from '../cartograph/fetch-dem.mjs'
const ROOT = new URL('../cartograph/data/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const towns = arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'raw', 'elevation-sources.txt')))
const bboxOf = (t) => JSON.parse(readFileSync(join(ROOT, t, 'raw', 'osm.json'), 'utf8')).bbox
let bad = 0
for (const town of towns) {
  const bbox = bboxOf(town)
  let tiles
  if (arg('coverage-by') === 'bbox') {
    const r = await findDem(bbox, { coverageBy: 'bbox' })
    tiles = r.items; console.log(`  ${town}: the OLD bbox-only choice → ${r.projects?.[0]?.project}`)
  } else {
    const p = join(ROOT, town, 'raw', 'elevation-sources.txt')
    tiles = readFileSync(p, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(u => ({ downloadURL: u }))
    if (!tiles.length) { console.log(`  ${town}: the list names no tiles (a recorded absence) — not this check's question`); continue }
  }
  const [s] = await byData([{ project: town, tiles, coverage: NaN, newest: '' }], bbox, { quiet: true })
  const ok = s.data > 0
  if (!ok) bad++
  console.log(`  ${ok ? '✅' : '⛔'} ${town}: ${tiles.length} tile(s) hold data over ${(100 * s.data).toFixed(0)}% of the town's square`)
}
if (bad) { console.error(`⛔ ${bad} town(s) whose elevation list holds NO data over the town — it would bake a flat map`); process.exit(1) }
console.log('✅ every elevation list holds data over its town')
