/**
 * THE TOWN'S IDENTITY — how the town looks, one home: the Look's `design.json` `identity` block, authored in
 * Cartograph's Identity panel, carried into `scene.json` by cartograph/bake-scene.js and published in the town's
 * manifest `look` block by cartograph/bake-manifest.mjs (Warden's ruling, 2026-09-28). Pure; the bake, the manifest
 * and the renderer all import it.
 *
 *   mark        the town's emoji mark (avatar, load screen, tab)
 *   accent      the Ward's chrome accent, '#rrggbb'
 *   ratingMark  the emoji the town rates with (the Ward draws it in a vignette)
 *   litTint     { color: '#rrggbb', strength: 0..1 } — the roof tint of a lit set and the selected building
 *
 * ⛔ A channel the town has not chosen is the kit's NEUTRAL value below — no town's — and is published with
 *    `<channel>Authored: false`, so the Ward says so. `null` neutral = the kit has no value: the reader reports it.
 * ⛔ A malformed channel throws at the bake, naming the town and the channel; it is never repaired.
 * Not here: a town's name and locale (who it is — its instance), its category neon (materialColors.neon_*, read by
 * src/lib/categoryColor.js), its label style (src/lib/labelStyle.js).
 * ▶ node checks/claims-a-towns-identity-is-its-own.mjs
 */

export const IDENTITY_CHANNELS = ['mark', 'accent', 'ratingMark', 'litTint']

/** The kit's neutral identity. `accent: null` — the kit has not chosen one yet (Jacob's eye). */
export const IDENTITY_NEUTRAL = {
  mark: null,
  accent: null,
  ratingMark: '⭐',
  litTint: { color: '#f2c14e', strength: 0.45 },
}

const HEX = /^#[0-9a-f]{6}$/i
const oneEmoji = (s) => typeof s === 'string'
  && [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length === 1
  && /\p{Extended_Pictographic}/u.test(s)

const VALID = {
  mark: (v) => oneEmoji(v) || 'one emoji',
  accent: (v) => HEX.test(v) || "'#rrggbb'",
  ratingMark: (v) => oneEmoji(v) || 'one emoji',
  litTint: (v) => (v && typeof v === 'object' && HEX.test(v.color) && Number.isFinite(v.strength) && v.strength >= 0 && v.strength <= 1
    && Object.keys(v).every((k) => k === 'color' || k === 'strength')) || "{ color: '#rrggbb', strength: 0..1 }",
}

/** The authored block, checked. Throws on an unknown channel or a malformed value; returns only authored channels. */
export function validateIdentity(block, where) {
  if (block == null) return {}
  if (typeof block !== 'object' || Array.isArray(block)) throw new Error(`${where}: identity must be an object`)
  const out = {}
  for (const [k, v] of Object.entries(block)) {
    if (!VALID[k]) throw new Error(`${where}: identity.${k} is not an identity channel (${IDENTITY_CHANNELS.join(', ')})`)
    if (v == null) continue
    const ok = VALID[k](v)
    if (ok !== true) throw new Error(`${where}: identity.${k} = ${JSON.stringify(v)} — must be ${ok}`)
    out[k] = v
  }
  return out
}

/** What a town shows: each channel's authored value, else the kit's neutral one, with `<channel>Authored`. */
export function resolveIdentity(authored) {
  const out = {}
  for (const k of IDENTITY_CHANNELS) {
    const has = authored?.[k] != null
    out[k] = has ? authored[k] : IDENTITY_NEUTRAL[k]
    out[`${k}Authored`] = has
  }
  return out
}
