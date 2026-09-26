/**
 * forbidden-surface.mjs — "a tree can never stand here" mask.
 *
 * Shared by arborist/bake-trees.js (drops/nudges any placement off hardscape) and
 * scripts/17-fill-canopy-trees.mjs (RELOCATES canopy candidates onto the nearest
 * allowed ground). ONE source of truth so the two never drift.
 *
 * ⭐ THE POLICY (ratified with Jacob 2026-07-18), stated the way he states it:
 *
 *     A point is eligible for a tree iff it is EXPOSED Land Use of a PLANTABLE type
 *       — "exposed"   = nothing hard is painted on top of it (no building, water,
 *                       path, and — reading inward off the frozen curb — no CURB
 *                       and no SIDEWALK), and
 *       — "plantable" = the land use itself is a green class, not a hardscape lot
 *                       (commercial / parking / industrial / unknown are OUT).
 *
 *     ⭐ AMENDED 2026-07-21 — the class list is no longer a literal here; it is
 *     `lu-policy.mjs`, per-scene overridable, and an UNRECOGNIZED class defaults
 *     PLANTABLE-and-loud rather than silently hardscape. The old bare Set held
 *     only the four classes LS contains, so HPDM's institutional/vacant/
 *     vacant-commercial — and the emergent `median` face — went bald with no
 *     warning: 4,335 → 8,383 trees once policy covered them.
 *     The curbside TREELAWN is always plantable (street trees line even a parking
 *     lot's frontage); the type gate applies to the LU INTERIOR only.
 *
 * `makeZoneTester({ shapePath })` answers it from the FROZEN Section surfaces —
 * the SAME construction that draws the ground (`RIBBONS.md §3.4/§3.5`), so the mask
 * cannot drift from what the operator sees. The road falls out for free: it is the
 * GROUT between tiles (`RIBBONS.md §28`), so no tile contains it → "not on any tile"
 * = carriageway = forbidden.
 *
 * There used to be a second, legacy `makeForbiddenTester` reading map.json's
 * PAINT-STACK `layers.*` (whole block faces, not footpaths — a category error that
 * forbade 60% of the yards while permitting the road). DELETED 2026-07-18: every
 * poured scene has a `shape.json`, and there is no honest forbidden-surface without
 * the frozen shape — a scene missing it must bake the ground first, not fall through
 * to a wrong mask.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
import { sectionOpen } from '../src/lib/tileGround.js'
import { LU_POLICY, WETLAND_SUBTYPE, resolveLuPolicy, groundKindOf } from './lu-policy.mjs'
import { OSM_TO_LU, OSM_LU_KIND } from './derive.js'
import { unreadableFace } from './osm-vocabulary.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Which LU interiors are plantable now lives in `lu-policy.mjs` — ONE source of
 * truth, per-scene overridable, and (load-bearing) an UNRECOGNIZED class defaults
 * to plantable-and-loud rather than silently to hardscape.
 *
 * This used to be a bare `Set` of the four classes LS happens to contain, so a
 * town with vocabulary LS lacks lost whole blocks with no warning — HPDM's
 * institutional/vacant/vacant-commercial, 7.7% of the neighborhood, bald.
 *
 * Kept as a live-derived export so existing importers keep working; it is now a
 * VIEW of the policy, not the policy itself.
 */
export const PLANTABLE_LU = new Set(
  // ⛔ Read the row through `groundKindOf`, never `=== 'soft'` on the raw value: a
  // `planted` row is an OBJECT (`{ ground, with, pattern }`), and comparing an
  // object to a string excludes it for the wrong reason — right answer, reasoning
  // that breaks the day a row spelling changes.
  Object.entries(LU_POLICY).filter(([, row]) => groundKindOf(row) === 'soft').map(([lu]) => lu)
)

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

// ─────────────────────────────────────────────────────────────────────────────
// The FROZEN-SHAPE zone model — the one and only forbidden-surface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Where may a tree stand?", answered by REBUILDING THE ACTUAL PAINTED GROUND —
 * `sectionOpen` off the frozen shape, the SAME call BlockGeometryV2Debug renders
 * in the Design view (`RIBBONS.md §3.4/§3.5`). We classify a point by which drawn
 * polygon it lands in, so the mask is WYSIWYG with the operator's eye by
 * construction — it cannot drift:
 *
 *   asphalt / curb / sidewalk polygon   → hardscape on top of the ground   → NO
 *   treelawn polygon (any LU)           → the planting strip, street trees → yes
 *   land-use polygon, PLANTABLE type    → exposed lawn/yard/park           → yes
 *   land-use polygon, hardscape type    → the lot itself (parking/…)       → NO
 *   building/water/parking footprint    → something painted on the LU      → NO
 *   no tile surface at all              → the carriageway / un-poured      → NO
 *
 * ⚠️ Do NOT re-derive these bands from a distance off the curb ring. The sidewalk
 * BENDS at corners (all-SW ADA), the treelawn↔sidewalk divider is PER-EDGE, caps
 * wrap — a uniform distance band matches none of that and plants trees on the
 * drawn sidewalk/curb (the 2026-07-18 regression this replaced). The painted
 * polygons are the only honest answer.
 *
 * The TREELAWN is plantable whatever the abutting block's use (street trees line
 * even a parking lot's frontage); the type gate hits the LU INTERIOR only.
 *
 * @param {string}  shapePath   public/baked/<scene>/shape.json (the WALL artifact)
 * @param {string}  mapPath     the scene's clean/map.json (obstruction footprints)
 * @param {string}  designPath  the Look's design.json — its blockCustoms + curbWidth
 *   so the rebuilt surfaces match what the operator authored (absent → defaults).
 * @param {number}  curbWidth   overrides the curb-stroke depth; else design.curbWidth
 *   ?? the fixed CURB_WIDTH the ground bake uses (`streetProfiles.js`).
 * @param {boolean} allowUnpoured  treat ground outside every tile but off the
 *   carriageway as plantable. Default FALSE: outside the poured extent we have
 *   no honest surface model, and guessing there is what made the canopy read
 *   arbitrary. Flip only with an operator's eye on the result.
 * @returns {function} classify(x,z) → forbidden reason, or null when plantable.
 *   Carries `.zoneOf(x,z)` (reporting) and `.nudge(x,z)` (nearest legal ground).
 */
