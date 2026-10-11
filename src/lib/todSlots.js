/**
 * todSlots — THE TIME-OF-DAY SLOTS, the one home: eight named sun moments, where each falls on the town's clock on a
 * given day, and which one a minute belongs to. Pure (suncalc + the town's clock), so the kit and the site Workers
 * import the same function: the share card a Worker picks is the slot the kit would name (BRIEF-share-image-by-time-of-day).
 *
 * ⭐ Sun-relative: a slot's minute moves with the date and the town's latitude. ⭐ DEEP NIGHT is the sun's NADIR (solar
 * midnight), the slot between Night and Dawn (Jacob, 2026-09-27); Night is astronomical dusk (−18°) and does not happen
 * above ~48.6°N near the June solstice, so a slot can be null on a day and then drops out.
 * ⛔ No zone, no slots: the place is `{ lat, lon, tz }` and townClock throws on a zone it does not know.
 * ▶ node checks/claims-a-town-shares-its-own-picture.mjs · node checks/claims-a-town-keeps-its-own-clock.mjs
 */
import SunCalc from 'suncalc'
import { townMinuteOf } from './townClock.js'

/** The slot ids, in the day's order. Labels and colours are the editor's (`animatedParam.js#NAMED_TOD_SLOTS`). */
export const TOD_SLOT_IDS = ['dawn', 'sunrise', 'noon', 'golden', 'sunset', 'dusk', 'night', 'deep']
const SUNCALC_TIME = { dawn: 'dawn', sunrise: 'sunrise', noon: 'solarNoon', golden: 'goldenHour', sunset: 'sunset',
  dusk: 'dusk', night: 'night', deep: 'nadir' }

/** Each slot's minute of the day on the town's clock, on `when`'s day: { <slot>: minute | null }. */
export function todSlotMinutesAt(when, { lat, lon, tz }) {
  const times = SunCalc.getTimes(when, lat, lon)
  const out = {}
  for (const id of TOD_SLOT_IDS) {
    const d = times[SUNCALC_TIME[id]]
    out[id] = d && !isNaN(d.getTime()) ? townMinuteOf(d, tz) : null
  }
  return out
}

/**
 * The slot whose minute is nearest `minute` (round the clock), if within `toleranceMin`; otherwise null.
 * The editor's playhead asks with its parking tolerance (`animatedParam.js#TOD_SLOT_TOLERANCE_MIN`);
 * the share card asks with SHARE_SLOT_TOLERANCE_MIN.
 */
export function todSlotNearest(minute, mins, toleranceMin) {
  let best = null, bestGap = Infinity
  for (const id of TOD_SLOT_IDS) {
    const m = mins[id]
    if (m == null) continue
    const d = Math.abs(m - minute), gap = Math.min(d, 1440 - d)
    if (gap <= toleranceMin && gap < bestGap) { best = id; bestGap = gap }
  }
  return best
}

/**
 * Which slot the share card shows: the NEAREST, at every minute of the day (Jacob's ruling, 2026-10-11). A slot holds
 * from halfway after the slot before it to halfway before the next: at its own moment it is that slot, and it hands
 * over at the midpoint.
 */
export const SHARE_SLOT_TOLERANCE_MIN = Infinity

/** The slot it is at `when` in the town at `place` ({ lat, lon, tz }), or null if none is within `toleranceMin`. */
export function todSlotAt(when, place, toleranceMin) {
  return todSlotNearest(townMinuteOf(when, place.tz), todSlotMinutesAt(when, place), toleranceMin)
}
