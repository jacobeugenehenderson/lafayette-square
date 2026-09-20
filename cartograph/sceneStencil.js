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
 * same rule via `deriveFade` — but they are still three call sites, not one
 * function, and collapsing them is unfinished work.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { deriveFade } from './boundaryRecords.mjs'

// Reads cartograph/data/<scene>/neighborhood_boundary.json and derives:
//   - center, radius   — manifest emission + AO bbox anchor
//   - faceFade         — THE radial fade band, derived from radius + fadeBand.
//                        ⭐ There is one band now; `streetFade` was deleted.
//   - clipPolygon      — Clipper mask, scaled outward to faceFade.outer + 50
//
// No-boundary fallback (file absent / no `boundary`): nulls across the board.
// clipPolygon=null disables stencil clipping; faceFade=null → manifest.stencil=null
// so BakedGround skips the radial fade shader.
//
// "fade authored?" gate: a `boundary` with no `fadeBand` clips but emits
// manifest.stencil=null → runtime renders flat (toy: rectangular clip, no dissolve).
//
// ⛔ THE UNAUTHORED-FADE BRANCH — `targetR = radius`, NO scale-out. Ruled by Jacob
// 2026-09-20. The +50 exists to protect a feather; with no feather there is nothing
// to protect and the margin would keep a ring of geometry that nothing fades into.
// ⚠️ This branch is reachable by ANY town poured before its fade is authored — it is
// the kit case, NOT a toy quirk (toy never reaches it; CartographApp.jsx:859 hands
// toy a literal box). No scene on disk exercises it, so it has no eye-gate and is
// proven by fixture only: `node checks/claims-fade-derives-from-radius.mjs`.
export function loadSceneStencil(root, scene) {
  const path = join(root, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(path)) return { center: [0, 0], radius: 1, faceFade: null, clipPolygon: null }
  const s = JSON.parse(readFileSync(path, 'utf-8'))
  const center = s.center || [0, 0]
  const radius = s.radius || 1
  // ⛔ DERIVED, not read. `s.fade` is no longer stored and is ignored if present.
  const faceFade = Number.isFinite(s.fadeBand) ? deriveFade(radius, s.fadeBand) : null
  let clipPolygon = null
  if (s.boundary?.length) {
    const targetR = faceFade ? faceFade.outer + 50 : radius
    const scale = radius > 0 ? targetR / radius : 1
    const cx = center[0], cz = center[1]
    clipPolygon = s.boundary.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
  }
  return { center, radius, faceFade, clipPolygon }
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
