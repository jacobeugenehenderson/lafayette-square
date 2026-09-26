// foundationGeometry.js — single source of truth for building foundation
// vertical extents. Shared by Stage's CPU renderer (LafayetteScene's
// Foundations component) and the bake serializer
// (cartograph/bake-buildings.js).
//
// Per project_terrain_buildings_foundations_architecture.md: foundations
// are the contact joint between an upright rigid building body and a
// non-flat heightfield ground. The "period pedestal" visible height (fh)
// sits ON TOP of that contact joint. The contact joint exists for every
// building, including modern ones (fh = 0).
//
// ⭐ The riser runs from the building's floor down to THE TOWN'S FLOOR — the
// lowest ground the town can draw, min(0, heightfield min) × uExag (Jacob,
// 2026-09-26). That is placed in the vertex shader (`RISER_LIFT_GLSL`,
// src/utils/terrainShader.js), so no footprint corner can sit below it at any
// exaggeration. ⛔ FOUNDATION_BELOW_GRADE_M is therefore only a MARKER for the
// below-grade ring (any y < 0); its value sizes nothing. It was 8 m sized from
// LS's worst slope — a constant true for town #1 only — and is kept only so the
// baked ring stays below the y < 0 test.

export const FOUNDATION_BELOW_GRADE_M = 8

// Period-pedestal visible height (top of foundation block above grade).
// Year-of-build heuristic; per-building override `foundation_height` in
// buildingOverrides wins when present.
//
//  - Pre-1900 = full Victorian raised foundation (1.2m)
//  - 1900-1920 = transitional (0.8m)
//  - >=1920 / unknown year = flush (0)
//
// Note `fh = 0` does NOT mean "no foundation block" — the contact-joint
// block still emits, just with the visible top sitting at grade. Modern
// buildings get the contact joint without any architectural pedestal.
export function periodPedestalFor(building, overrides) {
  const ov = overrides && overrides[building.id]
  if (ov && ov.foundation_height !== undefined) return ov.foundation_height
  const year = building.year_built
  if (!year) return 0
  if (year < 1900) return 1.2
  if (year < 1920) return 0.8
  return 0
}
