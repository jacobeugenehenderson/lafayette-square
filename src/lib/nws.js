/**
 * nws — the town's weather from the US National Weather Service (api.weather.gov). Pure: no React, no store; the
 * browser hook (hooks/useWeather.js) and the node check/probe both call it.
 *
 * ⭐ WHY NWS (2026-10-20, Jacob's licence review). The feed was Open-Meteo's free API, whose terms allow
 * "non-commercial purposes" only; this is a commercial product. api.weather.gov is a US federal service: public
 * domain, free, no key, CORS-open (`access-control-allow-origin: *`, `User-Agent` allowed in a preflight). It asks
 * for a User-Agent naming the application. ⛔ It covers the US only — a town outside it THROWS an
 * OutsideCoverageError naming the town. There is no second provider to fall back to, by design.
 *
 *   /points/{lat},{lon}            → the town's forecast office + grid cell, and its observation stations
 *   /gridpoints/{wfo}/{x},{y}      → the raw grid forecast: every quantity as time-stamped periods, in stated units
 *   /stations/{id}/observations    → pressure (the grid has no pressure layer), for the reading and its 3 h trend
 *
 * A reading (what lib/weatherAt.js reads), per quantity → its NWS source:
 *   temperatureF      grid `temperature` (°C → °F)
 *   humidity          grid `relativeHumidity` (%)
 *   cloudCover        grid `skyCover` (%)
 *   precipitation     grid `quantitativePrecipitation` (mm over the period) ÷ the period's hours → mm/h, the period's mean
 *   visibility        grid `visibility` (m) — sparse: null for an hour no period covers
 *   windSpeedMs       grid `windSpeed` (km/h → m/s)      windDirDeg  grid `windDirection` (° FROM)
 *   windGustsMs       grid `windGust` (km/h → m/s)
 *   weatherCode       grid `weather` (coverage · type · intensity) → a WMO code by WMO_OF below; no weather → the
 *                     sky-cover code (skyCode). The kit's consumers speak WMO; NWS does not.
 *   pressureMb        observed `barometricPressure` (Pa → mb) at the first station NWS lists for the point that reports it. It is the
 *                     altimeter setting (KCPS 2026-10-20: 102878.48 Pa = 30.38 inHg exactly), not sea-level pressure.
 *                     Set on the current reading and on past hours an observation falls within 30 min of; null ahead.
 *   directRadiation, diffuseRadiation   ⛔ NOT SUPPLIED by NWS — always null (the modulators' `direct_ratio` is then
 *                     unavailable, which weather-signals.js already reads as "no signal").
 * The hourly series runs from the grid's first hour (NWS's grid starts early today, not yesterday) to `hoursAhead`.
 * ⛔ A layer whose unit is not the one converted from THROWS — the 2026-09-26 km/h-read-as-m/s defect, closed at the
 * parse. ▶ node checks/claims-the-weather-feed-arrives-in-the-units-we-read.mjs
 */

export const NWS_ROOT = 'https://api.weather.gov'
// NWS asks every caller to identify itself. A browser may not send this (Chrome drops a script-set User-Agent); the
// node callers do. No contact address here — that is the operator's to add.
export const NWS_HEADERS = { 'User-Agent': 'the-ward-kit (lafayette-square.com)', Accept: 'application/geo+json' }

export class OutsideCoverageError extends Error {}

const F = (c) => c * 9 / 5 + 32
const MS = (kmh) => kmh / 3.6
const same = (v) => v
/** grid layer → [the unit NWS must state, the conversion into the reading's unit, the reading's field]. */
export const GRID_UNITS = {
  temperature:               ['wmoUnit:degC', F, 'temperatureF'],
  relativeHumidity:          ['wmoUnit:percent', same, 'humidity'],
  skyCover:                  ['wmoUnit:percent', same, 'cloudCover'],
  quantitativePrecipitation: ['wmoUnit:mm', same, 'precipitation'],   // ÷ period hours below
  visibility:                ['wmoUnit:m', same, 'visibility'],
  windSpeed:                 ['wmoUnit:km_h-1', MS, 'windSpeedMs'],
  windDirection:             ['wmoUnit:degree_(angle)', same, 'windDirDeg'],
  windGust:                  ['wmoUnit:km_h-1', MS, 'windGustsMs'],
}
export const PRESSURE_UNIT = 'wmoUnit:Pa'

/**
 * NWS weather type → WMO code, by intensity [light, moderate, heavy]. NWS writes an unqualified "rain" for moderate
 * (Directive 10-503), so a null intensity reads as moderate; very_light reads as light.
 * `null` = a type the kit has no WMO picture for (haze, smoke, dust, frost…): the hour takes its sky-cover code.
 * ⛔ A type not listed here THROWS — a new NWS type is said, never drawn as clear.
 */
