/**
 * THE SCHEDULE CARD'S GESTURES AND ITS NIGHT, as pure functions (Stage › Displays › Lit). The card calls these and nothing
 * else to change a schedule, so a check drives exactly what the operator's clicks do (Jacob, 2026-11-02: his first use of
 * the card lost his hourly shows; cause not established, so every gesture is proven to change only its own field).
 *
 * A gesture takes the entry list as the card holds it (as read: an old Look through showChannel.js#readShowScheduleV1)
 * and returns the next list; the store judges it (useCartographStore#setDisplaySchedule) and refuses by name.
 * "Add" seeds from the DEFAULT channel (showChannel.js#defaultDisplayChannel), one home, never a constant here.
 * ▶ node checks/claims-the-schedule-card-changes-only-what-it-touches.mjs
 */
import { defaultDisplayChannel } from '../displays/showChannel.js'
import { nightsOn, displayStateAt, prevDate, nextDate } from '../displays/showSchedule.js'
import { hhmm, mmss } from '../displays/lightShow/engine.js'

const DEFAULT = () => defaultDisplayChannel().schedule[0]
const editEntry = (list, i, patch) => list.map((e, j) => (j === i ? { ...e, ...patch } : e))

export const setAmbient = (list, i, field, value) => editEntry(list, i, { ambient: { ...list[i].ambient, [field]: value } })
export const setShows = (list, i, field, value) => editEntry(list, i, { shows: { ...list[i].shows, [field]: value } })
export const addAmbient = (list, i) => editEntry(list, i, { ambient: { ...DEFAULT().ambient } })
export const addShows = (list, i) => editEntry(list, i, { shows: { ...DEFAULT().shows } })
export const removeAmbient = (list, i) => editEntry(list, i, { ambient: null })
export const removeShows = (list, i) => editEntry(list, i, { shows: null })
/** 'daily' | 'weekdays' | 'dates' (today's date, to be edited) | { dates } (the dates as typed). */
export const setDays = (list, i, days, today) => editEntry(list, i, { days: days === 'dates' ? { dates: [today] } : days })
/** A dated event: one show at 21:00 on today's date, no Ambient (fireworks); it replaces the daily entries on its date. */
export const addEvent = (list, today) => [...list, { days: { dates: [today] }, ambient: null, shows: { first: '21:00', last: '21:00', every: 60 } }]
export const removeEntry = (list, i) => list.filter((_, j) => j !== i)

/** A time typed as H:MM or HH:MM (24 h) → 'HH:MM', or null. */
export function clockTyped(text) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text))
  if (!m || +m[1] > 23 || +m[2] > 59) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/**
 * Tonight, noon to noon from the clock's date D: Ambient's level (the keys × its envelope) every 5 minutes, each showtime,
 * and the line the card prints. `rowOf(date)` the slot minutes of a date (animatedParam.js#getTodSlotRow in Stage).
 */
export function tonightOf(ch, D, secs, rowOf) {
  const before = nightsOn(ch, prevDate(D), rowOf, secs), tonight = nightsOn(ch, D, rowOf, secs), after = nightsOn(ch, nextDate(D), rowOf, secs)
  const stateAt = (abs) => abs < 1440 ? displayStateAt(ch, before, tonight, D, abs, rowOf) : displayStateAt(ch, tonight, after, nextDate(D), abs - 1440, rowOf)
  const level = [], lit = []                                   // level: [minute from noon, Ambient's level]; lit: hung runs
  for (let i = 0, from = null; i <= 1440; i += 5) {
    const s = i < 1440 ? stateAt(720 + i) : null, on = !!s && s.mode !== 'off'
    if (s) level.push([i, s.mode === 'off' ? 0 : s.glow])
    if (on && from == null) from = i
    if (!on && from != null) { lit.push([from, i]); from = null }
  }
  const times = tonight.flatMap(n => n.starts).filter(t => t >= 720 && t < 2160)
  const dark = tonight.find(n => n.closesDark && n.lastStart != null)
  const runs = lit.map(([a, b]) => `${hhmm((720 + a) % 1440)}–${hhmm((720 + b) % 1440)}`).join(', ')
  const line = `Tonight: ${lit.length ? `Ambient ${runs}` : 'no Ambient'} · ${times.length} show${times.length === 1 ? '' : 's'}${times.length ? ` (${hhmm(times[0] % 1440)}${times.length > 1 ? `…${hhmm(times.at(-1) % 1440)}` : ''}), ${mmss(secs)} each` : ''}${dark ? ` · dark after the ${hhmm(dark.lastStart % 1440)} show` : ''}`
  return { level, lit, times, dark: dark ? dark.lastStart : null, line }
}
