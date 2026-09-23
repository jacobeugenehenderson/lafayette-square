import { create } from 'zustand'
import SunCalc from 'suncalc'
import { INSTANCE } from '../instance.js'
import useCalendar from './useCalendar.js'

const LATITUDE = INSTANCE.geography.lat
const LONGITUDE = INSTANCE.geography.lon

const useTimeOfDay = create((set, get) => ({
  currentTime: new Date(),
  timeSpeed: 1,
  isPaused: false,
  isLive: true,

  // Operator-driven scrub: flip isLive=false.
  // Bidirectional sync with useCalendar: the two stores hold parallel
  // Date views; keep them in lockstep so consumers reading either see
  // the same moment. Direct setState writes don't recurse; safe.
  setTime: (date) => {
    set({ currentTime: date, isLive: false })
    useCalendar.setState({ currentDate: date, isLive: false })
  },
  // Pump-driven live tick: advance currentTime without flipping isLive.
  // No-ops once the operator has scrubbed out of live mode (isLive=false) so
  // the 60s wall-time pump never overwrites a scrubbed time back to now.
  // Only scrub calls (setTime / setHour / setMinuteOfDay) leave live mode;
  // returnToLive resumes it. See meteorologist/NOTES.md 2026-05-20 ADR.
  setTimeFromLive: (date) => {
    if (!get().isLive) return
    set({ currentTime: date })
    useCalendar.setState({ currentDate: date })
  },
  returnToLive: () => {
    const now = new Date()
    set({ isLive: true, currentTime: now })
    useCalendar.setState({ isLive: true, currentDate: now })
  },
  setTimeSpeed: (speed) => set({ timeSpeed: speed }),
  setPaused: (v) => set({ isPaused: v }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  // ⭐ BOTH ARE SCRUBS, so both leave live mode and sync the calendar — exactly what the
  // contract above says ("Only scrub calls (setTime / setHour / setMinuteOfDay) leave live
  // mode"). ⛔ They did neither. `isLive` stayed true, so `setTimeFromLive`'s guard did not
  // fire and the next wall-clock tick overwrote the scrub with `now`.
  // ⚠️ The operator symptom, and it made the Look panel unusable (Jacob, 2026-09-22):
  // clicking a time-of-day slot chip in a channel's effect slot "goes there, and then
  // bounces back to current time" — `scrubToTodSlot` routes through `setMinuteOfDay`, so
  // every chip-click was undone. Authoring a per-ToD look was impossible except by dragging
  // the main picker, which happens to call `setTime`.
  // ⛔ They also skipped the `useCalendar` write `setTime` does, so the two parallel Date
  // views drifted apart on every chip click — the exact lockstep the comment promises.
  setHour: (hour) => {
    const now = new Date()
    const wholeHour = Math.floor(hour)
    const minutes = Math.round((hour - wholeHour) * 60)
    now.setHours(wholeHour, minutes, 0, 0)
    set({ currentTime: now, isLive: false })
    useCalendar.setState({ currentDate: now, isLive: false })
  },

  setMinuteOfDay: (minutes) => {
    const now = new Date()
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    now.setHours(hours, mins, 0, 0)
    set({ currentTime: now, isLive: false })
    useCalendar.setState({ currentDate: now, isLive: false })
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
