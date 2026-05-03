/**
 * bake-trees.js — resolve the live picker into a static placement file.
 *
 * Reads:
 *   public/trees/index.json      — rated runtime pool
 *   src/data/park_trees.json     — 644 placement positions
 *   src/data/park_species_map.json — species-id → preferred library subset
 *   --look <name>                — Look name (defaults 'default')
 *   --styles realistic[,winter…] — active style set (defaults 'realistic')
 *   --lod lod0|lod1|lod2         — LOD to ship (defaults 'lod2')
 *
 * Writes:
 *   public/baked/<look>.json
 *
 * Schema:
 *   { generatedAt, look, lod, activeStyles, count,
 *     tiles: { cols, rows, minX, minZ, tileW, tileD,
 *              instancesByTile: [{ tileX, tileZ, instances: [...] }, ...] } | null,
 *     instances: [{ x, z, url, scale, rotY, species, variantId }] }
 *
 * Stage / Mobile read this file and instance directly. No live picker,
 * no index.json, no overrides — just placements.
 */
import { promises as fs } from 'node:fs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// Inline elevation utility — same bilinear sampler as elevation.js. Trees
// must use the SAME field as ground + foundations (per
// project_terrain_elevation_field.md) or they'll float/sink. PARK trees
// are stored in park_trees.json as park-local coords; at runtime they're
// rotated by PARK_GRID_ROTATION into world coords. Elevation is
// world-space, so we apply the rotation here at bake time.
const PARK_GRID_ROTATION = -9.2 * (Math.PI / 180)
const _terrain = JSON.parse(readFileSync(
  path.join(REPO_ROOT, 'src', 'data', 'terrain.json'), 'utf-8'))
