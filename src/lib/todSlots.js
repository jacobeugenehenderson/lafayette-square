/**
 * todSlots — THE TIME-OF-DAY SLOTS, the one home: eight named sun moments, where each falls on the town's clock on a
 * given day, and which one a minute belongs to. Pure (suncalc + the town's clock), so the kit and the site Workers
 * import the same function: the share card a Worker picks is the slot the kit would name (BRIEF-share-image-by-time-of-day).
 *
 * ⭐ Sun-relative: a slot's minute moves with the date and the town's latitude. ⭐ DEEP NIGHT is the sun's NADIR (solar
 * midnight), the slot between Night and Dawn (Jacob, 2026-09-27).
 * ⭐ EVERY SLOT HAS A MINUTE, EVERY DAY, EVERYWHERE (Jacob, 2026-11-01: "Yes, build it"; "There is no reason a person should
 * ever know about this"). A slot whose angle the sun does not reach that day (Night, −18°, above ~48.6° near the June
 * solstice; Dusk and Dawn on white nights; every crossing on a polar day or night) sits at the sun's CLOSEST APPROACH to
 * that angle: solar noon if the sun stays below it all day, the nadir if it stays above it, decided per slot by its angle
 * against that day's noon and nadir altitudes (SunCalc's own angles and positions, never typed). That is the limit the
 * crossings converge to before they vanish (Dusk and Dawn meet at the nadir), so nothing jumps. Never null, never refused,
 * never shown: `todSlotReachedAt` says which slots the sun really reached, for the one reader that must not name a moment
 * that did not happen (the share card). ▶ node checks/claims-every-slot-has-a-time-every-day.mjs
 * ⛔ No zone, no slots: the place is `{ lat, lon, tz }` and townClock throws on a zone it does not know.
 * ▶ node checks/claims-a-town-shares-its-own-picture.mjs · node checks/claims-a-town-keeps-its-own-clock.mjs
 */
import SunCalc from 'suncalc'
import { townMinuteOf } from './townClock.js'
import { Refusal } from './refusal.js'

/** The slot ids, in the day's order. Labels and colours are the editor's (`animatedParam.js#NAMED_TOD_SLOTS`). */
export const TOD_SLOT_IDS = ['dawn', 'sunrise', 'noon', 'golden', 'sunset', 'dusk', 'night', 'deep']
const SUNCALC_TIME = { dawn: 'dawn', sunrise: 'sunrise', noon: 'solarNoon', golden: 'goldenHour', sunset: 'sunset',
  dusk: 'dusk', night: 'night', deep: 'nadir' }

// Each crossing slot's angle, from SunCalc's own table (noon and the nadir are extrema, always reached).
const ANGLE = Object.fromEntries(SunCalc.times.flatMap(([deg, rise, set]) => [[rise, deg], [set, deg]]))
for (const id of TOD_SLOT_IDS) if (id !== 'noon' && id !== 'deep' && !(SUNCALC_TIME[id] in ANGLE)) throw new Refusal(`[todSlots] ⛔ SunCalc has no angle for ${SUNCALC_TIME[id]}`)
const altDeg = (d, lat, lon) => SunCalc.getPosition(d, lat, lon).altitude * 180 / Math.PI
function slotsAt(when, { lat, lon, tz }) {
  const times = SunCalc.getTimes(when, lat, lon), noon = times.solarNoon, nadir = times.nadir
  const hi = altDeg(noon, lat, lon), lo = altDeg(nadir, lat, lon)
  const minutes = {}, reached = {}
  for (const id of TOD_SLOT_IDS) {
    const d = times[SUNCALC_TIME[id]]
    reached[id] = !!d && !isNaN(d.getTime())
    if (reached[id]) { minutes[id] = townMinuteOf(d, tz); continue }
    const a = ANGLE[SUNCALC_TIME[id]]
    minutes[id] = townMinuteOf(Math.abs(hi - a) <= Math.abs(lo - a) ? noon : nadir, tz)   // the sun's closest approach to the angle
  }
  return { minutes, reached }
}
/** Each slot's minute of the day on the town's clock, on `when`'s day: { <slot>: minute }, never null. */
export function todSlotMinutesAt(when, place) { return slotsAt(when, place).minutes }
/** Which slots the sun really reached on `when`'s day: { <slot>: boolean }. Internal: never shown to anyone. */
export function todSlotReachedAt(when, place) { return slotsAt(when, place).reached }

/**
 * The slot whose minute is nearest `minute` (round the clock), if within `toleranceMin`; otherwise null.
 * The editor's playhead asks with its parking tolerance (`animatedParam.js#TOD_SLOT_TOLERANCE_MIN`);
 * the share card asks with SHARE_SLOT_TOLERANCE_MIN. `reached` (todSlotReachedAt) skips the slots the sun did not
 * reach, so a moment that did not happen is never named, exactly as when those slots had no minute.
 */
export function todSlotNearest(minute, mins, toleranceMin, reached) {
  let best = null, bestGap = Infinity
  for (const id of TOD_SLOT_IDS) {
    const m = mins[id]
    if (m == null || (reached && !reached[id])) continue
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
  const { minutes, reached } = slotsAt(when, place)
  return todSlotNearest(townMinuteOf(when, place.tz), minutes, toleranceMin, reached)
}
