#!/usr/bin/env node
/**
 * claims-the-weather-feed-arrives-in-the-units-we-read — lib/nws.js converts every National Weather Service layer
 * from the unit NWS states into the unit the reading is consumed in, and REFUSES a layer in any other unit.
 *
 * ⛔ THE DEFECT (found 2026-09-26, under the previous provider): wind stored as `windSpeedMs` arrived in km/h, so every
 * town's wind was 3.6× too strong. Nothing failed; the trees and rain just blew harder. ⭐ Under NWS the unit is in
 * every answer (`uom`), so the parse checks it. This check runs the real parser (it imports lib/nws.js, no network)
 * over a fixture in NWS's own shape, and then over mutants — each must THROW, or the check is blind.
 */
import { nwsWeather, OutsideCoverageError, GRID_UNITS } from '../src/lib/nws.js'

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)
console.log('\nThe weather feed arrives in the units we read')

const T0 = Date.parse('2026-10-20T12:00:00Z')
const vt = (h) => `${new Date(T0).toISOString().replace('.000Z', '+00:00')}/PT${h}H`
const layer = (uom, value, h = 6) => ({ uom, values: [{ validTime: vt(h), value }] })
function fixture() {
  return {
    validTimes: vt(6), updateTime: new Date(T0).toISOString(),
    temperature: layer('wmoUnit:degC', 10), relativeHumidity: layer('wmoUnit:percent', 80),
    skyCover: layer('wmoUnit:percent', 40), quantitativePrecipitation: layer('wmoUnit:mm', 6),
    visibility: layer('wmoUnit:m', 16000), windSpeed: layer('wmoUnit:km_h-1', 36),
    windDirection: layer('wmoUnit:degree_(angle)', 270), windGust: layer('wmoUnit:km_h-1', 72),
    weather: { values: [{ validTime: vt(6), value: [{ coverage: 'likely', weather: 'rain', intensity: null }] }] },
  }
}
// A fake api.weather.gov: /points → grid + stations; one station reporting pressure in Pa.
function fakeFetch(grid, { invalidPoint = false, pressureUnit = 'wmoUnit:Pa' } = {}) {
  return async (url) => {
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body })
    if (url.includes('/points/')) return invalidPoint
      ? json(404, { type: 'https://api.weather.gov/problems/InvalidPoint', title: 'Data Unavailable For Requested Point' })
      : json(200, { properties: { gridId: 'TST', gridX: 1, gridY: 1, forecastGridData: 'grid', observationStations: 'stations' } })
    if (url === 'grid') return json(200, { properties: grid })
    if (url === 'stations') return json(200, { features: [{ properties: { stationIdentifier: 'KTST' } }] })
    if (url.includes('/stations/KTST/observations')) return json(200, { features: [{ properties: { timestamp: new Date(T0).toISOString(), barometricPressure: { unitCode: pressureUnit, value: 101325 } } }] })
    throw new Error(`fake fetch: unexpected ${url}`)
  }
}
const run = (grid, opts) => nwsWeather({ lat: 1, lon: 1, name: 'fixture', now: new Date(T0 + 30 * 60000), hoursAhead: 2, fetchImpl: fakeFetch(grid, opts) })

// 1 — the fixture parses into the units the reading is read in.
try {
  const { current: r } = await run(fixture())
  const want = { temperatureF: 50, humidity: 80, cloudCover: 40, precipitation: 1, visibility: 16000, windSpeedMs: 10, windDirDeg: 270, windGustsMs: 20, pressureMb: 1013.25, weatherCode: 63 }
  for (const [k, v] of Object.entries(want)) {
    if (Math.abs((r[k] ?? NaN) - v) > 1e-9) bad(`${k}: read ${r[k]}, the fixture means ${v}`)
    else ok(`${k} = ${v}`)
  }
  if (r.directRadiation !== null || r.diffuseRadiation !== null) bad('radiation: NWS supplies none — the reading must say null')
  else ok('radiation: null (NWS supplies none)')
} catch (e) { bad(`the fixture did not parse: ${e.message}`) }

// 2 — mutants: each must be refused.
const mutants = [
  ...Object.keys(GRID_UNITS).map((name) => [`grid ${name} in a foreign unit`, () => { const g = fixture(); g[name].uom = 'wmoUnit:furlong'; return run(g) }]),
  ['grid wind in m/s (the 2026-09-26 shape, inverted)', () => { const g = fixture(); g.windSpeed.uom = 'wmoUnit:m_s-1'; return run(g) }],
  ['observed pressure in hPa', () => run(fixture(), { pressureUnit: 'wmoUnit:hPa' })],
  ['a missing grid layer', () => { const g = fixture(); delete g.skyCover; return run(g) }],
  ['an unknown NWS weather type', () => { const g = fixture(); g.weather.values[0].value[0].weather = 'frogs'; return run(g) }],
]
for (const [label, go] of mutants) {
  try { await go(); bad(`mutant NOT refused: ${label}`) } catch { ok(`refused: ${label}`) }
}
// 3 — outside NWS coverage is its own named error.
try { await run(fixture(), { invalidPoint: true }); bad('a point outside NWS coverage was not refused') }
catch (e) {
  if (e instanceof OutsideCoverageError && /"fixture"/.test(e.message)) ok('outside coverage: OutsideCoverageError, naming the town')
  else bad(`outside coverage threw the wrong thing: ${e.message}`)
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ the feed arrives in the units we read\n')
process.exit(failed ? 1 : 0)
