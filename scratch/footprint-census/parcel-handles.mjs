// parcel-handles.mjs — per town: parcels, how many carry no `handle`, how many handles repeat (the parcel id an emitted
// parcel ring would carry). Read-only. node scratch/footprint-census/parcel-handles.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readSources } from '../../cartograph/sources.js'
const ROOT = new URL('../../', import.meta.url).pathname
for (const t of ['hipointedemun', 'huron', 'jacksonheights', 'lafayette-square', 'provincetown']) { let n = 0, noH = 0; const seen = new Map(), keys = new Set(); let dupKey = 0
  for (const w of readSources(t).parcels || []) for (const [k, p] of Object.entries(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', t, 'raw', w.file), 'utf8')).parcels || {})) { n++
    if (keys.has(k)) dupKey++; keys.add(k); if (p.handle == null) noH++; else seen.set(p.handle, (seen.get(p.handle) || 0) + 1) }
  console.log(`${t}: ${n} parcels · no handle ${noH} · handles repeated ${[...seen.values()].filter(v => v > 1).length} · keys repeated across wells ${dupKey}`) }
