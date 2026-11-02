/**
 * A DISPLAY'S SCHEDULE: WHEN it is lit, and when it performs (Jacob, 2026-11-01: "In a google invite, it has a very logical
 * setup of 'start/end, recurring'"; Boz's plan rulings (a)–(c); Zob's co-sign and its three conditions). The LEVELS stay
 * authored at the eight time slots (showChannel.js: glow, show, kelvin keyed on the day; the sun only decides each slot's
 * clock time). The schedule says WHEN, and never sets a level.
 *
 * `channel.schedule: [entry, …]`, one entry an "invite":
 *   · days     'daily' | 'weekdays' | { dates: ['YYYY-MM-DD', …] }; a DATED entry REPLACES the daily and weekday entries
 *              on its dates (ruling (a): a calendar exception). The display's season (identity + the town calendar)
 *              still gates every entry, by the clock's date, as before.
 *   · ambient  null (fireworks: no Ambient) | { on: END, fadeIn, off: END | 'after-last-show', fadeOut } (minutes).
 *              AMBIENT is the lit-but-not-performing state (Jacob named it); its level is the channel's `glow` key.
 *   · shows    null | { first: END, last: END, every: N }: a start t plays when, on the clock of the date t falls on,
 *              (t − first) mod 1440 ≤ (last − first) mod 1440 and (t − first) mod 1440 is a multiple of N. The last is
 *              the last START, inclusive ("until 00:00" includes a midnight show). Never clipped: with Ambient, a start
 *              plays only if its WHOLE run is inside Ambient's lit span.
 * ⛔ ONE HOME PER FACT (Jacob, 2026-11-02: "the Timeslot keyframes and the schedule are fighting"): the SCHEDULE alone says
 * WHEN; the keys say only HOW BRIGHT and WHAT COLOUR. A key at 0 is a level (hung and dark, a show that plays dark), never
 * an off: it neither cancels a scheduled show nor unhangs Ambient.
 *   END is a sun slot or "HH:MM" on the town's clock.
 * A NIGHT belongs to the date of its first event (Ambient's on, else the first show: ruling (b)). Each later END is its
 * first occurrence AFTER the event before it, read from the slot row of the DATE that occurrence falls on (Zob's
 * condition 1): a Dawn after midnight reads the next date's dawn. The LEVEL resolver is not forked (it reads the row of
 * the minute's own date). Fades run their full minutes from where the light is (the fade rule); a fade-OUT holds the
 * levels as they were at `off` (as the old ▼ held its key), so the display's ▲/▼ marks retire into Ambient (ruling (c)).
 * `off: 'after-last-show'`: Ambient ends with the night's last played show, which closes to BLACK (every other close
 * stays white, Jacob 2026-10-31); dark until the next Ambient on.
 * ▶ node checks/claims-a-display-keeps-its-schedule.mjs
 */
import { resolveGroupAtMinute, slotsInDayOrder } from '../cartograph/animatedParam.js'
import { TOD_SLOT_IDS, SLOT_DAY_MOVE_MAX_MIN } from '../lib/todSlots.js'
import { Refusal } from '../lib/refusal.js'

