/**
 * SceneNeon — the single neon consumer, mounted identically by
 * LafayetteScene (Designer / Stage / LS production) and PreviewApp.
 *
 * Doctrine: project_preview_equals_ls_literally + project_stage_consumer_parity.
 * Neon tube geometry is never baked (FEATURES.md §"Render environments"):
 * it is runtime-built from live `_allBuildings` in every environment that
 * mounts NeonBands. Previously the `openPlaces` computation lived inline in
 * LafayetteScene, so Preview — which renders baked merged-mesh buildings via
 * BakedBuildings, not LafayetteScene — had no way to mount neon. Extracting
 * the computation here lets Preview render neon literally as production does.
 *
 * Two gates, decided by prop presence (mirrors the old inline logic):
 *   - `forceNeonOn` defined (Stage passes a store bool): force-on QA bypass;
 *     hours filter skipped so authoring doesn't lie about the current TOD.
 *   - `forceNeonOn` undefined (production / Preview): `_isWithinHours` is the
 *     sole gate — tubes auto-glow when a listing's authored hours intersect
 *     the current TOD. Buildings without authored hours stay dark.
 *
 * Height helpers (getFoundationHeight / getRoofPeakHeight) are imported from
 * LafayetteScene — both are hoisted `function` declarations, so the
 * LafayetteScene⟷SceneNeon circular import resolves safely at runtime.
 */
import { useMemo, useState, useEffect } from 'react'
import { buildings as _allBuildings } from '../data/buildings'
import useListings from '../hooks/useListings'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { getElevationRaw } from '../utils/elevation'
import { CATEGORY_HEX } from '../tokens/categories'
import { INSTANCE } from '../instance.js'
import NeonBands from './NeonBands.jsx'
import { getFoundationHeight, getRoofPeakHeight } from './LafayetteScene.jsx'

// ── Open-by-hours filter ────────────────────────────────────────────
// Glows when the place is currently open AND it's dark enough to see.
const _DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function _isWithinHours(hours, time) {
  if (!hours) return false // no hours set → neon off
  const day = _DAYS[time.getDay()]
  const slot = hours[day]
  if (!slot || !slot.open || !slot.close) return false // closed that day
  const mins = time.getHours() * 60 + time.getMinutes()
  const [oh, om] = slot.open.split(':').map(Number)
  const [ch, cm] = slot.close.split(':').map(Number)
  return mins >= oh * 60 + om && mins < ch * 60 + cm
}

// ── Default neon classification ─────────────────────────────────────
// Buildings without a listings.json entry still get neon tube geometry.
// The tube color is derived from St. Louis zoning code — the only
// classification field populated on buildings.json. Buckets:
//   A B C D E  →  residential   (Sage)
//   F G H I    →  services      (Prussian Blue)
//   J          →  community     (Terra Cotta)
//   null/other →  residential   (safe default for the ~4% missing zoning)
const _NEON_ZONING_CATEGORY = {
  A: 'residential', B: 'residential', C: 'residential', D: 'residential', E: 'residential',
  F: 'services',    G: 'services',    H: 'services',    I: 'services',
  J: 'community',
}
function defaultNeonCategoryForZoning(zoning) {
  return _NEON_ZONING_CATEGORY[zoning] || 'residential'
}
function defaultNeonCategoryForBuilding(building) {
  return defaultNeonCategoryForZoning(building.zoning)
}
function defaultNeonHexForBuilding(building) {
  return CATEGORY_HEX[defaultNeonCategoryForBuilding(building)]
}

// ── neonLookup — buildingId → { hex, hours, category } for listings ──
// Shared by LafayetteScene's per-id <Building> mounts AND openPlaces.
// Only currently-authored listings with `hours` are included; the
// openPlaces filter below decides on/off at the current TOD.
export function useNeonLookup() {
  const listings = useListings((s) => s.listings)
  return useMemo(() => {
    const map = {}
    listings.forEach(l => {
      const bid = l.building_id || l.id
      const hex = CATEGORY_HEX[l.category]
      if (!bid || !hex) return
      if (l.hours) {
        map[bid] = { hex, hours: l.hours, category: l.category }
      }
    })
    return map
  }, [listings])
}

