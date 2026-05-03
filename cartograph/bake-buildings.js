/**
 * bake-buildings.js — extrudes building footprints into runtime-ready
 * geometry, grouped by wall material + roof material.
 *
 * Reads `src/data/buildings.json` (1056 entries: footprint polygon,
 * height, wall_material, roof_material, color). Writes:
 *
 *   public/baked/<look>/buildings.json — manifest (groups, materials, bbox)
 *   public/baked/<look>/buildings.bin  — Float32 positions + Uint32 indices
 *
 * Walls and roof caps are separate groups so each can take its own
 * material (e.g. brick_red walls + slate roof). Bottom faces are not
 * emitted (under the ground plane).
 *
 * Designed to mirror bake-ground.js's binary layout: one .bin with
 * positions section then index section, manifest groups carry absolute
 * byte offsets.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Replica of src/utils/elevation.js — node ESM can't import the JSON
// directly without the `with { type: 'json' }` import attribute, so we
// load + bilinear-sample the heightmap inline. Vertical exaggeration
// matches V_EXAG = 5 from elevation.js so Preview's foundation heights
// match LafayetteScene's exactly.
const _terrain = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'terrain.json'), 'utf-8'))
const _terrainSpanX = _terrain.bounds.maxX - _terrain.bounds.minX
const _terrainSpanZ = _terrain.bounds.maxZ - _terrain.bounds.minZ
// Raw bilinear elevation sample (no V_EXAG multiplication). Mirrors the
// runtime terrain texture, which stores raw values and applies the exag
// multiplier in-shader. Per-building centroid elevation is emitted as a
// raw `aCentroidY` per-vertex attribute; BakedBuildings multiplies by
// `uExag` (the same uniform driving ground displacement) so buildings
// rise/fall in lockstep with the ground.
function getElevationRaw(x, z) {
  const gx = ((x - _terrain.bounds.minX) / _terrainSpanX) * (_terrain.width - 1)
  const gz = ((z - _terrain.bounds.minZ) / _terrainSpanZ) * (_terrain.height - 1)
  const gx0 = Math.max(0, Math.min(_terrain.width - 2, Math.floor(gx)))
  const gz0 = Math.max(0, Math.min(_terrain.height - 2, Math.floor(gz)))
  const gx1 = gx0 + 1, gz1 = gz0 + 1
  const fx = gx - gx0, fz = gz - gz0
  const e00 = _terrain.data[gz0 * _terrain.width + gx0] || 0
  const e10 = _terrain.data[gz0 * _terrain.width + gx1] || 0
  const e01 = _terrain.data[gz1 * _terrain.width + gx0] || 0
  const e11 = _terrain.data[gz1 * _terrain.width + gx1] || 0
  const e0 = e00 * (1 - fx) + e10 * fx
  const e1 = e01 * (1 - fx) + e11 * fx
  return e0 * (1 - fz) + e1 * fz
}
function getElevation(x, z) { return getElevationRaw(x, z) * 5 }

// Material palette. Wall + roof + foundation. Roughness is reasonable.
const WALL_MATERIALS = {
  brick_red:        { color: '#8a4636', roughness: 0.9, metalness: 0 },
  brick_weathered:  { color: '#a06754', roughness: 0.95, metalness: 0 },
  stone:            { color: '#7a766c', roughness: 0.85, metalness: 0 },
  stucco:           { color: '#cdb89a', roughness: 0.95, metalness: 0 },
  wood_siding:      { color: '#9a6e44', roughness: 0.85, metalness: 0 },
}
const ROOF_MATERIALS = {
  flat:   { color: '#2a2a2e', roughness: 0.9, metalness: 0 },
  slate:  { color: '#3a3a42', roughness: 0.7, metalness: 0 },
  metal:  { color: '#555560', roughness: 0.5, metalness: 0.4 },
}
// Mirrors the runtime foundation material in LafayetteScene.jsx.
const FOUNDATION_MATERIAL = { color: '#B8A88A', roughness: 0.95, metalness: 0 }

// Parse `#rrggbb` → [r,g,b] in 0..1
function parseHex(hex) {
  const h = (hex || '#888888').replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ]
}

// Convert RGB → HSL (each in 0..1)
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h, s, l]
}
function hslToRgb(h, s, l) {
  let r, g, b
  if (s === 0) { r = g = b = l }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  return [r, g, b]
}

// Roof tint: same recipe as LafayetteScene.jsx — desaturate building
// color + darken per material so each roof keeps a hint of the building's
// hue without overpowering.
function roofTintFor(buildingColorHex, roofMat) {
  const [r, g, b] = parseHex(buildingColorHex)
  const [h, s] = rgbToHsl(r, g, b)
  const lum = roofMat === 'slate' ? 0.15 : roofMat === 'metal' ? 0.28 : 0.20
  const sat = s * 0.3
  return hslToRgb(h, sat, lum)
}

// Per-building foundation height. Mirrors getFoundationHeight() in
// LafayetteScene.jsx — overrides win, then year-of-build heuristic.
function foundationHeightFor(building, overrides) {
  const ov = overrides && overrides[building.id]
  if (ov && ov.foundation_height !== undefined) return ov.foundation_height
  const year = building.year_built
  if (!year) return 0
  if (year < 1900) return 1.2
  if (year < 1920) return 0.8
  return 0
}

// Mirrors classifyRoof() — overrides + year/stories/footprint heuristic.
function classifyRoofFor(building, overrides) {
  const ov = overrides && overrides[building.id]
  if (ov && ov.roof_shape !== undefined) return ov.roof_shape
  const year = building.year_built
  const stories = building.stories || 1
  if (!year) return 'flat'
  if (stories >= 4) return 'flat'
  if (stories === 1 && building.size && building.size[0] * building.size[2] > 500) return 'flat'
  if (year < 1900 && stories >= 2 && stories <= 3) return 'mansard'
  if (year < 1920 && stories >= 1 && stories <= 3) return 'hip'
  return 'flat'
}

function signedArea2D(pts) {
  let area = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return area / 2
}

// Match LafayetteScene's ensureCCW EXACTLY: reverse pts when standard
// 2D signed area is positive. This is "CCW from above" in our (x, z)
// convention — walking i→j around the polygon, interior is to the right
// of motion (looking down from +Y). The shaped-roof tri winding (V0,
// V1, V2) then produces +Y face normals → roofs face up.
function ensureCCW(pts) {
  return signedArea2D(pts) > 0 ? [...pts].reverse() : pts
}

function isConvex(pts) {
  const n = pts.length
  if (n < 3) return false
  let sign = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-10) continue
    if (sign === 0) sign = cross > 0 ? 1 : -1
    else if ((cross > 0 ? 1 : -1) !== sign) return false
  }
  return true
}

function centroid2D(pts) {
  let cx = 0, cz = 0
  for (const [x, z] of pts) { cx += x; cz += z }
  return [cx / pts.length, cz / pts.length]
}

function footprintRatio(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const dx = maxX - minX, dz = maxZ - minZ
  return Math.min(dx, dz) / Math.max(dx, dz)
}

// Build mansard roof geometry — slanted sides from wallTop to inset top
// ring, plus a top fan. World-coord pts; stories drives steepness.
//
// UVs: U runs along the eave, V runs UP the slope. So slate courses
// (which are horizontal in slate.jpg) tile parallel to the eave like a
// real roof. Mansard cap uses planar XZ since it's flat.
function buildMansardRoofWorld(pts, wallTop, stories) {
  pts = ensureCCW(pts)
  const mansardHeight = stories >= 3 ? 2.5 : 2.0
  const topY = wallTop + mansardHeight
  const [cx, cz] = centroid2D(pts)
  const inset = 0.30
  const n = pts.length
  const innerPts = pts.map(([x, z]) => [x + (cx - x) * inset, z + (cz - z) * inset])

  const positions = []
  const uvs = []
  const indices = []
  // Slanted side quads
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const base = positions.length / 3
    const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1]
    const edgeLen = Math.hypot(dx, dz)
    const idx = innerPts[i][0] - pts[i][0], idz = innerPts[i][1] - pts[i][1]
    const slopeLen = Math.hypot(idx, mansardHeight, idz)
    positions.push(
      pts[i][0], wallTop, pts[i][1],
      pts[j][0], wallTop, pts[j][1],
      innerPts[j][0], topY, innerPts[j][1],
      innerPts[i][0], topY, innerPts[i][1],
    )
    uvs.push(
      0,        0,           // V0: outer_i at eave start
      edgeLen,  0,           // V1: outer_j at eave end
      edgeLen,  slopeLen,    // V2: inner_j at slope top
      0,        slopeLen,    // V3: inner_i at slope top
    )
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  // Top cap — fan from centroid (planar XZ UVs).
  const capBase = positions.length / 3
  positions.push(cx, topY, cz)
  uvs.push(cx, cz)
  for (let i = 0; i < n; i++) {
    positions.push(innerPts[i][0], topY, innerPts[i][1])
    uvs.push(innerPts[i][0], innerPts[i][1])
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    indices.push(capBase, capBase + 1 + i, capBase + 1 + j)
  }
  return { positions, indices, uvs }
}

// Build hip roof geometry — single peak (pyramid) for square-ish/many-sided
// footprints, ridge line along the long axis otherwise.
//
// UVs: U along the eave (base edge), V from base to apex/ridge. Apex/
// ridge UV.x = midpoint of the base edge so the texture is symmetric
// across the tri.
function buildHipRoofWorld(pts, wallTop, stories) {
  pts = ensureCCW(pts)
  const peakH = stories === 1 ? 1.8 : 1.5
  const peakY = wallTop + peakH
  const [cx, cz] = centroid2D(pts)
  const n = pts.length
  const ratio = footprintRatio(pts)

  const positions = []
  const uvs = []
  const indices = []

  // Helper: emit one slope tri with U-along-eave, V-toward-apex UVs.
  const emitSlopeTri = (a, b, apex) => {
    const base = positions.length / 3
    const dx = b[0] - a[0], dz = b[1] - a[1]
    const edgeLen = Math.hypot(dx, dz)
    const midX = (a[0] + b[0]) / 2, midZ = (a[1] + b[1]) / 2
    const apexDx = apex[0] - midX, apexDz = apex[1] - midZ
    const slopeLen = Math.hypot(apexDx, peakH, apexDz)
    positions.push(a[0], wallTop, a[1], b[0], wallTop, b[1], apex[0], peakY, apex[1])
    uvs.push(0, 0, edgeLen, 0, edgeLen / 2, slopeLen)
    indices.push(base, base + 1, base + 2)
  }

  // Helper: emit a trapezoid slope (long eave with full ridge above) as
  // two tris. Eave runs a → b along the bottom; ra (over a) and rb (over
  // b) are the ridge endpoints corresponding to each base vertex.
  const emitSlopeTrap = (a, b, ra, rb) => {
    const base = positions.length / 3
    const dx = b[0] - a[0], dz = b[1] - a[1]
    const edgeLen = Math.hypot(dx, dz)
    // Slope length at each end (from base vertex to its ridge vertex).
    const slopeA = Math.hypot(ra[0] - a[0], peakH, ra[1] - a[1])
    const slopeB = Math.hypot(rb[0] - b[0], peakH, rb[1] - b[1])
    positions.push(
      a[0],  wallTop, a[1],
      b[0],  wallTop, b[1],
      rb[0], peakY,   rb[1],
      ra[0], peakY,   ra[1],
    )
    uvs.push(
      0,       0,
      edgeLen, 0,
      edgeLen, slopeB,
      0,       slopeA,
    )
    // Two tris: (V0, V1, V2) and (V0, V2, V3).
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  if (ratio > 0.8 || n > 8) {
    // Pyramid to single peak
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      emitSlopeTri(pts[i], pts[j], [cx, cz])
    }
  } else {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [x, z] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    const dx = maxX - minX, dz = maxZ - minZ
    const ridgeInset = 0.3
    let r0, r1
    if (dx >= dz) {
      r0 = [minX + dx * ridgeInset, cz]
      r1 = [maxX - dx * ridgeInset, cz]
    } else {
      r0 = [cx, minZ + dz * ridgeInset]
      r1 = [cx, maxZ - dz * ridgeInset]
    }
    // Per-edge: find the ridge endpoint nearest to each endpoint of the
    // edge. If both ends connect to the same ridge endpoint → triangle
    // (short side of the hip roof). If they differ → trapezoid (long
    // side rising to the full ridge).
    const nearestRidge = (p) => {
      const d0 = (p[0] - r0[0]) ** 2 + (p[1] - r0[1]) ** 2
      const d1 = (p[0] - r1[0]) ** 2 + (p[1] - r1[1]) ** 2
      return d0 < d1 ? r0 : r1
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const ra = nearestRidge(pts[i])
      const rb = nearestRidge(pts[j])
      if (ra === rb) {
        emitSlopeTri(pts[i], pts[j], ra)
      } else {
        emitSlopeTrap(pts[i], pts[j], ra, rb)
      }
    }
  }
  return { positions, indices, uvs }
}

// Triangulate a 2D footprint contour. ShapeUtils handles either winding;
// returns triplet indices into the contour.
function triangulateContour(footprint) {
  const contour = footprint.map(([x, z]) => new THREE.Vector2(x, z))
  return THREE.ShapeUtils.triangulateShape(contour, [])
}

// Build a single building's geometry. Walls go [foundationY .. wallTop],
// foundation [0 .. foundationY], roof on top of wallTop in flat / mansard
// / hip shape per `roofShape`. Each section emits its own UVs aligned to
// the surface so tileable textures (slate courses, brick rows) read correctly.
function buildingGeometry(footprint, foundationY, wallTop, roofShape, stories) {
  const n = footprint.length
  const wallPositions = []
  const wallIndices   = []
  const wallUVs       = []
  const roofPositions = []
  const roofIndices   = []
  const roofUVs       = []
  const foundPositions = []
  const foundIndices   = []
  const foundUVs      = []
  if (n < 3 || !(wallTop > foundationY)) {
    return {
      wallPositions, wallIndices, wallUVs,
      roofPositions, roofIndices, roofUVs,
      foundPositions, foundIndices, foundUVs,
    }
  }

  // ── Walls ─────────────────────────────────────────────────────────
  // Per edge, emit a quad with its OWN 4 vertices so we can compute a
  // proper outward normal per wall. Sharing verts at corners would mean
  // averaging adjacent walls' normals → smooth-shading the box, ugly.
  // For a flat-shaded brick look we want hard normals per face.
  for (let i = 0; i < n; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % n]
    const baseIdx = wallPositions.length / 3
    const edgeLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    const wallH = wallTop - foundationY
    wallPositions.push(a[0], foundationY, a[1])
    wallPositions.push(b[0], foundationY, b[1])
    wallPositions.push(b[0], wallTop,     b[1])
    wallPositions.push(a[0], wallTop,     a[1])
    // U along edge, V vertical — bricks/courses run horizontally.
    wallUVs.push(0, 0,  edgeLen, 0,  edgeLen, wallH,  0, wallH)
    wallIndices.push(baseIdx, baseIdx + 1, baseIdx + 2)
    wallIndices.push(baseIdx, baseIdx + 2, baseIdx + 3)
  }
  // Foundation: same shape, lower band [0, foundationY]. Skip if zero.
  if (foundationY > 0) {
    for (let i = 0; i < n; i++) {
      const a = footprint[i]
      const b = footprint[(i + 1) % n]
      const baseIdx = foundPositions.length / 3
      const edgeLen = Math.hypot(b[0] - a[0], b[1] - a[1])
      foundPositions.push(a[0], 0,            a[1])
      foundPositions.push(b[0], 0,            b[1])
      foundPositions.push(b[0], foundationY,  b[1])
      foundPositions.push(a[0], foundationY,  a[1])
      foundUVs.push(0, 0,  edgeLen, 0,  edgeLen, foundationY,  0, foundationY)
      foundIndices.push(baseIdx, baseIdx + 1, baseIdx + 2)
      foundIndices.push(baseIdx, baseIdx + 2, baseIdx + 3)
    }
  }
  // Determine footprint winding (signed area in the x,z plane).
  // For CCW footprints (area2 > 0), the wall winding emitted above
  // produces an INWARD normal (verified by hand for unit-square test).
  // Flip those. CW footprints already face outward — leave alone.
  let area2 = 0
  for (let i = 0; i < n; i++) {
    const a = footprint[i], b = footprint[(i + 1) % n]
    area2 += a[0] * b[1] - b[0] * a[1]
  }
  if (area2 > 0) {
    for (let i = 0; i < wallIndices.length; i += 3) {
      const tmp = wallIndices[i + 1]
      wallIndices[i + 1] = wallIndices[i + 2]
      wallIndices[i + 2] = tmp
    }
    for (let i = 0; i < foundIndices.length; i += 3) {
      const tmp = foundIndices[i + 1]
      foundIndices[i + 1] = foundIndices[i + 2]
      foundIndices[i + 2] = tmp
    }
    // wallUVs/foundUVs don't need flipping — they're per-vertex, not per-tri.
  }

  // ── Roof ──────────────────────────────────────────────────────────
  // Choose between flat cap, mansard slopes, and hip slopes. Fall back
  // to flat for non-convex (mansard) or many-sided (hip) cases.
  let useShape = roofShape
  if (useShape === 'mansard' && !isConvex(footprint)) useShape = 'flat'
  if (useShape === 'hip' && footprint.length > 8)    useShape = 'flat'

  if (useShape === 'mansard') {
    const m = buildMansardRoofWorld(footprint, wallTop, stories || 1)
    for (let i = 0; i < m.positions.length; i++) roofPositions.push(m.positions[i])
    for (let i = 0; i < m.uvs.length;       i++) roofUVs.push(m.uvs[i])
    for (let i = 0; i < m.indices.length;   i++) roofIndices.push(m.indices[i])
  } else if (useShape === 'hip') {
    const h = buildHipRoofWorld(footprint, wallTop, stories || 1)
    for (let i = 0; i < h.positions.length; i++) roofPositions.push(h.positions[i])
    for (let i = 0; i < h.uvs.length;       i++) roofUVs.push(h.uvs[i])
    for (let i = 0; i < h.indices.length;   i++) roofIndices.push(h.indices[i])
  } else {
    // Flat cap — planar XZ UV (texture seen from above, doesn't matter
    // much because flat roofs don't typically use directional textures).
    const tris = triangulateContour(footprint)
    for (const [x, z] of footprint) {
      roofPositions.push(x, wallTop, z)
      roofUVs.push(x, z)
    }
    for (const t of tris) roofIndices.push(t[0], t[2], t[1])
  }

  return {
    wallPositions, wallIndices, wallUVs,
    roofPositions, roofIndices, roofUVs,
    foundPositions, foundIndices, foundUVs,
  }
}

// Deterministic string hash — match the runtime hash in LafayetteScene
// so palette assignment is identical between Stage live-render and the
// Preview bake.
function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const DEFAULT_PALETTE = [
  '#dcdcdc', '#a0522d', '#cd853f', '#8b2500',
  '#d2b48c', '#778899', '#8b4513', '#a52a2a',
  '#f5deb3', '#696969', '#b22222', '#808080',
]

export async function bakeBuildings({ look = 'default' } = {}) {
  const dataPath = join(ROOT, 'src', 'data', 'buildings.json')
  const outDir   = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const raw = JSON.parse(readFileSync(dataPath, 'utf-8'))
  const buildings = Array.isArray(raw) ? raw : (raw.buildings || [])
  const overridesPath = join(ROOT, 'src', 'data', 'buildingOverrides.json')
  const overrides = existsSync(overridesPath)
    ? (JSON.parse(readFileSync(overridesPath, 'utf-8')).overrides || {})
    : {}

  // Read the Look's design.json for palette + materialPhysics. Without
  // it, fall back to defaults (matches the runtime fallback chain).
  const designPath = join(ROOT, 'public', 'looks', look, 'design.json')
  let design = {}
  if (existsSync(designPath)) {
    try { design = JSON.parse(readFileSync(designPath, 'utf-8')) }
    catch (e) { console.warn(`[bake-buildings] design.json unreadable: ${e.message}`) }
  }
  const palette = design.buildingPalette || DEFAULT_PALETTE
  const physics = design.materialPhysics || {}
  console.log(`[bake-buildings] using palette[${palette.length}] + ${Object.keys(physics).length} material physics overrides`)

  // Bucket per-material. Walls bucket by wall_material; roofs by
  // roof_material; foundations all share one bucket. Each bucket also
  // accumulates a per-vertex color array so each building keeps its
  // own tint inside the merged mesh.
  const walls = new Map()
  const roofs = new Map()
  const founds = new Map()
  const ensure = (m, mat) => {
    if (!m.has(mat)) m.set(mat, { positions: [], indices: [], colors: [], uvs: [], centroidYs: [], vCount: 0 })
    return m.get(mat)
  }
  const pushColors = (bucket, count, rgb) => {
    for (let i = 0; i < count; i++) bucket.colors.push(rgb[0], rgb[1], rgb[2])
  }
  const pushCentroidY = (bucket, count, value) => {
    for (let i = 0; i < count; i++) bucket.centroidYs.push(value)
  }

  for (const b of buildings) {
    const fp = b.footprint
    if (!fp || fp.length < 3) continue
    const h = (b.size && b.size[1]) || (b.stories ? b.stories * 3.5 : 8)
    // Foundation rule:
    //   1. Sample elevation at every footprint vertex, average them →
    //      the LEVEL platform height the house wants to sit on (so its
    //      base spans the slope evenly, not tilted with one corner up).
    //   2. Period pedestal height (fh) sits on top of that level platform
    //      — the visible "pedestal" architectural feature.
    //   3. Bottom of the foundation slab is always Y=0, no floating
    //      houses. The slab gets taller wherever the average elevation
    //      is high; from outside it pokes through the displaced ground
    //      by ~fh in flat spots, and is mostly buried where ground is
    //      higher than the average (e.g. at uphill corners).
    const fh = foundationHeightFor(b, overrides)
    // Ground reverted to flat (#19); foundation top = period pedestal only.
    const foundationY = fh
    const wallTop = foundationY + h
    const wallMat = b.wall_material || 'brick_red'
    const roofMat = b.roof_material || 'flat'
    const roofShape = classifyRoofFor(b, overrides)
    const stories = b.stories || 1
    const {
      wallPositions, wallIndices, wallUVs,
      roofPositions, roofIndices, roofUVs,
      foundPositions, foundIndices, foundUVs,
    } = buildingGeometry(fp, foundationY, wallTop, roofShape, stories)

    // Per-building color packing — pick from the Look's palette via
    // deterministic id hash (matches LafayetteScene's effectiveBuildingColor).
    // Per-building override (buildingOverrides.color) wins if set; else
    // palette; else legacy building.color.
    const ovColor = overrides[b.id]?.color
    const tintHex = ovColor || palette[hashStr(b.id) % palette.length] || b.color
    const wallRgb  = parseHex(tintHex)
    const foundRgb = parseHex(FOUNDATION_MATERIAL.color)     // uniform tan
    // Roof color rule mirrors LafayetteScene exactly:
    //  - flat: uniform near-black, NO building tint, NO texture
    //  - slate/metal: HSL-transform of building tint (hue kept, sat×0.3,
    //    lum=0.15 slate / 0.28 metal), overlay-blended with texture in shader
    const roofRgb = roofMat === 'flat'
      ? [0.04, 0.04, 0.045]
      : roofTintFor(tintHex, roofMat)

    // Per-building centroid elevation (raw, no exag). Each vertex of this
    // building carries the same centroidY so the runtime can lift the
    // whole building rigidly via `position.y += aCentroidY * uExag`.
    let centroidY = 0
    for (let i = 0; i < fp.length; i++) centroidY += getElevationRaw(fp[i][0], fp[i][1])
    centroidY /= fp.length

    // Append walls
    {
      const bucket = ensure(walls, wallMat)
      const base = bucket.vCount
      const vAdded = wallPositions.length / 3
      for (let i = 0; i < wallPositions.length; i++) bucket.positions.push(wallPositions[i])
      for (let i = 0; i < wallUVs.length;        i++) bucket.uvs.push(wallUVs[i])
      for (let i = 0; i < wallIndices.length;    i++) bucket.indices.push(wallIndices[i] + base)
      pushColors(bucket, vAdded, wallRgb)
      pushCentroidY(bucket, vAdded, centroidY)
      bucket.vCount += vAdded
    }
    if (foundPositions.length) {
      const bucket = ensure(founds, 'foundation')
      const base = bucket.vCount
      const vAdded = foundPositions.length / 3
      for (let i = 0; i < foundPositions.length; i++) bucket.positions.push(foundPositions[i])
      for (let i = 0; i < foundUVs.length;        i++) bucket.uvs.push(foundUVs[i])
      for (let i = 0; i < foundIndices.length;    i++) bucket.indices.push(foundIndices[i] + base)
      pushColors(bucket, vAdded, foundRgb)
      pushCentroidY(bucket, vAdded, centroidY)
      bucket.vCount += vAdded
    }
    {
      const bucket = ensure(roofs, roofMat)
      const base = bucket.vCount
      const vAdded = roofPositions.length / 3
      for (let i = 0; i < roofPositions.length; i++) bucket.positions.push(roofPositions[i])
      for (let i = 0; i < roofUVs.length;        i++) bucket.uvs.push(roofUVs[i])
      for (let i = 0; i < roofIndices.length;    i++) bucket.indices.push(roofIndices[i] + base)
      pushColors(bucket, vAdded, roofRgb)
      pushCentroidY(bucket, vAdded, centroidY)
      bucket.vCount += vAdded
    }
  }

  // Pack groups in deterministic order: walls first (in palette order),
  // then roofs. So composite paint order is walls under roof caps.
  const groups = []
  const positionChunks = []
  const colorChunks    = []
  const uvChunks       = []
  const centroidChunks = []
  const indexChunks    = []
  let posByteOffset = 0
  let colByteOffset = 0
  let uvByteOffset  = 0
  let cyByteOffset  = 0
  let idxByteOffset = 0
  let renderOrder = 0

  function emitGroup(kind, mat, paletteMap, bucket) {
    if (bucket.indices.length === 0) return
    const positions   = new Float32Array(bucket.positions)
    const colors      = new Float32Array(bucket.colors)
    const uvs         = new Float32Array(bucket.uvs)
    const centroidYs  = new Float32Array(bucket.centroidYs)
    const indices     = new Uint32Array(bucket.indices)
    const def = paletteMap[mat] || paletteMap[Object.keys(paletteMap)[0]]
    const physKey = kind === 'roof' ? `roof_${mat}` : mat
    const ov = physics[physKey] || physics[mat] || {}
    groups.push({
      kind,
      id: mat,
      color: def.color,
      roughness: ov.roughness ?? def.roughness,
      metalness: ov.metalness ?? def.metalness,
      textureScale: ov.textureScale ?? 1,
      textureStrength: ov.textureStrength ?? 0.4,
      emissive: ov.emissive ?? '#000000',
      emissiveIntensity: ov.emissiveIntensity ?? 0,
      renderOrder: renderOrder++,
      vertexCount: positions.length / 3,
      vertexByteOffset: posByteOffset,
      colorByteOffset:  colByteOffset,
      uvByteOffset:     uvByteOffset,
      centroidYByteOffset: cyByteOffset,
      indexCount: indices.length,
      indexByteOffset: idxByteOffset,
    })
    positionChunks.push(positions)
    colorChunks.push(colors)
    uvChunks.push(uvs)
    centroidChunks.push(centroidYs)
    indexChunks.push(indices)
    posByteOffset += positions.byteLength
    colByteOffset += colors.byteLength
    uvByteOffset  += uvs.byteLength
    cyByteOffset  += centroidYs.byteLength
    idxByteOffset += indices.byteLength
  }

  // Foundations first (lowest in Z-stack, smallest count). Then walls,
  // then roofs (visible top).
  if (founds.has('foundation')) {
    emitGroup('foundation', 'foundation',
      { foundation: FOUNDATION_MATERIAL }, founds.get('foundation'))
  }
  for (const mat of Object.keys(WALL_MATERIALS)) {
    if (walls.has(mat)) emitGroup('wall', mat, WALL_MATERIALS, walls.get(mat))
  }
  for (const mat of Object.keys(ROOF_MATERIALS)) {
    if (roofs.has(mat)) emitGroup('roof', mat, ROOF_MATERIALS, roofs.get(mat))
  }

  // Layout: [positions][colors][uvs][centroidYs][indices].
  const totalPosBytes = posByteOffset
  const totalColBytes = colByteOffset
  const totalUvBytes  = uvByteOffset
  const totalCyBytes  = cyByteOffset
  const totalIdxBytes = idxByteOffset
  const buf = new Uint8Array(totalPosBytes + totalColBytes + totalUvBytes + totalCyBytes + totalIdxBytes)
  let off = 0
  for (const c of positionChunks) {
    buf.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), off)
    off += c.byteLength
  }
  const colorSectionStart = totalPosBytes
  for (const g of groups) g.colorByteOffset += colorSectionStart
  for (const c of colorChunks) {
    buf.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), off)
    off += c.byteLength
  }
  const uvSectionStart = totalPosBytes + totalColBytes
  for (const g of groups) g.uvByteOffset += uvSectionStart
  for (const c of uvChunks) {
    buf.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), off)
    off += c.byteLength
  }
  const centroidSectionStart = totalPosBytes + totalColBytes + totalUvBytes
  for (const g of groups) g.centroidYByteOffset += centroidSectionStart
  for (const c of centroidChunks) {
    buf.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), off)
    off += c.byteLength
  }
  const indexSectionStart = totalPosBytes + totalColBytes + totalUvBytes + totalCyBytes
  for (const g of groups) g.indexByteOffset += indexSectionStart
  for (const c of indexChunks) {
    buf.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), off)
    off += c.byteLength
  }

  // Bbox
  let bx0 = +Infinity, by0 = +Infinity, bz0 = +Infinity
  let bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity
  for (const c of positionChunks) {
    for (let i = 0; i < c.length; i += 3) {
      const x = c[i], y = c[i + 1], z = c[i + 2]
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x
      if (y < by0) by0 = y; if (y > by1) by1 = y
      if (z < bz0) bz0 = z; if (z > bz1) bz1 = z
    }
  }

  const manifest = {
    version: 1,
    look,
    generatedAt: Date.now(),
    bbox: { min: [bx0, by0, bz0], max: [bx1, by1, bz1] },
    bin: 'buildings.bin',
    positionFormat: 'float32',
    colorFormat: 'float32',
    uvFormat: 'float32',
    centroidYFormat: 'float32',
    indexFormat: 'uint32',
    componentsPerVertex: 3,
    colorsPerVertex: 3,
    uvsPerVertex: 2,
    centroidYsPerVertex: 1,
    buildingCount: buildings.length,
    groups,
  }

  writeFileSync(join(outDir, 'buildings.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(join(outDir, 'buildings.bin'), Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))

  const sizeKb = (buf.byteLength / 1024).toFixed(1)
  const totalTris = groups.reduce((s, g) => s + g.indexCount / 3, 0)
  const totalVerts = groups.reduce((s, g) => s + g.vertexCount, 0)
  console.log(`[bake-buildings] look=${look}: ${buildings.length} buildings, ${groups.length} groups, ${totalVerts} verts, ${totalTris} tris, ${sizeKb} KB`)
  return manifest
}

async function main() {
  let look = 'default'
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--look=(.+)$/)
    if (m) look = m[1]
  }
  await bakeBuildings({ look })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
