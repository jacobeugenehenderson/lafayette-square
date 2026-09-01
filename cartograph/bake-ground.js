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
 * Y axis up at runtime. The runtime terrain lift is ADDITIVE
 * (`terrainShader` patchTerrain: `transformed.y += sampledLift`), so any baked Y
 * survives the displacement.
 *
 * Coplanar stacking: each group gets a tiny geometric **Y = renderOrder × EPS**
 * separation (`GROUND_Y_EPS`) — the ONLY mechanism that works under the
 * production `logarithmicDepthBuffer` canvas, where `polygonOffset` is
 * structurally INERT (the `<logdepthbuf_fragment>` writes `gl_FragDepth`, which
 * bypasses `GL_POLYGON_OFFSET_FILL`). This reproduces the live Designer's proven
 * Y-ladder (live == bake). `ARCHITECTURE.md §8`. *(Was Y=0 + polygonOffset —
 * inert on 3/4 surfaces → the ground z-fought in the slab; fixed 2026-06-17.)*
 *
 * AO lightmap is a follow-on pass (see `bake-ground-ao.js`, separate task).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { clipAllToStencil, LAND_USE_COLORS } from '../src/lib/ribbonsGeometry.js'
import { writeIfChanged } from './io.js'
import { assertBakeTarget } from './bake-target.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'
import { loadSceneStencil as _loadSceneStencil } from './sceneStencil.js'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'  // the ONE smoothing knob — bake matches the live Survey render (WYSIWYG; SKELETON.md §3.5)
import { buildPathRibbons } from '../src/lib/buildPathRibbons.js'
import { buildParkPathRings, mergeRings } from '../src/lib/parkPaths.js'  // park-path partition + clip (shared with the 2D Designer + LafayettePark — one SSoT)
import { loadSceneTerrain } from './terrainLoad.js'  // per-scene terrain SSoT (cartograph/data/<scene>/clean/terrain.*); one sampler + one V_EXAG shared with the runtime
import { BAND_COLORS, CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS, BAND_TO_LAYER } from '../src/cartograph/m3Colors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// -- Adaptive ground-subdivision knobs (the mobile tri-budget lever) --------
//
// The flat (Y=0) baked ground is lifted per-vertex at runtime by the terrain
// sampler (src/lib/terrainCommon.js makeElevationSampler, V_EXAG=1.5); a
// triangle interior interpolates that lift LINEARLY, so a long edge only
// introduces visible error where the terrain *curves* under it. The legacy
// refine split EVERY face triangle whose edge exceeded one global 15 m target
// -- carpet-bombing the large, near-flat land-use fills (park/residential/
// recreation = 80% of the mesh) even though LS terrain is locally planar
// (median ~1.4 cm deviation over a 30 m edge) almost everywhere.
//
// GROUND_REFINE="adaptive" (default) swaps the uniform edge test for a
// terrain-deviation test: split only where the heightfield bends enough that a
// coarser triangle would lift its interior off the terrain by more than
// GROUND_REFINE_TOL_M. Flat blocks stay coarse; the steep park band stays fine.
// "uniform" restores the exact legacy behavior. All thread through
// bakeGround(opts.refine) below, gated on opts.* (NEVER process.env -- a
// browser-reachable process.env ref once crashed the whole tile build).
//
//   GROUND_REFINE_TOL_M      -- max terrain Y-deviation (m) a coarse triangle
//      may keep before it is split. The *uniform* mesh already carries p99
//      ~0.55 m / max ~14 m deviation (its 15 m edge cannot follow the steep
//      park band), so 0.30 m keeps the soft fills at or BELOW shipped fidelity (p99
//      ~0.36 m < the uniform mesh's 0.55 m) while halving the tri count.
//   GROUND_REFINE_MIN_EDGE_M -- never split below this even if tol says to.
//   GROUND_REFINE_MAX_EDGE_M -- hard coarse cap: ALWAYS split longer edges so
//      dense coplanar overlays keep a face vertex within range.
const GROUND_REFINE            = "adaptive";
const GROUND_REFINE_TOL_M      = 0.50;
const GROUND_REFINE_MIN_EDGE_M = 6;
const GROUND_REFINE_MAX_EDGE_M = 64;
// Hardscape overlays routed through refine (parking_lot/pitch) keep fine spacing.
const HARDSCAPE_REFINE_MAX_EDGE_M = 15;
// Park gravel paths get DENSE even sampling (vs adaptive's coarse tol/minEdge
// floor) so they ride the rolling park contour. Tiny group → cost negligible.
const PATH_CONTOUR_REFINE_MAX_EDGE_M = 6;

// [z-fight fix 2026-06-17] Per-group geometric Y separation — the resolver for
// coplanar ground groups under the production logarithmicDepthBuffer canvas
// (where polygonOffset is inert). Y = renderOrder × GROUND_Y_EPS, ascending with
// paint order, so the higher-painted layer sits physically on top. The runtime
// terrain lift is additive, so this micro-Y survives displacement. Matches the
// live Designer's ladder (asphalt slot ≈ 0.040 m). Operator-tunable; eye-gated:
// too small ties under mobile linear-depth at altitude, too large shows a lip at
// grazing angles where curb meets asphalt. ARCHITECTURE §8.
const GROUND_Y_EPS = 0.002;   // metres per renderOrder slot (~5 cm over ~26 groups)

