#!/usr/bin/env node
/**
 * One-time migration: fuzzy-map free-text amenities in landmarks.json to tag IDs.
 *
 * Usage:  node scripts/migrate-amenities-to-tags.mjs
 *         node scripts/migrate-amenities-to-tags.mjs --dry-run
 *
 * Writes `tags: [...]` onto each landmark. Keeps `amenities` intact as fallback.
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LANDMARKS_PATH = resolve(__dirname, '../src/data/landmarks.json')

const dryRun = process.argv.includes('--dry-run')

// ── Keyword → tag ID mapping ────────────────────────────────────────────────
// Each rule: [pattern (regex or string), tagId]
// Patterns are tested case-insensitively against each amenity string.

const RULES = [
  // Dining features
  [/brunch/i, 'brunch'],
  [/cocktail/i, 'cocktails'],
  [/craft beer|beers on tap|draft/i, 'craft-beer'],
  [/wine bar|wine.*glass|wine.*selection|wine.*club|wine.*flight/i, 'wine-bar'],
  [/happy hour/i, 'happy-hour'],
  [/late.?night/i, 'late-night'],
  [/takeout/i, 'takeout'],
  [/deliver(y|ing)|doordash|instacart|uber eats/i, 'delivery'],
  [/catering/i, 'catering'],
  [/farm.to.table|locally sourced|seasonal.*menu/i, 'farm-to-table'],
  [/private dining|private.*room/i, 'private-dining'],
  [/dessert|chocolate|gooey butter|ice cream/i, 'desserts'],
  [/coffee.*roast|café/i, 'coffee'],
  [/smoothie/i, 'smoothies'],
  [/vegan|non.dairy/i, 'vegan'],
  [/vegetarian/i, 'vegetarian'],
  [/gluten.free/i, 'gluten-free'],

  // Arts features
  [/live (music|jazz|blues)/i, 'live-music'],
  [/open mic/i, 'open-mic'],
  [/class(es)?(?!ic)/i, 'classes'],
  [/workshop/i, 'workshops'],
  [/exhibition|gallery.*featuring/i, 'exhibitions'],
  [/theater|theatre/i, 'theater'],
  [/dance/i, 'dance'],

  // Shopping features
  [/vintage|antique/i, 'vintage'],
  [/gift/i, 'gifts'],
  [/home.?dec[oó]r/i, 'home-decor'],
  [/book/i, 'books'],
  [/jewelry/i, 'jewelry'],
  [/clothing|fashion/i, 'clothing'],
  [/plant/i, 'plants'],

  // Services features
  [/appointment/i, 'appointments'],
  [/walk.in/i, 'walk-ins'],
  [/yoga/i, 'yoga'],
  [/fitness|cardio|weight.*area/i, 'fitness'],
  [/massage/i, 'massage'],
  [/therap(y|ist)/i, 'therapy'],
  [/tutor/i, 'tutoring'],

  // Historic features
  [/tour/i, 'tours'],

  // Community features
  [/event.*space|event.*venue|concert.*space/i, 'events-venue'],
  [/meeting.*room|meeting.*space/i, 'meeting-space'],
  [/volunteer/i, 'volunteer'],

  // Amenities
  [/outdoor.*seat|outdoor.*patio|patio.*seat|courtyard.*patio|sidewalk.*seat|garden patio/i, 'outdoor-seating'],
  [/pet.friendly|dog.friendly/i, 'pet-friendly'],
  [/wi.?fi/i, 'wifi'],
  [/wheelchair/i, 'wheelchair'],
  [/parking|garage/i, 'parking'],
  [/kid.friendly|child/i, 'kid-friendly'],
  [/reserv(ation|e)/i, 'reservations'],
  [/historic.*build|historic.*property/i, 'historic-building'],
  [/air.condition/i, 'air-conditioned'],
  [/byob/i, 'byob'],
  [/curbside/i, 'curbside-pickup'],
  [/private.*event/i, 'private-events'],
  [/group/i, 'group-friendly'],
  [/cash only/i, 'cash-only'],
  [/credit.card/i, 'credit-cards'],
]

// ── Run migration ───────────────────────────────────────────────────────────

const data = JSON.parse(readFileSync(LANDMARKS_PATH, 'utf8'))
let totalMapped = 0
let landmarksUpdated = 0

for (const lm of data.landmarks) {
  if (!lm.amenities || lm.amenities.length === 0) continue

  const tags = new Set(lm.tags || [])
  const beforeSize = tags.size

  for (const amenity of lm.amenities) {
    for (const [pattern, tagId] of RULES) {
      if (pattern.test(amenity)) {
        tags.add(tagId)
      }
    }
  }

  // Also add subcategory tag if listing has subcategory
  if (lm.subcategory) {
    tags.add(lm.subcategory)
  }

  if (tags.size > beforeSize || !lm.tags) {
    lm.tags = [...tags]
    totalMapped += tags.size - beforeSize
    landmarksUpdated++

    if (dryRun) {
      console.log(`${lm.name}: ${[...tags].join(', ')}`)
    }
  }
}

if (!dryRun) {
  writeFileSync(LANDMARKS_PATH, JSON.stringify(data, null, 2) + '\n')
  console.log(`Migrated ${totalMapped} tag mappings across ${landmarksUpdated} landmarks.`)
  console.log('Amenities preserved as fallback. Guardians can refine via TagPicker.')
} else {
  console.log(`\n[DRY RUN] Would map ${totalMapped} tags across ${landmarksUpdated} landmarks.`)
}
