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
 *   /stations/{id}/observations    → pressure (the grid has no pressure layer), for the reading and its 3 h trend;
 *                                    and the hours BEFORE the grid's first (the fill, below)
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
 * The hourly series runs from the hour at or before `from` (the caller's earliest instant: the dawn-to-dawn window's
 * start) to `hoursAhead`. ⭐ THE FILL (2026-10-28): NWS's grid starts at its own first hour, which is after dawn in
 * every town measured (by six hours in St. Louis), so the hours from `from` to the grid's first hour come from STATION
 * OBSERVATIONS — and only those hours: an instant has one weather (the grid's, once it starts). A filled hour carries
 * ONLY what the station observed (OBS_UNITS): temperature, humidity, wind, gusts, visibility, and pressure when its
 * station is the pressure station. It names every field it lacks in `missing` (cloud cover, precipitation and the
 * weather code are never observed in a form the kit reads), with `source: 'observed'`, `observedAt`, and `station`
 * { id, name, lat, lon } — where the reading came from, so a reader that shows it can say so (the Almanac names it). A
 * reader that needs a missing field REFUSES the instant by name (weatherAt.js#needFields), never reads it as 0.
 * The temperature station is the first listed (up to STATIONS_TRIED) whose OWN temperature observations reach the
 * fill's first hour. ⛔ No station reaching it is said by name, and the series then starts at the grid (the reader
 * names the uncovered start). An hour inside the fill with no observation within 30 min is absent, and said: a HOLE
 * that weatherAt refuses an instant inside (WeatherHoleError), never smoothed across. The fill is fetched once per dawn
 * window (theFill), not per poll.
 * ⚠ The station is a point, the grid is the town's cell: the two can disagree at the grid's first hour (the seam).
 *   `meta.fill.seam` = { at, stepC } (the grid's temperature − the station's, at that instant), or null unobserved.
 * ▶ node checks/claims-the-morning-is-observed.mjs · node checks/claims-one-weather-per-instant.mjs
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
/** observation field → [the unit NWS must state, the conversion, the reading's field]. ⛔ Only what a station observes. */
export const OBS_UNITS = {
  temperature:        ['wmoUnit:degC', F, 'temperatureF'],
  relativeHumidity:   ['wmoUnit:percent', same, 'humidity'],
  windSpeed:          ['wmoUnit:km_h-1', MS, 'windSpeedMs'],
  windDirection:      ['wmoUnit:degree_(angle)', same, 'windDirDeg'],
  windGust:           ['wmoUnit:km_h-1', MS, 'windGustsMs'],
  visibility:         ['wmoUnit:m', same, 'visibility'],
  barometricPressure: [PRESSURE_UNIT, (pa) => pa / 100, 'pressureMb'],
}
/** Every field a reading has (lib/weatherAt.js reads these) — a filled hour's `missing` is the ones it lacks. */
export const READING_FIELDS = ['temperatureF', 'humidity', 'cloudCover', 'precipitation', 'visibility', 'windSpeedMs', 'windDirDeg', 'windGustsMs', 'weatherCode', 'pressureMb', 'directRadiation', 'diffuseRadiation']

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

/** The dry WMO code a cloud cover (%) supports — also how useWeather.js downgrades a code claiming rain that isn't falling.
 *  ⛔ No cloud cover → null (no code), never clear: an hour the grid gives no sky cover has no condition to name. */
export function skyCode(cloudCoverPct) {
  if (cloudCoverPct == null) return null
  const cc = cloudCoverPct
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
 * @param {{ lat, lon, name, from: Date, now?: Date, hoursAhead?: number, fetchImpl?: typeof fetch }} where
 *   `from` — the earliest instant the town's readers ask for (the dawn-to-dawn window's start, lib/dawnTimeline.js).
 * ⛔ Throws: OutsideCoverageError for a point NWS does not cover; Error for any other failed or malformed answer.
 */
export async function nwsWeather({ lat, lon, name, from, now = new Date(), hoursAhead = 48, fetchImpl = fetch }) {
  if (!(from instanceof Date) || !Number.isFinite(from.getTime()) || from > now) {
    throw new Error(`[weather] ⛔ "${name}": nwsWeather needs \`from\`, the earliest instant its readers ask for (at or before now) — got ${from}`)
  }
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
  const gridHours = []
  for (let t = first; t <= last; t += H) gridHours.push({ time: new Date(t), ...readingAt(layers, weather, t) })
  const current = readingAt(layers, weather, nowMs)

  const fillFrom = Math.floor(from.getTime() / H) * H
  const stations = stationsOf(p.observationStations, fetchImpl, name)
  const obs = await pressureSeries(stations, nowMs)
  if (obs) {
    current.pressureMb = obs.series[0].mb
    for (const h of gridHours) {
      if (h.time.getTime() > nowMs) continue
      const o = obs.series.find((x) => Math.abs(x.t - h.time.getTime()) <= NEAR)
      if (o) h.pressureMb = o.mb
    }
  }
  const fill = fillFrom < first ? await theFill(stations, fillFrom, first, obs?.station ?? null, nowMs) : null
  const seamC = fill?.seamF == null || gridHours[0]?.temperatureF == null ? null : (gridHours[0].temperatureF - fill.seamF) * 5 / 9
  const hourly = [...(fill?.hours ?? []), ...gridHours]
  return { current, hourly, meta: {
    gridId: p.gridId, gridX: p.gridX, gridY: p.gridY, updateTime: grid.updateTime,
    station: obs?.station ?? null, observedAt: obs ? new Date(obs.series[0].t) : null,
    gridFrom: new Date(first), fill: fill && { station: fill.station, from: new Date(fillFrom), to: new Date(first), absent: fill.absent, seam: seamC == null ? null : { at: new Date(first), stepC: seamC } },
  } }
}

const STATIONS_TRIED = 5    // a request budget per poll, not a distance: stations are tried in the order NWS lists them (whether that is nearest-first is not established)
const NEAR = 30 * 60000     // an observation stands for the hour it falls within 30 min of
const PRESSURE_REACH = 4 * 3600000   // the pressure series: the last 4 h (the reading and its 3 h trend)
const _station = new Map()   // stations URL → the station last found reporting pressure
const _tempStation = new Map()   // stations URL → the station last found reporting temperature back to the fill's start
const _fills = new Map()   // stations URL → { key, fill }: the fill, fetched once per dawn window, not per poll

/**
 * The fill, once per (stations, window start, grid start, pressure station): its hours are past observations, so a poll
 * inside the same window reuses them (one station's 7 h is ~0.15 MB, every 5 min per tab). A refusal is held too, so an
 * unreachable morning is not re-asked of five stations each poll. A grid starting after now is not held (its later
 * hours have yet to be observed).
 */
async function theFill(stations, fillFrom, gridFirst, pressureStation, nowMs) {
  const key = `${fillFrom} ${gridFirst} ${pressureStation}`
  const held = _fills.get(stations.url)
  if (held?.key === key) return held.fill
  const fill = await observedHours(stations, fillFrom, gridFirst, pressureStation)
  if (gridFirst <= nowMs) _fills.set(stations.url, { key, fill })
  return fill
}

/**
 * One poll's view of the town's observation stations: the listed ids (fetched once), and a station's observations over
 * [start, end] ms, each span fetched at most once per poll. Observations newest first; a failed answer → null.
 * ⭐ Each series asks only for its own span (pressure: 4 h; the fill: its hours) — 30 h of one station is ~0.6 MB.
 */
function stationsOf(stationsUrl, fetchImpl, name) {
  let listed = null
  const seen = new Map(), where = new Map()
  return {
    url: stationsUrl, name,
    async ids() {
      if (!listed) {
        const { res, body } = await getJson(stationsUrl, fetchImpl)
        if (!res.ok) { console.error(`[weather] ⛔ NWS stations list answered ${res.status} for "${name}" — no observations`); listed = [] }
        else {
          listed = []
          for (const f of (body.features || []).slice(0, STATIONS_TRIED)) {
            const id = f.properties?.stationIdentifier
            if (!id) continue
            listed.push(id)
            const [lon, lat] = f.geometry?.coordinates || []
            where.set(id, { id, name: f.properties.name ?? null, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null })
          }
        }
      }
      return listed
    },
    /** { id, name, lat, lon } as NWS lists the station (null for what it does not state). */
    station: (id) => where.get(id) ?? { id, name: null, lat: null, lon: null },
    observations(id, start, end) {
      const key = `${id} ${start} ${end}`
      if (!seen.has(key)) {
        const span = `start=${encodeURIComponent(new Date(start).toISOString())}${end == null ? '' : `&end=${encodeURIComponent(new Date(end).toISOString())}`}`
        seen.set(key, getJson(`${NWS_ROOT}/stations/${id}/observations?${span}`, fetchImpl)
          .then(({ res, body }) => (res.ok ? (body.features || []).map((f) => f.properties).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)) : null)))
      }
      return seen.get(key)
    },
  }
}

