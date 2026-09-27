import { useEffect, useRef } from 'react'
import { fetchWeather } from '../hooks/useWeather'
import useSkyState from '../hooks/useSkyState'
import { WEATHER_PRESETS } from '../lib/weatherPresets.js'
import useAtmosphere from '../hooks/useAtmosphere.js'

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

// `mode` = 'live' (poll the town's real weather) or a WEATHER_PRESETS key, which
// stands the scene in that weather and stops polling (Stage's Weather switch: the
// operator can judge a look in clear weather while it rains in the real town).
function WeatherPoller({ mode = 'live' }) {
  const intervalRef = useRef(null)

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
    // Initial fetch
    fetchWeather()

    // Start polling
    intervalRef.current = setInterval(fetchWeather, POLL_INTERVAL)

    // Background tab detection
    const handleVisibility = () => {
      const hidden = document.hidden
      useSkyState.getState().setBackgroundTab(hidden)

      if (!hidden) {
        // Tab returned to foreground — fetch immediately
        fetchWeather()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [mode])

  return null
}

export default WeatherPoller
