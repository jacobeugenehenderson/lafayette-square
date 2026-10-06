/**
 * sceneStencil — THE bake-side stencil derivation, in one place.
 *
 * The stencil's SSoT is the EXTENT tool: it authors
 * `cartograph/data/<scene>/neighborhood_boundary.json` (the pen boundary + radius
 * + fade bands). Every bake-side consumer derives its clip polygon from THAT file
 * through THIS function — never its own copy. Extracted from bake-ground.js
 * (2026-07-15) when bake-landscape needed the same polygon to cut the mountain
 * back off the town's base plate; a second derivation is how three
 * representations start drifting (project_ribbon_three_representations).
 *
 * ⚠️ TWO OTHER DERIVATIONS OF THIS SAME POLYGON EXIST and this header used to claim
 * the bake side had only one. Measured 2026-09-20: `stencilFromBoundary` in
 * CartographApp.jsx:783 (Designer) AND `deriveStencilBbox` in bake-terrain.js:76
 * (bake-side, so the "one place" claim above was false). All three now apply the
 * same rule — the clip IS the disc's ring — but they are still three call sites, not
 * one function, and collapsing them is unfinished work.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Reads cartograph/data/<scene>/neighborhood_boundary.json and derives:
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
// No-boundary (file absent / no `boundary`): clipPolygon = null.
// ⚠️ An absent file still coerces radius to 1 and centre to [0,0] — a stand-in the ground bake refuses
// (`bake-ground.js`, "no authored extent"). Its own ticket; not this one.
export function loadSceneStencil(root, scene) {
  const path = join(root, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(path)) return { center: [0, 0], radius: 1, clipPolygon: null }
  const s = JSON.parse(readFileSync(path, 'utf-8'))
  const center = s.center || [0, 0]
  const radius = s.radius || 1
  const clipPolygon = s.boundary?.length ? s.boundary.map(([x, z]) => [x, z]) : null
  return { center, radius, clipPolygon }
}

// Even-odd point-in-polygon on the XZ plane.
export function pointInPolygon(x, z, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside
  }
  return inside
}
