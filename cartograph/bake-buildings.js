/**
 * bake-buildings.js — extrudes building footprints into runtime-ready
 * geometry, grouped by wall material + roof material.
 *
 * Building source is per-installation (loadBuildings / adaptMapBuildings):
 * the default (LS) reads its enriched `src/data/buildings.json` (footprint,
 * height, wall/roof material, color); a poured installation adapts the MSBF
 * footprints in its `clean/map.json`. Writes:
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
import { FOUNDATION_BELOW_GRADE_M, periodPedestalFor } from '../src/lib/foundationGeometry.js'
import { writeIfChanged } from './io.js'
import { assertBakeTarget } from './bake-target.js'
import { SCENE, requireExplicitMap } from './scene.js'
import { loadSceneTerrain } from './terrainLoad.js'
import { createMembershipFilter } from './membership.mjs'
import { resolveAddress, addressCensus, addressOfTags, offeredBy, parcelPointsOf } from './building-address.mjs'
import { loadAddressPoints, loadParcelRings } from './address-points.mjs'
import { instanceForMap } from '../src/instances/registry.js'
// ⭐ THE TINT RULES ARE ONE MODULE, shared with the player (SlabBuildings' live palette): a drag equals a re-bake.
// ▶ node checks/claims-live-palette-equals-the-bake.mjs
import { DEFAULT_PALETTE, hashStr, parseHex, roofTintFor, FLAT_ROOF_RGB, tintSourceFor, wallTintHex } from '../src/lib/buildingTint.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Building source, per installation. The default (LS) reads its richly-enriched
// src/data/buildings.json (materials / stories / footprint). A poured
// installation has only the MSBF footprints its prebake wrote into map.json
// ({ring:[{x,z}], msbfId, tags, elev}) — adapt those into the baker's schema
// (footprint:[[x,z]], id, best-guess height). This is an ADAPTER, not a path
// swap; every field here is a first-draft guess, overridable later.
function adaptMapBuildings(mapBuildings) {
  const out = []
  for (const b of mapBuildings) {
    const r = b.ring
    if (!r || r.length < 3) continue
    // {x,z} objects → [x,z] arrays; drop the closing duplicate (baker wants an
    // open ring — LS footprints are open).
    let fp = r.map(p => [p.x, p.z])
    if (fp.length > 3) {
      const a = fp[0], z = fp[fp.length - 1]
      if (a[0] === z[0] && a[1] === z[1]) fp = fp.slice(0, -1)
    }
    if (fp.length < 3) continue
    const tags = b.tags || {}
    // Height: MSBF/OSM tag if present, floored so paper-thin MSBF slivers
    // (min ~0.02 m) don't bake as slabs; else the baker's own 8 m default.
    //
    // ⚠️ This used to guard `typeof tags.height === 'number'`, which can NEVER
    // be true — OSM tag values are always strings. A dead branch that silently
    // discarded every surveyed height: 40 in Księży Młyn, 351 in Centrum
    // (`INTAKE-CATALOGUE §5.2`). parseFloat also handles OSM's "12 m" form.
    const tagH = parseFloat(tags.height)
    const size = Number.isFinite(tagH) && tagH > 0 ? [0, Math.max(tagH, 3), 0] : undefined
    // Source-agnostic building id: MSBF where present (US pours), else OSM
    // (foreign/OSM pours). Without this an OSM installation stamps every
    // building `msbf-undefined` — one non-unique id — breaking content joins,
    // per-building overrides, selection, and neon. (task: id-namespace unify.)
    const id = b.msbfId != null ? `msbf-${b.msbfId}` : (b.osmId != null ? `osm-${b.osmId}` : null)
    if (!id) continue
    // ⭐ SURVEYED FABRIC — the tags a hand-mapped (European) OSM carries and
    // this adapter used to drop on the floor, leaving every poured building a
    // uniform 8 m flat box. Księży Młyn alone has 4,361 `building:levels`; the
    // consumers below already honour `stories` (extrusion at :691, roof shape
    // and steepness at :169-193) — they were simply never fed
    // (`INTAKE-CATALOGUE §5.2`).
    //
    // ⚠️ `building:levels` is an OSM *storey count*, which is exactly what the
    // baker means by `stories`. Fractional values ("1.5") exist; floor them
    // rather than reject, and ignore 0/negative/garbage.
    const lv = parseFloat(tags['building:levels'])
    const stories = Number.isFinite(lv) && lv >= 1 ? Math.floor(lv) : undefined
    const wallMat = mapOsmWallMaterial(tags['building:material'])
    const roofShape = mapOsmRoofShape(tags['roof:shape'])
    out.push({
      id, footprint: fp, size,
      // What the address is resolved from (cartograph/building-address.mjs): this building's OWN OSM tags (an OSM-only
      // building), its OSM twins' ids, and its footprint + twin rings (for an address point inside it).
      addrIn: { ownTags: b.osmId != null ? tags : null, twinOsmIds: b.twinOsmIds || [], rings: [r, ...(b.joinRings || [])] },
      ...(stories !== undefined && { stories }),
      ...(wallMat && { wall_material: wallMat }),
      ...(roofShape && { roof_shape: roofShape }),
    })
  }
  return out
}

/**
 * OSM `building:material` → the baker's WALL_MATERIALS palette.
 *
 * Conservative BY DESIGN: map only what the palette genuinely carries and
 * return null otherwise, so an unrecognised material falls through to the
 * `brick_red` default rather than being coerced into the nearest-looking swatch.
 * Księży Młyn's spread is brick 151 · wood 2 · stone 1 · plaster 1.
 */
