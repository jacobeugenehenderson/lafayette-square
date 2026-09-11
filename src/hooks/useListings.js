import { create } from 'zustand'
import { loadInstanceData } from '../data/loadInstanceData.js'
import { INSTANCE } from '../instance.js'
import { buildings as _allBuildings, ready as _buildingsReady } from '../data/buildings'
import { ensureMenuIds } from '../lib/menuIdentity.js'

/**
 * Listing data store.
 *
 * Seeded from the bundled landmarks.json so the scene has places to draw, then
 * hydrated by `useInit.runInit()` — the ONE API ingest path, which merges GAS
 * over the bundle so guardian edits win.
 *
 * ⛔ There used to be a second `refresh()` here doing a byte-for-byte identical
 * merge, with no callers since auto-refresh was removed. Excised 2026-09-10 —
 * two hydration paths for one store is how the two drift apart, and it had
 * already happened: the menu-id normalizer went onto the dead one first.
 *
 * Bare buildings (no landmark listing) are included as synthetic
 * listings, categorized by St. Louis zoning code.
 *
 * Consumers access `listings` (the array) or use the lookup helpers.
 */
// landmarks + menus load via the installation-data seam (loadInstanceData),
// keyed by INSTANCE.lookId — so a non-LS install supplies its own content.
// Was a SYNCHRONOUS module-scope seed ("renders without delay"); now fills
// post-ready and rides the app splash (Scene mounts on splashReady ~1500ms;
// SidePanel fades ~1.0s) — the same gate that already masks the async buildings
// load. The API merge (`useInit.runInit`) awaits `_landmarksReady` so the
// static fallback fields are never lost to a race. (Phase 2, Batch B.)
export let landmarksWithMenus = []

// A menu item needs an IDENTITY, not a position. Menus arrive from two homes —
// the bundled instance payload and GAS `menu_json` — and the merge in
// `useInit.runInit` can swap one for the other under a live cart, so both are
// normalized on the way in and independently derive the SAME id for the same
// item. Idempotent: an item that already carries an id keeps it.
// See `src/lib/menuIdentity.js`.
export function normalizeListingMenu(l) {
  if (!l?.menu?.sections?.length) return l
  const menu = ensureMenuIds(l.menu)
  return menu === l.menu ? l : { ...l, menu }
}

// Generate synthetic listings for bare buildings using zoning codes
const ZONING_CAT = { A: 'residential', B: 'residential', C: 'residential', D: 'commercial', E: 'residential', F: 'commercial', G: 'commercial', H: 'residential', J: 'industrial' }
const ZONING_SUB = { A: 'unnamed', B: 'unnamed', C: 'unnamed', D: 'storefronts', E: 'unnamed', F: 'storefronts', G: 'retail', H: 'unnamed', J: 'warehouses' }
const ZONING_LABELS = {
  A: 'Single-Family Residential', B: 'Two-Family Residential', C: 'Multi-Family Residential',
  D: 'Commercial / Mixed Use', E: 'Residential', F: 'Neighborhood Commercial',
  G: 'Local Commercial / Retail', H: 'Residential', J: 'Industrial',
}
let _landmarkBids = new Set()
let _landmarkAddrs = new Set()
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
          historicStatus === 'contributing' ? `Contributing structure in the ${INSTANCE.profile.historicDistrictName}.` : null,
          sqft ? `${sqft.toLocaleString()} sq ft.` : null,
        ].filter(Boolean).join(' '),
        _bare: true,
      }
    })
}

// landmarks + menus resolved → fill the derived lookups and seed the store.
export const _landmarksReady = Promise.all([
  loadInstanceData(INSTANCE.lookId, 'landmarks').ready,
  loadInstanceData(INSTANCE.lookId, 'menus').ready,
]).then(([staticData, menuData]) => {
  const menus = menuData || {}
  landmarksWithMenus = (staticData?.landmarks || []).map(lm =>
    menus[lm.id] ? normalizeListingMenu({ ...lm, menu: menus[lm.id] }) : lm
  )
  _landmarkBids = new Set(landmarksWithMenus.map(l => l.building_id).filter(Boolean))
  _landmarkAddrs = new Set(landmarksWithMenus.map(l => (l.address || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean))
  // Seed the store with landmarks now they're ready — unless the API init
  // already populated + fetched (then it owns the list).
  if (!useListings.getState().fetched) {
    useListings.setState({ listings: [...landmarksWithMenus, ...bareBuildingListings] })
  }
  return landmarksWithMenus
})

// Bare-building synthetic listings need BOTH buildings (the source) AND
// landmarks (the dedup sets _landmarkBids/_landmarkAddrs) — so gate on both.
let bareBuildingListings = []
Promise.all([_landmarksReady, _buildingsReady]).then(([, { buildings }]) => {
  bareBuildingListings = _buildBareBuildingListings(buildings)
  // Merge into store if init already ran (mirrors the original fetched-gate).
  const state = useListings.getState()
  if (state.fetched) {
    const current = state.listings.filter(l => !l._bare)
    useListings.setState({ listings: [...current, ...bareBuildingListings] })
  }
})

export { bareBuildingListings }

const useListings = create((set, get) => ({
  listings: [],
  loading: false,
  fetched: false,

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
