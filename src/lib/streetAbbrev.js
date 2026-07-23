// streetAbbrev.js — shared, data-driven street-name abbreviation.
//
// The label fit-gate shortens a name only as much as it must to fit the straight
// run available (least abbreviation that fits, stepwise). This is the single
// canonical table + abbreviator behind that — case-insensitive match on WORD
// BOUNDARIES, emitting the canonical casing. Extend the tables when a poured
// town surfaces a token they lack; never scatter string checks (the brief:
// "keep it a shared, data-driven table").
//
// The stepwise ladder (see abbreviateName):
//   L0 full name → L1 +suffix → L2 +suffix +directional → L3 +suffix +directional
//   +prefix (Saint/Mount/Fort) → still overflows ⇒ caller drops.

// Last-token generic suffix. `Street→St` here is the SUFFIX form; `Saint→St.`
// (prefix, below) keeps its dot so position disambiguates the two.
export const SUFFIX = {
  alley: 'Aly', avenue: 'Ave', boulevard: 'Blvd', bridge: 'Br', circle: 'Cir',
  court: 'Ct', cove: 'Cv', crescent: 'Cres', crossing: 'Xing', drive: 'Dr',
  expressway: 'Expy', freeway: 'Fwy', gardens: 'Gdns', grove: 'Grv', heights: 'Hts',
  highway: 'Hwy', junction: 'Jct', lane: 'Ln', loop: 'Loop', parkway: 'Pkwy',
  place: 'Pl', plaza: 'Plz', point: 'Pt', road: 'Rd', route: 'Rte',
  square: 'Sq', street: 'St', terrace: 'Ter', trail: 'Trl', turnpike: 'Tpke',
  walk: 'Walk', way: 'Way',
}

// First- OR last-token directional.
export const DIRECTIONAL = {
  north: 'N', south: 'S', east: 'E', west: 'W',
  northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW',
}

// First-token honorific prefix. `Saint→St.` (with the dot) — distinct from the
// `Street` suffix `St`.
export const PREFIX = { saint: 'St.', mount: 'Mt', fort: 'Ft' }

export const MAX_ABBREV_LEVEL = 3

const lc = t => t.toLowerCase()

/**
 * Apply the least-to-most abbreviation ladder up to `level`.
 * @param {string} name
 * @param {0|1|2|3} level  0 full · 1 +suffix · 2 +directional · 3 +prefix
 * @returns {string}
 */
export function abbreviateName(name, level) {
  const tokens = String(name).trim().split(/\s+/)
  const n = tokens.length
  if (n === 0 || level <= 0) return tokens.join(' ')
  const out = tokens.slice()

  // L1 — suffix (last token).
  if (level >= 1 && SUFFIX[lc(out[n - 1])]) out[n - 1] = SUFFIX[lc(out[n - 1])]

  // L2 — directional (first token, and last token if it wasn't the suffix).
  if (level >= 2) {
    if (DIRECTIONAL[lc(out[0])]) out[0] = DIRECTIONAL[lc(out[0])]
    if (n > 1 && DIRECTIONAL[lc(out[n - 1])]) out[n - 1] = DIRECTIONAL[lc(out[n - 1])]
  }

  // L3 — honorific prefix (first token).
  if (level >= 3 && PREFIX[lc(out[0])]) out[0] = PREFIX[lc(out[0])]

  return out.join(' ')
}