// Terrain sampler for the adaptive path -- built once from the SSoT
// (src/lib/terrainCommon.js makeElevationSampler + V_EXAG), so the bake-time
// deviation test uses the EXACT sampler and exaggeration the runtime vertex
// shader applies. No hand-rolled copy → the mesh auto-recalibrates if V_EXAG
// ever changes. `getElevation(x,z)` is raw × V_EXAG (world-space lift in m).
// false if the heightmap is absent.
let _terrainSampler = null;
function getTerrainSampler(scene) {
  if (_terrainSampler !== null) return _terrainSampler;
  const t = loadSceneTerrain(scene);
  _terrainSampler = t ? t.getElevation : false;  // false → scene has no terrain (bake flat)
  return _terrainSampler;
}

// The stencil's SSoT is the EXTENT tool (neighborhood_boundary.json); the
// derivation moved to ./sceneStencil.js at T-landscape (2026-07-15) so bake-landscape
// cuts the mountain with the EXACT polygon the ground clips to, not a copy.
const loadSceneStencil = (scene) => _loadSceneStencil(ROOT, scene)

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
  'underived',
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
  // derive.js's "no OSM polygon and no assessor parcel covered this face"
  // class (`parcel-landuse.mjs` UNDERIVED). ⚠️ PAINT_ORDER is an ALLOW-LIST:
  // a face class absent from it lands in byFaceUse under a key no ['face',…]
  // entry consumes and drops silently from the slab — that is exactly how the
  // divided median vanished (see the [G4] note below). Any new LU class must
  // be added here AND to TREELAWN_LU_VARIANTS above.
  ['face', 'underived'],
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
  // Grade-separated roads sit ABOVE the land-use faces (so the freeway shows in its
  // corridor, not buried under the LU perimeter fill) but BELOW the local ribbon
  // network below (treelawn/sidewalk/curb/asphalt occlude them at crossings) —
  // "behind everything else, cut off at the edge of everything else".
  ['mat', 'highway'],
  // Ribbons stacked from outside → inside
  ['mat', 'lawn'],
  // Per-LU treelawn variants (treelawn:<lu>) — match adjacent parcel
  // colour. Bare 'treelawn' kept for fallback (dead-end caps, etc.).
  ...TREELAWN_LU_VARIANTS.map(lu => ['mat', `treelawn:${lu}`]),
  ['mat', 'treelawn'],
  ['mat', 'sidewalk'],
  ['mat', 'curb'],
  ['mat', 'asphalt'],
  ['mat', 'median'],
  // Alley + path ribbons painted on top of streets where they cross.
  ['mat', 'alley'],
  ['mat', 'footway'],
  ['mat', 'cycleway'],
  ['mat', 'steps'],
  ['mat', 'path'],
  // Park footpaths (gravel) — clipped to the park polygon, painted on top of
  // the park grass face like the other path ribbons sit on the streets.
  ['mat', 'park_path'],
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

