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
 * ⭐ RESOLVED 2026-08-25 (Jacob): "why not have separate columns?" — three questions get
 * three axes, so none of them has to lose. chassis.size is TYPICAL LANDSCAPE height (what
 * we place), chassis.size_max is the MAXIMUM ATTAINABLE (USDA), chassis.size_20yr is the
 * juvenile figure that had been sitting in the corpus unmapped since the first harvest.
 * The contested cell was never a disagreement — it was three answers crammed into one
 * column. Candidates still carry `askedAs` for the real disagreements that remain.
 */

export const FT_TO_M = 0.3048

/** Axes whose sources publish feet and whose rubric unit is metres. */
// ⛔ DERIVED FROM THE RUBRIC, never restated. The rubric now DECLARES `unit` on every
// scalar axis (claims-axis-keys-resolve asserts it), so this list cannot drift from the
// axes it converts — which is how a metre axis came to hold feet in the first place.
// ⚠️ It is the source that ships feet, not the axis: an axis in metres whose sources
// publish metres would need no entry here. Today every botanical source ships feet.
import { readFileSync } from 'node:fs'
const rubricPath = new URL('./rubric.json', import.meta.url)
export const FEET_AXES = new Set(
  (JSON.parse(readFileSync(rubricPath, 'utf8')).axes || [])
    .filter(a => a.kind === 'scalar' && a.unit === 'm')
    .map(a => a.id))

/**
 * Parse a source's size string to METRES.
 * @returns {number|null} null REFUSES the value — it is not a height at all, or is
 *   unparseable. ⛔ Never a guess: the caller discards it with a counted reason.
 */
/**
 * ⭐⭐ THE RANGE IS THE ANSWER, NOT NOISE AROUND IT (Jacob, 2026-08-25).
 * NCSU publishes `Height: 80 ft. - 120 ft.` — that is the species' natural size BAND, and
 * a tuliptree placed 300 times should be 300 sizes inside it. Taking the high bound threw
 * half the measurement away, and then two sources' HIGHS looked like a disagreement to
 * settle when they were only two points in one range.
 * @returns {{lo:number,hi:number}|null} both bounds in METRES. A single value yields
 *   lo === hi — honest: that source published a point, not a band.
 */
export function parseSizeBandMetres(raw, declaredUnit) {
  const t = String(raw).trim()
  if (/^\s*width\s*:/i.test(t)) return null
  const body = t.replace(/^\s*height\s*:\s*/i, '')
  const toM = (n) => {
    const u = declaredUnit == null ? 'ft' : String(declaredUnit).trim().toLowerCase()
    if (u === 'm' || u.startsWith('met')) return n
    if (u === 'cm') return n / 100
    if (u === 'ft' || u === 'feet' || u === 'foot') return n * FT_TO_M
    return null                      // ⛔ a unit we do not understand is a refusal
  }
  const fi = [...body.matchAll(/(\d+(?:\.\d+)?)\s*ft\.?\s*(?:(\d+(?:\.\d+)?)\s*in\.?)?/gi)]
  let vals
  if (fi.length) vals = fi.map(m => parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0)).map(v => v * FT_TO_M)
  else {
    const nums = [...body.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0])).filter(Number.isFinite)
    if (!nums.length) return null
    vals = nums.map(toM).filter(v => v != null)
  }
  if (!vals.length) return null
  const r1 = (v) => Math.round(v * 10) / 10
  return { lo: r1(Math.min(...vals)), hi: r1(Math.max(...vals)) }
}

/**
 * Merge every source's band into ONE band: the widest span any source claims.
 * ⛔ Not an average and not a vote — a UNION. Two sources saying 24.4 and 36.6 are not
 * disagreeing; they are each naming a point in the same population.
 */
export function mergeBands(bands) {
  const ok = bands.filter(Boolean)
  if (!ok.length) return null
  return { lo: Math.min(...ok.map(b => b.lo)), hi: Math.max(...ok.map(b => b.hi)) }
}

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

/**
 * Rounded to 0.1 m — the precision the sources actually justify.
 *
 * ⛔⛔ HONOUR THE OBSERVATION'S OWN UNIT. The comment above FEET_AXES states the rule —
 * "it is the source that ships feet, not the axis" — and this function did the opposite,
 * keying conversion off the AXIS alone. The Urban Tree Database emits `unit: 'm'` per row,
 * so the moment its fields were mapped a 2.5 m crown base would have become 0.8 m: the
 * original feet-in-a-metre-axis bug, reproduced by the fix for it. Found by the
 * adversarial pass BEFORE the mapping landed, which is the only reason it never shipped.
 *
 * @param declaredUnit the observation's own `unit`, when it has one. Absent means the
 *   source did not say, and today every botanical source that does not say ships feet —
 *   which is a fact about the sources we have, ⛔ not a licence to guess. When a source
 *   declares something we do not understand, REFUSE rather than assume.
 */
export const sizeMetres = (raw, declaredUnit) => {
  if (declaredUnit != null) {
    const u = String(declaredUnit).trim().toLowerCase()
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n)) return null
    if (u === 'm' || u === 'metre' || u === 'meter' || u === 'metres' || u === 'meters') return Math.round(n * 10) / 10
    if (u === 'ft' || u === 'feet' || u === 'foot') return Math.round(n * FT_TO_M * 10) / 10
    if (u === 'cm') return Math.round((n / 100) * 10) / 10
    return null                     // ⛔ an undeclared-to-us unit is a refusal, not a guess
  }
  const m = parseSizeMetres(raw)
  return m == null ? null : Math.round(m * 10) / 10
}
