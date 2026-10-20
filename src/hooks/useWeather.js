import useSkyState from './useSkyState'
import useAtmosphere from './useAtmosphere.js'
import { deriveStorminess, windTendencyFromDeg } from '../lib/weatherPresets.js'
import { townPlace } from '../lib/townPlace.js'
import { nwsWeather, OutsideCoverageError, skyCode } from '../lib/nws.js'

// The town's weather comes from the US National Weather Service (lib/nws.js: why, the field-by-field sources, and
// what NWS cannot supply). Asked at FETCH time for the placed town (lib/townPlace.js), never the kit's boot town.
// ⛔ A town outside NWS coverage is said by name (OutsideCoverageError) — there is no other provider.
function townWeather() {
  const { lat, lon, lookId } = townPlace()
  return nwsWeather({ lat, lon, name: lookId })
}
/** A failed read, said: a town outside coverage by its own message (it names the town), anything else with its error. */
function say(e, consequence) {
  if (e instanceof OutsideCoverageError) console.error(`${e.message} — ${consequence}`)
  else console.error(`[weather] ⛔ the forecast could not be read — ${consequence}:`, e)
}

/**
 * Reconcile a weather code against the Degrees: if the code claims active precipitation (any WMO ≥ 51 —
 * drizzle/rain/snow/showers/thunderstorm) but nothing is falling, downgrade to the dry condition the cloud cover
 * supports (lib/nws.js#skyCode). The code is the less reliable tier; the Degrees (precip, cloud cover) are the
 * ground truth (WEATHER-MODEL.md: a Condition × its Degrees). Under NWS this also keeps a "slight chance" period with
 * no precipitation amount from reading as rain. Fog (45/48) is visibility-driven, not precip — left alone.
 */
function reconcileWeatherCode(code, precipMm, cloudCoverPct) {
  if (code >= 51 && (precipMm ?? 0) <= 0) return skyCode(cloudCoverPct)
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
    windGustsMs: r.windGustsMs ?? null,
    pressureMb: r.pressureMb ?? null,
    humidity: r.humidity != null ? r.humidity / 100 : null,
    temperatureF: r.temperatureF ?? null,
    currentWeatherCode: code,
    directRadiation: r.directRadiation ?? null,
    diffuseRadiation: r.diffuseRadiation ?? null,
  }
}

/**
 * Fetch the town's weather (lib/nws.js): the current reading → the live feed (useSkyState), and the hourly
 * forecast → `hourlyForecast` (whole readings, lib/weatherAt.js).
 * `snap`: the operator chose Live on Stage's Weather switch, so this reading lands
 * at once instead of easing in over the directive tween. The snap is requested when
 * the reading arrives, not when it was asked for, so a slow fetch still lands at once.
 * ⛔ A failed fetch is SAID (console.error), never swallowed: the sky then holds its last reading, and the page says
 * why. A town outside NWS coverage is said by name.
 */
export async function fetchWeather({ snap = false } = {}) {
  let w
  try {
    w = await townWeather()
  } catch (e) {
    say(e, 'the weather is not updated')
    return
  }
  // Stage's Weather switch is standing a preset: the live feed writes nothing.
  if (useSkyState.getState().feedPaused) return

  if (snap) useAtmosphere.getState().requestSnap()
  useSkyState.getState().setWeatherTargets(targetsOf(w.current))
  // When the live reading arrived — about the reading, not a weather value, so it is not a weather target (a
  // preset writes every target; this is only ever the feed's).
  useSkyState.setState({ weatherAt: Date.now(), currentReading: w.current })
  useSkyState.getState().setHourlyForecast(w.hourly)
}

/**
 * The town's wind TENDENCY (degrees FROM): the speed-weighted mean of its forecast's hourly wind — for a Stage preset's
 * still air, which has no reading of its own (lib/weatherPresets.js#withStillAir). Read-only: writes NOTHING to the
 * weather. null when the forecast can't be had, and said.
 */
export async function fetchWindTendencyFromDeg() {
  try {
    return windTendencyFromDeg((await townWeather()).hourly)
  } catch (e) {
    say(e, 'no wind tendency for the preset')
    return null
  }
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
