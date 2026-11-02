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
 * `town` is the installation being drawn (<Town town>): its `setPiece` declaration and its Look. Nothing
 * here resolves a town from the kit.
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
 * ⚠️ The Gateway Arch is NOT mounted here: it stands off the disc, on none of the town's buildings, so it is
 * GEO-ANCHORED, not building-bound — its real feet projected through the town's place (src/setpieces/gatewayArch.js),
 * mounted by GatewayArch.jsx for a Look that carries an `arch` block (2026-10-28).
 */
import { useMemo } from 'react'
import { useSceneJson } from '../lib/useSceneJson.js'
import PilgrimMonument from './PilgrimMonument.jsx'
import SetPieceUplights from './SetPieceUplights.jsx'
import Displays from '../displays/Displays.jsx'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import { useTownContext } from './townContext.js'
import { Refusal } from '../lib/refusal.js'
import FocusMatteOrder from './FocusMatteOrder.jsx'

// kind → renderer. The only place a set-piece component is imported.
const RENDERERS = {
  'pilgrim-monument': PilgrimMonument,
}

export default function SetPiece({ town, lookId, lightOverride, displaysOverride, calendar, displaySource, ...props }) {
  if (!town) throw new Refusal('[SetPiece] ⛔ needs `town` — the installation being drawn')
  if (!lookId) throw new Refusal('[SetPiece] ⛔ needs `lookId` — the Look being drawn')
  const scene = useSceneJson(lookId)
  const index = useSlabBuildingIndex(s => s.index)
  // A click reports to the app (<Town onSelectBuilding>), as a click on any building does.
  const townSelect = useTownContext().select
  // The set-piece's uplight dim, shared: its displays write how far they want the floods down while lit, the uplights read it.
  const dim = useMemo(() => ({ byDisplay: {} }), [])
  const select = (id) => townSelect?.(id)
  const sp = town?.setPiece
  if (!sp) return null
  const R = RENDERERS[sp.kind]
  if (!R) throw new Refusal(`[SetPiece] ⛔ "${lookId}" declares a set-piece of kind "${sp.kind}", and no renderer exists for it (have: ${Object.keys(RENDERERS).join(', ')})`)
  if (!sp.buildingId) throw new Refusal(`[SetPiece] ⛔ "${lookId}" declares a set-piece with no buildingId — a set-piece stands on one of the town's buildings`)
  // The slab for THIS town has not loaded yet (Stage switches towns live): nothing to seat on yet.
  if (index?.look !== lookId) return null
  const b = index.byId.get(sp.buildingId)
  if (!b) throw new Refusal(`[SetPiece] ⛔ "${lookId}" puts its set-piece on building ${sp.buildingId}, and the slab has no such building — is it hidden in building-overrides.json, or is the bake older than the claim?`)
  if (b.ranges?.wall || b.ranges?.roof || b.ranges?.foundation) throw new Refusal(`[SetPiece] ⛔ "${lookId}": the slab built geometry for ${sp.buildingId}, the set-piece's building — it would stand twice. Re-bake the buildings.`)
  const id = sp.buildingId
  return (
    <group
      onClick={(e) => { e.stopPropagation(); if (e.delta > 6) return; select(id) }}>
      {/* `focusName`: the renderer names its ROOT with it, the root sitting at the set-piece's base centre, and carries
          its `extent` there — so depth of field can focus on it by its building's id (src/lib/focusObject.js). */}
      {/* The matte draws after the town's environment, every mesh under the focus node, late displays included (drawOrder.js). */}
      <FocusMatteOrder lookId={lookId} name={`focus:${id}`} />
      <R town={town} lookId={lookId} footprint={b.footprint} focusName={`focus:${id}`} {...props}>
        <SetPieceUplights channel={lightOverride ?? scene?.setPieceLight ?? null} topM={R.extent?.topM} halfWidthM={R.extent?.halfWidthM} dim={dim} />
        {/* The town's displays that hang on its set-piece (src/displays): nothing, for a town that declares none. */}
        <Displays town={town} lookId={lookId} attach="setPiece" extent={R.extent} dim={dim} calendar={calendar} drawerSource={displaySource} channels={displaysOverride} />
      </R>
    </group>
  )
}