function mapOsmWallMaterial(v) {
  if (!v || typeof v !== 'string') return null
  switch (v.trim().toLowerCase()) {
    case 'brick': return 'brick_red'
    case 'stone': case 'sandstone': case 'limestone': case 'granite': return 'stone'
    case 'wood': case 'timber': return 'wood_siding'
    case 'plaster': case 'stucco': case 'render': return 'stucco'
    default: return null
  }
}

/**
 * OSM `roof:shape` → the three shapes this renderer actually builds.
 *
 * ⚠️ `roof:shape` is an OPEN OSM vocabulary (gabled · hipped · flat · mansard ·
 * gambrel · pyramidal · skillion · round · dome · …) and `buildingGeometry`
 * knows exactly three: flat, hip, mansard. `INTAKE-CATALOGUE §5.2` is explicit
 * — map the vocabulary and **fall through to the heuristic on anything
 * unrecognised; do not silently coerce.** So `gabled` (20 in KŁ) and `skillion`
 * (13) return null and take the year/storey prior rather than being flattened
 * into a hip they are not. Widening this means teaching the geometry a new
 * roof, not widening this table.
 */
function mapOsmRoofShape(v) {
  if (!v || typeof v !== 'string') return null
  switch (v.trim().toLowerCase()) {
    case 'flat': return 'flat'
    case 'hipped': case 'half-hipped': return 'hip'
    case 'mansard': return 'mansard'
    default: return null
  }
}

export function loadBuildings(scene) {
  // Per-scene RENDER ledger (KIT): every scene loads its buildings from the same
  // render record at data/<scene>/buildings.json — no scene-name branch. LS's
  // ledger is the render-field projection of its authored src/data content
  // (derive-ls-render-ledger.js); the ~10 townie CONTENT imports still read
  // src/data/buildings.json untouched (render/content split). Poured scenes have
  // no ledger yet, so they fall back to adapting map.json below (until the pour
  // emits a ledger too). The branch is now DATA (does a ledger exist?), not the
  // 'lafayette-square' proper noun — the hardwire retired.
  const ledgerP = join(ROOT, 'cartograph', 'data', scene, 'buildings.json')
  if (existsSync(ledgerP)) {
    const raw = JSON.parse(readFileSync(ledgerP, 'utf-8'))
    return Array.isArray(raw) ? raw : (raw.buildings || [])
  }
  const mapPath = join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json')
  if (!existsSync(mapPath)) { console.warn(`[bake-buildings] no render ledger or map.json for scene ${scene}`); return [] }
  const map = JSON.parse(readFileSync(mapPath, 'utf-8'))
  return adaptMapBuildings(map.buildings || [])
}

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

// foundationHeightFor: thin alias preserving the call sites below; canonical
// definition lives in src/lib/foundationGeometry.js (shared with LafayetteScene).
const foundationHeightFor = periodPedestalFor

// Mirrors classifyRoof() — overrides + year/stories/footprint heuristic.
function classifyRoofFor(building, overrides) {
  const ov = overrides && overrides[building.id]
  if (ov && ov.roof_shape !== undefined) return ov.roof_shape
  // ⭐ SURVEYED before GUESSED. Precedence is override → OSM tag → heuristic,
  // the same chain as the base widths (custom → OSM → AASHTO), so this is the
  // house pattern rather than a new one (`INTAKE-CATALOGUE §5.2`). Everything
  // below this line is a PRIOR inferred from year + storeys — a fair one for a
  // Second Empire district, and still a guess. Where a surveyor actually
  // recorded the roof, the record wins.
  if (building.roof_shape) return building.roof_shape
  const year = building.year_built
  const stories = building.stories || 1
  if (!year) return 'flat'
  if (stories >= 4) return 'flat'
  if (stories === 1 && building.size && building.size[0] * building.size[2] > 500) return 'flat'
  if (year < 1900 && stories >= 2 && stories <= 3) return 'mansard'
  if (year < 1920 && stories >= 1 && stories <= 3) return 'hip'
  return 'flat'
}

