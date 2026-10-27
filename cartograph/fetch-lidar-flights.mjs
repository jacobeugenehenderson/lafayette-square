#!/usr/bin/env node
/**
 * fetch-lidar-flights.mjs — WHEN EACH OF THE TOWN'S LIDAR SURVEYS FLEW, AND THE GEOID IT WAS DELIVERED ON
 * (BRIEF-the-shore-is-one-line; 2026-10-25).
 *
 * For every 3DEP project raw/elevation-sources.txt names, from USGS WESM (the work-unit metadata, 3DEPElevationIndex layer
 * 8): its flight window (collect_start … collect_end), its quality level and its stated GEOID. Then, from NOAA NGS's geoid
 * service, that geoid's height and the CURRENT model's (GEOID18) at the town, so the lidar's NAVD88 and the water record's
 * NAVD88 (VDatum, on the current model) are ONE basis: `toCurrentM` is added to the lidar (Huron: GEOID12B → GEOID18,
 * −0.034 m). ⛔ Read from the two stated models, never a typed offset. → raw/elevation-flights.json, a property of the
 * surveys, beside their source list.
 * ⛔ Refuses, by name: a source line with no 3DEP project · a project WESM does not know · a geoid NGS does not serve.
 *
 *   node cartograph/fetch-lidar-flights.mjs --scene=<id> [--dry]
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireExplicitMap } from './scene.js'
import { writeIfChanged } from './io.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WESM = 'https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/8/query'
const NGS_GEOID = 'https://geodesy.noaa.gov/api/geoid/ght'
export const FLIGHTS_FILE = 'elevation-flights.json'
/** NGS's geoid model ids (geodesy.noaa.gov/web_services/geoid.shtml), by the name WESM states. */
export const NGS_MODEL = { GEOID12A: 12, GEOID12B: 13, GEOID18: 14 }
/** The model the water record's NAVD88 is on: VDatum's current NAD83(2011) ↔ NAVD88 geoid. */
export const CURRENT_GEOID = 'GEOID18'

