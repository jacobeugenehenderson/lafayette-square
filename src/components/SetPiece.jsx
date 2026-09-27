/**
 * SetPiece: THE one mount for a town's set-piece, in every app that draws a town.
 *
 * ⭐ WHY ONE MOUNT (2026-09-26). The Pilgrim Monument was hand-mounted in Scene and Preview
 * only, so Jacob baked Provincetown in Stage and the monument was missing there. Every
 * set-piece added by hand to every app is a set-piece that town #2 loses in whichever app
 * nobody remembered. So each app mounts THIS, and this picks the renderer from the town's
 * own declaration (`setPiece.kind` in src/instances/<town>.js).
 * ▶ node checks/claims-every-app-mounts-the-set-piece.mjs
 *
 * `lookId` names the town. Stage switches towns live, so a mount there passes the active
 * look; the global INSTANCE is only the page's boot town. Absent `lookId` means INSTANCE.
 * A town with no set-piece renders nothing. A `kind` with no renderer THROWS: it never
 * quietly draws nothing.
 *
 * ⭐ THE SLOT LIGHTS IT (BRIEF-set-piece-contract item 3). Every set-piece gets <SetPieceUplights>, mounted as the
 * renderer's CHILD so it sits in the set-piece's base frame, lit by the town's `setPieceLight` channel (Stage's
 * live override, else scene.json). A renderer declares `Component.extent = { topM, halfWidthM }` and draws its
 * `children` inside its base group; claims-every-app-mounts-the-set-piece fails one that doesn't.
 *
 * ⚠️ The Gateway Arch is NOT folded in here. It is placed by a Look's authored `arch`
 * channel, not by the town's instance, and it carries its own Stage overrides. Folding
 * it in is ROADMAP H-7's set-piece question, not a mount change.
 */
import { INSTANCE, mapForLook } from '../instance.js'
import { instanceForMap } from '../instances/registry.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import PilgrimMonument from './PilgrimMonument.jsx'
import SetPieceUplights from './SetPieceUplights.jsx'

// kind → renderer. The only place a set-piece component is imported.
const RENDERERS = {
  'pilgrim-monument': PilgrimMonument,
}

function townFor(lookId) {
  if (!lookId || lookId === INSTANCE.lookId) return INSTANCE
  const map = mapForLook(lookId)
  const town = map && instanceForMap(map)
  return town ? { ...town, lookId, mapId: map } : null
}

/** The set-piece a Look's town declares, or null — for panels that show its controls only where it exists. */
export function setPieceOf(lookId) { return townFor(lookId)?.setPiece ?? null }

export default function SetPiece({ lookId, lightOverride, ...props }) {
  const town = townFor(lookId)
  const scene = useSceneJson(town?.lookId ?? lookId)
  const sp = town?.setPiece
  if (!sp) return null
  const R = RENDERERS[sp.kind]
  if (!R) throw new Error(`[SetPiece] ⛔ "${town.lookId}" declares a set-piece of kind "${sp.kind}", and no renderer exists for it (have: ${Object.keys(RENDERERS).join(', ')})`)
  return (
    <R town={town} {...props}>
      <SetPieceUplights channel={lightOverride ?? scene?.setPieceLight ?? null} topM={R.extent?.topM} halfWidthM={R.extent?.halfWidthM} />
    </R>
  )
}
