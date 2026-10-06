/**
 * addressKey — ONE canonical form of a street address, read by the bake (cartograph/bake-content.js, the buildings
 * bake's neon faces) and by the player (src/lib/neonPlaces.js), so a listing's words and a 911 point's words meet.
 *
 * ⭐ It canonicalizes SPELLING, never meaning: upper case, punctuation and repeated spaces gone, a street-type word in
 * its long form (RD → ROAD), a direction word in its short form (EAST → E), the unit dropped ("412 B …",
 * "… #2553", "… SUITE 4", "… RD A") and a bracketed aside dropped ("… (SR 6)"). Nothing is guessed: an address with no house number has no house, and a street
 * the tables don't know keeps its own words. Both sides go through this one function, so a word it leaves alone
 * still matches itself.
 * (Lifted out of bake-content.js#normAddress, 2026-10-06, so there is one normaliser and not two that drift.)
 */

const STREET_TYPE = {
  AVE: 'AVENUE', AV: 'AVENUE', BLVD: 'BOULEVARD', ST: 'STREET', RD: 'ROAD', DR: 'DRIVE', LN: 'LANE', PL: 'PLACE',
  CT: 'COURT', TER: 'TERRACE', PKWY: 'PARKWAY', BND: 'BEND', HWY: 'HIGHWAY', CIR: 'CIRCLE', TRL: 'TRAIL',
  SQ: 'SQUARE', EXPY: 'EXPRESSWAY', FWY: 'FREEWAY', ALY: 'ALLEY', XING: 'CROSSING',
}
const DIRECTION = { NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW' }
const DIRECTION_SHORT = new Set(Object.values(DIRECTION))

const words = (s) => s.toUpperCase()
  .replace(/\([^)]*\)/g, ' ')                          // a bracketed aside: "… RD WEST (SR 6)"
  .replace(/,.*$/, '')                                  // ", Huron, OH 44839"
  .replace(/\b(APT|UNIT|STE|SUITE|BLDG|FL|FLOOR)\b\.?\s*\S*\s*$/, '')   // a trailing unit
  .replace(/#\s*\S*\s*$/, '')
  .replace(/[.'’]/g, '').replace(/[^A-Z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)

const canon = (w) => STREET_TYPE[w] || DIRECTION[w] || w

/** A street name's canonical form ("Cleveland Rd East" → "CLEVELAND ROAD E"), or null. */
export function streetKey(street) {
  if (!street) return null
  const ws = words(String(street)).map(canon)
  // A trailing lone letter that is not a direction is a unit ("421 BERLIN RD A").
  while (ws.length > 1 && /^[A-Z]$/.test(ws[ws.length - 1]) && !DIRECTION_SHORT.has(ws[ws.length - 1])) ws.pop()
  return ws.length ? ws.join(' ') : null
}

/** { house, street } — house is the leading number (null when the address has none), street its streetKey. */
export function addressParts(addr) {
  if (!addr) return { house: null, street: null }
  const ws = words(String(addr))
  let house = null
  if (/^\d+[A-Z]?$/.test(ws[0] || '')) {
    house = ws.shift().replace(/[A-Z]$/, '')
    if (ws[0] === house) ws.shift()                      // "7222 7222 WISE AVE"
    if (/^[A-Z]$/.test(ws[0] || '') && !DIRECTION_SHORT.has(ws[0]) && ws.length > 1) ws.shift()   // "412 B CLEVELAND…"
  }
  return { house, street: streetKey(ws.join(' ')) }
}

/** The whole address as one canonical string ("414 CLEVELAND ROAD E"); the street alone when it has no house. */
export function addressKey(addr) {
  const { house, street } = addressParts(addr)
  if (!street) return null
  return house ? `${house} ${street}` : street
}

/**
 * A street's LOOSE form — spaces and a leading or trailing direction word ignored ("MC KINLEY STREET" ≡ "MCKINLEY
 * STREET", "S MAIN STREET" ≡ "MAIN STREET"). ⚠️ Only for matching within ONE building's own streets, where two
 * different streets cannot differ only this way; never as a town-wide key.
 */
export function streetLoose(street) {
  if (!street) return null
  const ws = street.split(' ')
  while (ws.length > 1 && DIRECTION_SHORT.has(ws[0])) ws.shift()
  while (ws.length > 1 && DIRECTION_SHORT.has(ws[ws.length - 1])) ws.pop()
  return ws.join('')
}
