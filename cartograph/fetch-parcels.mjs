#!/usr/bin/env node
/**
 * fetch-parcels.mjs — THE ASSESSOR BUTTON.
 *
 * `INTAKE-CATALOGUE §4.2`: *"where a source has a programmatic endpoint, the row's
 * acquisition is ONE BUTTON — not an instruction."* Its own table filed the assessor as
 * *"per-jurisdiction ArcGIS/Socrata | varies — needs a per-town endpoint field."*
 * `cartograph/sources.js` is that field; this is the button that reads it.
 *
 * ⛔ WHAT THIS REPLACES, and why the replacement is the deliverable: two Python scripts
 * (`scripts/03-fetch-stl-parcels.py`, `03b-fetch-stlco-parcels.py`) with the endpoint,
 * the column names and the output filename all baked into the source. Town #2 could not
 * run either one. Nothing here knows the name of a city.
 *
 * Usage:
 *   CARTOGRAPH_SCENE=huron node cartograph/fetch-parcels.mjs
 *   CARTOGRAPH_SCENE=huron node cartograph/fetch-parcels.mjs --dry-run   (count + one row, no write)
 *
 * Output: data/<scene>/raw/<declared file>, in the SAME schema the St. Louis scripts
 * emit, so `bake-content.js#loadParcels` consumes every town identically.
 */

import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { BBOX, mapRawDir, SCENE, wgs84ToLocal } from './config.js'
import { requireExplicitMap } from './scene.js'
import { readSources, undeclaredMessage, sourcesPath, PARCEL_FIELDS } from './sources.js'

// ⛔ WRITES into data/<scene>/raw/. Refuse an unnamed scene (scene.js).
requireExplicitMap('fetch-parcels')

const dryRun = process.argv.includes('--dry-run')
const UA = 'lafayette-square-cartograph/1.0 (neighborhood pour kit)'
const PAGE = 2000

