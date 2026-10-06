#!/usr/bin/env node
/**
 * fetch-address-points.mjs — acquire a town's declared street-address points into data/<scene>/raw/.
 *
 *   CARTOGRAPH_SCENE=huron node cartograph/fetch-address-points.mjs            (fetch + write)
 *   CARTOGRAPH_SCENE=huron node cartograph/fetch-address-points.mjs --dry-run  (count + one row, no write)
 *
 * Reads the town's `addressPoints` declaration (cartograph/sources.js) and, for each source, its provider's endpoint
 * and field composition (cartograph/address-points.mjs). Scoped to the town's geography bbox — the same envelope as
 * fetch-parcels.mjs. Each point is written with its composed address (no unit), its unit, local x/z and WGS84 lon/lat
 * (so a re-centre can re-derive x/z). ⛔ A partial set is refused, never written: a town with half its addresses looks
 * finished. Sibling of fetch-parcels.mjs. ⭐ The well's PROTOCOL picks the reader: ArcGIS (cartograph/arcgis-fetch.mjs) or
 * Socrata (cartograph/socrata-fetch.mjs); any other is refused by name.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { BBOX, mapRawDir, SCENE, wgs84ToLocal } from './config.js'
import { requireExplicitMap } from './scene.js'
import { readAddressPointSources, sourcesPath } from './sources.js'
import { ADDRESS_POINT_PROVIDERS } from './address-points.mjs'
import { arcgisGet } from './arcgis-fetch.mjs'
import { socrataFetchAll, socrataSample } from './socrata-fetch.mjs'

requireExplicitMap('fetch-address-points')
const dryRun = process.argv.includes('--dry-run')
const PAGE = 2000
const r2 = (v) => Math.round(v * 100) / 100, r7 = (v) => Math.round(v * 1e7) / 1e7

function fetchSource(src) {
  const prov = ADDRESS_POINT_PROVIDERS[src.provider]
  if (prov.protocol === 'arcgis') return fetchArcgis(src, prov)
  if (prov.protocol === 'socrata') return fetchSocrata(src, prov)
  throw new Error(`[${src.id}] provider "${src.provider}" is a ${prov.protocol} well — fetch-address-points.mjs reads arcgis and socrata (cartograph/states/index.mjs PROTOCOLS)`)
}

// One point, written the same way whichever protocol served it.
const toPoint = (c, lon, lat) => { const [x, z] = wgs84ToLocal(lon, lat); return { ...c, x: r2(x), z: r2(z), lon: r7(lon), lat: r7(lat) } }

function fetchSocrata(src, prov) {
  const endpoint = src.endpoint || prov.endpoint
  const tmp = join(mapRawDir(SCENE), '._address_points_page.json')
  const label = (count) => console.log(`  [${src.id}] ${count} point(s) in the envelope — ${src.attribution || prov.attribution}`)
  if (dryRun) {
    const { count, row } = socrataSample({ resource: endpoint, geomField: prov.geomField, where: src.where, select: prov.select, bbox: BBOX, tmpPath: tmp })
    label(count)
    if (row) console.log(`    sample: ${JSON.stringify(prov.compose(row))}`)
    return null
  }
  const { rows, count } = socrataFetchAll({ resource: endpoint, geomField: prov.geomField, where: src.where, select: prov.select, bbox: BBOX, tmpPath: tmp, log: label })
  const points = []
  let dropped = 0
  for (const row of rows) {
    const c = prov.compose(row)
    const [lon, lat] = row[prov.geomField]?.coordinates || []
    if (!c || !Number.isFinite(lon) || !Number.isFinite(lat)) { dropped++; continue }
    points.push(toPoint(c, lon, lat))
  }
  if (dropped) console.log(`    ⚠️ ${dropped} record(s) had no house number, no street name or no geometry — not addresses; dropped`)
  return { points, count, endpoint, attribution: src.attribution || prov.attribution }
}

function fetchArcgis(src, prov) {
  const endpoint = src.endpoint || prov.endpoint
  const get = (params) => arcgisGet(endpoint, params, join(mapRawDir(SCENE), '._address_points_page.json'))
  for (const k of ['minLon', 'minLat', 'maxLon', 'maxLat']) {
    if (!Number.isFinite(BBOX[k])) throw new Error(`geography.json bbox has no numeric \`${k}\` — cannot scope the fetch.`)
  }
  const base = {
    where: src.where || '1=1',
    geometry: JSON.stringify({ xmin: BBOX.minLon, ymin: BBOX.minLat, xmax: BBOX.maxLon, ymax: BBOX.maxLat }),
    geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: prov.outFields, orderByFields: 'OBJECTID', f: 'json',
  }
  const count = get({ ...base, returnCountOnly: 'true' }).count
  console.log(`  [${src.id}] ${count} point(s) in the envelope — ${src.attribution || prov.attribution}`)
  if (dryRun) {
    const one = get({ ...base, resultRecordCount: 1 }).features?.[0]
    if (one) console.log(`    sample: ${JSON.stringify(prov.compose(one.attributes))}`)
    return null
  }
  const points = []
  let dropped = 0
  for (let offset = 0; offset < count; offset += PAGE) {
    const page = get({ ...base, resultRecordCount: PAGE, resultOffset: offset })
    for (const ft of page.features || []) {
      const c = prov.compose(ft.attributes)
      const { x: lon, y: lat } = ft.geometry || {}
      if (!c || !Number.isFinite(lon) || !Number.isFinite(lat)) { dropped++; continue }
      points.push(toPoint(c, lon, lat))
    }
  }
  if (points.length + dropped !== count) {
    throw new Error(`[${src.id}] the server said ${count} points and returned ${points.length + dropped} — a partial set is a silently wrong town; refusing to write.`)
  }
  if (dropped) console.log(`    ⚠️ ${dropped} record(s) had no house number, no street name or no geometry — not addresses; dropped`)
  return { points, count, endpoint, attribution: src.attribution || prov.attribution }
}

function main() {
  console.log(`cartograph/fetch-address-points.mjs — scene=${SCENE}${dryRun ? ' (dry-run)' : ''}`)
  const d = readAddressPointSources(SCENE, ADDRESS_POINT_PROVIDERS)
  if (d.state === 'undeclared') {
    console.error(`⛔ "${SCENE}" declares no address points (no \`addressPoints\` in ${sourcesPath(SCENE)}). Declare a source, or declare none with a reason:\n  "addressPoints": [], "addressPoints_absent_reason": "<what was searched>"`)
    process.exit(2)
  }
  if (d.state === 'none') { console.log(`  DECLARED-NONE: ${d.absentReason}\n  Nothing to fetch — an honest zero.`); return }
  mkdirSync(mapRawDir(SCENE), { recursive: true })
  for (const src of d.sources) {
    const res = fetchSource(src)
    if (!res) continue
    const path = join(mapRawDir(SCENE), src.file)
    writeFileSync(path, JSON.stringify({
      meta: { scene: SCENE, source_id: src.id, provider: src.provider, attribution: res.attribution, endpoint: res.endpoint,
        fetched_bbox: BBOX, count: res.points.length, fetchedAt: new Date().toISOString() },
      points: res.points,
    }))
    const units = res.points.filter((p) => p.unit).length
    console.log(`  wrote ${path} (${res.points.length} points; ${units} carry a unit)`)
  }
}

main()
