/**
 * bake-ground.js — Three.js ground bake for Preview / runtime.
 *
 * Reads ribbons.json and emits a single merged, triangulated, indexed
 * ground plane geometry as a binary buffer + JSON manifest:
 *
 *   public/baked/<look>/ground.json  — manifest (groups, palette, bbox)
 *   public/baked/<look>/ground.bin   — Float32 positions + Uint32 indices
 *
 * One geometry group per material/face-use. Runtime mounts one Mesh per
 * group → a handful of draw calls for the entire ground plane.
 *
 * Coord space: ribbons.json [x,z] meters, origin = neighborhood center.
 * Y = 0 always (flat). Y axis up at runtime.
 *
 * Render order is encoded per group via `renderOrder` + `polygonOffset`
 * pairs so coplanar surfaces never Z-fight (per
 * `feedback_never_y_offsets.md`).
 *
 * AO lightmap is a follow-on pass (see `bake-ground-ao.js`, separate task).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { buildPaths, LAND_USE_COLORS } from './bake-paths.js'
import { BAND_COLORS } from '../src/cartograph/streetProfiles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Inline elevation utility — node ESM can't import the JSON via the
// browser-side elevation.js without import attributes, so we duplicate
// the bilinear sampler here. Must match src/utils/elevation.js exactly
// (V_EXAG, bounds, sampling) so Preview and cartograph agree.
const _terrain = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'terrain.json'), 'utf-8'))
const _spanX = _terrain.bounds.maxX - _terrain.bounds.minX
const _spanZ = _terrain.bounds.maxZ - _terrain.bounds.minZ
const V_EXAG = 5

// Canonical stencil — same artifact every consumer reads. The bake bbox
// is derived from skirtExtent ± center here so AO baker rays + UV map
// stay locked to the silhouette regardless of where ribbon positions
// happen to fall this run.
const _stencil = JSON.parse(readFileSync(
  join(ROOT, 'cartograph', 'data', 'neighborhood_boundary.json'),
  'utf-8'
))
const STENCIL_CENTER = _stencil.center || [0, 0]
const STENCIL_RADIUS = _stencil.radius || 1
const STENCIL_FACE_FADE   = _stencil.fade       || { inner: STENCIL_RADIUS - 134, outer: STENCIL_RADIUS }
const STENCIL_STREET_FADE = _stencil.streetFade || { inner: STENCIL_RADIUS - 92,  outer: STENCIL_RADIUS + 108 }

// Bake-time geometry clip polygon — the stencil polygon scaled outward
// to streetFade.outer + a small buffer. Ribbons + faces get intersected
// against this so nothing extends past the silhouette.
const STENCIL_POLYGON = (() => {
  const poly = _stencil.boundary || []
  if (!poly.length) return null
  const cx = STENCIL_CENTER[0], cz = STENCIL_CENTER[1]
  const targetR = STENCIL_STREET_FADE.outer + 50
  const scale = targetR / STENCIL_RADIUS
  return poly.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
})()

function getElevation(x, z) {
  const gx = ((x - _terrain.bounds.minX) / _spanX) * (_terrain.width - 1)
  const gz = ((z - _terrain.bounds.minZ) / _spanZ) * (_terrain.height - 1)
  const gx0 = Math.max(0, Math.min(_terrain.width - 2, Math.floor(gx)))
  const gz0 = Math.max(0, Math.min(_terrain.height - 2, Math.floor(gz)))
  // Clamp the fractional offsets so out-of-bounds points don't
  // extrapolate to wonky values — they just inherit the nearest cell.
  const fx = Math.max(0, Math.min(1, gx - gx0))
  const fz = Math.max(0, Math.min(1, gz - gz0))
  const e00 = _terrain.data[gz0 * _terrain.width + gx0] || 0
  const e10 = _terrain.data[gz0 * _terrain.width + (gx0 + 1)] || 0
  const e01 = _terrain.data[(gz0 + 1) * _terrain.width + gx0] || 0
  const e11 = _terrain.data[(gz0 + 1) * _terrain.width + (gx0 + 1)] || 0
  const e0 = e00 * (1 - fx) + e10 * fx
  const e1 = e01 * (1 - fx) + e11 * fx
  return (e0 * (1 - fz) + e1 * fz) * V_EXAG
}

// Paint order (deepest = drawn first). The pure-Three.js bake bundle is
// the canonical runtime artifact.
// renderOrder ascends with paint order so the runtime composites correctly.
const PAINT_ORDER = [
  // Faces (land-use) at the bottom
  ['face', 'residential'],
  ['face', 'commercial'],
  ['face', 'vacant'],
  ['face', 'vacant-commercial'],
  ['face', 'parking'],
  ['face', 'institutional'],
  ['face', 'recreation'],
  ['face', 'industrial'],
  ['face', 'park'],
  ['face', 'island'],
  ['face', 'unknown'],
  // Ribbons stacked from outside → inside
  ['mat', 'lawn'],
  ['mat', 'treelawn'],
  ['mat', 'sidewalk'],
  ['mat', 'curb'],
  ['mat', 'asphalt'],
  ['mat', 'highway'],
  ['mat', 'median'],
  // Path ribbons painted last (sit on top wherever they cross)
  ['mat', 'footway'],
  ['mat', 'cycleway'],
  ['mat', 'steps'],
  ['mat', 'path'],
]

// Triangulate one polygon (outer ring + optional hole rings). Returns
// indices referencing the merged buffer. ShapeUtils.triangulateShape
// honors holes — feed it the contour and an array of holes and the result
// indexes into [contour..., ...holes...] in declaration order.
//
// Winding: ShapeUtils emits CCW in (x, z) 2D, which is CW when mapped to
// (x, 0, z) viewed from +Y. Flip the index order so the triangle's front
// face is up — receives sun shadow correctly under FrontSide.
function triangulatePolygon(outer, holes, vertexOffset) {
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z))
  const holeContours = holes.map(h => h.map(([x, z]) => new THREE.Vector2(x, z)))
  const tris = THREE.ShapeUtils.triangulateShape(contour, holeContours)
  const indices = new Uint32Array(tris.length * 3)
  for (let i = 0; i < tris.length; i++) {
    indices[i * 3]     = tris[i][0] + vertexOffset
    indices[i * 3 + 1] = tris[i][2] + vertexOffset
    indices[i * 3 + 2] = tris[i][1] + vertexOffset
  }
  return indices
}

// Group input items into one material's BufferGeometry data. `items` is
// either an array of rings (ribbon bands — simple polygons) or an array
// of {outer, holes} faces (land-use fills, post-clip).
//
// Y per vertex = 0 today (perimeter bowl parked behind issue #19); the
// terrain-aware variant lives behind getElevation()/V_EXAG when re-enabled.
function itemsToBuffers(items) {
  // Normalize to {outer, holes} so the rest of the function is uniform.
  const polys = []
  for (const it of items) {
    if (!it) continue
    if (Array.isArray(it)) {
      if (it.length >= 3) polys.push({ outer: it, holes: [] })
    } else if (it.outer && it.outer.length >= 3) {
      polys.push({ outer: it.outer, holes: it.holes || [] })
    }
  }
  let totalVerts = 0
  for (const p of polys) {
    totalVerts += p.outer.length
    for (const h of p.holes) totalVerts += h.length
  }
  const positions = new Float32Array(totalVerts * 3)
  const indexChunks = []
  let vIdx = 0
  const writeRing = (ring) => {
    for (let i = 0; i < ring.length; i++) {
      positions[vIdx * 3]     = ring[i][0]
      positions[vIdx * 3 + 1] = 0
      positions[vIdx * 3 + 2] = ring[i][1]
      vIdx++
    }
  }
  for (const p of polys) {
    const base = vIdx
    writeRing(p.outer)
    for (const h of p.holes) writeRing(h)
    indexChunks.push(triangulatePolygon(p.outer, p.holes, base))
  }
  let idxLen = 0
  for (const c of indexChunks) idxLen += c.length
  const indices = new Uint32Array(idxLen)
  let off = 0
  for (const c of indexChunks) { indices.set(c, off); off += c.length }
  return { positions, indices }
}

export async function bakeGround({ look = 'default' } = {}) {
  const ribbonsPath = join(ROOT, 'src', 'data', 'ribbons.json')
  const outDir      = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf-8'))
  const { byMaterial, byFaceUse } = buildPaths(ribbons, STENCIL_POLYGON)

  // Build groups in paint order. Each group = one merged BufferGeometry.
  const groups = []
  let posByteOffset = 0
  let idxByteOffset = 0
  const positionChunks = []
  const indexChunks = []

  let renderOrder = 0
  for (const [kind, key] of PAINT_ORDER) {
    // Faces are {outer, holes} entries (post-clip); ribbons are bare rings.
    // itemsToBuffers normalizes both — holes are honored at triangulation
    // time so the lawn ribbon underneath a clipped face fill stays visible.
    const items = kind === 'face' ? byFaceUse.get(key) : byMaterial.get(key)
    if (!items || items.length === 0) continue
    const { positions, indices } = itemsToBuffers(items)
    if (indices.length === 0) continue

    const color = kind === 'face'
      ? (LAND_USE_COLORS[key] || LAND_USE_COLORS.unknown)
      : (BAND_COLORS[key] || '#666666')

    groups.push({
      kind,
      id: key,
      color,
      renderOrder: renderOrder++,
      // polygonOffsetFactor descends so deeper layers are "behind" — the
      // runtime sets `polygonOffset:true, polygonOffsetUnits: -1 * (renderOrder)`.
      // Stored so the runtime doesn't have to re-derive.
      polygonOffsetUnits: -renderOrder,
      vertexCount: positions.length / 3,
      vertexByteOffset: posByteOffset,
      indexCount: indices.length,
      indexByteOffset: idxByteOffset,
    })

    positionChunks.push(positions)
    indexChunks.push(indices)
    posByteOffset += positions.byteLength
    idxByteOffset += indices.byteLength
  }

  // Concatenate positions (all Float32) and indices (all Uint32) into one
  // .bin. Layout: [all positions][all indices]. Manifest's *ByteOffset
  // values are relative to the START of each section (offsets within the
  // positions section, then offsets within the indices section).
  const totalPosBytes = posByteOffset
  const totalIdxBytes = idxByteOffset
  const buf = new Uint8Array(totalPosBytes + totalIdxBytes)
  let off = 0
  for (const c of positionChunks) {
    buf.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), off)
    off += c.byteLength
  }
  // Index section starts here. Patch up indexByteOffset to be relative
  // to the start of the bin file rather than to the index section.
  const indexSectionStart = totalPosBytes
  for (const g of groups) g.indexByteOffset += indexSectionStart
  for (const c of indexChunks) {
    buf.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), off)
    off += c.byteLength
  }

  // Bake bbox derived from the canonical stencil, NOT the positions union.
  // Anchored to STENCIL_CENTER so the AO baker's texel→world map and
  // BakedGround's UV2 are both concentric with face/street fades.
  // Half-extent = streetFade.outer + small buffer so all visible ground
  // geometry stays inside the bbox at full UV resolution; oversize would
  // waste lightmap texels.
  const _bakeHalf = (_stencil.streetFade?.outer ?? 1000) + 50
  const bx0 = STENCIL_CENTER[0] - _bakeHalf
  const bx1 = STENCIL_CENTER[0] + _bakeHalf
  const bz0 = STENCIL_CENTER[1] - _bakeHalf
  const bz1 = STENCIL_CENTER[1] + _bakeHalf

  const manifest = {
    version: 1,
    look,
    generatedAt: Date.now(),
    bbox: { min: [bx0, 0, bz0], max: [bx1, 0, bz1] },
    // Canonical stencil values, frozen into the artifact so the runtime
    // BakedGround can compute its radial fade without a side import.
    stencil: {
      center: STENCIL_CENTER,
      radius: STENCIL_RADIUS,
      fade: STENCIL_FACE_FADE,
      streetFade: STENCIL_STREET_FADE,
    },
    bin: 'ground.bin',
    positionFormat: 'float32',
    indexFormat: 'uint32',
    componentsPerVertex: 3,   // x, y, z
    groups,
  }

  writeFileSync(join(outDir, 'ground.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(join(outDir, 'ground.bin'), Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))

  const sizeKb = (buf.byteLength / 1024).toFixed(1)
  const totalTris = groups.reduce((s, g) => s + g.indexCount / 3, 0)
  const totalVerts = groups.reduce((s, g) => s + g.vertexCount, 0)
  console.log(`[bake-ground] look=${look}: ${groups.length} groups, ${totalVerts} verts, ${totalTris} tris, ${sizeKb} KB`)
  return manifest
}

// CLI
async function main() {
  let look = 'default'
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--look=(.+)$/)
    if (m) look = m[1]
  }
  await bakeGround({ look })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