// ⭐ curl to a FILE, not through a pipe — the same reason `fetch.js` does: a county
// parcel layer over a generous envelope runs to tens of MB and a pipe's maxBuffer
// becomes a silent ceiling on how big a town may be.
// ⛔ execFileSync with an ARGV, never a shell string. A `where` clause is operator text
// from the declaration (`County = 'Erie'`) and interpolating it into a shell command is
// both an injection and, more prosaically, four different quoting bugs.
function getJson(url, params) {
  const tmp = join(mapRawDir(SCENE), '._parcels_page.json')
  const args = ['-sS', '-m', '180', '-A', UA, '-o', tmp, '--get']
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`)
  args.push(url)
  try {
    execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'inherit'] })
    const txt = readFileSync(tmp, 'utf8')
    let j
    try { j = JSON.parse(txt) } catch {
      throw new Error(`endpoint did not return JSON (first 200 chars): ${txt.slice(0, 200)}`)
    }
    // ⛔ ArcGIS reports failure INSIDE a 200. A page that errors must not read as "no
    // more pages" — that is how a partial fetch becomes a town with half its parcels
    // and nothing to say about it.
    if (j.error) throw new Error(`ArcGIS error ${j.error.code}: ${j.error.message} ${(j.error.details || []).join('; ')}`)
    return j
  } finally { rmSync(tmp, { force: true }) }
}

function ringCentroid(rings) {
  let sx = 0, sy = 0, n = 0
  for (const ring of rings) for (const pt of ring) { sx += pt[0]; sy += pt[1]; n++ }
  return n ? [sx / n, sy / n] : [0, 0]
}

const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(+v) ? +v : null))
const str = (v) => (v === null || v === undefined ? null : String(v).replace(/\s+/g, ' ').trim() || null)

/**
 * ⭐⭐ THE ABSENT LIST IS ENFORCED HERE, NOT TRUSTED.
 * A field the declaration calls `absent` is written as `null` no matter what the server
 * sent, and a field it calls `provided` must have a `fields` mapping. So a declaration
 * that lies in either direction is caught at fetch time, on the town it lies about,
 * instead of surfacing as a column of zeros in a roster six steps downstream.
 */
function extract(attrs, geometry, src) {
  if (!geometry || !Array.isArray(geometry.rings) || !geometry.rings.length) return null
  const f = src.fields || {}
  const absent = new Set(src.absent || [])
  const raw = (ourField) => (absent.has(ourField) ? null : (f[ourField] ? attrs[f[ourField]] : null))

  const rings = geometry.rings
  const [clon, clat] = ringCentroid(rings)
  const [cx, cz] = wgs84ToLocal(clon, clat)
  const toLocal = (r) => r.map(([lon, lat]) => { const [x, z] = wgs84ToLocal(lon, lat); return [Math.round(x * 100) / 100, Math.round(z * 100) / 100] })

  const hd = raw('historic_district')
  return {
    handle: str(raw('handle')),
    address: str(raw('address')),
    owner: str(raw('owner')),
    year_built: num(raw('year_built')),
    building_sqft: num(raw('building_sqft')),
    land_area: num(raw('land_area')),
    appraised_value: num(raw('appraised_value')),
    land_use_code: str(raw('land_use_code')),
    zoning: str(raw('zoning')),
    units: num(raw('units')),
    num_buildings: num(raw('num_buildings')),
    // ⛔ `vacant: false` and `vacant: null` are different claims. A well that does not
    // carry the flag must not assert "not vacant" about every parcel in the town.
    vacant: absent.has('vacant') ? null : !!raw('vacant'),
    historic_district: absent.has('historic_district') ? null
      : { national: !!hd, local: false, certified_local: false },
    municipality: str(raw('municipality')),
    jurisdiction: src.jurisdiction,
    source_id: src.id,
    centroid: [Math.round(cx * 100) / 100, Math.round(cz * 100) / 100],
    // ⭐ WGS84 ground truth so `reproject-raw.js` can re-derive centroid/rings on any
    // re-center. Without these a re-center strands the parcels in the old frame and
    // scrambles every roster address (it did, 2026-07-08).
    centroid_ll: [Math.round(clon * 1e7) / 1e7, Math.round(clat * 1e7) / 1e7],
    rings: rings.map(toLocal),
    rings_ll: rings.map(r => r.map(([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7])),
  }
}

function fetchSource(src) {
  if (!src.endpoint) {
    console.log(`  [${src.id}] no endpoint declared — hand-placed file, nothing to fetch.`)
    return null
  }
  const provided = src.provides || []
  const unmapped = provided.filter(k => !(src.fields || {})[k])
  if (unmapped.length) {
    throw new Error(`[${src.id}] declares ${unmapped.join(', ')} as PROVIDED but maps no column for them in \`fields\`.`)
  }
  const outFields = [...new Set(Object.values(src.fields || {}))].join(',') || '*'
  // ⛔ BBOX is geography.json's bbox verbatim (`config.js:63`) — the FRAME envelope, the
  // same one `fetch.js` pulls OSM over, so parcels and OSM cover identical ground. Named
  // keys, not a `??` chain: if the frame record ever changes shape this must fail here
  // rather than quietly fetch a box of `undefined`.
  for (const k of ['minLon', 'minLat', 'maxLon', 'maxLat']) {
    if (!Number.isFinite(BBOX[k])) throw new Error(`geography.json bbox has no numeric \`${k}\` — cannot scope the parcel fetch.`)
  }
  const geometry = JSON.stringify({ xmin: BBOX.minLon, ymin: BBOX.minLat, xmax: BBOX.maxLon, ymax: BBOX.maxLat })
  const base = {
    where: src.where || '1=1',
    geometry, geometryType: 'esriGeometryEnvelope',
    inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields, returnGeometry: 'true', f: 'json',
  }

  const count = getJson(src.endpoint, { ...base, returnCountOnly: 'true', returnGeometry: 'false' }).count
  console.log(`  [${src.id}] ${count} parcel(s) intersect the envelope — ${src.attribution || src.endpoint}`)
  if (dryRun) {
    const one = getJson(src.endpoint, { ...base, resultRecordCount: 1 })
    const feat = (one.features || [])[0]
    if (feat) console.log(`    sample: ${JSON.stringify(extract(feat.attributes, feat.geometry, src)).slice(0, 300)}…`)
    return { count, parcels: [] }
  }

  const parcels = []
  let offset = 0, skipped = 0
  while (true) {
    const page = getJson(src.endpoint, { ...base, resultRecordCount: PAGE, resultOffset: offset })
    const feats = page.features || []
    if (!feats.length) break
    for (const ft of feats) {
      const rec = extract(ft.attributes, ft.geometry, src)
      if (rec) parcels.push(rec); else skipped++
    }
    offset += feats.length
    console.log(`    …${parcels.length}/${count}`)
    if (!page.exceededTransferLimit && feats.length < PAGE) break
    if (offset >= count) break
  }
  // ⛔ A SHORT FETCH IS A FAILURE, NOT A RESULT. The server told us how many parcels
  // intersect; coming back with fewer means a page failed, a limit truncated us, or the
  // layer changed under the paging cursor. Proceeding would pour a town missing a
  // district and never say which one.
  if (parcels.length + skipped < count) {
    throw new Error(`[${src.id}] fetched ${parcels.length + skipped} of ${count} parcels the server reported. ` +
      `A partial parcel set is a silently wrong town — refusing to write.`)
  }
  if (skipped) console.log(`    ⚠️ ${skipped} parcel(s) had no polygon geometry and were dropped`)
  return { count, parcels }
}

