import { create } from 'zustand'
import { INSTANCE } from '../instance.js'

// Kit-level calendar anchor — date / day-of-year / season. Parallel to
// useTimeOfDay (which owns minute-of-day). One source of truth per concept;
// every helper consumes, none mints. See meteorologist/NOTES.md 2026-05-20 ADR.
//
// Live vs scrub contract:
//   - `setDate` / `setDayOfYear` / `setSeason` are operator-driven scrub
//     calls — they flip `isLive` to false.
//   - `setDateFromLive` is the pump's wall-time tick — it advances
//     `currentDate` WITHOUT flipping `isLive`. Only operators leave live.

const LATITUDE = INSTANCE.geography.lat

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

function dayOfYearFromDate(date) {
  // Use UTC math on the local Y/M/D so DST transitions don't subtract
  // an hour and round the day-count down.
  const start = Date.UTC(date.getFullYear(), 0, 1)
  const cur = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((cur - start) / 86400000) + 1
}

function isLeapYearFromDate(date) {
  const y = date.getFullYear()
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
  setDate: (date) => set({ currentDate: date, isLive: false }),

  // Pump-driven live tick: preserve isLive.
  setDateFromLive: (date) => set({ currentDate: date }),

  returnToLive: () => set({ isLive: true, currentDate: new Date() }),

  setDayOfYear: (doy) => {
    const { currentDate } = get()
    const next = new Date(currentDate.getFullYear(), 0, 1)
    next.setDate(doy)
    set({ currentDate: next, isLive: false })
  },

  setSeason: (s) => {
    let target = s
    if (LATITUDE < 0) {
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
  season: () => seasonFromDoy(dayOfYearFromDate(get().currentDate), LATITUDE),
  isLeapYear: () => isLeapYearFromDate(get().currentDate),
}))

export default useCalendar
