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
export function classify(faces, snapped) {
  // Collect closed polygons from landuse, leisure, amenity, natural
  const overlays = []

  for (const cat of ['landuse', 'leisure', 'natural', 'amenity']) {
    const feats = snapped.ground[cat] || []
    for (const f of feats) {
      if (!f.isClosed || f.coords.length < 4) continue
      const ring = f.coords.map(c => ({ x: c.x, z: c.z }))

      // Determine overlay type from tags
      let type = 'unknown'
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

      overlays.push({ ring, type, tags })
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

  return result
}
