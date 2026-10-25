#!/usr/bin/env node
/**
 * fetch-flight-water.mjs — WHEN THE LIDAR FLEW, AND WHERE THE WATER STOOD THEN (BRIEF-the-shore-is-one-line; Boz's ruling of
 * Jacob's method, 2026-10-25).
 *
 * *"If we have the bathymetry and a depth stick at an agreed upon point, we could just fill it to the current actual
 * average."* A lidar does not see the ground under the water it flew over. So the coast at the town's level can be traced
 * from the lidar only above the water that stood on the flight days; the band between the town's level and that water is
 * the bathymetry's. This file records the two facts that band is made of:
 *   1. THE FLIGHT WINDOW of each survey the town's DEM is made of (raw/elevation-sources.txt names the project in every URL),
 *      from USGS WESM, the 3DEP work-unit metadata (3DEPElevationIndex layer 8: collect_start, collect_end). A property of
 *      the SURVEY, recorded beside its source list → raw/elevation-flights.json.
 *   2. THE GAUGE OVER THAT WINDOW: the town's own water gauge (raw/water-datums.json's station), its monthly means and
 *      monthly HIGHEST observed water for every month the window touches → raw/water-during-flights.json, in the gauge's
 *      datum and in NAVD88 (waterDatums.mjs#igld85ToNavd88, the record's own conversion). ⭐ `bandTop` is the highest
 *      observed (Boz, 2026-10-25): below it the ground is the bathymetry's, above it the lidar's.
 * ⛔ A LAKE ONLY. A TIDAL town's flight-day water changes by the hour, so its band needs the acquisition time of each
 *    flight line (not in WESM's work-unit record): it REFUSES, by name, until that reader is built.
 * ⛔ Refuses, by name: a DEM with no project in its URLs (a hand tile) · a project WESM does not know · a gauge with no
 *    monthly mean in the window · a month outside the record's converted heights.
 *
 *   node cartograph/fetch-flight-water.mjs --scene=<id> [--dry]
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireExplicitMap } from './scene.js'
import { writeIfChanged } from './io.js'
import { igld85ToNavd88 } from './waterDatums.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WESM = 'https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/8/query'
const COOPS_DATA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
export const FLIGHTS_FILE = 'elevation-flights.json'
export const FLIGHT_WATER_FILE = 'water-during-flights.json'

/** The 3DEP project of every URL in an elevation source list (…/Projects/<project>/…). ⛔ A line without one refuses. */
export function projectsOf(listText) {
  const out = new Set()
  for (const l of listText.split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'))) {
    const m = l.match(/\/Projects\/([^/]+)\//)
    if (!m) throw new Error(`⛔ fetch-flight-water: '${l}' names no 3DEP project, so when it flew cannot be asked`)
    out.add(m[1])
  }
  return [...out]
}

/** { project: { workunit, start, end } } from WESM for the bbox. ⛔ A project WESM does not know refuses by name. */
export async function flightWindows(projects, bbox, { fetcher = fetch } = {}) {
  const q = new URLSearchParams({ geometry: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`, geometryType: 'esriGeometryEnvelope',
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'project,workunit,collect_start,collect_end', returnGeometry: 'false', f: 'json' })
  const r = await fetcher(`${WESM}?${q}`)
  if (!r.ok) throw new Error(`⛔ WESM: HTTP ${r.status}`)
  const j = await r.json()
  if (j.error) throw new Error(`⛔ WESM: ${j.error.message || JSON.stringify(j.error)}`)
  const out = {}
  for (const p of projects) {
    const rows = (j.features || []).map(f => f.attributes).filter(a => a.project === p)
    if (!rows.length) throw new Error(`⛔ fetch-flight-water: WESM knows no work unit of project '${p}' over this town — its flight window cannot be named`)
    const ms = (k, f) => f(...rows.map(a => a[k]).filter(Number.isFinite))
    const start = ms('collect_start', Math.min), end = ms('collect_end', Math.max)
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`⛔ fetch-flight-water: WESM's '${p}' carries no collect_start/collect_end`)
    out[p] = { workunits: [...new Set(rows.map(a => a.workunit))], start: new Date(start).toISOString().slice(0, 10), end: new Date(end).toISOString().slice(0, 10) }
  }
  return out
}

/** The months [y, m] a window [start, end] (YYYY-MM-DD) touches. */
export function monthsOf(start, end) {
  const out = []
  let y = +start.slice(0, 4), m = +start.slice(5, 7)
  const Y = +end.slice(0, 4), M = +end.slice(5, 7)
  while (y < Y || (y === Y && m <= M)) { out.push([y, m]); if (++m > 12) { m = 1; y++ } }
  return out
}

/** A lake gauge's monthly means over each window, in the gauge's datum (IGLD85) and NAVD88 (the record's conversion). */
export async function gaugeOverWindows(D, windows, scene, { fetcher = fetch } = {}) {
  if (D.kind === 'tidal') throw new Error(`⛔ fetch-flight-water: '${scene}' is TIDAL — its flight-day water changes by the hour, so the band needs each flight line's acquisition time, which WESM's work units do not carry. Not built (Boz, 2026-10-25).`)
  if (D.kind !== 'lake') throw new Error(`⛔ fetch-flight-water: '${scene}''s water record is '${D.kind}' — there is no gauge to read`)
  const toNavd = igld85ToNavd88(D, scene)
  const out = {}
  for (const [project, w] of Object.entries(windows)) {
    const months = []
    for (const [y, m] of monthsOf(w.start, w.end)) {
      const mm = String(m).padStart(2, '0'), last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const r = await fetcher(`${COOPS_DATA}?product=monthly_mean&station=${D.station.id}&begin_date=${y}${mm}01&end_date=${y}${mm}${last}&datum=IGLD&units=metric&time_zone=gmt&format=json&application=cartograph-kit`)
      if (!r.ok) throw new Error(`⛔ CO-OPS ${D.station.id} ${y}-${mm}: HTTP ${r.status}`)
      const row = ((await r.json()).data || [])[0] || {}, v = +row.MSL, top = +row.highest
      if (!(v > 0)) throw new Error(`⛔ fetch-flight-water: gauge ${D.station.name} (${D.station.id}) has no monthly mean for ${y}-${mm}, inside '${project}''s flight window — the water on the flight days cannot be named`)
      if (!(top > 0)) throw new Error(`⛔ fetch-flight-water: gauge ${D.station.name} (${D.station.id}) has no highest observed water for ${y}-${mm}, inside '${project}''s flight window — the band's top cannot be read`)
      months.push({ month: `${y}-${mm}`, igld85M: v, navd88M: +toNavd(v).toFixed(3), highestIgld85M: top, highestNavd88M: +toNavd(top).toFixed(3) })
    }
    const hi = months.reduce((a, b) => (b.igld85M > a.igld85M ? b : a)), lo = months.reduce((a, b) => (b.igld85M < a.igld85M ? b : a))
    // ⭐ THE BAND'S TOP (Boz, 2026-10-25): the HIGHEST WATER OBSERVED in any month the window touches (a partial month
    // counts whole). It bounds every flight day's water from above, so the lidar is trusted only where no flight could have
    // flown over water; read, never a sum of statistics. (Future work, filed: each tile's own GPS time against the hourly record.)
    const peak = months.reduce((a, b) => (b.highestIgld85M > a.highestIgld85M ? b : a))
    out[project] = { window: w, months, highest: hi, lowest: lo, bandTop: { month: peak.month, igld85M: peak.highestIgld85M, navd88M: peak.highestNavd88M } }
  }
  return out
}

async function main() {
  const scene = requireExplicitMap('fetch-flight-water.mjs (writes raw/elevation-flights.json, raw/water-during-flights.json)')
  const raw = join(ROOT, 'cartograph', 'data', scene, 'raw')
  for (const f of ['osm.json', 'elevation-sources.txt', 'water-datums.json'])
    if (!existsSync(join(raw, f))) { console.error(`⛔ fetch-flight-water: ${scene} has no raw/${f}`); process.exit(2) }
  const bbox = JSON.parse(readFileSync(join(raw, 'osm.json'), 'utf8')).bbox
  const projects = projectsOf(readFileSync(join(raw, 'elevation-sources.txt'), 'utf8'))
  const windows = await flightWindows(projects, bbox)
  for (const [p, w] of Object.entries(windows)) console.log(`  FLIGHT: ${p} (${w.workunits.join(', ')}) flown ${w.start} … ${w.end}`)
  const D = JSON.parse(readFileSync(join(raw, 'water-datums.json'), 'utf8'))
  const water = await gaugeOverWindows(D, windows, scene)
  for (const [p, g] of Object.entries(water)) console.log(`  WATER while ${p} flew (${D.station.name}, ${g.months.length} month(s)): monthly means ${g.lowest.navd88M} … ${g.highest.navd88M} m NAVD88 (${g.lowest.month} … ${g.highest.month}) · BAND TOP = the highest observed ${g.bandTop.navd88M} m (${g.bandTop.month}), ${(g.bandTop.navd88M - g.highest.navd88M).toFixed(3)} m over the highest mean`)
  const stamp = { fetchedOn: new Date().toISOString().slice(0, 10) }
  const flights = { ...stamp, from: 'USGS WESM (3DEPElevationIndex layer 8: collect_start, collect_end), the projects of raw/elevation-sources.txt', projects: windows }
  const during = { ...stamp, from: `NOAA CO-OPS ${D.station.id} ${D.station.name} monthly means (IGLD85) over each flight window; NAVD88 by raw/water-datums.json's own conversion`, projects: water }
  if (process.argv.includes('--dry')) { console.log(JSON.stringify({ flights, during }, null, 1)); return }
  mkdirSync(raw, { recursive: true })
  writeIfChanged(join(raw, FLIGHTS_FILE), JSON.stringify(flights, null, 2) + '\n')
  writeIfChanged(join(raw, FLIGHT_WATER_FILE), JSON.stringify(during, null, 2) + '\n')
  console.log(`  wrote raw/${FLIGHTS_FILE} · raw/${FLIGHT_WATER_FILE}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message || e); process.exit(3) })
