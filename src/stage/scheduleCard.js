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
import { nightsOn, displayStateAt, prevDate, nextDate, windowEndMinute, refuseScheduleSense } from '../displays/showSchedule.js'
import { mmss } from '../displays/lightShow/engine.js'
import { TOD_SLOT_IDS } from '../lib/todSlots.js'

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

/** The display's KEYS (Jacob, 2026-11-02, one home: levels live on the keys he made, picked by name, never by scrubbing the
 *  clock): the slots it has keyed, in the day's order, and the slots it could key. */
export const keyedSlots = (values) => TOD_SLOT_IDS.filter(id => id in values)
export const unkeyedSlots = (values) => TOD_SLOT_IDS.filter(id => !(id in values))

/**
 * A time as people type it → 'HH:MM' (24 h), or null (Jacob, 2026-11-02: he typed "24" for midnight and was refused). 24-hour
 * ("21", "2130", "21:30", "21.30", "0", "00", "24", "24:00"), 12-hour ("9pm", "9:30 pm", "12am", "12 pm"), and the words
 * "midnight" and "noon". 24 is midnight; a bare 12 is noon (and is SHOWN as "noon", so it cannot pass for midnight).
 */
export function clockTyped(text) {
  const t = String(text).trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, ':')
  if (t === 'midnight') return '00:00'
  if (t === 'noon') return '12:00'
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(t)
  if (!m) return null
  let h = +m[1]
  const min = m[2] == null ? 0 : +m[2], half = m[3]?.[0]
  if (min > 59) return null
  if (half) { if (h < 1 || h > 12) return null; h = (h % 12) + (half === 'p' ? 12 : 0) }
  else if (h === 24 && min === 0) h = 0
  else if (h > 23) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** A clock time as the panel prints it (SidePanel#formatTimeShort: "9:30pm"), with the two that read either way as words:
 *  "midnight" and "noon". `x` 'HH:MM' or minutes of the day. */
export function clockWords(x) {
  const t = typeof x === 'number' ? ((Math.round(x) % 1440) + 1440) % 1440 : +x.slice(0, 2) * 60 + +x.slice(3, 5)
  if (t === 0) return 'midnight'
  if (t === 720) return 'noon'
  const h = Math.floor(t / 60), mm = String(t % 60).padStart(2, '0')
  return `${h % 12 || 12}:${mm}${h < 12 ? 'am' : 'pm'}`
}

/**
 * Said before a save, and under the row after (Jacob, 2026-11-02: an off of "12:00" glowed from 16:00 until noon): when
 * Ambient goes off the next day after noon, how long it glows and until when. Not refused (it may be meant), stated. →
 * a sentence, or null. `row` the slot minutes of today (animatedParam.js#getTodSlotRow).
 */
export function ambientSpanWords(entry, row) {
  const a = entry?.ambient
  if (!a || a.off === 'after-last-show') return null
  const on = windowEndMinute(a.on, row), off = windowEndMinute(a.off, row)
  if (!Number.isFinite(on) || !Number.isFinite(off)) return null
  const len = (((off - on) % 1440) + 1440) % 1440
  if (on + len < 1440 + 720) return null
  return `Ambient glows ${+(len / 60).toFixed(1)} h, until ${clockWords(off)} tomorrow.`
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
  const runs = lit.map(([a, b]) => `${clockWords(720 + a)}–${clockWords(720 + b)}`).join(', ')
  const line = `Tonight: ${lit.length ? `Ambient ${runs}` : 'no Ambient'} · ${times.length} show${times.length === 1 ? '' : 's'}${times.length ? ` (${clockWords(times[0] % 1440)}${times.length > 1 ? `…${clockWords(times.at(-1) % 1440)}` : ''}), ${mmss(secs)} each` : ''}${dark ? ` · dark after the ${clockWords(dark.lastStart % 1440)} show` : ''}`
  return { level, lit, times, dark: dark ? dark.lastStart : null, line }
}

/** The year ahead judged as the store, Publish's bake and the player judge it (showSchedule.js#refuseScheduleSense): null, or
 *  the refusal. Tonight shows it, so a schedule whose shows play on no night is refused where "0 shows" was once only said
 *  (staging, 2026-11-02). `days` the year ahead at the town (animatedParam.js#getTodSlotDaysAhead). */
export function yearRefusal(ch, days, secs) {
  try { refuseScheduleSense(ch, days, secs, 'Tonight'); return null } catch (e) { return String(e?.message || e) }
}
