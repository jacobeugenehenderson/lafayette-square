/**
 * TownBridge — THE RENDERER'S INTERNAL STATE, fed from <Town>'s props. The one writer.
 *
 * ⭐ WHY A BRIDGE (BRIEF-one-town-assembly §4, Warden's ruling 4, 2026-09-27). <Town>'s props are its
 * only inputs, but the renderer's leaves still read shared state: the camera store's `townShot`
 * (useSceneJson, CloudDome, CelestialBodies, OverheadTrees), the selection store (SlabBuildings,
 * CityModel, SetPiece), the town's place on the globe (lib/townPlace.js — the sun, the moon, the season,
 * the sky's schedule) and the terrain every piece stands on (utils/terrainShader.js). This module is the
 * ONLY thing that writes them from outside input, so an app that is not the old player (The Ward) drives
 * the town through props alone. ▶ node checks/claims-the-town-reads-no-player-store.mjs
 *
 * ⭐ THE TOWN IS PASSED IN (Warden, 2026-09-28): `town` is the installation's identity — the shape of a town
 * manifest's `identity` ({ geography, skyMode, profile, setPiece, … }); the kit's instance modules carry the
 * same fields. The Look is passed beside it (`lookId`). Nothing here resolves a town from the kit — an app does
 * (the kit's apps from src/instance.js, The Ward from its manifest).
 */
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import useCamera from '../hooks/useCamera'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import { setTownPlace, placedLook, onPlaceMoved } from '../lib/townPlace.js'
import { reloadTerrain, terrainLook, onTerrainReload } from '../utils/terrainShader'

// <Town shot> → the store's shot key (the vocabulary useSceneJson's per-shot looks are keyed by).
export const SHOT_KEY = { movie: 'hero', plan: 'browse', street: 'street' }

function requireTown(town, lookId) {
  if (!town?.geography) throw new Error(`[Town] ⛔ needs the \`town\` prop — the installation's identity ({ geography, skyMode, profile, setPiece, … }, a town manifest's \`identity\`); got ${town ? `{ ${Object.keys(town).join(', ')} }` : town}`)
  if (!lookId) throw new Error('[Town] ⛔ needs the `lookId` prop — the Look being drawn')
  return town
}

/**
 * Place a town on the globe: the sun, the moon, the season and the sky's schedule follow it. An app's entry
 * calls this once for the town it boots on (its clock and panels read the place before any <Town> mounts);
 * <Town> moves it to the town it is given.
 */
export function placeTown(town, lookId) {
  requireTown(town, lookId)
  setTownPlace(town.geography, lookId)
}

/** Places `town` and loads its terrain. Mounted by <Town>, and by Stage where it draws no <Town> (Designer, its hand-assembly). */
export function TownPlace({ town, lookId }) {
  requireTown(town, lookId)
  useLayoutEffect(() => { placeTown(town, lookId) }, [town, lookId])
  useLayoutEffect(() => { reloadTerrain(lookId) }, [lookId])
  return null
}

const subscribeReady = (fn) => { const a = onPlaceMoved(fn), b = onTerrainReload(fn); return () => { a(); b() } }
/** True once `lookId`'s place and terrain are both loaded — <Town> draws nothing before, so no piece stands on another town's ground. */
export function useTownLoaded(lookId) {
  return useSyncExternalStore(subscribeReady, () => placedLook() === lookId && terrainLook() === lookId)
}

export default function TownBridge({ town, lookId, shot, selectedId, onSelectBuilding }) {
  requireTown(town, lookId)
  const key = SHOT_KEY[shot]
  if (!key) throw new Error(`[Town] ⛔ shot "${shot}" is not one of ${Object.keys(SHOT_KEY).join(' · ')}`)
  useLayoutEffect(() => { useCamera.setState({ townShot: key }) }, [key])

  // Selection in: an app that owns its selection passes selectedId; the store follows it.
  const owned = selectedId !== undefined
  useLayoutEffect(() => {
    if (!owned) return
    const st = useSelectedBuilding.getState()
    if (st.selectedId === selectedId) return
    if (selectedId == null) st.deselect()
    else useSelectedBuilding.setState({ selectedId, showCard: false })
  }, [owned, selectedId])

  // Selection out: a click on a building (the leaves write the store) is reported to the app.
  const report = useRef(onSelectBuilding)
  report.current = onSelectBuilding
  const given = useRef(selectedId)
  given.current = selectedId
  useLayoutEffect(() => useSelectedBuilding.subscribe((s, prev) => {
    if (s.selectedId === prev.selectedId || !report.current) return
    if (owned && s.selectedId === given.current) return   // the store following the prop, not a click
    report.current(s.selectedId)
  }), [owned])

  return <TownPlace town={town} lookId={lookId} />
}
