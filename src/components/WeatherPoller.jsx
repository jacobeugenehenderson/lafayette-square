import { useEffect, useRef } from 'react'
import { fetchWeather } from '../hooks/useWeather'
import useSkyState from '../hooks/useSkyState'
import { WEATHER_PRESETS } from '../lib/weatherPresets.js'

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
      useSkyState.getState().setWeatherTargets(preset)
      return
    }
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
