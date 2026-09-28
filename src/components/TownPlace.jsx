/**
 * TownPlace — where the town stands, what it stands on, and what time it is there. The ONE writer of the
 * town's place (lib/townPlace.js), its terrain (utils/terrainShader.js) and, when an app owns it, its clock.
 *
 * ⭐ THE TOWN IS PASSED IN (Warden, 2026-09-28): `town` is the installation's identity — the shape of a town
 * manifest's `identity` ({ geography, skyMode, profile, setPiece, … }); the kit's instance modules carry the
 * same fields. The Look is passed beside it (`lookId`). Nothing here resolves a town from the kit.
 * (This was the second half of TownBridge.jsx; the first half — copying <Town>'s props into the old player's
 * stores — is gone: the leaves read townContext.js. BRIEF-renderer-leaves-take-props.)
 * ▶ node checks/claims-the-town-reads-no-player-store.mjs
 */
import { useLayoutEffect, useSyncExternalStore } from 'react'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { setTownPlace, placedLook, onPlaceMoved } from '../lib/townPlace.js'
import { reloadTerrain, terrainLook, onTerrainReload } from '../utils/terrainShader'

function requireTown(town, lookId) {
  if (!town?.geography) throw new Error(`[Town] ⛔ needs the \`town\` prop — the installation's identity ({ geography, skyMode, profile, setPiece, … }, a town manifest's \`identity\`); got ${town ? `{ ${Object.keys(town).join(', ')} }` : town}`)
  if (!lookId) throw new Error('[Town] ⛔ needs the `lookId` prop — the Look being drawn')
  return town
}

/**
 * Place a town on the globe: the sun, the moon, the season and the sky's schedule follow it. An app's entry
 * places the town it boots on (placeBootTown.js — its clock and panels read the place before any <Town>
 * mounts); <Town> moves it to the town it is given.
 */
export function placeTown(town, lookId) {
  requireTown(town, lookId)
  setTownPlace(town.geography, lookId)
}

/**
 * Places `town`, loads its terrain, and — when `time` is given — writes the town's clock: a Date is the town's
 * instant (setTime keeps the calendar in step); null returns it to live once; undefined leaves the clock to the
 * app. Mounted by <Town>, and by Stage where it draws no <Town> (Designer, its hand-assembly).
 */
export function TownPlace({ town, lookId, time }) {
  requireTown(town, lookId)
  useLayoutEffect(() => { placeTown(town, lookId) }, [town, lookId])
  useLayoutEffect(() => { reloadTerrain(lookId) }, [lookId])
  const instant = time instanceof Date ? time.getTime() : time
  useLayoutEffect(() => {
    if (instant === undefined) return
    const tod = useTimeOfDay.getState()
    if (instant === null) { if (!tod.isLive) tod.returnToLive() }
    else tod.setTime(new Date(instant))
  }, [instant])
  return null
}

const subscribeReady = (fn) => { const a = onPlaceMoved(fn), b = onTerrainReload(fn); return () => { a(); b() } }
/** True once `lookId`'s place and terrain are both loaded — <Town> draws nothing before, so no piece stands on another town's ground. */
export function useTownLoaded(lookId) {
  return useSyncExternalStore(subscribeReady, () => placedLook() === lookId && terrainLook() === lookId)
}
