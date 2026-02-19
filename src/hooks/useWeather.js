import useSkyState from './useSkyState'

const API_URL = 'https://api.open-meteo.com/v1/forecast?latitude=38.616&longitude=-90.2161&current=temperature_2m,cloud_cover,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code&forecast_hours=48&temperature_unit=fahrenheit&timezone=America/Chicago'

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

    const cloudCover = (c.cloud_cover ?? 0) / 100
    const storminess = deriveStorminess(c.weather_code ?? 0, c.precipitation ?? 0)
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
      temperatureF: c.temperature_2m ?? null,
      currentWeatherCode: c.weather_code ?? null,
    })

    // Parse hourly forecast
    if (data.hourly) {
      const times = data.hourly.time || []
      const temps = data.hourly.temperature_2m || []
      const codes = data.hourly.weather_code || []
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
        }
      })
      useSkyState.getState().setHourlyForecast(hourly)
    }
  } catch (e) {
    // Silently ignore — sky stays at current values
  }
}

export default fetchWeather
