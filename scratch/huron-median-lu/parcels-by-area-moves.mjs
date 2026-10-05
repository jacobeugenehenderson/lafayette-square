// Forensic (Sward): which faces move when the parcel rung weighs by AREA instead of COUNT — WITHOUT a pour.
// For each of a town's poured faces (ribbons.faces) that no OSM land use covers (luWinnerFromCoverage → null,
// the same vote derive runs first), re-run the parcel rung both ways over the town's DECLARED parcel wells,
// read in their declared format (the same classifiers derive uses). Parcels assigned to faces by derive's own
// rule (centroid in the face, or any vertex of the outer ring in it).
// Usage: CARTOGRAPH_SCENE=<town> node scratch/huron-median-lu/parcels-by-area-moves.mjs <town>
import fs from 'fs'
import { join } from 'path'
import { OSM_TO_LU, luCoverageForFace, luWinnerFromCoverage, parcelWinnerByArea } from '../../cartograph/derive.js'
import { unreadableFace } from '../../cartograph/osm-vocabulary.mjs'
import { classifyParcelLandUse, classifyUseFromText, loadCountyCodeTable, UNDERIVED } from '../../cartograph/parcel-landuse.mjs'
// the PRE-fix reader, when given (OLD_READER=<path to a copy of the old parcel-landuse.mjs>), so 'before' is what the last pour did
const oldReader = process.env.OLD_READER ? (await import(process.env.OLD_READER)).classifyUseFromText : classifyUseFromText
import { readSources } from '../../cartograph/sources.js'
const town = process.argv[2]
const raw = `cartograph/data/${town}/raw`, rib = JSON.parse(fs.readFileSync(town === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${town}/clean/ribbons.json`))
const osm = JSON.parse(fs.readFileSync(`${raw}/osm.json`))
const _src = fs.readFileSync('cartograph/derive.js', 'utf8'), _m = _src.slice(_src.indexOf('const OSM_LU_DECLARED = {'))
const DECLARED = new Set([..._m.slice(0, _m.indexOf('\n  }')).matchAll(/'([a-z_]+:[a-z_]+)'/g)].map(x => x[1]))
const polys = []
for (const [cat, key] of [['landuse', 'landuse'], ['leisure', 'leisure'], ['natural', 'natural'], ['amenity', 'amenity']])
  for (const f of osm.ground?.[cat] || []) { const sub = f.tags?.[key]; if (!sub) continue; const tag = `${cat}:${sub}`
    const u = unreadableFace(f); if ((u && u !== 'compound') || DECLARED.has(tag)) continue
    const lu = OSM_TO_LU[tag]; if (!lu || !(f.coords?.length >= 3)) continue
    let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const p of f.coords) b = [Math.min(b[0], p.x), Math.max(b[1], p.x), Math.min(b[2], p.z), Math.max(b[3], p.z)]
    polys.push({ lu, tag, ring: f.coords, holes: (f.holes || []).filter(h => h?.length >= 3), bb: b }) }
const S = readSources(town); const parcels = []
for (const d of S.parcels || []) for (const p of Object.values(JSON.parse(fs.readFileSync(join(raw, d.file))).parcels || {})) parcels.push({ ...p, jurisdiction: d.jurisdiction, land_use_code_format: d.land_use_code_format || null })
const table = loadCountyCodeTable(town)
const classifyWith = (reader) => (p) => { let lu = null
  if (p.land_use_code_format === 'stl-assessor-numeric') lu = classifyParcelLandUse(p.land_use_code, p.jurisdiction, table)
  else if (p.land_use_code_format === 'self-describing' && p.land_use_code != null) { const u = reader(String(p.land_use_code)).use; lu = u === 'unknown' ? null : u }
  return lu || UNDERIVED }
const classify = classifyWith(classifyUseFromText), classifyOld = classifyWith(oldReader)
const pbb = parcels.map(p => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const r of p.rings || []) for (const q of r) b = [Math.min(b[0], q[0]), Math.max(b[1], q[0]), Math.min(b[2], q[1]), Math.max(b[3], q[1])]; return b })
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2) }
let moved = 0, movedHa = 0, ties = 0, n = 0; const rows = []
for (const f of rib.faces || []) {
  if (!(f?.ring?.length >= 3)) continue
  if (luWinnerFromCoverage(luCoverageForFace(f.ring, polys))) continue        // OSM decided it — not the parcel rung
  let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of f.ring) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]
  const inF = (x, z) => { let c = false; const r = f.ring; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const ps = parcels.filter((p, i) => !(pbb[i][0] > b[1] || pbb[i][1] < b[0] || pbb[i][2] > b[3] || pbb[i][3] < b[2])
    && ((p.centroid && inF(p.centroid[0], p.centroid[1])) || (p.rings?.[0] || []).some(q => inF(q[0], q[1]))))
  if (!ps.length) continue
  n++
  const cnt = {}; for (const p of ps) { const u = classifyOld(p); cnt[u] = (cnt[u] || 0) + 1 }
  let byCount = null, mx = 0; for (const [u, c] of Object.entries(cnt)) if (c > mx) { mx = c; byCount = u }
  const v = parcelWinnerByArea(f.ring, ps, classify), byArea = v.use || UNDERIVED
  if (v.tie) ties++
  if (byArea !== byCount) { moved++; const ha = A(f.ring) / 1e4; movedHa += ha; rows.push({ ha, k: `${byCount} → ${byArea}${v.tie ? ' (TIE ' + v.tie.join('=') + ')' : ''}` }) }
}
const agg = {}; for (const r of rows) { (agg[r.k] ||= { n: 0, ha: 0 }); agg[r.k].n++; agg[r.k].ha += r.ha }
console.log(`${town}: ${n} parcel-decided face(s) · ${moved} move (${movedHa.toFixed(1)} ha) · ${ties} tie(s)`)
for (const [k, v] of Object.entries(agg).sort((x, y) => y[1].ha - x[1].ha)) console.log(`   ${k.padEnd(40)} ${String(v.n).padStart(3)} face(s) ${v.ha.toFixed(1).padStart(7)} ha`)
