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
import { clipAllToStencil, LAND_USE_COLORS } from '../src/lib/ribbonsGeometry.js'
import { writeIfChanged } from './io.js'
import { buildBlockGeometryV2, differenceRings } from '../src/lib/buildBlockGeometryV2.js'
import { buildPathRibbons } from '../src/lib/buildPathRibbons.js'
import { BAND_COLORS, CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS, BAND_TO_LAYER } from '../src/cartograph/m3Colors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Scene stencil loader. Reads cartograph/data/<scene>/neighborhood_boundary.json
// and derives the four bake-side stencil values:
//   - center, radius                — manifest emission + AO bbox anchor
//   - faceFade, streetFade          — runtime radial fade bands (BakedGround
//                                     shader uniforms via manifest.stencil)
//   - clipPolygon                   — Clipper mask for face/ribbon intersection,
//                                     scaled outward to streetFade.outer + 50
//
// No-boundary fallback (file absent / no `boundary` field): returns nulls
// across the board. clipPolygon=null disables stencil clipping; faceFade=null
// signals manifest.stencil=null so BakedGround skips the radial fade shader.
//
// "fade authored?" gate: if the file has a `boundary` polygon but no `fade`
// field, we use the polygon to clip but emit manifest.stencil=null so the
// runtime renders flat (no soft-circle). Toy uses this — rectangular clip,
// no radial dissolve. Mirrors the Designer-side `useBoundary` flag in
// SCENE_REGISTRY by reading the same data signal.
function loadSceneStencil(scene) {
  const path = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(path)) return { center: [0, 0], radius: 1, faceFade: null, streetFade: null, clipPolygon: null }
  const s = JSON.parse(readFileSync(path, 'utf-8'))
  const center = s.center || [0, 0]
  const radius = s.radius || 1
  const faceFade   = s.fade || null
  const streetFade = s.streetFade || null
  let clipPolygon = null
  if (s.boundary?.length) {
    // Scale outward to streetFade.outer + 50 when fade is authored (LS).
    // Without fade, no scaling needed — clip exactly at the authored polygon.
    const targetR = streetFade ? streetFade.outer + 50 : radius
    const scale = radius > 0 ? targetR / radius : 1
    const cx = center[0], cz = center[1]
    clipPolygon = s.boundary.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
  }
  return { center, radius, faceFade, streetFade, clipPolygon }
}

// Paint order (deepest = drawn first). The pure-Three.js bake bundle is
// the canonical runtime artifact.
// renderOrder ascends with paint order so the runtime composites correctly.
//
// Treelawn is split into per-LU variants ('treelawn:residential',
// 'treelawn:park', etc.) so each treelawn ring picks up the color of the
// land-use block it abuts — visually extending the parcel across its
// frontage. Bare 'treelawn' is kept for chain dead-end caps + corner
// pads where there's no single adjacent block to attribute.
const TREELAWN_LU_VARIANTS = [
  'residential', 'commercial', 'vacant', 'vacant-commercial', 'parking',
  'institutional', 'recreation', 'industrial', 'park', 'island', 'unknown',
]
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
  // Sub-block overlays — sit on top of LU faces, under street ribbons.
  // Polygon overlays from map.json (parking_lot + leisure + natural).
  ['mat', 'parking_lot'],
  ['mat', 'garden'],
  ['mat', 'playground'],
  ['mat', 'swimming_pool'],
  ['mat', 'pitch'],
  ['mat', 'sports_centre'],
  ['mat', 'wood'],
  ['mat', 'scrub'],
  ['mat', 'tree_row'],
  // Ribbons stacked from outside → inside
  ['mat', 'lawn'],
  // Per-LU treelawn variants (treelawn:<lu>) — match adjacent parcel
  // colour. Bare 'treelawn' kept for fallback (dead-end caps, etc.).
  ...TREELAWN_LU_VARIANTS.map(lu => ['mat', `treelawn:${lu}`]),
  ['mat', 'treelawn'],
  ['mat', 'sidewalk'],
  ['mat', 'curb'],
  ['mat', 'asphalt'],
  ['mat', 'highway'],
  ['mat', 'median'],
  // Alley + path ribbons painted on top of streets where they cross.
  ['mat', 'alley'],
  ['mat', 'footway'],
  ['mat', 'cycleway'],
  ['mat', 'steps'],
  ['mat', 'path'],
  // Linear barriers (buffered polylines).
  ['mat', 'fence'],
  ['mat', 'wall'],
  ['mat', 'retaining_wall'],
  ['mat', 'hedge'],
  // Roadway markings (paint), drawn last so they sit on top of asphalt.
  ['mat', 'edgeline'],
  ['mat', 'bikelane'],
  ['mat', 'stripe'],
]