// Pack the tile construction's ring lists into the { byMaterial, byFaceUse }
// shape the bake consumes, reusing ringsToHoledPolys so annular bands keep
// their holes. Per-LU (M1/M2): the LU
// remainder routes to byFaceUse per class (face:<lu> → per-Look colour) and the
// treelawn routes to 'treelawn:<lu>' so it matches its block's land-use.
// Shares src/lib/tileGround.js with the live path.
function buildTileBakeShape(ribbons, design, stencilPolygon, surveyStreets = null, parkClip = null, scene = null) {
  const pr = buildTileGround(ribbons, {
    stencil: stencilPolygon,
    // Surface the ambiguous treelawn run-sides for the operator (bake-only).
    reportGlean: true,
    surveyStreets,
    curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : CURB_WIDTH,
    smooth: STREET_SMOOTH,   // the ONE knob — WYSIWYG with the live Survey curve-fit (SKELETON.md §3.5; was 0, 2026-06-04→revived 2026-06-14)
    blockLandUse: design.blockLandUse || null,
    cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
    cornerRadiusOverrides: (design.cornerRadiusOverrides && typeof design.cornerRadiusOverrides === 'object') ? design.cornerRadiusOverrides : null,
    cornerCornerRadiusOverrides: (design.cornerCornerRadiusOverrides && typeof design.cornerCornerRadiusOverrides === 'object') ? design.cornerCornerRadiusOverrides : null,
    // Per-fe (per-block) asphalt-width overrides authored in Survey/Measure.
    blockCustoms: (design.blockCustoms && typeof design.blockCustoms === 'object') ? design.blockCustoms : null,
    // THE WALL · Phase D — emit the frozen per-tile shape artifact for bake serialization.
    emitArtifact: true,
  })
  // ── [A07] THE PRODUCER DISCLOSURE — once per pour, and the two kinds apart ──
  // The docs promise one curb producer ("a concentric offset"). There are two.
  // This is where the operator of a town nobody has inspected finds that out.
  if (pr._curbProducers) console.log(`  [A07] ${pr._curbProducers.line}`)
  // ⛔ Reported SEPARATELY and only when non-zero. A degenerate offset is a
  // FAILURE; the carve counts above are correct answers. Merging them would put
  // the real signal behind ~40 routine lines a pour, which is a new silence.
  const curbFail = pr._curbProducerFailures
  if (curbFail?.count) console.warn(curbFail.report(scene))
  const byMaterial = new Map()
  const byFaceUse = new Map()
  const pushClipperRings = (key, rings) => {
    if (!rings || !rings.length) return
    if (!byMaterial.has(key)) byMaterial.set(key, [])
    for (const p of ringsToHoledPolys(rings)) byMaterial.get(key).push(p)
  }
  pushClipperRings('asphalt',  pr.asphalt)
  pushClipperRings('highway',  pr.highway)   // grade-separated highway-class roads → own layer/material
  pushClipperRings('curb',     pr.curb)
  pushClipperRings('sidewalk', pr.sidewalk)
  for (const [lu, rings] of Object.entries(pr.treelawnByLu)) pushClipperRings(`treelawn:${lu}`, rings)
  for (const [lu, rings] of Object.entries(pr.luByClass)) {
    // [G4] The divided median is a derived face in luByClass, but it bakes as a
    // `mat` group ('median'): colored from layerColors['median'], gated by
    // layerVis['median'], grass-shaded by BakedGround (GRASS_MATERIALS). Route it
    // to byMaterial so PAINT_ORDER's ['mat','median'] paints it. Without this it
    // lands in byFaceUse under a 'median' key that no ['face',…] entry consumes,
    // so the median silently dropped from every slab. Other LU classes stay
    // faces (byFaceUse → luColors).
    if (lu === 'median') { pushClipperRings('median', rings); continue }
    const polys = ringsToHoledPolys(rings)
    if (polys.length) byFaceUse.set(lu, (byFaceUse.get(lu) || []).concat(polys))
  }
  // Non-street ribbons (alleys + footway/cycleway/steps/path). The Designer
  // renders these live (BlockGeometryV2Debug → buildPathRibbons), but the bake
  // dropped them: the call lived ONLY in the figure-ground path (deleted at T4)
  // and the tile migration never carried it here, so the slab
  // shipped with no alley/footway/path groups (DOC-CODE-COHERENCE C13). Mirror it
  // on the tile path. Clip to PARCEL INTERIORS (block − curb − treelawn −
  // sidewalk) so paths stop at the sidewalk's inner edge; exclude park (its paths
  // render gravel-shaded via LafayettePark.jsx — a baked duplicate pokes through).
  // layerVis gating happens downstream at PAINT_ORDER, same as every other group.
  {
    const subtract = []
    for (const r of (pr.curb || [])) if (r?.length >= 3) subtract.push(r)
    for (const rings of Object.values(pr.treelawnByLu || {})) for (const r of rings) if (r?.length >= 3) subtract.push(r)
    for (const r of (pr.sidewalk || [])) if (r?.length >= 3) subtract.push(r)
    for (const r of (pr.luByClass?.park || [])) if (r?.length >= 3) subtract.push(r)
    const blockRings = (pr.block || []).filter(r => r?.length >= 3)
    const parcelInteriors = (subtract.length && blockRings.length) ? differenceRings(blockRings, subtract) : blockRings
    for (const [kind, rings] of buildPathRibbons(ribbons, {
      intersect: parcelInteriors,
      alleyCap: ['square', 'rounded', 'round'].includes(design.alleyCap) ? design.alleyCap : 'square',
    })) {
      pushClipperRings(kind, rings)
    }
  }

  // Park footpaths → the `park-path` gravel group, clipped to the park
  // polygon INTERIOR (the mirror of how neighborhood paths clip to parcel
  // interiors and EXCLUDE the park above — so the two partition cleanly off
  // the SAME polygon, no double-render). Land paths only: bridges (paths over
  // water) are excluded here and rendered as a lifted overlay (LafayettePark)
  // until the Phase-5 off-the-ground-paths arc makes bridges first-class.
  // Same ribbons.paths, same shared lib — the old park-path fork is dead.
  if (parkClip?.polygon?.corners) {
    // LAND park paths → the `park_path` gravel group, clipped to the park
    // polygon relaxed to the perimeter sidewalk's inner edge (shared SSoT;
    // see src/lib/parkPaths.js). Bridges are excluded (lifted overlay until
    // Phase 5). Same ribbons.paths, same shared lib — the old fork is dead.
    const { land } = buildParkPathRings(ribbons, { polygon: parkClip.polygon, water: parkClip.water })
    pushClipperRings('park_path', mergeRings(land))
  }
  return { byMaterial, byFaceUse, shapeArtifact: pr._shapeArtifact, highwayRings: pr.highway || [] }
}

// T4 (2026-07-15): buildV2BakeShape — the figure-ground bake path — deleted.
// It had been dead-in-place since T2 (buildTileBakeShape replaced it); the
// replace-then-delete second half, per ARCHITECTURE §7.

