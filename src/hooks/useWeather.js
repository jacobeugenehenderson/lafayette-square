import useSkyState from './useSkyState'
import useAtmosphere from './useAtmosphere.js'
import { deriveStorminess } from '../lib/weatherPresets.js'
import { townPlace } from '../lib/townPlace.js'

// The quantities a reading carries, asked for BOTH as `current` and `hourly`, so a forecast hour is a whole weather —
// the sky can be drawn from it at a scrubbed time (lib/weatherAt.js), not only the label. (Until 2026-10-04 the hourly
// carried temperature, code and pressure only, so a scrubbed sky could only show current conditions.)
const QUANTITIES = 'temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m,direct_radiation,diffuse_radiation'
// The forecast for the town being drawn — built at FETCH time from its place (lib/townPlace.js), never from the
// kit's boot town at module load (which drew the boot town's weather over any other).
// ⭐ The window: yesterday 00:00 → tomorrow 23:00 in the town (`past_days=1&forecast_days=2`; `forecast_hours` would
// override `past_days` and start at this hour). It holds the Almanac's whole dawn-to-dawn scrub, and the back-fill
// deriveSignals reads for the pressure trend.
function apiUrl() {
  const { lat, lon, timezone } = townPlace()
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${QUANTITIES}&hourly=${QUANTITIES}&past_days=1&forecast_days=2&temperature_unit=fahrenheit&wind_speed_unit=ms&timezone=${encodeURIComponent(timezone)}`
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

/** One Open-Meteo reading (current, or hourly column `i`) → the shape lib/weatherAt.js reads. */
function readingOf(src, i = null) {
  const v = (k) => (i == null ? src[k] : src[k]?.[i]) ?? null
  return {
    temperatureF: v('temperature_2m'), humidity: v('relative_humidity_2m'), pressureMb: v('pressure_msl'),
    cloudCover: v('cloud_cover'), precipitation: v('precipitation'), weatherCode: v('weather_code'),
    visibility: v('visibility'), windSpeedMs: v('wind_speed_10m'), windDirDeg: v('wind_direction_10m'),
    directRadiation: v('direct_radiation'), diffuseRadiation: v('diffuse_radiation'),
  }
}

/**
 * A reading → the sky's weather targets (the shape `useSkyState.setWeatherTargets` and the atmosphere directive
 * read). Shared by the live feed and the directive's scrubbed hour, so both derive the sky the same way.
 */
export function targetsOf(r) {
  // Trust the Degrees over a possibly-stale weather_code (see reconcile above).
  const code = reconcileWeatherCode(r.weatherCode ?? 0, r.precipitation ?? 0, r.cloudCover ?? 0)
  const speed = r.windSpeedMs ?? 0
  const dirRad = ((r.windDirDeg ?? 0) * Math.PI) / 180
  return {
    cloudCover: (r.cloudCover ?? 0) / 100,
    storminess: deriveStorminess(code, r.precipitation ?? 0),
    turbidity: deriveTurbidity(r.visibility ?? 50000),
    precipitationIntensity: r.precipitation ?? 0,
    windVector: { x: Math.sin(dirRad) * speed, y: Math.cos(dirRad) * speed },
    windSpeedMs: speed,
    windDirDeg: r.windDirDeg ?? 0,
    pressureMb: r.pressureMb ?? null,
    humidity: r.humidity != null ? r.humidity / 100 : null,
    temperatureF: r.temperatureF ?? null,
    currentWeatherCode: code,
    directRadiation: r.directRadiation ?? null,
    diffuseRadiation: r.diffuseRadiation ?? null,
  }
}

/**
 * Fetch the town's weather from Open-Meteo: the current reading → the live feed (useSkyState), and the hourly
 * forecast → `hourlyForecast` (whole readings, lib/weatherAt.js).
 * `snap`: the operator chose Live on Stage's Weather switch, so this reading lands
 * at once instead of easing in over the directive tween. The snap is requested when
 * the reading arrives, not when it was asked for, so a slow fetch still lands at once.
 * ⛔ A failed fetch is SAID (console.error), never swallowed: the sky then holds its last reading, and the page says
 * why. (Until 2026-10-04 a non-OK answer and every exception returned in silence.)
 */
export async function fetchWeather({ snap = false } = {}) {
  let data
  try {
    const res = await fetch(apiUrl())
    if (!res.ok) { console.error(`[weather] ⛔ the forecast provider answered ${res.status} — the weather is not updated`); return }
    data = await res.json()
  } catch (e) {
    console.error('[weather] ⛔ the forecast could not be fetched — the weather is not updated:', e)
    return
  }
  // Stage's Weather switch is standing a preset: the live feed writes nothing.
  if (useSkyState.getState().feedPaused) return
  if (!data?.current) { console.error('[weather] ⛔ the forecast carries no current reading — the weather is not updated'); return }

  const now = readingOf(data.current)
  if (snap) useAtmosphere.getState().requestSnap()
  useSkyState.getState().setWeatherTargets(targetsOf(now))
  // When the live reading arrived — about the reading, not a weather value, so it is not a weather target (a
  // preset writes every target; this is only ever the feed's).
  useSkyState.setState({ weatherAt: Date.now(), currentReading: now })

  // Open-Meteo returns times in the requested timezone without offset suffix.
  // ⛔ The offset is the TOWN's, as the provider answered for its timezone. It used to fall back to -21600
  // (CST: Lafayette Square's) — every other town's forecast would have been shifted silently. Absent, the
  // forecast is not parsed, and that is said.
  if (!data.hourly) { console.error('[weather] ⛔ the forecast carries no hourly readings — a scrubbed time has no weather'); return }
  const utcOffset = data.utc_offset_seconds
  if (!Number.isFinite(utcOffset)) { console.error('[weather] ⛔ the forecast carries no utc_offset_seconds — its hours cannot be placed; hourly forecast not read'); return }
  const offsetHours = Math.floor(Math.abs(utcOffset) / 3600)
  const offsetMins = Math.floor((Math.abs(utcOffset) % 3600) / 60)
  const suffix = `${utcOffset >= 0 ? '+' : '-'}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`
  // t is like "2026-02-19T14:00" — placed in the town by appending its offset.
  const hourly = (data.hourly.time || []).map((t, i) => ({ time: new Date(`${t}${suffix}`), ...readingOf(data.hourly, i) }))
  useSkyState.getState().setHourlyForecast(hourly)
}

// ── THE ONE POLL of the town's weather, per page ─────────────────────────────────
// Whoever needs the live feed ACQUIRES it: <Town>'s WeatherPoller, and an app's own reader (useTownWeather in
// Town.jsx — The Ward's Almanac runs on screens where no <Town> is mounted). The first acquirer starts it (an
// immediate fetch, then every 5 min, and on returning to the tab); the last release stops it. One fetch per page,
// never a second call to the provider reading a different number at a different time. The town is the placed
// one (lib/townPlace.js) at each fetch — a page that polls without a <Town> must have placed its town.
const POLL_INTERVAL = 5 * 60 * 1000
let _holders = 0, _interval = null
function _onVisibility() {
  useSkyState.getState().setBackgroundTab(document.hidden)
  if (!document.hidden) fetchWeather()   // back in front: fetch now
}
/** Start (or join) the page's one weather poll; returns the release. */
export function acquireWeatherPoll() {
  if (_holders++ === 0) {
    fetchWeather({ snap: true })
    _interval = setInterval(() => fetchWeather(), POLL_INTERVAL)
    document.addEventListener('visibilitychange', _onVisibility)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--_holders === 0) {
      clearInterval(_interval); _interval = null
      document.removeEventListener('visibilitychange', _onVisibility)
    }
  }
}

export default fetchWeather