// Polyline-buffered groups (key in PAINT_ORDER → half-width meters). Mirrors
// MapLayers.jsx's stripeRibbonGeo widths so the bake matches the live render.
const POLYLINE_HALF_WIDTHS = {
  stripe:         0.10,
  edgeline:       0.08,
  bikelane:       0.25,
  fence:          0.05,
  wall:           0.10,
  retaining_wall: 0.20,
  hedge:          0.30,
}

// Buffer a polyline to a closed ring polygon by sweeping +halfWidth then
// −halfWidth. Per-vertex perpendicular = perpendicular of (prev → next) so
// straight segments produce parallel edges and gentle bends miter cleanly.
// Sharp corners can self-intersect; barrier/stripe data is dense enough
// that this hasn't bitten in practice.
function polylineToRing(coords, halfWidth) {
  if (!coords || coords.length < 2) return null
  const n = coords.length
  const left = new Array(n), right = new Array(n)
  for (let i = 0; i < n; i++) {
    const c = coords[i]
    const prev = coords[Math.max(0, i - 1)]
    const next = coords[Math.min(n - 1, i + 1)]
    const px = prev.x ?? prev[0], pz = prev.z ?? prev[1]
    const nx = next.x ?? next[0], nz = next.z ?? next[1]
    const cx = c.x    ?? c[0],    cz = c.z    ?? c[1]
    const dx = nx - px, dz = nz - pz
    const l = Math.hypot(dx, dz) || 1
    const ux = -dz / l, uz = dx / l
    left[i]  = [cx + ux * halfWidth, cz + uz * halfWidth]
    right[i] = [cx - ux * halfWidth, cz - uz * halfWidth]
  }
  const ring = []
  for (let i = 0; i < n; i++) ring.push(left[i])
  for (let i = n - 1; i >= 0; i--) ring.push(right[i])
  return ring
}

// Lateral-offset a polyline by `offset` to one side, then return the
// offset polyline. Mirrors MapLayers.jsx:offsetLine. Used by parking_line
// (edgeline) + bike_lane which carry a single centerline + lateral offset
// — the actual paint sits on the offset, not the centerline.
function lateralOffset(coords, offset, side) {
  const out = []
  for (let i = 0; i < coords.length; i++) {
    const prev = coords[Math.max(0, i - 1)]
    const next = coords[Math.min(coords.length - 1, i + 1)]
    const dx = (next.x ?? next[0]) - (prev.x ?? prev[0])
    const dz = (next.z ?? next[1]) - (prev.z ?? prev[1])
    const len = Math.hypot(dx, dz) || 1
    const cx = coords[i].x ?? coords[i][0]
    const cz = coords[i].z ?? coords[i][1]
    out.push({
      x: cx + side * (-dz / len) * offset,
      z: cz + side * ( dx / len) * offset,
    })
  }
  return out
}