// Triangulate one polygon (outer ring + optional hole rings) and OPTIONALLY
// refine the triangulation by iteratively splitting any triangle whose longest
// edge exceeds `maxEdge` meters. 1-to-4 midpoint subdivision: a triangle with
// a long edge is split into four child triangles sharing the original
// winding (preserves CW-facing-up convention so FrontSide shading stays
// correct). Each midpoint is added as a Steiner point inside the polygon —
// since midpoints of edges that lie inside the polygon also lie inside, this
// is geometrically safe for any concave land-use polygon.
//
// Why: per-vertex `patchTerrain` at runtime samples the terrain texture only
// at each baked vertex; fragments interpolate between them. Face polygons
// authored at block scale (~50 m corner-to-corner) only sample raw at four
// places per block, so interior fragments interpolate linearly across a
// distance where the heightfield actually curves — causing dense overlays
// (asphalt centerlines, building foundations anchored to footprint vertices)
// to disagree with the face's interpolated Y at the same XZ. Subdividing
// face polygons to ~5–8 m edges matches the terrain texture resolution and
// pulls the face's rendered surface back onto the heightfield.
//
// Winding: ShapeUtils emits CCW in (x, z) 2D, which is CW when mapped to
// (x, 0, z) viewed from +Y. Flip the index order at emit time.
function triangulateAndRefine(outer, holes, refine, yLift = 0) {
  // Build position list: contour vertices first, then each hole, in the
  // order ShapeUtils.triangulateShape expects. yLift = the group's coplanar
  // Y separation (renderOrder × GROUND_Y_EPS); runtime terrain lift adds on top.
  const posList = []
  const pushRing = (ring) => {
    for (const [x, z] of ring) posList.push(x, yLift, z)
  }
  pushRing(outer)
  for (const h of holes) pushRing(h)

  // Initial triangulation
  const contourV = outer.map(([x, z]) => new THREE.Vector2(x, z))
  const holesV = holes.map(h => h.map(([x, z]) => new THREE.Vector2(x, z)))
  const tris = THREE.ShapeUtils.triangulateShape(contourV, holesV)
  // Apply CCW->CW flip up front; refinement preserves whatever winding it
  // starts with.
  let triList = tris.map(t => [t[0], t[2], t[1]])

  // Normalize the refine policy. Back-compat: a bare number (or null) is read
  // as the legacy uniform maxEdge so any unported caller still works.
  let mode, maxEdge, tol, minEdge, sampler
  if (refine && typeof refine === "object") {
    mode    = refine.mode || "uniform"
    maxEdge = refine.maxEdge
    tol     = refine.tol
    minEdge = refine.minEdge || 0
    sampler = refine.sampler || null
  } else {
    mode    = "uniform"
    maxEdge = refine
    minEdge = 0
  }
  // Adaptive needs a sampler; without one it degrades to a pure maxEdge cap.
  if (mode === "adaptive" && (!sampler || !(tol > 0))) mode = "uniform"

  const hasCap = maxEdge && maxEdge > 0 && Number.isFinite(maxEdge)
  if (mode === "uniform" && !hasCap) {
    // No refinement requested -- emit the earcut output as-is.
    const positions = new Float32Array(posList)
    const indices = new Uint32Array(triList.length * 3)
    for (let i = 0; i < triList.length; i++) {
      indices[i * 3]     = triList[i][0]
      indices[i * 3 + 1] = triList[i][1]
      indices[i * 3 + 2] = triList[i][2]
    }
    return { positions, indices }
  }

  // Iterative CONFORMING refinement (red-green). Midpoint cache keyed by edge
  // gives adjacent triangles the same midpoint vertex INDEX; the red-green pass
  // below guarantees that whenever one triangle bisects a shared edge, its
  // neighbour conforms (green 1-to-2 closure, or promotion to red) — so no
  // vertex is ever left in the middle of a neighbour's edge. A plain
  // per-triangle 1-to-4 split (the old code) left exactly those T-junctions at
  // every adaptive refined/coarse boundary, opening up-to-`tol` vertical cracks
  // along the contours — invisible from overhead, glaring at street level.
  const maxEdgeSq = hasCap ? maxEdge * maxEdge : Infinity
  const minEdgeSq = minEdge * minEdge
  const midCache = new Map()
  function midpointIndex(a, b) {
    const key = a < b ? a + "-" + b : b + "-" + a
    let idx = midCache.get(key)
    if (idx !== undefined) return idx
    const ax = posList[a * 3],     az = posList[a * 3 + 2]
    const bx = posList[b * 3],     bz = posList[b * 3 + 2]
    idx = posList.length / 3
    posList.push((ax + bx) * 0.5, yLift, (az + bz) * 0.5)
    midCache.set(key, idx)
    return idx
  }
  function edgeSq(a, b) {
    const dx = posList[a * 3]     - posList[b * 3]
    const dz = posList[a * 3 + 2] - posList[b * 3 + 2]
    return dx * dx + dz * dz
  }
  // Terrain-deviation of a triangle (a,b,c): the worst |true terrain lift -
  // planar interpolation of the three corner lifts| over the three edge
  // midpoints + the centroid. These are exactly the points a one-level 1-to-4
  // split would introduce, so this measures the Y error the split would heal.
  function terrainDev(a, b, c) {
    const ax = posList[a*3], az = posList[a*3+2]
    const bx = posList[b*3], bz = posList[b*3+2]
    const cx = posList[c*3], cz = posList[c*3+2]
    const ya = sampler(ax, az), yb = sampler(bx, bz), yc = sampler(cx, cz)
    let d = 0
    let e
    e = Math.abs(sampler((ax+bx)/2,(az+bz)/2) - (ya+yb)/2); if (e > d) d = e
    e = Math.abs(sampler((bx+cx)/2,(bz+cz)/2) - (yb+yc)/2); if (e > d) d = e
    e = Math.abs(sampler((cx+ax)/2,(cz+az)/2) - (yc+ya)/2); if (e > d) d = e
    e = Math.abs(sampler((ax+bx+cx)/3,(az+bz+cz)/3) - (ya+yb+yc)/3); if (e > d) d = e
    return d
  }

  // Hard iteration cap (guard). A few extra passes for the steep adaptive
  // micro-spots; the minEdge floor stops genuine runaway.
  const PASSES = mode === "adaptive" ? 10 : 8
  const edgeKey = (a, b) => (a < b ? a + "-" + b : b + "-" + a)
  for (let pass = 0; pass < PASSES; pass++) {
    // (1) Criterion → initial RED set (triangles to fully 1-to-4 split).
    const red = new Array(triList.length).fill(false)
    let anyRed = false
    for (let i = 0; i < triList.length; i++) {
      const [v0, v1, v2] = triList[i]
      const e01 = edgeSq(v0, v1)
      const e12 = edgeSq(v1, v2)
      const e20 = edgeSq(v2, v0)
      const longest = Math.max(e01, e12, e20)
      let split
      if (mode === "adaptive") {
        // Always split monstrous edges (the coarse cap keeps overlays anchored);
        // otherwise split only where the terrain bends past tol AND the longest
        // edge is still above the minEdge floor.
        split = longest > maxEdgeSq ||
                (longest > minEdgeSq && terrainDev(v0, v1, v2) > tol)
      } else {
        split = e01 > maxEdgeSq || e12 > maxEdgeSq || e20 > maxEdgeSq
      }
      if (split) { red[i] = true; anyRed = true }
    }
    if (!anyRed) break

    // (2) Per-triangle edge keys.
    const triEdges = triList.map(([v0, v1, v2]) => [
      edgeKey(v0, v1), edgeKey(v1, v2), edgeKey(v2, v0),
    ])

    // (3) Conformity: an edge is "bisected" if any owning triangle is red. A
    // non-red triangle carrying >=2 bisected edges is promoted to red (so it
    // never needs a 3-way closure). Promotion adds bisected edges → iterate to
    // a fixpoint. Terminates: each triangle promotes at most once.
    const bisected = new Set()
    const markRed = (i) => { for (const k of triEdges[i]) bisected.add(k) }
    for (let i = 0; i < triList.length; i++) if (red[i]) markRed(i)
    let promoted = true
    while (promoted) {
      promoted = false
      for (let i = 0; i < triList.length; i++) {
        if (red[i]) continue
        let cnt = 0
        for (const k of triEdges[i]) if (bisected.has(k)) cnt++
        if (cnt >= 2) { red[i] = true; markRed(i); promoted = true }
      }
    }

    // (4) Emit. RED → 1-to-4. Non-red with exactly one bisected edge → GREEN
    // 1-to-2 closure toward the opposite vertex (the new edge is interior, so
    // it introduces no fresh T-junction). Non-red with zero → kept as-is.
    const next = []
    for (let i = 0; i < triList.length; i++) {
      const [v0, v1, v2] = triList[i]
      if (red[i]) {
        const m01 = midpointIndex(v0, v1)
        const m12 = midpointIndex(v1, v2)
        const m20 = midpointIndex(v2, v0)
        next.push([v0, m01, m20], [m01, v1, m12], [m20, m12, v2], [m01, m12, m20])
        continue
      }
      const [k01, k12, k20] = triEdges[i]
      if (bisected.has(k01)) {
        const m = midpointIndex(v0, v1)
        next.push([v0, m, v2], [m, v1, v2])
      } else if (bisected.has(k12)) {
        const m = midpointIndex(v1, v2)
        next.push([v0, v1, m], [v0, m, v2])
      } else if (bisected.has(k20)) {
        const m = midpointIndex(v2, v0)
        next.push([v0, v1, m], [m, v1, v2])
      } else {
        next.push(triList[i])
      }
    }
    triList = next
  }

  const positions = new Float32Array(posList)
  const indices = new Uint32Array(triList.length * 3)
  for (let i = 0; i < triList.length; i++) {
    indices[i * 3]     = triList[i][0]
    indices[i * 3 + 1] = triList[i][1]
    indices[i * 3 + 2] = triList[i][2]
  }
  return { positions, indices }
}

