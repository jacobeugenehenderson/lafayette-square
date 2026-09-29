/**
 * animatedParam — runtime envelope resolver for per-Look animatable
 * parameters attached to a keyframe track (TOD slots or, later, camera
 * keyframes).
 *
 * TOD slots are a fixed vocabulary of eight named sun moments. The operator
 * picks names from this list — no free-form slot authoring. Each slot has
 * a canonical minute-of-day; channels keyed by slot id automatically
 * resolve to those minutes via NAMED_TOD_SLOTS_BY_ID.
 *
 * Channel shapes:
 *   { value: number }                                      flat
 *   { animated: 'tod', values: { <slotId>: number, … },    animated
 *     transitionIn: <minutes>, transitionOut: <minutes> }
 *
 * Resolution at a given minute:
 *   1. Map the channel's authored slot ids to their { id, minute } records
 *      from the global todSlots list. Drop any that no longer exist (slot
 *      was removed; the channel hasn't been autosaved yet).
 *   2. Sort by minute. The earliest = "in," latest = "out."
 *   3. If currentMinute lies inside [in.minute, out.minute] → lerp between
 *      the two bracketing authored slots.
 *   4. If currentMinute < in.minute and the gap to in.minute > transitionIn
 *      → hold in.value. Otherwise lerp from in.value over transitionIn into
 *      a "fade target" (we use in.value as the target so lamps don't dip;
 *      the operator can author a lower value at an earlier slot if they
 *      want a real fade in).
 *   5. Mirror logic past out.minute with transitionOut.
 *
 * Day wraps at 1440: outside [first key, last key] the value tweens from
 * the last key across midnight to the first (wrapTodFraction).
 */

// Canonical TOD slot vocabulary — eight SunCalc moments (DawnTimeline.jsx draws the same list).
// ⭐ DEEP NIGHT is the sun's NADIR (solar midnight), the slot between Night and Dawn (Jacob, 2026-09-27).
// Night is astronomical DUSK (−18°, evening); without a key after it the resolver tweened straight up to
// Dawn, so the night was darkest at 20:00 and half-way back to Dawn by midnight. Nadir exists at every
// latitude and date (Night does not, above ~48.6°N near the June solstice) and needs no timezone.
// Per-Look serialization stores slot ids; minutes are computed live from
// SunCalc each frame so the envelope shifts seasonally with the real sun.
import SunCalc from 'suncalc'
import { townMinuteOf } from '../lib/townClock.js'
import { townPlace } from '../lib/townPlace.js'
import { LAMPGLOW_FLAT_DEFAULTS, LAMPGLOW_RADIUS_V } from './skyLightChannels.js'


// Order matches the day's progression so filtering by attachment
// preserves chronological order in the strip. Colors come from --tod-*
// tokens (src/tokens/design.css); this is the single source of truth
// for slot identity + hue across the app.
export const NAMED_TOD_SLOTS = [
  { id: 'dawn',    label: 'Dawn',    color: 'var(--tod-dawn)'    },
  { id: 'sunrise', label: 'Sunrise', color: 'var(--tod-sunrise)' },
  { id: 'noon',    label: 'Noon',    color: 'var(--tod-noon)'    },
  { id: 'golden',  label: 'Golden',  color: 'var(--tod-golden)'  },
  { id: 'sunset',  label: 'Sunset',  color: 'var(--tod-sunset)'  },
  { id: 'dusk',    label: 'Dusk',    color: 'var(--tod-dusk)'    },
  { id: 'night',   label: 'Night',   color: 'var(--tod-night)'   },
  { id: 'deep',    label: 'Deep night', color: 'var(--tod-deep)'  },
]
export const NAMED_TOD_SLOTS_BY_ID = Object.fromEntries(
  NAMED_TOD_SLOTS.map(s => [s.id, s])
)
export function getTodSlotLabel(id) { return NAMED_TOD_SLOTS_BY_ID[id]?.label ?? id }
export function getTodSlotColor(id) { return NAMED_TOD_SLOTS_BY_ID[id]?.color }

