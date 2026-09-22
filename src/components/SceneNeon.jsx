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
import { useMemo, useState, useEffect, useReducer } from 'react'
import { isOpenAt } from '../lib/openNow.js'
import { buildings as _allBuildings } from '../data/buildings'
import useListings from '../hooks/useListings'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { getElevationRaw } from '../utils/elevation'
import { CATEGORY_HEX, UNKNOWN_HEX } from '../tokens/categories'
import { INSTANCE } from '../instance.js'
import NeonBands from './NeonBands.jsx'
import { getFoundationHeight, roofTopRingFor } from './LafayetteScene.jsx'

// ── Open-by-hours filter ────────────────────────────────────────────
// Glows when the place is currently open. ⛔ THERE IS NO DARKNESS TERM — this
// line used to claim "AND it's dark enough to see" and nothing in this file or
// NeonBands has ever read sun elevation. Believed on sight, it sends the next
// reader hunting for a gate that does not exist.
// ⛔ ONE HOME FOR THIS PREDICATE — `src/lib/openNow.js`. This file used to carry
// its own copy, byte-identical to two others, and all three read `mins >= open &&
// mins < close`, which is FALSE at every minute of the day when a place closes
// after midnight. `PlaceCard` had the only correct version. See that module.
const _isWithinHours = isOpenAt

// The WHICH-tubes gate, unified across the slab and live paths. Stage's
// `forceNeonOn` master overrides everything; otherwise authored hours are the
// sole arbiter, exactly as the docblock above has always said.
//
// ⛔ A DEFAULT DUSK→LATE WINDOW LIVED HERE AND WAS CUT (Jacob, 2026-09-10:
//    "Neon is on for buildings with open hours. A new town with nothing on is
//    dark. Just no.").
//    It lit any POI with no authored hours from 5pm to 2am so that a fresh
//    install would "glow out of the box instead of sitting dark" — which is a
//    FALLBACK, and a fallback that makes an unauthored town look authored is
//    the exact failure the kit doctrine names: it converts missing data into a
//    plausible-looking success, and the operator sees a lit map and never
//    learns nothing has been entered.
//    ⚠️ It also contradicted this file's own docblock — eleven lines apart —
//    and every doc that describes the rule (README's neon row, cartograph
//    ARCHITECTURE §8 "hours gate is sole arbiter"). None of them ever adopted
//    it; it arrived inside an unrelated tube-sizing commit and was never
//    written down. Dark IS the correct rendering of a town with no hours.
function _neonOn({ forceNeonOn, hours, now }) {
  if (forceNeonOn !== undefined) return !!forceNeonOn
  return _isWithinHours(hours, now)
}

// ── Default neon classification ─────────────────────────────────────
// Buildings without a listings.json entry still get neon tube geometry.
// The tube color is derived from St. Louis zoning code — the only
// classification field populated on buildings.json. Buckets:
//   A B C D E  →  residential   (Sage)
//   F G H I    →  services      (Prussian Blue)
//   J          →  community     (Terra Cotta)
//
// ⭐⭐ THIS TABLE IS DELIBERATELY NOT `STL_ZONING`, AND THAT IS A RULING (Jacob,
// 2026-09-20), not drift. It maps zoning → NEON COLOUR; `categories.js#STL_ZONING`
// maps zoning → SEARCH CATEGORY. `INTAKE-CATALOGUE §3.6` calls them *"two unrelated
// systems"* and they are: F/G/H are commercial districts by ordinance, and reading
// them as Prussian Blue "services" is a look decision about a night skyline, not a
// claim about what the building is. ⛔ Do not unify these on your own judgement —
// it was proposed and ruled against.
const _NEON_ZONING_CATEGORY = {
  A: 'residential', B: 'residential', C: 'residential', D: 'residential', E: 'residential',
  F: 'services',    G: 'services',    H: 'services',    I: 'services',
  J: 'community',
}
// ⛔⛔ `|| 'residential'` USED TO LIVE ON THE NEXT LINE, under a comment calling it a
// *"safe default for the ~4% missing zoning"*. It is not safe and the 4% is an LS
// figure: on a town with no St. Louis zoning letter at all it is 100%, and the whole
// map poured Sage — a confident, beautiful, entirely wrong classification of every
// building in the neighbourhood, visible to the operator as a normal night.
// ⭐ Unknown now returns null and is painted `UNKNOWN_HEX` — slate, in no category —
// so the gap is visible on the surface the operator actually eye-gates.
function defaultNeonCategoryForZoning(zoning) {
  return _NEON_ZONING_CATEGORY[zoning] || null
}
function defaultNeonCategoryForBuilding(building) {
  // A town whose assessor does not speak the St. Louis alphabet has no readable letter
  // here at all, and must not be read as though it did.
  if (building.zoning_code_format && building.zoning_code_format !== 'stl-letter') return null
  return defaultNeonCategoryForZoning(building.zoning)
}
function defaultNeonHexForBuilding(building) {
  const cat = defaultNeonCategoryForBuilding(building)
  return cat ? CATEGORY_HEX[cat] : UNKNOWN_HEX
}

