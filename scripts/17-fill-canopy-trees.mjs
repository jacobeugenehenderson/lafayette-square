/**
 * 17-fill-canopy-trees.mjs — scatter the tree MIX into the canopy raster.
 *
 * The point census (13 City + 14 OSM) only ever has trees where someone
 * inventoried or mapped them — it MISSES the parks, campuses, and private yards
 * that make a neighborhood read verdant (the "tree-covered park across from
 * Barrio" with zero points). This fills that gap generically, from data:
 * NLCD Tree Canopy Cover (16-fetch-canopy.py) is % canopy per 30 m pixel, so we
 * scatter trees at density PROPORTIONAL to real canopy — dense in parks, sparse
 * on streets, none on rooftops/parking (0 % canopy). Each filled tree is dressed
 * from the same empirical MIX (15) the census uses, so it blends in.
 *
 * Complements, never doubles: candidates within MIN_DIST of an existing census
 * point are skipped, so this only fills the gaps the census left.
 *
 * Deterministic (seeded by position) → stable across re-bakes. Reads the GeoTIFF
 * with the kit's `geotiff` lib (same as bake-terrain.js — Python here has no
 * rasterio). Generalizable per-town: nothing scene-specific but the inputs.
 *
 * Usage: CARTOGRAPH_SCENE=hipointe-demun node scripts/17-fill-canopy-trees.mjs
 * Output: cartograph/data/<scene>/clean/derived_trees.json  (census schema)
 */
import { fromFile } from 'geotiff'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeZoneTester } from '../cartograph/forbidden-surface.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SCENE = process.env.CARTOGRAPH_SCENE
if (!SCENE || SCENE === 'lafayette-square') {
  console.error('Set CARTOGRAPH_SCENE to a poured scene.'); process.exit(1)
}
const dir = path.join(REPO, 'cartograph', 'data', SCENE)

// ── Tunables (the density dials) ────────────────────────────────────────────
const GRID_SPACING = 10      // metres between candidate points (↓ = denser fill)
const MIN_DIST = 7           // min spacing between trees (census + fill); believable urban spacing
const CANOPY_GAMMA = 1.0     // place-probability curve on canopy fraction (1 = linear)
const RELOCATE_RINGS = 6     // spiral search radius = RELOCATE_RINGS × 3 m
const RELOCATE_STEP = 3      // metres between spiral rings

