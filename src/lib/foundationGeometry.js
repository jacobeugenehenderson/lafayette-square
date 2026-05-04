// foundationGeometry.js — single source of truth for building foundation
// vertical extents. Shared by Stage's CPU renderer (LafayetteScene's
// Foundations component) and the bake serializer
// (cartograph/bake-buildings.js).
//
// Per project_terrain_buildings_foundations_architecture.md: foundations
// are the contact joint between an upright rigid building body and a
// non-flat heightfield ground. The "period pedestal" visible height (fh)
// sits ON TOP of that contact joint. The contact joint exists for every
// building, including modern ones (fh = 0). Foundation bottom extends
// below grade by enough margin that even at the lowest local-ground
// corner of any footprint, the foundation remains buried in the ground.
//
// LS diagnostic (2026-05-04): max (centroidEl - minCornerEl) × V_EXAG
// across all 1056 buildings = 3.984m (worst case bldg-0945). p99 = 1.95m.
// 8m gives ~2× safety. Future neighborhoods with steeper terrain may need
// to revisit; if that happens, switch to per-building margin computation
// or bump this constant globally.

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
