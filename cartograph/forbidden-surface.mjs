/**
 * forbidden-surface.mjs — "a tree can never stand here" mask.
 *
 * Shared by arborist/bake-trees.js (drops any placement on hardscape) and
 * scripts/17-fill-canopy-trees.mjs (RELOCATES canopy candidates off hardscape
 * onto the nearest allowed ground). One source of truth so the two never drift.
 *
 * TWO constructions live here — one concept, one home:
 *
 *   makeZoneTester({ shapePath })  ← poured scenes. The FROZEN Section surfaces.
 *   makeForbiddenTester({ mapPath }) ← LEGACY. Lafayette Square only.
 *
 * ⭐ Use `makeZoneTester` for anything poured. `makeForbiddenTester` reads
 * map.json's `layers.*`, and those are PAINT-STACK layers — filled shapes the
 * renderer stacks to draw the ground, not semantic surfaces. "Inside
 * layers.sidewalk" means "sidewalk colour starts here", then land-use paints
 * over it; the polygon is a whole block face, not a footpath. Asking a drawing
 * a physical question is a CATEGORY error, and it produced a mask that forbade
 * 60% of Hi-Pointe/DeMun (the yards) while permitting the road — the street is
 * the GROUT between tiles (`RIBBONS.md §28`), so no layer covers it and the
 * legacy tester could never see it. It survives only because LS's park-only
 * census never stood on a block face. Migrate LS and delete it.
 * (Forensic 2026-07-15: 862 of 1,430 real census trees dropped; 755 baked trees
 * left standing in the live carriageway.)
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
  const ring = poly.ring || poly
  if (!pointInRing(px, pz, ring)) return false
  if (poly.holes) for (const h of poly.holes) if (pointInRing(px, pz, h)) return false
  return true
}

// Attach an axis-aligned bbox so the classifier can reject most polygons with a
// cheap min/max compare before the O(ring) test (thousands of polys × thousands
// of trees — a spatial prefilter is mandatory).
export function polyWithBbox(ring, holes) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const [x, z] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  return { ring, holes: holes || null, minX, minZ, maxX, maxZ }
}

export function makeForbiddenTester(opts = {}) {
  const scened = !!opts.mapPath
  const mapPath = opts.mapPath || path.join(REPO_ROOT, 'cartograph', 'data', 'lafayette-square', 'clean', 'map.json')
  const map = JSON.parse(readFileSync(mapPath, 'utf-8'))
  // park_water.json uses [x,z] arrays; map.json uses {x,z} objects. Normalize.
  const toArr = (ring) => ring.map(p => Array.isArray(p) ? p : [p.x, p.z])

  const waterPolys = []
  if (!scened) {
    const water = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src', 'data', 'lafayette-square', 'park_water.json'), 'utf-8'))
    const lakeOuter = water.lake?.outer || [], lakeIsland = water.lake?.island || [], grotto = water.grotto || []
    if (lakeOuter.length) waterPolys.push(polyWithBbox(toArr(lakeOuter), lakeIsland.length ? [toArr(lakeIsland)] : null))
    if (grotto.length) waterPolys.push(polyWithBbox(toArr(grotto)))
  } else {
    for (const p of (map.layers?.water || [])) if ((p.ring || []).length >= 3)
      waterPolys.push(polyWithBbox(toArr(p.ring), p.holes ? p.holes.map(toArr) : null))
  }

  const buildings = (map.buildings || [])
    .map(b => toArr(b.footprint || b.ring || []))
    .filter(r => r.length >= 3).map(r => polyWithBbox(r))
  const layer = (k) => (map.layers?.[k] || [])
    .filter(p => (p.ring || []).length >= 3)
    .map(p => polyWithBbox(toArr(p.ring), p.holes ? p.holes.map(toArr) : null))

  // `parkSidewalk` (a single polygon covering the park interior) is excluded —
  // it would forbid every park tree; interior walks are caught via path/footway.
  const checks = [
    ['water',    waterPolys],
    ['building', buildings],
    ['pavement', layer('pavement')],
    ['alley',    layer('alley')],
    ['sidewalk', layer('sidewalk')],
    ['footway',  layer('footway')],
    ['path',     layer('path')],
  ]
  if (scened) checks.push(
    ['asphalt', layer('block')],        // the carriageway / road surface
    ['parking', layer('parking_lot')],
    ['steps',   layer('steps')],
  )
  return function classify(wx, wz) {
    for (const [reason, polys] of checks) {
      for (const p of polys) {
        if (wx < p.minX || wx > p.maxX || wz < p.minZ || wz > p.maxZ) continue
        if (pointInPolygon(wx, wz, p)) return reason
      }
    }
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The FROZEN-SHAPE zone model (poured scenes)
// ─────────────────────────────────────────────────────────────────────────────

/** Shortest distance from (px,pz) to a ring's edges. */
function distToRing(px, pz, ring) {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x1 = ring[j][0], z1 = ring[j][1], x2 = ring[i][0], z2 = ring[i][1]
    const dx = x2 - x1, dz = z2 - z1
    const L = dx * dx + dz * dz
    let t = L ? ((px - x1) * dx + (pz - z1) * dz) / L : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const ex = x1 + t * dx - px, ez = z1 + t * dz - pz
    const d = ex * ex + ez * ez
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/**
 * "Where may a tree stand?", answered from the FROZEN Section surfaces — the
 * same construction that draws the ground, so the mask cannot drift from what
 * the operator sees (`RIBBONS.md §150` — WYSIWYG by construction).
 *
 * The ground is painted INWARD off the frozen curb `iA` (`RIBBONS.md §170`):
 * treelawn (outer strip) → sidewalk (inner strip) → land-use (the remainder).
 * So, by distance `d` inside a tile's curb ring:
 *
 *   outside every iA  → asphalt (the carriageway) or un-poured  → NO
 *   d < tl            → TREELAWN — where street trees belong    → yes
 *   d < tl + sw       → sidewalk                                → NO
 *   d >= tl + sw      → LU (yard/park)                          → yes
 *
 * Within LU the frozen shape says nothing about real obstructions, so the
 * scene's own map.json still supplies those (building/water/parking/paths).
 * Those layers are small, literal footprints — unlike `block`/`sidewalk`, which
 * are the block-face paint stack this construction replaces.
 *
 * Rule ratified by Jacob 2026-07-15: "Trees only in LU and Treelawn, no
 * sidewalk, asphalt or buildings."
 *
 * @param {string}  shapePath  public/baked/<scene>/shape.json (the WALL artifact)
 * @param {string}  mapPath    the scene's clean/map.json (obstructions only)
 * @param {boolean} allowUnpoured  treat ground outside every tile but off the
 *   carriageway as plantable. Default FALSE: outside the poured extent we have
 *   no honest surface model, and guessing there is what made the canopy read
 *   arbitrary. Flip only with an operator's eye on the result.
 * @returns {function} classify(x,z) → forbidden reason, or null when plantable.
 *   Carries `.zoneOf(x,z)` (reporting) and `.nudge(x,z)` (nearest legal ground).
 */
export function makeZoneTester({ shapePath, mapPath, allowUnpoured = false } = {}) {
  const shape = JSON.parse(readFileSync(shapePath, 'utf-8'))
  const toArr = (ring) => ring.map(p => Array.isArray(p) ? p : [p.x, p.z])

  // Each tile's frozen curb ring + its mono-width ped strips.
  const tiles = []
  for (const t of (shape.tiles || [])) {
    const ring = t.iA?.[0]
    if (!Array.isArray(ring) || ring.length < 3) continue   // tile with no frozen curb
    const p = polyWithBbox(toArr(ring))
    p.tl = t.tl ?? 0
    p.sw = t.sw ?? 0
    p.lu = t.lu
    tiles.push(p)
  }
  if (!tiles.length) throw new Error(`[zone-tester] no usable curb rings in ${shapePath}`)

  // Real obstructions WITHIN land-use. Literal footprints only — never the
  // block-face paint layers (`block`/`sidewalk`), which this model supersedes.
  const map = mapPath ? JSON.parse(readFileSync(mapPath, 'utf-8')) : { layers: {} }
  const layer = (k) => (map.layers?.[k] || [])
    .filter(p => (p.ring || []).length >= 3)
    .map(p => polyWithBbox(toArr(p.ring), p.holes ? p.holes.map(toArr) : null))
  const buildings = (map.buildings || [])
    .map(b => toArr(b.footprint || b.ring || []))
    .filter(r => r.length >= 3).map(r => polyWithBbox(r))
  const obstructions = [
    ['building',    buildings],
    ['water',       layer('water')],
    ['parking_lot', layer('parking_lot')],
    ['pavement',    layer('pavement')],
    ['alley',       layer('alley')],
    ['footway',     layer('footway')],
    ['path',        layer('path')],
    ['steps',       layer('steps')],
  ]

  const tileAt = (x, z) => {
    for (const t of tiles) {
      if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue
      if (pointInPolygon(x, z, t)) return t
    }
    return null
  }

  function zoneOf(x, z) {
    const t = tileAt(x, z)
    if (!t) return 'asphalt-or-unpoured'
    for (const [reason, polys] of obstructions) {
      for (const p of polys) {
        if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue
        if (pointInPolygon(x, z, p)) return reason
      }
    }
    const d = distToRing(x, z, t.ring)
    if (d < t.tl) return 'treelawn'
    if (d < t.tl + t.sw) return 'sidewalk'
    return 'lu'
  }

  const ALLOWED = new Set(['treelawn', 'lu'])
  const classify = (x, z) => {
    const zone = zoneOf(x, z)
    if (ALLOWED.has(zone)) return null
    if (zone === 'asphalt-or-unpoured' && allowUnpoured) return null
    return zone
  }
  classify.zoneOf = zoneOf

  /**
   * Nearest legal ground, spiralling out — for REAL surveyed trees only.
   *
   * A recorded tree that lands a metre inside our *guessed* sidewalk is far more
   * likely our guess being soft than the city having planted a tree in a
   * footpath: the frozen strips are seeded defaults (tl/sw = 1.5 m), not
   * measured. So reality gets nudged onto the nearest legal spot, never deleted
   * for disagreeing with a guess. Invented trees get no such courtesy — they are
   * dropped (`bake-trees.js`).
   */
  classify.nudge = (x, z, { rings = 4, step = 1 } = {}) => {
    for (let ring = 1; ring <= rings; ring++) {
      const r = ring * step
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2
        const nx = +(x + Math.cos(ang) * r).toFixed(2)
        const nz = +(z + Math.sin(ang) * r).toFixed(2)
        if (!classify(nx, nz)) return [nx, nz]
      }
    }
    return null
  }
  return classify
}