// Mirrors LafayetteScene.getRoofPeakHeight EXACTLY — this is the rooftop
// term the runtime neon baseY uses (SceneNeon.jsx:124). It must agree to the
// centimeter or neon tubes float above / sink below the baked roof. NOTE:
// the height switch reads RAW building.stories (NOT `|| 1`), matching the
// runtime. getLocalPts is a pure translation, so the convexity + length
// guards are footprint-invariant — run them against the world footprint.
function getRoofPeakHeightFor(building, overrides) {
  const roofType = classifyRoofFor(building, overrides)
  if (roofType === 'flat') return 0
  const fp = building.footprint
  if (!fp || fp.length < 3) return 0
  if (roofType === 'mansard') {
    return isConvex(fp) ? (building.stories >= 3 ? 2.5 : 2.0) : 0
  }
  if (roofType === 'hip') {
    return fp.length > 8 ? 0 : (building.stories === 1 ? 1.8 : 1.5)
  }
  return 0
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
  // topRing = the inset top-cap perimeter (world [x,z]) — the actual rooftop
  // edge a neon tube should trace (NOT the wider footprint). See roofOutline.
  return { positions, indices, uvs, topRing: innerPts }
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

  // topRing = the actual top edge of the hip geometry — degenerate by nature:
  // a single apex point for a pyramid, the ridge segment otherwise. Emitted
  // as roofOutline so the neon brief traces the true rooftop edge, not the
  // wider eave footprint. (Consumer handles ptCount < 3.)
  let topRing
  if (ratio > 0.8 || n > 8) {
    // Pyramid to single peak
    topRing = [[cx, cz]]
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
    topRing = [r0, r1]
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
  return { positions, indices, uvs, topRing }
}

// Triangulate a 2D footprint contour. ShapeUtils handles either winding;
// returns triplet indices into the contour.
function triangulateContour(footprint) {
  const contour = footprint.map(([x, z]) => new THREE.Vector2(x, z))
  return THREE.ShapeUtils.triangulateShape(contour, [])
}

// Build a single building's geometry. Walls go [foundationY .. wallTop],
// foundation [-FOUNDATION_BELOW_GRADE_M .. foundationY], roof on top of
// wallTop in flat / mansard / hip shape per `roofShape`. Each section
// emits its own UVs aligned to the surface so tileable textures (slate
// courses, brick rows) read correctly.
//
// The foundation's bottom ring is baked BELOW Y=0 only to mark it: at runtime
// the shader places that ring on the town's floor (RISER_LIFT_GLSL), so no
// footprint corner can surface it at any exaggeration. See
// src/lib/foundationGeometry.js.
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
  // Foundation: same shape, lower band [-FOUNDATION_BELOW_GRADE_M, foundationY].
  // Always emitted — modern buildings (foundationY = 0) still get the
  // contact-joint block; only the visible-above-grade pedestal is zero.
  const foundBottom = -FOUNDATION_BELOW_GRADE_M
  for (let i = 0; i < n; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % n]
    const baseIdx = foundPositions.length / 3
    const edgeLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    const foundH = foundationY - foundBottom
    foundPositions.push(a[0], foundBottom,  a[1])
    foundPositions.push(b[0], foundBottom,  b[1])
    foundPositions.push(b[0], foundationY,  b[1])
    foundPositions.push(a[0], foundationY,  a[1])
    foundUVs.push(0, 0,  edgeLen, 0,  edgeLen, foundH,  0, foundH)
    foundIndices.push(baseIdx, baseIdx + 1, baseIdx + 2)
    foundIndices.push(baseIdx, baseIdx + 2, baseIdx + 3)
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

  // roofTopRing = the actual rooftop perimeter (world [x,z]) the neon tube
  // should trace, taken from the SAME geometry built here (not a re-derived
  // heuristic): the inset cap for mansard, the ridge/apex for hip, the
  // footprint for flat. Emitted into the index as `roofOutline`.
  let roofTopRing
  if (useShape === 'mansard') {
    const m = buildMansardRoofWorld(footprint, wallTop, stories || 1)
    for (let i = 0; i < m.positions.length; i++) roofPositions.push(m.positions[i])
    for (let i = 0; i < m.uvs.length;       i++) roofUVs.push(m.uvs[i])
    for (let i = 0; i < m.indices.length;   i++) roofIndices.push(m.indices[i])
    roofTopRing = m.topRing
  } else if (useShape === 'hip') {
    const h = buildHipRoofWorld(footprint, wallTop, stories || 1)
    for (let i = 0; i < h.positions.length; i++) roofPositions.push(h.positions[i])
    for (let i = 0; i < h.uvs.length;       i++) roofUVs.push(h.uvs[i])
    for (let i = 0; i < h.indices.length;   i++) roofIndices.push(h.indices[i])
    roofTopRing = h.topRing
  } else {
    // Flat cap — planar XZ UV (texture seen from above, doesn't matter
    // much because flat roofs don't typically use directional textures).
    const tris = triangulateContour(footprint)
    for (const [x, z] of footprint) {
      roofPositions.push(x, wallTop, z)
      roofUVs.push(x, z)
    }
    for (const t of tris) roofIndices.push(t[0], t[2], t[1])
    roofTopRing = footprint   // flat roof cap == footprint
  }

  return {
    wallPositions, wallIndices, wallUVs,
    roofPositions, roofIndices, roofUVs,
    foundPositions, foundIndices, foundUVs,
    roofTopRing,
  }
}