// ── neonLookup — buildingId → { hex, hours, category } for listings ──
// Shared by LafayetteScene's per-id <Building> mounts AND openPlaces.
// Every REAL listing (a business/POI) is included, whether or not it has
// authored `hours`; the openPlaces gate below decides on/off. A present but
// null `hours` marks a POI that glows on the default window (dusk→late) so a
// fresh install looks alive out of the box — an authored `hours` still wins.
// Synthetic zoning-default listings (`_bare`) are EXCLUDED: a residential house
// with no real POI stays dark, rather than the whole hood lighting up at night.
export function useNeonLookup() {
  const listings = useListings((s) => s.listings)
  return useMemo(() => {
    const map = {}
    listings.forEach(l => {
      if (l.status === 'closed') return
      if (l._bare) return // synthetic zoning listing — not a real POI, no neon
      const bid = l.building_id || l.id
      const hex = CATEGORY_HEX[l.category]
      if (!bid || !hex) return
      map[bid] = { hex, hours: l.hours || null, category: l.category }
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
        const on = _neonOn({ forceNeonOn, hours, now })
        if (!on) continue
        // baseY + groundYRaw (== centroidY) are baked into the index by the
        // SAME anchor math the live path uses below, so tubes lift in lockstep
        // with their building on sloped terrain. NeonBands.buildTube traces
        // roofOutline (true roof edge, Alidade's baked field) and falls back to
        // footprint where it's absent/degenerate; baseY / groundYRaw / category
        // are unchanged.
        places.push({ footprint: e.footprint, roofOutline: e.roofOutline, baseY: e.baseY, groundYRaw: e.centroidY, neon: { category } })
      }
      return places
    }

    for (const b of _allBuildings) {
      // The live path builds tube geometry from INLINE building geometry (size +
      // footprint). Roster-only installs (e.g. HPDM's content roster) carry no
      // inline geometry — their tubes come from the slab path above. Skip such
      // buildings here so a null-slabIndex cold-load moment can't crash on
      // `b.size[1]` and take down the scene. (HPDM SceneNeon crash, 2026-07-16.)
      if (!Array.isArray(b.size) || !b.footprint || b.footprint.length < 3) continue
      const listingInfo = neonLookup[b.id]
      const info = listingInfo || {
        hex: defaultNeonHexForBuilding(b),
        hours: null,
        category: defaultNeonCategoryForBuilding(b),
      }
      const on = _neonOn({ forceNeonOn, hours: info.hours, now })
      if (!on) continue
      // baseY = world Y of the building TOP (the wall/roof joint, the eave) —
      // dropped the roof-peak lift so neon HUGS the building instead of hovering
      // at the peak (Jacob 2026-06-27). Foundation pedestal lift shifts the
      // mounted position; the tube sits at the eave. buildTube traces the
      // footprint, so the ring matches the building's size on every roof type.
      const baseY = getFoundationHeight(b) + b.size[1] + 0.3
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
      // roofTopRingFor derives the SAME rooftop ring bake-buildings bakes into
      // roofOutline (inset cap for mansard, footprint for flat/hip), so Stage's
      // live-path neon traces the roof edge identically to the slab path — the
      // Preview slab A/B toggle shows no pop (project_stage_consumer_parity).
      places.push({ ...b, baseY, groundYRaw, roofOutline: roofTopRingFor(b), neon: { category: info.category } })
    }
    return places
  }, [neonLookup, neonTick, forceNeonOn, slabIndex])

  // Cold-load reconcile flush — the same frameloop="demand" issue that hid the
  // trees (see InstancedTrees ParkPopulation). On a cold load the neon mesh and
  // its scene.json-driven brightness uniforms settle in while the loop is idle,
  // so neon stays dark until a state-change "poke" (navigating Browse↔Hero,
  // nudging a knob). Rendering ≠ reconciling, so a frame alone doesn't fix it.
  // Self-poke: once there are open places, force a few re-renders across the
  // load window so the mesh attaches + paints with its resolved uniforms, then
  // stop. (2026-06-28 — the "neon not showing at all" bug.)
  const [, forceReconcile] = useReducer(x => (x + 1) & 0xffff, 0)
  useEffect(() => {
    if (openPlaces.length === 0) return
    let id, n = 0
    const tick = () => { forceReconcile(); if (++n < 20) id = setTimeout(tick, 400) }  // ~8s
    id = setTimeout(tick, 400)
    return () => clearTimeout(id)
  }, [openPlaces.length])

  if (openPlaces.length === 0) return null
  return <NeonBands places={openPlaces} lookId={lookId} />
}