// Compute each named slot's minute-of-day for the given Date. SunCalc
// `times` keys: dawn / sunrise / solarNoon / goldenHour / sunset / dusk /
// night / nadir. A moment the sun does not reach that day (high latitude) is null and its keys drop out. We convert each to minute-of-day in the local frame the rest of
// useTimeOfDay uses.
export function getTodSlotMinutes(date) {
  const { lat, lon } = townPlace()
  const times = SunCalc.getTimes(date || new Date(), lat, lon)
  const toMin = (d) => {
    if (!d || isNaN(d.getTime?.())) return null
    return townMinuteOf(d)   // the TOWN's clock (src/lib/townClock.js), as the channels are keyed
  }
  return {
    dawn:    toMin(times.dawn),
    sunrise: toMin(times.sunrise),
    noon:    toMin(times.solarNoon),
    golden:  toMin(times.goldenHour),
    sunset:  toMin(times.sunset),
    dusk:    toMin(times.dusk),
    night:   toMin(times.night),
    deep:    toMin(times.nadir),
  }
}

// "Playhead in slot" tolerance — minutes either side of a slot's
// canonical minute that count as parked. 30 min is forgiving enough for
// freeform scrubs while still letting the operator distinguish adjacent
// slots; SunCalc waypoints near sunset (Golden / Sunset / Dusk) cluster
// in ~30 min, so the matcher prefers the closest by gap.
export const TOD_SLOT_TOLERANCE_MIN = 30

// Find the named TOD slot whose computed minute is within tolerance of
// `minute`. Returns slot id, or null.
export function todSlotAtMinute(minute, date) {
  const mins = getTodSlotMinutes(date)
  let best = null
  let bestGap = Infinity
  for (const slot of NAMED_TOD_SLOTS) {
    const m = mins[slot.id]
    if (m == null) continue
    const d = Math.abs(m - minute), gap = Math.min(d, 1440 - d)
    if (gap <= TOD_SLOT_TOLERANCE_MIN && gap < bestGap) {
      best = slot.id
      bestGap = gap
    }
  }
  return best
}

// TOD is CYCLIC. The gap between the LAST authored slot (evening) and the FIRST
// (pre-dawn) crosses midnight, so off-hours should TWEEN across the seam, not
// clamp to the nearest endpoint. For a minute OUTSIDE [first, last], return the
// fraction 0→1 running from `last` (at/after it) through midnight to `first`
// (at/before it). (2026-06-28 — wrap-across-midnight; before this, pre-dawn hours
// clamped to the dawn slot instead of tweening down from the night slot.)
const TOD_DAY_MIN = 1440
function wrapTodFraction(minute, firstMin, lastMin) {
  const gap = (firstMin + TOD_DAY_MIN) - lastMin
  if (gap <= 0) return 0
  const pos = minute >= lastMin ? (minute - lastMin) : (minute + TOD_DAY_MIN - lastMin)
  return Math.min(1, Math.max(0, pos / gap))
}

// ── FADE UP / FADE DOWN AT THE EDGES (Jacob, 2026-09-26) ──────────────────────────────────────────
// Keys tween to each other — across blank tiles too — exactly as before. The ONLY new thing: a key that
// borders a blank tile can be marked (`channel.edges[slotId] = { fade: 'up' | 'down', minutes }`):
//   · 'down' (a blank tile AFTER it): from the key the value fades to OFF over `minutes`, then stays off
//     until the next key.
//   · 'up'   (a blank tile BEFORE it): off until the key, then it fades UP over `minutes`, then tweens on.
//   · A key before a fade-up that is not itself marked switches off AT that key.
//   · A key marked up whose run has no fade-down holds its value until the next fade-up.
// Lamps: fade up at Dusk, fade down at Dawn — off through the day, the run spanning midnight. Scalars only:
// a colour has no "off", so colour fields keep tweening. A mark on a key that no longer borders a blank is
// ignored (the tile shows no shape there either). One key alone holds, as before.
// The minutes default to ONE constant, shared with the tile that shows it.
// ⛔ Replaces the channel-level transitionIn/transitionOut boxes, which were shown for months and read by
// nothing (both old branches returned the key's own value; 72485eca removed even that).
export const TOD_FADE_DEFAULT_MIN = 30
const SLOT_ORDER = NAMED_TOD_SLOTS.map(s => s.id)
/** The key's fade mark, if it is valid here — 'up' needs a blank tile before it, 'down' a blank tile after. */
export function todEdge(channel, slotId) {
  const e = channel?.edges?.[slotId], vals = channel?.values || {}
  if (!e || !(slotId in vals)) return null
  const i = SLOT_ORDER.indexOf(slotId); if (i < 0) return null
  const before = SLOT_ORDER[(i - 1 + SLOT_ORDER.length) % SLOT_ORDER.length]
  const after = SLOT_ORDER[(i + 1) % SLOT_ORDER.length]
  if (e.fade === 'up' && !(before in vals)) return e
  if (e.fade === 'down' && !(after in vals)) return e
  return null
}
/** Set or clear one key's fade mark — the ONE way every store writes it. fade: 'up' | 'down' | null. */
export function todEdgePatch(ch, slotId, fade, minutes) {
  const edges = { ...(ch?.edges || {}) }
  if (!fade) delete edges[slotId]
  else edges[slotId] = { fade, minutes: Math.max(0, Number(minutes ?? edges[slotId]?.minutes ?? TOD_FADE_DEFAULT_MIN) || 0) }
  // eslint-disable-next-line no-unused-vars — the dead channel-level boxes go with the first edit
  const { transitionIn, transitionOut, edges: _old, ...rest } = ch || {}
  return Object.keys(edges).length ? { ...rest, edges } : rest
}

