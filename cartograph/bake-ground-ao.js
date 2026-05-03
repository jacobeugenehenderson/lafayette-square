/**
 * bake-ground-ao.js — pre-baked AO lightmap for the ground.
 *
 * Reads ground.json + buildings.json. Extrudes building footprints as
 * occluders, builds a BVH over the combined geometry, raycasts a
 * hemisphere of rays from each lightmap pixel, and writes a 1024² PNG
 * encoding the AO factor per pixel.
 *
 * Runtime: a single texture sample, free. No real-time AO needed.
 *
 * UV2 mapping is implicit/planar: u = (x - bbox.minX) / W,
 *                                  v = (z - bbox.minZ) / H.
 * Computed at load time in BakedGround.jsx — keeps the bin lean.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { PNG } from 'pngjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

THREE.Mesh.prototype.raycast = acceleratedRaycast

// ── Tunables ────────────────────────────────────────────────────────
const LIGHTMAP_SIZE = 1024     // texels on a side
const RAYS_PER_TEXEL = 24      // hemisphere samples
const MAX_RAY_DIST = 80        // meters; AO falloff distance
const SAMPLE_LIFT = 0.05       // meters above ground; avoid self-hit
// Hemisphere bias — power favoring upward rays. 1 = uniform cosine,
// higher = more vertical (tighter contact AO). 2 = good balance.
const COS_POWER = 2

// ── Helpers ─────────────────────────────────────────────────────────

// Triangulate a building footprint into a 2D index list
// (CCW assumed; some footprints will be CW — ShapeUtils handles either).
function triangulateFootprint(footprint) {
  const contour = footprint.map(([x, z]) => new THREE.Vector2(x, z))
  return THREE.ShapeUtils.triangulateShape(contour, [])
}

// Extrude a building into 3D triangles: a top cap + side walls.
// We don't need the bottom face (it's underground / under ground plane).
function extrudeBuilding(footprint, height) {
  const positions = []  // flat [x,y,z, ...]
  const indices   = []
  const n = footprint.length
  if (n < 3) return { positions, indices }

  // Bottom ring at y=0, top ring at y=height
  for (const [x, z] of footprint) {
    positions.push(x, 0, z)
  }
  for (const [x, z] of footprint) {
    positions.push(x, height, z)
  }
  // Side walls: two tris per edge
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n
    const at = a + n, bt = b + n
    indices.push(a, b, bt, a, bt, at)
  }
  // Top cap (triangulate footprint, lift to top ring)
  const tris = triangulateFootprint(footprint)
  for (const tri of tris) {
    indices.push(tri[0] + n, tri[1] + n, tri[2] + n)
  }
  return { positions, indices }
}

// Build a single merged BufferGeometry from the ground bake + extruded
// buildings. Used as a BVH source for raycasting.
function buildOccluderGeometry(groundManifest, groundBin, buildings) {
  const positions = []
  const indices = []
  let vIdx = 0

  // Ground triangles (all groups merged into one BVH source)
  for (const g of groundManifest.groups) {
    const verts = new Float32Array(groundBin, g.vertexByteOffset, g.vertexCount * 3)
    const idxs  = new Uint32Array(groundBin,  g.indexByteOffset,  g.indexCount)
    const base = vIdx
    for (let i = 0; i < verts.length; i++) positions.push(verts[i])
    vIdx += g.vertexCount
    for (let i = 0; i < idxs.length; i++) indices.push(idxs[i] + (base - 0))
    // ^ idxs are already absolute within their group's verts; since we're
    // appending verts in the same order, we just need to remap to the
    // merged buffer. idxs were stored relative to the group's vertex range
    // starting at 0 inside the group; bake added a vertexOffset already.
    // But we appended verts at offset `base`, so subtract group's local
    // base (which was 0 in the bake) and add `base`. The bake's
    // triangulateRing got vertexOffset=0 per ring, but offset by the
    // ring's start within the group. So group indices are already
    // 0..vertexCount within their group. Adding `base` gives merged idx.
  }

  // Re-emit indices correctly. Above logic is wrong. Redo cleanly.
  positions.length = 0
  indices.length = 0
  vIdx = 0
  for (const g of groundManifest.groups) {
    const verts = new Float32Array(groundBin, g.vertexByteOffset, g.vertexCount * 3)
    const idxs  = new Uint32Array(groundBin,  g.indexByteOffset,  g.indexCount)
    // Find min index value in this group; its indices are local-to-group.
    // (bake-ground.js's triangulateRing uses vertexOffset = base WITHIN
    // the group, and groups concat positions starting at 0 — so group
    // indices are 0..vertexCount-1.)
    const base = vIdx
    for (let i = 0; i < verts.length; i++) positions.push(verts[i])
    for (let i = 0; i < idxs.length; i++) indices.push(idxs[i] + base)
    vIdx += g.vertexCount
  }

  // Building extrusions
  for (const b of buildings) {
    const fp = b.footprint
    if (!fp || fp.length < 3) continue
    const h = (b.size && b.size[1]) || (b.stories ? b.stories * 3.5 : 8)
    const ex = extrudeBuilding(fp, h)
    const base = vIdx
    for (let i = 0; i < ex.positions.length; i++) positions.push(ex.positions[i])
    for (let i = 0; i < ex.indices.length;   i++) indices.push(ex.indices[i] + base)
    vIdx += ex.positions.length / 3
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return { geom, triCount: indices.length / 3, vertCount: vIdx }
}

// Cosine-weighted hemisphere sample (bias toward up via COS_POWER).
function hemisphereSample(rng) {
  const u = rng()
  const v = rng()
  const cosTheta = Math.pow(1 - u, 1 / (COS_POWER + 1))
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta)
  const phi = 2 * Math.PI * v
  return new THREE.Vector3(
    sinTheta * Math.cos(phi),
    cosTheta,
    sinTheta * Math.sin(phi),
  )
}

// Mulberry32 — deterministic per-bake reproducibility
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Bake ────────────────────────────────────────────────────────────

export async function bakeGroundAO({ look = 'default', size = LIGHTMAP_SIZE,
                                     rays = RAYS_PER_TEXEL } = {}) {
  const lookDir = join(ROOT, 'public', 'baked', look)
  const manifestPath = join(lookDir, 'ground.json')
  const binPath = join(lookDir, 'ground.bin')
  if (!existsSync(manifestPath)) throw new Error('ground.json missing — run bake-ground.js first')

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const binBuf = readFileSync(binPath)
  const groundBin = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength)

  const buildingsPath = join(ROOT, 'src', 'data', 'buildings.json')
  const buildings = JSON.parse(readFileSync(buildingsPath, 'utf-8'))
  const buildingList = Array.isArray(buildings) ? buildings : (buildings.buildings || [])

  console.log(`[bake-ao] building occluder mesh from ${manifest.groups.length} ground groups + ${buildingList.length} buildings…`)
  const { geom, triCount } = buildOccluderGeometry(manifest, groundBin, buildingList)
  console.log(`[bake-ao] occluder: ${triCount} triangles. Building BVH…`)
  const bvh = new MeshBVH(geom)

  const bbox = manifest.bbox
  const W = bbox.max[0] - bbox.min[0]
  const H = bbox.max[2] - bbox.min[2]

  // For each ground triangle, paint AO into the lightmap pixels it covers.
  // We rasterize per-triangle by their UV2 (planar). Simpler approach:
  // per-pixel — walk every texel, compute world position, check if it's
  // inside any ground triangle (using BVH closestPointToPoint with a
  // cap), and if so cast hemisphere rays.
  //
  // Even simpler for first pass: assume the entire bbox is ground (true
  // enough — non-ground texels just stay 1.0 and are masked at runtime
  // by the ground mesh's UV2). Skip in/out test, raycast from every
  // texel, accept that a few outlier texels may be over nothing.

  console.log(`[bake-ao] raycasting ${size}×${size} texels × ${rays} rays…`)
  const pixels = new Uint8Array(size * size * 4)  // RGBA
  const ray = new THREE.Ray()
  const target = new THREE.Vector3()
  const origin = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const rng = makeRng(0xC0FFEE)

  let doneRows = 0
  const t0 = Date.now()
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const wx = bbox.min[0] + (u + 0.5) / size * W
      const wz = bbox.min[2] + (v + 0.5) / size * H
      origin.set(wx, SAMPLE_LIFT, wz)

      let hits = 0
      for (let r = 0; r < rays; r++) {
        const d = hemisphereSample(rng)
        dir.copy(d)
        ray.origin.copy(origin)
        ray.direction.copy(dir)
        const hit = bvh.raycastFirst(ray, THREE.FrontSide)
        if (hit && hit.distance < MAX_RAY_DIST) hits++
      }
      const ao = 1 - hits / rays  // 1 = fully lit, 0 = fully occluded
      // Soft floor so deep AO doesn't kill the look
      const out = Math.round(Math.max(0.35, ao) * 255)
      const idx = (v * size + u) * 4
      pixels[idx]     = out
      pixels[idx + 1] = out
      pixels[idx + 2] = out
      pixels[idx + 3] = 255
    }
    doneRows++
    if (doneRows % 64 === 0) {
      const pct = (doneRows / size * 100).toFixed(1)
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      console.log(`  ${pct}% (${elapsed}s)`)
    }
  }

  // Write PNG
  const png = new PNG({ width: size, height: size })
  png.data = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  const outPath = join(lookDir, 'ground.lightmap.png')
  writeFileSync(outPath, PNG.sync.write(png))

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[bake-ao] wrote ${outPath} (${size}², ${rays} rays/texel, ${elapsed}s)`)

  // Patch manifest with lightmap reference
  manifest.lightmap = {
    image: 'ground.lightmap.png',
    size,
    rays,
    floor: 0.35,
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

// CLI
async function main() {
  let look = 'default', size = LIGHTMAP_SIZE, rays = RAYS_PER_TEXEL
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/))) look = m[1]
    else if ((m = arg.match(/^--size=(\d+)$/))) size = parseInt(m[1], 10)
    else if ((m = arg.match(/^--rays=(\d+)$/))) rays = parseInt(m[1], 10)
  }
  await bakeGroundAO({ look, size, rays })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
