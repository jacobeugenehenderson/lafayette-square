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
 * Who carries the records: the town's identity (identity.displays) says which displays exist; a Look's channel says how
 * each is lit. A channel for a display the identity lacks is refused by name; a display with no channel gets the default.
 */
import { resolveGroupAtMinute, keyedStepAt } from '../cartograph/animatedParam.js'
import { TOD_SLOT_IDS } from '../lib/todSlots.js'
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

/** The channel at a minute of the town's day, on that day's slot minutes: { glow, show, kelvin, showEvery }. */
export function displayAt(ch, minute, slotMinutes) {
  const { glow, show } = resolveGroupAtMinute(ch, minute, slotMinutes, ['glow', 'show'])
  const { edges, ...unfaded } = ch   // eslint-disable-line no-unused-vars -- a colour has no "off"
  const { kelvin } = resolveGroupAtMinute(unfaded, minute, slotMinutes, ['kelvin'])
  return { glow, show, kelvin, showEvery: keyedStepAt(ch, 'showEvery', minute, slotMinutes) }
}
