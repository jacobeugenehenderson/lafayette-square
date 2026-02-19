import SunCalc from 'suncalc'

const LATITUDE = 38.6160
const LONGITUDE = -90.2161

function getDawn(date) {
  return SunCalc.getTimes(date, LATITUDE, LONGITUDE).dawn
}

/**
 * Get the dawn-to-dawn window containing `now`.
 * If now >= today's dawn → [todayDawn, tomorrowDawn]
 * If now < today's dawn  → [yesterdayDawn, todayDawn]
 */
export function getDawnWindow(now) {
  const todayDawn = getDawn(now)

  if (now >= todayDawn) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return { start: todayDawn, end: getDawn(tomorrow) }
  } else {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return { start: getDawn(yesterday), end: todayDawn }
  }
}

/**
 * Convert a Date to a 0–1 fraction within the dawn window.
 */
export function dateToFraction(date, window) {
  const span = window.end.getTime() - window.start.getTime()
  if (span <= 0) return 0
  return Math.max(0, Math.min(1, (date.getTime() - window.start.getTime()) / span))
}

/**
 * Convert a 0–1 fraction back to a Date within the dawn window.
 */
export function fractionToDate(fraction, window) {
  const span = window.end.getTime() - window.start.getTime()
  return new Date(window.start.getTime() + fraction * span)
}

/**
 * Get labeled waypoints (dawn, noon, golden hour, dusk) within the window.
 * Each: { label, fraction, time, color }
 */
export function getWaypoints(window) {
  // Use the middle of the window to compute sun times for the relevant day
  const mid = new Date((window.start.getTime() + window.end.getTime()) / 2)
  const times = SunCalc.getTimes(mid, LATITUDE, LONGITUDE)

  const candidates = [
    { label: 'Sunrise', time: times.sunrise, color: '#fb923c', ticOnly: true },
    { label: 'Noon', time: times.solarNoon, color: '#fbbf24', ticOnly: false },
    { label: 'Golden', time: times.goldenHour, color: '#fbbf24', ticOnly: true },
    { label: 'Sunset', time: times.sunset, color: '#fb923c', ticOnly: false },
  ]

  return candidates
    .filter(c => c.time >= window.start && c.time <= window.end)
    .map(c => ({
      ...c,
      fraction: dateToFraction(c.time, window),
    }))
}

/**
 * Interpolate forecast data for an arbitrary date.
 * Temp: linear interpolation between surrounding hours.
 * Weather code: snap to nearest hour.
 */
export function interpolateForecast(date, hourlyForecast) {
  if (!hourlyForecast || hourlyForecast.length === 0) return null

  const t = date.getTime()

  // Find bracketing hours
  let before = null
  let after = null
  for (let i = 0; i < hourlyForecast.length; i++) {
    const ht = hourlyForecast[i].time.getTime()
    if (ht <= t) before = i
    if (ht >= t && after === null) after = i
  }

  // Edge cases: before or after entire forecast
  if (before === null && after === null) return null
  if (before === null) return { ...hourlyForecast[after] }
  if (after === null) return { ...hourlyForecast[before] }

  const b = hourlyForecast[before]
  const a = hourlyForecast[after]

  if (before === after) return { ...b }

  // Linear interpolation for temperature
  const span = a.time.getTime() - b.time.getTime()
  const frac = span > 0 ? (t - b.time.getTime()) / span : 0
  const temperatureF = b.temperatureF + (a.temperatureF - b.temperatureF) * frac

  // Nearest-snap for weather code
  const weatherCode = frac < 0.5 ? b.weatherCode : a.weatherCode

  return { temperatureF, weatherCode, time: date }
}

/**
 * Find hi/lo temps within the dawn window from hourly forecast.
 * Returns { hi: { temperatureF, fraction }, lo: { temperatureF, fraction } }
 */
export function getHiLo(window, hourlyForecast) {
  if (!hourlyForecast || hourlyForecast.length === 0) return null

  let hi = null
  let lo = null

  for (const entry of hourlyForecast) {
    const t = entry.time.getTime()
    if (t < window.start.getTime() || t > window.end.getTime()) continue

    if (hi === null || entry.temperatureF > hi.temperatureF) {
      hi = { temperatureF: entry.temperatureF, fraction: dateToFraction(entry.time, window) }
    }
    if (lo === null || entry.temperatureF < lo.temperatureF) {
      lo = { temperatureF: entry.temperatureF, fraction: dateToFraction(entry.time, window) }
    }
  }

  return hi && lo ? { hi, lo } : null
}
