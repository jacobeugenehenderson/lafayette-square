#!/usr/bin/env node
/**
 * claims-one-weather-per-instant — the weather at an instant has ONE answer (src/lib/weatherAt.js), and every reader
 * that shows the weather at the clock's instant asks it: the sky's directive, the side panel, and the Ward's door
 * (Town.jsx#useTownWeather). Live → the current reading; scrubbed → the forecast's; outside the forecast → a loud
 * WeatherRangeError, never "now".
 *
 * ⛔ THE CLASS: two readers of one instant answering differently. 2026-10-04, LS: the Almanac read "Clear Sky" (the
 * forecast's noon, 0 % cloud) over an overcast sky (current, 100 %), because the label read the forecast and the sky
 * read the feed; and three interpolators (Ward cubic, kit linear, the sky none) existed for one quantity.
 *
 * READS THE SOURCE: every file in src/ that reads the store's `hourlyForecast` AND the clock's `isLive` is a reader of
 * an instant — it must call weatherAt (a file whose only forecast use is getHiLo, the window's extremes, is not
 * reading an instant). No file but weatherAt.js may snap between two hours (`< 0.5 ?` beside an hourly read). Then
 * weatherAt is RUN on a synthetic forecast.
 *
 * Run: node checks/claims-one-weather-per-instant.mjs   (exit 1 on a defect or a blind check)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(e)) out.push(p)
  }
  return out
}
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))

const fails = []
const readers = []
for (const f of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, f)
  if (rel === 'src/lib/weatherAt.js') continue
  const src = strip(readFileSync(f, 'utf8'))
  const readsForecast = /\bhourlyForecast\b/.test(src)
  if (readsForecast && /\b(?:hourly|hourlyForecast)\b[\s\S]{0,400}<\s*0\.5\s*\?/.test(src)) {
    fails.push(`${rel}: snaps between two forecast hours itself — the in-between is lib/weatherAt.js's alone`)
  }
  if (!readsForecast || !/\bisLive\b/.test(src)) continue
  const uses = src.match(/[^\n]*\bhourlyForecast\b[^\n]*/g) || []
  const onlyExtremes = uses.every((l) => /getHiLo\(|useSkyState\(\s*\(s\)\s*=>\s*s\.hourlyForecast\)|\[[^\]]*hourlyForecast[^\]]*\]/.test(l))
  if (onlyExtremes && !/\bweatherAt\(/.test(src)) continue
  readers.push(rel)
  if (!/\bweatherAt\(/.test(src)) fails.push(`${rel}: reads the forecast at the clock's instant without lib/weatherAt.js`)
}
// The Ward's door: the reading an app shows at an instant must come from weatherAt too.
const town = strip(readFileSync(join(ROOT, 'src/components/Town.jsx'), 'utf8'))
const door = town.match(/export function useTownWeather\(\)[\s\S]*?\n}\n/)
if (!door) fails.push('src/components/Town.jsx has no useTownWeather — the Ward\'s weather door moved; re-aim this check')
else { readers.push('src/components/Town.jsx#useTownWeather'); if (!/\bweatherAt\(/.test(door[0])) fails.push('useTownWeather hands the app a reading that does not come from weatherAt') }

const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { weatherAt, WeatherRangeError } = await vite.ssrLoadModule('/src/lib/weatherAt.js')
  const H = 3_600_000, t0 = Date.UTC(2026, 9, 4, 12)
  const hourly = [0, 1, 2, 3].map((i) => ({ time: new Date(t0 + i * H), temperatureF: 60 + i * 2, cloudCover: [0, 0, 100, 100][i], weatherCode: [0, 0, 3, 3][i], windDirDeg: 90 * i }))
  const now = { temperatureF: 50, cloudCover: 100, weatherCode: 3 }
  const at = (ms, live) => weatherAt(new Date(ms), { live, now, hourly })
  if (at(t0 + 0.5 * H, true) !== now) fails.push('weatherAt does not return the current reading while the clock is live')
  const mid = at(t0 + 0.5 * H, false)
  if (mid.cloudCover !== 0) fails.push(`weatherAt overshoots between two 0 % hours: ${mid.cloudCover}`)
  if (!(mid.temperatureF > 60 && mid.temperatureF < 62)) fails.push(`weatherAt's temperature between 60 and 62 °F is ${mid.temperatureF}`)
  const later = at(t0 + 1.75 * H, false)
  if (later.weatherCode !== 3 || !(later.cloudCover > 0 && later.cloudCover <= 100)) fails.push(`weatherAt at 1.75 h: code ${later.weatherCode}, cloud ${later.cloudCover}`)
  if (at(t0 + 2 * H, false).cloudCover !== 100) fails.push('weatherAt on the hour does not return that hour')
  for (const ms of [t0 - 60_000, t0 + 3 * H + 60_000]) {
    let err = null
    try { at(ms, false) } catch (e) { err = e }
    if (!(err instanceof WeatherRangeError)) fails.push(`weatherAt outside the forecast ${err ? 'threw the wrong error' : 'returned a reading'} (it must throw a WeatherRangeError)`)
  }
} catch (e) {
  console.error(`⛔ could not run: ${e.message}`)
  process.exit(2)
}

console.log(`readers of the weather at an instant: ${readers.join(', ') || 'none'}`)
if (readers.length < 2) { console.error('⛔ BLIND: found fewer than two readers (the sky and an app) — re-aim this check'); process.exit(1) }
if (fails.length) {
  console.error(`\n⛔ (${fails.length}):`)
  for (const f of fails) console.error(`   ${f}`)
  process.exit(1)
}
console.log('\n✅ one weather per instant: every reader asks lib/weatherAt.js, and it answers as specified')
process.exit(0)   // the SSR server keeps handles open