/** The 3DEP project of every URL in an elevation source list (…/Projects/<project>/…). ⛔ A line without one refuses. */
export function projectsOf(listText) {
  const out = new Set()
  for (const l of listText.split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'))) {
    const m = l.match(/\/Projects\/([^/]+)\//)
    if (!m) throw new Error(`⛔ fetch-lidar-flights: '${l}' names no 3DEP project, so when it flew cannot be asked`)
    out.add(m[1])
  }
  return [...out]
}

/** { project: { workunits, start, end, ql, geoid } } from WESM for the bbox. ⛔ A project WESM does not know refuses. */
export async function flightWindows(projects, bbox, { fetcher = fetch } = {}) {
  const q = new URLSearchParams({ geometry: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`, geometryType: 'esriGeometryEnvelope',
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'project,workunit,collect_start,collect_end,ql,geoid', returnGeometry: 'false', f: 'json' })
  const r = await fetcher(`${WESM}?${q}`)
  if (!r.ok) throw new Error(`⛔ WESM: HTTP ${r.status}`)
  const j = await r.json()
  if (j.error) throw new Error(`⛔ WESM: ${j.error.message || JSON.stringify(j.error)}`)
  const out = {}
  for (const p of projects) {
    const rows = (j.features || []).map(f => f.attributes).filter(a => a.project === p)
    if (!rows.length) throw new Error(`⛔ fetch-lidar-flights: WESM knows no work unit of project '${p}' over this town — its flight window cannot be named`)
    const ms = (k, f) => f(...rows.map(a => a[k]).filter(Number.isFinite))
    const start = ms('collect_start', Math.min), end = ms('collect_end', Math.max)
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`⛔ fetch-lidar-flights: WESM's '${p}' carries no collect_start/collect_end`)
    const geoids = [...new Set(rows.map(a => a.geoid).filter(Boolean))]
    if (geoids.length !== 1) throw new Error(`⛔ fetch-lidar-flights: WESM's '${p}' states ${geoids.length ? `${geoids.length} geoids (${geoids.join(', ')})` : 'no geoid'} — its heights cannot be put on one basis`)
    out[p] = { workunits: [...new Set(rows.map(a => a.workunit))], start: new Date(start).toISOString().slice(0, 10), end: new Date(end).toISOString().slice(0, 10),
      ql: [...new Set(rows.map(a => a.ql).filter(Boolean))].join(', ') || null, geoid: geoids[0] }
  }
  return out
}

/** A geoid model's height N at (lat, lon), from NGS. ⛔ A model NGS does not serve refuses by name. */
export async function geoidHeight(model, lat, lon, { fetcher = fetch } = {}) {
  const id = NGS_MODEL[model]
  if (!id) throw new Error(`⛔ fetch-lidar-flights: geoid '${model}' has no NGS model id (known: ${Object.keys(NGS_MODEL).join(', ')})`)
  const r = await fetcher(`${NGS_GEOID}?lat=${lat}&lon=${lon}&model=${id}`)
  if (!r.ok) throw new Error(`⛔ NGS geoid ${model}: HTTP ${r.status}`)
  const j = await r.json()
  if (!Number.isFinite(+j.geoidHeight) || j.geoidModel !== model) throw new Error(`⛔ NGS geoid: asked ${model}, answered ${j.geoidModel} ${j.geoidHeight}`)
  return { nM: +j.geoidHeight, errorM: +j.error }
}

/** Each project's geoid against the current one at (lat, lon): H_current = H_lidar + toCurrentM (= N_lidar − N_current). */
export async function geoidToCurrent(windows, lat, lon, opts = {}) {
  const cur = await geoidHeight(CURRENT_GEOID, lat, lon, opts)
  for (const w of Object.values(windows)) {
    const own = w.geoid === CURRENT_GEOID ? cur : await geoidHeight(w.geoid, lat, lon, opts)
    w.geoidAt = { lat, lon, model: w.geoid, nM: own.nM, current: CURRENT_GEOID, currentNM: cur.nM, toCurrentM: +(own.nM - cur.nM).toFixed(4) }
  }
  return windows
}

/** The lidar's own correction to the record's basis, from raw/elevation-flights.json. ⛔ No record, or projects on
 *  different geoids at different offsets, REFUSES: one surface cannot carry two corrections. */
export function lidarToRecordM(flights, scene) {
  if (!flights?.projects) throw new Error(`⛔ ${scene}: no raw/${FLIGHTS_FILE} — the lidar's geoid is unknown, so its heights cannot meet the water record's. ▶ node cartograph/fetch-lidar-flights.mjs --scene=${scene}`)
  const ds = [...new Set(Object.values(flights.projects).map(p => p.geoidAt?.toCurrentM))]
  if (ds.length !== 1 || !Number.isFinite(ds[0])) throw new Error(`⛔ ${scene}: raw/${FLIGHTS_FILE} gives ${ds.length} geoid corrections (${ds.join(', ')}) — one surface takes one`)
  return ds[0]
}

/** THE LIDAR ONTO THE WATER RECORD'S BASIS, for a town's data dir: the metres to add to every lidar height (its stated geoid
 *  → the current one), or null where the town has no water record (no level to meet: the lidar is left as read). One rule
 *  for every reader that compares the lidar with a level: bake-terrain and claims-the-dry-bed-record-is-the-lidar. */
export function lidarOntoRecordM(mapDir, scene) {
  if (!existsSync(join(mapDir, 'raw', 'water-datums.json'))) return null
  const fp = join(mapDir, 'raw', FLIGHTS_FILE)
  return lidarToRecordM(existsSync(fp) ? JSON.parse(readFileSync(fp, 'utf8')) : null, scene)
}

async function main() {
  const scene = requireExplicitMap('fetch-lidar-flights.mjs (writes raw/elevation-flights.json)')
  const raw = join(ROOT, 'cartograph', 'data', scene, 'raw')
  for (const f of ['osm.json', 'elevation-sources.txt'])
    if (!existsSync(join(raw, f))) { console.error(`⛔ fetch-lidar-flights: ${scene} has no raw/${f}`); process.exit(2) }
  const bbox = JSON.parse(readFileSync(join(raw, 'osm.json'), 'utf8')).bbox
  const windows = await flightWindows(projectsOf(readFileSync(join(raw, 'elevation-sources.txt'), 'utf8')), bbox)
  const lat = +((bbox.minLat + bbox.maxLat) / 2).toFixed(5), lon = +((bbox.minLon + bbox.maxLon) / 2).toFixed(5)
  await geoidToCurrent(windows, lat, lon)
  for (const [p, w] of Object.entries(windows)) console.log(`  FLIGHT: ${p} (${w.workunits.join(', ')}, ${w.ql}) flown ${w.start} … ${w.end} · ${w.geoid} → ${CURRENT_GEOID}: ${w.geoidAt.toCurrentM >= 0 ? '+' : ''}${w.geoidAt.toCurrentM} m at the town`)
  const out = { fetchedOn: new Date().toISOString().slice(0, 10), from: 'USGS WESM (3DEPElevationIndex layer 8) for the projects of raw/elevation-sources.txt; NOAA NGS api/geoid/ght for the geoids', projects: windows }
  if (process.argv.includes('--dry')) { console.log(JSON.stringify(out, null, 1)); return }
  mkdirSync(raw, { recursive: true })
  writeIfChanged(join(raw, FLIGHTS_FILE), JSON.stringify(out, null, 2) + '\n')
  console.log(`  wrote raw/${FLIGHTS_FILE}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message || e); process.exit(3) })
