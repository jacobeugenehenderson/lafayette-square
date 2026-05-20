/**
 * Sky gradient grid — the 2D color matrix that drives the skydome shader.
 *
 * Shape: 7 TOD slots × variable columns × 4 vertical bands + sun-glow.
 * Editorial column counts per slot reflect where the eye notices change:
 * Dawn/Sunrise/Golden/Sunset/Dusk get 4 columns each; Noon and Night
 * stay flat at 1.  Total: 22 columns per palette.
 *
 * Each "column" is one keyframe: an object { horizon, low, mid, high,
 * sunGlow } of hex strings.
 *
 * Runtime resolution: each column lives at a fractional offset (0..1)
 * within its slot's minute range.  Slot ranges = halfway-to-previous
 * slot center → halfway-to-next slot center.  Resolver finds the two
 * adjacent columns by minute-of-day and lerps.
 *
 * Defaults seed-match the canonical hardcoded keyframes in CelestialBodies.jsx
 * so unauthored Looks render identically to today.
 */

import { NAMED_TOD_SLOTS, NAMED_TOD_SLOTS_BY_ID } from './animatedParam.js'
import useCalendar from '../hooks/useCalendar.js'

export const SKY_BANDS = ['horizon', 'low', 'mid', 'high', 'sunGlow']

// Four cardinal year anchors at solstices + equinoxes. Sky authoring is
// keyed per anchor — operator paints a "juice" card per season; runtime
// cyclically lerps between the two flanking anchors by day-of-year.
// Aligned with DawnTimeline.SEASON_ANCHORS and useCalendar.season().
export const SKY_ANCHORS = ['winter', 'spring', 'summer', 'autumn']
export const SKY_ANCHOR_DOY = {
  spring: 79,   // Mar 20
  summer: 172,  // Jun 21
  autumn: 265,  // Sep 22
  winter: 355,  // Dec 21
}
const DAYS_IN_YEAR = 365  // ignore leap-day in anchor math; ±1d is invisible

// Editorial column counts per slot. Fixed; reshape requires a defaults
// regeneration but the data model handles any count >= 1.
export const SKY_SLOT_COLUMNS = {
  dawn:    4,
  sunrise: 4,
  noon:    1,
  golden:  4,
  sunset:  4,
  dusk:    4,
  night:   1,
}

const C = (h) => h  // colors stored as hex strings; runtime resolves to THREE.Color

// Defaults — one column-tuple per cell. Seeded from CelestialBodies.jsx's
// hardcoded keyframes (night / dawnDeep / dawnPeak / dawnEarlyGolden /
// dawnGolden / day / duskGolden / duskEarlyGolden / duskPeak / duskDeep).
// Values match the existing shader's output at corresponding altitudes
// so an un-edited Look renders unchanged.
function bandTuple(horizon, low, mid, high, sunGlow) {
  return { horizon, low, mid, high, sunGlow }
}

export const SKY_DEFAULTS = {
  dawn: [
    bandTuple('#3a2838', '#30254a', '#151838', '#0a0c1a', '#000000'),  // pre-dawn deep
    bandTuple('#4d3245', '#4a3060', '#241e48', '#10122a', '#220c08'),  // deep transitioning
    bandTuple('#7a5048', '#603e62', '#34286e', '#0e1230', '#7a2818'),  // dawnPeak approach
    bandTuple('#c07050', '#885578', '#4a3878', '#141838', '#dd4433'),  // dawnPeak
  ],
  sunrise: [
    bandTuple('#dda065', '#b08088', '#7068b0', '#223060', '#ee7755'),  // dawn early golden
    bandTuple('#d8aa6f', '#aa8898', '#7480b8', '#2c4080', '#ffaa66'),  // mid sunrise
    bandTuple('#d0b888', '#a8a0a8', '#7895c0', '#3a6aaa', '#ffbb77'),  // dawnGolden
    bandTuple('#b8c5b8', '#90b0c8', '#6098d0', '#4080d8', '#ffd1a0'),  // sunrise → noon
  ],
  noon: [
    bandTuple('#9dc5e0', '#80b5e0', '#5a9ce0', '#4a90e0', '#ffeedd'),  // day
  ],
  golden: [
    bandTuple('#a8c0d8', '#88b0d8', '#609bd8', '#4888d8', '#ffe0bb'),  // late noon → golden
    bandTuple('#bcb5a8', '#9aa0b0', '#7095bf', '#3c70b2', '#ffcc88'),  // golden hour
    bandTuple('#ccaa70', '#aa9088', '#7090bb', '#3a68a8', '#ffaa55'),  // duskGolden
    bandTuple('#d09665', '#b08077', '#7080b0', '#2e588f', '#ff9a4a'),  // golden → sunset
  ],
  sunset: [
    bandTuple('#dd8840', '#bb7065', '#6858a0', '#1a2555', '#ff7733'),  // duskEarlyGolden
    bandTuple('#dc7438', '#b06060', '#5848a0', '#172048', '#ff5520'),  // mid sunset
    bandTuple('#cc6030', '#a05058', '#4a3570', '#141835', '#ff3318'),  // duskPeak — electric moment
    bandTuple('#a04a2c', '#704050', '#2e2655', '#0e1228', '#cc2812'),  // sunset → dusk
  ],
  dusk: [
    bandTuple('#7a3828', '#40253a', '#181535', '#0a0c1a', '#882010'),  // duskDeep
    bandTuple('#502a28', '#2a1a30', '#10112a', '#070914', '#3a1008'),  // dusk fading
    bandTuple('#2c2028', '#181420', '#0c0e1a', '#06070e', '#100404'),  // late dusk
    bandTuple('#1a1525', '#0f0f18', '#080810', '#050508', '#000000'),  // dusk → night
  ],
  night: [
    bandTuple('#1a1525', '#0f0f18', '#080810', '#050508', '#000000'),  // night
  ],
}