const _spanX = _terrain.bounds.maxX - _terrain.bounds.minX
const _spanZ = _terrain.bounds.maxZ - _terrain.bounds.minZ
const V_EXAG = 5
function getElevation(x, z) {
  const gx = ((x - _terrain.bounds.minX) / _spanX) * (_terrain.width - 1)
  const gz = ((z - _terrain.bounds.minZ) / _spanZ) * (_terrain.height - 1)
  const gx0 = Math.max(0, Math.min(_terrain.width - 2, Math.floor(gx)))
  const gz0 = Math.max(0, Math.min(_terrain.height - 2, Math.floor(gz)))
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
function elevationParkLocal(px, pz) {
  // Apply PARK_GRID_ROTATION around Y to convert park-local → world.
  const c = Math.cos(PARK_GRID_ROTATION), s = Math.sin(PARK_GRID_ROTATION)
  const wx = px * c + pz * s
  const wz = -px * s + pz * c
  return getElevation(wx, wz)
}

// Per-tree lamp-glow: sample the same gaussian splat the runtime
// `getLampLightmap()` builds in src/components/lampLightmap.js, but
// at each tree's world position. Bake-time pre-sample → one float per
// instance → leaf shader does one cheap multiply at render time, no
// per-fragment texture lookup. Same SIGMA/EXTENT/CUTOFF as runtime so
// per-tree intensity matches the grass shader's per-fragment intensity
// at the same point.
const LAMP_SIGMA = 12
const LAMP_SIGMA2 = 2 * LAMP_SIGMA * LAMP_SIGMA
const LAMP_CUTOFF2 = (4 * LAMP_SIGMA) * (4 * LAMP_SIGMA)
const LAMP_MAX = 1.5
const _lamps = JSON.parse(readFileSync(
  path.join(REPO_ROOT, 'src', 'data', 'street_lamps.json'), 'utf-8')).lamps
function lampGlowAt(wx, wz) {
  let acc = 0
  for (let l = 0; l < _lamps.length; l++) {
    const dx = wx - _lamps[l].x
    const dz = wz - _lamps[l].z
    const d2 = dx * dx + dz * dz
    if (d2 > LAMP_CUTOFF2) continue
    acc += Math.exp(-d2 / LAMP_SIGMA2)
  }
  return Math.min(acc, LAMP_MAX)
}
function lampGlowParkLocal(px, pz) {
  const c = Math.cos(PARK_GRID_ROTATION), s = Math.sin(PARK_GRID_ROTATION)
  const wx = px * c + pz * s
  const wz = -px * s + pz * c
  return lampGlowAt(wx, wz)
}

// ── Forbidden-surface filter ─────────────────────────────────────────────
// Trees can't occupy buildings, streets, alleys, sidewalks, footways, paths,
// or water. Tested in WORLD coords against polygons sourced from the
// cartograph clean map + park water capture. Returns a function (wx, wz) →
// reason string ('building'|'pavement'|'alley'|'sidewalk'|'footway'|'path'|
// 'water') or null when the location is allowed.
function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}
function pointInPolygon(px, pz, poly) {
  // poly: { ring, holes? } — outer ring with optional holes (e.g. water with island)
  const ring = poly.ring || poly
  if (!pointInRing(px, pz, ring)) return false
  if (poly.holes) for (const h of poly.holes) if (pointInRing(px, pz, h)) return false
  return true
}
function makeForbiddenTester() {
  const map = JSON.parse(readFileSync(path.join(REPO_ROOT, 'cartograph', 'data', 'clean', 'map.json'), 'utf-8'))
  const water = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src', 'data', 'park_water.json'), 'utf-8'))

  // Park water capture frame → world. Per LafayettePark.jsx:
  // capture frame is rotated +9.2° around ISLAND_PIVOT (33.96, 86) in park-
  // local coords; park-local is then rotated -9.2° around origin to world.
  // Compose both into one transform applied to each water vertex once.
  const PIV = [33.96, 86.00]
  const aRev = -PARK_GRID_ROTATION   // undo +9.2° around pivot
  const aPark = PARK_GRID_ROTATION    // park-local → world
  const cR = Math.cos(aRev), sR = Math.sin(aRev)
  const cP = Math.cos(aPark), sP = Math.sin(aPark)
  function waterToWorld([x, z]) {
    // 1) rotate by aRev around PIV → park-local
    const dx = x - PIV[0], dz = z - PIV[1]
    const lx = PIV[0] + dx * cR - dz * sR
    const lz = PIV[1] + dx * sR + dz * cR
    // 2) rotate by aPark around origin → world
    return [lx * cP + lz * sP, -lx * sP + lz * cP]
  }
  const lakeOuterW  = (water.lake?.outer  || []).map(waterToWorld)
  const lakeIslandW = (water.lake?.island || []).map(waterToWorld)
  const grottoW     = (water.grotto       || []).map(waterToWorld)
  const waterPolys = []
  if (lakeOuterW.length) waterPolys.push({ ring: lakeOuterW, holes: lakeIslandW.length ? [lakeIslandW] : null })
  if (grottoW.length)    waterPolys.push({ ring: grottoW })

  // map.json layers (already world-coord). Each entry is { ring, holes? }.
  const buildings = (map.buildings || []).map(b => ({ ring: b.footprint || b.ring }))
  const layer = (k) => (map.layers?.[k] || []).map(p => ({ ring: p.ring, holes: p.holes || null }))
  const pavement = layer('pavement')
  const alley    = layer('alley')
  const sidewalk = [...layer('sidewalk'), ...layer('parkSidewalk')]
  const footway  = layer('footway')
  const pathway  = layer('path')

  const checks = [
    ['water',    waterPolys],
    ['building', buildings],
    ['pavement', pavement],
    ['alley',    alley],
    ['sidewalk', sidewalk],
    ['footway',  footway],
    ['path',     pathway],
  ]
  return function classify(wx, wz) {
    for (const [reason, polys] of checks) {
      for (const p of polys) if (pointInPolygon(wx, wz, p)) return reason
    }
    return null
  }
}

const SHAPE_TO_CATEGORY = {
  broad: 'broadleaf',
  conifer: 'conifer',
  ornamental: 'ornamental',
  weeping: 'weeping',
  columnar: 'columnar',
}
const CATEGORY_FALLBACK = {
  ornamental: ['broadleaf'],
  weeping: ['broadleaf'],
  columnar: ['broadleaf', 'conifer'],
  conifer: ['broadleaf'],
  broadleaf: ['conifer'],
}

function parseArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) { args[key] = next; i++ }
      else args[key] = true
    }
  }
  return args
}

