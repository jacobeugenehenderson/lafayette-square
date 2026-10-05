// Forensic (Sward): per-polygon land-use painting, WITHOUT a pour. Builds `ribbons.landEvidence` in memory with the
// pour's own exported `layerLandEvidence` (OSM ingest as derive does it; parcels read in the town's declared format),
// runs the real ①②③ build, and prints the painted classes town-wide and for named tiles.
// Usage: CARTOGRAPH_SCENE=<town> node scratch/huron-median-lu/evidence-smoke.mjs <town> [tile ...]
import fs from 'fs'
import { join } from 'path'
import { feed, buildProto } from '../_proto-feed.mjs'
import { OSM_TO_LU, layerLandEvidence } from '../../cartograph/derive.js'
import { unreadableFace } from '../../cartograph/osm-vocabulary.mjs'
import { classifyParcelLandUse, classifyUseFromText, loadCountyCodeTable, UNDERIVED } from '../../cartograph/parcel-landuse.mjs'
import { readSources } from '../../cartograph/sources.js'
import { LAND_USE_READERS } from '../../cartograph/states/index.mjs'
import { piecesOfIA, prepareEvidence } from '../../src/lib/tileGround.js'
import { differenceRings } from '../../src/lib/buildBlockGeometryV2.js'
const [town, ...want] = process.argv.slice(2)
export function evidenceFor(town) {
  const raw = `cartograph/data/${town}/raw`, osm = JSON.parse(fs.readFileSync(`${raw}/osm.json`))
  const _src = fs.readFileSync('cartograph/derive.js', 'utf8'), _m = _src.slice(_src.indexOf('const OSM_LU_DECLARED = {'))
  const DECL = new Set([..._m.slice(0, _m.indexOf('\n  }')).matchAll(/'([a-z_]+:[a-z_]+)'/g)].map(x => x[1]))
  const polys = []
  for (const [cat, key] of [['landuse', 'landuse'], ['leisure', 'leisure'], ['natural', 'natural'], ['amenity', 'amenity']])
    for (const f of osm.ground?.[cat] || []) { const sub = f.tags?.[key]; if (!sub) continue; const tag = `${cat}:${sub}`
      const u = unreadableFace(f); if ((u && u !== 'compound') || DECL.has(tag)) continue
      const lu = OSM_TO_LU[tag]; if (!lu || !(f.coords?.length >= 3)) continue
      polys.push({ lu, tag, ring: f.coords, holes: (f.holes || []).filter(h => h?.length >= 3) }) }
  const S = readSources(town), table = loadCountyCodeTable(town), parcels = []
  for (const d of S.parcels || []) for (const p of Object.values(JSON.parse(fs.readFileSync(join(raw, d.file))).parcels || {})) {
    let lu = null
    if (d.land_use_code_format === 'stl-assessor-numeric') lu = classifyParcelLandUse(p.land_use_code, d.jurisdiction, table)
    else if (LAND_USE_READERS[d.land_use_code_format] && p.land_use_code != null) { const u = LAND_USE_READERS[d.land_use_code_format](String(p.land_use_code)).use; lu = u === 'unknown' ? null : u }
    if (lu && lu !== UNDERIVED && p.rings?.length) parcels.push({ lu, rings: p.rings }) }
  return layerLandEvidence(polys, parcels)
}
import { fileURLToPath } from 'url'
if (town && fileURLToPath(import.meta.url) === (await import('path')).resolve(process.argv[1])) {
  const t0 = Date.now(), E = evidenceFor(town), t1 = Date.now()
  const f = feed(town); f.ribbons = { ...f.ribbons, landEvidence: E.evidence }
  const w = console.warn, warns = []; console.warn = (m) => warns.push(String(m))
  const g = buildProto(f, { protoArtifact: true, protoProducer: true }); console.warn = w
  const SA = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
  const ha = rs => Math.abs((rs || []).reduce((s, r) => s + SA(r), 0)) / 1e4
  console.log(`${town}: evidence ${E.evidence.length} region(s) in ${((t1 - t0) / 1000).toFixed(1)}s, parcel conflicts ${(E.parcelConflictM2 / 1e4).toFixed(2)} ha · build ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  console.log('  paint by class (ha): ' + Object.entries(g.luByClass).map(([k, v]) => [k, ha(v)]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · '))
  for (const ti of want.map(Number)) { const t = g.protoShapeTiles[ti]
    for (const p of piecesOfIA(t.iA)) { const parts = t.evidenceByPiece?.[p.i]; const by = {}
      for (const e of parts || []) by[e.lu] = (by[e.lu] || 0) + ha(e.rings)
      const tot = ha([p.outer, ...p.holes]), held = Object.values(by).reduce((a, b) => a + b, 0)
      console.log(`  tile ${ti} piece #${p.i} ${tot.toFixed(1)} ha, label ${t.luByPiece[p.i]}: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}${parts ? ` · underived ${(tot - held).toFixed(1)}` : ' (painted whole)'}`) } }
  { const groups = prepareEvidence(E.evidence), worst = []
    for (const [lu, paint] of Object.entries(g.luByClass)) { if (lu === 'underived' || lu === 'verge') continue
      const region = groups.filter(q => q.paint === lu).flatMap(q => q.rings.map(x => x.r))
      const per = paint.reduce((t, r) => { let q = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) q += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return t + q }, 0)
      const out = Math.abs(differenceRings(paint, region).reduce((t, r) => t + SA(r), 0)); if (out > per * 0.001) worst.push(`${lu} ${Math.round(out)} m²`) }
    console.log(`  paint outside its own evidence: ${worst.length ? '⛔ ' + worst.join(' · ') : '✅ none, every class'}`) }
  console.log(`  [LU] warnings: ${warns.filter(m => m.includes('[LU]')).length}${warns.some(m => m.includes('NO land evidence')) ? ' incl. NO land evidence ⛔' : ''}`)
}
