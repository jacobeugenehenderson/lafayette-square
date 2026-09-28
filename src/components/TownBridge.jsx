/**
 * TownBridge — THE RENDERER'S INTERNAL STATE, fed from <Town>'s props. The one writer.
 *
 * ⭐ WHY A BRIDGE (BRIEF-one-town-assembly §4, Warden's ruling 4, 2026-09-27). <Town>'s props are its
 * only inputs, but the renderer's leaves still read three stores: the camera store's `townShot`
 * (useSceneJson, CloudDome, CelestialBodies, OverheadTrees), the selection store (SlabBuildings,
 * CityModel, SetPiece), and the town's place on the globe (lib/townPlace.js — the sun, the moon,
 * the season, the sky's schedule). This module is the ONLY thing that writes them from outside
 * input, so an app that is not the old player (The Ward) drives the town through props alone.
 * Moving the leaves onto props directly is a follow-up brief; until then this is where the
 * boundary is, and ▶ node checks/claims-the-town-reads-no-player-store.mjs holds it.
 *
 * The place moves in a LAYOUT effect: a live town switch in Stage moves the sun, the moon and the
 * calendar before the next frame is drawn, so no frame mixes two towns.
 */
import { useLayoutEffect, useRef } from 'react'
import useCamera from '../hooks/useCamera'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import { setTownPlace } from '../lib/townPlace.js'
import { townForLook } from '../instance.js'

// <Town shot> → the store's shot key (the vocabulary useSceneJson's per-shot looks are keyed by).
export const SHOT_KEY = { movie: 'hero', plan: 'browse', street: 'street' }

/** Moves the town's place on the globe to `lookId`'s. Mounted by <Town>, and by Stage's Designer, which draws no <Town>. */
export function TownPlace({ lookId }) {
  useLayoutEffect(() => {
    const town = townForLook(lookId)
    if (!town) throw new Error(`[Town] ⛔ look "${lookId}" resolves to no town — there is nowhere to put its sun`)
    setTownPlace(town.geography, lookId)
  }, [lookId])
  return null
}

export default function TownBridge({ lookId, shot, selectedId, onSelectBuilding }) {
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

  return <TownPlace lookId={lookId} />
}
