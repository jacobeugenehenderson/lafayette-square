// parcel-parts-inside.mjs — every part of every parcel in every town with a declared well: does `pointInside` return a point
// the part's outer holds (and no throw)? Read-only, raw parcels only. node scratch/footprint-census/parcel-parts-inside.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readSources } from '../../cartograph/sources.js'
import { parcelParts, pointInside } from '../../cartograph/parcelParts.js'
const ROOT = new URL('../../', import.meta.url).pathname
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
for (const town of ['hipointedemun', 'huron', 'jacksonheights', 'lafayette-square', 'provincetown']) { let n = 0, out = 0, thrown = [], noCentroid = 0
  for (const w of readSources(town).parcels || []) { const f = join(ROOT, 'cartograph/data', town, 'raw', w.file); if (!existsSync(f)) continue
    for (const [k, p] of Object.entries(JSON.parse(readFileSync(f, 'utf8')).parcels || {})) { if (!p.centroid) noCentroid++
      for (const { outer } of parcelParts(p.rings, k)) { n++; try { const [x, z] = pointInside(outer); if (!pip(x, z, outer)) out++ } catch (e) { thrown.push(`${k}: ${e.message}`) } } } }
  console.log(`${town}: ${n} parts · pointInside outside its part ${out} · thrown ${thrown.length}${thrown.length ? ' — ' + thrown.slice(0, 2).join(' | ') : ''} · parcels with no centroid ${noCentroid}`) }
