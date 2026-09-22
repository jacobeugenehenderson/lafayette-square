/**
 * Category taxonomy — single source of truth.
 *
 * Consumed by: SidePanel, PlaceCard, useLandmarkFilter, neon bands, QR styling, CodeDesk.
 * Each category defines: label, subtitle, emoji, Tailwind color key, hex for Three.js,
 * Tailwind class set, and subcategories.
 *
 * Victorian palette:
 *   Claret (#C2185B)      — dining      — wine, mahogany dining rooms
 *   Antique Gold (#D4A337) — historic   — gilt frames, gas lamps
 *   Aubergine (#8E4585)   — arts        — theater velvet, drapery
 *   Verdigris (#3DAF8A)   — parks       — oxidized copper, conservatory patina
 *   Mauve (#C27F94)       — shopping    — 1890s "Mauve Decade", Morris textiles
 *   Prussian Blue (#3674A5) — services  — ink, ledger blue
 *   Terra Cotta (#B86B4A) — community   — brick churches, civic buildings
 *   Sage (#7A8B6F)        — residential — Victorian garden greens, domestic
 *
 * NOTE: Tailwind class strings use arbitrary values (e.g. bg-[#C2185B]/10)
 * spelled out explicitly so the Tailwind purger can detect them at build time.
 */

