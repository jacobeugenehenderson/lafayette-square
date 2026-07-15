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
 * NB there is still a Designer-side twin — `stencilFromBoundary` in
 * CartographApp.jsx — with the same formula. Unifying that is a separate pass;
 * this at least stops the BAKE side from growing a third.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Reads cartograph/data/<scene>/neighborhood_boundary.json and derives:
//   - center, radius        — manifest emission + AO bbox anchor
//   - faceFade, streetFade  — runtime radial fade bands
//   - clipPolygon           — Clipper mask, scaled outward to streetFade.outer + 50
//
// No-boundary fallback (file absent / no `boundary`): nulls across the board.
// clipPolygon=null disables stencil clipping; faceFade=null → manifest.stencil=null
// so BakedGround skips the radial fade shader.
//
// "fade authored?" gate: a `boundary` with no `fade` clips but emits
// manifest.stencil=null → runtime renders flat (toy: rectangular clip, no dissolve).
export function loadSceneStencil(root, scene) {
  const path = join(root, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(path)) return { center: [0, 0], radius: 1, faceFade: null, streetFade: null, clipPolygon: null }
  const s = JSON.parse(readFileSync(path, 'utf-8'))
  const center = s.center || [0, 0]
  const radius = s.radius || 1
  const faceFade   = s.fade || null
  const streetFade = s.streetFade || null
  let clipPolygon = null
  if (s.boundary?.length) {
    // Scale outward to streetFade.outer + 50 when fade is authored (LS).
    // Without fade, no scaling needed — clip exactly at the authored polygon.
    const targetR = streetFade ? streetFade.outer + 50 : radius
    const scale = radius > 0 ? targetR / radius : 1
    const cx = center[0], cz = center[1]
    clipPolygon = s.boundary.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
  }
  return { center, radius, faceFade, streetFade, clipPolygon }
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
