/**
 * units.mjs — source scalars → OUR units. One home, because two writers had two answers.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR. chassis.size is METRES (betula_nigra is authored 14 with
 * canopyRadiusM 7, and normalizeScale bakes it as metres). Every botanical source ships
 * FEET. hydrate learned to convert; mint kept a raw parseFloat, so the same species got
 * 24.4 from one writer and 80 from the other depending on which ran last — and only
 * claims-dossier-writers-agree noticed.
 *
 * Three things go wrong in a size field and only one of them is botanical:
 *   UNIT    — feet written into a metre axis. 30 ft is a flowering dogwood; 30 m is a tree
 *             three times too tall, baked into the slab.
 *   SUBJECT — NCSU `Dimensions` emits "Height: …" AND "Width: …". Reading both as size made
 *             half the apparent disagreement a width against a height.
 *   BOUND   — parseFloat("60 ft. 0 in. - 80 ft. 0 in.") takes 60, the LOW end, while
 *             SelecTree ships `height_high` and USDA ships `Height, Mature`. Not
 *             commensurable, so sources looked like they disagreed when they did not.
 *
 * ⚠️ What remains after all three are fixed IS real, and it is a difference of QUESTION,
 * not of fact: USDA's `Height, Mature` is the maximum a species attains in the wild
 * (eastern white pine 45.7 m), while NCSU and SelecTree publish typical landscape size
 * (24.4 m). Both correct. USDA reads higher on 11 of the 17 species where they overlap.
 * ⛔ Do NOT resolve that by preferring a source — that rule is dead. Candidates carry
 * `askedAs` so the operator settles it knowing which question each number answered.
 */

export const FT_TO_M = 0.3048

/** Axes whose sources publish feet and whose rubric unit is metres. */
export const FEET_AXES = new Set(['chassis.size', 'crown.base_height'])

/**
 * Parse a source's size string to METRES.
 * @returns {number|null} null REFUSES the value — it is not a height at all, or is
 *   unparseable. ⛔ Never a guess: the caller discards it with a counted reason.
 */
export function parseSizeMetres(raw) {
  const t = String(raw).trim()
  // NCSU prefixes the subject. A Width row is a different measurement, not a weaker one.
  if (/^\s*width\s*:/i.test(t)) return null
  const body = t.replace(/^\s*height\s*:\s*/i, '')
  // "60 ft. 0 in. - 80 ft. 0 in." → take the HIGH bound, because that is the quantity the
  // other two sources publish. Picking the low bound is what made them incomparable.
  const feetInches = [...body.matchAll(/(\d+(?:\.\d+)?)\s*ft\.?\s*(?:(\d+(?:\.\d+)?)\s*in\.?)?/gi)]
  if (feetInches.length) {
    const vals = feetInches.map(m => parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0))
    return Math.max(...vals) * FT_TO_M
  }
  const n = parseFloat(body.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return null
  return n * FT_TO_M          // bare numbers from these sources are feet
}

/** Rounded to 0.1 m — the precision the sources actually justify. */
export const sizeMetres = (raw) => {
  const m = parseSizeMetres(raw)
  return m == null ? null : Math.round(m * 10) / 10
}