const CATEGORIES = {
  dining: {
    label: 'Dining & Drinks',
    subtitle: 'Restaurants, bars, cafes, dessert',
    emoji: '\ud83c\udf7d\ufe0f',
    tw: 'claret',
    hex: '#C2185B',
    classes: {
      bg: 'bg-[#C2185B]/10',
      border: 'border-[#C2185B]/20',
      text: 'text-[#C2185B]',
      hover: 'hover:bg-[#C2185B]/15',
      dot: 'bg-[#C2185B]',
      activeBg: 'bg-[#C2185B]/20',
    },
    subcategories: {
      restaurants: { label: 'Restaurants', emoji: '\ud83c\udf7d\ufe0f' },
      bars:        { label: 'Bars & Wine', emoji: '\ud83c\udf78' },
      cafes:       { label: 'Cafes & Coffee', emoji: '\u2615' },
      desserts:    { label: 'Dessert & Treats', emoji: '\ud83c\udf70' },
    },
  },
  historic: {
    label: 'Historic Sites',
    subtitle: 'Landmarks, notable homes, markers',
    emoji: '\ud83c\udfdb\ufe0f',
    tw: 'gold',
    hex: '#D4A337',
    classes: {
      bg: 'bg-[#D4A337]/10',
      border: 'border-[#D4A337]/20',
      text: 'text-[#D4A337]',
      hover: 'hover:bg-[#D4A337]/15',
      dot: 'bg-[#D4A337]',
      activeBg: 'bg-[#D4A337]/20',
    },
    subcategories: {
      landmarks:      { label: 'Landmarks', emoji: '\ud83c\udfdb\ufe0f' },
      'notable-homes': { label: 'Notable Homes', emoji: '\ud83c\udfe0' },
      markers:        { label: 'Historic Markers', emoji: '\ud83d\udcdc' },
    },
  },
  arts: {
    label: 'Arts & Culture',
    subtitle: 'Galleries, studios, tattoo, venues',
    emoji: '\ud83c\udfad',
    tw: 'aubergine',
    hex: '#8E4585',
    classes: {
      bg: 'bg-[#8E4585]/10',
      border: 'border-[#8E4585]/20',
      text: 'text-[#8E4585]',
      hover: 'hover:bg-[#8E4585]/15',
      dot: 'bg-[#8E4585]',
      activeBg: 'bg-[#8E4585]/20',
    },
    subcategories: {
      galleries: { label: 'Galleries', emoji: '\ud83d\uddbc\ufe0f' },
      studios:   { label: 'Studios', emoji: '\ud83c\udfa8' },
      venues:    { label: 'Venues', emoji: '\ud83c\udfb5' },
      tattoo:    { label: 'Tattoo & Body Art', emoji: '\ud83e\ude78' },
    },
  },
  parks: {
    label: 'Parks & Recreation',
    subtitle: 'Lafayette Park, gardens, pool, playgrounds',
    emoji: '\ud83c\udf33',
    tw: 'verdigris',
    hex: '#3DAF8A',
    classes: {
      bg: 'bg-[#3DAF8A]/10',
      border: 'border-[#3DAF8A]/20',
      text: 'text-[#3DAF8A]',
      hover: 'hover:bg-[#3DAF8A]/15',
      dot: 'bg-[#3DAF8A]',
      activeBg: 'bg-[#3DAF8A]/20',
    },
    subcategories: {
      parks:       { label: 'Parks', emoji: '\ud83c\udf33' },
      gardens:     { label: 'Gardens', emoji: '\ud83c\udf3a' },
      recreation:  { label: 'Pool & Recreation', emoji: '\ud83c\udfca' },
    },
  },
  shopping: {
    label: 'Shopping',
    subtitle: 'Boutiques, antiques, florist, grocery',
    emoji: '\ud83d\udecd\ufe0f',
    tw: 'mauve',
    hex: '#C27F94',
    classes: {
      bg: 'bg-[#C27F94]/10',
      border: 'border-[#C27F94]/20',
      text: 'text-[#C27F94]',
      hover: 'hover:bg-[#C27F94]/15',
      dot: 'bg-[#C27F94]',
      activeBg: 'bg-[#C27F94]/20',
    },
    subcategories: {
      boutiques:      { label: 'Boutiques', emoji: '\ud83d\udc57' },
      antiques:       { label: 'Antiques', emoji: '\ud83c\udffa' },
      'local-makers': { label: 'Local Makers', emoji: '\ud83d\udecd\ufe0f' },
      grocery:        { label: 'Grocery', emoji: '\ud83d\uded2' },
      pets:           { label: 'Pets', emoji: '\ud83d\udc3e' },
      florist:        { label: 'Florist', emoji: '\ud83c\udf3b' },
      furniture:      { label: 'Home & Furniture', emoji: '\ud83e\uddf3' },
      pharmacy:       { label: 'Pharmacy', emoji: '\ud83d\udc8a' },
      discount:       { label: 'Discount & General', emoji: '\ud83c\udff7\ufe0f' },
      wellness:       { label: 'Wellness & CBD', emoji: '\ud83c\udf3f' },
    },
  },
  services: {
    label: 'Services',
    subtitle: 'Beauty, cleaners, professional, health',
    emoji: '\ud83d\udd27',
    tw: 'prussian',
    hex: '#3674A5',
    classes: {
      bg: 'bg-[#3674A5]/10',
      border: 'border-[#3674A5]/20',
      text: 'text-[#3674A5]',
      hover: 'hover:bg-[#3674A5]/15',
      dot: 'bg-[#3674A5]',
      activeBg: 'bg-[#3674A5]/20',
    },
    subcategories: {
      medical:              { label: 'Medical', emoji: '\ud83c\udfe5' },
      health:               { label: 'Health & Wellness', emoji: '\ud83e\ude7a' },
      legal:                { label: 'Legal', emoji: '\u2696\ufe0f' },
      financial:            { label: 'Financial', emoji: '\ud83c\udfe6' },
      beauty:               { label: 'Beauty & Salon', emoji: '\ud83d\udc87' },
      fitness:              { label: 'Fitness', emoji: '\ud83c\udfcb\ufe0f' },
      'real-estate':        { label: 'Real Estate', emoji: '\ud83c\udfe1' },
      tax:                  { label: 'Tax & Accounting', emoji: '\ud83d\udcca' },
      architecture:         { label: 'Architecture & Design', emoji: '\ud83d\udcd0' },
      advertising:          { label: 'Advertising & Media', emoji: '\ud83d\udcf0' },
      industrial:           { label: 'Industrial', emoji: '\ud83c\udfed' },
      coworking:            { label: 'Coworking', emoji: '\ud83d\udcbb' },
      cleaners:             { label: 'Cleaners', emoji: '\ud83e\uddf9' },
    },
  },
  hospitality: {
    label: 'Hospitality',
    subtitle: 'Bed & breakfasts, inns',
    emoji: '\ud83d\udecf\ufe0f',
    tw: 'prussian',
    hex: '#3674A5',
    classes: {
      bg: 'bg-[#3674A5]/10',
      border: 'border-[#3674A5]/20',
      text: 'text-[#3674A5]',
      hover: 'hover:bg-[#3674A5]/15',
      dot: 'bg-[#3674A5]',
      activeBg: 'bg-[#3674A5]/20',
    },
    subcategories: {
      'bed-and-breakfast':  { label: 'Bed & Breakfast', emoji: '\ud83d\udecf\ufe0f' },
      hotels:               { label: 'Hotels', emoji: '\ud83c\udfe8' },
    },
  },
  community: {
    label: 'Community',
    subtitle: 'Churches, schools, organizations',
    emoji: '\u26ea',
    tw: 'terracotta',
    hex: '#B86B4A',
    classes: {
      bg: 'bg-[#B86B4A]/10',
      border: 'border-[#B86B4A]/20',
      text: 'text-[#B86B4A]',
      hover: 'hover:bg-[#B86B4A]/15',
      dot: 'bg-[#B86B4A]',
      activeBg: 'bg-[#B86B4A]/20',
    },
    subcategories: {
      churches:      { label: 'Churches', emoji: '\u26ea' },
      schools:       { label: 'Schools', emoji: '\ud83c\udf93' },
      organizations: { label: 'Organizations', emoji: '\ud83e\udd1d' },
      library:       { label: 'Library', emoji: '\ud83d\udcda' },
      'events-venue': { label: 'Events & Venues', emoji: '\ud83c\udf89' },
    },
  },
  residential: {
    label: 'Residential',
    subtitle: 'Lofts, apartments, townhouses, homes',
    emoji: '\ud83c\udfe0',
    tw: 'sage',
    hex: '#7A8B6F',
    classes: {
      bg: 'bg-[#7A8B6F]/10',
      border: 'border-[#7A8B6F]/20',
      text: 'text-[#7A8B6F]',
      hover: 'hover:bg-[#7A8B6F]/15',
      dot: 'bg-[#7A8B6F]',
      activeBg: 'bg-[#7A8B6F]/20',
    },
    subcategories: {
      lofts:          { label: 'Lofts & Apartments', emoji: '\ud83c\udfd9\ufe0f' },
      condos:         { label: 'Condominiums', emoji: '\ud83c\udfe2' },
      townhouses:     { label: 'Townhouses & Duplexes', emoji: '\ud83c\udfe0' },
      houses:         { label: 'Single-Family Homes', emoji: '\ud83c\udfe1' },
      'historic-homes': { label: 'Historic Homes', emoji: '\ud83c\udfdb\ufe0f' },
      unnamed:        { label: 'Unnamed Buildings', emoji: '\ud83c\udfe2' },
    },
  },
  commercial: {
    label: 'Commercial',
    subtitle: 'Storefronts, retail, mixed-use',
    emoji: '\ud83c\udfe2',
    tw: 'gold',
    hex: '#D4A337',
    classes: {
      bg: 'bg-[#D4A337]/10',
      border: 'border-[#D4A337]/20',
      text: 'text-[#D4A337]',
      hover: 'hover:bg-[#D4A337]/15',
      dot: 'bg-[#D4A337]',
      activeBg: 'bg-[#D4A337]/20',
    },
    subcategories: {
      storefronts: { label: 'Storefronts', emoji: '\ud83c\udfe2' },
      retail:      { label: 'Retail Spaces', emoji: '\ud83d\udecd\ufe0f' },
    },
  },
  industrial: {
    label: 'Industrial',
    subtitle: 'Warehouses, factories, adaptive reuse',
    emoji: '\ud83c\udfed',
    tw: 'prussian',
    hex: '#3674A5',
    classes: {
      bg: 'bg-[#3674A5]/10',
      border: 'border-[#3674A5]/20',
      text: 'text-[#3674A5]',
      hover: 'hover:bg-[#3674A5]/15',
      dot: 'bg-[#3674A5]',
      activeBg: 'bg-[#3674A5]/20',
    },
    subcategories: {
      warehouses: { label: 'Warehouses & Factories', emoji: '\ud83c\udfed' },
    },
  },
}