// ── V2 → bake-shape translation ─────────────────────────────────────
// Flattens V2's natural per-chain output into the `{ byMaterial,
// byFaceUse }` shape the rest of `bakeGround` walks. When the bake
// is rewritten to consume V2's named outputs (`asphaltRounded`,
// `curbBands`, `blocks`, per-chain rings) directly, this folds away
// and the paint-order/triangulation/.bin emission below stays. The
// translation is a temporary shim, not a
// permanent abstraction.
// Clipper boolean output is a multi-ring polygon with CCW outers and CW
// holes mixed in one array. Pushing them as independent rings paints each
// hole as a filled polygon over its parent's interior — the "black voids"
// failure. Partition rings by signed-area sign and pair each hole with
// the smallest containing outer. Mirrors `ringsToFlatGeo(rings, lift,
// asPolygonWithHoles=true)` in BlockGeometryV2Debug.jsx so the bake
// renders V2 the same way Designer does.
function ringSignedArea(ring) {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    a += (x1 * y2 - x2 * y1)
  }
  return a / 2
}
function pointInRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi || 1e-12) + xi)) inside = !inside
  }
  return inside
}
function ringInteriorProbe(ring) {
  const ccw = ringSignedArea(ring) > 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-3) continue
    const px = ccw ? -dy / len : dy / len
    const py = ccw ?  dx / len : -dx / len
    const eps = 0.01
    return [(a[0] + b[0]) / 2 + px * eps, (a[1] + b[1]) / 2 + py * eps]
  }
  return ring[0]
}
// Find which block ring contains a given point; returns its lu, or null.
// Used to attribute frontage rings (treelawn, etc.) to their adjacent
// parcel when blockKey joins would drift across pass-1 / pass-2.
function blockLuAtPoint(point, blocks) {
  if (!point || !blocks) return null
  for (const b of blocks) {
    if (!b?.ring || b.ring.length < 3) continue
    if (pointInRing(point, b.ring)) return b.lu || 'unknown'
  }
  return null
}
function ringsToHoledPolys(rings) {
  const outers = [], holes = []
  for (const r of rings) {
    if (!r || r.length < 3) continue
    if (ringSignedArea(r) > 0) outers.push(r); else holes.push(r)
  }
  if (!outers.length) return []
  const outerArea = outers.map(o => Math.abs(ringSignedArea(o)))
  const holesByOuter = outers.map(() => [])
  for (const h of holes) {
    const probe = ringInteriorProbe(h)
    let bestIdx = -1, bestArea = Infinity
    for (let i = 0; i < outers.length; i++) {
      if (pointInRing(probe, outers[i]) && outerArea[i] < bestArea) {
        bestIdx = i; bestArea = outerArea[i]
      }
    }
    if (bestIdx >= 0) holesByOuter[bestIdx].push(h)
  }
  return outers.map((o, i) => ({ outer: o, holes: holesByOuter[i] }))
}

