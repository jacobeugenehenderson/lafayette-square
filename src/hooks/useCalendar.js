import { create } from 'zustand'
import { townClockOf, townDayOfYear, townDateAtDayOfYear } from '../lib/townClock.js'
import { townPlace } from '../lib/townPlace.js'
import useTimeOfDay from './useTimeOfDay.js'

// Kit-level calendar anchor — date / day-of-year / season. Parallel to
// useTimeOfDay (which owns minute-of-day). One source of truth per concept;
// every helper consumes, none mints. See meteorologist/NOTES.md 2026-05-20 ADR.
//
// Live vs scrub contract:
//   - `setDate` / `setDayOfYear` / `setSeason` are operator-driven scrub
//     calls — they flip `isLive` to false.
//   - `setDateFromLive` is the pump's wall-time tick — it advances
//     `currentDate` WITHOUT flipping `isLive`. Only operators leave live.


// Northern-hemisphere day-of-year → season. If a future INSTANCE sits at
// `lat < 0`, the southern-hemisphere mapping inverts (swap winter↔summer
// and spring↔autumn). LS is at 38.6°N, so the northern table is the default.
function seasonFromDoy(doy, lat) {
  let s
  if (doy <= 78 || doy >= 355) s = 'winter'
  else if (doy <= 171) s = 'spring'
  else if (doy <= 264) s = 'summer'
  else s = 'autumn'
  if (lat < 0) {
    if (s === 'winter') return 'summer'
    if (s === 'summer') return 'winter'
    if (s === 'spring') return 'autumn'
    if (s === 'autumn') return 'spring'
  }
  return s
}

// ⛔ The TOWN's calendar (src/lib/townClock.js), never the viewer's: near midnight the two are different days.
const dayOfYearFromDate = (date) => townDayOfYear(date)

function isLeapYearFromDate(date) {
  const y = townClockOf(date).year
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

// Midpoint day-of-year per season (northern). For southern-hemisphere
// instances, callers go through `setSeason` which derives the midpoint
// in the requested local-season frame via inverse lookup below.
const SEASON_MIDPOINT_DOY_NORTH = {
  winter: 17,   // ~Jan 17
  spring: 125,  // ~May 5
  summer: 218,  // ~Aug 6
  autumn: 309,  // ~Nov 5
}

const useCalendar = create((set, get) => ({
  currentDate: new Date(),
  isLive: true,

  // Operator-driven scrub: flip isLive=false.
  // Bidirectional sync: useTimeOfDay.currentTime tracks the same Date so
  // CelestialBodies' SunCalc (and all other useTimeOfDay consumers) see
  // the new date. Direct setState writes don't recurse; safe.
  setDate: (date) => {
    set({ currentDate: date, isLive: false })
    useTimeOfDay.setState({ currentTime: date, isLive: false })
  },

  // Pump-driven live tick: preserve isLive. No-ops after an operator scrub
  // (isLive=false) so the pump never snaps a scrubbed date back to now.
  setDateFromLive: (date) => {
    if (!get().isLive) return
    set({ currentDate: date })
    useTimeOfDay.setState({ currentTime: date })
  },

  returnToLive: () => {
    const now = new Date()
    set({ isLive: true, currentDate: now })
    useTimeOfDay.setState({ isLive: true, currentTime: now })
  },

  setDayOfYear: (doy) => {
    const { currentDate } = get()
    // The town's day `doy`, at the town's current time of day (a date scrub never resets the clock).
    const next = townDateAtDayOfYear(currentDate, doy)
    set({ currentDate: next, isLive: false })
    useTimeOfDay.setState({ currentTime: next, isLive: false })
  },

  setSeason: (s) => {
    let target = s
    if (townPlace().lat < 0) {
      if (s === 'winter') target = 'summer'
      else if (s === 'summer') target = 'winter'
      else if (s === 'spring') target = 'autumn'
      else if (s === 'autumn') target = 'spring'
    }
    const doy = SEASON_MIDPOINT_DOY_NORTH[target]
    if (doy == null) return
    get().setDayOfYear(doy)
  },

  // Derived getters — computed on read, not stored.
  dayOfYear: () => dayOfYearFromDate(get().currentDate),
  season: () => seasonFromDoy(dayOfYearFromDate(get().currentDate), townPlace().lat),
  isLeapYear: () => isLeapYearFromDate(get().currentDate),
}))

export default useCalendar
