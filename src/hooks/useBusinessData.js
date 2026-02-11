import { create } from 'zustand'
import { getBusinesses } from '../lib/api'
import { primaryTagToCategory } from '../tokens/tags'
import staticData from '../data/landmarks.json'

/**
 * Business/landmark data store.
 *
 * Initializes instantly with the bundled landmarks.json so the scene
 * renders without delay.  When a Sheets API URL is configured, the store
 * silently refreshes in the background — fresh data overwrites the static
 * snapshot only if the API returns a non-empty result.
 *
 * Consumers access `landmarks` (the array) or use the lookup helpers.
 */
const useBusinessData = create((set, get) => ({
  landmarks: staticData.landmarks,
  loading: false,
  fetched: false,

  /** Background refresh from Sheets API — safe to call multiple times */
  refresh: async () => {
    if (get().fetched || get().loading) return
    set({ loading: true })
    try {
      const res = await getBusinesses()
      const apiBiz = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.businesses) ? res.data.businesses
        : []
      if (apiBiz.length > 0) {
        // Merge: static landmark is base (preserves id, logo, etc.),
        // API overlays dynamic fields (hours, active, amenities, etc.)
        const apiLookup = new Map()
        apiBiz.forEach(b => apiLookup.set(`${b.building_id}:${b.name}`, b))
        const merged = staticData.landmarks.map(lm => {
          const api = apiLookup.get(`${lm.building_id}:${lm.name}`)
          if (!api) return lm
          // Static fields always win; API adds/updates dynamic fields
          return { ...api, ...lm }
        })
        set({ landmarks: merged, fetched: true, loading: false })
      } else {
        set({ fetched: true, loading: false })
      }
    } catch {
      // API unavailable — keep static data
      set({ loading: false })
    }
  },

  /** Lookup by landmark/business id */
  getById: (id) => get().landmarks.find(l => l.id === id),

  /** Lookup by building_id (falls back to id for compat) — returns first match */
  getByBuildingId: (buildingId) =>
    get().landmarks.find(l => l.building_id === buildingId) ||
    get().landmarks.find(l => l.id === buildingId),


  /** Apply guardian-set tags — updates category, subcategory, and tags for a landmark */
  applyTags: (businessId, primaryTag, allTags) => {
    const category = primaryTagToCategory(primaryTag)
    set({
      landmarks: get().landmarks.map(l =>
        l.id === businessId
          ? { ...l, category: category || l.category, subcategory: primaryTag || l.subcategory, tags: allTags }
          : l
      ),
    })
  },
}))

// Auto-refresh on first import (non-blocking)
useBusinessData.getState().refresh()

export default useBusinessData