export const WMO_OF = {
  drizzle: [51, 53, 55], freezing_drizzle: [56, 57, 57],
  rain: [61, 63, 65], freezing_rain: [66, 67, 67], rain_showers: [80, 81, 82],
  snow: [71, 73, 75], snow_showers: [85, 85, 86],
  sleet: [79, 79, 79],                       // WMO 79 = ice pellets
  thunderstorms: [95, 95, 95], hail: [96, 96, 99],
  fog: [45, 45, 45], freezing_fog: [48, 48, 48], ice_fog: [48, 48, 48],
  ice_crystals: null, blowing_dust: null, blowing_sand: null, blowing_snow: null, dust: null, sand: null,
  haze: null, smoke: null, frost: null, freezing_spray: null, volcanic_ash: null, water_spouts: null,
}
const TIER = { very_light: 0, light: 0, moderate: 1, heavy: 2 }

/** The dry WMO code a cloud cover (%) supports — also how useWeather.js downgrades a code claiming rain that isn't falling. */
export function skyCode(cloudCoverPct) {
  const cc = cloudCoverPct ?? 0
  if (cc < 12) return 0   // clear
  if (cc < 50) return 1   // mainly clear
  if (cc < 87) return 2   // partly cloudy
  return 3                // overcast
}

/** One `weather` period's entries + the hour's sky cover → a WMO code. The first-listed weather is the hour's. */
export function wmoOf(entries, cloudCoverPct) {
  const e = (entries || []).find((x) => x?.weather)
  if (!e) return skyCode(cloudCoverPct)
  if (!(e.weather in WMO_OF)) throw new Error(`[nws] ⛔ NWS weather type "${e.weather}" has no WMO mapping — add it to WMO_OF`)
  const codes = WMO_OF[e.weather]
  if (!codes) return skyCode(cloudCoverPct)
  if (e.intensity != null && !(e.intensity in TIER)) throw new Error(`[nws] ⛔ NWS intensity "${e.intensity}" is not known`)
  return codes[e.intensity == null ? 1 : TIER[e.intensity]]
}

/** ISO-8601 "start/duration" → [startMs, endMs]. */
export function periodOf(validTime) {
  const [s, d] = String(validTime).split('/')
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(d || '')
  const start = Date.parse(s)
  if (!m || !Number.isFinite(start)) throw new Error(`[nws] ⛔ unreadable validTime "${validTime}"`)
  const ms = ((+m[1] || 0) * 24 * 60 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60000
  if (!(ms > 0)) throw new Error(`[nws] ⛔ validTime "${validTime}" has no duration`)
  return [start, start + ms]
}

/** A grid layer → its periods, in the reading's unit. ⛔ Throws on a missing layer or an unexpected unit. */
export function layerOf(grid, name) {
  const layer = grid[name]
  if (!layer || !Array.isArray(layer.values)) throw new Error(`[nws] ⛔ the grid forecast carries no "${name}" layer`)
  const [uom, conv] = GRID_UNITS[name]
  if (layer.values.length && layer.uom !== uom) throw new Error(`[nws] ⛔ grid "${name}" arrives in ${layer.uom}, the kit reads ${uom}`)
  return layer.values.map(({ validTime, value }) => {
    const [a, b] = periodOf(validTime)
    let v = value == null ? null : conv(value)
    if (name === 'quantitativePrecipitation' && v != null) v = v / ((b - a) / 3600000)   // mm over the period → mm/h
    return { a, b, v }
  })
}

const at = (periods, ms) => periods.find((p) => p.a <= ms && ms < p.b)

/** The grid's reading at instant `ms` (pressure and radiation null — see the header). */
function readingAt(layers, weather, ms) {
  const r = {}
  for (const name of Object.keys(GRID_UNITS)) r[GRID_UNITS[name][2]] = at(layers[name], ms)?.v ?? null
  r.weatherCode = wmoOf(at(weather, ms)?.v, r.cloudCover)
  r.pressureMb = null
  r.directRadiation = null
  r.diffuseRadiation = null
  return r
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: NWS_HEADERS })
  let body = null
  try { body = await res.json() } catch { /* the status below says it */ }
  return { res, body }
}

/**
 * The town's weather: { current, hourly: [{ time, ...reading }], meta }.
 * @param {{ lat, lon, name, now?: Date, hoursAhead?: number, fetchImpl?: typeof fetch }} where
 * ⛔ Throws: OutsideCoverageError for a point NWS does not cover; Error for any other failed or malformed answer.
 */
