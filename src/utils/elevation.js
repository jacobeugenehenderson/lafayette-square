import terrainData from '../data/terrain.json'

// Vertical exaggeration — real elevation is ~3m across 1300m.
// 5× makes the rolling terrain visible in the hero telephoto shot.
export const V_EXAG = 5

const { width, height, bounds, data } = terrainData
const spanX = bounds.maxX - bounds.minX
const spanZ = bounds.maxZ - bounds.minZ

/**
 * Sample terrain elevation at world coordinate (x, z).
 * Returns exaggerated Y value. Bilinear interpolation.
 */
export function getElevation(x, z) {
  // Normalize to grid coordinates
  const gx = ((x - bounds.minX) / spanX) * (width - 1)
  const gz = ((z - bounds.minZ) / spanZ) * (height - 1)

  // Clamp to grid bounds
  const gx0 = Math.max(0, Math.min(width - 2, Math.floor(gx)))
  const gz0 = Math.max(0, Math.min(height - 2, Math.floor(gz)))
  const gx1 = gx0 + 1
  const gz1 = gz0 + 1

  const fx = gx - gx0
  const fz = gz - gz0

  // Bilinear interpolation
  const e00 = data[gz0 * width + gx0] || 0
  const e10 = data[gz0 * width + gx1] || 0
  const e01 = data[gz1 * width + gx0] || 0
  const e11 = data[gz1 * width + gx1] || 0

  const e = e00 * (1 - fx) * (1 - fz)
          + e10 * fx * (1 - fz)
          + e01 * (1 - fx) * fz
          + e11 * fx * fz

  return e * V_EXAG
}

/**
 * Displace all Y values in a BufferGeometry's position attribute
 * based on terrain elevation at each vertex's (x, z).
 */
export function displaceGeometry(geometry) {
  const pos = geometry.attributes.position.array
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] += getElevation(pos[i], pos[i + 2])
  }
  geometry.attributes.position.needsUpdate = true
  geometry.computeVertexNormals()
}
