/**
 * Cartograph — Step 2a: Snap coordinates to grid
 *
 * Rounds all coordinates to a configurable grid (default 0.1m = 10cm).
 * This ensures near-miss intersections become exact matches, which is
 * prerequisite for clean topology.
 *
 * Also deduplicates consecutive identical points within each way.
 */

// Snap precision in meters (0.1 = 10cm grid)
const GRID = 0.1

export function snapCoord(v) {
  return Math.round(v / GRID) * GRID
}

export function snapCoords(coords) {
  const snapped = []
  let prevX, prevZ

  for (const c of coords) {
    const x = snapCoord(c.x)
    const z = snapCoord(c.z)

    // Skip consecutive duplicates
    if (x === prevX && z === prevZ) continue

    snapped.push({ ...c, x, z })
    prevX = x
    prevZ = z
  }

  return snapped
}

/**
 * Snap all features in an OSM extract.
 * Returns a new object with the same structure, snapped coords.
 */
export function snapAll(osm) {
  const ground = {}
  for (const [cat, feats] of Object.entries(osm.ground)) {
    ground[cat] = feats
      .map(f => {
        const coords = snapCoords(f.coords)
        if (coords.length < 2) return null
        // Re-check closure after snapping (first/last might now match)
        const isClosed = coords.length >= 3 &&
          coords[0].x === coords[coords.length - 1].x &&
          coords[0].z === coords[coords.length - 1].z
        // ⛔ HOLES ARE SNAPPED WITH THEIR OUTER RING. They ride through on the spread
        // whether or not this line exists, which is the trap: an unsnapped inner ring
        // against a snapped outer is two rings on two different grids, and the
        // sub-grid disagreement lands exactly on the shared edges where a containment
        // test decides whether a point is in the hole or in the face.
        const holes = Array.isArray(f.holes)
          ? f.holes.map(snapCoords).filter(h => h.length >= 3)
          : undefined
        return { ...f, coords, isClosed, ...(holes ? { holes } : {}) }
      })
      .filter(Boolean)
  }

  const buildings = osm.buildings
    .map(f => {
      const coords = snapCoords(f.coords)
      if (coords.length < 3) return null
      return { ...f, coords, isClosed: true }
    })
    .filter(Boolean)

  return { ...osm, ground, buildings }
}
