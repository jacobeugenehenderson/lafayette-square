// terrainCommon.js — single source of truth for spatial constants and
// elevation math, shared by browser runtime (vite) and node bake scripts.
//
// Consumers load terrain.json themselves (vite `import` in the browser,
// `readFileSync(JSON.parse(...))` in node) and construct a sampler with
// `makeElevationSampler(terrain)`. The math and constants live here once;
// only the JSON loading step varies by environment.

// ── The vertical exaggeration is PER TOWN, AUTHORED, and it defaults to 1. ──
//
// It multiplies the raw heightmap (in metres), which bake-terrain.js normalizes to
// local-min = 0, so `exag × relief` is the max vertical climb a ground vertex sees.
//
// ⛔⛔ THIS WAS `export const V_EXAG = 1.5` — ONE CONSTANT, EVERY TOWN, AND IT WAS SIZED
// AGAINST ST. LOUIS. The comment that stood here said so in terms: "for LS the source
// GeoTIFF spans ~35 m of relief… 1.5 keeps Lafayette Park's raised yard band readable."
// ⭐ Measured 2026-09-20, relief across the disc: LS 35.2 m · HPDM 43.1 m · altadena
// 1,480.3 m. One multiplier was serving a river bluff, a lake plain and the San Gabriels
// — and the number had been chosen by looking at the first of them.
// (BRIEF-ls-bleed-excision site 15; ruled by Jacob 2026-09-20.)
//
// ⭐⭐ THE DEFAULT OF 1 IS THE POINT, NOT A DETAIL. The kit default is the NEUTRAL value —
// draw the ground at the height the ground actually is. LS's 1.5 is now LS's AUTHORED DATA
// (`public/looks/lafayette-square/design.json#terrainExag`), which is where a decision made
// by looking at one town belongs. A town nobody has authored gets truth, not St. Louis's
// drama; `ORIENTATION` — the override IS the product.
//
// ⚠️ It is a CEILING, not the live value. The rendered exaggeration is a per-shot animated
// uniform (`terrainShader.terrainExag`) that the view lerps toward: hero → this value,
// planetarium → 1, browse → 0. Anything reading a constant instead of the uniform is the
// bug `treeGroundRaw` documents at length in src/utils/elevation.js.
export const DEFAULT_V_EXAG = 1

// All spatial data is in compass frame (the natural output of the
// GPS→meters projection). Cosmetic screen orientation lives on the
// Browse camera's `up` vector via the Heading slider in StageApp.jsx.
// No rotation constants belong here — if a render path is reaching for
// one, it shouldn't be.


/**
 * Build a sampler over one terrain heightfield.
 * @param exag the town's authored vertical exaggeration; defaults to the kit-neutral 1.
 *             ⛔ Pass the scene's value — a caller that omits it gets TRUTH, never another
 *             town's drama. Every consumer (ground per-vertex, buildings rigid, lamps
 *             instanced) multiplies by the same number, so it must be one town's number.
 */
/**
 * The identity of a heightfield: FNV-1a over its size, bounds and every sample. A datum
 * shift rewrites every sample, so it changes the identity. Anchor bakes stamp it; the
 * runtime refuses anchors stamped with a different one.
 * ▶ node checks/claims-anchors-know-their-terrain.mjs
 */
export function terrainIdentity(t) {
  if (!t?.data?.length) return 'none'
  let h = 2166136261 >>> 0
  const mix = (x) => { h ^= x >>> 0; h = Math.imul(h, 16777619) >>> 0 }
  mix(t.width | 0); mix(t.height | 0)
  for (const x of new Uint32Array(new Float64Array([t.bounds.minX, t.bounds.maxX, t.bounds.minZ, t.bounds.maxZ]).buffer)) mix(x)
  const u = new Uint32Array(t.data.buffer, t.data.byteOffset, t.data.length)
  for (let i = 0; i < u.length; i++) mix(u[i])
  return h.toString(16).padStart(8, '0')
}

export function makeElevationSampler(terrain, exag = DEFAULT_V_EXAG) {
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
    return getElevationRaw(x, z) * exag
  }

  function displaceGeometry(geometry) {
    const pos = geometry.attributes.position.array
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] += getElevation(pos[i], pos[i + 2])
    }
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
  }

  return { getElevation, getElevationRaw, displaceGeometry, bounds, width, height, exag }
}