/**
 * How the edge marks shape the value at `minute`, given the channel's keys sorted by minute (≥ 2).
 * Returns null (no mark in play → plain tween), or { key, scale } (value = key's value × scale),
 * or { tween: scale } (value = the plain tween × scale).
 */
function edgeEnvelope(channel, points, minute) {
  if (!channel?.edges || points.length < 2) return null
  const n = points.length
  let i = n - 1
  for (let j = 0; j < n; j++) if (points[j].minute <= minute) i = j
  const K = points[i], N = points[(i + 1) % n]
  const since = ((minute - K.minute) % TOD_DAY_MIN + TOD_DAY_MIN) % TOD_DAY_MIN
  const gap = ((N.minute - K.minute) % TOD_DAY_MIN + TOD_DAY_MIN) % TOD_DAY_MIN || TOD_DAY_MIN
  const eK = todEdge(channel, K.id), eN = todEdge(channel, N.id)
  const ramp = (e) => { const w = Math.min(gap, Math.max(0, e.minutes ?? TOD_FADE_DEFAULT_MIN)); return w <= 0 ? 1 : Math.min(1, since / w) }
  if (eK?.fade === 'down') return { key: K, scale: 1 - ramp(eK) }
  if (eN?.fade === 'up') return eK?.fade === 'up' ? { key: K, scale: ramp(eK) } : { key: K, scale: 0 }
  if (eK?.fade === 'up') return { tween: ramp(eK) }
  return null
}

