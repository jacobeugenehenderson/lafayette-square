/**
 * SUGGEST FROM MARK — Stage's Identity panel proposes an accent, a lit tint and a category neon set from the colours of
 * the town's chosen emoji (Jacob, 2026-09-28). ⛔ AUTHORING-TIME ONLY: it runs in Stage on the operator's device, the
 * operator sees, adjusts and saves, and what ships is plain hex in the Look — "the emoji color scheme would never be
 * live". Nothing on a visitor's device imports this (▶ node checks/claims-the-mark-palette-is-never-live.mjs).
 *
 * Pure: ink pixels in (src/lib/glyphInk.js, measured on the operator's device), a proposal out. Every proposed colour
 * obeys the same policy as a hand-picked one (src/lib/colourPolicy.js): the HARD tier (accent 7:1, every chip 3:1 on
 * the player's grounds) is met by the nearest passing colour; closeness to a meaning colour is ADVISED, never bent.
 * A mark with no colour proposes the Ward's DEFAULT scheme, labelled as such — explicit, for the operator to accept.
 * ▶ node checks/claims-a-suggested-palette-passes.mjs
 */
import { rgbToOklab, oklabToRgb, oklchToOklab, oklabToOklch, rgbToHex, hexToRgb, deltaE } from '../lib/colourMath.js'
import { CONTRAST } from '../tokens/playerChrome.js'
import { NEUTRAL_CATEGORY_NEON } from '../lib/categoryColor.js'
import { IDENTITY_NEUTRAL } from '../lib/townIdentity.js'
import { gamutChroma, nearestPassing, accentPolicy, neonPolicy, litTintPolicy } from '../lib/colourPolicy.js'

// ── the numbers, each with its reason ───────────────────────────────────────────────────────────────────────────
/** An ink pixel with OKLCH chroma below this is grey (outline, shading, a metal's highlight), not the mark's colour. */
export const GREY_CHROMA = 0.03
/** Less than this share of the ink in colour → the mark has no colour to suggest from. */
export const MIN_COLOUR_SHARE = 0.05
/** The accent's chroma ceiling: Lafayette Square's approved accent #D9B25A sits at OKLCH C 0.116 — the chrome stays that restrained. */
export const ACCENT_MAX_CHROMA = 0.12
/** The neutral set's own closest pair (OKLab ΔE): a suggested neon set keeps its categories at least this far apart. */
export const D_SEP = (() => {
  const hexes = Object.values(NEUTRAL_CATEGORY_NEON); let m = Infinity
  for (let i = 0; i < hexes.length; i++) for (let j = i + 1; j < hexes.length; j++) m = Math.min(m, deltaE(hexes[i], hexes[j]))
  return m
})()

const oklchOf = (hex) => oklabToOklch(rgbToOklab(hexToRgb(hex)))
const hexOfOklch = ([L, C, h]) => rgbToHex(oklabToRgb(oklchToOklab([L, C, h])))
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

// ── the mark's colours ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * Ink → the mark's colour clusters, ranked by area × chroma. `ink` is [[r, g, b, weight?], …].
 * k-means in OKLab (k ≤ 4), seeded deterministically by farthest point from the most chromatic pixel.
 */
export function markColours(ink) {
  const px = ink.map(([r, g, b, w = 1]) => ({ lab: rgbToOklab([r, g, b]), w }))
  const total = px.reduce((s, p) => s + p.w, 0)
  const colour = px.filter((p) => Math.hypot(p.lab[1], p.lab[2]) >= GREY_CHROMA)
  const colourShare = colour.reduce((s, p) => s + p.w, 0) / total
  if (colourShare < MIN_COLOUR_SHARE) return { none: `this mark has no colour (${(colourShare * 100).toFixed(1)}% of its ink is coloured)`, colourShare }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const seeds = [colour.reduce((a, p) => (Math.hypot(p.lab[1], p.lab[2]) > Math.hypot(a.lab[1], a.lab[2]) ? p : a)).lab]
  while (seeds.length < Math.min(4, colour.length)) {
    const far = colour.reduce((a, p) => { const d = Math.min(...seeds.map((s) => dist(s, p.lab))); return d > a.d ? { d, lab: p.lab } : a }, { d: -1 })
    if (far.d < 0.04) break                                  // no distinct colour left: fewer clusters, not invented ones
    seeds.push(far.lab)
  }
  let centres = seeds, groups
  for (let it = 0; it < 20; it++) {
    groups = centres.map(() => ({ w: 0, s: [0, 0, 0] }))
    for (const p of colour) {
      let k = 0
      for (let j = 1; j < centres.length; j++) if (dist(centres[j], p.lab) < dist(centres[k], p.lab)) k = j
      groups[k].w += p.w; for (let c = 0; c < 3; c++) groups[k].s[c] += p.lab[c] * p.w
    }
    centres = groups.map((g, j) => (g.w ? g.s.map((v) => v / g.w) : centres[j]))
  }
  const clusters = centres.map((lab, j) => {
    const [L, C, h] = oklabToOklch(lab)
    return { hex: rgbToHex(oklabToRgb(lab)), L, C, h, share: groups[j].w / total }
  }).filter((c) => c.share > 0).sort((a, b) => b.share * b.C - a.share * a.C)
  return { clusters, colourShare }
}

