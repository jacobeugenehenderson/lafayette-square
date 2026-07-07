import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex.js'

/**
 * resolveBuildingPosition — the single source of a building's world XZ.
 *
 * Position is a RENDER fact and belongs to the SLAB, not the content layer.
 * The reader historically read each building's `position` from the content
 * `buildingMap`; that only worked because LS's legacy `buildings.json`
 * conflates content + geometry (it carries `position`/`footprint`/`size`).
 * Content-only installations (e.g. HiPointe `roster.json`) carry no
 * coordinates, so those reads returned `undefined` → clicks threw, pins
 * never drew. See SLAB-CONTRACT §6.3 + ls/ARCHITECTURE §2 (three payloads)
 * + the `slab-render-vs-content-boundary` doctrine.
 *
 * Resolution order:
 *   1. `building.position` present (LS legacy content) → return it UNCHANGED.
 *      Keeps LS byte-identical; the future cleanup is migrating LS onto the
 *      slab too, deliberately not done here.
 *   2. Else look the id up in the async slab index and derive the XZ centroid
 *      of the baked footprint (`entry.footprint` = `[x,z]` pairs),
 *      `y = entry.baseY ?? 0`.
 *   3. Else (id not in the slab — e.g. dropped/curated buildings) → `null`.
 *
 * The slab index is published async by `SlabBuildings` after it parses the
 * `.bin`. Action-time consumers (a click, after the scene is up) may read
 * `getState()` directly; render-time consumers (the pins) must SUBSCRIBE to
 * `useSlabBuildingIndex` so they re-render once it publishes.
 *
 * @param {object|null|undefined} building content buildingMap entry
 * @returns {[number, number, number] | null} `[x, y, z]` or null
 */
export function resolveBuildingPosition(building) {
  if (!building) return null
  if (building.position) return building.position
  const entry = useSlabBuildingIndex.getState().index?.byId.get(building.id)
  const fp = entry?.footprint
  if (!fp || fp.length === 0) return null
  let cx = 0, cz = 0
  for (const [x, z] of fp) { cx += x; cz += z }
  return [cx / fp.length, entry.baseY ?? 0, cz / fp.length]
}
