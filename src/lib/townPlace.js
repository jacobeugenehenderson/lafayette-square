/**
 * THE TOWN'S PLACE ON THE GLOBE — where the sun, the moon, the stars, the season and the sky's
 * schedule are computed from. One module holds it; everything that needs a latitude asks here.
 *
 * ⭐ WHY (BRIEF-one-town-assembly, Warden's rulings, 2026-09-27/28). Ten renderer files read
 * `INSTANCE.geography` at module load: the boot town's latitude, frozen, resolved by the kit's own
 * instance.js — which falls back to town #1 for a town it cannot place. The place is now MOVED here by
 * whoever knows the town: <Town town> (TownPlace.jsx), or an app's entry for its own boot town
 * (placeTown). Every reader resolves it AT USE, so the sun, the moon and the calendar change together.
 * ▶ node checks/claims-the-town-reads-no-player-store.mjs
 *
 * ⛔ It starts EMPTY and a read before anything is placed THROWS. There is no default town.
 */
import { useSyncExternalStore } from 'react'

function placeOf(geography, lookId) {
  const { lat, lon, timezone, lonToMeters, latToMeters } = geography || {}
  if (![lat, lon, lonToMeters, latToMeters].every(Number.isFinite) || !timezone) {
    throw new Error(`[townPlace] ⛔ "${lookId}" has no geography { lat, lon, timezone, lonToMeters, latToMeters } — it cannot be placed`)
  }
  return Object.freeze({ lookId, lat, lon, timezone, lonToMeters, latToMeters })
}

let _place = null
const _subs = new Set()

/** Where the town being drawn stands: { lookId, lat, lon, timezone, lonToMeters, latToMeters }. Throws until placed. */
export function townPlace() {
  if (!_place) throw new Error('[townPlace] ⛔ no town has been placed — mount <Town town>, or call placeTown(town) at the app\'s entry')
  return _place
}

/** Move the place to a town's geography. Called by TownPlace.jsx only. */
export function setTownPlace(geography, lookId) {
  if (_place && _place.lookId === lookId && _place.lat === geography?.lat && _place.lon === geography?.lon) return
  _place = placeOf(geography, lookId)
  for (const fn of _subs) fn()
}

function subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn) }
/** The place, re-rendering when it moves. Throws until placed, like townPlace(). */
export function useTownPlace() { return useSyncExternalStore(subscribe, townPlace) }
/** The Look the place belongs to, or null — for a gate that waits for it. */
export function placedLook() { return _place?.lookId ?? null }
export function onPlaceMoved(fn) { return subscribe(fn) }
