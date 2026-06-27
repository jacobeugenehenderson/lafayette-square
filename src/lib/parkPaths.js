/**
 * parkPaths — the ONE place that turns `ribbons.json` `.paths` into the park's
 * footpath ring sets. Consumed by the bake (`cartograph/bake-ground.js`), the
 * 2D Designer (`BlockGeometryV2Debug.jsx`), and the runtime bridge overlay
 * (`LafayettePark.jsx`) — so all three partition + clip park paths identically
 * (SSoT; bake, 2D, and 3D can't drift).
 *
 * Park paths = the subset of `.paths` whose geometry lies inside the park
 * polygon. They split into:
 *   - LAND   → clipped to the polygon relaxed outward to the perimeter
 *              sidewalk's inner edge (so corner paths reach the walk), rounded
 *              joins (no street-corner bleed). Baked into the ground stack.
 *   - BRIDGE → paths over water; clipped to the bare polygon. Rendered as a
 *              lifted overlay until Phase 5 makes bridges first-class.
 */
import { buildPathRibbons, offsetClosedRing } from './buildPathRibbons.js'
import { fracInRing, classifyBridgePath } from './parkPathClassify.js'

// Metres to relax the land clip outward past the park polygon, to the
// perimeter sidewalk's inner edge (~2.7 m at LS). Rounded joins.
export const PARK_PATH_CLIP_PAD_M = 3

/**
 * @returns {{ land: Map<kind,ring[]>, bridge: Map<kind,ring[]>, steps: object[],
 *             stepRings: Map<kind,ring[]> }}
 *   `land`/`bridge` = offset ring sets; `steps` = the raw step POLYLINES (built
 *   as 3D staircases by the runtime); `stepRings` = those steps offset to flat
 *   footprints (the 2D Designer's top-down representation). Empty when no park.
 */
export function buildParkPathRings(ribbons, { polygon, water, pad = PARK_PATH_CLIP_PAD_M } = {}) {
  const ring = polygon?.corners
  if (!ring) return { land: new Map(), bridge: new Map(), steps: [], stepRings: new Map() }
  const land = [], bridge = [], steps = []
  for (const p of (ribbons?.paths || [])) {
    if (fracInRing(p.points, ring) < 0.5) continue
    // STAIRS PARKED (2026-06-27): steps flow back into the flat gravel group so
    // park steps render (flat) instead of vanishing. To resume the 3D stairs,
    // re-enable this split (and the ParkStairs mount + buildStairGeometry):
    //   if (p.kind === 'steps') { steps.push(p); continue }
    (classifyBridgePath(p, water) ? bridge : land).push(p)
  }
  const clip = offsetClosedRing(ring, pad)
  return {
    land:   buildPathRibbons({ paths: land },   { intersect: clip }),
    bridge: buildPathRibbons({ paths: bridge }, { intersect: [ring] }),
    steps,
    stepRings: buildPathRibbons({ paths: steps }, { intersect: clip }),
  }
}

// Flatten a kind→rings map into one ring[] (the gravel material is uniform
// across kinds; one merged group).
export function mergeRings(ringsByKind) {
  const out = []
  for (const rings of ringsByKind.values()) out.push(...rings)
  return out
}
