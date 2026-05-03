/**
 * animatedParam — runtime envelope resolver for per-Look animatable
 * parameters attached to a keyframe track (TOD slots or, later, camera
 * keyframes).
 *
 * TOD slots are a fixed vocabulary of seven named moments. The operator
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
 * Day wraps at 1440. We resolve in linear-minute space without wrapping —
 * Lafayette Looks are authored in a single 24h cycle and the operator can
 * model overnight by adding a "midnight" slot. Wrapping logic adds
 * complexity without earning it yet; revisit when needed.
 */

// Canonical TOD slot vocabulary — mirrors the 7 SunCalc waypoints in
// DawnTimeline.jsx (Dawn, Sunrise, Noon, Golden, Sunset, Dusk, Night).
// Per-Look serialization stores slot ids; minutes are computed live from
// SunCalc each frame so the envelope shifts seasonally with the real sun.
import SunCalc from 'suncalc'

const LATITUDE = 38.6160
const LONGITUDE = -90.2161

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
]
export const NAMED_TOD_SLOTS_BY_ID = Object.fromEntries(
  NAMED_TOD_SLOTS.map(s => [s.id, s])
)
export function getTodSlotLabel(id) { return NAMED_TOD_SLOTS_BY_ID[id]?.label ?? id }
export function getTodSlotColor(id) { return NAMED_TOD_SLOTS_BY_ID[id]?.color }

// Compute each named slot's minute-of-day for the given Date. SunCalc
// `times` keys: dawn / sunrise / solarNoon / goldenHour / sunset / dusk /
// night. We convert each to minute-of-day in the local frame the rest of
// useTimeOfDay uses.
export function getTodSlotMinutes(date) {
  const times = SunCalc.getTimes(date || new Date(), LATITUDE, LONGITUDE)
  const toMin = (d) => {
    if (!d || isNaN(d.getTime?.())) return null
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  }
  return {
    dawn:    toMin(times.dawn),
    sunrise: toMin(times.sunrise),
    noon:    toMin(times.solarNoon),
    golden:  toMin(times.goldenHour),
    sunset:  toMin(times.sunset),
    dusk:    toMin(times.dusk),
    night:   toMin(times.night),
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
    const gap = Math.abs(m - minute)
    if (gap <= TOD_SLOT_TOLERANCE_MIN && gap < bestGap) {
      best = slot.id
      bestGap = gap
    }
  }
  return best
}

export function resolveAnimatedAtMinute(channel, minute, todSlots) {
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
  if (minute <= first.minute) {
    const gap = first.minute - minute
    const tIn = Math.max(0, channel.transitionIn ?? 0)
    if (tIn === 0 || gap >= tIn) return first.value
    // Inside the in-ramp: ease toward first.value from a notional held
    // pre-state. Without an explicit pre-value, target == first.value
    // so this collapses to "hold first." Kept as an extension hook.
    return first.value
  }
  if (minute >= last.minute) {
    const gap = minute - last.minute
    const tOut = Math.max(0, channel.transitionOut ?? 0)
    if (tOut === 0 || gap >= tOut) return last.value
    return last.value
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
export function migrateLampGlow(legacy) {
  const FLAT_DEFAULT = { values: { grass: 0, trees: 0, pool: 1.0 } }
  if (!legacy || typeof legacy !== 'object') return FLAT_DEFAULT

  // Already group shape?
  if (legacy.values && typeof legacy.values === 'object') {
    if (legacy.animated) return legacy
    if ('grass' in legacy.values || 'trees' in legacy.values || 'pool' in legacy.values) {
      return { values: {
        grass: Number(legacy.values.grass) || 0,
        trees: Number(legacy.values.trees) || 0,
        pool:  legacy.values.pool == null ? 1.0 : Number(legacy.values.pool),
      } }
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
export function resolveGroupAtMinute(channel, minute, slotMinutes, fieldKeys, defaults = {}) {
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
  if (minute <= first.minute) return pick(first)
  if (minute >= last.minute)  return pick(last)
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
const LAMP_GLOW_KEYS = ['grass', 'trees', 'pool']
const LAMP_GLOW_DEFAULTS = { grass: 0, trees: 0, pool: 1.0 }
export function resolveLampGlowAtMinute(lampGlow, minute, slotMinutes) {
  return resolveGroupAtMinute(lampGlow, minute, slotMinutes, LAMP_GLOW_KEYS, LAMP_GLOW_DEFAULTS)
}
