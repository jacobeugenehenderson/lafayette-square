/**
 * A DISPLAY IS AUTHORED ON ITS OWN LOOK CHANNEL (Jacob, 2026-11-01: "the show to get its own in-look scheduler with the
 * same kind of faders"; "we need to be able to set the fade up/down timer to 0 for a 'switch off'";
 * r-a-display-is-authored-on-its-own-look-channel). A Look's design.json carries `displays: { <displayId>: <channel> }`,
 * one tod channel per display of the town, keyed on the eight sun slots with the lamps' ▲/▼ fade marks:
 *   · glow       the strands' warm glow between shows (an HDR level; tweened, faded)
 *   · show       the show's level (an HDR level; tweened, faded; 0 = no show)
 *   · kelvin     the glow's colour temperature (tweened, never faded: a colour has no "off")
 *   · showEvery  minutes between showtimes from the town's midnight, STEP-HELD (animatedParam.js#keyedStepAt): a count
 *                is never tweened. Divides the 1440-minute day, so the gap across midnight is the same as any other.
 * Every key carries all four: a key with a field missing has nothing honest to fall back to, so it is refused.
 *
 * ⭐ THE NEUTRAL DEFAULT is what the Light Show did before it had a channel (glow 1.36 = 1.7 × the shimmer's mean 0.8;
 * show 2.4; up at Dusk, down at Dawn, both hard; a show every 60 minutes). kelvin is the temperature whose
 * kelvinToRgb is nearest the old fixed glow [255, 214, 150] (3810 K, residual 14.8 of 255: the old colour is not on the
 * blackbody curve). ▶ node checks/claims-a-display-is-authored-on-its-own-channel.mjs --kelvin prints both.
 * ⭐ SHOW WINDOWS (Jacob, 2026-11-01: "Displays: Clock time windows: Yes"; Boz's and Zob's rulings on the plan):
 * `showWindows: [{ from, to }]`, each end a slot word or a time on the town's clock ("HH:MM", 24 h). Absent, a show
 * plays wherever Show is above 0. A showtime's whole run must lie inside one window; a window may cross midnight. ONE
 * modular rule (Zob): a minute m is inside iff (m − from) mod 1440 < L, L = (to − from) mod 1440, so a run ending AT `to`
 * is inside and one starting at `to` is not, and nothing special-cases midnight. The light's LEVELS still follow the
 * keys; a window gates only the showtimes. ⛔ refuseWindowSense: a window whose two ends pass each other on some day of
 * the year at the town (19:00 → Dusk where Dusk comes before 19:00 in winter) is refused, naming the days.
 * Who carries the records: the town's identity (identity.displays) says which displays exist; a Look's channel says how
 * each is lit. A channel for a display the identity lacks is refused by name; a display with no channel gets the default.
 */
import { resolveGroupAtMinute, keyedStepAt } from '../cartograph/animatedParam.js'
import { TOD_SLOT_IDS, SLOT_DAY_MOVE_MAX_MIN } from '../lib/todSlots.js'
import { Refusal } from '../lib/refusal.js'

export const DISPLAY_CHANNEL_FIELDS = ['glow', 'show', 'kelvin', 'showEvery']
/** The editor's faders (Stage › Displays, cartograph/TodChannel.jsx). showEvery steps in whole hours, every one a
 *  divisor of the day; a Look may author any divisor (validateDisplayChannel). */
export const DISPLAY_FIELDS = [
  { key: 'glow',      label: 'Glow',        min: 0,    max: 4,    step: 0.02, title: 'The warm glow between shows' },
  { key: 'show',      label: 'Show',        min: 0,    max: 4,    step: 0.02, title: 'The show\'s brightness; 0 is no show' },
  { key: 'kelvin',    label: 'Glow colour', min: 1800, max: 6500, step: 50,   unit: ' K', title: 'The glow\'s colour temperature' },
  { key: 'showEvery', label: 'Show every',  min: 60,   max: 240,  step: 60,   unit: ' min', title: 'Minutes between shows, from the town\'s midnight' },
]
const DAY_MIN = 1440
export const DEFAULT_KELVIN = 3810
const KEY = Object.freeze({ glow: 1.36, show: 2.4, kelvin: DEFAULT_KELVIN, showEvery: 60 })
const DEFAULT = { animated: 'tod', values: { dusk: { ...KEY }, dawn: { ...KEY } },
  edges: { dusk: { fade: 'up', minutes: 0 }, dawn: { fade: 'down', minutes: 0 } } }

/** The neutral default, a fresh deep copy each call (the store mutates what it hydrates). */
export function defaultDisplayChannel() { return JSON.parse(JSON.stringify(DEFAULT)) }

/**
 * A colour temperature as [r, g, b] 0…255: Tanner Helland's fit to the blackbody (Mitchell Charity's table), the
 * model this channel names; valid 1000 … 40000 K, refused outside it.
 */