/** The first station (the cached one, then the listed ones) whose observations over [start, end] `pick(id, obs)` answers, or null. */
async function firstStation(stations, cache, [start, end], pick) {
  const cached = cache.get(stations.url)
  if (cached) { const obs = await stations.observations(cached, start, end); const r = obs && pick(cached, obs); if (r) return r }
  for (const id of await stations.ids()) {
    if (id === cached) continue
    const obs = await stations.observations(id, start, end)
    const r = obs && pick(id, obs)
    if (r) { cache.set(stations.url, id); return r }
  }
  return null
}

/** An observed quantity in the reading's unit, or null when the station did not observe it. ⛔ Throws on a foreign unit. */
function observed(o, field, id) {
  const q = o[field]
  if (q?.value == null) return null
  const [uom, conv] = OBS_UNITS[field]
  if (q.unitCode !== uom) throw new Error(`[nws] ⛔ ${id} ${field} arrives in ${q.unitCode}, the kit reads ${uom}`)
  return conv(q.value)
}

/** The last 4 h of observed pressure (newest first) at the first listed station reporting it, or null — and that is said. */
async function pressureSeries(stations, nowMs) {
  const r = await firstStation(stations, _station, [nowMs - PRESSURE_REACH, null], (id, obs) => {
    const series = obs.filter((o) => o.barometricPressure?.value != null)
      .map((o) => ({ t: Date.parse(o.timestamp), mb: observed(o, 'barometricPressure', id) }))
    return series.length ? { station: id, series } : null
  })
  if (!r) console.error(`[weather] ⛔ none of the first ${STATIONS_TRIED} NWS stations listed for "${stations.name}" reported pressure in the last 4 h — pressure and its trend are unknown`)
  return r
}

