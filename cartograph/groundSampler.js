// groundSampler.js — the shared "where is the DRAWN ground at (x,z)" sampler.
//
// The single SSoT for seating ground-anchored objects on the SAME surface the
// slab actually renders, instead of each object re-deriving height from the
// smooth terrain field (which the coarse ground mesh only approximates between
// its vertices → the "nothing sits on the ground" float). This is the
// buildings/foundations `aCentroidY` regime, generalized: a consumer bakes a
// per-object anchor `groundAt(x,z)` and rigid-lifts by `raw × uExag + y` at
// runtime, so it sits exactly on the drawn ground at every exaggeration.
//
// Returns the RAW field value (pre-uExag), barycentric-interpolated over the
// ground triangle the point falls in, taken from the TOP-MOST group at that XZ
// (what you visually stand on). After the 2026-06-29 CPU↔GPU reconcile the CPU
// `getElevationRaw` used here equals what the GPU renders per vertex, so the
// interpolation matches the drawn surface exactly. (2026-06-29)
//
// ⭐ AND THE DRAWN MESH'S OWN y (2026-10-06, the raised kerb — `kerbLift.mjs`): a block lifted by the town's kerb height
// carries that height in the mesh's y, UNEXAGGERATED, and the runtime adds terrain × uExag on top. So an object seats at
// `raw × uExag + y`. `groundAt(x, z)` returns both; `y` is 0 on a flat town and h on a raised block.

// ⭐ ONE HOME (2026-10-11): the function itself lives in `src/lib/drawnGround.js`, which the runtime imports too, so the
// bake's anchors and the runtime's movers cannot read two different grounds. This file is the bake's thin wrapper: the
// same API it always had, plus the migration path said aloud (a slab baked before the deformer is read off the field).

import { makeDrawnGround } from '../src/lib/drawnGround.js'

// groundJson  — parsed ground.json manifest (groups + bbox)
// groundAB    — ground.bin as an ArrayBuffer
// elevationSampler — from terrainCommon.makeElevationSampler (getElevationRaw): the field, for a group with no aRaw
export function makeGroundSampler(groundJson, groundAB, elevationSampler) {
  const getRaw = elevationSampler.getElevationRaw
  const D = makeDrawnGround(groundJson, groundAB, { rawAt: getRaw })
  if (D.path !== 'baked') console.warn(`[groundSampler] ⛔ ${D.groupsField} ground group(s) carry no baked terrain part — anchored on the FIELD at their vertices (the slab predates the ground deformer; the migration path)`)
  // The drawn ground at (x,z): the top-most group's triangle wins → { raw, y }. If the point is off the mesh, the smooth
  // field with y 0 so a caller never NaNs — and `offMesh` says so (a disc-rim object, not a seated one).
  function groundAt(x, z) {
    const p = D.partsAt(x, z)
    return p ? { raw: p.raw, y: p.y } : { raw: getRaw(x, z), y: 0, offMesh: true }
  }
  return { groundAt, triCount: D.triCount }
}