export const KELVIN_RANGE = [1000, 40000]
export function kelvinToRgb(K) {
  if (!(K >= KELVIN_RANGE[0] && K <= KELVIN_RANGE[1])) throw new Refusal(`[showChannel] ⛔ ${K} K is outside the colour model's ${KELVIN_RANGE.join(' … ')} K`)
  const t = K / 100, cl = (v) => Math.min(255, Math.max(0, v))
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return [cl(r), cl(g), cl(b)]
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const isEnd = (e) => TOD_SLOT_IDS.includes(e) || HHMM.test(e)
const endName = (e) => (HHMM.test(e) ? e : e[0].toUpperCase() + e.slice(1))
/** A window's end as a minute of the town's day: a clock time, or the slot's minute that day. */
export function windowEndMinute(end, slotMinutes) { const c = HHMM.exec(end); return c ? Number(c[1]) * 60 + Number(c[2]) : slotMinutes[end] }
const span = (w, sm) => ((windowEndMinute(w.to, sm) - windowEndMinute(w.from, sm)) % DAY_MIN + DAY_MIN) % DAY_MIN
const into = (w, minute, sm) => ((minute - windowEndMinute(w.from, sm)) % DAY_MIN + DAY_MIN) % DAY_MIN
/** Is `minute` inside one of the channel's windows on that day (always, with none)? The one modular rule. */
export function inWindows(windows, minute, slotMinutes) {
  if (windows == null) return true
  return windows.some(w => into(w, minute, slotMinutes) < span(w, slotMinutes))
}

function validateWindows(ws, where) {
  if (!Array.isArray(ws) || !ws.length) throw new Refusal(`[showChannel] ⛔ ${where}: showWindows is a list of { from, to }; with no windows, leave it out (a show then plays wherever Show is above 0)`)
  ws.forEach((w, i) => {
    const at = `${where}, window ${i + 1}`
    for (const k of Object.keys(w || {})) if (k !== 'from' && k !== 'to') throw new Refusal(`[showChannel] ⛔ ${at}: "${k}" is not part of a window (from, to)`)
    for (const k of ['from', 'to']) if (!isEnd(w?.[k])) throw new Refusal(`[showChannel] ⛔ ${at}: its ${k} (${JSON.stringify(w?.[k])}) is neither a time-of-day slot (${TOD_SLOT_IDS.join(', ')}) nor a time on the town's clock (HH:MM, 24 h)`)
    if (w.from === w.to) throw new Refusal(`[showChannel] ⛔ ${at}: it starts and ends at ${endName(w.from)}, so it holds no time`)
  })
}

/** Runs of consecutive dates, as "Mon D – Mon D" (or one date). */
function dateRuns(dates) {
  const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const next = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  const runs = []
  for (const d of dates) { const r = runs.at(-1); if (r && next(r[1]) === d) r[1] = d; else runs.push([d, d]) }
  return runs.map(([a, b]) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`)).join(', ')
}

/**
 * ⛔ THE WINDOWS OVER A YEAR AT THE TOWN (Boz's ruling, 2026-11-01, as worded): "a window's two ends never pass each other
 * on any day of the year at the town; if they do, it is refused, naming the days they are the other way round". `days`
 * is the cached year (todSlots.js#todSlotYear / #todSlotDays: [{ date, minutes }], in date order).
 *   · PASS, on daily samples (Zob): the window's length L(d) is 0 on a day (the ends meet), or changes by more than half
 *     the day from one day to the next (the ends crossed: L wrapped through 0). The clock change moves every slot 60
 *     minutes at once, so a clock end within the hour of a slot end can pass in one step; this catches it;
 *   · it rests on no slot moving more than SLOT_DAY_MOVE_MAX_MIN in a day. Where one does (a slot snapping between noon
 *     and the nadir, far north), the test cannot tell a crossing from a jump, so the window is refused by name there;
 *   · two windows that overlap on any day (a minute inside both, the same modular rule) are refused.
 * The "other way round" days are the side of the crossings with fewer days.
 */
export function refuseWindowSense(windows, days, where) {
  if (windows == null) return
  validateWindows(windows, where)
  windows.forEach((w, i) => {
    const at = `${where}, window ${i + 1} (${endName(w.from)} → ${endName(w.to)})`
    for (const end of [w.from, w.to]) if (!HHMM.test(end)) for (let k = 1; k < days.length; k++) {
      const x = Math.abs(days[k].minutes[end] - days[k - 1].minutes[end]) % DAY_MIN, move = Math.min(x, DAY_MIN - x)
      if (move > SLOT_DAY_MOVE_MAX_MIN) throw new Refusal(`[showChannel] ⛔ ${at}: ${endName(end)} moves ${move.toFixed(0)} minutes from ${days[k - 1].date} to ${days[k].date} here, so whether this window's ends pass each other cannot be judged; end it on another moment or a clock time`)
    }
    const sides = [[], []]; let side = 0, prev = null
    for (const d of days) {
      const L = span(w, d.minutes)
      if (L === 0) throw new Refusal(`[showChannel] ⛔ ${at}: on ${dateRuns([d.date])} its two ends fall on the same minute, so it holds no time that day`)
      if (prev != null && Math.abs(L - prev) > DAY_MIN / 2) side ^= 1
      sides[side].push(d.date); prev = L
    }
    if (sides[1].length) {
      const other = sides[0].length < sides[1].length ? sides[0] : sides[1]
      throw new Refusal(`[showChannel] ⛔ ${at}: its two ends pass each other here, so on ${other.length} days (${dateRuns(other)}) it runs the other way round; end it on moments that keep their order all year, or a clock time clear of the sun's`)
    }
  })
  for (let i = 0; i < windows.length; i++) for (let j = i + 1; j < windows.length; j++) {
    const a = windows[i], b = windows[j]
    const d = days.find(r => into(a, windowEndMinute(b.from, r.minutes), r.minutes) < span(a, r.minutes) || into(b, windowEndMinute(a.from, r.minutes), r.minutes) < span(b, r.minutes))
    if (d) throw new Refusal(`[showChannel] ⛔ ${where}: windows ${i + 1} (${endName(a.from)} → ${endName(a.to)}) and ${j + 1} (${endName(b.from)} → ${endName(b.to)}) overlap on ${dateRuns([d.date])}; a show belongs to one window`)
  }
}

