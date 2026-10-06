// permanent-id.mjs — a source's PERMANENT building id (NYC's BIN), read the same way by every well that carries it.
// ⛔ NYC serves the BIN as a string ("4029691") in Building Footprints and AddressPoint, and as a NUMBER ("4043753.0")
// in BES: a naive join matched 26 of 2,863 (Boz, measured 2026-10-05). Normalised ONCE, here, to an integer string.
/** "4029691" | 4029691 | "4043753.0" → "4029691"; anything that is not a positive integer → null (counted by callers). */
export function normaliseId(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).trim())
  return Number.isSafeInteger(n) && n > 0 ? String(n) : null
}