function tweenAnimatedAtMinute(channel, minute, todSlots) {
  if (!channel) return 0
  if (!channel.animated) return Number(channel.value) || 0
  const slotById = new Map((todSlots || []).map(s => [s.id, s]))
  const points = Object.entries(channel.values || {})
    .map(([id, v]) => {
      const slot = slotById.get(id)
      return slot ? { id, minute: slot.minute, value: Number(v) || 0 } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.minute - b.minute)
  if (points.length === 0) return 0
  if (points.length === 1) return points[0].value
  const first = points[0]
  const last = points[points.length - 1]
  // Outside [first, last] = the midnight gap → wrap-tween last → first.
  if (minute < first.minute || minute > last.minute) {
    const t = wrapTodFraction(minute, first.minute, last.minute)
    return last.value + (first.value - last.value) * t
  }
  // Find bracketing authored points.
  let lo = first
  let hi = last
  for (let i = 0; i < points.length - 1; i++) {
    if (minute >= points[i].minute && minute <= points[i + 1].minute) {
      lo = points[i]
      hi = points[i + 1]
      break
    }
  }
  if (hi.minute === lo.minute) return lo.value
  const t = (minute - lo.minute) / (hi.minute - lo.minute)
  return lo.value + (hi.value - lo.value) * t
}

// ⭐ IN EDITING, THE TILE YOU ARE ON IS WHAT YOU SEE — AT 100% OF ITS SETTING (Jacob, 2026-09-27: "There are no timers
// in editing … it's a static moment" · "THEY ARE SUPPOSED TO BE AT 100% OF THE SETTING: WHICH IS ZERO!"). With Stage's
// clock stopped, the tile the editor targets (todSlotAtMinute — within its tolerance) is the moment: a channel keyed
// on that tile shows its key's own values, with no fade and no drift toward the next key. It used to show the clock's
// own minute — 9 minutes past Sunset tweened toward Dusk while the editor said "Sunset".
// Playback (the live clock, production) never sets it, so fades and tweens play as authored.
let _still = null   // { minute, slot } — the stopped clock's minute and the tile the editor targets there
export function setTodStill(minute, slot) { _still = Number.isFinite(minute) && slot ? { minute, slot } : null }
const stillSlot = (minute) => (_still && Math.abs(minute - _still.minute) < 1e-3 ? _still.slot : null)

/** The plain tween, then the edge fades (edgeEnvelope) where a key is marked up or down. */
export function resolveAnimatedAtMinute(channel, minute, todSlots) {
  if (channel?.animated) { const id = stillSlot(minute); if (id && id in (channel.values || {})) return Number(channel.values[id]) || 0 }
  const base = tweenAnimatedAtMinute(channel, minute, todSlots)
  if (!channel?.animated || !channel.edges) return base
  const byId = new Map((todSlots || []).map(sl => [sl.id, sl.minute]))
  const points = Object.entries(channel.values || {})
    .filter(([id]) => byId.has(id)).map(([id, v]) => ({ id, minute: byId.get(id), value: Number(v) || 0 }))
    .sort((a, b) => a.minute - b.minute)
  const env = edgeEnvelope(channel, points, minute)
  if (!env) return base
  return env.key ? env.key.value * env.scale : base * env.tween
}

// Migrate any prior lampGlow shape to the canonical group shape:
//   flat:     { values: { grass, trees, pool } }
//   animated: { animated: 'tod', transitionIn, transitionOut,
//               values: { <slotId>: { grass, trees, pool }, … } }
// "Lamp Glow" is one animatable group; the three channels share one
// timeline. Each authored slot carries the triple of values.
//
// Handles three legacy shapes:
//   1. { grass: 0, trees: 0, pool: 1.0 }                 (original flat)
//   2. { grass:{value:0}, trees:{value:0}, pool:{value:1} }  (per-channel intermediate)
//   3. { grass:{animated,values,…}, … }                  (per-channel animated intermediate)
// (3) folds into the group shape: take the union of all per-channel
// authored slot ids; at each slot id, each channel contributes its
// authored value (or its flat value if the channel wasn't animated).
// ⭐ POOL RADIUS CHANGED MEANING 2026-09-26 (0c221c63): it used to run 0 = FULL pool … 1 = full; it now runs
// 0 = OFF … 1 = full. A channel saved before carries radius 0 meaning FULL, so an UNSTAMPED channel reads its 0s
// as 1 and is stamped `radiusV: 2`; from then on 0 means off. Values between 0 and 1 read about the same on both
// scales and are left alone. Applied where a channel is LOADED (Stage hydrate, the value setter) and where it is
// RESOLVED (production's baked scene.json), so an old Look reads right everywhere without a re-save.
export { LAMPGLOW_RADIUS_V }
const _radiusStamped = new WeakMap()
export function stampLampGlowRadius(ch) {
  if (!ch || typeof ch !== 'object' || ch.radiusV === LAMPGLOW_RADIUS_V) return ch
  if (_radiusStamped.has(ch)) return _radiusStamped.get(ch)
  const fix = (t) => (t && typeof t === 'object' && t.radius === 0 ? { ...t, radius: 1 } : t)
  const values = ch.animated
    ? Object.fromEntries(Object.entries(ch.values || {}).map(([k, t]) => [k, fix(t)]))
    : fix(ch.values || {})
  const out = { ...ch, values, radiusV: LAMPGLOW_RADIUS_V }
  _radiusStamped.set(ch, out)
  return out
}

export function migrateLampGlow(legacy) { return stampLampGlowRadius(_migrateLampGlowShape(legacy)) }
function _migrateLampGlowShape(legacy) {
  const FLAT_DEFAULT = { values: { ...LAMPGLOW_FLAT_DEFAULTS }, radiusV: LAMPGLOW_RADIUS_V }
  if (!legacy || typeof legacy !== 'object') return FLAT_DEFAULT

  // Already group shape?
  if (legacy.values && typeof legacy.values === 'object') {
    if (legacy.animated) return legacy
    if ('grass' in legacy.values || 'trees' in legacy.values || 'pool' in legacy.values) {
      // Every field the card has (it used to keep only grass/trees/pool and dropped `radius` on every load).
      const v = { ...LAMPGLOW_FLAT_DEFAULTS }
      for (const k of Object.keys(LAMPGLOW_FLAT_DEFAULTS)) if (legacy.values[k] != null) v[k] = Number(legacy.values[k])
      return { ...(legacy.radiusV ? { radiusV: legacy.radiusV } : {}), values: v }
    }
  }

  const channels = ['grass', 'trees', 'pool']
  const isPerChannel = channels.some(k => legacy[k] && typeof legacy[k] === 'object')
  if (!isPerChannel) {
    return { values: {
      grass: Number(legacy.grass) || 0,
      trees: Number(legacy.trees) || 0,
      pool:  legacy.pool == null ? 1.0 : Number(legacy.pool),
    } }
  }

  const perCh = {}
  let anyAnimated = false
  let mergedTransIn = 30, mergedTransOut = 30
  const allSlots = new Set()
  for (const k of channels) {
    const v = legacy[k]
    if (v && typeof v === 'object' && v.animated) {
      perCh[k] = { animated: true, values: v.values || {} }
      anyAnimated = true
      if (v.transitionIn != null) mergedTransIn = v.transitionIn
      if (v.transitionOut != null) mergedTransOut = v.transitionOut
      for (const sid of Object.keys(v.values || {})) allSlots.add(sid)
    } else if (v && typeof v === 'object') {
      perCh[k] = { animated: false, value: Number(v.value) || 0 }
    } else {
      perCh[k] = { animated: false, value: Number(v) || 0 }
    }
  }
  if (!anyAnimated) {
    return { values: {
      grass: perCh.grass.value, trees: perCh.trees.value, pool: perCh.pool.value,
    } }
  }
  const values = {}
  for (const sid of allSlots) {
    values[sid] = {}
    for (const k of channels) {
      values[sid][k] = perCh[k].animated
        ? (perCh[k].values[sid] ?? 0)
        : perCh[k].value
    }
  }
  return { animated: 'tod', transitionIn: mergedTransIn, transitionOut: mergedTransOut, values }
}

// Type detection: a default value that's a string starting with '#' is a
// color field; everything else is a scalar. Auto-detect avoids changing
// every existing caller's signature; new color channels just declare a
// hex default and the resolver routes accordingly.
function isColorVal(v) { return typeof v === 'string' && v[0] === '#' }

// Reusable Three.js Color instances for hex lerping. Module-level so we
// don't allocate on every per-frame resolve call.
import * as THREE from 'three'
const _lerpA = new THREE.Color()
const _lerpB = new THREE.Color()
function lerpHex(a, b, t) {
  _lerpA.set(a)
  _lerpB.set(b)
  _lerpA.lerp(_lerpB, t)
  return '#' + _lerpA.getHexString()
}

// Read one field's value from a tuple, falling back to its default.
// Routes by default-value type (color string vs. numeric scalar).
function readField(tuple, key, defaults) {
  const def = defaults[key]
  const raw = tuple?.[key]
  if (isColorVal(def)) {
    return (typeof raw === 'string' && raw[0] === '#') ? raw : (def ?? '#000000')
  }
  return raw == null ? Number(def ?? 0) : Number(raw)
}

// Lerp one field between two endpoint values per its type.
function lerpField(a, b, t, isColor) {
  return isColor ? lerpHex(a, b, t) : (a + (b - a) * t)
}

// Resolve a group-animated channel at a given minute. Returns an object
// keyed by `fieldKeys` with the lerped value at that minute. Independent
// interp on each field between bracketing authored slots — linear for
// scalars, RGB lerp for colors. Outside the in/out range, hold endpoint
// values. `defaults` fills in missing fields and routes per-field type.
function tweenGroupAtMinute(channel, minute, slotMinutes, fieldKeys, defaults = {}) {
  const fallback = () => {
    const out = {}
    for (const k of fieldKeys) {
      out[k] = isColorVal(defaults[k]) ? (defaults[k] ?? '#000000') : (defaults[k] ?? 0)
    }
    return out
  }
  if (!channel) return fallback()
  if (!channel.animated) {
    const v = channel.values || {}
    const out = {}
    for (const k of fieldKeys) out[k] = readField(v, k, defaults)
    return out
  }
  const mins = slotMinutes || getTodSlotMinutes(new Date())
  const points = Object.entries(channel.values || {})
    .map(([id, tuple]) => {
      const m = mins[id]
      if (m == null) return null
      const p = { id, minute: m }
      for (const k of fieldKeys) p[k] = readField(tuple, k, defaults)
      return p
    })
    .filter(Boolean)
    .sort((a, b) => a.minute - b.minute)
  if (points.length === 0) return fallback()
  const pick = (p) => {
    const out = {}
    for (const k of fieldKeys) out[k] = p[k]
    return out
  }
  if (points.length === 1) return pick(points[0])
  const first = points[0], last = points[points.length - 1]
  // Outside [first, last] = the midnight gap → wrap-tween last → first.
  if (minute < first.minute || minute > last.minute) {
    const t = wrapTodFraction(minute, first.minute, last.minute)
    const out = {}
    for (const k of fieldKeys) out[k] = lerpField(last[k], first[k], t, isColorVal(defaults[k]))
    return out
  }
  let lo = first, hi = last
  for (let i = 0; i < points.length - 1; i++) {
    if (minute >= points[i].minute && minute <= points[i + 1].minute) {
      lo = points[i]; hi = points[i + 1]; break
    }
  }
  if (hi.minute === lo.minute) return pick(lo)
  const t = (minute - lo.minute) / (hi.minute - lo.minute)
  const out = {}
  for (const k of fieldKeys) out[k] = lerpField(lo[k], hi[k], t, isColorVal(defaults[k]))
  return out
}

/** The plain tween per field, then the edge fades on SCALAR fields (a colour has no "off"). */
export function resolveGroupAtMinute(channel, minute, slotMinutes, fieldKeys, defaults = {}) {
  if (channel?.animated) { const id = stillSlot(minute)
    if (id && id in (channel.values || {})) { const out = {}; for (const k of fieldKeys) out[k] = readField(channel.values[id], k, defaults); return out } }
  const base = tweenGroupAtMinute(channel, minute, slotMinutes, fieldKeys, defaults)
  if (!channel?.animated || !channel.edges) return base
  const mins = slotMinutes || getTodSlotMinutes(new Date())
  const points = Object.entries(channel.values || {})
    .filter(([id]) => mins[id] != null)
    .map(([id, tuple]) => { const p = { id, minute: mins[id] }; for (const k of fieldKeys) p[k] = readField(tuple, k, defaults); return p })
    .sort((a, b) => a.minute - b.minute)
  const env = edgeEnvelope(channel, points, minute)
  if (!env) return base
  const out = { ...base }
  for (const k of fieldKeys) {
    if (isColorVal(defaults[k])) continue
    out[k] = env.key ? env.key[k] * env.scale : base[k] * env.tween
  }
  return out
}

// Generic group-channel migrate. Used by new channels (Bloom, Sky, etc.)
// that don't have legacy shapes — returns the canonical group shape with
// defaults filled in. Color fields preserved as hex strings; scalars as
// numbers. LampGlow keeps its bespoke migrate for legacy intermediate shapes.
export function migrateGroupChannel(legacy, fieldKeys, defaults) {
  const valOrDefault = (raw, def) => {
    if (isColorVal(def)) {
      return (typeof raw === 'string' && raw[0] === '#') ? raw : (def ?? '#000000')
    }
    return raw == null ? Number(def ?? 0) : Number(raw)
  }
  const flatFromDefaults = () => {
    const out = {}
    for (const k of fieldKeys) out[k] = isColorVal(defaults[k]) ? (defaults[k] ?? '#000000') : (defaults[k] ?? 0)
    return out
  }
  if (!legacy || typeof legacy !== 'object') return { values: flatFromDefaults() }
  if (legacy.values && typeof legacy.values === 'object') {
    if (legacy.animated) return legacy
    const out = {}
    for (const k of fieldKeys) out[k] = valOrDefault(legacy.values[k], defaults[k])
    return { values: out }
  }
  return { values: flatFromDefaults() }
}

// Lamp Glow stays as a thin wrapper for back-compat. Same triple shape
// the existing consumers expect.
const LAMP_GLOW_KEYS = ['grass', 'trees', 'pool', 'radius', 'centre']
export function resolveLampGlowAtMinute(lampGlow, minute, slotMinutes) {
  return resolveGroupAtMinute(stampLampGlowRadius(lampGlow), minute, slotMinutes, LAMP_GLOW_KEYS, LAMPGLOW_FLAT_DEFAULTS)
}
