/**
 * townClock — what the TOWN's clock reads at an instant: its weekday, date and minutes, in the town's own IANA zone.
 *
 * ⛔⛔ THE BUG THIS ENDS (Warden's measurement, 2026-09-29; Boz's ruling). Every "is it open", "which menu is on",
 * "what's on tonight" in the kit read `when.getHours()` / `getDay()` — the VIEWER's zone. Jacob, in Central, looking at
 * Provincetown (Eastern), saw neon lit on a place its card called "Closed". Invisible whenever you test in the town's
 * own zone: the kit's signature shape (CLAUDE.md Layer 0).
 * ⭐ The zone is the placed town's (`townPlace().timezone`, from its geography). ⛔ A town with no zone throws by name —
 *    never the viewer's zone as a fallback.
 * Pure but for the default zone. Cached formatter per zone; the last answer is memoised (the neon asks every frame).
 * ▶ node checks/claims-a-town-keeps-its-own-clock.mjs
 */
import { townPlace } from './townPlace.js'

const _fmt = new Map()
function formatter(tz) {
  let f = _fmt.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric',
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { throw new Error(`[townClock] ⛔ "${tz}" is not a time zone this device knows`) }
    _fmt.set(tz, f)
  }
  return f
}
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** The placed town's zone. ⛔ Throws when no town is placed, or its geography has no zone. */
export function townTimeZone() {
  const tz = townPlace().timezone
  if (!tz) throw new Error('[townClock] ⛔ the placed town has no timezone in its geography — its clock cannot be read')
  return tz
}

let _last = { ms: NaN, tz: null, v: null }
/**
 * The town's clock at `when` (a Date): { year, month (1–12), day, dow (0 = Sunday), hours, minutes, seconds,
 * minuteOfDay, hhmm ('HH:MM'), date ('YYYY-MM-DD') }.
 */
export function townClockOf(when, tz = townTimeZone()) {
  const ms = when.getTime()
  if (ms === _last.ms && tz === _last.tz) return _last.v
  if (!Number.isFinite(ms)) throw new Error('[townClock] ⛔ not a time')
  const p = {}
  for (const { type, value } of formatter(tz).formatToParts(when)) p[type] = value
  const hours = Number(p.hour) % 24, minutes = Number(p.minute), seconds = Number(p.second)
  const v = {
    year: Number(p.year), month: Number(p.month), day: Number(p.day), dow: DOW[p.weekday],
    hours, minutes, seconds, minuteOfDay: hours * 60 + minutes,
    hhmm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}`,
  }
  _last = { ms, tz, v }
  return v
}

/** The town's minute of the day at `when`, with seconds as a fraction (what the authored ToD channels key on). */
export function townMinuteOf(when, tz = townTimeZone()) {
  const c = townClockOf(when, tz)
  return c.minuteOfDay + c.seconds / 60
}

/** The town's day of the year (1–366) at `when`. */
export function townDayOfYear(when, tz = townTimeZone()) {
  const { year, month, day } = townClockOf(when, tz)
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1
}

/**
 * THE INVERSE — the instant at which the town's clock reads `minute` (fractional ok) on the town date year-month-day.
 * What a scrub writes: "set 18:30" means 18:30 in the TOWN, whoever is scrubbing. Converges in two steps across a DST
 * change; a wall time the town skips (spring forward: 02:30) lands where that skip maps it (03:30).
 */
export function townDateAt({ year, month, day, minute }, tz = townTimeZone()) {
  const want = Date.UTC(year, month - 1, day) / 60000 + minute          // the wall time, as UTC minutes
  let t = want * 60000
  for (let i = 0; i < 3; i++) {
    const c = townClockOf(new Date(t), tz)
    const got = Date.UTC(c.year, c.month - 1, c.day) / 60000 + c.minuteOfDay + c.seconds / 60
    const d = want - got
    if (Math.abs(d) < 1e-6) break
    t += d * 60000
  }
  return new Date(Math.round(t))
}

/** The instant on `base`'s town date at which the town's clock reads `minute`. */
export function townDateAtMinute(base, minute, tz = townTimeZone()) {
  const { year, month, day } = townClockOf(base, tz)
  return townDateAt({ year, month, day, minute }, tz)
}

/** The instant on day-of-year `doy` of `base`'s town year, at `base`'s town minute (a date scrub keeps the time). */
export function townDateAtDayOfYear(base, doy, tz = townTimeZone()) {
  const c = townClockOf(base, tz)
  const d = new Date(Date.UTC(c.year, 0, 1) + (doy - 1) * 86400000)
  return townDateAt({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), minute: c.minuteOfDay + c.seconds / 60 }, tz)
}
