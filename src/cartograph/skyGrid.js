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
 * Defaults seed-match the canonical hardcoded keyframes in StageSky.jsx
 * so unauthored Looks render identically to today.
 */

import { NAMED_TOD_SLOTS, NAMED_TOD_SLOTS_BY_ID } from './animatedParam.js'

export const SKY_BANDS = ['horizon', 'low', 'mid', 'high', 'sunGlow']

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

// Defaults — one column-tuple per cell. Seeded from StageSky.jsx's
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

// Look up a single column's tuple from the channel; falls back to defaults.
function tupleAt(channel, slotId, colIdx) {
  const slotData = channel?.values?.[slotId]
  if (Array.isArray(slotData) && slotData[colIdx]) return slotData[colIdx]
  return SKY_DEFAULTS[slotId]?.[colIdx] || SKY_DEFAULTS.night[0]
}

// Resolve the band-and-sun-glow palette at a given minute-of-day.
// Returns { horizon, low, mid, high, sunGlow } as [r,g,b] floats.
export function resolveSkyAtMinute(channel, minute, slotMinutes) {
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

  const aT = tupleAt(channel, a.slotId, a.colIdx)
  const bT = tupleAt(channel, b.slotId, b.colIdx)

  const out = {}
  for (const k of SKY_BANDS) {
    out[k] = lerpRGB(hexToRGB(aT[k] || '#000000'), hexToRGB(bT[k] || '#000000'), t)
  }
  return out
}

// Migration: empty / legacy → seeded defaults.  Defaults are full so
// unauthored Looks render identically to current shader.
export function migrateSkyChannel(legacy) {
  if (!legacy || !legacy.values) {
    return { values: { ...SKY_DEFAULTS } }
  }
  // Patch in any missing slot or short column array from defaults.
  const values = {}
  for (const id of Object.keys(SKY_DEFAULTS)) {
    const def = SKY_DEFAULTS[id]
    const cur = Array.isArray(legacy.values[id]) ? legacy.values[id] : []
    const merged = []
    for (let i = 0; i < def.length; i++) {
      merged.push(cur[i] || def[i])
    }
    values[id] = merged
  }
  return { values }
}

export const SKY_FLAT_DEFAULTS = SKY_DEFAULTS  // alias for store consistency