export function makeZoneTester({ shapePath, mapPath, designPath, curbWidth, allowUnpoured = false, scene = null, quiet = false } = {}) {
  const shape = JSON.parse(readFileSync(shapePath, 'utf-8'))
  const design = designPath ? JSON.parse(readFileSync(designPath, 'utf-8')) : {}
  const cw = Number.isFinite(curbWidth) ? curbWidth
           : Number.isFinite(design.curbWidth) ? design.curbWidth : CURB_WIDTH
  const blockCustoms = (design.blockCustoms && typeof design.blockCustoms === 'object') ? design.blockCustoms : null
  const toArr = (ring) => ring.map(p => Array.isArray(p) ? p : [p.x, p.z])

  // ── The WYSIWYG surfaces ────────────────────────────────────────────────────
  // Rebuild the SAME painted polygons the Design view draws (sectionOpen off the
  // frozen shape, exactly as BlockGeometryV2Debug). We classify by which drawn
  // polygon a point lands in — never a re-derived distance band, which can't
  // follow the corner bends / per-edge divider / caps and so plants on the walk.
  const pr = sectionOpen(shape.tiles || [], cw, { outer: 'LU', inner: 'SW' }, null, blockCustoms)
  if (!pr || !(pr.sidewalk || pr.curb || pr.asphalt))
    throw new Error(`[zone-tester] sectionOpen produced no surfaces from ${shapePath}`)

  // Each painted layer is a set of Clipper rings — a region WITH HOLES encoded by
  // winding — so membership is the EVEN-ODD rule (inside an odd number of rings).
  const prep = (rings) => (rings || []).filter(r => Array.isArray(r) && r.length >= 3).map(r => polyWithBbox(r))
  const insideEO = (x, z, polys) => {
    let c = 0
    for (const p of polys) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue
      if (pointInRing(x, z, p.ring)) c++
    }
    return (c & 1) === 1
  }

  const asphalt  = prep(pr.asphalt)
  const curb     = prep(pr.curb)
  const sidewalk = prep(pr.sidewalk)
  const treelawn = prep(Object.values(pr.treelawnByLu || {}).flat())   // plantable, any LU
  // Resolve the LU policy for THIS scene against the classes it actually carries,
  // so an unrecognized class defaults plantable and ANNOUNCES itself rather than
  // silently blanking its blocks. `scene` falls back to the shape path's own
  // directory (public/baked/<scene>/shape.json) so existing callers need no change.
  const mapId = scene || path.basename(path.dirname(shapePath || '')) || null
  const classesPresent = Object.keys(pr.luByClass || {})

  // ── ⭐ A GROUND-COVER BLOCK IS ASKED AT THE POINT, NOT AT THE BLOCK (2026-09-26) ──
  // A tile takes ONE land use, and `luWinnerFromCoverage` (derive.js) lets any ground
  // cover take a tile from a jurisdiction at ANY share — "a filter, not a weight". Right
  // for the paint; wrong for a tree. MEASURED on Provincetown: of 20,833 trees refused as
  // `lu:wetland`, 15,401 stand in NO wetland — in the Seashore's reserve, in mapped woods —
  // and of 15,829 refused as `lu:beach`, 429 stand on beach or sand. Invisible on
  // Lafayette Square, whose blocks are small; Provincetown has 159 tiles for the town.
  // ⇒ For a class that ONLY ground covers produce (every OSM_TO_LU tag emitting it is a
  // `cover` in OSM_LU_KIND — read from the tables, never listed here), the tree gate
  // re-runs the vote at the point: the smallest cover containing it, else the smallest
  // built land use, else the jurisdiction, else nothing — and nothing means the tile's
  // label was an extrapolation, so the canopy data decides.
  // ⚠️ The mask therefore follows the SOURCE, not the paint, inside these tiles: a tree can
  // stand on ground painted wetland. The paint is the Stage's to tune (Jacob: ground colour
  // is parked until this is nailed down).
  const coverOnly = new Set(Object.values(OSM_TO_LU).filter(lu =>
    Object.entries(OSM_TO_LU).every(([tag, l]) => l !== lu || OSM_LU_KIND[tag] === 'cover')))
  const askedAtPoint = classesPresent.filter(lu => coverOnly.has(lu))
  const pointFeats = []
  if (askedAtPoint.length) {
    const osmPath = path.join(REPO_ROOT, 'cartograph', 'data', mapId, 'raw', 'osm.json')
    if (!existsSync(osmPath)) throw new Error(`[zone-tester] '${mapId}' has ground-cover tiles (${askedAtPoint.join(', ')}) and no ${osmPath} to ask at the point. Refusing to judge a tree by its block's label.`)
    const osm = JSON.parse(readFileSync(osmPath, 'utf-8'))
    // The same features derive.js lets vote: mapped tags, readable rings, holes subtracted.
    for (const cat of ['landuse', 'leisure', 'natural', 'amenity']) {
      for (const f of osm.ground?.[cat] || []) {
        const tag = `${cat}:${f.tags?.[cat]}`
        const lu = OSM_TO_LU[tag]
        if (!lu) continue
        const why = unreadableFace(f)
        if (why && why !== 'compound') continue
        const ring = f.coords.map(p => [p.x, p.z])
        const holes = (f.holes || []).filter(h => h?.length >= 3).map(h => h.map(p => [p.x, p.z]))
        const poly = polyWithBbox(ring, holes.length ? holes : null)
        let area = 0
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
        pointFeats.push({ ...poly, lu, tag, kind: OSM_LU_KIND[tag] ?? 'use', area: Math.abs(area / 2),
          subtype: tag === 'natural:wetland' ? (f.tags.wetland ?? '(none)') : null })
      }
    }
    pointFeats.sort((a, b) => a.area - b.area)      // smallest first = most specific
  }
  /** The land-use feature that answers for this point, by derive.js's own precedence. */
  const featureAt = (x, z) => {
    let use = null, mgmt = null
    for (const f of pointFeats) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ || !pointInPolygon(x, z, f)) continue
      if (f.kind === 'cover') return f
      if (f.kind === 'management') mgmt ||= f
      else use ||= f
    }
    return use || mgmt
  }

  const policy = resolveLuPolicy(mapId, [...new Set([...classesPresent, ...pointFeats.map(f => f.lu)])])
  if (!quiet) console.log(policy.report())

  const luAllow = []                 // plantable-type land-use interiors (flattened)
  const luForbid = []                // [{ lu, polys }] — hardscape-type interiors
  for (const [lu, rings] of Object.entries(pr.luByClass || {})) {
    const polys = prep(rings)
    if (policy.isPlantable(lu)) luAllow.push(...polys)
    else luForbid.push({ lu, polys, atPoint: coverOnly.has(lu) })
  }
  /** Inside a ground-cover tile: the point's own verdict — a zone name, as zoneOf returns. */
  const coverVerdict = (x, z) => {
    const f = featureAt(x, z)
    if (!f) return 'lu'                                          // nothing here: the canopy decides
    if (f.lu === 'wetland' && WETLAND_SUBTYPE[f.subtype] === 'wooded') return 'lu'   // a swamp is a forest
    return policy.isPlantable(f.lu) ? 'lu' : `lu:${f.lu}`
  }

  // Real obstructions painted ON TOP of the land use — small literal footprints
  // from the scene's map.json (never the block-face paint layers).
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

  function zoneOf(x, z) {
    // 1. footprints painted on top of the ground
    for (const [reason, polys] of obstructions) {
      for (const p of polys) {
        if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue
        if (pointInPolygon(x, z, p)) return reason
      }
    }
    // 2. the hardscape painted surfaces — the road, the curb stroke, the walk
    if (insideEO(x, z, asphalt))  return 'asphalt'
    if (insideEO(x, z, curb))     return 'curb'
    if (insideEO(x, z, sidewalk)) return 'sidewalk'
    // 3. a land-use interior of a hardscape TYPE (the lot itself)
    for (const g of luForbid) if (insideEO(x, z, g.polys)) return g.atPoint ? coverVerdict(x, z) : `lu:${g.lu}`
    // 4. the two plantable surfaces
    if (insideEO(x, z, treelawn)) return 'treelawn'
    if (insideEO(x, z, luAllow))  return 'lu'
    // 5. on no tile surface → carriageway / un-poured
    return 'asphalt-or-unpoured'
  }

  const ALLOWED = new Set(['treelawn', 'lu'])
  const classify = (x, z) => {
    const zone = zoneOf(x, z)
    if (ALLOWED.has(zone)) return null
    if (zone === 'asphalt-or-unpoured' && allowUnpoured) return null
    return zone
  }
  classify.zoneOf = zoneOf
  /** Reporting: the feature that answered for a point inside a ground-cover tile (or null). */
  classify.featureAt = (x, z) => { const f = featureAt(x, z); return f && { lu: f.lu, tag: f.tag, subtype: f.subtype, kind: f.kind } }
  classify.askedAtPoint = askedAtPoint

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
