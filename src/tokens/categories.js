/**
 * Category taxonomy — single source of truth.
 *
 * Consumed by: SidePanel, PlaceCard, useLandmarkFilter, neon bands (V2), QR styling (Q4).
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
    subtitle: 'Restaurants, bars, cafes',
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
      bars:        { label: 'Bars & Nightlife', emoji: '\ud83c\udf78' },
      cafes:       { label: 'Cafes & Coffee', emoji: '\u2615' },
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
    subtitle: 'Galleries, studios, venues',
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
    },
  },
  parks: {
    label: 'Parks & Recreation',
    subtitle: 'Lafayette Park, gardens, playgrounds',
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
      playgrounds: { label: 'Playgrounds', emoji: '\ud83c\udfaa' },
    },
  },
  shopping: {
    label: 'Shopping',
    subtitle: 'Boutiques, antiques, grocery, local makers',
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
      boutiques:     { label: 'Boutiques', emoji: '\ud83d\udc57' },
      antiques:      { label: 'Antiques', emoji: '\ud83c\udffa' },
      'local-makers': { label: 'Local Makers', emoji: '\ud83d\udecd\ufe0f' },
      grocery:       { label: 'Grocery', emoji: '\ud83d\uded2' },
      pets:          { label: 'Pets', emoji: '\ud83d\udc3e' },
    },
  },
  services: {
    label: 'Services',
    subtitle: 'Medical, legal, financial, beauty',
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
      medical:   { label: 'Medical', emoji: '\ud83c\udfe5' },
      legal:     { label: 'Legal', emoji: '\u2696\ufe0f' },
      financial: { label: 'Financial', emoji: '\ud83c\udfe6' },
      beauty:    { label: 'Beauty & Salon', emoji: '\ud83d\udc87' },
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
    },
  },
  residential: {
    label: 'Residential',
    subtitle: 'Homes, neighbors, historic residences',
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
      'historic-homes': { label: 'Historic Homes', emoji: '\ud83c\udfdb\ufe0f' },
      neighbors:        { label: 'Neighbors', emoji: '\ud83d\udc4b' },
    },
  },
}

// ── Derived lookups (computed once, used by consumers) ─────────────────────

/** { dining: 'Dining & Drinks', ... } */
export const CATEGORY_LABELS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([id, c]) => [id, c.label])
)

/** { restaurants: 'Restaurants', bars: 'Bars & Nightlife', ... } */
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

/** { dining: '#f97316', ... } — hex colors for Three.js neon bands + QR codes */
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

export default CATEGORIES
