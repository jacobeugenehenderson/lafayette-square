/**
 * A DISPLAY IS AUTHORED ON ITS OWN LOOK CHANNEL (Jacob, 2026-11-01: "the show to get its own in-look scheduler with the
 * same kind of faders"; r-a-display-is-authored-on-its-own-look-channel). A Look's design.json carries
 * `displays: { <displayId>: <channel> }`, one per display of the town:
 *   · LEVELS, keyed on the eight time slots (the sun decides only each slot's clock time):
 *       glow    the Ambient light between shows (an HDR level; the Lit card calls it Ambient; the field keeps its name,
 *               so no published shape churns)
 *       show    the show's level (an HDR level; 0 = no show)
 *       kelvin  Ambient's colour temperature (never faded: a colour has no "off")
 *     Every key carries all three; a key with one missing has nothing honest to fall back to, so it is refused.
 *   · WHEN, its `schedule` (./showSchedule.js): entries like calendar invites, Ambient on/off with its fades, and the
 *     shows from a first start to a last start every N minutes. A display's keys carry no ▲/▼ marks: Ambient's fades
 *     are its on and off (ruling (c), 2026-11-01).
 * ⭐ THE NEUTRAL DEFAULT is what the Light Show did before it had a channel (glow 1.36 = 1.7 × the shimmer's mean 0.8;
 * show 2.4; Ambient on at Dusk and off at Dawn, both hard; a show every hour on the hour). kelvin is the temperature whose
 * kelvinToRgb is nearest the old fixed glow [255, 214, 150] (3810 K, residual 14.8 of 255). ▶ node
 * checks/claims-a-display-is-authored-on-its-own-channel.mjs --kelvin prints both.
 * ⭐ A PLAYER UPDATE NEVER BREAKS A PUBLISHED SLAB (Jacob, 2026-11-01). Two published shapes are read, each by ONE named
 * function, the only code that sees it: readShowScheduleV1 (the per-key cadence every display slab carried before the
 * schedule) and readPreDisplaySlab (a scene.json from before displays had a channel). Anything else is refused by name.
 * Who carries the records: the town's identity (identity.displays) says which displays exist; a Look's channel says how
 * each is lit. A channel for a display the identity lacks is refused by name; a display with no channel gets the default.
 */
import { TOD_SLOT_IDS } from '../lib/todSlots.js'
import { Refusal } from '../lib/refusal.js'
import { validateSchedule } from './showSchedule.js'

export const DISPLAY_CHANNEL_FIELDS = ['glow', 'show', 'kelvin']
/** The editor's faders (Stage › Displays, cartograph/TodChannel.jsx). WHEN is the Schedule block's, not a fader's. */
export const DISPLAY_FIELDS = [
  { key: 'glow',   label: 'Ambient',        min: 0,    max: 4,    step: 0.02, title: 'The Ambient light between shows' },
  { key: 'show',   label: 'Show',           min: 0,    max: 4,    step: 0.02, title: 'The show\'s brightness; 0 is no show' },
  { key: 'kelvin', label: 'Ambient colour', min: 1800, max: 6500, step: 50,   unit: ' K', title: 'Ambient\'s colour temperature' },
]
const DAY = 1440
export const DEFAULT_KELVIN = 3810
const KEY = Object.freeze({ glow: 1.36, show: 2.4, kelvin: DEFAULT_KELVIN })
const DEFAULT = { animated: 'tod', values: { dusk: { ...KEY }, dawn: { ...KEY } },
  schedule: [{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: 'dawn', fadeOut: 0 }, shows: { first: '00:00', last: '23:00', every: 60 } }] }

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

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/**
 * ⭐ THE PUBLISHED PER-KEY CADENCE, READ (Jacob: "A player update never breaks a published slab"; Zob: one reader, one
 * place, exact). Before the schedule, a display channel carried `showEvery` on EVERY key, all equal (shows every N from
 * the town's midnight wherever Show was above 0), and exactly one ▲ and one ▼ fade mark on its keys. Every published
 * display slab carries that shape (measured 2026-11-01: PTown staging and production, sunset ▲15, dawn ▼15, 60; the old
 * default, Dusk ▲0, Dawn ▼0, 60). This is the ONLY code that sees a key's showEvery or a display key's mark. It reads the
 * pure old shape as one daily entry, the identical light: Ambient on at the ▲ key's slot over its minutes and off at the
 * ▼ key's over its minutes; shows from 00:00 to the last whole N before midnight, every N. Anything else of that kind
 * (keys differing, some without, more or fewer marks, or a `schedule` alongside) is refused by name, never guessed. A
 * channel with no key showEvery and no marks passes through untouched.
 * ▶ node checks/claims-a-display-is-authored-on-its-own-channel.mjs (exact against the old engine, every minute of 2026)
 */