function main() {
  console.log('='.repeat(60))
  console.log(`cartograph/fetch-parcels.mjs — scene=${SCENE}${dryRun ? ' (dry-run)' : ''}`)
  console.log('='.repeat(60))

  const s = readSources(SCENE)
  if (!s.declared) {
    console.error('\n' + undeclaredMessage(SCENE, sourcesPath(SCENE)) + '\n')
    process.exit(2)
  }
  if (!s.parcels.length) {
    console.log(`\n  DECLARED-NONE: ${s.absentReason}`)
    console.log(`  Nothing to fetch. This is an honest zero, not a gap.\n`)
    return
  }

  mkdirSync(mapRawDir(SCENE), { recursive: true })
  for (const src of s.parcels) {
    const res = fetchSource(src)
    if (!res || dryRun) continue
    const out = {
      meta: {
        scene: SCENE, source_id: src.id, jurisdiction: src.jurisdiction,
        attribution: src.attribution || null, endpoint: src.endpoint,
        fetched_bbox: BBOX, count: res.parcels.length,
        // ⭐ The absent list TRAVELS WITH THE DATA. A reader holding only this file must
        // be able to tell an empty column from a column this well never had.
        provides: src.provides || [], absent: src.absent || [],
      },
      parcels: res.parcels,
    }
    const path = join(mapRawDir(SCENE), src.file)
    writeFileSync(path, JSON.stringify(out, null, 2))
    const filled = {}
    for (const f of PARCEL_FIELDS) filled[f] = res.parcels.filter(p => p[f] !== null && p[f] !== '' && p[f] !== 0).length
    console.log(`  wrote ${path} (${res.parcels.length} parcels)`)
    console.log(`    filled: ${Object.entries(filled).filter(([, n]) => n).map(([f, n]) => `${f} ${n}`).join(' · ') || '(nothing)'}`)
    const declaredAbsent = (src.absent || []).join(', ')
    if (declaredAbsent) console.log(`    declared ABSENT (null by construction): ${declaredAbsent}`)
  }
  console.log('='.repeat(60))
}

main()
