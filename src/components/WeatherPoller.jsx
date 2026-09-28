import { useEffect } from 'react'
import { acquireWeatherPoll } from '../hooks/useWeather'
import useSkyState from '../hooks/useSkyState'
import { WEATHER_PRESETS } from '../lib/weatherPresets.js'
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
      useAtmosphere.getState().requestSnap()   // a chosen weather lands at once
      sky.setFeedPaused(true)             // a live fetch already in flight must not land over it
      sky.setHourlyForecast([])           // the live forecast is a directive input too
      sky.setWeatherTargets(preset)
      return
    }
    useSkyState.getState().setFeedPaused(false)
    // Live: join the page's one poll (hooks/useWeather.js) — shared with any other reader, never a second fetch.
    return acquireWeatherPoll()
  }, [mode])

  return null
}

export default WeatherPoller
