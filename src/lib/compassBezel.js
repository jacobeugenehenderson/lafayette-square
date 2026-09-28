// THE COMPASS — one model, one look (BRIEF-compass-bezel).
//
// Jacob, 2026-09-28: "a maxi compass around the part of the map we're looking at." A SCREEN-SPACE dial: in plan it is
// a big ring round the map's viewport; in Street the same dial is a small badge. Ticks (four tiers), the 🔺 north mark,
// E · S · W, each with its own light keyline, glowing after dark. Pure: CompassBezel.jsx draws both sizes from THIS.
//
// ⛔ NOTHING HERE IS A TOWN'S, AND NOTHING HERE IS A PIXEL. Every radial size is a FRACTION of the dial's radius (the
// rim = 1); the spacing is an ANGLE; the divisions and colours are the Look's authored `compass` block over a neutral
// default. The dial reads no town data at all — the town's rim no longer drives the compass.
// ▶ node checks/claims-the-compass-is-one-dial.mjs
//
// Bearings are degrees TRUE, clockwise from north. On the dial, north is up when the view is north-up.

/** The neutral default. A Look overrides any of it under `compass`; nothing here is tuned to a town. */
export const BEZEL_DEFAULTS = Object.freeze({
  // The divisions — ANGLES, so any town reads the same fitted to a screen. Four tiers, finest first:
  // minor every tickDegrees · intermediate every intermediateEvery minors · major every majorEvery
  // minors · cardinal every 90°. tickDegrees must divide 90 so the cardinals land on ticks.
  tickDegrees: 2,
  intermediateEvery: 5,  // 2° × 5 = every 10°
  majorEvery: 15,        // 2° × 15 = every 30°
  // Lengths and widths, as FRACTIONS of the radius, drawn inward from the rim.
  minorLength: 0.012, intermediateLength: 0.022, majorLength: 0.034, cardinalLength: 0.05,
  minorWidth: 0.0016, intermediateWidth: 0.0022, majorWidth: 0.003, cardinalWidth: 0.0045,
  // THE NORTH MARK — only N gets it, in place of its tick. ⭐ ONE DEFINITION: swap the glyph here and it changes
  // everywhere (the rim's texture, Street's dial). Jacob, 2026-09-28: the red triangle emoji, pointing outward.
  northMark: '🔺',
  northSize: 0.12,       // the mark's height, fraction of the dial's radius; its apex on the rim
  northLetter: true,     // a small N under the mark (provisional: frames show it both ways)
  letterSize: 0.045,     // E · S · W (and N's) cap height, fraction of the radius
  letterInset: 0.1,      // letter centre, inward from the rim, fraction of the radius
  // COLOURS — day and night, and the night value IS the glow. The defaults are the Ward's own tokens, never
  // invented: Cary's verdigris (theward-online css/tokens.css --cary-rule: #2F7D63 day / #56B892 night), lent to the
  // compass cardinals by Jacob, 2026-09-28. A Look may author its own — a single colour or a { day, night } pair.
  color: { day: '#2F7D63', night: '#56B892' },
  // The finer ticks recede behind the cardinals: the same hue, less of it.
  opacity: 0.95, majorOpacity: 0.8, intermediateOpacity: 0.6, minorOpacity: 0.4,
  // The halo behind 🔺 at night (an emoji cannot be tinted, so its glow is a halo, not a tint). ⏳ PROPOSED red,
  // not a token yet — Jacob approves it by eye; not amber, which is the Ward's `--live`.
  northHalo: '#E5484D',
  // THE KEYLINE — a thin light line round every mark (ticks, letters, the north mark), so each carries its own
  // contrast over any map beneath it (Warden's ruling, 2026-09-28). Width: a fraction of the dial's radius. Colour: the Ward's own light, theward-online css/tokens.css --ground (#EFE8D8).
  keyline: '#EFE8D8', keylineWidth: 0.0009, keylineOpacity: 0.85,
  // GLOW IN THE DARK — every colourway. After sunset the colour eases day → night over civil twilight, lifted by
  // this gain (past 1 it blooms where the pipeline runs bloom). 1 = the night colour alone.
  nightGlow: 1.3,
})

const CARDINALS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
const norm = (d) => ((d % 360) + 360) % 360

/**
 * The dial, in units of its own radius (rim = 1).
 * @param authored the Look's `compass` block (scene.json), or undefined
 * @returns {{ style, ticks, north, cardinals, face }}
 *   ticks:     [{ bearing, kind: 'minor'|'intermediate'|'major'|'cardinal', inner, outer, width }]
 *   north:     { bearing: 0, glyph, size, r } — the north mark (one glyph), in place of N's tick
 *   cardinals: [{ letter, bearing, r, size }]
 *   face:      { inner, outer } — the ring the marks sit on (the dial's face is a ring: the map shows through its middle)
 */