/**
 * SceneNeon — computes openPlaces and renders the one merged <NeonBands>
 * mesh. Self-gates: returns null when no place is currently lit.
 */
export default function SceneNeon({ forceNeonOn, lookId = INSTANCE.lookId }) {
  const neonLookup = useNeonLookup()

  // Re-check open/closed every 60s so bands mount/unmount as places open
  // and close, rather than mounting all ~100+ and hiding with opacity 0.
  const [neonTick, setNeonTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNeonTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Slab path: when SlabBuildings has published the render-scoped index,
  // source neon geometry/anchors from it (production after cutover, and
  // Preview with the slab A/B on). Until then — Stage, and Preview with the
  // slab A/B off — fall back to live _allBuildings so nothing breaks
  // pre-cutover. Either way, listing hours/category still come from
  // useListings (content, not slab); the index only replaces the building
  // geometry/anchor/zoning side of openPlaces.
  const slabIndex = useSlabBuildingIndex((s) => s.index)

  // openPlaces — buildings eligible for tube geometry. Every building is a
  // candidate; listings-authored ones carry their authored category via
  // neonLookup, every other building falls back to a zoning-derived default.
  const openPlaces = useMemo(() => {
    const places = []
    const now = useTimeOfDay.getState().currentTime

    if (slabIndex) {
      for (const e of slabIndex.byNum) {
        const listingInfo = neonLookup[e.id]
        const category = listingInfo ? listingInfo.category : defaultNeonCategoryForZoning(e.zoning)
        const hours = listingInfo ? listingInfo.hours : null
        const on = forceNeonOn !== undefined ? !!forceNeonOn : _isWithinHours(hours, now)
        if (!on) continue
        // baseY + groundYRaw (== centroidY) are baked into the index by the
        // SAME anchor math the live path uses below, so tubes lift in lockstep
        // with their building on sloped terrain. NeonBands.buildTube reads only
        // footprint / baseY / groundYRaw / neon.category.
        places.push({ footprint: e.footprint, baseY: e.baseY, groundYRaw: e.centroidY, neon: { category } })
      }
      return places
    }

    for (const b of _allBuildings) {
      const listingInfo = neonLookup[b.id]
      const info = listingInfo || {
        hex: defaultNeonHexForBuilding(b),
        hours: null,
        category: defaultNeonCategoryForBuilding(b),
      }
      const on = forceNeonOn !== undefined
        ? !!forceNeonOn
        : _isWithinHours(info.hours, now)
      if (!on) continue
      // baseY = world Y of the rooftop. Foundation pedestal lift shifts
      // the building's mounted position; the neon tube must sit at the
      // same rooftop. NeonBands.buildTubeFor reads place.baseY.
      const baseY = getFoundationHeight(b) + b.size[1] + getRoofPeakHeight(b) + 0.3
      // Mean-corner raw elevation — canonical anchor matching Foundations
      // and Building walls, so the neon mesh lifts in lockstep with its
      // building on sloped terrain.
      let groundYRaw
      const fp = b.footprint
      if (fp && fp.length >= 3) {
        let sum = 0
        for (let i = 0; i < fp.length; i++) sum += getElevationRaw(fp[i][0], fp[i][1])
        groundYRaw = sum / fp.length
      } else {
        groundYRaw = getElevationRaw(b.position[0], b.position[2])
      }
      places.push({ ...b, baseY, groundYRaw, neon: { category: info.category } })
    }
    return places
  }, [neonLookup, neonTick, forceNeonOn, slabIndex])

  if (openPlaces.length === 0) return null
  return <NeonBands places={openPlaces} lookId={lookId} />
}