function hash01(seed, salt = 0) {
  let h = (seed | 0) ^ (salt * 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return ((h >>> 0) % 1_000_000) / 1_000_000
}

function treeSeed(tree, idx) {
  return Math.imul(((tree.x * 1000) | 0) ^ idx * 73856093,
                   ((tree.z * 1000) | 0) ^ 19349663)
}

function pickVariant(parkSpecies, category, pool, activeStyles, speciesMap, seed) {
  const preferred = speciesMap.map?.[parkSpecies]
  if (preferred?.length) {
    const speciesSet = new Set(preferred)
    const candidates = pool.filter(v =>
      speciesSet.has(v.species) &&
      v.styles?.some(s => activeStyles.has(s)),
    )
    if (candidates.length) {
      const idx = Math.floor(hash01(seed, 1) * candidates.length)
      return candidates[idx]
    }
  }
  for (const cat of [category, ...(CATEGORY_FALLBACK[category] || [])]) {
    const candidates = pool.filter(v =>
      v.category === cat &&
      v.styles?.some(s => activeStyles.has(s)),
    )
    if (candidates.length) {
      const idx = Math.floor(hash01(seed, 1) * candidates.length)
      return candidates[idx]
    }
  }
  return null
}

export async function bakeTrees({
  look = 'default',
  styles = ['realistic'],
  lod = 'lod2',
  placements,    // override path, e.g. 'src/data/toy/toy-trees.json'
  output,        // override output path; defaults to public/baked/<look>.json
  verbose = false,
} = {}) {
  const lookName = look
  const activeStyles = new Set(styles)
  const targetLod = lod

  const indexPath = path.join(REPO_ROOT, 'public', 'trees', 'index.json')
  const parkPath = placements
    ? path.resolve(REPO_ROOT, placements)
    : path.join(REPO_ROOT, 'src', 'data', 'park_trees.json')
  const mapPath = path.join(REPO_ROOT, 'src', 'data', 'park_species_map.json')

  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  const park = JSON.parse(await fs.readFile(parkPath, 'utf8'))
  const speciesMap = JSON.parse(await fs.readFile(mapPath, 'utf8'))

  if (verbose) {
    console.log(`[bake-trees] look=${lookName} styles=[${[...activeStyles].join(',')}] lod=${targetLod}`)
    console.log(`[bake-trees] pool: ${index.variants.length} variants, ${park.trees.length} placements`)
  }

  // Forbidden-surface tester. Skip for non-default placements (toy fixture
  // doesn't have street/sidewalk polygons in the same world frame).
  const isForbidden = placements ? null : makeForbiddenTester()

  const instances = []
  let unmatched = 0
  const forbiddenCounts = {}

  for (let i = 0; i < park.trees.length; i++) {
    const tree = park.trees[i]
    const cat = SHAPE_TO_CATEGORY[tree.shape] || 'broadleaf'
    const seed = treeSeed(tree, i)
    const v = pickVariant(tree.species, cat, index.variants, activeStyles, speciesMap, seed)
    if (!v) { unmatched++; continue }
    const lodUrl = v.skeletons[targetLod] || v.skeletons.lod1 || v.skeletons.lod0
    if (!lodUrl) { unmatched++; continue }
    // Surface filter: convert tree park-local → world, drop if it lands in
    // a forbidden polygon (water/building/street/etc.). Applied BEFORE
    // applying positionOverride since the override is variant-local nudge.
    if (isForbidden) {
      const cR = Math.cos(PARK_GRID_ROTATION), sR = Math.sin(PARK_GRID_ROTATION)
      const wx = tree.x * cR + tree.z * sR
      const wz = -tree.x * sR + tree.z * cR
      const reason = isForbidden(wx, wz)
      if (reason) {
        forbiddenCounts[reason] = (forbiddenCounts[reason] || 0) + 1
        continue
      }
    }
    // Rotation: operator's rotationOverride.y picks the variant's "best
    // face"; preserve it. Without an override, randomize for variety.
    const rotY = (v.rotationOverride?.y !== undefined)
      ? v.rotationOverride.y
      : hash01(seed, 3) * Math.PI * 2
    // Position: operator's positionOverride lets them nudge a variant
    // off-center (e.g. trunk centered at origin). Park placement supplies
    // the world-space target; override is the variant-local offset.
    const px = v.positionOverride?.x ?? 0
    const pz = v.positionOverride?.z ?? 0
    const py = v.positionOverride?.y ?? 0
    const finalX = tree.x + px
    const finalZ = tree.z + pz
    instances.push({
      x: +finalX.toFixed(4),
      // Ground reverted to flat (#19); trees plant at y=0 + override.
      y: +py.toFixed(4),
      z: +finalZ.toFixed(4),
      url: lodUrl,
      // Scale is baked into the GLB at Arborist publish (bake-look). Runtime
      // always renders at 1:1.
      rotY: +rotY.toFixed(4),
      species: v.species,
      variantId: v.variantId,
      category: v.category,
      // Pre-sampled lamp gaussian at this tree's world position. Runtime
      // multiplies by `uLampGlow` (per-Look TOD-curve slider) for the
      // final emissive contribution.
      lampGlow: +lampGlowParkLocal(finalX, finalZ).toFixed(4),
    })
  }

  // Stats
  const variantUseCount = new Map()
  for (const i of instances) {
    const k = `${i.species}/${i.variantId}`
    variantUseCount.set(k, (variantUseCount.get(k) || 0) + 1)
  }

  // Spatial tiling. Bucket instances into a 4×4 grid (in park-local coords,
  // matching the runtime <group> the InstancedMeshes mount under). Runtime
  // emits one InstancedMesh per (url × tile), so off-screen tiles cull on
  // their natural bounding sphere. Flat `instances` is preserved for
  // back-compat with older runtimes.
  const TILE_COLS = 4
  const TILE_ROWS = 4
  let tiles = null
  if (instances.length > 0) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const inst of instances) {
      if (inst.x < minX) minX = inst.x
      if (inst.x > maxX) maxX = inst.x
      if (inst.z < minZ) minZ = inst.z
      if (inst.z > maxZ) maxZ = inst.z
    }
    // Pad by 1 unit so floor() bucketing never lands on COLS/ROWS exactly.
    const tileW = Math.max(1, (maxX - minX + 2)) / TILE_COLS
    const tileD = Math.max(1, (maxZ - minZ + 2)) / TILE_ROWS
    const originX = minX - 1
    const originZ = minZ - 1
    const buckets = new Map()  // tileId -> instances[]
    for (const inst of instances) {
      const tx = Math.min(TILE_COLS - 1, Math.max(0, Math.floor((inst.x - originX) / tileW)))
      const tz = Math.min(TILE_ROWS - 1, Math.max(0, Math.floor((inst.z - originZ) / tileD)))
      const tileId = tz * TILE_COLS + tx
      if (!buckets.has(tileId)) buckets.set(tileId, { tileX: tx, tileZ: tz, instances: [] })
      buckets.get(tileId).instances.push(inst)
    }
    tiles = {
      cols: TILE_COLS,
      rows: TILE_ROWS,
      minX: +originX.toFixed(4),
      minZ: +originZ.toFixed(4),
      tileW: +tileW.toFixed(4),
      tileD: +tileD.toFixed(4),
      instancesByTile: [...buckets.values()].sort((a, b) =>
        (a.tileZ - b.tileZ) || (a.tileX - b.tileX)),
    }
  }

  const out = {
    generatedAt: Date.now(),
    look: lookName,
    lod: targetLod,
    activeStyles: [...activeStyles],
    count: instances.length,
    unmatched,
    uniqueVariants: variantUseCount.size,
    tiles,
    instances,
  }

  const outDir = path.join(REPO_ROOT, 'public', 'baked')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `${lookName}.json`)
  await fs.writeFile(outPath, JSON.stringify(out, null, 2))

  const totalForbidden = Object.values(forbiddenCounts).reduce((a, b) => a + b, 0)
  if (verbose) {
    console.log(`[bake-trees] placed ${instances.length}/${park.trees.length} (${unmatched} unmatched, ${totalForbidden} forbidden-surface drops)`)
    if (totalForbidden) {
      const breakdown = Object.entries(forbiddenCounts).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`).join(' ')
      console.log(`[bake-trees]   forbidden: ${breakdown}`)
    }
    console.log(`[bake-trees] ${variantUseCount.size} unique variants in use`)
    console.log(`[bake-trees] → ${outPath}`)
  }
  return { count: instances.length, unmatched, forbidden: totalForbidden, forbiddenCounts, uniqueVariants: variantUseCount.size, outPath }
}

// CLI entry: only run when invoked directly (not when imported).
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  const args = parseArgs()
  bakeTrees({
    look: args.look,
    styles: (args.styles || 'realistic').split(',').map(s => s.trim()).filter(Boolean),
    lod: args.lod,
    placements: args.placements,
    output: args.output,
    verbose: true,
  }).catch(e => { console.error('[bake-trees] fatal:', e); process.exit(1) })
}
