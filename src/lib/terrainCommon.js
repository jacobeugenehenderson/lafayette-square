// terrainCommon.js — single source of truth for spatial constants and
// elevation math, shared by browser runtime (vite) and node bake scripts.
//
// Consumers load terrain.json themselves (vite `import` in the browser,
// `readFileSync(JSON.parse(...))` in node) and construct a sampler with
// `makeElevationSampler(terrain)`. The math and constants live here once;
// only the JSON loading step varies by environment.

export const V_EXAG = 5

// Lafayette Square's street grid sits at -9.2° relative to compass-N.
//
// PROJECT WORLD FRAME IS PARK-ALIGNED, NOT COMPASS-ALIGNED. Project world
// axes match the city street grid (= park-aligned). When the GPS-→-meters
// ETLs (scripts/12-process-park-trees.py, scripts/14-process-park-paths.py)
// project lon/lat via equirectangular about park center, the output is
// compass-aligned, NOT project world. scripts/de-park-data.mjs applies
// R(-9.2°) to convert ETL-output → project world. The intuition "GPS
// projected into meters is already world" is wrong here.
//
// This constant is preserved ONLY for the one-shot data-migration script
// (scripts/de-park-data.mjs). After de-parking lands, NO production
// render or bake code references it — every dataset is in project world
// frame at rest. If you find yourself reaching for it from a render path,
// stop; the data is already rotated.
export const PARK_GRID_ROTATION = -9.2 * Math.PI / 180

export function makeElevationSampler(terrain) {
  const { width, height, bounds, data } = terrain
  const spanX = bounds.maxX - bounds.minX
  const spanZ = bounds.maxZ - bounds.minZ

  function getElevationRaw(x, z) {
    const gx = ((x - bounds.minX) / spanX) * (width - 1)
    const gz = ((z - bounds.minZ) / spanZ) * (height - 1)
    const gx0 = Math.max(0, Math.min(width - 2, Math.floor(gx)))
    const gz0 = Math.max(0, Math.min(height - 2, Math.floor(gz)))
    // Clamp fractionals so out-of-bounds inputs inherit the nearest
    // cell value rather than extrapolating off the grid.
    const fx = Math.max(0, Math.min(1, gx - gx0))
    const fz = Math.max(0, Math.min(1, gz - gz0))
    const e00 = data[gz0 * width + gx0] || 0
    const e10 = data[gz0 * width + (gx0 + 1)] || 0
    const e01 = data[(gz0 + 1) * width + gx0] || 0
    const e11 = data[(gz0 + 1) * width + (gx0 + 1)] || 0
    const e0 = e00 * (1 - fx) + e10 * fx
    const e1 = e01 * (1 - fx) + e11 * fx
    return e0 * (1 - fz) + e1 * fz
  }

  function getElevation(x, z) {
    return getElevationRaw(x, z) * V_EXAG
  }

  function displaceGeometry(geometry) {
    const pos = geometry.attributes.position.array
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] += getElevation(pos[i], pos[i + 2])
    }
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
  }

  return { getElevation, getElevationRaw, displaceGeometry, bounds, width, height }
}