// ── Derived lookups (computed once, used by consumers) ─────────────────────

/** { dining: 'Dining & Drinks', ... } */
export const CATEGORY_LABELS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([id, c]) => [id, c.label])
)

/** { restaurants: 'Restaurants', bars: 'Bars & Wine', ... } */
export const SUBCATEGORY_LABELS = Object.fromEntries(
  Object.entries(CATEGORIES).flatMap(([, c]) =>
    Object.entries(c.subcategories).map(([id, s]) => [id, s.label])
  )
)

/** { dining: '🍽️', ... } */
export const CATEGORY_EMOJI = Object.fromEntries(
  Object.entries(CATEGORIES).map(([id, c]) => [id, c.emoji])
)

/** { restaurants: '🍽️', bars: '🍸', ... } */
export const SUBCATEGORY_EMOJI = Object.fromEntries(
  Object.entries(CATEGORIES).flatMap(([, c]) =>
    Object.entries(c.subcategories).map(([id, s]) => [id, s.emoji])
  )
)

/** { claret: { bg, border, text, hover, dot, activeBg }, ... } — keyed by Victorian color name */
export const COLOR_CLASSES = Object.fromEntries(
  Object.entries(CATEGORIES).map(([, c]) => [c.tw, c.classes])
)

/**
 * ⛔⛔ THE TREATMENT FOR A CATEGORY WITH NO COLOUR — `CATEGORY_LIST`'s `unclassified`
 * carries `color: null` ON PURPOSE, so every consumer that indexes `COLOR_CLASSES` by it
 * gets `undefined` unless it falls back here.
 *
 * ⭐ It is SLATE, the same neutral as `UNKNOWN_HEX`, and it is deliberately not one of the
 * twelve: "unclassified" must read as the absence of a category, never as a quiet member of
 * the taxonomy.
 *
 * Instance, 2026-09-21: `SidePanel` did `COLOR_CLASSES[category.color].border` with no
 * guard and threw "Cannot read properties of undefined (reading 'border')" — the whole
 * panel down. The row had existed unexercised because LS's assessor classifies every
 * building; huron's 338 buildings with no readable use are the first to reach it. ⛔ The
 * defect is the missing guard, NOT the null: `classifyZoning` returns null for an
 * unreadable code and null must travel, or a town with no St. Louis zoning letter gets
 * every building filed as residential (the Layer 0 q2 bug that rule was written to kill).
 */
