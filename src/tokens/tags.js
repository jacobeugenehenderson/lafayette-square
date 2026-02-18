/**
 * Tag vocabulary — guardian-assigned tags that drive map colors, listings, and filters.
 *
 * Three levels:
 *   subcategory — mirrors categories.js subcategories; eligible for "primary" tag
 *   feature     — goods / services / characteristics
 *   amenity     — cross-cutting physical features
 *
 * Each tag: { id, label, group (parent category ID or null), level }
 */

import CATEGORIES from './categories'

// ── Subcategory tags (auto-derived from categories.js) ─────────────────────

const subcategoryTags = Object.entries(CATEGORIES).flatMap(([catId, cat]) =>
  Object.entries(cat.subcategories).map(([subId, sub]) => ({
    id: subId,
    label: sub.label,
    group: catId,
    level: 'subcategory',
  }))
)

// ── Feature tags ───────────────────────────────────────────────────────────

const featureTags = [
  // Dining
  { id: 'brunch',         label: 'Brunch',          group: 'dining',   level: 'feature' },
  { id: 'cocktails',      label: 'Cocktails',       group: 'dining',   level: 'feature' },
  { id: 'craft-beer',     label: 'Craft Beer',      group: 'dining',   level: 'feature' },
  { id: 'wine-bar',       label: 'Wine Bar',        group: 'dining',   level: 'feature' },
  { id: 'happy-hour',     label: 'Happy Hour',      group: 'dining',   level: 'feature' },
  { id: 'late-night',     label: 'Late Night',      group: 'dining',   level: 'feature' },
  { id: 'takeout',        label: 'Takeout',         group: 'dining',   level: 'feature' },
  { id: 'delivery',       label: 'Delivery',        group: 'dining',   level: 'feature' },
  { id: 'catering',       label: 'Catering',        group: 'dining',   level: 'feature' },
  { id: 'farm-to-table',  label: 'Farm to Table',   group: 'dining',   level: 'feature' },
  { id: 'private-dining', label: 'Private Dining',  group: 'dining',   level: 'feature' },
  { id: 'desserts',       label: 'Desserts',        group: 'dining',   level: 'feature' },
  { id: 'coffee',         label: 'Coffee',          group: 'dining',   level: 'feature' },
  { id: 'smoothies',      label: 'Smoothies',       group: 'dining',   level: 'feature' },
  { id: 'vegan',          label: 'Vegan',           group: 'dining',   level: 'feature' },
  { id: 'vegetarian',     label: 'Vegetarian',      group: 'dining',   level: 'feature' },
  { id: 'gluten-free',    label: 'Gluten Free',     group: 'dining',   level: 'feature' },
  // Arts
  { id: 'live-music',     label: 'Live Music',      group: 'arts',     level: 'feature' },
  { id: 'open-mic',       label: 'Open Mic',        group: 'arts',     level: 'feature' },
  { id: 'classes',        label: 'Classes',          group: 'arts',     level: 'feature' },
  { id: 'workshops',      label: 'Workshops',        group: 'arts',     level: 'feature' },
  { id: 'exhibitions',    label: 'Exhibitions',      group: 'arts',     level: 'feature' },
  { id: 'theater',        label: 'Theater',          group: 'arts',     level: 'feature' },
  { id: 'dance',          label: 'Dance',            group: 'arts',     level: 'feature' },
  // Shopping
  { id: 'vintage',        label: 'Vintage',          group: 'shopping', level: 'feature' },
  { id: 'gifts',          label: 'Gifts',            group: 'shopping', level: 'feature' },
  { id: 'home-decor',     label: 'Home Decor',       group: 'shopping', level: 'feature' },
  { id: 'books',          label: 'Books',            group: 'shopping', level: 'feature' },
  { id: 'jewelry',        label: 'Jewelry',          group: 'shopping', level: 'feature' },
  { id: 'clothing',       label: 'Clothing',         group: 'shopping', level: 'feature' },
  { id: 'plants',         label: 'Plants',           group: 'shopping', level: 'feature' },
  // Services
  { id: 'appointments',   label: 'Appointments',     group: 'services', level: 'feature' },
  { id: 'walk-ins',       label: 'Walk-ins',         group: 'services', level: 'feature' },
  { id: 'yoga',           label: 'Yoga',             group: 'services', level: 'feature' },
  { id: 'fitness',        label: 'Fitness',          group: 'services', level: 'feature' },
  { id: 'massage',        label: 'Massage',          group: 'services', level: 'feature' },
  { id: 'therapy',        label: 'Therapy',          group: 'services', level: 'feature' },
  { id: 'tutoring',       label: 'Tutoring',         group: 'services', level: 'feature' },
  // Historic
  { id: 'tours',          label: 'Tours',            group: 'historic', level: 'feature' },
  // Community
  { id: 'events-venue',   label: 'Events Venue',     group: 'community', level: 'feature' },
  { id: 'meeting-space',  label: 'Meeting Space',    group: 'community', level: 'feature' },
  { id: 'volunteer',      label: 'Volunteer',        group: 'community', level: 'feature' },
]