const DAY = 1440
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
export const isEnd = (e) => TOD_SLOT_IDS.includes(e) || HHMM.test(e)
export const endName = (e) => (HHMM.test(e) ? e : e[0].toUpperCase() + e.slice(1))
/** An END as a minute of the town's day: a clock time, or the slot's minute on that row. */
export function windowEndMinute(end, slotMinutes) { const c = HHMM.exec(end); return c ? Number(c[1]) * 60 + Number(c[2]) : slotMinutes[end] }
const mod = (x) => ((x % DAY) + DAY) % DAY
export const nextDate = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
export const prevDate = (d) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
/** Runs of consecutive dates, as "Mon D – Mon D" (or one date): how a refusal names its days. */
export function dateRuns(dates) {
  const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const runs = []
  for (const d of dates) { const r = runs.at(-1); if (r && nextDate(r[1]) === d) r[1] = d; else runs.push([d, d]) }
  return runs.map(([a, b]) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`)).join(', ')
}

/** The authored levels at a minute of a day (that day's slot row): { glow, show, kelvin }, the keys' plain tween. */
export function levelsAt(ch, minute, slotMinutes) {
  const { glow, show, kelvin } = resolveGroupAtMinute({ animated: 'tod', values: ch.values }, minute, slotMinutes, ['glow', 'show', 'kelvin'])
  return { glow, show, kelvin }
}

/** One schedule, refused by name (its shape; the year is refuseScheduleSense's). */
export function validateSchedule(schedule, where) {
  if (!Array.isArray(schedule) || !schedule.length) throw new Refusal(`[showSchedule] ⛔ ${where}: a display's schedule is a list of entries (days, ambient, shows), at least one`)
  schedule.forEach((e, i) => {
    const at = `${where}, schedule entry ${i + 1}`
    for (const k of Object.keys(e || {})) if (!['days', 'ambient', 'shows'].includes(k)) throw new Refusal(`[showSchedule] ⛔ ${at}: "${k}" is not part of an entry (days, ambient, shows)`)
    const d = e?.days
    if (!(d === 'daily' || d === 'weekdays' || (d && Array.isArray(d.dates) && d.dates.length && d.dates.every(x => /^\d{4}-\d\d-\d\d$/.test(x) && !isNaN(Date.parse(`${x}T12:00:00Z`))))))
      throw new Refusal(`[showSchedule] ⛔ ${at}: its days (${JSON.stringify(d)}) are 'daily', 'weekdays' or { dates: ['YYYY-MM-DD', …] }`)
    if (e.ambient == null && e.shows == null) throw new Refusal(`[showSchedule] ⛔ ${at}: it has neither Ambient nor shows, so it does nothing: add one, or remove the entry`)
    const a = e.ambient
    if (a != null) {
      for (const k of Object.keys(a)) if (!['on', 'fadeIn', 'off', 'fadeOut'].includes(k)) throw new Refusal(`[showSchedule] ⛔ ${at}: "${k}" is not part of Ambient (on, fadeIn, off, fadeOut)`)
      if (!isEnd(a.on)) throw new Refusal(`[showSchedule] ⛔ ${at}: Ambient's on (${JSON.stringify(a.on)}) is neither a time-of-day slot (${TOD_SLOT_IDS.join(', ')}) nor a time on the town's clock (HH:MM, 24 h)`)
      if (!(a.off === 'after-last-show' || isEnd(a.off))) throw new Refusal(`[showSchedule] ⛔ ${at}: Ambient's off (${JSON.stringify(a.off)}) is a slot, a clock time, or 'after-last-show'`)
      if (a.off === 'after-last-show' && e.shows == null) throw new Refusal(`[showSchedule] ⛔ ${at}: Ambient ends after the last show, and the entry has no shows: add shows, or choose when Ambient goes off`)
      if (a.off === a.on) throw new Refusal(`[showSchedule] ⛔ ${at}: Ambient's 'comes on' and 'goes off' are both ${endName(a.on)}, so it would never be lit: choose a different time for it to go off`)
      for (const k of ['fadeIn', 'fadeOut']) if (!(typeof a[k] === 'number' && a[k] >= 0)) throw new Refusal(`[showSchedule] ⛔ ${at}: Ambient's ${k} (${JSON.stringify(a[k])}) is minutes, 0 or more (0 is a switch)`)
    }
    const s = e.shows
    if (s != null) {
      for (const k of Object.keys(s)) if (!['first', 'last', 'every'].includes(k)) throw new Refusal(`[showSchedule] ⛔ ${at}: "${k}" is not part of the shows (first, last, every)`)
      for (const k of ['first', 'last']) if (!isEnd(s[k])) throw new Refusal(`[showSchedule] ⛔ ${at}: the shows' ${k} (${JSON.stringify(s[k])}) is neither a time-of-day slot nor a time on the town's clock (HH:MM, 24 h)`)
      if (!Number.isInteger(s.every) || s.every < 1) throw new Refusal(`[showSchedule] ⛔ ${at}: the shows' every (${JSON.stringify(s.every)}) is a whole number of minutes, 1 or more`)
    }
  })
  return schedule
}

/**
 * ⛔ An interval shorter than the show itself: a show would cut into the next. `runSeconds` the show's own length
 * (engine.js#runSeconds of the display's run). Stage's store refuses it at the gesture, the Lit card shows it at load
 * too (a re-authored run can make a kept interval short), and the bake refuses it.
 */
export function refuseShortCadence(ch, runSeconds, where) {
  if (!(runSeconds > 0)) throw new Refusal(`[showSchedule] ⛔ ${where}: the show's length is unknown, so its interval cannot be judged`)
  const t = Math.round(runSeconds), len = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  ch.schedule.forEach((e, i) => {
    if (e.shows && e.shows.every * 60 < runSeconds) throw new Refusal(`[showSchedule] ⛔ ${where}, schedule entry ${i + 1}: every ${e.shows.every} min is shorter than the show (${len}), so a show would cut into the next: choose every ${Math.ceil(runSeconds / 60)} min or more`)
  })
}

/** The entries active on a night's date: the dated ones naming it, else the daily and (Monday–Friday) weekday ones. */
export function entriesOn(schedule, date) {
  const dated = schedule.filter(e => e.days?.dates?.includes(date))
  if (dated.length) return dated
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay()
  return schedule.filter(e => e.days === 'daily' || (e.days === 'weekdays' && dow >= 1 && dow <= 5))
}

/**
 * One entry's NIGHT on `date` (rowOf(date) → that date's slot minutes; the next date's row for anything after midnight).
 * Times are minutes from `date`'s 00:00 (so 1500 is 01:00 the next morning). → { date, start, onAt, offAt, fadeIn, fadeOut,
 * starts, lastStart, end, closesDark, len } or null when the entry has no night (fireworks with no playable show).
 */
export function nightOf(ch, entry, date, rowOf, runSeconds) {
  const rD = rowOf(date), rN = rowOf(nextDate(date)), len = runSeconds / 60
  if (!rD || !rN) throw new Refusal(`[showSchedule] ⛔ no slot row for ${rD ? nextDate(date) : date}: a night needs its own date's and the next date's`)
  const rowAt = (x) => (x < DAY ? rD : rN)
  // Zob's rule: each END is its first occurrence after the event before it, on the row of the date it falls on. Two SLOTS
  // on one minute (the sun's closest approach, far north) keep the day's own order about it (animatedParam.js#
  // slotsInDayOrder, the resolver's tie-break): Dusk then Dawn at the nadir is a night of no length (a white night, dark);
  // Dawn then Dusk at noon makes the next Dawn the end (a polar night, lit all day), as the old marks did.
  const after = (end, prev, inclusive, prevEnd) => {
    const a = windowEndMinute(end, rD), b = DAY + windowEndMinute(end, rN)
    if (a > prev || (inclusive && a === prev)) return a
    if (a === prev && prevEnd && !HHMM.test(end) && !HHMM.test(prevEnd) && slotsInDayOrder(prevEnd, end, a, rD)) return a
    return b
  }
  const amb = entry.ambient, shows = entry.shows
  const start = amb ? windowEndMinute(amb.on, rD) : windowEndMinute(shows.first, rD)
  const onAt = amb ? start : null
  const fixedOff = amb && amb.off !== 'after-last-show' ? after(amb.off, onAt, false, amb.on) : null
  const env = (x, offAt) => {                                       // Ambient's envelope at x, before levels
    if (!amb || x < onAt) return amb ? 0 : 1
    const up = amb.fadeIn > 0 ? Math.min(1, (x - onAt) / amb.fadeIn) : 1
    if (offAt == null || x < offAt) return up
    const at = amb.fadeIn > 0 ? Math.min(1, (offAt - onAt) / amb.fadeIn) : 1    // a fade-out starts from where the light is
    return amb.fadeOut > 0 ? at * Math.max(0, 1 - (x - offAt) / amb.fadeOut) : 0
  }
  const starts = []
  if (shows) {
    const horizon = fixedOff != null ? fixedOff + (amb.fadeOut || 0) : start + DAY
    // With no fixed end (after the last show, or fireworks), the night's last start is the first occurrence of `last` at or
    // after its first played start: one evening's run, never the next evening's.
    let cap = Infinity
    for (let x = Math.ceil(start); x < horizon && x < start + DAY && x <= cap; x++) {
      const row = rowAt(x), f = windowEndMinute(shows.first, row), l = windowEndMinute(shows.last, row), o = mod(x - f)
      if (o > mod(l - f) || o % shows.every) continue
      let whole = true
      if (amb) for (const p of [x, ...Array.from({ length: Math.max(0, Math.ceil(len) - 1) }, (_, k) => x + k + 1), x + len - 1e-6]) {
        if (!(env(p, fixedOff) > 0)) { whole = false; break }
      }
      if (whole) {
        if (!starts.length && fixedOff == null) cap = x + mod(windowEndMinute(shows.last, rowAt(x)) - mod(x))
        starts.push(x)
      }
    }
  }
  const lastStart = starts.length ? starts.at(-1) : null
  if (!amb) return lastStart == null ? null : { date, start: starts[0], onAt: null, offAt: null, fadeIn: 0, fadeOut: 0, starts, lastStart, end: lastStart + len, closesDark: false, len, env: () => 1 }
  const closesDark = amb.off === 'after-last-show'
  const offAt = closesDark ? (lastStart == null ? null : lastStart + len) : fixedOff
  const end = offAt == null ? null : offAt + (closesDark ? 0 : amb.fadeOut || 0)
  return { date, start, onAt, offAt, fadeIn: amb.fadeIn, fadeOut: closesDark ? 0 : amb.fadeOut, starts, lastStart, end, closesDark, len, env: (x) => env(x, offAt) }
}

/** Every night on `date` (its active entries). */
export function nightsOn(ch, date, rowOf, runSeconds) {
  return entriesOn(ch.schedule, date).map(e => nightOf(ch, e, date, rowOf, runSeconds)).filter(Boolean)
}

/**
 * The display at a clock instant: `date` the clock's date, `minute` its minute, nights of the day before and of today.
 * → { mode: 'show' | 'glow' | 'off', t (seconds into the show), dark (this show closes to black), glow, show, kelvin }.
 * Levels are the authored keys at the minute's own row × Ambient's envelope (a fade-out holds the levels at `off`).
 */
export function displayStateAt(ch, nightsBefore, nightsToday, date, minute, rowOf) {
  const here = levelsAt(ch, minute, rowOf(date))
  for (const [nights, x] of [[nightsBefore, minute + DAY], [nightsToday, minute]]) for (const n of nights) {
    if (x < n.start || (n.end != null && x >= n.end)) continue
    const s = n.starts.find(t => x >= t && x < t + n.len)
    const lv = n.offAt != null && x >= n.offAt ? levelsAt(ch, mod(n.offAt), n.offAt < DAY ? rowOf(n.date) : rowOf(nextDate(n.date))) : here
    const e = n.env(x)
    const lit = { glow: n.onAt == null ? 0 : lv.glow * e, show: n.onAt == null ? lv.show : lv.show * e, kelvin: here.kelvin }
    if (s != null) return { mode: 'show', t: (x - s) * 60, dark: n.closesDark && s === n.lastStart, ...lit }
    if (n.onAt != null) return { mode: 'glow', t: 0, dark: false, ...lit }
    return { mode: 'off', t: 0, dark: false, ...lit }
  }
  return { mode: 'off', t: 0, dark: false, glow: 0, show: 0, kelvin: here.kelvin }
}

/** The starts of the shows that begin on the clock's `date` (from the night before and tonight), as minutes of that day. */
export function showtimesOnDate(nightsBefore, nightsToday) {
  return [...nightsBefore.flatMap(n => n.starts.filter(t => t >= DAY).map(t => t - DAY)), ...nightsToday.flatMap(n => n.starts.filter(t => t < DAY))].sort((a, b) => a - b)
}

/**
 * ⛔ THE SCHEDULE OVER A YEAR AT THE TOWN (the windows' rule, generalised to an entry's END pairs; Boz's wording: "two ends
 * never pass each other on any day of the year at the town; if they do, it is refused, naming the days they are the other
 * way round"). `days` the cached year ahead ([{ date, minutes }], todSlots.js#todSlotDays). Refused by name:
 *   · a pair (Ambient on → off; shows first → last) whose length wraps through 0 between consecutive days, or is 0;
 *   · an END slot moving more than SLOT_DAY_MOVE_MAX_MIN in a day (its pass cannot be judged);
 *   · two nights that overlap, on one date or across midnight into the next date's night (Zob's condition 3).
 */
export function refuseScheduleSense(ch, days, runSeconds, where) {
  const byDate = new Map(days.map(d => [d.date, d.minutes])), rowOf = (d) => byDate.get(d)
  ch.schedule.forEach((e, i) => {
    const at = `${where}, schedule entry ${i + 1}`
    const pairs = []
    if (e.ambient && e.ambient.off !== 'after-last-show') pairs.push(['Ambient', e.ambient.on, e.ambient.off, "Ambient's 'comes on' and 'goes off'"])
    if (e.shows) pairs.push(['the shows', e.shows.first, e.shows.last, "the 'first show' and 'last show starts'"])
    for (const [what, from, to, words] of pairs) {
      for (const end of [from, to]) if (!HHMM.test(end)) for (let k = 1; k < days.length; k++) {
        const x = Math.abs(days[k].minutes[end] - days[k - 1].minutes[end]) % DAY, move = Math.min(x, DAY - x)
        if (move > SLOT_DAY_MOVE_MAX_MIN) throw new Refusal(`[showSchedule] ⛔ ${at}: ${endName(end)} moves ${move.toFixed(0)} minutes from ${days[k - 1].date} to ${days[k].date} here, so whether ${what}' ends pass each other cannot be judged`)
      }
      const sides = [[], []]; let side = 0, prev = null
      for (const d of days) {
        const L = mod(windowEndMinute(to, d.minutes) - windowEndMinute(from, d.minutes))
        // Two SLOTS may meet (the sun's closest approach: a night of no length, by design); a clock time meeting one may not,
        // for Ambient (it would never be lit). The shows' first and last on one minute is ONE show, never refused.
        if (L === 0 && what === 'Ambient' && (HHMM.test(from) || HHMM.test(to))) throw new Refusal(`[showSchedule] ⛔ ${at}: on ${dateRuns([d.date])} ${words} (${endName(from)} → ${endName(to)}) fall on the same minute, so it would never be lit: choose a different time for one of them`)
        if (prev != null && Math.abs(L - prev) > DAY / 2) side ^= 1
        sides[side].push(d.date); prev = L
      }
      if (sides[1].length) {
        const other = sides[0].length < sides[1].length ? sides[0] : sides[1]
        throw new Refusal(`[showSchedule] ⛔ ${at}: ${words} (${endName(from)} → ${endName(to)}) pass each other here, so on ${other.length} days (${dateRuns(other)}) they run the other way round: choose times that keep their order all year here (a clock time for one of them, usually)`)
      }
    }
  })
  // the nights: each date's, against each other and against the next date's (across midnight)
  let prevNights = null, prevDateSeen = null
  for (const d of days.slice(0, -1)) {
    const nights = entriesOn(ch.schedule, d.date).map(e => ({ e, n: nightOf(ch, e, d.date, rowOf, runSeconds) }))
    const spans = nights.filter(x => x.n).map(x => [x.n.start, x.n.end ?? x.n.start + DAY])
    for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++)
      if (spans[i][0] < spans[j][1] && spans[j][0] < spans[i][1]) throw new Refusal(`[showSchedule] ⛔ ${where}: two entries' nights overlap on ${dateRuns([d.date])}; one night has one entry: move one entry's times, or its dates`)
    if (prevNights && prevDateSeen === prevDate(d.date)) for (const [, e0] of prevNights) for (const [s1] of spans)
      if (e0 > DAY + s1) throw new Refusal(`[showSchedule] ⛔ ${where}: the night of ${dateRuns([prevDateSeen])} runs past ${dateRuns([d.date])}'s night beginning; nights overlap across midnight: end the earlier night sooner, or start the later one later`)
    prevNights = spans; prevDateSeen = d.date
  }
}