// ── the proposal ──────────────────────────────────────────────────────────────────────────────────────────────
/** The Ward's default scheme: the accent un-chosen (the player's own neutral shows), the kit's neutral tint and neon. */
function wardDefault(why) {
  return {
    none: why,
    default: {
      accent: null,
      litTint: { ...IDENTITY_NEUTRAL.litTint, ...litTintPolicy(IDENTITY_NEUTRAL.litTint) },
      neon: Object.fromEntries(Object.entries(NEUTRAL_CATEGORY_NEON).map(([k, hex]) => [k, neonPolicy(hex)])),
    },
  }
}

export function suggestFromMark(ink) {
  const m = markColours(ink)
  if (m.none) return wardDefault(`${m.none}; here is the Ward's default`)
  const [first, second] = m.clusters

  // Accent — the mark's leading colour, restrained in chroma, then the NEAREST colour that reads as text on every
  // ground (the hard tier) — the same rule a hand-picked accent meets.
  const raw = hexOfOklch([first.L, gamutChroma(first.L, Math.min(first.C, ACCENT_MAX_CHROMA), first.h), first.h])
  const accent = accentPolicy(nearestPassing(raw, CONTRAST.text) ?? raw)

  // Lit tint — the mark's second colour (else its first), at the neutral tint's own lightness and strength: a lit roof
  // lifts the way the neutral one does; only the hue and chroma are the town's. On the map: advisory only.
  const [nL, nC] = oklchOf(IDENTITY_NEUTRAL.litTint.color)
  const tintSrc = second ?? first
  const tint = { color: hexOfOklch([nL, gamutChroma(nL, Math.min(tintSrc.C, nC), tintSrc.h), tintSrc.h]), strength: IDENTITY_NEUTRAL.litTint.strength }
  const litTint = { ...tint, ...litTintPolicy(tint) }

  // Neon — the kit's neutral set (its spacing and each slot's lightness and chroma) rotated so the slot nearest the
  // mark's hue lands exactly on it.
  const slots = Object.entries(NEUTRAL_CATEGORY_NEON).map(([id, hex]) => ({ id, lch: oklchOf(hex) }))
  const anchor = slots.reduce((a, s) => (hueGap(s.lch[2], first.h) < hueGap(a.lch[2], first.h) ? s : a))
  const rotation = (((first.h - anchor.lch[2]) % 360) + 360) % 360
  return { clusters: m.clusters, colourShare: m.colourShare, accent, litTint, neon: neonSet(slots, rotation), anchor: anchor.id, rotation }
}

function neonSet(slots, rotation) {
  const set = slots.map(({ id, lch: [L, C, h0] }) => {
    const h = (((h0 + rotation) % 360) + 360) % 360
    return { id, C, h, hex: hexOfOklch([L, gamutChroma(L, C, h), h]), flags: [] }
  })
  // Rotating moves slots against the sRGB gamut edge, which can pull two closer than the neutral set ever stands.
  // Separate them by LIGHTNESS only (hue is the mark's): lift the lighter of the pair until they clear D_SEP; a pair
  // that cannot is flagged, not hidden.
  for (let pass = 0; pass < 60; pass++) {
    let worst = null
    for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) {
      const d = deltaE(set[i].hex, set[j].hex)
      if (d < D_SEP - 1e-9 && (!worst || d < worst.d)) worst = { d, i, j }
    }
    if (!worst) break
    const [a, b] = [set[worst.i], set[worst.j]]
    const up = oklchOf(a.hex)[0] >= oklchOf(b.hex)[0] ? a : b
    const L = oklchOf(up.hex)[0] + 0.01
    if (L > 0.99) { up.flags.push(`cannot stand ${D_SEP.toFixed(3)} from its neighbour by lightness alone`); break }
    up.hex = hexOfOklch([L, gamutChroma(L, up.C, up.h), up.h])
  }
  // Each category under the policy: its chip held to the hard floor (nearest passing if not), the tube left to the map.
  const out = {}
  for (const n of set) {
    const p = neonPolicy(n.hex)
    out[n.id] = p.ok ? { ...p, flags: n.flags } : { ...neonPolicy(p.nearest), flags: [...n.flags, `chip lifted to clear ${p.floor}:1`] }
  }
  return out
}
