/**
 * The night a Light Show glows through, at an instant in the placed town: { dusk, dawn } as minutes on the town's
 * clock, for the engine's schedule (lightShow/engine.js#glowSpan, #showtimes). Read from the kit's own time-of-day
 * slots (cartograph/animatedParam.js#getTodSlotMinutes: SunCalc's civil dusk and dawn at the town's position), never
 * typed, never a sun calculation of our own.
 *
 * Where the sun reaches neither that day the slots are both null, and that means one of two opposite nights: the sun
 * stays ABOVE civil twilight (white nights: no dusk, so no glow) or BELOW it (polar night: no dawn, so it glows the whole
 * day). Which, is the sun's altitude at solar noon against the same twilight angle the slots use (SunCalc's own table).
 * Both are true values, not refusals (Boz, 2026-10-31), so town #2 does not fall into a hole.
 */
import SunCalc from 'suncalc'
import { getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { townPlace } from '../lib/townPlace.js'

const TWILIGHT_DEG = SunCalc.times.find(([, rise, set]) => rise === 'dawn' && set === 'dusk')?.[0]
if (TWILIGHT_DEG == null) throw new Error('[displays/night] ⛔ SunCalc has no dawn/dusk angle: the night has no definition')

export function nightAt(instant) {
  const m = getTodSlotMinutes(instant)
  if (m.dusk != null || m.dawn != null) return { dusk: m.dusk, dawn: m.dawn }
  const { lat, lon } = townPlace(), noon = SunCalc.getTimes(instant, lat, lon).solarNoon
  const noonDeg = SunCalc.getPosition(noon, lat, lon).altitude * 180 / Math.PI
  return noonDeg < TWILIGHT_DEG ? { dusk: 0, dawn: null } : { dusk: null, dawn: null }
}
