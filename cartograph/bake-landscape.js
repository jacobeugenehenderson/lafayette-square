#!/usr/bin/env node
/**
 * Cartograph — bake-landscape: the brought mountain backdrop into the slab.
 *
 * PIECE 2 of HANDOFF-altadena-mountain-hero.md. Parses the scene's decimated DEM
 * mesh (`terrain/sangabriel.obj`) into a per-look slab artifact — a native-PBR
 * GLB + a manifest carrying the GEO-ANCHORED placement defaults — under the
 * look's baked dir. The §10 brought-GLB path made real for a *landscape* (the
 * third hero subject kind): a mesh rendered behind everything, not a point.
 *
 *   node bake-landscape.js --look=<id> --scene=<scene>
 *   (or CARTOGRAPH_SCENE=<scene> node bake-landscape.js --look=<id>)
 *
 * Inputs:  cartograph/data/<scene>/terrain/{sangabriel.obj, meta.json, heights.f32}
 *          cartograph/data/<scene>/geography.json  (hood center + projection)
 * Outputs: public/baked/<look>/landscape/{sangabriel.glb, landscape.json}
 *
 * Native materials, §10 — a plain MeshStandardMaterial (auto TOD lighting; the
 * snowline/haze knobs are onBeforeCompile patches in the piece-3 renderer). NOT
 * the tree atlas path. Unbaked = unshipped.
 *
 * Frame: the OBJ is real meters, Y-up (ASL), +X=east, +Z=south, centered on the
 * DEM grid — SAME axes as the world slab (verified: +x=E, +z=S → NORTH is −z,
 * from ARCH_FLAT_DEFAULTS' real bearing; the reference_ls_local_frame_axes memo
 * that says +x=W is empty/stale). So the geo-anchor is a pure translate: place
 * the DEM center at the hood→DEM ENU offset, north landing at −z.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))          // cartograph/
const REPO_ROOT = join(here, '..')

const arg = (k) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : null }
const lookId = arg('look')
const scene = arg('scene') || process.env.CARTOGRAPH_SCENE
if (!lookId) { console.error('bake-landscape: need --look=<id>'); process.exit(1) }
if (!scene) { console.error('bake-landscape: need --scene=<scene> or CARTOGRAPH_SCENE'); process.exit(1) }

const sceneDir = join(here, 'data', scene)
// --source=<repo-relative path to the .obj> — the Look's EXPLICIT Stage-intake
// opt-in (design.landscape.source). a20619cc moved the landscape assets OUT of the
// pour dir (a stray sangabriel.obj in data/<scene>/ silently baked the mountains
// into Altadena) to cartograph/_landscape-intake/<scene>/, and taught serve.js to
// pass --source= — but never taught THIS script to read it, so it kept looking in
// data/<scene>/terrain/, which no longer exists. Honour --source; fall back to the
// legacy in-pour location so a scene that never moved still bakes.
const sourceArg = arg('source')
const terrainDir = sourceArg
  ? dirname(join(here, '..', sourceArg))
  : join(sceneDir, 'terrain')
const objPath = sourceArg
  ? join(here, '..', sourceArg)
  : join(terrainDir, 'sangabriel.obj')
const metaPath = join(terrainDir, 'meta.json')
const heightsPath = join(terrainDir, 'heights.f32')
const geoPath = join(sceneDir, 'geography.json')
if (!existsSync(objPath)) { console.error(`bake-landscape: no ${objPath}`); process.exit(1) }

console.log('='.repeat(60))
console.log(`bake-landscape — ${scene} → look ${lookId}`)
console.log('='.repeat(60))

// ── Parse the OBJ (v = position, f = 1-based tri indices; no vn/vt) ──────────
const obj = readFileSync(objPath, 'utf8')
const positions = []   // flat [x,y,z, …]
const indices = []     // flat 0-based tri indices
for (let i = 0, n = obj.length; i < n;) {
  const nl = obj.indexOf('\n', i); const end = nl === -1 ? n : nl
  const line = obj.slice(i, end); i = end + 1
  if (line.charCodeAt(0) === 118 && line.charCodeAt(1) === 32) {          // "v "
    const p = line.split(/\s+/)
    positions.push(+p[1], +p[2], +p[3])
  } else if (line.charCodeAt(0) === 102 && line.charCodeAt(1) === 32) {   // "f "
    const p = line.split(/\s+/)
    // faces may be "f a b c" or "f a/.. b/.. c/.."; take the vertex index only
    const a = parseInt(p[1], 10) - 1, b = parseInt(p[2], 10) - 1, c = parseInt(p[3], 10) - 1
    indices.push(a, b, c)
  }
}
const vCount = positions.length / 3, fCount = indices.length / 3
console.log(`  parsed ${vCount.toLocaleString()} verts · ${fCount.toLocaleString()} tris`)

// ── Compute smooth vertex normals (OBJ carries none) ────────────────────────
const normals = new Float32Array(positions.length)
for (let f = 0; f < indices.length; f += 3) {
  const ia = indices[f] * 3, ib = indices[f + 1] * 3, ic = indices[f + 2] * 3
  const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2]
  const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2]
  const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2]
  const ux = bx - ax, uy = by - ay, uz = bz - az
  const vx = cx - ax, vy = cy - ay, vz = cz - az
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx   // area-weighted
  normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz
  normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz
  normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz
}
for (let v = 0; v < normals.length; v += 3) {
  const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1
  normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l
}

// ── Geo-anchor: place the DEM center at the hood→DEM ENU offset ──────────────
const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
const geo = JSON.parse(readFileSync(geoPath, 'utf8'))
const [demLat, demLon] = meta.centerLatLon
const lonToM = geo.lonToMeters || Math.round(111320 * Math.cos(geo.lat * Math.PI / 180))
const latToM = geo.latToMeters || 111000
const east = (demLon - geo.lon) * lonToM         // +east
const north = (demLat - geo.lat) * latToM        // +north
const worldX = east, worldZ = -north             // world: +x=E, +z=S → north = −z
const distance = Math.round(Math.hypot(worldX, worldZ))
const bearingX = +(worldX / distance).toFixed(4)
const bearingZ = +(worldZ / distance).toFixed(4)

// yOffset: drop the mesh so the DEM elevation AT THE HOOD CENTER sits at world
// y≈0 (the flat-poured hood ground), so a future terrained margin joins cleanly.
let hoodGroundASL = meta.minElevM || 0
if (existsSync(heightsPath)) {
  try {
    const buf = readFileSync(heightsPath)
    const hf = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
    const col = Math.max(0, Math.min(meta.width - 1, Math.round((geo.lon - meta.bbox.minLon) / (meta.bbox.maxLon - meta.bbox.minLon) * (meta.width - 1))))
    const row = Math.max(0, Math.min(meta.height - 1, Math.round((meta.bbox.maxLat - geo.lat) / (meta.bbox.maxLat - meta.bbox.minLat) * (meta.height - 1))))
    const s = hf[row * meta.width + col]
    if (Number.isFinite(s)) hoodGroundASL = s
  } catch (e) { console.warn(`  heights sample failed (${e.message}); using minElevM`) }
}
const yOffset = -Math.round(hoodGroundASL)
console.log(`  geo-anchor: DEM center ${north.toFixed(0)}m N, ${east.toFixed(0)}m E of hood → world (${worldX.toFixed(0)}, ${worldZ.toFixed(0)}) · dist ${distance} · bearing (${bearingX}, ${bearingZ})`)
console.log(`  hood ground ≈ ${hoodGroundASL.toFixed(0)}m ASL → yOffset ${yOffset}`)

// ── Bounds (for the manifest / renderer frustum) ────────────────────────────
let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
for (let v = 0; v < positions.length; v += 3) {
  const x = positions[v], y = positions[v + 1], z = positions[v + 2]
  if (x < minX) minX = x; if (x > maxX) maxX = x
  if (y < minY) minY = y; if (y > maxY) maxY = y
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
}

// ── Write a minimal glTF 2.0 GLB (POSITION + NORMAL + indices, 1 PBR material) ─
const posA = new Float32Array(positions)
const normA = normals
const use32 = vCount > 65535
const idxA = use32 ? new Uint32Array(indices) : new Uint16Array(indices)
const IDX_CT = use32 ? 5125 : 5123   // UNSIGNED_INT / UNSIGNED_SHORT
const pad4 = (nBytes) => (4 - (nBytes % 4)) % 4

const posBytes = posA.byteLength, normBytes = normA.byteLength, idxBytes = idxA.byteLength
const idxPad = pad4(posBytes + normBytes + idxBytes)
const binLen = posBytes + normBytes + idxBytes + idxPad
const gltf = {
  asset: { version: '2.0', generator: 'cartograph/bake-landscape' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'sangabriel' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{
    name: 'mountain',
    pbrMetallicRoughness: { baseColorFactor: [0.42, 0.40, 0.36, 1], metallicFactor: 0, roughnessFactor: 1 },
  }],
  buffers: [{ byteLength: binLen }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
    { buffer: 0, byteOffset: posBytes, byteLength: normBytes, target: 34962 },
    { buffer: 0, byteOffset: posBytes + normBytes, byteLength: idxBytes, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: vCount, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    { bufferView: 1, componentType: 5126, count: vCount, type: 'VEC3' },
    { bufferView: 2, componentType: IDX_CT, count: indices.length, type: 'SCALAR' },
  ],
}
const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8')
const jsonPad = pad4(jsonBuf.length)
const jsonChunkLen = jsonBuf.length + jsonPad
const totalLen = 12 + 8 + jsonChunkLen + 8 + binLen
const glb = Buffer.alloc(totalLen)
let o = 0
glb.writeUInt32LE(0x46546C67, o); o += 4        // 'glTF'
glb.writeUInt32LE(2, o); o += 4                  // version
glb.writeUInt32LE(totalLen, o); o += 4           // total length
glb.writeUInt32LE(jsonChunkLen, o); o += 4       // JSON chunk length
glb.writeUInt32LE(0x4E4F534A, o); o += 4         // 'JSON'
jsonBuf.copy(glb, o); o += jsonBuf.length
for (let p = 0; p < jsonPad; p++) glb.writeUInt8(0x20, o++)   // space-pad JSON
glb.writeUInt32LE(binLen, o); o += 4             // BIN chunk length
glb.writeUInt32LE(0x004E4942, o); o += 4         // 'BIN\0'
Buffer.from(posA.buffer, posA.byteOffset, posBytes).copy(glb, o); o += posBytes
Buffer.from(normA.buffer, normA.byteOffset, normBytes).copy(glb, o); o += normBytes
Buffer.from(idxA.buffer, idxA.byteOffset, idxBytes).copy(glb, o); o += idxBytes
// remaining idxPad bytes already zero

const outDir = join(REPO_ROOT, 'public', 'baked', lookId, 'landscape')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'sangabriel.glb'), glb)

// ── Manifest — the piece-1 placement defaults + asset pointer + bounds ───────
const manifest = {
  version: 1,
  label: 'San Gabriel Range',
  asset: 'sangabriel.glb',
  source: sourceArg || 'terrain/sangabriel.obj',
  verts: vCount, tris: fCount,
  elevM: { min: meta.minElevM, max: meta.maxElevM },
  bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
  // Geo-anchored placement DEFAULTS — seed the landscape channel's placement
  // knobs on first pour (§0.0: strong default, operator-overridable). world =
  // distance · [bearingX, _, bearingZ]; north = −z.
  placement: { bearingX, bearingZ, distance, scale: 1.0, rotation: 0, yOffset },
  anchor: { hood: { lat: geo.lat, lon: geo.lon }, demCenter: { lat: demLat, lon: demLon }, offsetM: { east: Math.round(east), north: Math.round(north) } },
}
writeFileSync(join(outDir, 'landscape.json'), JSON.stringify(manifest, null, 2))
console.log(`  → ${join('public', 'baked', lookId, 'landscape', 'sangabriel.glb')} (${(glb.length / 1024 / 1024).toFixed(1)} MB) + landscape.json`)
console.log('  done.')