/** One channel, refused by name: keyed on the day, known slots, every field on every key, and each in range. */
export function validateDisplayChannel(ch, where) {
  if (ch?.animated !== 'tod' || !ch.values || typeof ch.values !== 'object') throw new Refusal(`[showChannel] ⛔ ${where}: a display channel is keyed on the day ({ animated: 'tod', values })`)
  const keys = Object.entries(ch.values)
  if (!keys.length) throw new Refusal(`[showChannel] ⛔ ${where}: the channel has no keys`)
  for (const [slot, k] of keys) {
    const at = `${where}, the key at ${slot}`
    if (!TOD_SLOT_IDS.includes(slot)) throw new Refusal(`[showChannel] ⛔ ${at}: "${slot}" is not a time-of-day slot (${TOD_SLOT_IDS.join(', ')})`)
    for (const f of Object.keys(k || {})) if (!DISPLAY_CHANNEL_FIELDS.includes(f)) throw new Refusal(`[showChannel] ⛔ ${at}: "${f}" is not a display field (${DISPLAY_CHANNEL_FIELDS.join(', ')})`)
    for (const f of DISPLAY_CHANNEL_FIELDS) if (typeof k?.[f] !== 'number' || !Number.isFinite(k[f])) throw new Refusal(`[showChannel] ⛔ ${at}: ${f} is not authored`)
    if (k.glow < 0 || k.show < 0) throw new Refusal(`[showChannel] ⛔ ${at}: glow and show are levels, never below 0`)
    kelvinToRgb(k.kelvin)
    if (!Number.isInteger(k.showEvery) || k.showEvery <= 0 || DAY_MIN % k.showEvery) throw new Refusal(`[showChannel] ⛔ ${at}: showEvery (${k.showEvery}) must be a whole number of minutes that divides the day (1440), so the gap across midnight is the same as every other`)
  }
  if ('showWindows' in ch) validateWindows(ch.showWindows, where)
  for (const [slot, e] of Object.entries(ch.edges || {})) {
    if (!(slot in ch.values)) throw new Refusal(`[showChannel] ⛔ ${where}: a fade mark at ${slot}, which has no key`)
    if (e?.fade !== 'up' && e?.fade !== 'down') throw new Refusal(`[showChannel] ⛔ ${where}: the mark at ${slot} fades neither up nor down`)
    if (!(e.minutes >= 0)) throw new Refusal(`[showChannel] ⛔ ${where}: the mark at ${slot} has no fade length (0 is a hard switch)`)
  }
  return ch
}

/**
 * The town's display channels for one Look: `identityDisplays` the town's records ({ <id>: record }), `lookDisplays`
 * the Look's design.json `displays` (or undefined). Every identity display gets the Look's channel or the default;
 * a channel naming a display the town lacks is refused by name.
 */
export function displayChannelsFor(identityDisplays, lookDisplays, where) {
  const ids = Object.keys(identityDisplays || {})
  for (const id of Object.keys(lookDisplays || {})) if (!ids.includes(id)) throw new Refusal(`[showChannel] ⛔ ${where}: the Look keys a display "${id}" the town does not have (${ids.join(', ') || 'none'})`)
  return Object.fromEntries(ids.map((id) => [id, lookDisplays?.[id] ? validateDisplayChannel(lookDisplays[id], `${where}, display "${id}"`) : defaultDisplayChannel()]))
}

/** The channel at a minute of the town's day, on that day's slot minutes: { glow, show, kelvin, showEvery, open }, `open`
 *  whether the minute is inside one of its show windows (always, with none). */
export function displayAt(ch, minute, slotMinutes) {
  const { glow, show } = resolveGroupAtMinute(ch, minute, slotMinutes, ['glow', 'show'])
  const { edges, ...unfaded } = ch   // eslint-disable-line no-unused-vars -- a colour has no "off"
  const { kelvin } = resolveGroupAtMinute(unfaded, minute, slotMinutes, ['kelvin'])
  return { glow, show, kelvin, showEvery: keyedStepAt(ch, 'showEvery', minute, slotMinutes), open: inWindows(ch.showWindows, minute, slotMinutes) }
}
