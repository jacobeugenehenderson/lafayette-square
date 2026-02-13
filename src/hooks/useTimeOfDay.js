import { create } from 'zustand'
import SunCalc from 'suncalc'

// Lafayette Square, St. Louis, MO coordinates
const LATITUDE = 38.6160
const LONGITUDE = -90.2161

const useTimeOfDay = create((set, get) => ({
  currentTime: new Date(),
  timeSpeed: 1,
  isPaused: false,

  setTime: (date) => set({ currentTime: date }),
  setTimeSpeed: (speed) => set({ timeSpeed: speed }),
  setPaused: (v) => set({ isPaused: v }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  setHour: (hour) => {
    const now = new Date()
    const wholeHour = Math.floor(hour)
    const minutes = Math.round((hour - wholeHour) * 60)
    now.setHours(wholeHour, minutes, 0, 0)
    set({ currentTime: now })
  },

  setMinuteOfDay: (minutes) => {
    const now = new Date()
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    now.setHours(hours, mins, 0, 0)
    set({ currentTime: now })
  },

  getMinuteOfDay: () => {
    const { currentTime } = get()
    return currentTime.getHours() * 60 + currentTime.getMinutes()
  },

  tick: (deltaMs) => {
    const { isPaused, timeSpeed, currentTime } = get()
    if (isPaused) return
    const newTime = new Date(currentTime.getTime() + deltaMs * timeSpeed)
    set({ currentTime: newTime })
  },

  getLightingPhase: () => {
    const { currentTime } = get()
    const sunPos = SunCalc.getPosition(currentTime, LATITUDE, LONGITUDE)
    const sunAlt = sunPos.altitude
    return {
      isNight: sunAlt < -0.12,
      isTwilight: sunAlt >= -0.12 && sunAlt < 0.05,
      shouldGlow: sunAlt < 0.05,
      sunAltitude: sunAlt,
    }
  },
}))

export default useTimeOfDay
