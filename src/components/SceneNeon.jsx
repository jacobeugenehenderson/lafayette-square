/**
 * SceneNeon — the single neon consumer, mounted by <Town> in every app. Neon belongs to a PLACE: each lit place gets its
 * own stretch of its building's wall from the slab (src/lib/neonPlaces.js), drawn by NeonBands. Geometry is never
 * baked — the slab carries the stretches' few points; the tubes and lines are built here, live.
 *
 * Two gates, decided by prop presence:
 *   - `forceNeonOn` defined (Stage passes a store bool): force-on QA bypass — every place lit, hours skipped, so
 *     authoring doesn't lie about the current TOD.
 *   - `forceNeonOn` undefined (production / Preview): a place's authored hours are the sole gate. A place without
 *     hours stays dark.
 */
import { useMemo, useState, useEffect, useReducer } from 'react'
import { isOpenAt } from '../lib/openNow.js'
import { useTownContext } from './townContext.js'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { CATEGORY_LABELS } from '../tokens/categories'
import { lookOf } from '../lib/lookOf.js'
import NeonBands from './NeonBands.jsx'
import { placeNeon } from '../lib/neonPlaces.js'

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

// ── neonPlaceList — the town's REAL places that can carry neon ──
// Every real listing (a business/POI), with or without authored `hours`; the gate decides on/off, and null `hours`
// is dark (there is no default window — see _neonOn). Synthetic zoning listings (`_bare`) are not places, and a
// category the taxonomy doesn't know has no colour to draw (its colour is the town's — categoryColor.js).
// The listings are <Town listings> (townContext.js) — the app's, never the old player's store.
// ⭐ PER PLACE, NOT PER BUILDING: this used to be one entry per building, last write winning, so one closed listing
// could darken a building where another place was open (6 of 22 lit buildings on Huron at 21:00, 2026-10-06).
export function useNeonPlaceList() {
  const { listings } = useTownContext()
  return useMemo(() => listings.filter((l) => l.status !== 'closed' && !l._bare && l.building_id && CATEGORY_LABELS[l.category]), [listings])
}

/**
 * SceneNeon — places each open place's neon on its own stretch (src/lib/neonPlaces.js) and renders the merged
 * <NeonBands>. Self-gates: returns null when no place is lit.
 */
// Stage's neon DENSITY: a stable per-building draw, so raising the knob only ADDS buildings (never reshuffles).
function _densityKeeps(id, density) {
  if (density == null || density >= 1) return true
  if (density <= 0) return false
  let h = 2166136261 >>> 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h / 4294967296 < density
}

// `litIds` (a Set of building ids, from <Town litIds>): only those buildings' places carry neon — how an app shows a
// chosen category or a search. Absent: every open place is lit.
export default function SceneNeon({ forceNeonOn, density, materialColors, litIds, lookId }) {
  lookOf(lookId, 'SceneNeon')
  const placeList = useNeonPlaceList()

  // Re-check open/closed every 60s so bands mount/unmount as places open and close.
  const [neonTick, setNeonTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNeonTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // The stretches come from the slab (SlabBuildings publishes the index; no neon until it has).
  const slabIndex = useSlabBuildingIndex((s) => s.index)
  // The town's clock by the minute: a scrubbed (or app-given) time re-decides which places are open.
  const clockMinute = useTimeOfDay((s) => Math.floor(s.currentTime.getTime() / 60000))

  const { stretches, census } = useMemo(() => {
    if (!slabIndex) return { stretches: [], census: null }
    const now = useTimeOfDay.getState().currentTime
    return placeNeon({
      entries: slabIndex.byNum,
      places: placeList,
      isLit: (p) => _neonOn({ forceNeonOn, hours: p.hours || null, now }),
      keep: (id) => _densityKeeps(id, density) && (!litIds || litIds.has(id)),
    })
  }, [placeList, neonTick, forceNeonOn, density, slabIndex, litIds, clockMinute])

  // ⛔ A lit place with no stretch is dark — SAY so, by cause, whenever the count changes (never a roofline instead).
  const darkKey = census ? JSON.stringify(census.dark) : ''
  useEffect(() => {
    if (!census || !Object.keys(census.dark).length) return
    const n = Object.values(census.dark).reduce((a, b) => a + b, 0)
    console.warn(`[neon] ${n} of ${census.lit} lit places are dark (by address ${census.address} · by street frontage ${census.frontage}):`, census.dark)
  }, [darkKey])   // eslint-disable-line react-hooks/exhaustive-deps

  // NeonBands draws open stretches: the wall points, the outward side from the building's footprint, the eave.
  // ⛔ groundY travels with groundYRaw: the sign rides its wall's whole lift (src/lib/buildingLift.js), and a sign handed no
  // groundY lifts by NaN — neither drawn nor pickable (every sign, 2026-10-06, until this field was passed).
  const openPlaces = useMemo(() => stretches.map((s) => ({ pts: s.pts, footprint: s.footprint, baseY: s.y, groundYRaw: s.groundYRaw, groundY: s.groundY, buildingId: s.buildingId, neon: { category: s.category } })), [stretches])

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
  return <NeonBands places={openPlaces} lookId={lookId} materialColors={materialColors} />
}
