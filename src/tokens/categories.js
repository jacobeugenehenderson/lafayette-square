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

/** { dining: '#C2185B', ... } — hex colors for Three.js neon bands + QR codes */
export const CATEGORY_HEX = Object.fromEntries(
  Object.entries(CATEGORIES).map(([id, c]) => [id, c.hex])
)

/** Ordered array for SidePanel accordion rendering */
export const CATEGORY_LIST = Object.entries(CATEGORIES).map(([id, c]) => ({
  id,
  title: c.label,
  subtitle: c.subtitle,
  color: c.tw,
  sections: Object.entries(c.subcategories).map(([subId, s]) => ({
    id: subId,
    name: s.label,
  })),
}))

/** Map zoning codes to residential subcategories for bare buildings */
export const ZONING_TO_SUBCATEGORY = {
  A: 'houses',
  B: 'townhouses',
  C: 'lofts',
  D: 'commercial',
  F: 'commercial',
  G: 'commercial',
  J: 'industrial',
}

export default CATEGORIES