export async function nwsWeather({ lat, lon, name, now = new Date(), hoursAhead = 48, fetchImpl = fetch }) {
  const pt = await getJson(`${NWS_ROOT}/points/${lat.toFixed(4)},${lon.toFixed(4)}`, fetchImpl)
  if (pt.res.status === 404 && /InvalidPoint/.test(pt.body?.type || '')) {
    throw new OutsideCoverageError(`[weather] ⛔ "${name}" (${lat}, ${lon}) is outside the US National Weather Service's coverage — the kit has no weather provider for this town`)
  }
  if (!pt.res.ok) throw new Error(`[weather] ⛔ NWS /points answered ${pt.res.status} for "${name}": ${pt.body?.detail ?? ''}`)
  const p = pt.body.properties
  const g = await getJson(p.forecastGridData, fetchImpl)
  if (!g.res.ok) throw new Error(`[weather] ⛔ NWS grid ${p.gridId}/${p.gridX},${p.gridY} answered ${g.res.status} for "${name}"`)
  const grid = g.body.properties

  const layers = Object.fromEntries(Object.keys(GRID_UNITS).map((n) => [n, layerOf(grid, n)]))
  if (!Array.isArray(grid.weather?.values)) throw new Error('[nws] ⛔ the grid forecast carries no "weather" layer')
  const weather = grid.weather.values.map(({ validTime, value }) => { const [a, b] = periodOf(validTime); return { a, b, v: value } })

  const H = 3600000, nowMs = now.getTime()
  const [gridStart] = periodOf(grid.validTimes)
  const first = Math.ceil(gridStart / H) * H, last = Math.floor((nowMs + hoursAhead * H) / H) * H
  const hourly = []
  for (let t = first; t <= last; t += H) hourly.push({ time: new Date(t), ...readingAt(layers, weather, t) })
  const current = readingAt(layers, weather, nowMs)

  const obs = await pressureSeries(p.observationStations, now, fetchImpl, name)
  if (obs) {
    current.pressureMb = obs.series[0].mb
    for (const h of hourly) {
      if (h.time.getTime() > nowMs) continue
      const o = obs.series.find((x) => Math.abs(x.t - h.time.getTime()) <= 30 * 60000)
      if (o) h.pressureMb = o.mb
    }
  }
  return { current, hourly, meta: { gridId: p.gridId, gridX: p.gridX, gridY: p.gridY, updateTime: grid.updateTime, station: obs?.station ?? null, observedAt: obs ? new Date(obs.series[0].t) : null } }
}

const STATIONS_TRIED = 5    // a request budget per poll, not a distance: stations are tried in the order NWS lists them (whether that is nearest-first is not established)
const _station = new Map()   // stations URL → the station last found reporting pressure
/** The last 4 h of observed pressure (newest first) at the first listed station reporting it, or null — and that is said. */
async function pressureSeries(stationsUrl, now, fetchImpl, name) {
  const since = new Date(now.getTime() - 4 * 3600000).toISOString()
  const read = async (id) => {
    const { res, body } = await getJson(`${NWS_ROOT}/stations/${id}/observations?start=${encodeURIComponent(since)}`, fetchImpl)
    if (!res.ok) return null
    const series = (body.features || []).map((f) => f.properties).filter((o) => o.barometricPressure?.value != null)
      .map((o) => {
        if (o.barometricPressure.unitCode !== PRESSURE_UNIT) throw new Error(`[nws] ⛔ ${id} pressure arrives in ${o.barometricPressure.unitCode}, the kit reads ${PRESSURE_UNIT}`)
        return { t: Date.parse(o.timestamp), mb: o.barometricPressure.value / 100 }
      }).sort((a, b) => b.t - a.t)
    return series.length ? { station: id, series } : null
  }
  const cached = _station.get(stationsUrl)
  if (cached) { const r = await read(cached); if (r) return r }
  const { res, body } = await getJson(stationsUrl, fetchImpl)
  if (!res.ok) { console.error(`[weather] ⛔ NWS stations list answered ${res.status} for "${name}" — no pressure`); return null }
  for (const f of (body.features || []).slice(0, STATIONS_TRIED)) {
    const id = f.properties?.stationIdentifier
    if (!id || id === cached) continue
    const r = await read(id)
    if (r) { _station.set(stationsUrl, id); return r }
  }
  console.error(`[weather] ⛔ none of the first ${STATIONS_TRIED} NWS stations listed for "${name}" reported pressure in the last 4 h — pressure and its trend are unknown`)
  return null
}