export const UNCLASSIFIED_CLASSES = {
  bg: 'bg-[#6B7280]/10',
  border: 'border-[#6B7280]/20',
  text: 'text-[#6B7280]',
  hover: 'hover:bg-[#6B7280]/15',
  dot: 'bg-[#6B7280]',
  activeBg: 'bg-[#6B7280]/20',
}

/** { dining: '#C2185B', ... } — hex colors for Three.js neon bands + QR codes */
export const CATEGORY_HEX = Object.fromEntries(
  Object.entries(CATEGORIES).map(([id, c]) => [id, c.hex])
)

/**
 * ⭐⭐ THE COLOUR OF "WE DO NOT KNOW" — a desaturated slate that belongs to no category
 * in the Victorian palette above, so it cannot be mistaken for one at a glance.
 *
 * ⛔ THIS IS `CLAUDE.md` LAYER 0 q2 MADE VISIBLE ON THE EYE-GATE SURFACE. The neon tube
 * for a building whose zoning we cannot read used to be Sage — indistinguishable from a
 * building we know to be residential — so a town with no St. Louis zoning letter poured
 * as an entirely residential neighbourhood and looked right. The failure was silent in
 * the one place the operator actually inspects. It is not silent now: an unclassified
 * town reads as slate, on sight, before anyone opens a census.
 *
 * ⛔ Deliberately NOT a member of `CATEGORIES`. It is not a category and must never
 * appear in the SidePanel accordion, a filter, or a search facet — it is the absence of
 * one, and giving it a home in the taxonomy would make "unknown" a thing to browse.
 */
export const UNKNOWN_HEX = '#6B7280'

/** Ordered array for SidePanel accordion rendering */
export const CATEGORY_LIST = [
  ...Object.entries(CATEGORIES).map(([id, c]) => ({
    id,
    title: c.label,
    subtitle: c.subtitle,
    color: c.tw,
    sections: Object.entries(c.subcategories).map(([subId, s]) => ({
      id: subId,
      name: s.label,
    })),
  })),
  // ⛔⛔ THE UNCLASSIFIED SECTION EXISTS SO THAT KILLING A FALLBACK DID NOT CREATE A
  // SILENT DROP IN ITS PLACE — and it very nearly did.
  //
  // When `category: ZONING_CAT[z] || 'residential'` died, buildings whose zoning we
  // cannot read started carrying `category: null` instead of a confident "residential".
  // That is correct in the data. But `useLandmarkFilter` matches a listing by
  // `activeTags.has(l.subcategory) || activeTags.has(l.category)`, so a null category
  // matches NO accordion tag: 73 of Hi-Pointe–DeMun's 1,281 buildings would have gone
  // from wrongly-browsable to unbrowsable, with nothing said. Trading a loud wrong
  // answer for a quiet missing one is not a fix; it is the same defect facing the other
  // way (`CLAUDE.md` Layer 0 q2 — silence is the defect).
  //
  // ⛔ IT IS APPENDED TO THE LIST, NOT ADDED TO `CATEGORIES`, and that placement is the
  // whole design. `CATEGORIES` feeds `CATEGORY_HEX`, which paints neon; an entry there
  // would make "unknown" a colour in the Victorian palette and a category a business
  // could be filed under. Here it is only what it actually is: a place in the index to
  // find the buildings nobody has been able to classify yet.
  {
    id: 'unclassified',
    title: 'Unclassified',
    subtitle: 'Buildings whose use we have not established',
    color: null,
    sections: [],
  },
]