// ── Amenity tags ───────────────────────────────────────────────────────────

const amenityTags = [
  { id: 'outdoor-seating',   label: 'Outdoor Seating',    group: null, level: 'amenity' },
  { id: 'pet-friendly',      label: 'Pet Friendly',       group: null, level: 'amenity' },
  { id: 'wifi',              label: 'WiFi',               group: null, level: 'amenity' },
  { id: 'wheelchair',        label: 'Wheelchair Access',  group: null, level: 'amenity' },
  { id: 'parking',           label: 'Parking',            group: null, level: 'amenity' },
  { id: 'kid-friendly',      label: 'Kid Friendly',       group: null, level: 'amenity' },
  { id: 'reservations',      label: 'Reservations',       group: null, level: 'amenity' },
  { id: 'historic-building', label: 'Historic Building',  group: null, level: 'amenity' },
  { id: 'air-conditioned',   label: 'Air Conditioned',    group: null, level: 'amenity' },
  { id: 'byob',              label: 'BYOB',               group: null, level: 'amenity' },
  { id: 'delivery-available', label: 'Delivery Available', group: null, level: 'amenity' },
  { id: 'curbside-pickup',   label: 'Curbside Pickup',    group: null, level: 'amenity' },
  { id: 'private-events',    label: 'Private Events',     group: null, level: 'amenity' },
  { id: 'group-friendly',    label: 'Group Friendly',     group: null, level: 'amenity' },
  { id: 'cash-only',         label: 'Cash Only',          group: null, level: 'amenity' },
  { id: 'credit-cards',      label: 'Credit Cards',       group: null, level: 'amenity' },
]

// ── All tags combined ──────────────────────────────────────────────────────

const ALL_TAGS = [...subcategoryTags, ...featureTags, ...amenityTags]

/** Lookup map: tagId → tag object */
export const TAG_BY_ID = Object.fromEntries(ALL_TAGS.map(t => [t.id, t]))

/** Set of IDs eligible for primary (subcategory-level only) */
export const SUBCATEGORY_TAG_IDS = new Set(subcategoryTags.map(t => t.id))

/** Tags grouped by category ID (for ManageTab sections). Amenities grouped under 'amenities'. */
export const TAGS_BY_GROUP = (() => {
  const groups = {}
  for (const t of ALL_TAGS) {
    const key = t.level === 'amenity' ? 'amenities' : t.group
    if (!key) continue
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }
  return groups
})()

// ── Reverse lookup: subcategory ID → parent category ID ────────────────────

const _subToCategory = Object.fromEntries(
  Object.entries(CATEGORIES).flatMap(([catId, cat]) =>
    Object.keys(cat.subcategories).map(subId => [subId, catId])
  )
)

/**
 * Given a subcategory tag ID (e.g. 'restaurants'), return the parent category
 * ID (e.g. 'dining'). Returns null if not a subcategory tag.
 */
export function primaryTagToCategory(tagId) {
  return _subToCategory[tagId] || null
}

export default ALL_TAGS
