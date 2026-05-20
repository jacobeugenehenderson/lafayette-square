/**
 * weather-payload — bridges runtime weather state to the Almanac
 * evaluator's input schema (meteorologist/pipeline/schema/weather-payload.schema.json).
 *
 * useWeather.js fetches open-meteo and writes targets into useSkyState.
 * This module reads the latest weather targets + the current scrub time
 * + INSTANCE geography, derives the schema-aligned payload (sun
 * position, tod, season, precip kind), and returns it for
 * selectDirective() to consume.
 *
 * Doctrine: project_hardwires_come_out_when_channels_install — wind
 * direction and humidity / pressure used to be implicit; now they're
 * first-class fields so the Almanac can rule on them.
 */
import SunCalc from 'suncalc'
import { INSTANCE } from '../instance.js'

// WMO weather codes → precip kind enum from weather-payload.schema.json
// (rain | snow | sleet | hail | null). Codes the schema doesn't accept
// (drizzle, fog) collapse to the closest match or null.
const WEATHER_CODE_TO_PRECIP_KIND = {
  51: 'rain', 53: 'rain', 55: 'rain',                  // drizzle → rain
  56: 'sleet', 57: 'sleet',                            // freezing drizzle
  61: 'rain', 63: 'rain', 65: 'rain',
  66: 'sleet', 67: 'sleet',                            // freezing rain
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
  80: 'rain', 81: 'rain', 82: 'rain',
  85: 'snow', 86: 'snow',
  95: 'rain',                                          // thunderstorm
  96: 'hail', 99: 'hail',
}

// TOD partition — sunAlt in radians. Aligns with the schema enum:
// dawn / morning / noon / afternoon / dusk / night / blue_hour / golden_hour.
// Tuned to typical photographic definitions; the Almanac currently only
// uses 'dawn' / 'morning' / 'noon' / 'afternoon' / 'dusk' / 'night',
// blue/golden hour reserved for Modulators.
function deriveTod(sunAlt, hour) {
  if (sunAlt < -0.10) return 'night'
  if (sunAlt < -0.02) {
    return hour < 12 ? 'dawn' : 'dusk'
  }
  if (sunAlt < 0.10) {
    return hour < 12 ? 'morning' : 'dusk'
  }
  // sun up
  if (hour < 11) return 'morning'
  if (hour < 14) return 'noon'
  return 'afternoon'
}

function deriveSeason(date, lat) {
  const m = date.getMonth() + 1
  const north = lat >= 0
  // Astronomical-ish quarters; matches schema enum spring/summer/fall/winter.
  if (north) {
    if (m >= 3 && m <= 5) return 'spring'
    if (m >= 6 && m <= 8) return 'summer'
    if (m >= 9 && m <= 11) return 'fall'
    return 'winter'
  } else {
    if (m >= 3 && m <= 5) return 'fall'
    if (m >= 6 && m <= 8) return 'winter'
    if (m >= 9 && m <= 11) return 'spring'
    return 'summer'
  }
}

/**
 * Build a payload conforming to weather-payload.schema.json.
 *
 * @param {object} weatherTargets — useSkyState weather slice (raw open-meteo
 *   parse). Optional fields default to schema-safe values; never throws.
 * @param {Date} currentTime — scrub time from useTimeOfDay.
 * @returns {object} payload — passable to selectDirective({weather: ...}).
 */
export function buildWeatherPayload(weatherTargets, currentTime) {
  const lat = INSTANCE.geography.lat
  const lon = INSTANCE.geography.lon
  const sun = SunCalc.getPosition(currentTime, lat, lon)

  const tempF = weatherTargets?.temperatureF
  const tempC = tempF != null ? (tempF - 32) * 5 / 9 : null

  // windKph from open-meteo's wind_speed_10m (m/s) — useWeather stores
  // both the raw speed (windSpeedMs) and the directional vector.
  const windMs = weatherTargets?.windSpeedMs ?? (
    weatherTargets?.windVector
      ? Math.hypot(weatherTargets.windVector.x, weatherTargets.windVector.y)
      : 0
  )
  const windKph = windMs * 3.6

  // Direction the wind is blowing FROM (meteorological convention,
  // matches schema). open-meteo's wind_direction_10m is already
  // FROM-degrees (0=N, 90=E).
  const windDirDeg = weatherTargets?.windDirDeg ?? 0

  // Azimuth: SunCalc returns radians measured from south, +west. The
  // schema wants compass bearing 0..360 (0=N, 90=E). Convert by:
  //   compass = (sun.azimuth_rad * 180/π + 180) mod 360
  const sunAzimuthDeg = ((sun.azimuth * 180 / Math.PI) + 180 + 360) % 360

  const payload = {
    tempC: tempC,
    cloudCover: Math.max(0, Math.min(1, weatherTargets?.cloudCover ?? 0)),
    pressureMb: weatherTargets?.pressureMb ?? null,
    humidity: weatherTargets?.humidity ?? null,
    windKph: windKph,
    windDirDeg: windDirDeg,
    precipMmHr: weatherTargets?.precipitationIntensity ?? 0,
    precipKind: WEATHER_CODE_TO_PRECIP_KIND[weatherTargets?.currentWeatherCode] ?? null,
    // open-meteo doesn't publish storm distance; default far so storm
    // distance rules don't false-fire on clear days.
    stormDistanceKm: weatherTargets?.stormDistanceKm ?? 100,
    sunElevationDeg: sun.altitude * 180 / Math.PI,
    sunAzimuthDeg: sunAzimuthDeg,
    tod: deriveTod(sun.altitude, currentTime.getHours()),
    season: deriveSeason(currentTime, lat),
  }

  // Drop nulls for fields whose schema entry doesn't allow null — keeps
  // the evaluator's numeric range checks from coercing on `null < n`.
  if (payload.tempC == null) delete payload.tempC
  if (payload.pressureMb == null) delete payload.pressureMb
  if (payload.humidity == null) delete payload.humidity

  return payload
}

export default buildWeatherPayload