// Build the per-column minute schedule for a given day's slot minutes.
// slotMinutes: { dawn: <minute>, sunrise: <minute>, ... } from
// getTodSlotMinutes(currentTime).  Returns flat array of
// { slotId, colIdx, minute } sorted by minute, length = 22.
//
// Each slot owns a minute range = midpoint to previous slot → midpoint
// to next slot.  Columns within a slot are evenly spaced inside that
// range, centered.  Wrap-around: night → dawn crosses midnight (handled
// by mod 1440).
export function getSkyColumnMinutes(slotMinutes) {
  const slots = NAMED_TOD_SLOTS.map(s => s.id)
  const minutes = slots.map(id => slotMinutes[id])
  const out = []
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i]
    const cur = minutes[i]
    const prev = minutes[(i - 1 + slots.length) % slots.length]
    const next = minutes[(i + 1) % slots.length]
    // Range half-distances; account for midnight wrap by walking forward.
    let prevHalf = (cur - prev + 1440) % 1440
    let nextHalf = (next - cur + 1440) % 1440
    const start = (cur - prevHalf / 2 + 1440) % 1440
    const end   = (cur + nextHalf / 2) % 1440
    let span = (end - start + 1440) % 1440
    if (span === 0) span = 1
    const cols = SKY_SLOT_COLUMNS[id] || 1
    for (let c = 0; c < cols; c++) {
      // Center each column in its sub-range.
      const f = (c + 0.5) / cols
      const m = (start + f * span) % 1440
      out.push({ slotId: id, colIdx: c, minute: m })
    }
  }
  out.sort((a, b) => a.minute - b.minute)
  return out
}

// Hex → [r, g, b] floats.
function hexToRGB(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

function lerpRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// Detect whether channel.values is the legacy 1-layer shape (top-level keys
// are TOD slot ids like 'dawn'/'sunrise'/etc.) or the 4-anchor shape (top-
// level keys are 'winter'/'spring'/'summer'/'autumn'). Used for tolerant
// reads — both shapes resolve correctly so pre-migration scene.json files
// and inline-default channels continue to work.
function isLegacyOneLayer(values) {
  if (!values || typeof values !== 'object') return true
  // 4-anchor shape: at least one of the SKY_ANCHORS keys present
  for (const a of SKY_ANCHORS) if (values[a]) return false
  return true
}

// Look up a single column's tuple from a specific anchor's card; falls back
// to defaults. Tolerant of both 4-anchor and legacy 1-layer channel shapes.
function tupleAt(channel, anchor, slotId, colIdx) {
  const values = channel?.values
  let card
  if (values && !isLegacyOneLayer(values)) {
    card = values[anchor]
  } else {
    // Legacy 1-layer: every anchor reads the same shared card.
    card = values
  }
  const slotData = card?.[slotId]
  if (Array.isArray(slotData) && slotData[colIdx]) return slotData[colIdx]
  return SKY_DEFAULTS[slotId]?.[colIdx] || SKY_DEFAULTS.night[0]
}

// Cyclic anchor lookup: given dayOfYear, return [anchorA, anchorB, t] where
// the date falls between anchorA's doy and anchorB's doy along the year
// ring. Winter→spring wraps through year-end correctly.
function flankingAnchors(doy) {
  // Sort anchors by doy then walk the ring.
  const ring = SKY_ANCHORS
    .map(a => ({ a, doy: SKY_ANCHOR_DOY[a] }))
    .sort((x, y) => x.doy - y.doy)
  // Walk: find segment where doy ∈ [ring[i].doy, ring[i+1].doy) (cyclic).
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i]
    const next = ring[(i + 1) % ring.length]
    const startDoy = cur.doy
    let endDoy = next.doy
    if (endDoy <= startDoy) endDoy += DAYS_IN_YEAR  // wrap (autumn → winter is OK; winter → spring wraps)
    let probe = doy
    if (probe < startDoy) probe += DAYS_IN_YEAR
    if (probe >= startDoy && probe < endDoy) {
      const span = endDoy - startDoy || 1
      const t = (probe - startDoy) / span
      return [cur.a, next.a, t]
    }
  }
  // Fallback (shouldn't hit) — return summer flat.
  return ['summer', 'summer', 0]
}

