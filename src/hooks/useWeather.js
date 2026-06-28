import useSkyState from './useSkyState'
import { INSTANCE } from '../instance.js'

// Halo 2026-05-20 Phase 6: added direct_radiation + diffuse_radiation to
// current (modulators read the ratio for haze / wildfire-smoke detection)
// and pressure_msl + past_hours=4 to hourly (so deriveSignals can compute
// pressure_trend_3hr from the back-fill instead of maintaining an
// in-memory ring buffer — Approach B from the Phase 6 brief).
const API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${INSTANCE.geography.lat}&longitude=${INSTANCE.geography.lon}&current=temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m,direct_radiation,diffuse_radiation&hourly=temperature_2m,weather_code,pressure_msl&past_hours=4&forecast_hours=48&temperature_unit=fahrenheit&timezone=${encodeURIComponent(INSTANCE.geography.timezone)}`

/**
 * Reconcile Open-Meteo's current `weather_code` against the live Degrees.
 *
 * Open-Meteo's `current.weather_code` can go stale / inconsistent with the
 * other current fields — e.g. it returns 95 ("thunderstorm") with cloud_cover 0
 * and precipitation 0 on a clear evening (verified St. Louis 2026-06-28). The
 * code is the unreliable tier; the Degrees (precip, cloud cover) are the ground
 * truth (WEATHER-MODEL.md: a Condition × its Degrees). So: if the code claims
 * active precipitation (any WMO ≥ 51 — drizzle/rain/snow/showers/thunderstorm)
 * but nothing is actually falling, downgrade to the dry condition the cloud
 * cover supports. Fog (45/48) is visibility-driven, not precip — left alone.
 * This stops the public app from reading "thunderstorm" on a clear day, and
 * keeps the phantom code out of storminess (sky darkening).
 */
function reconcileWeatherCode(code, precipMm, cloudCoverPct) {
  if (code >= 51 && (precipMm ?? 0) <= 0) {
    const cc = cloudCoverPct ?? 0
    if (cc < 12) return 0   // clear
    if (cc < 50) return 1   // mainly clear
    if (cc < 87) return 2   // partly cloudy
    return 3                // overcast
  }
  return code
}

/**
 * Derive storminess (0-1) from WMO weather code + precipitation amount
 */
function deriveStorminess(weatherCode, precipitation) {
  let base = 0
  if (weatherCode >= 95) base = 0.8          // thunderstorm
  else if (weatherCode >= 80) base = 0.4     // showers
  else if (weatherCode >= 61) base = 0.2     // rain
  else if (weatherCode >= 51) base = 0.1     // drizzle
  else if (weatherCode >= 71) base = 0.15    // snow
  else if (weatherCode >= 45) base = 0.05    // fog

  // Boost from precipitation intensity (mm/h)
  const precipBoost = Math.min(0.2, precipitation * 0.02)
  return Math.min(1, base + precipBoost)
}

/**
 * Derive turbidity (0-1) from visibility in meters
 * 50km+ = 0 (crystal clear), 1km = 1 (dense haze)
 */
function deriveTurbidity(visibility) {
  if (visibility >= 50000) return 0
  if (visibility <= 1000) return 1
  return 1 - (visibility - 1000) / (50000 - 1000)
}

/**
 * Fetch current weather from Open-Meteo and push targets to useSkyState
 */
export async function fetchWeather() {
  try {
    const res = await fetch(API_URL)
    if (!res.ok) return
    const data = await res.json()
    const c = data.current

    // Trust the Degrees over a possibly-stale weather_code (see reconcile above).
    const saneCode = reconcileWeatherCode(c.weather_code ?? 0, c.precipitation ?? 0, c.cloud_cover ?? 0)
    const cloudCover = (c.cloud_cover ?? 0) / 100
    const storminess = deriveStorminess(saneCode, c.precipitation ?? 0)
    const turbidity = deriveTurbidity(c.visibility ?? 50000)
    const precipitationIntensity = c.precipitation ?? 0

    // Wind: speed (m/s) + direction (degrees) → Vector2
    const speed = c.wind_speed_10m ?? 0
    const dirRad = ((c.wind_direction_10m ?? 0) * Math.PI) / 180
    const windVector = {
      x: Math.sin(dirRad) * speed,
      y: Math.cos(dirRad) * speed,
    }

    useSkyState.getState().setWeatherTargets({
      cloudCover,
      storminess,
      turbidity,
      precipitationIntensity,
      windVector,
      windSpeedMs: speed,
      windDirDeg: c.wind_direction_10m ?? 0,
      pressureMb: c.pressure_msl ?? null,
      humidity: c.relative_humidity_2m != null ? c.relative_humidity_2m / 100 : null,
      temperatureF: c.temperature_2m ?? null,
      currentWeatherCode: saneCode,
      directRadiation:  c.direct_radiation  ?? null,
      diffuseRadiation: c.diffuse_radiation ?? null,
    })

    // Parse hourly forecast
    if (data.hourly) {
      const times = data.hourly.time || []
      const temps = data.hourly.temperature_2m || []
      const codes = data.hourly.weather_code || []
      const press = data.hourly.pressure_msl || []
      // Open-Meteo returns times in the requested timezone without offset suffix.
      // Use utc_offset_seconds from response to build proper Date objects.
      const utcOffset = data.utc_offset_seconds ?? -21600 // CST = -6h
      const offsetMs = utcOffset * 1000
      const hourly = times.map((t, i) => {
        // t is like "2026-02-19T14:00" — parse as local by appending offset
        const offsetHours = Math.floor(Math.abs(utcOffset) / 3600)
        const offsetMins = Math.floor((Math.abs(utcOffset) % 3600) / 60)
        const sign = utcOffset >= 0 ? '+' : '-'
        const suffix = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`
        return {
          time: new Date(`${t}${suffix}`),
          temperatureF: temps[i],
          weatherCode: codes[i],
          pressureMb: press[i] ?? null,
        }
      })
      useSkyState.getState().setHourlyForecast(hourly)
    }
  } catch (e) {
    // Silently ignore — sky stays at current values
  }
}

export default fetchWeather
