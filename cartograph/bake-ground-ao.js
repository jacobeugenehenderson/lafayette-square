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
import { writeIfChanged } from './io.js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { PNG } from 'pngjs'
import { loadBuildings } from './bake-buildings.js'

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
                                     rays = RAYS_PER_TEXEL, scene = 'lafayette-square' } = {}) {
  const isDefaultScene = scene === 'lafayette-square'
  const lookDir = join(ROOT, 'public', 'baked', look)
  const manifestPath = join(lookDir, 'ground.json')
  const binPath = join(lookDir, 'ground.bin')
  if (!existsSync(manifestPath)) throw new Error('ground.json missing — run bake-ground.js first')

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const binBuf = readFileSync(binPath)
  const groundBin = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength)

  // Occluders are PER-SCENE: the same buildings the scene renders (render
  // ledger → clean/map.json fallback), NOT LS's src/data/buildings.json — or a
  // poured installation raycasts its AO against Lafayette Square's footprints
  // and bakes LS's building AO onto its own ground (the vestigial-ghost bug,
  // sibling to the FX-map fix below). Shared with bake-buildings.js so the AO
  // occluders and the rendered mesh come from ONE source.
  const buildingList = loadBuildings(scene)

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

  // ── Ground FX map — R: lamp light pools · G: contact shadows ─────────
  // One RG texture sampled once by the ground shaders:
  //   R = additive lamp light pool (dark center → bright soft ring → 0),
  //       SUMMED over lamps (overlaps build up), scaled live by the TOD Pool
  //       value. Shape knobs are BAKE-TIME (re-bake to retune).
  //   G = contact shadow — soft dark rings under every TREE base + LAMP base,
  //       which the ground shaders MULTIPLY into the diffuse DIRECTLY (visible
  //       in daytime — unlike the AO lightmap, which only dims ambient). This
  //       is the "daytime shadow ring." Retires the floating baseMat disc.
  // Own bbox = union(tree extent, lamp extent) + margin → crisp (~0.5 m/texel).
  const POOL_RADIUS_M    = 16   // outer reach of one light pool (m)
  const POOL_RING_POS    = 0.32 // normalized radius of the bright ring (0..1)
  const POOL_RING_SHARP  = 4.5  // ring sharpness; LOWER = blurrier ring
  const POOL_SHADOW_FRAC = 0.18 // center radius the pole blocks its own light
  const POOL_MAX         = 3.0  // R encode headroom so overlaps build un-clipped
  const TREE_SHADOW_RADIUS_M = 4.5  // tree contact-shadow reach (m)
  const TREE_SHADOW_STR      = 0.7  // per-tree shadow contribution (0..1, summed)
  const LAMP_SHADOW_RADIUS_M = 2.5  // lamp-base contact-shadow reach (m)
  const LAMP_SHADOW_STR      = 0.6  // per-lamp shadow contribution
  const FX_SIZE = 1024
  try {
    // Contact-shadow sources are per-installation. The Look's own lamps.json /
    // the scene's own tree placements — NEVER LS's when this is a poured
    // installation, or HiPointe's ground bakes LS's tree + lamp shadows (the
    // vestigial-ghost bug). The LS-global fallbacks apply ONLY to the default
    // scene; a poured scene with no lamp/tree data bakes NO contact shadows.
    let lamps = []
    const lampsPath = join(lookDir, 'lamps.json')
    if (existsSync(lampsPath)) {
      lamps = JSON.parse(readFileSync(lampsPath, 'utf-8')).lamps || []
    } else if (isDefaultScene) {
      const sp = join(ROOT, 'src', 'data', 'street_lamps.json')
      if (existsSync(sp)) lamps = JSON.parse(readFileSync(sp, 'utf-8')).lamps || []
    }
    let trees = []
    // Every neighbourhood bakes its census to a LOOK-SCOPED trees.json (mirrors
    // lamps.json above) — LS included, since 2026-07-15; it used to be the one
    // exception, read from the global-looking baked/default.json. A scene with
    // no census → no trees, so no tree contact shadows. Honest either way.
    const treesLookPath = join(lookDir, 'trees.json')
    if (existsSync(treesLookPath)) {
      trees = (JSON.parse(readFileSync(treesLookPath, 'utf-8')).instances) || []
    }

    if (lamps.length || trees.length) {
      // bbox = union of lamp + tree extents + the largest reach as margin.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const p of [...lamps, ...trees]) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
      }
      const margin = Math.max(POOL_RADIUS_M, TREE_SHADOW_RADIUS_M)
      minX -= margin; maxX += margin; minZ -= margin; maxZ += margin
      const pW = maxX - minX, pH = maxZ - minZ
      const accR = new Float32Array(FX_SIZE * FX_SIZE)  // pool light
      const accG = new Float32Array(FX_SIZE * FX_SIZE)  // contact shadow
      const splat = (cx, cz, reach, fn) => {
        const cu = (cx - minX) / pW * FX_SIZE - 0.5
        const cv = (cz - minZ) / pH * FX_SIZE - 0.5
        const rU = reach / pW * FX_SIZE, rV = reach / pH * FX_SIZE
        const u0 = Math.max(0, Math.floor(cu - rU)), u1 = Math.min(FX_SIZE - 1, Math.ceil(cu + rU))
        const v0 = Math.max(0, Math.floor(cv - rV)), v1 = Math.min(FX_SIZE - 1, Math.ceil(cv + rV))
        for (let v = v0; v <= v1; v++) {
          for (let u = u0; u <= u1; u++) {
            const wx = minX + (u + 0.5) / FX_SIZE * pW
            const wz = minZ + (v + 0.5) / FX_SIZE * pH
            const rn = Math.sqrt((wx - cx) ** 2 + (wz - cz) ** 2) / reach
            if (rn < 1) fn(v * FX_SIZE + u, rn)
          }
        }
      }
      // R — lamp light pools (summed)
      for (const l of lamps) splat(l.x, l.z, POOL_RADIUS_M, (i, rn) => {
        const postShadow = Math.min(1, rn / POOL_SHADOW_FRAC)
        const ringD = (rn - POOL_RING_POS) * POOL_RING_SHARP
        const ring = Math.exp(-ringD * ringD)
        const penumbra = Math.exp(-rn * rn * 1.6)
        const rim = 1 - Math.max(0, Math.min(1, (rn - 0.7) / 0.3))
        accR[i] += (ring * 0.55 + penumbra * 0.45) * postShadow * rim
      })
      // G — contact shadows (trees + lamp bases), summed + clamped at encode.
      // ONLY for trees that actually render — `heroTier:"cull"` placements draw
      // nothing (InstancedTrees drops them), so splatting their shadow leaves an
      // orphan soft circle on bare grass. (2026-06-29 — "extra soft circles".)
      const shadowTrees = trees.filter(t => t.heroTier !== 'cull')
      for (const t of shadowTrees) splat(t.x, t.z, TREE_SHADOW_RADIUS_M, (i, rn) => {
        accG[i] += (1 - rn) * (1 - rn) * TREE_SHADOW_STR
      })
      for (const l of lamps) splat(l.x, l.z, LAMP_SHADOW_RADIUS_M, (i, rn) => {
        accG[i] += (1 - rn) * (1 - rn) * LAMP_SHADOW_STR
      })
      const fpx = new Uint8Array(FX_SIZE * FX_SIZE * 4)
      for (let i = 0; i < accR.length; i++) {
        fpx[i * 4]     = Math.round(Math.max(0, Math.min(1, accR[i] / POOL_MAX)) * 255)  // R pool
        fpx[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, accG[i])) * 255)             // G shadow
        fpx[i * 4 + 2] = 0
        fpx[i * 4 + 3] = 255
      }
      const fpng = new PNG({ width: FX_SIZE, height: FX_SIZE })
      fpng.data = Buffer.from(fpx.buffer, fpx.byteOffset, fpx.byteLength)
      writeIfChanged(join(lookDir, 'ground.poolmap.png'), PNG.sync.write(fpng))
      manifest.poolmap = { image: 'ground.poolmap.png', size: FX_SIZE, min: [minX, minZ], span: [pW, pH], scale: POOL_MAX }
      console.log(`[bake-ao] ground FX map: ${lamps.length} lamps (pool R) + ${shadowTrees.length}/${trees.length} rendered trees + lamps (shadow G) → ${FX_SIZE}² over ${pW.toFixed(0)}×${pH.toFixed(0)} m`)
    } else {
      manifest.poolmap = null
    }
  } catch (e) {
    console.warn('[bake-ao] ground FX map skipped:', e.message)
    manifest.poolmap = null
  }

  // ── Ground-color map — per-Look raster of the ground albedo ──────────
  // Rasterize each ground group's triangles, filled with the group's color,
  // in paint order (later groups overwrite earlier — topmost wins, matching
  // the render). The tree trunk shader samples this at each tree's world-XZ
  // so the trunk base blends toward the ACTUAL ground beneath it (grass /
  // sidewalk / asphalt — "whatever it is"). Full bbox so it works anywhere.
  try {
    const CMAP = 1024
    const cpx = new Uint8Array(CMAP * CMAP * 4)
    const hexToRgb = (hex) => {
      const h = String(hex || '#000000').replace('#', '')
      const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h
      return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0]
    }
    for (const g of manifest.groups) {
      const [cr, cg, cb] = hexToRgb(g.color)
      const pos = new Float32Array(groundBin, g.vertexByteOffset, g.vertexCount * 3)
      const idx = new Uint32Array(groundBin, g.indexByteOffset, g.indexCount)
      for (let t = 0; t < idx.length; t += 3) {
        const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3
        const au = (pos[i0]     - bbox.min[0]) / W * CMAP, av = (pos[i0 + 2] - bbox.min[2]) / H * CMAP
        const bu = (pos[i1]     - bbox.min[0]) / W * CMAP, bv = (pos[i1 + 2] - bbox.min[2]) / H * CMAP
        const cu = (pos[i2]     - bbox.min[0]) / W * CMAP, cv = (pos[i2 + 2] - bbox.min[2]) / H * CMAP
        const minU = Math.max(0, Math.floor(Math.min(au, bu, cu)))
        const maxU = Math.min(CMAP - 1, Math.ceil(Math.max(au, bu, cu)))
        const minV = Math.max(0, Math.floor(Math.min(av, bv, cv)))
        const maxV = Math.min(CMAP - 1, Math.ceil(Math.max(av, bv, cv)))
        const d = (bv - cv) * (au - cu) + (cu - bu) * (av - cv)
        if (Math.abs(d) < 1e-9) continue
        for (let v = minV; v <= maxV; v++) {
          for (let u = minU; u <= maxU; u++) {
            const px = u + 0.5, py = v + 0.5
            const wa = ((bv - cv) * (px - cu) + (cu - bu) * (py - cv)) / d
            const wb = ((cv - av) * (px - cu) + (au - cu) * (py - cv)) / d
            if (wa < 0 || wb < 0 || wa + wb > 1) continue
            const i = (v * CMAP + u) * 4
            cpx[i] = cr; cpx[i + 1] = cg; cpx[i + 2] = cb; cpx[i + 3] = 255
          }
        }
      }
    }
    const cpng = new PNG({ width: CMAP, height: CMAP })
    cpng.data = Buffer.from(cpx.buffer, cpx.byteOffset, cpx.byteLength)
    writeIfChanged(join(lookDir, 'ground.colormap.png'), PNG.sync.write(cpng))
    manifest.colormap = { image: 'ground.colormap.png', size: CMAP, min: [bbox.min[0], bbox.min[2]], span: [W, H] }
    console.log(`[bake-ao] ground-color map: ${manifest.groups.length} groups → ${CMAP}²`)
  } catch (e) {
    console.warn('[bake-ao] ground-color map skipped:', e.message)
    manifest.colormap = null
  }

  // Patch manifest with lightmap reference FIRST, then write the PNG.
  // ground.json is an input to needsRebuild('ground-ao'); ground.lightmap.png
  // is the output. If the manifest write happened last, ground.json would
  // end up with a strictly newer mtime than ground.lightmap.png, and
  // needsRebuild would rerun ground-ao on every bake. Manifest first =
  // output is the freshest file on disk.
  manifest.lightmap = {
    image: 'ground.lightmap.png',
    size,
    rays,
    floor: 0.35,
  }
  writeIfChanged(manifestPath, JSON.stringify(manifest, null, 2))

  // Write PNG (content-aware so a deterministic re-bake doesn't bump
  // mtime when bytes match — needsRebuild stays stable).
  const png = new PNG({ width: size, height: size })
  png.data = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  const outPath = join(lookDir, 'ground.lightmap.png')
  writeIfChanged(outPath, PNG.sync.write(png))

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[bake-ao] ${outPath} (${size}², ${rays} rays/texel, ${elapsed}s)`)
}

// CLI
async function main() {
  let look = 'default', size = LIGHTMAP_SIZE, rays = RAYS_PER_TEXEL, scene = 'lafayette-square'
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/))) look = m[1]
    else if ((m = arg.match(/^--scene=(.+)$/))) scene = m[1]
    else if ((m = arg.match(/^--size=(\d+)$/))) size = parseInt(m[1], 10)
    else if ((m = arg.match(/^--rays=(\d+)$/))) rays = parseInt(m[1], 10)
  }
  await bakeGroundAO({ look, size, rays, scene })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