// Resolve the band-and-sun-glow palette at a given minute-of-day.
// Returns { horizon, low, mid, high, sunGlow } as [r,g,b] floats.
//
// Year-aware: if `dayOfYear` is omitted, reads from useCalendar so consumers
// don't need to plumb it through. The resolver internally lerps between the
// two flanking seasonal anchor cards before lerping between adjacent minute
// columns.
export function resolveSkyAtMinute(channel, minute, slotMinutes, dayOfYear) {
  const columns = getSkyColumnMinutes(slotMinutes)
  if (columns.length === 0) return null
  // Find adjacent columns by minute (with wrap-around).
  let aIdx = -1
  for (let i = 0; i < columns.length; i++) {
    const next = columns[(i + 1) % columns.length]
    const cur  = columns[i]
    const nextM = next.minute >= cur.minute ? next.minute : next.minute + 1440
    const m = minute >= cur.minute ? minute : minute + 1440
    if (m >= cur.minute && m <= nextM) { aIdx = i; break }
  }
  if (aIdx < 0) aIdx = columns.length - 1
  const bIdx = (aIdx + 1) % columns.length
  const a = columns[aIdx], b = columns[bIdx]
  let aM = a.minute, bM = b.minute, m = minute
  if (bM < aM) bM += 1440
  if (m < aM) m += 1440
  const span = bM - aM || 1
  const t = Math.max(0, Math.min(1, (m - aM) / span))

  // Year-aware anchor resolution. If caller didn't supply doy, read from
  // the kit calendar — this is the single source of truth across helpers.
  const doy = (dayOfYear != null) ? dayOfYear : useCalendar.getState().dayOfYear()
  const [anchorA, anchorB, yT] = flankingAnchors(doy)

  // Per minute-column endpoint, lerp anchor cards first (cyclic year axis),
  // then lerp between minute columns (TOD axis). Two-pass interpolation:
  // first season, then time. Order is commutative under linear interp.
  const sampleCell = (slotId, colIdx) => {
    const cardA = tupleAt(channel, anchorA, slotId, colIdx)
    const cardB = tupleAt(channel, anchorB, slotId, colIdx)
    const out = {}
    for (const k of SKY_BANDS) {
      out[k] = lerpRGB(hexToRGB(cardA[k] || '#000000'), hexToRGB(cardB[k] || '#000000'), yT)
    }
    return out
  }
  const aT = sampleCell(a.slotId, a.colIdx)
  const bT = sampleCell(b.slotId, b.colIdx)

  const out = {}
  for (const k of SKY_BANDS) {
    out[k] = lerpRGB(aT[k], bT[k], t)
  }
  return out
}

// Patch a single anchor's card (a TOD-grid) against SKY_DEFAULTS to fill
// any missing slot or short column array.
function patchCard(card) {
  const safe = (card && typeof card === 'object') ? card : {}
  const out = {}
  for (const id of Object.keys(SKY_DEFAULTS)) {
    const def = SKY_DEFAULTS[id]
    const cur = Array.isArray(safe[id]) ? safe[id] : []
    const merged = []
    for (let i = 0; i < def.length; i++) {
      merged.push(cur[i] || def[i])
    }
    out[id] = merged
  }
  return out
}

// Build the canonical 4-anchor default sky channel. All four anchors get
// identical copies of SKY_DEFAULTS — operator authors per-anchor deviations
// on top. Used by initial store state, bake fallback, and resolver fallback.
export const SKY_DEFAULTS_4ANCHOR = {
  winter: SKY_DEFAULTS,
  spring: SKY_DEFAULTS,
  summer: SKY_DEFAULTS,
  autumn: SKY_DEFAULTS,
}

// Migration entry point. Accepts:
//   - undefined / null / empty           → seeded 4-anchor defaults
//   - legacy 1-layer { values: { dawn: [...], ... } }  → wrap into summer;
//                                                        copy summer to the
//                                                        other three anchors
//                                                        (Jacob's "keep the
//                                                        lovely current LS")
//   - 4-anchor { values: { winter: {...}, spring: ... } } → patch each
//                                                          anchor against
//                                                          SKY_DEFAULTS to
//                                                          fill missing
//                                                          slots/columns
export function migrateSkyChannel(legacy) {
  if (!legacy || !legacy.values) {
    return { values: {
      winter: patchCard(SKY_DEFAULTS),
      spring: patchCard(SKY_DEFAULTS),
      summer: patchCard(SKY_DEFAULTS),
      autumn: patchCard(SKY_DEFAULTS),
    } }
  }
  if (isLegacyOneLayer(legacy.values)) {
    // 1-layer → 4-anchor: the existing authored card becomes summer; the
    // other three anchors mirror it so first-render is visually identical
    // to today across the whole year. Operator deviates per anchor later.
    const summer = patchCard(legacy.values)
    return { values: { winter: summer, spring: summer, summer, autumn: summer } }
  }
  // 4-anchor → 4-anchor: patch each anchor independently.
  const values = {}
  for (const a of SKY_ANCHORS) {
    values[a] = patchCard(legacy.values[a])
  }
  return { values }
}

export const SKY_FLAT_DEFAULTS = SKY_DEFAULTS_4ANCHOR  // alias for store consistency