/**
 * ⭐⭐ ST. LOUIS CITY ZONING → the Society taxonomy. THE SINGLE HOME.
 *
 * ⛔⛔ THIS TABLE EXISTED IN FIVE PLACES AND NO TWO AGREED. `INTAKE-CATALOGUE §3.6 G3`
 * counted four; the fifth was the dead `ZONING_TO_SUBCATEGORY` that used to sit right
 * here, exported and imported by nobody. The copies split on `D`, on the five
 * residential subcategories, and on the district LABELS.
 *
 * ⭐⭐⭐ AND WHEN IT WAS FINALLY CHECKED AGAINST THE AUTHORITY, THE MAJORITY WAS WRONG.
 * St. Louis Revised Code **Title 26** divides the city into twelve districts:
 *   A Single-Family Dwelling · B Two-Family Dwelling · C/D/E Multiple-Family Dwelling ·
 *   F Neighborhood Commercial · G Local Commercial and Office · H Area Commercial ·
 *   I Central Business · J Industrial · K Unrestricted · L Jefferson Memorial
 * So:
 *   · `D` is RESIDENTIAL (Multiple-Family), and both `useListings` and `bake-content`
 *     called it commercial. `SceneNeon` — the copy this was dispatched to treat as the
 *     odd one out — had `D: 'residential'` and was the only one right.
 *   · `H` is COMMERCIAL (Area Commercial), and both called it residential.
 *   · `E` is Multiple-Family, not single-family houses.
 *   · `I`, `K` and `L` exist and only `SceneNeon` had ever heard of `I`.
 * ⇒ The lesson is not "pick a winner". Four copies agreeing is not evidence; they were
 *   copies OF EACH OTHER. The authority is the ordinance.
 *
 * ⛔⛔ AND IT IS ST. LOUIS'S ALPHABET, WHICH IS THE WHOLE TOWN-#2 PROBLEM. These letters
 * mean nothing in Ohio, in Poland, or in the next town. A scene declares whether its
 * assessor speaks this alphabet (`zoning_code_format: "stl-letter"` in its sources.json);
 * a town that does not gets `null`, LOUDLY, and never the old `|| 'residential'` — which
 * turned "we do not know this town's zoning" into "every building here is a house".
 */
export const STL_ZONING = {
  A: { category: 'residential', subcategory: 'houses',        label: 'Single-Family Dwelling' },
  B: { category: 'residential', subcategory: 'townhouses',    label: 'Two-Family Dwelling' },
  C: { category: 'residential', subcategory: 'lofts',         label: 'Multiple-Family Dwelling' },
  D: { category: 'residential', subcategory: 'lofts',         label: 'Multiple-Family Dwelling' },
  E: { category: 'residential', subcategory: 'lofts',         label: 'Multiple-Family Dwelling' },
  F: { category: 'commercial',  subcategory: 'storefronts',   label: 'Neighborhood Commercial' },
  G: { category: 'commercial',  subcategory: 'retail',        label: 'Local Commercial and Office' },
  H: { category: 'commercial',  subcategory: 'storefronts',   label: 'Area Commercial' },
  I: { category: 'commercial',  subcategory: 'storefronts',   label: 'Central Business' },
  J: { category: 'industrial',  subcategory: 'warehouses',    label: 'Industrial' },
  K: { category: null,          subcategory: null,            label: 'Unrestricted' },
  L: { category: 'community',   subcategory: 'organizations', label: 'Jefferson Memorial' },
}

/**
 * A zoning string → `{ category, subcategory, label }`, or **null**.
 *
 * ⛔ NULL IS A RESULT, NOT A FAILURE TO RETURN ONE, and every caller must render it as
 * "unknown" rather than substituting a default. `CLAUDE.md` Layer 0 q2: a fallback
 * converts "we do not know" into a confident wrong answer, and on a town with no St.
 * Louis zoning letter the old default made every building residential and every neon
 * tube sage — a map that looks surveyed and is not.
 *
 * `format` is the scene's declared zoning vocabulary. Anything but `'stl-letter'`
 * — including undeclared — is unknown, on purpose: a letter that happens to look like
 * an STL district in some other town's scheme must not be read as one.
 */
export function classifyZoning(code, format = 'stl-letter') {
  if (format !== 'stl-letter') return null
  const z = String(code || '').replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase()
  return STL_ZONING[z] || null
}

export default CATEGORIES
