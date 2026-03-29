import { create } from 'zustand'
import { getListings } from '../lib/api'
import staticData from '../data/landmarks.json'
import menuData from '../data/menus.json'
import { buildings as _allBuildings, ready as _buildingsReady } from '../data/buildings'

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
const ZONING_SUB = { A: 'unnamed', B: 'unnamed', C: 'unnamed', D: 'storefronts', E: 'unnamed', F: 'storefronts', G: 'retail', H: 'unnamed', J: 'warehouses' }
const ZONING_LABELS = {
  A: 'Single-Family Residential', B: 'Two-Family Residential', C: 'Multi-Family Residential',
  D: 'Commercial / Mixed Use', E: 'Residential', F: 'Neighborhood Commercial',
  G: 'Local Commercial / Retail', H: 'Residential', J: 'Industrial',
}
const _landmarkBids = new Set(landmarksWithMenus.map(l => l.building_id).filter(Boolean))
const _landmarkAddrs = new Set(landmarksWithMenus.map(l => (l.address || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean))
function _buildBareBuildingListings(buildings) {
  return buildings
    .filter(b => b.address && !_landmarkBids.has(b.id) && !_landmarkAddrs.has(b.address.toLowerCase().replace(/\s+/g, ' ').trim()))
    .map(b => {
      const z = (b.zoning || '').replace(/[^A-Z]/g, '').charAt(0)
      const arch = b.architecture || {}
      const style = arch.style || null
      const yearBuilt = b.year_built || arch.year_built || null
      const stories = b.stories || null
      const historicStatus = b.historic_status || null
      const sqft = b.building_sqft || null
      const zoningLabel = ZONING_LABELS[z] || null
      return {
        id: b.id,
        name: b.name || b.address,
        address: b.address,
        building_id: b.id,
        category: ZONING_CAT[z] || 'residential',
        subcategory: ZONING_SUB[z] || 'unnamed',
        zoning: z,
        zoning_label: zoningLabel,
        year_built: yearBuilt,
        stories,
        style,
        historic_status: historicStatus,
        building_sqft: sqft,
        description: [
          yearBuilt ? `Built ${yearBuilt}.` : null,
          stories ? `${stories}-story` : null,
          style ? `${style} style.` : null,
          zoningLabel ? `Zoned ${zoningLabel}.` : null,
          historicStatus === 'contributing' ? 'Contributing structure in the Lafayette Square Historic District.' : null,
          sqft ? `${sqft.toLocaleString()} sq ft.` : null,
        ].filter(Boolean).join(' '),
        _bare: true,
      }
    })
}

// Initially empty — populated once buildings.json loads
let bareBuildingListings = []
_buildingsReady.then(({ buildings }) => {
  bareBuildingListings = _buildBareBuildingListings(buildings)
  // Merge into store if init already ran
  const state = useListings.getState()
  if (state.fetched) {
    const current = state.listings.filter(l => !l._bare)
    useListings.setState({ listings: [...current, ...bareBuildingListings] })
  }
})

const allListings = [...landmarksWithMenus]

export { bareBuildingListings }

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
