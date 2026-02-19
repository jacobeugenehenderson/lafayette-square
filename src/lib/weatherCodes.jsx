/**
 * Map WMO weather code → { label, iconKey }
 */
export function getWeatherCondition(wmoCode) {
  if (wmoCode === 0) return { label: 'Clear Sky', iconKey: 'clear' }
  if (wmoCode === 1) return { label: 'Mainly Clear', iconKey: 'clear' }
  if (wmoCode === 2) return { label: 'Partly Cloudy', iconKey: 'partly-cloudy' }
  if (wmoCode === 3) return { label: 'Overcast', iconKey: 'overcast' }
  if (wmoCode === 45 || wmoCode === 48) return { label: 'Fog', iconKey: 'fog' }
  if (wmoCode >= 51 && wmoCode <= 57) return { label: 'Drizzle', iconKey: 'drizzle' }
  if (wmoCode >= 61 && wmoCode <= 67) return { label: 'Rain', iconKey: 'rain' }
  if (wmoCode >= 71 && wmoCode <= 77) return { label: 'Snow', iconKey: 'snow' }
  if (wmoCode >= 80 && wmoCode <= 82) return { label: 'Rain Showers', iconKey: 'rain' }
  if (wmoCode >= 85 && wmoCode <= 86) return { label: 'Snow Showers', iconKey: 'snow' }
  if (wmoCode >= 95 && wmoCode <= 99) return { label: 'Thunderstorm', iconKey: 'thunderstorms' }
  return { label: 'Clear', iconKey: 'clear' }
}

/**
 * Resolve WMO code + day/night into the Meteocons SVG filename (without extension).
 */
export function getWeatherIconName(wmoCode, isNight = false) {
  const { iconKey } = getWeatherCondition(wmoCode ?? 0)
  if (iconKey === 'clear') return isNight ? 'clear-night' : 'clear-day'
  if (iconKey === 'partly-cloudy') return isNight ? 'partly-cloudy-night' : 'partly-cloudy-day'
  return iconKey
}

/**
 * Animated Meteocons weather icon (loaded from /weather-icons/).
 */
export function WeatherIcon({ code, isNight = false, size = 24, className = '' }) {
  const name = getWeatherIconName(code, isNight)
  return (
    <img
      src={`/weather-icons/${name}.svg`}
      alt={getWeatherCondition(code ?? 0).label}
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block' }}
    />
  )
}