export function readShowScheduleV1(ch, where) {
  const keys = Object.entries(ch?.values || {}), keyed = keys.filter(([, k]) => k && typeof k === 'object' && 'showEvery' in k)
  const marks = Object.entries(ch?.edges || {})
  if (!keyed.length && !marks.length) return ch
  const at = `[showChannel] ⛔ ${where}`
  if ('schedule' in ch) throw new Refusal(`${at}: it carries the published per-key cadence or fade marks AND a schedule; one channel has one schedule`)
  if (keyed.length !== keys.length) throw new Refusal(`${at}: only some of its keys carry a cadence (${keys.map(([s, k]) => `${s}=${k?.showEvery ?? 'none'}`).join(', ')}), a shape never published`)
  const n = [...new Set(keyed.map(([, k]) => k.showEvery))]
  if (n.length !== 1) throw new Refusal(`${at}: its keys carry different cadences (${keyed.map(([s, k]) => `${s}=${k.showEvery}`).join(', ')}), a shape never published`)
  const every = n[0]
  if (!Number.isInteger(every) || every < 1 || DAY % every) throw new Refusal(`${at}: its keys' cadence (${JSON.stringify(every)}) is not a whole number of minutes dividing the day, a shape never published`)
  const up = marks.filter(([, e]) => e?.fade === 'up'), down = marks.filter(([, e]) => e?.fade === 'down')
  if (up.length !== 1 || down.length !== 1 || marks.length !== 2) throw new Refusal(`${at}: its keys carry ${marks.map(([s, e]) => `${e?.fade} at ${s}`).join(', ') || 'no fade marks'}; the published shape has exactly one up and one down`)
  for (const [s, e] of marks) if (!(s in ch.values) || !(e.minutes >= 0)) throw new Refusal(`${at}: the mark at ${s} has no key or no fade length`)
  const { edges, ...rest } = ch; void edges
  return { ...rest,
    values: Object.fromEntries(keys.map(([s, k]) => { const { showEvery, ...lv } = k; void showEvery; return [s, lv] })),
    schedule: [{ days: 'daily', ambient: { on: up[0][0], fadeIn: up[0][1].minutes, off: down[0][0], fadeOut: down[0][1].minutes }, shows: { first: '00:00', last: hhmm(DAY - every), every } }] }
}

/**
 * One channel, refused by name: keyed on the day, known slots, every level on every key and each in range, no fade
 * marks, and a valid schedule. A published per-key cadence is read first (readShowScheduleV1). Returns the channel to
 * use (the same object, or the published one read into the schedule's shape): a caller must use what it returns.
 */
export function validateDisplayChannel(input, where) {
  const ch = readShowScheduleV1(input, where)
  if (ch?.animated !== 'tod' || !ch.values || typeof ch.values !== 'object') throw new Refusal(`[showChannel] ⛔ ${where}: a display channel is keyed on the day ({ animated: 'tod', values, schedule })`)
  for (const k of Object.keys(ch)) if (!['animated', 'values', 'schedule'].includes(k)) throw new Refusal(`[showChannel] ⛔ ${where}: "${k}" is not part of a display channel (animated, values, schedule)`)
  const keys = Object.entries(ch.values)
  if (!keys.length) throw new Refusal(`[showChannel] ⛔ ${where}: the channel has no keys`)
  for (const [slot, k] of keys) {
    const at = `${where}, the key at ${slot}`
    if (!TOD_SLOT_IDS.includes(slot)) throw new Refusal(`[showChannel] ⛔ ${at}: "${slot}" is not a time-of-day slot (${TOD_SLOT_IDS.join(', ')})`)
    for (const f of Object.keys(k || {})) if (!DISPLAY_CHANNEL_FIELDS.includes(f)) throw new Refusal(`[showChannel] ⛔ ${at}: "${f}" is not a display level (${DISPLAY_CHANNEL_FIELDS.join(', ')})`)
    for (const f of DISPLAY_CHANNEL_FIELDS) if (typeof k?.[f] !== 'number' || !Number.isFinite(k[f])) throw new Refusal(`[showChannel] ⛔ ${at}: ${f} is not authored`)
    if (k.glow < 0 || k.show < 0) throw new Refusal(`[showChannel] ⛔ ${at}: Ambient and show are levels, never below 0`)
    kelvinToRgb(k.kelvin)
  }
  validateSchedule(ch.schedule, where)
  return ch
}

/**
 * The town's display channels for one Look: `identityDisplays` the town's records ({ <id>: record }), `lookDisplays`
 * the Look's design.json `displays` (or undefined). Every identity display gets the Look's channel (read and validated)
 * or the default; a channel naming a display the town lacks is refused by name.
 */
export function displayChannelsFor(identityDisplays, lookDisplays, where) {
  const ids = Object.keys(identityDisplays || {})
  for (const id of Object.keys(lookDisplays || {})) if (!ids.includes(id)) throw new Refusal(`[showChannel] ⛔ ${where}: the Look keys a display "${id}" the town does not have (${ids.join(', ') || 'none'})`)
  return Object.fromEntries(ids.map((id) => [id, lookDisplays?.[id] ? validateDisplayChannel(lookDisplays[id], `${where}, display "${id}"`) : defaultDisplayChannel()]))
}

/**
 * ⭐ A SCENE FROM BEFORE DISPLAYS HAD A CHANNEL, READ (Boz's ruling, 2026-11-02, with Zob's version gate; BRIEF-ward-a-player-
 * update-never-breaks-a-published-slab). The player's one reader of a slab's `displays`:
 *   · NO `displays` key (a slab baked before the channel, e.g. PTown's 2026-10-29 publishes, Huron's staging): each display
 *     the identity declares gets what the bake gives a Look with no channel for it (displayChannelsFor, the same
 *     function: the neutral default, the light of its day); none declared, nothing;
 *   · a `displays` block: each declared display MUST have its channel (a block missing one is an inconsistent slab,
 *     refused by name), each read and validated as the bake does.
 */
export function readPreDisplaySlab(scene, identityDisplays, where) {
  if (!scene || !('displays' in scene)) return displayChannelsFor(identityDisplays, undefined, `${where} (a slab from before displays had a channel)`)
  const missing = Object.keys(identityDisplays || {}).filter(id => !(id in (scene.displays || {})))
  if (missing.length) throw new Refusal(`[showChannel] ⛔ ${where}: the slab's displays block has no channel for ${missing.map(i => `"${i}"`).join(', ')}, which the town declares: an inconsistent slab (re-bake the Look's scene)`)
  return displayChannelsFor(identityDisplays, scene.displays, where)
}