export function bezelModel(authored) {
  for (const k of Object.keys(authored || {})) {
    if (!(k in BEZEL_DEFAULTS)) throw new Error(`[compassBezel] ⛔ unknown compass field "${k}" (have: ${Object.keys(BEZEL_DEFAULTS).join(' ')})`)
  }
  const s = { ...BEZEL_DEFAULTS, ...authored }
  const n = 360 / s.tickDegrees
  if (!Number.isInteger(n) || !Number.isInteger(90 / s.tickDegrees)) {
    throw new Error(`[compassBezel] ⛔ tickDegrees ${s.tickDegrees} must divide 90 — the cardinals must land on ticks`)
  }
  for (const k of ['intermediateEvery', 'majorEvery']) {
    if (!Number.isInteger(s[k]) || s[k] < 1) throw new Error(`[compassBezel] ⛔ ${k} ${s[k]} must be a whole number ≥ 1`)
  }
  colorPair(s.color)
  if (!(s.nightGlow >= 1)) throw new Error(`[compassBezel] ⛔ nightGlow ${s.nightGlow} must be ≥ 1 — night never dims the compass`)

  const R = 1
  const TIER = {
    minor: [s.minorLength, s.minorWidth], intermediate: [s.intermediateLength, s.intermediateWidth],
    major: [s.majorLength, s.majorWidth], cardinal: [s.cardinalLength, s.cardinalWidth],
  }
  const ticks = []
  for (let i = 0; i < n; i++) {
    const bearing = i * s.tickDegrees
    if (bearing === 0) continue                 // north carries the mark instead
    const kind = bearing % 90 === 0 ? 'cardinal' : i % s.majorEvery === 0 ? 'major' : i % s.intermediateEvery === 0 ? 'intermediate' : 'minor'
    const [len, w] = TIER[kind]
    ticks.push({ bearing, kind, inner: R * (1 - len), outer: R, width: R * w })
  }
  // The north mark: a square of side R·northSize at bearing 0, apex on the rim (the glyph is drawn upright = outward).
  const markSize = R * s.northSize
  const north = { bearing: 0, glyph: s.northMark, size: markSize, r: R - markSize / 2 }
  const cardinals = CARDINALS.filter(([letter]) => letter !== 'N' || s.northLetter).map(([letter, bearing]) => ({
    letter, bearing, size: R * s.letterSize,
    // N sits under its mark; E · S · W at the common inset.
    r: letter === 'N' ? R - markSize - R * s.letterSize * 0.9 : R * (1 - s.letterInset),
  }))
  // The face: from inside the innermost letter to the rim, so every mark sits on it and the map shows through the middle.
  const face = { inner: Math.min(...cardinals.map((c) => c.r - c.size), north.r - north.size / 2) - s.keylineWidth * 4, outer: R }
  return { style: s, ticks, north, cardinals, face }
}

/** "facing north-east" words for a heading — the 8-point name, for a spoken readout. null in, null out. */
export function compassWord(heading) {
  if (!Number.isFinite(heading)) return null
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(norm(heading) / 45) % 8]
}

/** The night lift for a sun altitude (radians): 1 by day, `gain` after civil twilight. Pure. */
export function nightGlowAt(sunAltitudeRad, gain) {
  return 1 + (gain - 1) * nightness(sunAltitudeRad)
}

/** The colour pair a style resolves to: an authored single colour is its own night colour. */
export function colorPair(c) {
  if (typeof c === 'string') return { day: c, night: c }
  if (c && typeof c.day === 'string' && typeof c.night === 'string') return c
  throw new Error(`[compassBezel] ⛔ colour ${JSON.stringify(c)} — a colour string or a { day, night } pair`)
}

/** How far into the night a sun altitude (radians) is: 0 by day, 1 after civil twilight (sun 0° → −6°). Pure. */
export function nightness(sunAltitudeRad) {
  if (!Number.isFinite(sunAltitudeRad)) return 0
  return Math.min(1, Math.max(0, -sunAltitudeRad / (6 * Math.PI / 180)))
}

/** Each tick tier's opacity, from the style. */
export const tierOpacity = (s, kind) => ({ cardinal: s.opacity, major: s.majorOpacity, intermediate: s.intermediateOpacity, minor: s.minorOpacity })[kind]