/** The station's observation nearest instant `t` with a temperature, within NEAR — or undefined. */
const nearest = (obs, t) => obs.filter((o) => o.temperature?.value != null && Math.abs(Date.parse(o.timestamp) - t) <= NEAR)
  .sort((a, b) => Math.abs(Date.parse(a.timestamp) - t) - Math.abs(Date.parse(b.timestamp) - t))[0]

/**
 * THE FILL: the hours [fillFrom, gridFirst) from the first listed station whose own temperature observations reach
 * `fillFrom`. Each hour is that station's observation within NEAR of it, carrying only what it observed (pressure only
 * when it is the pressure station — one station's altimeter setting per series, for the trend). { station, hours,
 * absent: [ISO hours with no observation], seamF: its temperature at the grid's first hour or null }, or null — said
 * by name — when no station reaches the fill's start.
 */
async function observedHours(stations, fillFrom, gridFirst, pressureStation) {
  const H = 3600000
  const r = await firstStation(stations, _tempStation, [fillFrom - NEAR, gridFirst + NEAR], (id, obs) => (nearest(obs, fillFrom) ? { id, obs } : null))
  if (!r) {
    console.error(`[weather] ⛔ none of the first ${STATIONS_TRIED} NWS stations listed for "${stations.name}" observed temperature at ${new Date(fillFrom).toISOString()} — the hours before the forecast grid's first (${new Date(gridFirst).toISOString()}) are unknown`)
    return null
  }
  const hours = [], absent = []
  for (let t = fillFrom; t < gridFirst; t += H) {
    const o = nearest(r.obs, t)
    if (!o) { absent.push(new Date(t).toISOString()); continue }
    const h = { time: new Date(t) }
    for (const field of Object.keys(OBS_UNITS)) {
      if (field === 'barometricPressure' && r.id !== pressureStation) continue
      const v = observed(o, field, r.id)
      if (v != null) h[OBS_UNITS[field][2]] = v
    }
    h.missing = READING_FIELDS.filter((f) => h[f] == null)
    h.source = 'observed'; h.station = stations.station(r.id); h.observedAt = new Date(Date.parse(o.timestamp))
    hours.push(h)
  }
  if (absent.length) console.error(`[weather] ⛔ "${stations.name}": ${r.id} has no observation within 30 min of ${absent.join(', ')} — those hours are absent from the series`)
  const atSeam = nearest(r.obs, gridFirst)   // the same instant as the grid's first hour, for the seam
  return { station: r.id, hours, absent, seamF: atSeam ? observed(atSeam, 'temperature', r.id) : null }
}
