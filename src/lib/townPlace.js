/**
 * THE TOWN'S PLACE ON THE GLOBE — where the sun, the moon, the stars, the season and the sky's
 * schedule are computed from. One module owns it; everything that needs a latitude asks here.
 *
 * ⭐ WHY (BRIEF-one-town-assembly, Warden's ruling (b), 2026-09-27). Ten renderer files read
 * `INSTANCE.geography` at module load: the boot town's latitude, frozen. Stage switches towns live,
 * so a switch from Lafayette Square to Provincetown kept St. Louis's sun, moon, stars, season and
 * sky schedule over Cape Cod. <Town lookId> now moves the place (TownBridge.jsx → setTownPlace), and
 * every reader resolves it AT USE, so the sun, the moon and the calendar change on the same frame.
 * ▶ node checks/claims-the-town-reads-no-player-store.mjs fails any other renderer read of it.
 *
 * The page's boot town is the starting place — every app boots on a town (`?look=`), and a sky
 * embed that mounts no <Town> draws that town. It is where the page IS, not a fallback for an unknown.
 */
import { useSyncExternalStore } from 'react'
import { INSTANCE } from '../instance.js'

function placeOf(geography, lookId) {
  const { lat, lon, timezone, lonToMeters, latToMeters } = geography || {}
  if (![lat, lon, lonToMeters, latToMeters].every(Number.isFinite) || !timezone) {
    throw new Error(`[townPlace] ⛔ "${lookId}" has no geography { lat, lon, timezone, lonToMeters, latToMeters } — it cannot be placed`)
  }
  return Object.freeze({ lookId, lat, lon, timezone, lonToMeters, latToMeters })
}

let _place = placeOf(INSTANCE.geography, INSTANCE.lookId)
const _subs = new Set()

/** Where the town being drawn stands: { lookId, lat, lon, timezone, lonToMeters, latToMeters }. */
export function townPlace() { return _place }

/** Move the place to a town's geography. Written by TownBridge.jsx only. */
export function setTownPlace(geography, lookId) {
  if (_place.lookId === lookId && _place.lat === geography?.lat && _place.lon === geography?.lon) return
  _place = placeOf(geography, lookId)
  for (const fn of _subs) fn()
}

function subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn) }
/** The place, re-rendering when <Town> moves it. */
export function useTownPlace() { return useSyncExternalStore(subscribe, townPlace) }
