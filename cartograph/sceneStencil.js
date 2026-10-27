/**
 * sceneStencil — THE bake-side stencil derivation, in one place.
 *
 * The stencil's SSoT is the EXTENT tool: it authors
 * `cartograph/data/<scene>/neighborhood_boundary.json` (the centre, the radius and the ring
 * derived from them). Every bake-side consumer derives its clip polygon from THAT file
 * through THIS function — never its own copy. Extracted from bake-ground.js
 * (2026-07-15) when bake-landscape needed the same polygon to cut the mountain
 * back off the town's base plate; a second derivation is how three
 * representations start drifting (project_ribbon_three_representations).
 *
 * ⭐ The disc itself is read through the ONE READER, boundaryRecords.mjs#discOf (BRIEF-the-disc-is-one-source §1b): the
 * Designer's stencil (CartographApp.jsx#stencilFromBoundary) reads it the same way. The terrain's height extent
 * (elevationSources.mjs#terrainLattice, radius + STENCIL_BUFFER_M) is the one left outside, owned by the brief's §3.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { splitBoundary, discOf } from './boundaryRecords.mjs'

// Reads cartograph/data/<scene>/neighborhood_boundary.json THROUGH THE ONE READER (boundaryRecords.mjs#discOf):
//   - center, radius   — manifest emission + AO bbox anchor
//   - clipPolygon      — Clipper mask: the disc's own ring, AT THE RADIUS exactly
//
// ⛔⛔ GEOMETRY DOES NOT READ THE FADE (Jacob, 2026-10-06, ruling (a)). The clip used to reach `fade.outer + 50`
// when a band was set and the radius when not — so the fade's PRESENCE decided how far geometry reached. The fade
// is now a Look's (Stage › Horizon › Edge), and a Look varies styling, never geometry. It runs inward and ends at
// the radius, and the ruffle bites inward only (src/lib/neighborhoodFade.js), so nothing renders past the radius
// and nothing past it needs keeping. The fade itself is derived by its one reader, the ground bake
// (`boundaryRecords.mjs#lookFade`). ▶ node checks/claims-the-disc-stays-inside-the-bb.mjs
//
// ⛔ NO INVENTED DISC (BRIEF-the-disc-is-one-source §1b): an absent file, ring, centre or radius REFUSES by name. It used
// to return `{ center: [0, 0], radius: 1 }` and coerce `s.center || [0, 0]`, `s.radius || 1`, a stand-in only the ground
// bake caught, by its own `radius > 1` sentinel.
export function loadSceneStencil(root, scene) {
  const path = join(root, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(path)) throw new Error(`[sceneStencil] ⛔ ${scene} has no neighborhood_boundary.json — no disc, nothing to clip to. Author the extent first.`)
  const D = discOf(splitBoundary(JSON.parse(readFileSync(path, 'utf-8')), path).disc, `sceneStencil: ${scene}`)
  return { center: [D.cx, D.cz], radius: D.R, clipPolygon: D.ring.map(([x, z]) => [x, z]) }
}
