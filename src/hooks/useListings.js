import { create } from 'zustand'
import { getListings } from '../lib/api'
import staticData from '../data/landmarks.json'
import menuData from '../data/menus.json'
import buildingsData from '../data/buildings.json'

/**
 * Listing data store.
 *
 * Initializes instantly with the bundled landmarks.json so the scene
 * renders without delay.  When a Sheets API URL is configured, the store
 * silently refreshes in the background — API data wins over static
 * so guardian edits are reflected.
 *
 * Bare buildings (no landmark listing) are included as synthetic
 * listings, categorized by St. Louis zoning code.
 *
 * Consumers access `listings` (the array) or use the lookup helpers.
 */
// Merge bundled menu data into static landmarks
const landmarksWithMenus = staticData.landmarks.map(lm =>
  menuData[lm.id] ? { ...lm, menu: menuData[lm.id] } : lm
)

// Generate synthetic listings for bare buildings using zoning codes
const ZONING_CAT = { A: 'residential', B: 'residential', C: 'residential', D: 'commercial', E: 'residential', F: 'commercial', G: 'commercial', H: 'residential', J: 'industrial' }
const ZONING_SUB = { A: 'houses', B: 'townhouses', C: 'lofts', D: 'storefronts', E: 'houses', F: 'storefronts', G: 'retail', H: 'houses', J: 'warehouses' }
const _landmarkBids = new Set(landmarksWithMenus.map(l => l.building_id).filter(Boolean))
const _landmarkAddrs = new Set(landmarksWithMenus.map(l => (l.address || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean))
const bareBuildingListings = buildingsData.buildings
  .filter(b => b.address && !_landmarkBids.has(b.id) && !_landmarkAddrs.has(b.address.toLowerCase().replace(/\s+/g, ' ').trim()))
  .map(b => {
    const z = (b.zoning || '').replace(/[^A-Z]/g, '').charAt(0)
    return {
      id: b.id,
      name: b.name || b.address,
      address: b.address,
      building_id: b.id,
      category: ZONING_CAT[z] || 'residential',
      subcategory: ZONING_SUB[z] || 'houses',
      _bare: true,
    }
  })

const allListings = [...landmarksWithMenus, ...bareBuildingListings]

const useListings = create((set, get) => ({
  listings: allListings,
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
        landmarksWithMenus.forEach(lm => staticLookup.set(lm.id, lm))

        // Merge: API wins over static (guardian edits override bundled data)
        // but skip null/empty API fields so rich static data (history, photos, etc.) is preserved
        const merged = apiListings.map(api => {
          const lm = staticLookup.get(api.id)
          if (!lm) return api
          const out = { ...lm }
          for (const [k, v] of Object.entries(api)) {
            if (v != null && !(Array.isArray(v) && v.length === 0)) {
              // For menu: keep static bundled menu if API has no sections
              if (k === 'menu' && lm.menu?.sections?.length) {
                if (!v?.sections?.length) continue  // keep static
              }
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
        landmarksWithMenus.forEach(lm => {
          if (!apiIds.has(lm.id)) merged.push(lm)
        })

        set({ listings: [...merged, ...bareBuildingListings], fetched: true, loading: false })
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
