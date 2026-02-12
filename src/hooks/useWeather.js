import useSkyState from './useSkyState'

const API_URL = 'https://api.open-meteo.com/v1/forecast?latitude=38.616&longitude=-90.2161&current=cloud_cover,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m&timezone=America/Chicago'

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
    })
  } catch (e) {
    // Silently ignore — sky stays at current values
  }
}

export default fetchWeather
