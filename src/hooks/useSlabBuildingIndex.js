import { create } from 'zustand'

/**
 * useSlabBuildingIndex — the runtime-resolved per-building identity map
 * built from the slab's render-scoped `buildings` index (buildings.json v2).
 *
 * `SlabBuildings` loads the manifest + .bin and publishes the parsed index
 * here once; downstream consumers (SceneNeon, selection/place-state) read
 * `id → { footprint, roofOutline, centroidY, baseY, wallMaterial, roofMaterial, zoning }`
 * instead of reaching into live `src/data/buildings`. The slab owns spatial
 * identity; the content layer (buildingMap / useListings) still owns what to
 * display. See SLAB-CONTRACT §6 + HANDOFF-buildings-bake.md (C2).
 *
 * Shape:
 *   index.byNum : array indexed by the numeric building id baked into the
 *                 `aBuildingId` vertex attribute (= position in manifest.buildings).
 *   index.byId  : Map(stringId → entry)
 *   index.idToNum : Map(stringId → numeric id)
 */
const useSlabBuildingIndex = create((set) => ({
  index: null,           // { byNum, byId, idToNum, look } | null
  setIndex: (index) => set({ index }),
  clear: () => set({ index: null }),
}))

export default useSlabBuildingIndex