// Group input items into one material's BufferGeometry data. `items` is
// either an array of rings (ribbon bands — simple polygons) or an array
// of {outer, holes} faces (land-use fills, post-clip). `opts.maxEdge`
// triggers per-polygon refinement (face polygons + landscape overlays).
//
// Y per vertex = `yLift` (the group's coplanar separation, renderOrder × EPS);
// the terrain-aware lift adds on top at runtime in the vertex shader (patchTerrain
// perVertex via texture sampling at each vertex's world XZ).
function itemsToBuffers(items, { maxEdge = null, refine = null, yLift = 0 } = {}) {
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
  if (polys.length === 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) }

  // Triangulate (and optionally refine) each polygon independently, then
  // concatenate with vertex offsets.
  const perPoly = polys.map(p => triangulateAndRefine(p.outer, p.holes, refine || maxEdge, yLift))
  let totalV = 0, totalI = 0
  for (const r of perPoly) { totalV += r.positions.length / 3; totalI += r.indices.length }

  const positions = new Float32Array(totalV * 3)
  const indices = new Uint32Array(totalI)
  let vOff = 0, iOff = 0
  for (const r of perPoly) {
    positions.set(r.positions, vOff * 3)
    for (let i = 0; i < r.indices.length; i++) indices[iOff + i] = r.indices[i] + vOff
    vOff += r.positions.length / 3
    iOff += r.indices.length
  }
  return { positions, indices }
}

