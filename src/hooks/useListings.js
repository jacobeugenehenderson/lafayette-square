import { create } from 'zustand'
import { getListings } from '../lib/api'
import staticData from '../data/landmarks.json'

/**
 * Listing data store.
 *
 * Initializes instantly with the bundled landmarks.json so the scene
 * renders without delay.  When a Sheets API URL is configured, the store
 * silently refreshes in the background — API data wins over static
 * so guardian edits are reflected.
 *
 * Consumers access `listings` (the array) or use the lookup helpers.
 */
const useListings = create((set, get) => ({
  listings: staticData.landmarks,
  loading: false,
  fetched: false,

  /** Background refresh from Sheets API — safe to call multiple times */
  refresh: async () => {
    if (get().fetched || get().loading) return
    set({ loading: true })
    try {
      const res = await getListings()
      const apiListings = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.listings) ? res.data.listings
        : []
      if (apiListings.length > 0) {
        // Build lookup from static data for fallback fields (logo, reviews, etc.)
        const staticLookup = new Map()
        staticData.landmarks.forEach(lm => staticLookup.set(lm.id, lm))

        // Merge: API wins over static (guardian edits override bundled data)
        // but skip null/empty API fields so rich static data (history, photos, etc.) is preserved
        const merged = apiListings.map(api => {
          const lm = staticLookup.get(api.id)
          if (!lm) return api
          const out = { ...lm }
          for (const [k, v] of Object.entries(api)) {
            if (v != null && !(Array.isArray(v) && v.length === 0)) {
              // For photos: prefer whichever array has richer entries (objects with credits)
              if (k === 'photos' && Array.isArray(v) && Array.isArray(lm.photos)) {
                const apiHasCredits = v.some(p => typeof p === 'object' && p?.credit)
                const staticHasCredits = lm.photos.some(p => typeof p === 'object' && p?.credit)
                if (staticHasCredits && !apiHasCredits) continue  // keep static
                // API has credits or both do — take the longer/richer array
                if (staticHasCredits && apiHasCredits) {
                  out[k] = v.length >= lm.photos.length ? v : lm.photos
                  continue
                }
              }
              out[k] = v
            }
          }
          return out
        })

        // Add any static landmarks not in API (shouldn't happen, but safety net)
        const apiIds = new Set(apiListings.map(l => l.id))
        staticData.landmarks.forEach(lm => {
          if (!apiIds.has(lm.id)) merged.push(lm)
        })

        set({ listings: merged, fetched: true, loading: false })
      } else {
        set({ fetched: true, loading: false })
      }
    } catch {
      // API unavailable — keep static data
      set({ loading: false })
    }
  },

  /** Lookup by listing id */
  getById: (id) => get().listings.find(l => l.id === id),

  /** Lookup by building_id — returns first match */
  getByBuildingId: (buildingId) =>
    get().listings.find(l => l.building_id === buildingId) ||
    get().listings.find(l => l.id === buildingId),

  /** Get all listings for a building (multi-tenant support) */
  getListingsForBuilding: (buildingId) =>
    get().listings.filter(l => l.building_id === buildingId),

  /** Optimistic local update for a single listing */
  updateListing: (id, fields) => {
    set({
      listings: get().listings.map(l =>
        l.id === id ? { ...l, ...fields } : l
      ),
    })
  },
}))

// Auto-refresh removed — useInit.js handles the batch init call

export default useListings