function hash01(ix, iz, salt) {
  let h = (ix | 0) ^ Math.imul(iz | 0, 73856093) ^ Math.imul(salt, 19349663)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function shapeFor(common) {
  const c = common.toLowerCase()
  if (/pine|spruce|fir|cedar|cypress|juniper|conifer|evergreen/.test(c)) return 'conifer'
  if (/ginkgo|fastigiat|sentry|columnar/.test(c)) return 'columnar'
  if (/willow/.test(c)) return 'weeping'
  if (/pear|redbud|crab|cherry|plum|dogwood|serviceberry|lilac|magnolia|hawthorn/.test(c)) return 'ornamental'
  return 'broad'
}

const main = async () => {
  // ── Inputs ────────────────────────────────────────────────────────────────
  const geo = JSON.parse(readFileSync(path.join(dir, 'geography.json'), 'utf8'))
  const bnd = JSON.parse(readFileSync(path.join(dir, 'neighborhood_boundary.json'), 'utf8'))
  const mix = JSON.parse(readFileSync(path.join(dir, 'tree-mix.json'), 'utf8'))
  const R = bnd.radius
  const { lon: CLON, lat: CLAT, lonToMeters: LON_M, latToMeters: LAT_M } = geo

  // Weighted COMMON distribution (identical to the OSM drape's source).
  const cw = Object.entries(mix.commonWeights)
  const cwTotal = cw.reduce((s, [, n]) => s + n, 0)
  const pickCommon = (u) => {
    let t = u * cwTotal
    for (const [name, n] of cw) { t -= n; if (t < 0) return name }
    return cw[cw.length - 1][0]
  }

  // Existing census points → spatial hash for O(1) proximity rejection.
  const existing = []
  for (const f of ['park_trees.json', 'osm_trees.json']) {
    try { existing.push(...JSON.parse(readFileSync(path.join(dir, 'clean', f), 'utf8')).trees) }
    catch { /* layer absent */ }
  }
  const cell = MIN_DIST
  const gridKey = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`
  const occ = new Map()
  for (const t of existing) {
    const k = gridKey(t.x, t.z)
    if (!occ.has(k)) occ.set(k, [])
    occ.get(k).push(t)
  }
  const tooClose = (x, z) => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = occ.get(`${gx + dx},${gz + dz}`)
      if (!arr) continue
      for (const p of arr) if ((p.x - x) ** 2 + (p.z - z) ** 2 < MIN_DIST * MIN_DIST) return true
    }
    return false
  }
  // Register a placed tree so later candidates space off it too (keeps the
  // relocated fill from piling onto the same treelawn spot).
  const register = (x, z) => {
    const k = gridKey(x, z)
    if (!occ.has(k)) occ.set(k, [])
    occ.get(k).push({ x, z })
  }

  // Where may a tree stand? The FROZEN Section surfaces (shared with bake-trees):
  // treelawn + land-use only — never the carriageway, sidewalk or a building.
  // ⚠️ Requires the scene's ground bake (shape.json) to have run first.
  const shapePath = path.join(REPO, 'public', 'baked', SCENE, 'shape.json')
  if (!existsSync(shapePath)) {
    console.error(`No ${shapePath} — bake the ground for '${SCENE}' before filling canopy.\n` +
      `Without the frozen surfaces there is no honest answer to "is this the street?".`)
    process.exit(1)
  }
  const isForbidden = makeZoneTester({
    shapePath,
    mapPath: path.join(dir, 'clean', 'map.json'),
  })
  // Spiral out from a forbidden spot to the nearest allowed ground.
  const relocate = (x, z) => {
    const jit = hash01(Math.round(x * 10), Math.round(z * 10), 9) * Math.PI * 2
    for (let ring = 1; ring <= RELOCATE_RINGS; ring++) {
      const r = ring * RELOCATE_STEP
      for (let a = 0; a < 8; a++) {
        const ang = jit + (a / 8) * Math.PI * 2
        const nx = +(x + Math.cos(ang) * r).toFixed(1)
        const nz = +(z + Math.sin(ang) * r).toFixed(1)
        if (nx * nx + nz * nz > R * R) continue
        if (!isForbidden(nx, nz) && !tooClose(nx, nz)) return [nx, nz]
      }
    }
    return null
  }

  // ── Canopy raster (% per pixel), EPSG:4326 lon/lat ──────────────────────────
  const tif = await fromFile(path.join(dir, 'raw', 'canopy.tif'))
  const img = await tif.getImage()
  const W = img.getWidth(), H = img.getHeight()
  const [minLon, minLat, maxLon, maxLat] = img.getBoundingBox()
  const cvals = (await img.readRasters())[0]
  const canopyAt = (x, z) => {
    // local (x,z) → lon/lat → nearest pixel
    const lon = CLON + x / LON_M
    const lat = CLAT - z / LAT_M
    const px = Math.floor(((lon - minLon) / (maxLon - minLon)) * W)
    const py = Math.floor(((maxLat - lat) / (maxLat - minLat)) * H)
    if (px < 0 || px >= W || py < 0 || py >= H) return 0
    const v = cvals[py * W + px]
    return v > 100 ? 0 : v            // >100 = NLCD nodata/fill
  }

  // ── Jittered grid scatter over the disc ─────────────────────────────────────
  const trees = []
  let relocated = 0, dropped = 0
  const n = Math.ceil((2 * R) / GRID_SPACING)
  for (let gi = 0; gi <= n; gi++) {
    for (let gj = 0; gj <= n; gj++) {
      const cx = -R + gi * GRID_SPACING
      const cz = -R + gj * GRID_SPACING
      const x = +(cx + (hash01(gi, gj, 7) - 0.5) * GRID_SPACING).toFixed(1)
      const z = +(cz + (hash01(gi, gj, 8) - 0.5) * GRID_SPACING).toFixed(1)
      if (x * x + z * z > R * R) continue                 // in disc
      const frac = canopyAt(x, z) / 100
      if (frac <= 0) continue
      const ix = Math.round(x * 10), iz = Math.round(z * 10)
      if (hash01(ix, iz, 1) >= Math.pow(frac, CANOPY_GAMMA)) continue  // density ∝ canopy
      if (tooClose(x, z)) continue                        // complement the census
      // Never a trunk on hardscape: relocate onto the nearest allowed ground
      // (treelawn/yard) instead of dropping the tree.
      let fx = x, fz = z
      if (isForbidden(fx, fz)) {
        const moved = relocate(fx, fz)
        if (!moved) { dropped++; continue }
        fx = moved[0]; fz = moved[1]; relocated++
      }
      const common = pickCommon(hash01(ix, iz, 2))
      trees.push({
        x: fx, z: fz,
        species: common,
        shape: shapeFor(common),
        dbh: 6 + Math.floor(hash01(ix, iz, 3) * 12),
        condition: '',
      })
      register(fx, fz)
    }
  }

  const out = {
    meta: {
      // INVENTED, not surveyed. bake-trees reads this: a derived tree that lands
      // on hardscape is dropped, where a surveyed one would be nudged.
      kind: 'derived',
      source: 'NLCD Tree Canopy Cover (USDA FS) — mix scattered ∝ % canopy',
      scene: SCENE,
      canopyRaster: `${W}x${H} px`,
      gridSpacingM: GRID_SPACING,
      total: trees.length,
      coordinate_system: 'Local meters, compass-aligned (unrotated equirectangular about scene center).',
    },
    trees,
  }
  writeFileSync(path.join(dir, 'clean', 'derived_trees.json'), JSON.stringify(out))
  console.log(`Canopy fill: ${trees.length} trees (grid ${GRID_SPACING}m, ${existing.length} census avoided; ${relocated} relocated off hardscape, ${dropped} unplaceable)`)
  const top = {}
  for (const t of trees) top[t.species] = (top[t.species] || 0) + 1
  console.log('  top: ' + Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([s, n]) => `${s} (${n})`).join(', '))
}

main().catch(e => { console.error('[canopy-fill]', e); process.exit(1) })