function buildV2BakeShape(ribbons, design, stencilPolygon) {
  const v2 = buildBlockGeometryV2(ribbons, {
    stencil: stencilPolygon,
    cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
    cornerRadiusOverrides: (design.cornerRadiusOverrides && typeof design.cornerRadiusOverrides === 'object') ? design.cornerRadiusOverrides : {},
    cornerCornerRadiusOverrides: (design.cornerCornerRadiusOverrides && typeof design.cornerCornerRadiusOverrides === 'object') ? design.cornerCornerRadiusOverrides : {},
    blockCustoms:    design.blockCustoms    || null,
    blockLandUse:    design.blockLandUse    || null,
    curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : CURB_WIDTH,
  })

  const byMaterial = new Map()
  const byFaceUse  = new Map()
  const pushMat = (key, ring) => {
    if (!ring || ring.length < 3) return
    if (!byMaterial.has(key)) byMaterial.set(key, [])
    byMaterial.get(key).push(ring)
  }
  // Push Clipper-output rings as proper holed polygons. Rings come in as
  // a flat array mixing CCW outers + CW holes; partition and pair before
  // pushing so the bake's triangulator honors the holes (otherwise the
  // CW rings render as filled polygons and blank their parent outers).
  const pushClipperRings = (key, rings) => {
    if (!rings || !rings.length) return
    if (!byMaterial.has(key)) byMaterial.set(key, [])
    const polys = ringsToHoledPolys(rings)
    for (const p of polys) byMaterial.get(key).push(p)
  }

  // Per-chain ribbons (asphalt + ped zones) flattened across all chains.
  // Highway-class chains route their asphalt to the `highway` group
  // (matches V1's LAYER_MAP split + the operator's Designer toggle so
  // I-44 and ramps render with their own material/shader). Other chain
  // asphalt → `asphalt` group. Ped zones aren't class-routed since
  // motorways typically have no ped zones in the underlying measure.
  // Plug rings union into their parent material — they ARE asphalt /
  // sidewalk for shading purposes; the operator's "sidewalk" toggle
  // hides the corner concrete with the rest.
  const HIGHWAY_CLASSES = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
  const streets = ribbons?.streets || []
  for (const c of v2.byChain) {
    if (!c) continue
    const cls = streets[c.chainIdx]?.highway
    const asphaltKey = HIGHWAY_CLASSES.has(cls) ? 'highway' : 'asphalt'
    pushClipperRings(asphaltKey,  c.asphaltRings)
    // D.3c: per-chain-segment treelawn/sidewalk bands no longer
    // consumed — frontageBands (block-edge-owned, extended +
    // pulled-back, clipped to blockRounded) take over below. Round
    // dead-end caps still come from byChain.{tl,sw}CapRings (split
    // out in D.3b.1 specifically so this swap leaves them in place).
    pushClipperRings('treelawn',  c.treelawnCapRings)
    pushClipperRings('sidewalk',  c.sidewalkCapRings)
  }
  // D.3c: frontageBands feed treelawn/sidewalk groups. Bands are
  // square-ended at run-boundary IXs (extendCorners=false default);
  // the existing cornerSidewalkPads fill the corner wedge as before.
  // No frontageCaps consumed — pads do the corner concrete.
  //
  // Treelawn now routes per-LU: each fe's treelawn is emitted under
  // 'treelawn:<lu>' keyed by the LU of the block the fe abuts, so the
  // ring picks up that LU's authored color and material (grass texture
  // for residential/park/recreation; flat color for commercial/etc).
  // Sidewalk stays uniform.
  //
  // Adjacent-block lookup is coordinate-based (point-in-polygon) rather
  // than fe.blockKey lookup: pass-1 fee blockKeys drift from pass-2
  // block blockKeys when asphalt widens via Measure customs, so a key
  // join mis-attributes ~80% of fees. The treelawn ring sits inside the
  // block, so its centroid is a safe probe.
  for (const fe of (v2.frontageBands || [])) {
    if (fe.treelawnRings?.length) {
      const probe = ringInteriorProbe(fe.treelawnRings[0])
      const lu = probe ? blockLuAtPoint(probe, v2.blocks) : null
      const key = lu ? `treelawn:${lu}` : 'treelawn'
      pushClipperRings(key, fe.treelawnRings)
    }
    if (fe.sidewalkRings?.length) pushClipperRings('sidewalk', fe.sidewalkRings)
  }
  pushClipperRings('asphalt',  v2.cornerAsphaltPlugs)
  pushClipperRings('sidewalk', v2.cornerSidewalkPads)
  pushClipperRings('curb',     v2.curbBands)

  // Per-block faces grouped by land use. Bare rings → `{outer, holes:[]}`
  // so the existing itemsToBuffers triangulator handles them like V1's
  // `{outer, holes}` faces.
  for (const b of v2.blocks) {
    if (!b?.ring || b.ring.length < 3) continue
    if (!byFaceUse.has(b.lu)) byFaceUse.set(b.lu, [])
    byFaceUse.get(b.lu).push({ outer: b.ring, holes: [] })
  }

  // Non-street ribbons (alleys + footway/cycleway/steps/path). Shared
  // helper so Designer's live render and the bake consume identical
  // geometry. Paths clip to PARCEL interiors — stop at the sidewalk's
  // inner edge, no trespass on ped zone OR curb. block.ring extends to
  // the asphalt edge (curb + ped-zone bands paint on top), so
  //   parcelInteriors = block.ring − curbBands − (treelawn ∪ sidewalk).
  //
  // Park blocks excluded from the path-eligible set: LafayettePark.jsx's
  // ParkPaths renders the park's gravel-shaded paths from park_paths.json,
  // and a baked duplicate of those same OSM polylines (via this block,
  // unshaded via FadeMesh) would poke through whenever the water mesh's
  // depth sort flakes out at certain camera heights. Carving the park
  // out keeps the gravel-shaded version as the sole park-path renderer.
  const blockRings = v2.blocks
    .filter(b => b?.ring?.length >= 3 && b.lu !== 'park')
    .map(b => b.ring)
  const subtract = []
  for (const r of (v2.curbBands || [])) if (r?.length >= 3) subtract.push(r)
  for (const fb of (v2.frontageBands || [])) {
    for (const r of (fb.treelawnRings || [])) if (r?.length >= 3) subtract.push(r)
    for (const r of (fb.sidewalkRings || [])) if (r?.length >= 3) subtract.push(r)
  }
  const parcelInteriors = subtract.length ? differenceRings(blockRings, subtract) : blockRings
  for (const [kind, rings] of buildPathRibbons(ribbons, {
    intersect: parcelInteriors,
    alleyCap: ['square', 'rounded', 'round'].includes(design.alleyCap) ? design.alleyCap : 'square',
  })) {
    pushClipperRings(kind, rings)
  }

  return { byMaterial, byFaceUse }
}

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

