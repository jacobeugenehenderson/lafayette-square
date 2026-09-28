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
 * ⭐ THE SLOT BINDS IT TO A BUILDING (BRIEF-set-piece-contract item 1). `setPiece.buildingId` names one of the town's
 * own buildings. The bake keeps that building's record in the slab (id + footprint) and builds no geometry for it, so
 * the id, the listing, the card and the 2D footprint are every other building's, and the only 3D is the renderer's.
 * The slot reads the footprint from the slab and passes it to the renderer as `footprint` (local [x, z] metres), and a
 * click on the set-piece selects the building, as a click on any building does. A missing record, or one the bake
 * extruded, THROWS.
 *
 * ⚠️ The Gateway Arch is NOT folded in here. It is placed by a Look's authored `arch`
 * channel, not by the town's instance, and it carries its own Stage overrides. Folding
 * it in is ROADMAP H-7's set-piece question, not a mount change.
 */
import { townForLook as townFor } from '../instance.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import PilgrimMonument from './PilgrimMonument.jsx'
import SetPieceUplights from './SetPieceUplights.jsx'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import useSelectedBuilding from '../hooks/useSelectedBuilding'

// kind → renderer. The only place a set-piece component is imported.
const RENDERERS = {
  'pilgrim-monument': PilgrimMonument,
}

/** The set-piece a Look's town declares, or null — for panels that show its controls only where it exists. */
export function setPieceOf(lookId) { return townFor(lookId)?.setPiece ?? null }

export default function SetPiece({ lookId, lightOverride, ...props }) {
  const town = townFor(lookId)
  const scene = useSceneJson(town?.lookId ?? lookId)
  const index = useSlabBuildingIndex(s => s.index)
  const select = useSelectedBuilding(s => s.select)
  const setHovered = useSelectedBuilding(s => s.setHovered)
  const clearHovered = useSelectedBuilding(s => s.clearHovered)
  const sp = town?.setPiece
  if (!sp) return null
  const R = RENDERERS[sp.kind]
  if (!R) throw new Error(`[SetPiece] ⛔ "${town.lookId}" declares a set-piece of kind "${sp.kind}", and no renderer exists for it (have: ${Object.keys(RENDERERS).join(', ')})`)
  if (!sp.buildingId) throw new Error(`[SetPiece] ⛔ "${town.lookId}" declares a set-piece with no buildingId — a set-piece stands on one of the town's buildings`)
  // The slab for THIS town has not loaded yet (Stage switches towns live): nothing to seat on yet.
  if (index?.look !== town.lookId) return null
  const b = index.byId.get(sp.buildingId)
  if (!b) throw new Error(`[SetPiece] ⛔ "${town.lookId}" puts its set-piece on building ${sp.buildingId}, and the slab has no such building — is it hidden in building-overrides.json, or is the bake older than the claim?`)
  if (b.ranges?.wall || b.ranges?.roof || b.ranges?.foundation) throw new Error(`[SetPiece] ⛔ "${town.lookId}": the slab built geometry for ${sp.buildingId}, the set-piece's building — it would stand twice. Re-bake the buildings.`)
  const id = sp.buildingId
  return (
    <group
      onPointerMove={(e) => { e.stopPropagation(); setHovered(id); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { clearHovered(); document.body.style.cursor = 'auto' }}
      onClick={(e) => { e.stopPropagation(); if (e.delta > 6) return; select(id) }}>
      <R town={town} footprint={b.footprint} {...props}>
        <SetPieceUplights channel={lightOverride ?? scene?.setPieceLight ?? null} topM={R.extent?.topM} halfWidthM={R.extent?.halfWidthM} />
      </R>
    </group>
  )
}
