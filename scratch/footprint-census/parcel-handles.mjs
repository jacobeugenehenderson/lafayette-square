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
// ── a repeated handle: are its records STACKED (the same rings) or PIECES (disjoint rings, one parcel split over features),
// or overlapping otherwise? And the records with no handle: what they carry.
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
for (const t of ['hipointedemun', 'huron', 'lafayette-square', 'provincetown']) { const by = new Map(), none = []
  for (const w of readSources(t).parcels || []) for (const p of Object.values(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', t, 'raw', w.file), 'utf8')).parcels || {})) {
    if (p.handle == null) { none.push(p); continue } const k = `${w.id}:${p.handle}`; (by.get(k) || by.set(k, []).get(k)).push(p) }
  let stacked = 0, pieces = 0, overlap = 0, records = 0
  for (const recs of by.values()) { if (recs.length < 2) continue; records += recs.length
    const sig = new Set(recs.map(r => JSON.stringify(r.rings))); if (sig.size === 1) { stacked++; continue }
    const hit = recs.some((a, i) => recs.some((b, j) => j > i && (a.rings[0].some(([x, z]) => pip(x, z, b.rings[0])) || b.rings[0].some(([x, z]) => pip(x, z, a.rings[0])))))
    hit ? overlap++ : pieces++ }
  console.log(`${t}: repeated handles (per well) — identical rings ${stacked} · disjoint ${pieces} · overlapping, not identical ${overlap} · records ${records} · no handle ${none.length}${none.length ? ` (address ${none.slice(0, 3).map(p => p.address).join(' | ')} · land_use ${[...new Set(none.map(p => p.land_use_code))].join(',')})` : ''}`) }
