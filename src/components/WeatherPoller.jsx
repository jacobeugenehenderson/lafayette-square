import { useEffect } from 'react'
import { acquireWeatherPoll, fetchWindTendencyFromDeg } from '../hooks/useWeather'
import useSkyState from '../hooks/useSkyState'
import { WEATHER_PRESETS, windTendencyFromDeg, withStillAir } from '../lib/weatherPresets.js'
import useAtmosphere from '../hooks/useAtmosphere.js'

// `mode` = 'live' (poll the town's real weather) or a WEATHER_PRESETS key, which
// stands the scene in that weather and stops polling (Stage's Weather switch: the
// operator can judge a look in clear weather while it rains in the real town).
function WeatherPoller({ mode = 'live' }) {
  useEffect(() => {
    if (mode !== 'live') {
      const preset = WEATHER_PRESETS[mode]
      if (!preset) throw new Error(`[weather] ⛔ unknown weather mode '${mode}' (have: live, ${Object.keys(WEATHER_PRESETS).join(', ')})`)
      const sky = useSkyState.getState()
      // The town's wind TENDENCY, read before the forecast is cleared: its own readings, never a kit constant.
      const fromDeg = windTendencyFromDeg(sky.hourlyForecast?.length ? sky.hourlyForecast
        : (sky.weatherAt != null ? [{ windSpeedMs: sky.windSpeedMs, windDirDeg: sky.windDirDeg }] : []))
      useAtmosphere.getState().requestSnap()   // a chosen weather lands at once
      sky.setFeedPaused(true)             // a live fetch already in flight must not land over it
      sky.setHourlyForecast([])           // the live forecast is a directive input too
      sky.setWeatherTargets(withStillAir(preset, fromDeg))
      // No reading on this page yet (Stage OPENS in Clear): fetch the town's forecast for its tendency alone, then stand
      // the preset in still air from it — unless the switch has moved on. Until then it is calm, and that is said.
      let live = true
      if (fromDeg == null) {
        fetchWindTendencyFromDeg().then((d) => {
          if (!live) return
          if (d == null) { console.warn(`[weather] '${mode}' stands in CALM: no wind tendency for this town could be read.`); return }
          useSkyState.getState().setWeatherTargets(withStillAir(preset, d))
        })
      }
      return () => { live = false }
      return
    }
    useSkyState.getState().setFeedPaused(false)
    // Live: join the page's one poll (hooks/useWeather.js) — shared with any other reader, never a second fetch.
    return acquireWeatherPoll()
  }, [mode])

  return null
}

export default WeatherPoller
