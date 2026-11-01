/**
 * The night a Light Show glows through, at an instant in the placed town: { dusk, dawn } as minutes on the town's
 * clock, for the engine's schedule (lightShow/engine.js#glowSpan, #showtimes). Read from the kit's own time-of-day
 * slots (cartograph/animatedParam.js#getTodSlotMinutes: SunCalc's civil dusk and dawn at the town's position), never
 * typed, never a sun calculation of our own.
 *
 * Where the sun reaches neither that day (todSlots.js#todSlotReachedAt: the slots themselves always have a minute now) it
 * means one of two opposite nights: the sun
 * stays ABOVE civil twilight (white nights: no dusk, so no glow) or BELOW it (polar night: no dawn, so it glows the whole
 * day). Which, is the sun's altitude at solar noon against the same twilight angle the slots use (SunCalc's own table).
 * Both are true values, not refusals (Boz, 2026-10-31), so town #2 does not fall into a hole.
 */
import SunCalc from 'suncalc'
import { getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { todSlotReachedAt } from '../lib/todSlots.js'
import { townPlace } from '../lib/townPlace.js'
import { Refusal } from '../lib/refusal.js'

const TWILIGHT_DEG = SunCalc.times.find(([, rise, set]) => rise === 'dawn' && set === 'dusk')?.[0]
if (TWILIGHT_DEG == null) throw new Refusal('[displays/night] ⛔ SunCalc has no dawn/dusk angle: the night has no definition')

export function nightAt(instant) {
  // Every slot now has a minute (src/lib/todSlots.js); a crossing the sun did not reach is null HERE, so this reader's
  // schedule is unchanged until the display's own channel replaces it (engine.js#glowSpan, showtimes, and this file retire).
  const m = getTodSlotMinutes(instant), { lat, lon, timezone } = townPlace(), r = todSlotReachedAt(instant, { lat, lon, tz: timezone })
  if (r.dusk || r.dawn) return { dusk: r.dusk ? m.dusk : null, dawn: r.dawn ? m.dawn : null }
  const noon = SunCalc.getTimes(instant, lat, lon).solarNoon
  const noonDeg = SunCalc.getPosition(noon, lat, lon).altitude * 180 / Math.PI
  return noonDeg < TWILIGHT_DEG ? { dusk: 0, dawn: null } : { dusk: null, dawn: null }
}
