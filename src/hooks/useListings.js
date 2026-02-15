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
        const merged = apiListings.map(api => {
          const lm = staticLookup.get(api.id)
          if (!lm) return api
          // Static is base, API overlays — API wins for dynamic fields
          return { ...lm, ...api }
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

// Auto-refresh on first import (non-blocking)
useListings.getState().refresh()

export default useListings
