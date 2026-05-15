// terrainCommon.js — single source of truth for spatial constants and
// elevation math, shared by browser runtime (vite) and node bake scripts.
//
// Consumers load terrain.json themselves (vite `import` in the browser,
// `readFileSync(JSON.parse(...))` in node) and construct a sampler with
// `makeElevationSampler(terrain)`. The math and constants live here once;
// only the JSON loading step varies by environment.

// V_EXAG multiplies the raw heightmap (in meters), which bake-terrain.js
// normalizes to local-min = 0. For LS the source GeoTIFF spans ~35 m of
// relief, so V_EXAG × 35 m is the max vertical climb a ground vertex sees.
// 1.8 keeps Lafayette Park's raised yard band readable as a ~1–2 m bulge
// without ballooning the neighborhood into multi-story hills (the V_EXAG=5
// regime, sized for the prior offset-square EPQS bake that clipped most of
// LS's actual range, no longer applies after the b24fce5 clip-to-stencil
// pipeline). Tune up cautiously — every consumer (ground per-vertex,
// buildings rigid, lamps instanced) multiplies by this same uniform.
export const V_EXAG = 1.5

// All spatial data is in compass frame (the natural output of the
// GPS→meters projection). Cosmetic screen orientation lives on the
// Browse camera's `up` vector via the Heading slider in StageApp.jsx.
// No rotation constants belong here — if a render path is reaching for
// one, it shouldn't be.

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
