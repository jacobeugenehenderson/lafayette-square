#!/usr/bin/env node
/**
 * claims-the-morning-is-observed — the hours before NWS's forecast grid (dawn → the grid's first hour, six hours in
 * St. Louis on 2026-10-28) come from STATION OBSERVATIONS (lib/nws.js, the fill), and nothing reads what a station
 * did not observe as 0 or clear.
 *
 * ⛔ THE CLASS: a missing value read as a value. The Almanac's day strip lost its whole temperature line when the grid
 * started after dawn (2df8d341 → theward dayCurve's catch); filling that gap from observations leaves cloud cover and
 * the weather code ABSENT, and the sky's readers turned absent into 0 = clear (`?? 0`). Both are closed here.
 *
 * RUNS the real modules (vite SSR) over an NWS-shaped fixture (no network):
 *   · the series reaches `from`; the temperature station is chosen by its own temperature (not the pressure station)
 *   · ONE weather per instant: observed hours only before the grid's first hour, every instant once
 *   · a filled hour carries only observed fields and names the rest in `missing`, and its station { id, name, lat, lon }
 *   · the seam (grid − station at the grid's first hour) is measured, in °C
 *   · two polls in one dawn window fetch the fill ONCE (Zob's C2: per poll it is ~0.15 MB per 5 min per tab)
 *   · an instant in a HOLE (an hour the station did not observe) is refused by name, never smoothed across (C3), by
 *     the cadence nws STAMPS on the series — not one inferred from it (an all-absent fill + a 1-hour grid has no two
 *     consecutive readings); a failed station answer (503) is never held for the window: the next poll asks again (C2′)
 *   · no station reaching `from` is said, and the series starts at the grid
 *   · the sky (useWeather#targetsOf), the wind (windSheet#windStateOfWeather) and the directive's payload
 *     (weather-payload#buildWeatherPayload) REFUSE a reading with no cloud cover / weather code — a WeatherFieldMissingError
 *   · weatherAt's tangents take no slope from a missing neighbour
 * READS the source: no sky reader turns a missing cloud cover or weather code into 0.
 * Then every MUTANT (the defect put back, one at a time) must turn it RED, or the check is blind.
 *
 * Run: node checks/claims-the-morning-is-observed.mjs   (exit 1 on a defect, 2 if it could not run or is blind)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const SKY_READERS = ['src/hooks/useWeather.js', 'src/lib/windSheet.js', 'src/lib/weather-payload.js', 'src/lib/nws.js', 'src/lib/weatherAt.js']
const ZERO = /\b(cloudCover|weatherCode|cloudCoverPct)\b\s*(\?\?|\|\|)\s*0\b/
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const MUTANTS = [
  ['a filled hour with invented cloud cover', 'src/lib/nws.js', '    h.missing = READING_FIELDS', '    h.cloudCover = 50; h.missing = READING_FIELDS'],
  ['the fill overlaps the grid by one hour', 'src/lib/nws.js', 'await theFill(stations, fillFrom, first,', 'await theFill(stations, fillFrom, first + H,'],
  ['the temperature station is any station, not one reporting temperature', 'src/lib/nws.js', '(nearest(obs, fillFrom) ? { id, obs } : null)', '({ id, obs })'],
  ['skyCode reads no cloud cover as clear', 'src/lib/nws.js', 'if (cloudCoverPct == null) return null\n  const cc = cloudCoverPct', 'const cc = cloudCoverPct ?? 0'],
  ['the sky takes a reading with no cloud/code (targetsOf guard gone)', 'src/hooks/useWeather.js', "  needFields(r, SKY_NEEDS, 'sky')\n", ''],
  ["targetsOf's weather code ?? 0 restored", 'src/hooks/useWeather.js', 'reconcileWeatherCode(r.weatherCode, r.precipitation ?? 0, r.cloudCover)', 'reconcileWeatherCode(r.weatherCode ?? 0, r.precipitation ?? 0, r.cloudCover ?? 0)'],
  ["targetsOf's cloud cover ?? 0 restored", 'src/hooks/useWeather.js', 'cloudCover: r.cloudCover / 100,', 'cloudCover: (r.cloudCover ?? 0) / 100,'],
  ['the wind takes an hour with no weather code (guard gone)', 'src/lib/windSheet.js', "    needFields(r, ['weatherCode'], 'wind')", ''],
  ["windSheet's weather code ?? 0 restored", 'src/lib/windSheet.js', 'deriveStorminess(r.weatherCode, r.precipitation', 'deriveStorminess(r.weatherCode ?? 0, r.precipitation'],
  ['the payload takes no cloud cover (refusal gone)', 'src/lib/weather-payload.js', '  if (!Number.isFinite(weatherTargets?.cloudCover)) throw', '  if (false) throw'],
  ["the payload's cloud cover ?? 0 restored", 'src/lib/weather-payload.js', 'Math.min(1, weatherTargets.cloudCover)', 'Math.min(1, weatherTargets?.cloudCover ?? 0)'],
  ['an observed hour does not say where it was taken', 'src/lib/nws.js', 'h.station = stations.station(r.id)', 'h.station = r.id'],
  ['the seam is not measured', 'src/lib/nws.js', "seamF: atSeam ? observed(atSeam, 'temperature', r.id) : null", 'seamF: null'],
  ['the fill is fetched on every poll', 'src/lib/nws.js', 'if (held?.key === key) return held.fill', 'if (false) return held.fill'],
  ['a failed answer is held for the window', 'src/lib/nws.js', '&& stations.answered.failed === 0)', ')'],
  ['a failed stations list is held (failures counted only during the fill)', 'src/lib/nws.js', '  const fill = await observedHours(stations, fillFrom, gridFirst, pressureStation)\n  if (gridFirst <= nowMs && stations.answered.failed === 0)', '  const failedBefore = stations.answered.failed\n  const fill = await observedHours(stations, fillFrom, gridFirst, pressureStation)\n  if (gridFirst <= nowMs && stations.answered.failed === failedBefore)'],
  ['the cadence is inferred from the series, not read from its stamp', 'src/lib/weatherAt.js', '  return hourly.cadence\n}', '  let c = Infinity\n  for (let j = 1; j < hourly.length; j++) c = Math.min(c, hourly[j].time - hourly[j - 1].time)\n  return c\n}'],
  ['an unstamped series is read (the stamp refusal gone)', 'src/lib/weatherAt.js', '  if (!(hourly.cadence > 0)) throw', '  if (false) throw'],
  ['the stamp is read before the empty series (a standing preset)', 'src/lib/weatherAt.js', "  if (!hourly?.length) throw new WeatherRangeError('[weatherAt] ⛔ there is no forecast to read')", "  cadence(hourly)\n  if (!hourly?.length) throw new WeatherRangeError('[weatherAt] ⛔ there is no forecast to read')"],
  ['weatherAt smooths across a hole', 'src/lib/weatherAt.js', 'if (a.time - b.time > cadence(hourly)) {', 'if (false) {'],
  ["weatherAt's tangents read a missing neighbour as 0", 'src/lib/weatherAt.js', 'const y = (j) => hourly[j][f]\n', 'const y = (j) => hourly[j][f] ?? 0\n'],
]

// ── the fixture: a grid starting 3 h after `from`; KPRS reports pressure only, KTMP temperature (and the rest) ──
const H = 3_600_000
const FROM = Date.parse('2026-10-28T11:57:00Z'), GRID0 = Date.parse('2026-10-28T15:00:00Z'), NOW = GRID0 + 2 * H
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', '+00:00')
const layer = (uom, value) => ({ uom, values: [{ validTime: `${iso(GRID0)}/PT6H`, value }] })
const GRID = {
  validTimes: `${iso(GRID0)}/P7D`, updateTime: iso(GRID0),
  temperature: layer('wmoUnit:degC', 20), relativeHumidity: layer('wmoUnit:percent', 50), skyCover: layer('wmoUnit:percent', 40),
  quantitativePrecipitation: layer('wmoUnit:mm', 0), visibility: layer('wmoUnit:m', 16000), windSpeed: layer('wmoUnit:km_h-1', 18),
  windDirection: layer('wmoUnit:degree_(angle)', 180), windGust: layer('wmoUnit:km_h-1', null), weather: { values: [{ validTime: `${iso(GRID0)}/PT6H`, value: [{}] }] },
}
const q = (unitCode, value) => ({ unitCode, value })
const OBS = {   // newest first is NOT assumed by the parser — it sorts
  KPRS: [0, 1, 2, 3].map((i) => ({ timestamp: iso(NOW - i * H), temperature: q('wmoUnit:degC', null), barometricPressure: q('wmoUnit:Pa', 101300) })),
  KTMP: Array.from({ length: 8 }, (_, i) => ({
    timestamp: iso(GRID0 + H - (i + 1) * H - 7 * 60000),   // :53 of each hour, back past `from`
    temperature: q('wmoUnit:degC', 10 + i * -0.5), relativeHumidity: q('wmoUnit:percent', 70), windSpeed: q('wmoUnit:km_h-1', 7.2),
    windDirection: q('wmoUnit:degree_(angle)', 90), windGust: q('wmoUnit:km_h-1', null), visibility: q('wmoUnit:m', 16093),
    barometricPressure: q('wmoUnit:Pa', 101000), cloudLayers: [{ amount: 'BKN' }], presentWeather: [],
  })),
}
function fakeFetch(stationIds, asked = [], down = new Set()) {
  return async (url) => {
    asked.push(url)
    if ([...down].some((id) => url.includes(`/stations/${id}/observations`)) || (down.has('LIST') && url.startsWith('stations:'))) return { ok: false, status: 503, json: async () => ({}) }
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body })
    if (url.includes('/points/')) return json(200, { properties: { gridId: 'TST', gridX: 1, gridY: 1, forecastGridData: 'grid', observationStations: `stations:${stationIds}` } })
    if (url === 'grid') return json(200, { properties: GRID })
    if (url.startsWith('stations:')) return json(200, { features: url.slice(9).split(',').map((id) => ({ geometry: { coordinates: [-90.5, 38.9] }, properties: { stationIdentifier: id, name: `${id} Field` } })) })
    const m = /\/stations\/(\w+)\/observations\?start=([^&]+)(?:&end=([^&]+))?/.exec(url)
    if (m) {
      const a = Date.parse(decodeURIComponent(m[2])), b = m[3] ? Date.parse(decodeURIComponent(m[3])) : Infinity
      return json(200, { features: (OBS[m[1]] ?? []).filter((o) => Date.parse(o.timestamp) >= a && Date.parse(o.timestamp) <= b).map((properties) => ({ properties })) })
    }
    throw new Error(`fake fetch: unexpected ${url}`)
  }
}

/** Every claim, against the modules as vite serves them (with `mutant` applied): the list of failures. */
async function claims(mutant) {
  const fails = []
  const apply = (rel, code) => {
    if (!mutant || rel !== mutant[1]) return code
    if (!code.includes(mutant[2])) throw new Error(`BLIND: mutant "${mutant[0]}" does not apply — its text left ${rel}; re-aim it`)
    return code.replace(mutant[2], mutant[3])
  }
  for (const rel of SKY_READERS) {
    const src = strip(apply(rel, readFileSync(join(ROOT, rel), 'utf8')))
    const hit = src.split('\n').find((l) => ZERO.test(l))
    if (hit) fails.push(`${rel} turns a missing cloud cover / weather code into 0: ${hit.trim()}`)
  }
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: 'mutant', enforce: 'pre', transform(code, id) { const rel = id.split('?')[0].replace(ROOT, ''); return rel === mutant?.[1] ? apply(rel, code) : null } }] })
  const said = []
  const err = console.error
  console.error = (...a) => said.push(a.join(' '))
  try {
    const load = (p) => vite.ssrLoadModule(p)
    const { nwsWeather, READING_FIELDS, OBS_UNITS } = await load('/src/lib/nws.js')
    const { weatherAt, WeatherRangeError, WeatherFieldMissingError, WeatherHoleError } = await load('/src/lib/weatherAt.js')
    const { setTownPlace } = await load('/src/lib/townPlace.js')
    setTownPlace({ lat: 38.6, lon: -90.2, timezone: 'America/Chicago', lonToMeters: 87000, latToMeters: 111000 }, 'fixture')
    const { targetsOf } = await load('/src/hooks/useWeather.js')
    const { windStateOfWeather } = await load('/src/lib/windSheet.js')
    const { buildWeatherPayload } = await load('/src/lib/weather-payload.js')
    const run = (ids, asked, down) => nwsWeather({ lat: 38.6, lon: -90.2, name: 'fixture', from: new Date(FROM), now: new Date(NOW), hoursAhead: 3, fetchImpl: fakeFetch(ids, asked, down) })

    const w = await run('KPRS,KTMP')
    const obsH = w.hourly.filter((h) => h.source === 'observed'), gridFirst = w.meta.gridFrom.getTime()
    // reach + station choice
    if (!(w.hourly[0].time.getTime() <= FROM)) fails.push(`the series starts at ${w.hourly[0].time.toISOString()}, after from (${iso(FROM)})`)
    if (w.meta.fill?.station !== 'KTMP') fails.push(`the fill's station is ${w.meta.fill?.station}, not KTMP (the first listed that observed temperature)`)
    if (w.meta.station !== 'KPRS') fails.push(`the pressure station is ${w.meta.station}, not KPRS`)
    // one weather per instant
    const t = w.hourly.map((h) => h.time.getTime())
    if (!t.every((x, i) => !i || x > t[i - 1])) fails.push('two hours of the series share an instant (or run backwards)')
    if (obsH.some((h) => h.time.getTime() >= gridFirst)) fails.push('an observed hour stands at or after the grid\'s first hour — two weathers for one instant')
    if (w.hourly.some((h) => !h.source && h.time.getTime() < gridFirst)) fails.push('a grid hour stands before the grid\'s first hour')
    if (obsH.length !== Math.round((gridFirst - Math.floor(FROM / H) * H) / H)) fails.push(`${obsH.length} observed hours, the gap holds ${(gridFirst - Math.floor(FROM / H) * H) / H}`)
    // only what was observed, the rest named
    const observable = new Set(Object.values(OBS_UNITS).map(([, , f]) => f))
    for (const h of obsH) {
      const present = READING_FIELDS.filter((f) => h[f] != null)
      const invented = present.filter((f) => !observable.has(f))
      if (invented.length) fails.push(`the observed hour ${h.time.toISOString()} carries ${invented.join(', ')}, which no station observed`)
      if (h.pressureMb != null) fails.push(`the observed hour ${h.time.toISOString()} carries KTMP's pressure — not the pressure station's`)
      const absent = READING_FIELDS.filter((f) => h[f] == null)
      if (JSON.stringify(absent) !== JSON.stringify(h.missing)) fails.push(`the observed hour ${h.time.toISOString()} names missing [${h.missing}], it lacks [${absent}]`)
    }
    const st = obsH[0]?.station
    if (!(st?.id === 'KTMP' && st.name === 'KTMP Field' && st.lat === 38.9 && st.lon === -90.5)) fails.push(`an observed hour's station is ${JSON.stringify(st)}, not KTMP's { id, name, lat, lon } as NWS lists it`)
    const seam = w.meta.fill?.seam   // KTMP read 10 °C at 14:53, the grid 20 °C from 15:00
    if (!(seam && Math.abs(seam.stepC - 10) < 1e-9 && seam.at.getTime() === GRID0)) fails.push(`the seam is ${JSON.stringify(seam)}, not +10 °C at the grid's first hour`)
    const at12 = obsH.find((h) => h.time.getTime() === Date.parse('2026-10-28T12:00:00Z'))
    if (!at12 || Math.abs(at12.temperatureF - (8.5 * 9 / 5 + 32)) > 1e-9) fails.push(`12:00's temperature is ${at12?.temperatureF} °F, KTMP observed 8.5 °C (47.3 °F) at 11:53`)
    // no reach → said, series from the grid
    said.length = 0
    const n = await run('KPRS')
    if (n.meta.fill !== null || n.hourly[0].source) fails.push('with no station observing temperature, the fill was not refused')
    if (!said.some((s) => /observed temperature at/.test(s))) fails.push('with no station observing temperature, nothing was said')
    // two polls in one window: the fill's station is asked once (KTMP serves only the fill here; KPRS has the pressure)
    const asked = []
    await run('KPRS,KTMP,KTWO', asked); await run('KPRS,KTMP,KTWO', asked)
    const fills = asked.filter((u) => u.includes('/stations/KTMP/observations')).length
    if (fills !== 1) fails.push(`two polls in one window fetched the fill ${fills} times — it is held once per dawn window`)
    // a 503 on the first poll is not held: the second poll asks again and the morning arrives
    const p1 = await run('KPRS,KTMP,KTRI', [], new Set(['KTMP']))
    const p2 = await run('KPRS,KTMP,KTRI', [])
    if (p1.meta.fill !== null) fails.push('with KTMP answering 503, a fill was made anyway')
    if (p2.meta.fill?.station !== 'KTMP') fails.push(`after a 503, the next poll's fill is ${JSON.stringify(p2.meta.fill?.station ?? null)}, not KTMP — the failure was held for the window`)
    // a 503 on the stations LIST (fetched first, for pressure) is not held either
    const l1 = await run('KPRS,KTMP,KFOUR', [], new Set(['LIST']))
    const l2 = await run('KPRS,KTMP,KFOUR', [])
    if (l1.meta.fill !== null) fails.push('with the stations list answering 503, a fill was made anyway')
    if (l2.meta.fill?.station !== 'KTMP') fails.push(`after the stations list's 503, the next poll's fill is ${JSON.stringify(l2.meta.fill?.station ?? null)}, not KTMP — the failure was held for the window`)
    // the cadence is the producer's stamp: an all-absent fill + a one-hour grid has no two consecutive readings
    if (w.hourly.cadence !== H) fails.push(`nws stamps the series' cadence as ${w.hourly.cadence}, not ${H} ms`)
    const sparse = [0, 3].map((i) => ({ time: new Date(GRID0 + i * H), temperatureF: 50 + i }))
    sparse.cadence = H
    try { weatherAt(new Date(GRID0 + 1.5 * H), { live: false, hourly: sparse }); fails.push('a series with no two consecutive readings smoothed across its hole (the cadence was inferred from the hole itself)') } catch (e) { if (!(e instanceof WeatherHoleError)) fails.push(`the sparse series threw ${e.constructor.name}, not a WeatherHoleError`) }
    try { weatherAt(new Date(GRID0 + 1.5 * H), { live: false, hourly: sparse.slice() }); fails.push('an unstamped series was read (its cadence must be stamped, never inferred)') } catch (e) { if (!/carries no cadence/.test(e.message)) fails.push(`an unstamped series threw "${e.message}", not the cadence refusal`) }
    // a standing preset: the store's series is [] with no stamp — a range refusal the readers hold, never the cadence's
    try { weatherAt(new Date(NOW), { live: false, hourly: [] }); fails.push('an empty series (a preset standing) was read') } catch (e) { if (!(e instanceof WeatherRangeError)) fails.push(`an empty series (a preset standing) threw "${e.message}", not a WeatherRangeError — the readers would rethrow it`) }
    // a hole: an hour no one observed is refused, by name
    const holed = [0, 1, 3, 4].map((i) => ({ time: new Date(GRID0 + i * H), temperatureF: 50 + i }))
    holed.cadence = H
    try { weatherAt(new Date(GRID0 + 2 * H), { live: false, hourly: holed }); fails.push('an instant in a hole (no reading between 16:00 and 18:00) was smoothed across') }
    catch (e) { if (!(e instanceof WeatherHoleError)) fails.push(`an instant in a hole threw ${e.constructor.name}, not a WeatherHoleError`) }
    if (!(weatherAt(new Date(GRID0 + 0.5 * H), { live: false, hourly: holed }).temperatureF > 50)) fails.push('an instant beside a hole was refused')
    // the readers refuse what is missing
    const filled = weatherAt(new Date(FROM + 20 * 60000), { live: false, hourly: w.hourly })
    const refuses = (label, go) => {
      try { go(); fails.push(`${label}: took a reading with no cloud cover / weather code`) } catch (e) {
        if (!(e instanceof WeatherFieldMissingError) && label !== 'the payload') fails.push(`${label}: threw ${e.constructor.name}, not a WeatherFieldMissingError: ${e.message}`)
      }
    }
    refuses('the sky (targetsOf)', () => targetsOf(filled))
    refuses('the wind (windStateOfWeather)', () => windStateOfWeather({ hourlyForecast: w.hourly }, { isLive: false, currentTime: new Date(FROM + 20 * 60000) }))
    refuses('the payload', () => buildWeatherPayload({ temperatureF: 50 }, new Date(NOW)))
    try { targetsOf(weatherAt(new Date(GRID0 + 30 * 60000), { live: false, hourly: w.hourly })) } catch (e) { fails.push(`the sky refused a grid hour: ${e.message}`) }
    // tangents: no slope from a missing neighbour
    const tg = [null, 50, 60, 70].map((c, i) => ({ time: new Date(GRID0 + i * H), cloudCover: c }))
    tg.cadence = H
    const mid = weatherAt(new Date(GRID0 + 1.5 * H), { live: false, hourly: tg }).cloudCover
    if (Math.abs(mid - 55) > 1e-9) fails.push(`between 50 % and 60 % (beside a missing hour) weatherAt reads ${mid} — a missing neighbour bent the curve`)
  } catch (e) {
    if (/BLIND/.test(e.message)) throw e
    fails.push(`a claim threw: ${e.message}`)
  } finally {
    console.error = err
    await vite.close()
  }
  return fails
}

const base = await claims(null).catch((e) => { console.error(`⛔ could not run: ${e.message}`); process.exit(2) })
if (base.length) {
  console.error(`⛔ the morning is not observed as claimed (${base.length}):`)
  for (const f of base) console.error(`   ${f}`)
  process.exit(1)
}
console.log('✅ the morning is observed: the fill reaches from, one weather per instant, only observed fields, and the sky refuses what is missing')
let blind = 0
for (const m of MUTANTS) {
  const f = await claims(m).catch((e) => { console.error(`⛔ ${e.message}`); process.exit(2) })
  if (f.length) console.log(`   RED  ${m[0]} — ${f[0]}`)
  else { blind++; console.error(`   ⛔ BLIND: ${m[0]} — still green`) }
}
if (blind) { console.error(`⛔ ${blind} mutant(s) not caught — the check is blind there`); process.exit(2) }
console.log(`✅ every mutant (${MUTANTS.length}) turns it RED`)
process.exit(0)
