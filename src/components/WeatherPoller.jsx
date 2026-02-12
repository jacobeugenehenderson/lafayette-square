import { useEffect, useRef } from 'react'
import { fetchWeather } from '../hooks/useWeather'
import useSkyState from '../hooks/useSkyState'

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

function WeatherPoller() {
  const intervalRef = useRef(null)

  useEffect(() => {
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
  }, [])

  return null
}

export default WeatherPoller
