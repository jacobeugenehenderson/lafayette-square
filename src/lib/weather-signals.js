/**
 * weather-signals — expand the schema-aligned weather payload with the
 * derived signals Modulators read against.
 *
 * The Almanac evaluator reads `weather-payload.schema.json` fields
 * (tempC, cloudCover, humidity, windKph, etc.). Modulators want a few
 * more — phenomena like cold-front passage and wildfire smoke have
 * specific signatures that aren't natural Almanac rule keys but ARE
 * present (or trivially derivable from) the open-meteo response.
 *
 * Halo 2026-05-20 (Phase 6). Approach B from the brief: pressure
 * trend reads off the hourly back-fill (`useWeather` requests
 * `past_hours=4` + `pressure_msl` in hourly) rather than maintaining a
 * persistent in-memory ring buffer. Cold-start lag: none — the
 * back-fill is in the same fetch response that lights up the live
 * weather, so a fresh page sees correct pressure_trend_3hr immediately.
 *
 * Signal list (what modulators may reference via `driver.signal`):
 *
 *   - Pass-through (from buildWeatherPayload): tempC, cloudCover,
 *     pressureMb, humidity, windKph, windDirDeg, precipMmHr,
 *     sunElevationDeg, sunAzimuthDeg
 *   - precipitation (alias of precipMmHr; the ADR's spelled-out
 *     example uses this name)
 *   - weathercode (live WMO code; modulators with `in` driver match
 *     specific codes — thunderstorm 95/96/99, fog 45/48, etc.)
 *   - pressure_trend_3hr (mb change over 3 hours; negative = falling /
 *     frontal passage approaching)
 *   - direct_ratio (direct/(direct+diffuse+ε); ~0.7+ on clear days,
 *     drops under 0.4 in smoke / haze)
 *   - hour_of_day (0..23 integer)
 *   - minute_of_day (0..1439 integer)
 */

const ALL_SIGNAL_KEYS = [
  // payload pass-through
  'tempC', 'cloudCover', 'pressureMb', 'humidity',
  'windKph', 'windDirDeg', 'precipMmHr',
  'sunElevationDeg', 'sunAzimuthDeg',
  // ADR-style synonyms / discrete
  'precipitation', 'weathercode',
  // derived
  'pressure_trend_3hr', 'direct_ratio',
  'hour_of_day', 'minute_of_day',
]

export function getSignalKeys() { return ALL_SIGNAL_KEYS.slice() }

/**
 * @param {object} payload — output of buildWeatherPayload (schema-aligned)
 * @param {Date}   currentTime — scrub time (useTimeOfDay)
 * @param {object} extras — { currentWeatherCode, directRadiation,
 *   diffuseRadiation, hourlyForecast, precipMmHr } pulled off useSkyState.
 *   The payload already has most of these in different names; extras carries
 *   the open-meteo-named fields needed for the discrete drivers.
 * @returns {object} signals — flat map keyed by ALL_SIGNAL_KEYS (any
 *   unavailable signal is left undefined; drivers that read undefined
 *   evaluate to strength 0, by design).
 */
export function deriveSignals(payload, currentTime, extras = {}) {
  const s = {
    tempC:           payload?.tempC,
    cloudCover:      payload?.cloudCover,
    pressureMb:      payload?.pressureMb,
    humidity:        payload?.humidity,
    windKph:         payload?.windKph,
    windDirDeg:      payload?.windDirDeg,
    precipMmHr:      payload?.precipMmHr,
    sunElevationDeg: payload?.sunElevationDeg,
    sunAzimuthDeg:   payload?.sunAzimuthDeg,
    precipitation:   payload?.precipMmHr,
    weathercode:     extras?.currentWeatherCode ?? null,
    pressure_trend_3hr: pressureTrend3hr(payload?.pressureMb, extras?.hourlyForecast, currentTime),
    direct_ratio:    directRatio(extras?.directRadiation, extras?.diffuseRadiation),
    hour_of_day:     currentTime ? currentTime.getHours() : null,
    minute_of_day:   currentTime ? currentTime.getHours() * 60 + currentTime.getMinutes() : null,
  }
  return s
}

/**
 * Pressure trend = current - (pressure 3 hours ago, from hourly back-fill).
 * Returns null if either endpoint is unavailable — modulator strength
 * evaluates to 0 in that case (correct: we can't claim a front is passing
 * if we don't know where pressure was three hours ago).
 */
function pressureTrend3hr(currentPressureMb, hourly, now) {
  if (currentPressureMb == null || !Array.isArray(hourly) || hourly.length === 0 || !now) return null
  const target = now.getTime() - 3 * 3600 * 1000
  // Find the closest hourly entry to (now - 3hr). The hourly array is
  // sorted ascending by `time`; linear scan is fine for ~52 entries.
  let best = null
  let bestDt = Infinity
  for (const h of hourly) {
    if (!h?.time || h.pressureMb == null) continue
    const dt = Math.abs(h.time.getTime() - target)
    if (dt < bestDt) { bestDt = dt; best = h }
  }
  // Reject if the closest entry is more than 90 min off the target —
  // means the back-fill didn't cover this point and trend would be
  // misleading.
  if (!best || bestDt > 90 * 60 * 1000) return null
  return currentPressureMb - best.pressureMb
}

function directRatio(direct, diffuse) {
  if (direct == null || diffuse == null) return null
  const denom = direct + diffuse + 1  // +1 to keep dawn / dusk well-behaved when both are tiny
  return direct / denom
}

export default deriveSignals
