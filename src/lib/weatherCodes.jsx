import { useState, useEffect } from 'react'

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
 * Inlined as live SVG DOM so SMIL animations play on all browsers (mobile Safari
 * strips animations from <img>-loaded SVGs).
 */

const svgCache = new Map()

function fetchSvg(name) {
  if (svgCache.has(name)) return svgCache.get(name)
  const promise = fetch(`${import.meta.env.BASE_URL}weather-icons/${name}.svg`)
    .then((r) => r.text())
    .then((text) => {
      // Force SVG to fill its container
      const sized = text.replace('<svg ', '<svg width="100%" height="100%" ')
      svgCache.set(name, sized)
      return sized
    })
    .catch((err) => {
      console.warn(`[WeatherIcon] Failed to load ${name}.svg:`, err)
      svgCache.delete(name) // clear so next render can retry
      return ''
    })
  svgCache.set(name, promise)
  return promise
}

export function WeatherIcon({ code, isNight = false, size = 24, className = '' }) {
  const name = getWeatherIconName(code, isNight)
  const [svg, setSvg] = useState(() => {
    const cached = svgCache.get(name)
    return typeof cached === 'string' ? cached : ''
  })

  useEffect(() => {
    let cancelled = false
    const cached = svgCache.get(name)
    if (typeof cached === 'string') { setSvg(cached); return }
    fetchSvg(name).then((text) => { if (!cancelled) setSvg(text) })
    return () => { cancelled = true }
  }, [name])

  return (
    <span
      role="img"
      aria-label={getWeatherCondition(code ?? 0).label}
      className={className}
      style={{ display: 'inline-block', width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
