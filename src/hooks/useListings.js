import { create } from 'zustand'
import { loadInstanceData } from '../data/loadInstanceData.js'
import { INSTANCE } from '../instance.js'
import { buildings as _allBuildings, ready as _buildingsReady } from '../data/buildings'
import { ensureMenuIds } from '../lib/menuIdentity.js'
import { classifyZoning } from '../tokens/categories.js'

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
 * Bare buildings (no landmark listing) are included as synthetic listings, categorised
 * by THE BUILDING'S OWN `category` where it has one, and only by the St. Louis zoning
 * letter where it does not. ⛔ "Categorised by zoning" describes Lafayette Square — the
 * one town that ships zoning and no category — never the kit: huron, hipointe-demun and
 * altadena all ship a category and no zoning at all.
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

// Generate synthetic listings for bare buildings using zoning codes.
// ⛔ The three local tables that stood here — ZONING_CAT, ZONING_SUB, ZONING_LABELS —
// are gone. They were one of five disagreeing copies; the home is
// `src/tokens/categories.js`, which was also checked against St. Louis Title 26 (the
// majority of the copies were wrong about `D` and `H`).
let _landmarkBids = new Set()
let _landmarkAddrs = new Set()
function _buildBareBuildingListings(buildings) {
  // ⛔⛔ `b.address &&` WAS A SILENT DROP, AND IT WAS MOST OF THE TOWN. A building with
  // no address vanished from the Society Pages with nothing said. The building still
  // cannot be listed without something to call it, but the count is now reported rather
  // than swallowed, so "this town has no address spine" is visible instead of looking
  // like a small town.
  // ⭐ AND THE NUMBER THAT USED TO SIT HERE — "huron: ~3,627 of 3,678" — WAS FROM BEFORE
  // ITS PARCEL WELL WAS DECLARED and is now false: huron is 105 of 3,678 (97% addressed),
  // which is why its roster was wired into `loadInstanceData` on 2026-09-21. ⛔ Re-derive,
  // never quote — the town that currently has NO address spine is altadena (0 of 15,397),
  // and that is why it is deliberately not wired.
  const addressless = buildings.filter(b => !b.address).length
  if (addressless) {
    console.warn(`[listings] ${addressless} of ${buildings.length} buildings have NO ADDRESS and cannot appear in the ` +
      `Society Pages. That is an intake gap, not an empty town — check this scene's sources.json parcel well.`)
  }
  return buildings
    .filter(b => b.address && !_landmarkBids.has(b.id) && !_landmarkAddrs.has(b.address.toLowerCase().replace(/\s+/g, ' ').trim()))
    .map(b => {
      const arch = b.architecture || {}
      const style = arch.style || null
      const yearBuilt = b.year_built || arch.year_built || null
      const stories = b.stories || null
      const historicStatus = b.historic_status || null
      const sqft = b.building_sqft || null
      // ⛔⛔ `ZONING_CAT[z] || 'residential'` WAS `CLAUDE.md` LAYER 0 q2 VERBATIM: a town
      // with no St. Louis zoning letter got every building filed as residential, with no
      // way for anyone downstream to tell a KNOWN residential building from an unknown
      // one. `classifyZoning` returns null for an unreadable code and null travels.
      // ⭐ The roster's own `category`, which the bake now derives from the parcel's
      // structural USE when zoning is unreadable, is preferred when present — it is a
      // real signal from a non-St-Louis source rather than a re-guess from the letter.
      const zoned = classifyZoning(b.zoning, b.zoning_code_format || 'stl-letter')
      const zoningLabel = zoned ? zoned.label : null
      return {
        id: b.id,
        name: b.name || b.address,
        address: b.address,
        building_id: b.id,
        category: b.category || (zoned && zoned.category) || null,
        subcategory: b.subcategory || (zoned && zoned.subcategory) || null,
        zoning: b.zoning || null,
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
