#!/usr/bin/env node
/**
 * claims-the-weather-feed-arrives-in-the-units-we-read — the Open-Meteo request names the
 * unit every field is consumed in.
 *
 * ⛔ THE DEFECT (found 2026-09-26): `useWeather.js` stored `wind_speed_10m` as `windSpeedMs`,
 * but Open-Meteo's default wind unit is km/h — so every town's wind was 3.6× too strong
 * (Provincetown: 47.8 read as m/s, a hurricane, against a real 13.3 m/s). Nothing failed; the
 * trees and rain just blew harder. ⭐ The fix is in the request (`wind_speed_unit=ms`), and this
 * check reads the URL out of the source so it cannot drift from what the code consumes.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const src = readFileSync(path.join(ROOT, 'src/hooks/useWeather.js'), 'utf8')
// The forecast URL template — built per call from the placed town (apiUrl() in useWeather.js).
const url = src.match(/`(https:\/\/api\.open-meteo\.com\/v1\/forecast\?[^`]+)`/)?.[1]

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
console.log('\nThe weather feed arrives in the units we read')

if (!url) bad('the open-meteo forecast URL was not found in src/hooks/useWeather.js')
else {
  // field consumed → the query parameter that fixes its unit, and the value the code assumes.
  // (Open-Meteo's defaults: °C, km/h, mm. Precipitation's mm is the default and is what the
  // Almanac's precipMmHr reads, so it needs no parameter.)
  const want = [
    ['temperatureF (°F)', 'temperature_unit', 'fahrenheit'],
    ['windSpeedMs (m/s)', 'wind_speed_unit', 'ms'],
  ]
  const params = new URLSearchParams(url.split('?')[1] || '')
  for (const [field, key, value] of want) {
    if (params.get(key) !== value) bad(`${field}: the request must say ${key}=${value}, it says ${key}=${params.get(key) ?? '(default)'}`)
    else console.log(`  ✅ ${field}: ${key}=${value}`)
  }
  if (params.get('precipitation_unit') && params.get('precipitation_unit') !== 'mm') bad('precipitation must stay in mm (precipMmHr)')
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ the feed arrives in the units we read\n')
process.exit(failed ? 1 : 0)