export async function bakeGround({ look = 'default', scene = 'lafayette-square' } = {}) {
  // Ribbons input is scene-keyed. LS still publishes to the canonical
  // src/data/ribbons.json (promote-ribbons.js writes there); other scenes
  // author/derive their own ribbon fixture under src/data/<scene>/.
  // When promote-ribbons becomes fully scene-keyed (Phase 0e), this can
  // collapse to a single path template.
  const ribbonsPath = scene === 'lafayette-square'
    ? join(ROOT, 'src', 'data', 'ribbons.json')
    : join(ROOT, 'src', 'data', scene, `${scene}-ribbons.json`)
  const mapPath     = join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json')
  const designPath  = join(ROOT, 'public', 'looks', look, 'design.json')
  const outDir      = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const stencil = loadSceneStencil(scene)

  const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf-8'))
  const mapData = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf-8')) : { layers: {} }
  const design  = existsSync(designPath) ? JSON.parse(readFileSync(designPath, 'utf-8')) : {}
  const designLayerColors = design.layerColors || {}
  const designLuColors    = design.luColors    || {}
  const { byMaterial, byFaceUse } = buildV2BakeShape(ribbons, design, stencil.clipPolygon)

  // ── Inject map.json overlays into byMaterial ──────────────────────
  // Each Designer-toggleable id needs to come out as its own bake group
  // so layerVis can hide it in Stage/Preview. Polygon overlays (parking_lot,
  // leisure subtypes, natural subtypes) drop in as raw rings; line features
  // (centerStripe / parkingLine / bikeLane / barriers) buffer to thin
  // polygons via polylineToRing.
  const mapLayers = mapData.layers || {}
  const pushMat = (key, ring) => {
    if (!ring || ring.length < 3) return
    if (!byMaterial.has(key)) byMaterial.set(key, [])
    byMaterial.get(key).push(ring)
  }
  const ringFromOSM = (ring) => ring.map(p => [p.x ?? p[0], p.z ?? p[1]])

  // parking_lot: every amenity=parking polygon as its own group.
  for (const item of (mapLayers.parking_lot || [])) {
    if (item.ring) pushMat('parking_lot', ringFromOSM(item.ring))
  }
  // leisure subtypes operator can toggle individually.
  const LEISURE_KEYS = new Set(['garden', 'playground', 'swimming_pool', 'pitch', 'sports_centre'])
  for (const item of (mapLayers.leisure || [])) {
    if (LEISURE_KEYS.has(item.use) && item.ring) pushMat(item.use, ringFromOSM(item.ring))
  }
  // natural subtypes — water is owned by park_water.json, skip it here.
  const NATURAL_KEYS = new Set(['wood', 'scrub', 'tree_row'])
  for (const item of (mapLayers.natural || [])) {
    if (NATURAL_KEYS.has(item.use) && item.ring) pushMat(item.use, ringFromOSM(item.ring))
  }
  // Barriers — fence/wall/retaining_wall/hedge as buffered polylines.
  for (const item of (mapLayers.barrier || [])) {
    const hw = POLYLINE_HALF_WIDTHS[item.kind]
    if (!hw || !item.coords) continue
    const ring = polylineToRing(item.coords, hw)
    if (ring) pushMat(item.kind, ring)
  }
  // Center stripes — polylines with no offset, paint sits on the centerline.
  for (const item of (mapLayers.centerStripe || [])) {
    const ring = polylineToRing(item.coords, POLYLINE_HALF_WIDTHS.stripe)
    if (ring) pushMat('stripe', ring)
  }
  // Parking-lane edge lines + bike lanes — both sides offset from a centerline.
  for (const item of (mapLayers.parkingLine || [])) {
    if (!item.coords || !item.offset) continue
    for (const side of [-1, 1]) {
      const off = lateralOffset(item.coords, item.offset, side)
      const ring = polylineToRing(off, POLYLINE_HALF_WIDTHS.edgeline)
      if (ring) pushMat('edgeline', ring)
    }
  }
  for (const item of (mapLayers.bikeLane || [])) {
    if (!item.coords || !item.offset) continue
    for (const side of [-1, 1]) {
      const off = lateralOffset(item.coords, item.offset, side)
      const ring = polylineToRing(off, POLYLINE_HALF_WIDTHS.bikelane)
      if (ring) pushMat('bikelane', ring)
    }
  }

  // Re-clip to the stencil — V2 already clipped its own output, but
  // our injected overlays haven't seen the clipper yet. Run it again
  // so nothing leaks past the silhouette. No-op when stencil.clipPolygon
  // is null (toy / unmigrated scenes).
  if (stencil.clipPolygon) clipAllToStencil(byMaterial, byFaceUse, stencil.clipPolygon)

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

    // Color resolution: per-Look design.json wins, then the canonical
    // Designer palette (DEFAULT_LAYER_COLORS / DEFAULT_LU_COLORS), then
    // the legacy ribbon-band defaults, then a grey fallback. Faces look
    // up under luColors; ribbon/overlay materials under layerColors.
    //
    // Ribbon-band keys (asphalt, curb, sidewalk, …) route through
    // BAND_TO_LAYER first so a Designer toggle named 'street' (color
    // authored under layerColors.street) reaches the 'asphalt' bake group.
    let color
    if (kind === 'face') {
      color = designLuColors[key] || DEFAULT_LU_COLORS[key] || LAND_USE_COLORS[key] || LAND_USE_COLORS.unknown
    } else if (key.startsWith('treelawn:')) {
      // Per-LU treelawn variants inherit the adjacent parcel's LU color.
      const lu = key.slice('treelawn:'.length)
      color = designLuColors[lu] || DEFAULT_LU_COLORS[lu] || LAND_USE_COLORS[lu] || LAND_USE_COLORS.unknown
    } else {
      const layerKey = BAND_TO_LAYER[key] || key
      color = designLayerColors[layerKey]
           || DEFAULT_LAYER_COLORS[layerKey]
           || BAND_COLORS[key]
           || '#666666'
    }

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

  // Bake bbox anchored to stencil.center so the AO baker's texel→world
  // map and BakedGround's UV2 stay concentric with face/street fades.
  // Half-extent prefers streetFade.outer + 50 (LS); falls back to the
  // stencil radius + 50 when fade isn't authored (toy, where the
  // boundary IS the bbox). Final fallback: 1000m, matches the prior
  // hardcoded default.
  const _bakeHalf = (stencil.streetFade?.outer ?? stencil.radius ?? 1000) + 50
  const bx0 = stencil.center[0] - _bakeHalf
  const bx1 = stencil.center[0] + _bakeHalf
  const bz0 = stencil.center[1] - _bakeHalf
  const bz1 = stencil.center[1] + _bakeHalf

  // manifest.stencil = null when the scene didn't author a soft-circle
  // fade (toy). BakedGround already handles null → skip radial fade shader.
  // When fade IS authored (LS), emit the full block so the runtime can
  // patch the shader uniforms without a side import.
  const manifestStencil = stencil.faceFade && stencil.streetFade ? {
    center: stencil.center,
    radius: stencil.radius,
    fade: stencil.faceFade,
    streetFade: stencil.streetFade,
  } : null

  const manifest = {
    version: 1,
    look,
    bbox: { min: [bx0, 0, bz0], max: [bx1, 0, bz1] },
    stencil: manifestStencil,
    bin: 'ground.bin',
    positionFormat: 'float32',
    indexFormat: 'uint32',
    componentsPerVertex: 3,   // x, y, z
    groups,
  }

  // Content-aware writes so ground-ao (which depends on ground.json mtime)
  // can skip its 25s pass when the geometry is unchanged.
  writeIfChanged(join(outDir, 'ground.json'), JSON.stringify(manifest, null, 2))
  writeIfChanged(join(outDir, 'ground.bin'), Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))

  const sizeKb = (buf.byteLength / 1024).toFixed(1)
  const totalTris = groups.reduce((s, g) => s + g.indexCount / 3, 0)
  const totalVerts = groups.reduce((s, g) => s + g.vertexCount, 0)
  console.log(`[bake-ground] look=${look}: ${groups.length} groups, ${totalVerts} verts, ${totalTris} tris, ${sizeKb} KB`)
  return manifest
}

// CLI
async function main() {
  let look = 'default', scene = 'lafayette-square'
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))   look  = m[1]
    else if ((m = arg.match(/^--scene=(.+)$/))) scene = m[1]
  }
  await bakeGround({ look, scene })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
