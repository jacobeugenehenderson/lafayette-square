/**
 * weatherAt — THE WEATHER AT ONE INSTANT, the one answer every reader asks (Phase 2 D, 2026-10-04).
 *
 * ⭐ WHY ONE. The town's weather was read three ways at a scrubbed time: the Ward's Almanac label took the forecast
 * hour (a cubic), the kit's side panel took it linearly, and the SKY took CURRENT conditions under that hour's sun —
 * so at noon tomorrow the label read "Clear Sky" over an overcast sky (LS, measured 2026-10-04). Now the label, the
 * sky and the side panel all ask this, so one instant has one weather.
 *
 *   weatherAt(t, { live, now, hourly })
 *     live   → `now`, the current reading (the clock is live: what the town is doing this minute).
 *     else   → the hourly forecast at `t`: a smooth curve through the hours for every measured quantity
 *              (Fritsch–Carlson monotone cubic — passes through every reading and never overshoots between two, so a
 *              day's high and low stay its peak and trough, and a 0 % cloud hour next to a 0 % hour stays 0 %), and
 *              the nearer hour for what has no in-between (the weather code, the wind's direction).
 *
 * ⛔ A time outside the forecast THROWS (a WeatherRangeError). It used to fall back to `now`, silently — a scrubbed
 * hour labelled with this minute's weather. The caller says it cannot show that hour.
 * ⛔ A field the reading lacks is null — never 0. A reader that needs it asks needFields, which THROWS a
 * WeatherFieldMissingError (a WeatherRangeError, so every reader that holds-and-says across the forecast's edge takes
 * the same path). The hours before NWS's grid are observed, and lack cloud cover and the weather code (lib/nws.js).
 *
 * A reading: { temperatureF, cloudCover (%), precipitation (mm), visibility (m), windSpeedMs, windDirDeg, windGustsMs,
 * humidity (%), pressureMb, weatherCode, directRadiation, diffuseRadiation } — as lib/nws.js reads them from the National Weather Service (radiation always null: NWS has none), as
 * hooks/useWeather.js#fetchWeather parses them for both `current` and every `hourly` entry (`time` on the hours).
 * ▶ node checks/claims-one-weather-per-instant.mjs
 */

const SMOOTH = ['temperatureF', 'cloudCover', 'precipitation', 'visibility', 'windSpeedMs', 'windGustsMs', 'humidity', 'pressureMb', 'directRadiation', 'diffuseRadiation']
const NEAREST = ['weatherCode', 'windDirDeg']

export class WeatherRangeError extends Error {}
/** The instant is inside the forecast, but its reading lacks a field the reader needs (named in the message). */
export class WeatherFieldMissingError extends WeatherRangeError {}

/** ⛔ Throws a WeatherFieldMissingError naming every one of `fields` the reading `r` lacks; else returns `r`. */
export function needFields(r, fields, who) {
  const lacking = fields.filter((f) => r?.[f] == null)
  if (lacking.length) {
    const when = r?.time instanceof Date ? r.time.toISOString() : 'this instant'
    throw new WeatherFieldMissingError(`[${who}] ⛔ the weather at ${when} has no ${lacking.join(', ')}${r?.source === 'observed' ? ` (observed at ${r.station?.id}, which does not report it)` : ''}`)
  }
  return r
}

/** The weather at instant `t` (a Date): the current reading when `live`, else the forecast's. */
export function weatherAt(t, { live, now, hourly }) {
  if (live) {
    if (!now) throw new Error('[weatherAt] ⛔ the clock is live but there is no current reading yet')
    return now
  }
  return forecastAt(t, hourly)
}

/** The hourly forecast at `t`. Throws a WeatherRangeError outside it. */
export function forecastAt(t, hourly) {
  if (!(t instanceof Date) || !Number.isFinite(t.getTime())) throw new Error(`[weatherAt] ⛔ not an instant: ${t}`)
  if (!hourly?.length) throw new WeatherRangeError('[weatherAt] ⛔ there is no forecast to read')
  const ms = t.getTime()
  const first = hourly[0].time.getTime(), last = hourly[hourly.length - 1].time.getTime()
  if (ms < first || ms > last) {
    throw new WeatherRangeError(`[weatherAt] ⛔ ${t.toISOString()} is outside the forecast (${hourly[0].time.toISOString()} … ${hourly[hourly.length - 1].time.toISOString()})`)
  }
  let i = 0
  while (i < hourly.length - 1 && hourly[i + 1].time.getTime() <= ms) i++
  const b = hourly[i], a = hourly[Math.min(i + 1, hourly.length - 1)]
  if (b === a || b.time.getTime() === ms) return pick(b)
  const t0 = b.time.getTime(), span = a.time.getTime() - t0, k = (ms - t0) / span
  const out = { time: t }
  for (const f of SMOOTH) out[f] = hermite(hourly, f, i, k, span)
  for (const f of NEAREST) out[f] = (k < 0.5 ? b : a)[f] ?? null
  return out
}

function pick(h) {
  const out = { time: h.time }
  for (const f of [...SMOOTH, ...NEAREST]) out[f] = h[f] ?? null
  if (h.source) { out.source = h.source; out.station = h.station }
  return out
}

/** Monotone-cubic (Fritsch–Carlson) value of field `f` between hours i and i+1, at fraction k. Null if either end is. */
function hermite(hourly, f, i, k, span) {
  const y0 = hourly[i][f], y1 = hourly[i + 1][f]
  if (y0 == null || y1 == null) return null
  const m = tangents(hourly, f)
  const k2 = k * k, k3 = k2 * k
  return (2 * k3 - 3 * k2 + 1) * y0 + (k3 - 2 * k2 + k) * span * m[i] + (-2 * k3 + 3 * k2) * y1 + (k3 - k2) * span * m[i + 1]
}

const _tangents = new WeakMap()   // hourly array → { field → tangents }
function tangents(hourly, f) {
  let byField = _tangents.get(hourly)
  if (!byField) { byField = {}; _tangents.set(hourly, byField) }
  if (byField[f]) return byField[f]
  // A segment with a missing end has no slope (null), never a slope to 0: a tangent takes only its known neighbours.
  const n = hourly.length, d = []
  const y = (j) => hourly[j][f]
  for (let j = 0; j < n - 1; j++) d.push(y(j) == null || y(j + 1) == null ? null : (y(j + 1) - y(j)) / (hourly[j + 1].time - hourly[j].time))
  const m = hourly.map((_, j) => {
    const l = j > 0 ? d[j - 1] : null, r = j < n - 1 ? d[j] : null
    if (l == null) return r ?? 0
    if (r == null) return l
    return l * r <= 0 ? 0 : (l + r) / 2
  })
  for (let j = 0; j < n - 1; j++) {
    if (d[j] == null) continue
    if (d[j] === 0) { m[j] = 0; m[j + 1] = 0; continue }
    const a = m[j] / d[j], b = m[j + 1] / d[j], h = a * a + b * b
    if (h > 9) { const s = 3 / Math.sqrt(h); m[j] = s * a * d[j]; m[j + 1] = s * b * d[j] }
  }
  byField[f] = m
  return m
}