export async function bakeBuildings({ look, scene } = {}) {
  assertBakeTarget('bake-buildings', look, scene)
  const outDir   = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  let buildings = loadBuildings(scene)

  // Membership cull (KIT). The neighborhood is the area inside the boundary-street
  // POLYGON (persisted on commit); a building belongs if its centroid is in the
  // polygon. The roster editor's overrides layer on top (feedback_effective_payload
  // _layering): `activate` forces an outside building IN, `hide` forces an inside
  // one OUT. Keep if (centroid-in-polygon OR activated) AND NOT hidden. Falls back
  // to the boundary CIRCLE if no polygon was persisted (older scenes).
  //
  // The `scene !== 'lafayette-square'` gate is a HARDWIRE, twin of the source-select
  // at :62 — LS is the one legacy install on a hand-curated buildings.json, so the
  // poured-path membership cull doesn't apply. Both retire when LS becomes poured.
  const nbP = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (scene !== 'lafayette-square' && existsSync(nbP)) {
    const nb = JSON.parse(readFileSync(nbP, 'utf-8'))
    let activate = new Set(), hide = new Set()
    const ovP = join(ROOT, 'cartograph', 'data', scene, 'building-overrides.json')
    if (existsSync(ovP)) {
      try { const ov = JSON.parse(readFileSync(ovP, 'utf-8')); activate = new Set(ov.activate || []); hide = new Set(ov.hide || []) }
      catch (e) { console.warn(`[bake-buildings] building-overrides unreadable: ${e.message}`) }
    }
    // ⭐ ONE decision, shared with pipeline.js — see cartograph/membership.mjs.
    // This used to be a hand-copied third copy under a comment claiming it "must
    // match pipeline.js exactly"; it did not (ROADMAP A08).
    const membership = createMembershipFilter({ nb, activate, hide, label: 'bake-buildings' })
    const before = buildings.length
    buildings = buildings.filter(b => membership.decide(b.id, b.footprint || null))
    membership.report()

  }

  // ⭐ THE SET-PIECE'S BUILDING (BRIEF-set-piece-contract item 1). A town's set-piece stands on one of
  // its own buildings (`setPiece.buildingId`, src/instances/<town>.js). That building keeps its RECORD
  // here (id, footprint), because the slab is the id set everything downstream joins to (bake-content's
  // listings and roster, picking, the card). It gets NO geometry: the set-piece renderer is its 3D.
  // ⛔ A claim on a building the town doesn't have THROWS. It never bakes on without its set-piece.
  const setPieceId = instanceForMap(scene)?.setPiece?.buildingId ?? null
  if (setPieceId && !buildings.some(b => b.id === setPieceId))
    throw new Error(`[bake-buildings] ⛔ "${scene}" puts its set-piece on building ${setPieceId}, which is not in the town's building list (hidden in building-overrides.json, or outside the neighborhood?)`)

  // Per-building centroid elevation → raw `aCentroidY` per-vertex attribute;
  // SlabBuildings multiplies by `uExag` (the ground-displacement uniform) so
  // buildings rise/fall in lockstep with the ground. Uses getElevationRaw (NOT
  // getElevation) — the scene's own terrain; flat if it has none.
  const terrain = loadSceneTerrain(scene) || { getElevationRaw: () => 0 }
  const getElevationRaw = (x, z) => terrain.getElevationRaw(x, z)
  // Per-building overrides (roof shape, foundation height, colour) are the TOWN's own: the `overrides` map in
  // cartograph/data/<town>/building-overrides.json. ⛔ They used to be read from src/data/buildingOverrides.json — one
  // legacy file (Lafayette Square's) for every town (BRIEF-live-building-palette; empty when retired, 2026-09-28).
  const townOvP = join(ROOT, 'cartograph', 'data', scene, 'building-overrides.json')
  const overrides = existsSync(townOvP) ? (JSON.parse(readFileSync(townOvP, 'utf-8')).overrides || {}) : {}

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
  // ⭐ A TOWN'S OWN WALLS (Jacob, 2026-09-26 — "a cosmetic, decorative presumption"; authoring, not
  // survey). `wallMix` {material: weight}: what a building OSM says nothing about is built of, drawn per
  // building by id — the default was LS's red brick everywhere. `wallPalettes` {material: [hex…]}: a
  // wall material's own swatches, so a brick building is dealt brick colours, not a clapboard white.
  // Both absent → exactly the behaviour before (brick_red, one palette). A material the baker does not
  // carry is REFUSED by name, never coerced.
  const wallMix = design.wallMix || null
  const wallPalettes = design.wallPalettes || {}
  for (const k of [...Object.keys(wallMix || {}), ...Object.keys(wallPalettes)])
    if (!WALL_MATERIALS[k]) throw new Error(`[bake-buildings] ⛔ design.json names wall material "${k}"; the baker carries ${Object.keys(WALL_MATERIALS).join(', ')}`)
  const mixTotal = wallMix ? Object.values(wallMix).reduce((a, w) => a + (w > 0 ? w : 0), 0) : 0
  if (wallMix && !(mixTotal > 0)) throw new Error(`[bake-buildings] ⛔ design.json wallMix has no positive weight: ${JSON.stringify(wallMix)}`)
  const defaultWallFor = (id) => {
    if (!wallMix) return 'brick_red'
    let r = (hashStr(id + ':wall') % 10000) / 10000 * mixTotal
    for (const [k, w] of Object.entries(wallMix)) { if (w > 0 && (r -= w) < 0) return k }
    return Object.keys(wallMix).find(k => wallMix[k] > 0)
  }
  if (wallMix) console.log(`[bake-buildings] wall mix for undescribed buildings: ${Object.entries(wallMix).map(([k, w]) => `${k} ${w}`).join(' · ')}`
    + `${Object.keys(wallPalettes).length ? ` · own palettes: ${Object.keys(wallPalettes).join(', ')}` : ''}`)
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

  // ── Per-building RENDER-SCOPED index (slab v2) ──────────────────────
  // One entry per rendered building, carrying only what the 3D render +
  // neon + click-identity path needs (NOT the LS content record — name /
  // address / architect etc. stay in the content layer; see C2 in
  // HANDOFF-buildings-bake.md). `ranges` are GROUP-LOCAL [startVert, count]
  // into the building's wall / foundation / roof group; the consumer stamps
  // a per-vertex aBuildingId from them. Footprints are packed into the .bin
  // (C1 — bulk numerics never go in JSON); `footprintRange` is [ptStart,
  // ptCount] in POINT units into the bin's footprints section.
  const buildingIndex = []
  const footprintData = []   // flat Float32 [x0,z0, x1,z1, …] across all buildings
  let footprintPtCursor = 0
  // roofOutline: the actual rooftop-perimeter ring per building (= footprint
  // for flat, inset cap for mansard, ridge/apex for hip). Bulk numerics →
  // its own .bin section (C1); `roofOutlineRange: [ptStart, ptCount]` mirrors
  // footprintRange. Additive/optional → stays slab v2. Nothing consumes it
  // yet (the neon-roof-depth brief is the consumer). Hip rings are degenerate
  // (1–2 pts) by the geometry's nature.
  const roofOutlineData = []
  let roofOutlinePtCursor = 0

  // ⛔ Count what we cannot extrude — a building silently missing from the slab
  // is the same silent-substitution class as a fallback (CLAUDE.md Layer 0 q2).
  // Membership deliberately KEEPS a <3-vertex footprint (it is an intake defect,
  // not a membership answer — cartograph/membership.mjs); this is where it stops,
  // and it says so. ROADMAP A08.
  // ── ADDRESSES (cartograph/building-address.mjs): authored > the building's OSM (own, then twins) > an OSM address
  // point inside its footprint — by identity and containment, never by nearest. The town's raw OSM is read once.
  const rawOsmP = join(ROOT, 'cartograph', 'data', scene, 'raw', 'osm.json')
  const rawOsm = existsSync(rawOsmP) ? JSON.parse(readFileSync(rawOsmP, 'utf-8')) : null
  const osmTagsById = new Map((rawOsm?.buildings || []).map((o) => [o.osmId, o.tags]))
  const addrPois = (rawOsm?.pois || []).map((p) => ({ address: addressOfTags(p.tags), x: p.coords?.[0]?.x, z: p.coords?.[0]?.z }))
    .filter((p) => p.address && Number.isFinite(p.x) && Number.isFinite(p.z))
  // The town's DECLARED address points (county/state E-911 — sources.json `addressPoints`), and its parcels as the
  // containment that reaches them. Undeclared / declared-none is said in the census, never read as "no addresses".
  const ap = loadAddressPoints(scene)
  const parcelPoints = ap.points.length ? parcelPointsOf(loadParcelRings(scene), ap.points) : () => []
  const ringsOf = (b) => b.addrIn?.rings ?? (b.footprint ? [b.footprint.map(([x, z]) => ({ x, z }))] : [])
  const addressOf = (b) => resolveAddress({
    authored: b.address ?? null,
    ownTags: b.addrIn?.ownTags ?? null,
    twinTags: (b.addrIn?.twinOsmIds || []).map((id) => osmTagsById.get(id)).filter(Boolean),
    rings: ringsOf(b),
  }, addrPois, { addressPoints: ap.points, parcelPoints })
  // What the input OFFERS (addressed OSM buildings' centroids + address points), to count what the join LOSES.
  const offerPoints = [
    ...(rawOsm?.buildings || []).filter((o) => addressOfTags(o.tags) && o.coords?.length >= 3)
      .map((o) => ({ x: o.coords.reduce((a, q) => a + q.x, 0) / o.coords.length, z: o.coords.reduce((a, q) => a + q.z, 0) / o.coords.length })),
    ...addrPois,
    ...ap.points,
  ]
  const isOffered = offeredBy(offerPoints)
  // ⛔ A POUR THAT PREDATES THE OSM TWIN JOIN (building-union.mjs, 2026-09-25) carries no twins, so the addresses it has
  // cannot travel. Not repaired here (one producer for the twin join): said, with the fix.
  const fromMap = buildings.some((b) => b.addrIn)
  const hasTwins = buildings.some((b) => b.addrIn && (b.addrIn.twinOsmIds.length || b.addrIn.rings.length > 1))
  const addressIncomplete = fromMap && !hasTwins && offerPoints.length
    ? `${scene}'s clean/map.json predates the OSM twin join — re-pour ${scene} to carry the addresses its OSM has`
    : null
  if (addressIncomplete) console.error(`[bake-buildings] ⛔ addresses: ${addressIncomplete}`)
  const resolvedAddresses = []
  const addressFields = (b) => {
    const r = addressOf(b)
    const rings = ringsOf(b)
    resolvedAddresses.push({ ...r, id: b.id, offered: isOffered(rings) || parcelPoints({ rings }).length > 0 })
    return { address: r.address, addressSource: r.addressSource, ...(r.addressCandidates && { addressCandidates: r.addressCandidates }),
      ...(r.addressUnits && { addressUnits: r.addressUnits }) }
  }

  const unextrudable = []
  for (const b of buildings) {
    const fp = b.footprint
    if (!fp || fp.length < 3) { unextrudable.push(b.id ?? '<no id>'); continue }
    let wallRange = null, foundRange = null, roofRange = null
    const h = (b.size && b.size[1]) || (b.stories ? b.stories * 3.5 : 8)
    // Foundation: visible top = period pedestal (fh) above grade; the bottom
    // ring is baked below grade as a marker and seated on the town's floor at
    // runtime. Per-vertex aCentroidY (sampled below) lifts wall + foundation
    // top rigidly. See src/lib/foundationGeometry.js.
    const fh = foundationHeightFor(b, overrides)
    const foundationY = fh
    const wallTop = foundationY + h
    const wallMat = b.wall_material || defaultWallFor(b.id)
    const roofMat = b.roof_material || 'flat'
    const roofShape = classifyRoofFor(b, overrides)
    const stories = b.stories || 1
    const {
      wallPositions, wallIndices, wallUVs,
      roofPositions, roofIndices, roofUVs,
      foundPositions, foundIndices, foundUVs,
      roofTopRing,
    } = buildingGeometry(fp, foundationY, wallTop, roofShape, stories)

    // Per-building colour — the shared tint module (src/lib/buildingTint.js): an override colour is FIXED; else
    // the wall material's own palette, else the base palette, by the id's hash. The SOURCE is stamped in the
    // index (`tint`) so the player can recolour live without knowing which buildings were overridden.
    const tint = tintSourceFor({ fixedColor: overrides[b.id]?.color ?? null, wallMaterial: wallMat }, { wallPalettes })
    const tintHex = wallTintHex(b.id, tint, { palette, wallPalettes })
    const wallRgb  = parseHex(tintHex)
    const foundRgb = parseHex(FOUNDATION_MATERIAL.color)     // uniform tan
    // Roof color rule mirrors LafayetteScene exactly:
    //  - flat: uniform near-black, NO building tint, NO texture
    //  - slate/metal: HSL-transform of building tint (hue kept, sat×0.3,
    //    lum=0.15 slate / 0.28 metal), overlay-blended with texture in shader
    const roofRgb = roofMat === 'flat' ? FLAT_ROOF_RGB : roofTintFor(tintHex, roofMat)

    // Per-building centroid elevation (raw, no exag). Each vertex of this
    // building carries the same centroidY so the runtime can lift the
    // whole building rigidly via `position.y += aCentroidY * uExag`.
    let centroidY = 0
    for (let i = 0; i < fp.length; i++) centroidY += getElevationRaw(fp[i][0], fp[i][1])
    centroidY /= fp.length

    // The set-piece's building: its record, no geometry (see setPieceId above).
    const built = b.id !== setPieceId

    // Append walls
    if (built) {
      const bucket = ensure(walls, wallMat)
      const base = bucket.vCount
      const vAdded = wallPositions.length / 3
      for (let i = 0; i < wallPositions.length; i++) bucket.positions.push(wallPositions[i])
      for (let i = 0; i < wallUVs.length;        i++) bucket.uvs.push(wallUVs[i])
      for (let i = 0; i < wallIndices.length;    i++) bucket.indices.push(wallIndices[i] + base)
      pushColors(bucket, vAdded, wallRgb)
      pushCentroidY(bucket, vAdded, centroidY)
      wallRange = [base, vAdded]
      bucket.vCount += vAdded
    }
    if (built && foundPositions.length) {
      const bucket = ensure(founds, 'foundation')
      const base = bucket.vCount
      const vAdded = foundPositions.length / 3
      for (let i = 0; i < foundPositions.length; i++) bucket.positions.push(foundPositions[i])
      for (let i = 0; i < foundUVs.length;        i++) bucket.uvs.push(foundUVs[i])
      for (let i = 0; i < foundIndices.length;    i++) bucket.indices.push(foundIndices[i] + base)
      pushColors(bucket, vAdded, foundRgb)
      pushCentroidY(bucket, vAdded, centroidY)
      foundRange = [base, vAdded]
      bucket.vCount += vAdded
    }
    if (built) {
      const bucket = ensure(roofs, roofMat)
      const base = bucket.vCount
      const vAdded = roofPositions.length / 3
      for (let i = 0; i < roofPositions.length; i++) bucket.positions.push(roofPositions[i])
      for (let i = 0; i < roofUVs.length;        i++) bucket.uvs.push(roofUVs[i])
      for (let i = 0; i < roofIndices.length;    i++) bucket.indices.push(roofIndices[i] + base)
      pushColors(bucket, vAdded, roofRgb)
      pushCentroidY(bucket, vAdded, centroidY)
      roofRange = [base, vAdded]
      bucket.vCount += vAdded
    }

    // Footprint → .bin (C1). ptStart/ptCount in POINT units.
    const ptStart = footprintPtCursor
    for (let i = 0; i < fp.length; i++) footprintData.push(fp[i][0], fp[i][1])
    footprintPtCursor += fp.length

    // roofOutline → .bin (C1). The actual rooftop-edge ring returned by
    // buildingGeometry (footprint for flat, inset cap for mansard, ridge/apex
    // for hip). Falls back to footprint if the roof builder returned nothing.
    const ring = (roofTopRing && roofTopRing.length) ? roofTopRing : fp
    const roofPtStart = roofOutlinePtCursor
    for (let i = 0; i < ring.length; i++) roofOutlineData.push(ring[i][0], ring[i][1])
    roofOutlinePtCursor += ring.length

    // baseY = building-TOP world Y (the eave / wall-roof joint, pre-terrain-lift),
    // identical to the runtime neon term getFoundationHeight + size[1] + 0.3
    // (SceneNeon.jsx). The roof-peak lift was dropped so neon hugs the building
    // (2026-06-27). `h` === b.size[1] for all real buildings.
    const baseY = fh + h + 0.3

    const ranges = {}
    if (wallRange) ranges.wall = wallRange
    if (roofRange) ranges.roof = roofRange
    if (foundRange) ranges.foundation = foundRange
    buildingIndex.push({
      id: b.id,
      footprintRange: [ptStart, fp.length],
      roofOutlineRange: [roofPtStart, ring.length],
      centroidY,
      baseY,
      wallMaterial: wallMat,
      roofMaterial: roofMat,
      // v3: where the wall tint came from — { fixed: '#hex' } or { palette: 'base' | <wallMaterial> } (buildingTint.js).
      tint,
      // ⭐ The storey count the geometry was ACTUALLY built from. The roster
      // used to back-solve this from `(centroidY − baseY)/3.5`, which is not a
      // height at all — centroidY is mean terrain under the footprint and baseY
      // is the wall top, so the expression was inverted AND its operands
      // unrelated, pinning every poured building to 1 (`INTAKE-CATALOGUE §5.2`).
      // Recording it here means content reads what the baker used instead of
      // reconstructing it from two quantities that never encoded it.
      //
      // ⚠️ RAW, not the `|| 1` the roof classifier works in. An untagged
      // building extrudes at the 8 m default (~2 storeys) — writing `1` for it
      // would state a storey count nobody measured, which is the fabricated
      // value this field exists to stop. Unknown stays null; the roster then
      // renders "—" rather than asserting a one-storey building.
      stories: b.stories ?? null,
      zoning: b.zoning ?? null,
      // The street address, the source's words (cartograph/building-address.mjs). null = none, or ambiguous (then
      // addressCandidates lists what the inputs disagree on — never one picked).
      ...addressFields(b),
      ranges,
    })
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

  // ── Index tiling assertion (the real Phase-A correctness gate) ──────
  // Every per-building group-local range must tile its group's vertices
  // with no gaps / overlaps, and reference only emitted groups. If this
  // throws, the consumer's per-vertex aBuildingId stamping would mis-map.
  {
    const gkey = (kind, mat) => `${kind}:${mat}`
    const rangesByGroup = new Map()
    const pushRange = (kind, mat, r) => {
      if (!r) return
      const k = gkey(kind, mat)
      if (!rangesByGroup.has(k)) rangesByGroup.set(k, [])
      rangesByGroup.get(k).push(r)
    }
    for (const e of buildingIndex) {
      pushRange('wall', e.wallMaterial, e.ranges.wall)
      pushRange('foundation', 'foundation', e.ranges.foundation)
      pushRange('roof', e.roofMaterial, e.ranges.roof)
    }
    const emittedKeys = new Set(groups.map(g => gkey(g.kind, g.id)))
    for (const k of rangesByGroup.keys()) {
      if (!emittedKeys.has(k)) {
        throw new Error(`[bake-buildings] index references non-emitted group "${k}" — geometry would be dropped`)
      }
    }
    for (const g of groups) {
      const rs = (rangesByGroup.get(gkey(g.kind, g.id)) || []).slice().sort((a, b) => a[0] - b[0])
      let cursor = 0
      for (const [start, count] of rs) {
        if (start !== cursor) {
          throw new Error(`[bake-buildings] index tiling gap/overlap in group "${gkey(g.kind, g.id)}": expected start ${cursor}, got ${start}`)
        }
        cursor += count
      }
      if (cursor !== g.vertexCount) {
        throw new Error(`[bake-buildings] index under/over-covers group "${gkey(g.kind, g.id)}": covered ${cursor} of ${g.vertexCount} verts`)
      }
    }
    console.log(`[bake-buildings] index tiling verified: ${buildingIndex.length} buildings tile ${groups.length} groups with no gaps/overlaps`)
  }

  if (unextrudable.length) {
    console.warn(
      `[bake-buildings] ⛔ ${unextrudable.length} building(s) had a footprint with <3 vertices and were ` +
      `NOT extruded into the slab — they exist in map.json but will not appear in the 3D map. ` +
      `Fix at intake. ids: ${unextrudable.slice(0, 20).join(', ')}${unextrudable.length > 20 ? ', …' : ''}`
    )
  }

  // Layout: [positions][colors][uvs][centroidYs][indices][footprints][roofOutlines].
  const totalPosBytes = posByteOffset
  const totalColBytes = colByteOffset
  const totalUvBytes  = uvByteOffset
  const totalCyBytes  = cyByteOffset
  const totalIdxBytes = idxByteOffset
  // Footprints + roofOutlines sections (C1): Float32 [x,z] pairs, all buildings
  // concatenated, appended AFTER indices so the existing per-group offsets are
  // undisturbed.
  const footprints   = new Float32Array(footprintData)
  const roofOutlines = new Float32Array(roofOutlineData)
  const buf = new Uint8Array(totalPosBytes + totalColBytes + totalUvBytes + totalCyBytes + totalIdxBytes + footprints.byteLength + roofOutlines.byteLength)
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
  // Footprints, then roofOutlines. Each section start is a byte offset; the
  // per-building ranges index it in POINT units (×8 bytes).
  const footprintByteOffset = totalPosBytes + totalColBytes + totalUvBytes + totalCyBytes + totalIdxBytes
  buf.set(new Uint8Array(footprints.buffer, footprints.byteOffset, footprints.byteLength), off)
  off += footprints.byteLength
  const roofOutlineByteOffset = footprintByteOffset + footprints.byteLength
  buf.set(new Uint8Array(roofOutlines.buffer, roofOutlines.byteOffset, roofOutlines.byteLength), off)
  off += roofOutlines.byteLength

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
    // v2 (slab bump): adds the render-scoped per-building index (`buildings`)
    // + a footprints section in the .bin. Consumers MUST refuse unknown
    // versions (SLAB-CONTRACT §0). NOTE: the tree path is deliberately
    // version-agnostic and is NOT affected by this bump.
    version: 3,
    look,
    bbox: { min: [bx0, by0, bz0], max: [bx1, by1, bz1] },
    bin: 'buildings.bin',
    positionFormat: 'float32',
    colorFormat: 'float32',
    uvFormat: 'float32',
    centroidYFormat: 'float32',
    indexFormat: 'uint32',
    footprintFormat: 'float32',
    componentsPerVertex: 3,
    colorsPerVertex: 3,
    uvsPerVertex: 2,
    centroidYsPerVertex: 1,
    footprintComponentsPerPoint: 2,
    footprintByteOffset,
    footprintPointCount: footprintData.length / 2,
    // roofOutlines: additive (slab v2), same [x,z] Float32 format as footprints.
    // Per-building `roofOutlineRange: [ptStart, ptCount]`. Consumed by the
    // separate neon-roof-depth brief, not yet by SlabBuildings.
    roofOutlineByteOffset,
    roofOutlinePointCount: roofOutlineData.length / 2,
    buildingCount: buildings.length,
    renderedBuildingCount: buildingIndex.length,
    // What was carried: counts by source, and what has none or is ambiguous (checks/claims-every-building-has-an-address).
    addressCensus: { ...addressCensus(resolvedAddresses, addressIncomplete), addressPoints: ap.state, ...(ap.reason && { addressPointsAbsentReason: ap.reason }) },
    buildings: buildingIndex,
    groups,
  }

  writeIfChanged(join(outDir, 'buildings.json'), JSON.stringify(manifest, null, 2))
  writeIfChanged(join(outDir, 'buildings.bin'), Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))

  const sizeKb = (buf.byteLength / 1024).toFixed(1)
  const totalTris = groups.reduce((s, g) => s + g.indexCount / 3, 0)
  const totalVerts = groups.reduce((s, g) => s + g.vertexCount, 0)
  const skipped = buildings.length - buildingIndex.length
  const ac = manifest.addressCensus
  console.log(`[bake-buildings] addresses: ${ac.withAddress}/${ac.buildings} (${Object.entries(ac.bySource).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'})`
    + `${ac.ambiguous ? ` · ⚠️ ${ac.ambiguous} ambiguous` : ''}${ac.none ? ` · ⛔ ${ac.none} with none` : ''}${ac.lost ? ` · ⛔ ${ac.lost} LOST (the input offers one)` : ''}${ac.disagreements ? ` · ${ac.disagreements} lower-source disagreements (not applied)` : ''}`)
  console.log(`[bake-buildings] look=${look}: ${buildings.length} buildings (${buildingIndex.length} rendered${skipped ? `, ${skipped} skipped <3pt footprints` : ''}), ${groups.length} groups, ${totalVerts} verts, ${totalTris} tris, ${footprintData.length / 2} footprint pts, ${roofOutlineData.length / 2} roofOutline pts, ${sizeKb} KB`)
  return manifest
}

async function main() {
  const scene = requireExplicitMap('bake-buildings')   // one resolver: --scene= OR CARTOGRAPH_SCENE
  let look = null
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))      look  = m[1]
  }
  await bakeBuildings({ look, scene })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
