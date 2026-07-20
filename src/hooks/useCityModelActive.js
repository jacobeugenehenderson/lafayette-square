import { create } from 'zustand'

/**
 * useCityModelActive — is an acquired city LOD2 model currently drawing the
 * buildings for the mounted look?
 *
 * `CityModel` sets this the moment it resolves a `citymodel/citymodel.json`
 * (manifest presence, the MountainBackdrop rule — NOT a lookId check and NOT an
 * instance flag). `SlabBuildings` reads it to stand down to index-only, so the
 * two never draw the same buildings on top of each other.
 *
 * Why a store rather than a prop: Stage/Preview can mount ANY look, so the host
 * cannot know at mount time whether that look ships a city model. The consumer
 * that fetches the manifest is the only thing that knows, so it publishes and
 * the host stays scene-generic. Same shape as useSlabBuildingIndex.
 *
 * Set on MANIFEST resolve, not on geometry-ready: hiding the extrusions early
 * gives a brief moment of no buildings, which is far better than a brief moment
 * of two sets of buildings z-fighting through each other.
 */
const useCityModelActive = create((set) => ({
  active: false,
  /**
   * osm ids the city model actually DRAWS. Load-bearing: the model covers only
   * the buildings OSM also mapped (984 of 1819 for Łódź — 54%). Hiding every
   * extrusion when it activates left 835 buildings rendering as nothing but bare
   * ground, which reads exactly like buildings sunk beneath the terrain. So the
   * slab suppresses ONLY the buildings the LOD2 replaces, and keeps drawing the
   * rest. Empty set = suppress nothing.
   */
  coveredIds: null,     // Set<string> | null
  setActive: (active) => set({ active }),
  setCoveredIds: (coveredIds) => set({ coveredIds }),
}))

export default useCityModelActive