export async function bakeGround({ look, scene = 'lafayette-square', refine: refineOpts = {} } = {}) {
  // Adaptive ground-subdivision policy, resolved from opts.* over the module
  // defaults. GATED ON opts.* (NEVER process.env). refineOpts = {} keeps the
  // adaptive default; pass { mode: 'uniform' } to restore the legacy mesh, or
  // override tol/minEdge/maxEdge to retune the tri budget.
  const refineMode    = refineOpts.mode    || GROUND_REFINE
  const refineTol     = refineOpts.tol     != null ? refineOpts.tol     : GROUND_REFINE_TOL_M
  const refineMinEdge = refineOpts.minEdge != null ? refineOpts.minEdge : GROUND_REFINE_MIN_EDGE_M
  const refineMaxEdge = refineOpts.maxEdge != null ? refineOpts.maxEdge : GROUND_REFINE_MAX_EDGE_M
  const refineSampler = refineMode === 'adaptive' ? getTerrainSampler(scene) : null
  // Bake-target guards — phantom-look + SCENE≠LOOK. Both were written here, inline
  // (2026-06-01 and 2026-07-21), each after a lost session; four other bakers never
  // got them. Hoisted to ./bake-target.js so the rule has ONE home. Refuses BEFORE
  // any write.
  assertBakeTarget('bake-ground', look, scene)
  // Ribbons input is scene-keyed. LS still publishes to the canonical
  // src/data/ribbons.json (promote-ribbons.js writes there); other scenes
  // author/derive their own ribbon fixture under src/data/<scene>/.
  // When promote-ribbons becomes fully scene-keyed (Phase 0e), this can
  // collapse to a single path template.
  // Default installation keeps the bundled src/data/ribbons.json; every other
  // installation reads the scene-scoped ribbons promote-ribbons.js writes (and
  // serve.js serves) under cartograph/data/<scene>/clean/.
  const ribbonsPath = scene === 'lafayette-square'
    ? join(ROOT, 'src', 'data', 'ribbons.json')
    : join(ROOT, 'cartograph', 'data', scene, 'clean', 'ribbons.json')
  const mapPath     = join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json')
  const designPath  = join(ROOT, 'public', 'looks', look, 'design.json')
  const outDir      = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const stencil = loadSceneStencil(scene)

  const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf-8'))
  // Raw survey (per-street `source` tag) — drives the glean valley/assessor
  // surface report. Optional; absent → the report omits source tags.
  const surveyPath = join(ROOT, 'cartograph', 'data', scene, 'raw', 'survey.json')
  const surveyStreets = existsSync(surveyPath)
    ? (JSON.parse(readFileSync(surveyPath, 'utf-8')).streets || null) : null
  const mapData = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf-8')) : { layers: {} }
  const design  = existsSync(designPath) ? JSON.parse(readFileSync(designPath, 'utf-8')) : {}
  // Park footpaths: the clip polygon + water (the bridge split) for the
  // `park-path` group. Scene-keyed; absent → no park-path group emitted.
  // (Water-overlap bridge detection is a Phase-1 stopgap — Phase 5 carries
  // an OSM bridge tag onto paths and bakes bridges as a lifted group.)
  const parkPolyPath  = join(ROOT, 'cartograph', 'data', scene, 'clean', 'park-polygon.json')
  // Per-hood water: src/data/<scene>/park_water.json for every scene (LS's used
  // to live at the un-scoped src/data/park_water.json; normalized 2026-07-16).
  const parkWaterPath = join(ROOT, 'src', 'data', scene, 'park_water.json')
  const parkClip = existsSync(parkPolyPath) ? {
    polygon: JSON.parse(readFileSync(parkPolyPath, 'utf-8')),
    water: existsSync(parkWaterPath) ? JSON.parse(readFileSync(parkWaterPath, 'utf-8')) : null,
  } : null
  const designLayerColors = design.layerColors || {}
  const designLuColors    = design.luColors    || {}
  // C5 — LS cutover: the ring-band emitter (keeper) is now on for all
  // scenes. Legacy per-leg emitter is dead (else-branch removed in C5
  // commit 3).
  // ALL scenes (LS included) bake from the tile construction. The figure-ground
  // path was deleted at T4 (2026-07-15). A scene is a dataset, not a code path.
  const { byMaterial, byFaceUse, shapeArtifact, highwayRings } = buildTileBakeShape(ribbons, design, stencil.clipPolygon, surveyStreets, parkClip, scene)

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

  // Polygon groups (large land-use blocks + leisure/natural overlays) get
  // refined to a per-vertex spacing that matches the terrain texture so
  // runtime patchTerrain perVertex no longer linear-interpolates across
  // 50 m block-corner samples. Ribbon bands (asphalt/curb/sidewalk/etc.)
  // are already dense at the centerline so they bypass refinement —
  // their existing vertex density captures the local heightfield fine.
  const LANDSCAPE_OVERLAY_KEYS = new Set([
    'parking_lot', 'garden', 'playground', 'swimming_pool',
    'pitch', 'sports_centre', 'wood', 'scrub',
  ])
  // Ribbon groups that cross ROLLING terrain and must follow the contour.
  // Ribbons normally bypass refinement (their authored density matches FLAT
  // blocks), but the park gravel paths run over the park's hill — with no
  // refinement the sparse OSM vertices get terrain-displaced only at segment
  // endpoints, so each straight chord knifes through the rolling grass (the
  // "paths don't follow the contour" artifact, 2026-06-28). Give them a dense
  // uniform sampling (PATH_CONTOUR_REFINE_MAX_EDGE_M) so a vertex lands every
  // few metres along the run. (Conforming red-green refinement keeps the
  // path/grass boundary crack-free.)
  const CONTOUR_REFINE_KEYS = new Set(['park_path'])

  // Bake only ACTIVATED layers: skip any group the operator has hidden
  // (layerVis=false). The slab then carries only what renders — smaller
  // ground.bin, less GPU, no dead groups. Mirrors BakedGround.isGroupVisible
  // exactly (faces key off `lu-<id>`; materials off BAND_TO_LAYER, else self),
  // so the bake omits precisely what the runtime would have hidden. (Re-showing
  // a layer dirties the geometry → it re-bakes at the Section→Stage gate, which
  // is the only place the slab/AO bake runs — not during design.)
  const bakeLayerVis = design.layerVis || {}
  const groupLayerId = (kind, key) => {
    if (kind === 'face') return 'lu-' + key
    const ci = key.indexOf(':')
    const bare = ci < 0 ? key : key.slice(0, ci)
    return BAND_TO_LAYER[bare] || bare
  }
  let renderOrder = 0
  for (const [kind, key] of PAINT_ORDER) {
    if (bakeLayerVis[groupLayerId(kind, key)] === false) continue
    // Faces are {outer, holes} entries (post-clip); ribbons are bare rings.
    // itemsToBuffers normalizes both — holes are honored at triangulation
    // time so the lawn ribbon underneath a clipped face fill stays visible.
    const items = kind === 'face' ? byFaceUse.get(key) : byMaterial.get(key)
    if (!items || items.length === 0) continue
    // Tiering: large soft land-use FILLS (faces) take the adaptive policy --
    // that is where the budget lives and where coarse triangles are least
    // visible. Landscape overlays keep the legacy fine uniform spacing
    // (crisp-edged, tiny budget). Ribbon bands bypass refinement entirely.
    const isSoftFill = kind === 'face'
    const isHardOverlay = LANDSCAPE_OVERLAY_KEYS.has(key)
    const isContourRibbon = CONTOUR_REFINE_KEYS.has(key)   // park_path: rides the park hill
    let refinePolicy = null
    if (isSoftFill) {
      // GATE THE FINE REFINE ON TERRAIN. Subdividing a flat land-use fill exists ONLY
      // to give the runtime terrain-lift enough vertices to bend the face over the DEM.
      // With NO terrain the fill is dead flat, so a fine mesh is pure waste — it blew
      // Altadena's ground up to 23.6M tris / 432 MB of inert flat squares (2026-07-14).
      // Terrain present → adaptive (fine, follows the DEM). No sampler → emit only the
      // coarse structural cap (GROUND_REFINE_MAX_EDGE_M, the overlay-vertex-range floor),
      // NEVER the fine terrain-seed mesh.
      refinePolicy = refineMode === 'adaptive' && refineSampler
        ? { mode: 'adaptive', sampler: refineSampler, tol: refineTol, minEdge: refineMinEdge, maxEdge: refineMaxEdge }
        : { mode: 'uniform', maxEdge: GROUND_REFINE_MAX_EDGE_M }
    } else if (isContourRibbon) {
      // Dense, EVEN sampling so the path follows the contour. Adaptive's
      // tol(0.5)/minEdge(6) floor barely split it — a long straight OSM run can
      // bow under 0.5 m per 6 m yet still knife through the rolling park over its
      // full length. A small uniform maxEdge guarantees a vertex every few metres.
      refinePolicy = { mode: 'uniform', maxEdge: PATH_CONTOUR_REFINE_MAX_EDGE_M }
    } else if (isHardOverlay) {
      refinePolicy = { mode: 'uniform', maxEdge: HARDSCAPE_REFINE_MAX_EDGE_M }
    }
    // yLift = this group's coplanar Y separation (the resolver under log-depth).
    // `renderOrder` here is the slot this group is about to take (renderOrder++
    // below), ascending with PAINT_ORDER, so Y agrees with paint order.
    const { positions, indices } = itemsToBuffers(items, { refine: refinePolicy, yLift: renderOrder * GROUND_Y_EPS })
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
      // polygonOffsetUnits — RETAINED for back-compat + the mobile linear-depth
      // path, but it is INERT under the log-depth canvases (the per-group Y above
      // is the real coplanar resolver now). The consumer no longer applies it.
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

  // Bake bbox anchored to stencil.center so the AO baker's texel→world map and
  // BakedGround's UV2 stay concentric with face/street fades. The half-extent must
  // ENCLOSE the silhouette: both consumers map texel→world THROUGH this bbox, so a
  // bbox smaller than the ground mis-maps every texel rather than cropping.
  //
  // FLOORED at the disc radius (same defect cured in pipeline.js, b54cbaae):
  // streetFade is a LOOK band and nothing stops a scene authoring one narrower than
  // its own disc, on which the bare `streetFade.outer` under-sizes the bake. Every
  // scene today is radius+160 except LS (1000 vs 892, authored), so no scene reveals
  // it — a kit defect by construction.
  //
  // ⛔ NO FALLBACK. This read `?? 1000` — presented as "the prior hardcoded default",
  // it was DEAD: loadSceneStencil coerces an absent radius to 1 (`sceneStencil.js:35`
  // `s.radius || 1`), so the `??` never fired and a scene with no authored extent
  // baked a 51 m bbox — silently, and looking like a successful bake. That 1 is the
  // absent signal here; a real hood is never 1 m. ⚠️ The coercion itself is the
  // deeper defect and it lives one layer up, in sceneStencil.js.
  const _fadeOuter = Number.isFinite(stencil.streetFade?.outer) ? stencil.streetFade.outer : null
  const _discR = Number.isFinite(stencil.radius) && stencil.radius > 1 ? stencil.radius : null
  if (_fadeOuter === null && _discR === null) {
    console.error(`
⛔ scene '${scene}' has no authored extent (no streetFade.outer, no radius > 1)
   in cartograph/data/${scene}/neighborhood_boundary.json.

   The bake bbox anchors the AO texel→world map and BakedGround's UV2. Baking
   without an extent produces a 51 m bbox and a mis-mapped ground that still
   writes a manifest and reads as a successful bake. Author the boundary first.
`)
    process.exit(1)
  }
  const _bakeHalf = Math.max(_fadeOuter ?? 0, _discR ?? 0) + 50
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
  // THE WALL · Phase D — serialize the frozen shape artifact: the per-tile shape
  // sectionPass consumes (iA, runs+measure, vertR, tl/sw, lu, tips), the single
  // source Section reads with no chain. Additive — ground.json/bin are unchanged.
  // [G1] Wrap the per-tile artifact + the top-level grade-sep highway rings as a
  // sibling group ({ tiles, highway }) so the frozen Section/Design views restore
  // highways (the bare-array form dropped them — regression 4924d9a). The slab's
  // own `highway` mat group is unaffected; this is the Section-side freeze.
  if (shapeArtifact) writeIfChanged(join(outDir, 'shape.json'), JSON.stringify({ tiles: shapeArtifact, highway: highwayRings || [] }))

  const sizeKb = (buf.byteLength / 1024).toFixed(1)
  const totalTris = groups.reduce((s, g) => s + g.indexCount / 3, 0)
  const totalVerts = groups.reduce((s, g) => s + g.vertexCount, 0)
  console.log(`[bake-ground] look=${look}: ${groups.length} groups, ${totalVerts} verts, ${totalTris} tris, ${sizeKb} KB`)
  return manifest
}

// CLI
async function main() {
  let look = null, scene = 'lafayette-square'
  const refine = {}
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))         look  = m[1]
    else if ((m = arg.match(/^--scene=(.+)$/)))   scene = m[1]
    // Adaptive ground-subdivision overrides (gated on argv/opts, never env):
    else if ((m = arg.match(/^--refine=(.+)$/)))  refine.mode    = m[1]            // adaptive | uniform
    else if ((m = arg.match(/^--refine-tol=(.+)$/)))     refine.tol     = parseFloat(m[1])
    else if ((m = arg.match(/^--refine-min-edge=(.+)$/)))refine.minEdge = parseFloat(m[1])
    else if ((m = arg.match(/^--refine-max-edge=(.+)$/)))refine.maxEdge = parseFloat(m[1])
  }
  await bakeGround({ look, scene, refine })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
