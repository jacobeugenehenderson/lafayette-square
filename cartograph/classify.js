/**
 * Cartograph — Step 3: Classify faces
 *
 * Tags each polygon face extracted by polygonize with a feature type:
 *   - block      (large enclosed areas between streets = city blocks)
 *   - park       (contains park/leisure landuse)
 *   - parking    (contains parking landuse)
 *   - plaza      (small paved open areas)
 *   - unknown    (unclassifiable)
 *
 * Classification uses point-in-polygon tests against OSM landuse/leisure
 * polygons, plus heuristics based on area and shape.
 */

// ── Point-in-polygon (ray casting) ───────────────────────────────────

import { createVocabularyGate } from './osm-vocabulary.mjs'

function pointInPolygon(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, zi = ring[i].z
    const xj = ring[j].x, zj = ring[j].z

    if ((zi > pz) !== (zj > pz) &&
        px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function centroid(ring) {
  let sx = 0, sz = 0
  for (const p of ring) { sx += p.x; sz += p.z }
  return { x: sx / ring.length, z: sz / ring.length }
}

// ── Classify ─────────────────────────────────────────────────────────

/**
 * Classify face polygons using OSM landuse/leisure overlays.
 *
 * @param {Array} faces — from polygonize(), each has .ring, .area, .absArea
 * @param {Object} snapped — full snapped OSM data with .ground categories
 * @returns {Array} faces with .type added
 */
export function classify(faces, snapped, scene = null) {
  // Collect closed polygons from landuse, leisure, amenity, natural
  const overlays = []

  // The ingest vocabulary gate — what this town brought that the kit cannot read.
  const vocabGap = createVocabularyGate('classify',
    'Add a branch to classify.js for any class above that should type a face ' +
    '(park / parking / water / block). Until then those faces are typed by AREA ' +
    'alone, which is honest but blind — the town\'s OSM data is richer than its map.')

  for (const cat of ['landuse', 'leisure', 'natural', 'amenity']) {
    const feats = snapped.ground[cat] || []
    for (const f of feats) {
      if (!f.isClosed || f.coords.length < 4) continue
      const ring = f.coords.map(c => ({ x: c.x, z: c.z }))

      // Determine overlay type from tags.
      //
      // ⭐ `null` MEANS "WE COULD NOT READ THIS" — IT IS NOT A TYPE.
      // This used to initialise to the string 'unknown', which made the failure
      // a VALUE: it was pushed into `overlays` as a peer of real answers, won
      // the containment race below, and arrived downstream as a confident type
      // that `derive.js`'s `if (face.type === 'block')` then skipped. See the
      // invariant in `osm-vocabulary.mjs` — A SENTINEL IS NOT A VALUE.
      let type = null
      const tags = f.tags || {}

      if (tags.leisure === 'park' || tags.leisure === 'garden' ||
          tags.landuse === 'grass' || tags.landuse === 'recreation_ground') {
        type = 'park'
      } else if (tags.amenity === 'parking' || tags.landuse === 'parking') {
        type = 'parking'
      } else if (tags.natural === 'water' || tags.waterway) {
        type = 'water'
      } else if (['residential', 'commercial', 'retail', 'industrial', 'religious'].includes(tags.landuse)) {
        type = 'block'
      }

      if (type) {
        overlays.push({ ring, type, tags })
      } else {
        // ⛔ AN UNREADABLE OVERLAY DOES NOT VOTE. It is not evidence of anything,
        // so it must not capture the faces it happens to overlap — it falls
        // through to the honest size fallback below. But it is NOT dropped
        // silently either: that would be the same defect, quieter. It is
        // recorded and announced at pour time (Layer 0 — no fallbacks).
        vocabGap.record(`${cat}=${tags[cat] ?? '(missing)'}`, ring, tags)
      }
    }
  }

  console.log(`  ${overlays.length} overlay polygons for classification`)

  // Classify each face
  const result = []
  const counts = {}

  for (const face of faces) {
    const c = centroid(face.ring)

    // Check against overlays
    let type = null
    for (const ov of overlays) {
      if (pointInPolygon(c.x, c.z, ov.ring)) {
        type = ov.type
        break
      }
    }

    // Fallback: large faces between streets are blocks
    if (!type) {
      if (face.absArea > 500) {
        type = 'block'
      } else if (face.absArea > 50) {
        type = 'island' // traffic islands, medians
      } else {
        type = 'fragment' // tiny leftover geometry
      }
    }

    counts[type] = (counts[type] || 0) + 1
    result.push({ ...face, type })
  }

  for (const [type, count] of Object.entries(counts).sort()) {
    console.log(`    ${type}: ${count}`)
  }

  // ⭐ THE GATE. Loud, every pour, every town — including the ones nobody has
  // looked at. This is the deliverable, not the excision above: the excision
  // stops THIS town's hijack; the report is what catches the class in town #7.
  const gapReport = vocabGap.report(scene)
  if (gapReport) console.warn(gapReport)

  return result
}
