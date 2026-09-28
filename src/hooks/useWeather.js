import useSkyState from './useSkyState'
import useAtmosphere from './useAtmosphere.js'
import { deriveStorminess } from '../lib/weatherPresets.js'
import { townPlace } from '../lib/townPlace.js'

// Halo 2026-05-20 Phase 6: added direct_radiation + diffuse_radiation to
// current (modulators read the ratio for haze / wildfire-smoke detection)
// and pressure_msl + past_hours=4 to hourly (so deriveSignals can compute
// pressure_trend_3hr from the back-fill instead of maintaining an
// in-memory ring buffer — Approach B from the Phase 6 brief).
// The forecast for the town being drawn — built at FETCH time from its place (lib/townPlace.js), never from the
// kit's boot town at module load (which drew the boot town's weather over any other).
function apiUrl() {
  const { lat, lon, timezone } = townPlace()
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m,direct_radiation,diffuse_radiation&hourly=temperature_2m,weather_code,pressure_msl&past_hours=4&forecast_hours=48&temperature_unit=fahrenheit&wind_speed_unit=ms&timezone=${encodeURIComponent(timezone)}`
}

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
 * Derive turbidity (0-1) from visibility in meters
 * 50km+ = 0 (crystal clear), 1km = 1 (dense haze)
 */
function deriveTurbidity(visibility) {
  if (visibility >= 50000) return 0
  if (visibility <= 1000) return 1
  return 1 - (visibility - 1000) / (50000 - 1000)
}

/**
 * Fetch current weather from Open-Meteo and push targets to useSkyState.
 * `snap`: the operator chose Live on Stage's Weather switch, so this reading lands
 * at once instead of easing in over the directive tween. The snap is requested when
 * the reading arrives, not when it was asked for, so a slow fetch still lands at once.
 */
export async function fetchWeather({ snap = false } = {}) {
  try {
    const res = await fetch(apiUrl())
    if (!res.ok) return
    const data = await res.json()
    // Stage's Weather switch is standing a preset: the live feed writes nothing.
    if (useSkyState.getState().feedPaused) return
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

    if (snap) useAtmosphere.getState().requestSnap()
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
      weatherAt: Date.now(),
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
      // ⛔ The offset is the TOWN's, as the provider answered for its timezone. It used to fall back to -21600
      // (CST: Lafayette Square's) — every other town's forecast would have been shifted silently. Absent, the
      // forecast is not parsed, and that is said.
      const utcOffset = data.utc_offset_seconds
      if (!Number.isFinite(utcOffset)) { console.error('[weather] ⛔ the forecast carries no utc_offset_seconds — its hours cannot be placed; hourly forecast not read'); return }
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
