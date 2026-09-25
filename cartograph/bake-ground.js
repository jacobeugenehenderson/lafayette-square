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
 * Coplanar stacking: ⛔ **NOT EVERY GROUP.** The land-use `face` groups are a
 * PARTITION (measured: zero overlapping interiors across 23 km²) and all bake to
 * SLOT 0 — one plane — because separating surfaces that never overlap caused the
 * fighting it was meant to prevent. ⛔ And on contoured ground a millimetre
 * separation is arithmetically unavailable at any value: the DEM displacement is
 * interpolated per-triangle, so differently-tessellated layers disagree about the
 * ground by up to 1.6 m against a 2 mm gap. Full canon + the measurements:
 * ARCHITECTURE §8 "Layering / coplanar stacking", ZEROTH RULE.
 * RIBBON/overlay groups — which genuinely DO overlap — get a tiny geometric
 * **Y = renderOrder × EPS** separation (`GROUND_Y_EPS`) — the only mechanism that
 * works among them under the
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
import clipperLib from 'clipper-lib'
import { assertBakeTarget } from './bake-target.js'
import { conformAndRefine, findTJunctions } from './groundConformity.js'
import { requireExplicitMap } from './scene.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'
import { loadSceneStencil as _loadSceneStencil } from './sceneStencil.js'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'  // the ONE smoothing knob — bake matches the live Survey render (WYSIWYG; SKELETON.md §3.5)
import { buildPathRibbons } from '../src/lib/buildPathRibbons.js'
import { buildParkPathRings, mergeRings } from '../src/lib/parkPaths.js'  // park-path partition + clip (shared with the 2D Designer + LafayettePark — one SSoT)
import { loadSceneTerrain } from './terrainLoad.js'  // per-scene terrain SSoT (cartograph/data/<scene>/clean/terrain.*); one sampler, at the TOWN'S AUTHORED exag, shared with the runtime
import { BAND_COLORS, CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS, BAND_TO_LAYER } from '../src/cartograph/m3Colors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// -- Adaptive ground-subdivision knobs (the mobile tri-budget lever) --------
//
// The flat (Y=0) baked ground is lifted per-vertex at runtime by the terrain
// sampler (src/lib/terrainCommon.js makeElevationSampler at the town's authored exag); a
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
// (src/lib/terrainCommon.js makeElevationSampler + the town's AUTHORED exag), so the
// bake-time deviation test uses the EXACT sampler and exaggeration the runtime vertex
// shader applies. No hand-rolled copy → the mesh auto-recalibrates when a town's
// terrainExag changes. `getElevation(x,z)` is raw × that exag (world-space lift in m).
// ⛔ Re-bake the ground after changing terrainExag: refinement subdivides where the
// heightfield BENDS, and how much it bends is a function of the exaggeration.
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
// ⭐ THE LU CLASS SET, and it is NOT a list to retype. `derive.js`'s `OSM_TO_LU`
// values ∪ `parcel-landuse.mjs` ∪ the emergent faces (`median`, `island`) —
// widened 2026-09-20 with `cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`. ⛔ A class missing here AND
// from PAINT_ORDER below drops silently from the slab; that is how the divided
// median vanished. `checks/claims-every-lu-tag-has-a-home.mjs` fails if a class
// `OSM_TO_LU` can emit is absent from either.
const TREELAWN_LU_VARIANTS = [
  'residential', 'commercial', 'vacant', 'vacant-commercial', 'parking',
  'institutional', 'recreation', 'industrial', 'park', 'island', 'unknown',
  'underived',
  'brownfield', 'agricultural', 'orchard', 'forest', 'wetland', 'beach',
  'bare', 'cemetery', 'railway', 'verge',
]
// OSM's `water=*` refinement of `natural=water`. ⭐ A pond is not a lake is not
// a settling basin; they are carried separately so a town can shade them
// differently without a re-pour. ⛔ NOT a skip list — every value here is drawn;
// the list exists because PAINT_ORDER is an allow-list.
const WATER_SUBTYPES = [
  'lake', 'pond', 'basin', 'reservoir', 'river', 'stream', 'canal', 'ditch',
  'lagoon', 'oxbow', 'moat', 'harbour', 'wastewater', 'fishpond', 'salt_pool',
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
  // Widened 2026-09-20 (`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`). Order inside the face band is
  // paint order among faces, which never overlap, so it carries no meaning beyond
  // determinism — the entries matter, the sequence does not.
  ['face', 'brownfield'],
  ['face', 'agricultural'],
  ['face', 'orchard'],
  ['face', 'forest'],
  ['face', 'wetland'],
  ['face', 'beach'],
  ['face', 'bare'],
  ['face', 'cemetery'],
  ['face', 'railway'],
  ['face', 'verge'],      // H-3: highway verge + a junction residual's remainder
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
  // ⭐⭐ WATER, APPENDED LAST — and the slot is deliberate on both counts.
  // · APPENDED, never inserted: renderOrder is positional, so slotting water in
  //   at the bottom (where a "floor" belongs) would renumber every group after
  //   it and shift the whole slab's coplanar Y ladder. Nothing is worth that.
  // · LAST IS ALSO CORRECT: water is the one TRANSPARENT ground group, and a
  //   transparent surface must draw after the opaque ones. It costs nothing in
  //   overlap terms because the water face does not overlap any land face —
  //   ① carves `bb − (WATER ∪ INK)` from the SAME rings emitted here
  //   (`tileGround.js`: `waterRings: coast.map(...)`), so the land ends exactly
  //   where the water begins. Coincident edges, never coplanar overlap.
  // ⚠️ Its baked Y is `renderOrder × GROUND_Y_EPS` ≈ 9 cm above the datum. Water
  // is a LEVEL SURFACE at one elevation, not a draped one (the lake does not
  // follow the ground; the ground rises out of it), so the runtime must not
  // patchTerrain it — see BakedGround's WaterMesh.
  ['mat', 'water'],
  // ⭐ The `water=*` SUBTYPES. ⛔ PAINT_ORDER IS AN ALLOW-LIST — a key absent
  // from it drops SILENTLY (that is how the divided median vanished), so a
  // subtype with no slot here would delete a whole lake. Vocabulary measured
  // across the towns on disk (pond 71 · basin 19 · reservoir 5 · river 3 ·
  // lake 3 · stream 5) plus the OSM values adjacent to them. The unconsumed-key
  // report below is the backstop when OSM produces one nobody listed.
  ...WATER_SUBTYPES.map(w => ['mat', `water:${w}`]),
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
function buildTileBakeShape(ribbons, design, stencilPolygon, surveyStreets = null, parkClip = null, scene = null, opts = {}) {
  // ⭐⭐⭐ `--proto` MAKES ① THE PRODUCER. The frozen artifact is then built from ②③ — the curb
  // offset from the protopolygon and the bands struck from that curb — instead of from the chains.
  // ⛔ It is a change of CONSUMER, not of construction (`5560cf6a`'s lesson): ②③ already offset the
  // grout contour, so nothing new is built here; the bake simply freezes what they made.
  // ⛔ OFF BY DEFAULT. With the flag absent this call is byte-identical, which `a03-curb-identity`
  // proves on every commit.
  const PROTO = !!opts.proto   // from buildTileBakeShape's own opts, not the bake's
  // ⛔⛔ ① AS THE DEFAULT PRODUCER REQUIRES A SCENE THAT CAN ACTUALLY PRODUCE IT. Measured
  // 2026-09-06 the moment the default flipped: hipointe-demun has no frozen protopolygon and no
  // boundary, so it LIVE-MINTED ①, skipped the circle stamp, and baked 1103 tiles of the WHOLE
  // FRAME where it had 196 — a plausible-looking wrong map, which is the one outcome Layer 0 q2
  // names as worse than a failure. ⛔ And it destroyed the old artifact doing it: baked output is
  // not in git, so there was nothing to restore.
  // ⇒ REFUSE, LOUDLY, NAMING THE FIX. ⛔ Never fall back to the chain curb here: a silent legacy
  // bake under the current default is the same substitution in the other direction, and it is
  // exactly how `serve.js`'s flagless bake hid a day of ① work from the operator.
  if (PROTO) {
    const fp = ribbons?.protopolygon
    const why = !fp?.rings?.length ? 'it carries NO frozen protopolygon — it has not been poured since ① landed'
      : !fp.blocks?.length ? 'its frozen ① carries no `blocks` (boundary − stroked roads) — it was poured before the rim fix'
      : !fp.boundaryRing?.length ? 'its frozen ① carries no `boundaryRing`, so the circle could not be stamped and the bake would be the WHOLE FRAME'
      : null
    if (why) throw new Error(
      `[bake-ground] ⛔ scene '${scene}' cannot bake ① as the producer: ${why}.\n` +
      `   FIX: re-pour it —  node cartograph/skeleton.js --scene=${scene} && node cartograph/pipeline.js --scene=${scene} && node cartograph/promote-ribbons.js --scene=${scene} --yes\n` +
      `   Or bake the chain curb DELIBERATELY with --legacy. ⛔ Refusing to substitute either one silently.`)
  }
  const pr = buildTileGround(ribbons, {
    ...(PROTO ? { grout: 'proto', protoProducer: true } : {}),
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
  // ⛔ H-3: a highway with NO WIDTH is refused by name — it would freeze as a hole in the road.
  // A highway whose ribbons predate its section (a town not re-poured since H-3 step 1) freezes at its
  // old measure — the state every such town ships today — and says so, loudly, every bake: refusing
  // it would block every other town's bake until each is re-poured.
  const hd = pr.hwyDisclosure
  if (hd && (hd.missing.length || hd.gsMissing.length)) throw new Error(`[bake-ground] ⛔ refusing to freeze highway(s) with NO WIDTH: ${[...hd.missing, ...hd.gsMissing].join(', ')}`)
  if (hd?.legacy.length) console.warn(`  [H] ⛔ ${hd.legacy.length} highway(s) frozen at their PRE-H-3 measure — re-pour ${scene} to build them from their section: ${hd.legacy.join(', ')}`)
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
  // ⛔ LOUD IF ASKED FOR AND ABSENT — a silent fall back to the chain artifact would bake the old
  // producer under a flag that says otherwise, which is the plausible-looking success Layer 0 forbids.
  if (PROTO && !pr.protoShapeTiles?.length) throw new Error('[bake-ground] ① is the producer but ②③ produced NO tiles. Refusing to silently bake the chain artifact instead — pass --legacy if the chain curb is what you want.')
  console.log(PROTO
    ? `  [①⇢producer] freezing ${pr.protoShapeTiles.length} tile(s) built from ①②③ — NOT the chain curb`
    : `  [①⇢producer] ⛔ --legacy: freezing the CHAIN curb, not ①. This artifact is NOT the current producer.`)
  return { byMaterial, byFaceUse, shapeArtifact: PROTO ? pr.protoShapeTiles : pr._shapeArtifact, highwayRings: pr.highway || [] }
}

// T4 (2026-07-15): buildV2BakeShape — the figure-ground bake path — deleted.
// It had been dead-in-place since T2 (buildTileBakeShape replaced it); the
// replace-then-delete second half, per ARCHITECTURE §7.

// Triangulation + refinement moved to ./groundConformity.js (2026-09-23, H-21): the
// per-polygon triangulateAndRefine was crack-free only WITHIN one polygon, and the
// flattened ground's shared edges run almost entirely BETWEEN groups.
//
// Why the ground is refined at all: per-vertex `patchTerrain` samples the terrain
// only at baked vertices and fragments interpolate between them, so a block-scale
// face (~50 m corner-to-corner) chords across a heightfield that curves — dense
// overlays and foundations then disagree with the face's interpolated Y.

// ── Subtract overlays out of the face beneath them ──────────────────────────
// ⛔⛔ WHY THIS EXISTS. A `wood` or `pitch` overlay is finely tessellated (~8.5 m
// edges) and hugs the DEM; the land-use face UNDER it is coarse (22–33 m) and cuts
// a chord. They were separated by 30 mm — but the face's own terrain-chord error at
// that span is 17–29 mm median and 473–730 mm at p95, so the coarse face BULGES UP
// THROUGH the fine overlay and the boundary tears. Measured overlaps that make it
// unavoidable: wood ∩ agricultural 100%, pitch ∩ institutional 50%, ∩ agricultural 49%.
//
// ⭐ The fix is not a bigger gap and not a finer face — it is to stop them
// overlapping. The ground under a wood IS wood; the face should not extend beneath
// it. Subtracting costs NO triangles (the face gets smaller) and nothing to tune.
// ⛔ The alternative — equalising tessellation so every layer bends alike — was
// measured and rejected: huron at GROUND_REFINE_TOL_M 0.10 bakes 6,688,604 tris /
// 119.5 MB against 1,593,373 / 29.6 MB, i.e. 4.2x the geometry, and 0.10 m is still
// 3x looser than the 30 mm it must beat. See cartograph/_archive/BRIEF-subtract-the-overlays-DELIVERED-2026-09-21.md (retired; the live doctrine is ARCHITECTURE §8).
//
// ⚠️ Visually identical, and that was checked before building: the only
// `transparent` on a ground material is the radial rim FADE, applied to every group
// alike (BakedGround.jsx). No overlay is semi-transparent to reveal what is under
// it, so wood OVER agricultural and wood REPLACING it render the same.
const { Clipper: _Clipper, Paths: _Paths, Path: _Path, IntPoint: _IntPoint,
        ClipType: _ClipType, PolyType: _PolyType, PolyFillType: _PolyFillType,
        PolyTree: _PolyTree } = clipperLib
const CLIP_SCALE = 1000            // integer clipper units per metre → 1 mm precision

function _ringToPath(ring) {
  const p = new _Path()
  for (const [x, z] of ring) p.push(new _IntPoint(Math.round(x * CLIP_SCALE), Math.round(z * CLIP_SCALE)))
  return p
}
function _pathToRing(path) {
  const out = []
  for (const pt of path) out.push([pt.X / CLIP_SCALE, pt.Y / CLIP_SCALE])
  return out
}

// ── PRESS THE PAINT STACK DOWN ──────────────────────────────────────────────
// ⭐⭐ THE ARCHITECTURE, in Jacob's words (2026-09-21): "In Stage it's a flattened
// 2D representation which is baked into the 3D ready one. This is where we should
// take advantage of the flatness and just paint order everything and then on the
// way out press it all down."
//
// ⇒ The DESIGNER is 2D. Overlapping layers and paint order are CORRECT there — it
// is a paint stack, and the overlap is authoring, not error. ⛔ So this must NOT be
// pushed upstream into derive: that would bake a painting decision into the
// authored data and take the override away from the operator.
// ⇒ THE BAKE IS THE 2D→3D CROSSING, and it is the last moment flatness exists.
// Spend it: walk PAINT_ORDER from the TOP down, clip every layer against the union
// of everything above it, and emit only what is actually visible.
//
// WHAT THIS BUYS, and it is the whole ground rather than one pair:
// · every ground layer becomes DISJOINT — faces, treelawns, sidewalk, curb,
//   asphalt, stripe, all of it. One partition.
// · therefore ONE PLANE for the entire ground. `GROUND_Y_EPS` stops being needed:
//   no ladder, nothing to tune, and nothing to lose to the terrain-chord error that
//   made every millimetre separation unwinnable (ARCHITECTURE §8 ZEROTH RULE).
// · paint order stops being a RENDER concern and becomes purely a BAKE-TIME
//   flattening order — the only place it was ever meaningful.
// · the Designer and the slab agree again, because the slab is now the Designer's
//   paint stack RESOLVED rather than a separately-edited model.
//
// ⛔ EXCLUSIONS — a layer that TINTS rather than REPLACES must not be flattened in,
// because the thing beneath it has to survive to be seen through. `water` is the
// case that exists today (genuinely transparent; Fathom's kit material depends on
// it) and it keeps its own slot above the plane.
// ⛔⛔ TWO DIFFERENT EXCLUSIONS, AND CONFLATING THEM WAS A REAL BUG (2026-09-21).
// · `keepOwnSlot` — do not press this layer INTO the plane; it keeps a Y of its own.
// · `doesNotCut`  — do not let this layer CUT what is beneath it.
// They are NOT the same question. A TRANSPARENT layer needs both: water must keep
// its slot AND must not carve a hole in the ground you are meant to see through it.
// An OPAQUE layer that merely wants its own slot still MUST cut — a stripe hides
// the tarmac under it completely.
// ⚠️ The first cut of this function had one `exclude` set and `continue`d before
// the accumulator step, so excluding `stripe` silently stopped it cutting asphalt
// — and asphalt then kept ~386 m² of tarmac underneath the paint. The instrument
// that caught it was logging signed AREA and the accumulator's area, not path
// counts: a count says the layer EXISTS, only the area says the union KEPT it.
function flattenPaintStack(entries, { keepOwnSlot = new Set(), doesNotCut = new Set() } = {}) {
  const acc = new _Paths()                      // union of everything ABOVE
  const out = new Map()                          // key → flattened items
  // TOP DOWN: the topmost layer keeps all of itself; each lower one loses whatever
  // is already covered.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    const keepsSlot = keepOwnSlot.has(e.groupKey)
    const cuts = !doesNotCut.has(e.groupKey)

    const mine = new _Paths()
    for (const it of e.items) {
      const outer = Array.isArray(it) ? it : it?.outer
      const holes = Array.isArray(it) ? [] : (it?.holes || [])
      if (!outer || outer.length < 3) continue
      mine.push(_ringToPath(outer))
      for (const h of holes) if (h && h.length >= 3) mine.push(_ringToPath(h))
    }
    if (!mine.length) { out.set(e.groupKey, []); continue }

    let visible = e.items
    if (acc.length && !keepsSlot) {
      const c = new _Clipper()
      c.AddPaths(mine, _PolyType.ptSubject, true)
      c.AddPaths(acc, _PolyType.ptClip, true)
      const tree = new _PolyTree()
      if (c.Execute(_ClipType.ctDifference, tree, _PolyFillType.pftEvenOdd, _PolyFillType.pftNonZero)) {
        visible = []
        const walk = (node) => {
          for (const child of node.Childs()) {
            const ring = _pathToRing(child.m_polygon)
            if (ring.length >= 3) visible.push({ outer: ring, holes: child.Childs().map(h => _pathToRing(h.m_polygon)).filter(r => r.length >= 3) })
            for (const h of child.Childs()) walk(h)
          }
        }
        walk(tree)
      }
      else {
        // ⛔ LOUD. A silent refusal here means the layer is NOT clipped and the
        // overlap survives — which looks exactly like the flatten "not working".
        console.warn(`  ⚠️ [flatten] ${e.groupKey}: difference REFUSED (acc ${acc.length} paths) — layer kept whole`)
      }
    }
    if (process.env.FLATTEN_DEBUG) {
      // ⭐ AREA, not just path count. A path count says a layer EXISTS; only the
      // signed area says whether the union actually kept it. Opposite winding
      // under pftNonZero cancels — the paths survive and the REGION does not.
      const areaOf = (paths) => { let a = 0; for (const q of paths) a += _Clipper.Area(q); return a / (CLIP_SCALE * CLIP_SCALE) }
      const mineA = areaOf(mine), accA = areaOf(acc)
      const cw = mine.filter(q => !_Clipper.Orientation(q)).length
      console.log(`    [flatten] ${String(i).padStart(2)} ${e.groupKey.padEnd(26)} in ${String(e.items.length).padStart(5)} → out ${String(visible.length).padStart(5)}`
        + `  ownArea ${mineA.toFixed(0).padStart(9)} m²  (${cw}/${mine.length} CW)  accBefore ${accA.toFixed(0).padStart(10)} m²`)
    }
    out.set(e.groupKey, visible)

    // union this layer into the accumulator for the layers below — unless it is
    // transparent, in which case what is beneath it must survive to be seen.
    if (!cuts) continue
    const u = new _Clipper()
    u.AddPaths(acc, _PolyType.ptSubject, true)
    u.AddPaths(mine, _PolyType.ptClip, true)
    const merged = new _Paths()
    if (u.Execute(_ClipType.ctUnion, merged, _PolyFillType.pftNonZero, _PolyFillType.pftNonZero)) {
      acc.length = 0
      for (const q of merged) acc.push(q)
    } else {
      // ⛔ LOUD. If the union refuses, every layer BELOW this one goes unclipped —
      // the flatten silently degrades to doing nothing at all.
      console.warn(`  ⚠️ [flatten] ${e.groupKey}: UNION refused — layers below will not be clipped against it`)
    }
  }
  return out
}

/** faceItems: rings or {outer,holes}. overlayRings: bare rings to cut out. */
function subtractOverlaysFromFace(faceItems, overlayRings) {
  if (!overlayRings.length || !faceItems?.length) return faceItems
  const clip = new _Paths()
  for (const r of overlayRings) if (r && r.length >= 3) clip.push(_ringToPath(r))
  if (!clip.length) return faceItems

  const out = []
  for (const it of faceItems) {
    const outer = Array.isArray(it) ? it : it?.outer
    const holes = Array.isArray(it) ? [] : (it?.holes || [])
    if (!outer || outer.length < 3) continue
    const subj = new _Paths()
    subj.push(_ringToPath(outer))
    for (const h of holes) if (h && h.length >= 3) subj.push(_ringToPath(h))
    const c = new _Clipper()
    c.AddPaths(subj, _PolyType.ptSubject, true)
    c.AddPaths(clip, _PolyType.ptClip, true)
    const tree = new _PolyTree()
    // ⛔ EvenOdd on the subject so the face's EXISTING holes stay holes.
    if (!c.Execute(_ClipType.ctDifference, tree, _PolyFillType.pftEvenOdd, _PolyFillType.pftNonZero)) {
      out.push(it)   // clipper refused — keep the original rather than drop ground
      continue
    }
    // PolyTree: children of the tree are OUTERS, their children are HOLES, and a
    // hole's children are outers again (an island inside a cut-out).
    const walk = (node) => {
      for (const child of node.Childs()) {
        const ring = _pathToRing(child.m_polygon)
        if (ring.length >= 3) {
          out.push({ outer: ring, holes: child.Childs().map(h => _pathToRing(h.m_polygon)).filter(r => r.length >= 3) })
        }
        for (const h of child.Childs()) walk(h)
      }
    }
    walk(tree)
  }
  return out
}

// Normalise a group's items (bare rings for ribbon bands, {outer, holes} for faces)
// to {outer, holes} polygons for conformAndRefine.
function toPolys(items) {
  const polys = []
  for (const it of items || []) {
    if (!it) continue
    if (Array.isArray(it)) {
      if (it.length >= 3) polys.push({ outer: it, holes: [] })
    } else if (it.outer && it.outer.length >= 3) {
      polys.push({ outer: it.outer, holes: it.holes || [] })
    }
  }
  return polys
}

export async function bakeGround({ look, scene, refine: refineOpts = {}, proto: protoFlag = true, outDir: outDirOpt = null } = {}) {
  // Adaptive ground-subdivision policy, resolved from opts.* over the module
  // defaults. GATED ON opts.* (NEVER process.env). refineOpts = {} keeps the
  // adaptive default; pass { mode: 'uniform' } to restore the legacy mesh, or
  // override tol/minEdge/maxEdge to retune the tri budget.
  const refineMode    = refineOpts.mode    || GROUND_REFINE
  const refineTol     = refineOpts.tol     != null ? refineOpts.tol     : GROUND_REFINE_TOL_M
  const refineMinEdge = refineOpts.minEdge != null ? refineOpts.minEdge : GROUND_REFINE_MIN_EDGE_M
  const refineMaxEdge = refineOpts.maxEdge != null ? refineOpts.maxEdge : GROUND_REFINE_MAX_EDGE_M
  const refineSampler = refineMode === 'adaptive' ? getTerrainSampler(scene) : null
  // ⭐ F3 (Jacob, 2026-09-24): REFINEMENT IS DERIVED FROM THE SCENE. Every ground refinement exists to give the
  // runtime's terrain lift enough vertices to drape the DEM. A scene with NO heightfield is lifted by nothing,
  // so no group is refined at all — the coarse 64 m cap this replaced was the Provincetown explosion: its bay,
  // a 157 km² land-use face earcut into 12 km slivers, quartered to 10.3M triangles. The AO lightmap is a
  // texture, so nothing else reads ground vertex density. A scene WITH terrain is byte-identical.
  const hasTerrain = !!getTerrainSampler(scene)
  if (!hasTerrain) console.log(`  [ground] no terrain for ${look} — refinement off (nothing to drape)`)
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
  // outDir: write the slab elsewhere (a scratch A/B) instead of over the live one.
  const outDir      = outDirOpt || join(ROOT, 'public', 'baked', look)
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
  const { byMaterial, byFaceUse, shapeArtifact, highwayRings } = buildTileBakeShape(ribbons, design, stencil.clipPolygon, surveyStreets, parkClip, scene, { proto: !!protoFlag })

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
  // natural subtypes — `natural=water` is NOT here on purpose: it has its own
  // producer (`layers.water`, the coast/relation path, injected just below) and
  // a second producer for one feature class is the bug, not the fix.
  const NATURAL_KEYS = new Set(['wood', 'scrub', 'tree_row'])
  for (const item of (mapLayers.natural || [])) {
    if (NATURAL_KEYS.has(item.use) && item.ring) pushMat(item.use, ringFromOSM(item.ring))
  }
  // ⭐⭐ THE WATER FACE. `derive.js` emits `layers.water` and until 2026-09-20 this
  // bake never read it — the lake was acquired, classified, derived, and then
  // dropped on the floor. In 3D huron's Lake Erie was a HOLE IN THE LAND: ①
  // carves `bb − (WATER ∪ INK)` so the land stops at the shore, and nothing
  // filled what it left. (The Designer DID draw it, off `map.json` directly,
  // which is why "the lake is drawn" was believed of the slab as well.)
  // ⛔ This does NOT reach an inland pond. `coastline.mjs` applies only water
  // that runs on past the fetch — measured on huron, 40 bodies lie wholly inside
  // the disc and 15 more are held whole, and none of them reach `layers.water`
  // at all. That is a PRODUCER question and it is not fixed here; the pour
  // prints those two counts every run.
  for (const item of (mapLayers.water || [])) {
    if (!item.ring) continue
    pushMat(item.subtype ? `water:${item.subtype}` : 'water', ringFromOSM(item.ring))
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

  // ⛔⛔ THE SILENT DROP, MADE LOUD. PAINT_ORDER is an ALLOW-LIST: anything
  // collected into byMaterial/byFaceUse under a key no entry consumes is
  // discarded here with no error, no warning and a slab that renders perfectly —
  // just missing a population. That is exactly how the divided median vanished,
  // and it is the kit's signature failure shape: it looks like success.
  // ⭐ A vocabulary this bake does not own can widen at any time (OSM adds a
  // `water=*` value, `derive.js` emits a new LU class), so the guard is
  // GENERAL — it reads the two collections and PAINT_ORDER, and never restates
  // either. Nothing to keep in sync.
  {
    const consumed = new Set(PAINT_ORDER.map(([kind, key]) => kind + ':' + key))
    const orphans = []
    for (const [key, items] of byFaceUse) if (items?.length && !consumed.has('face:' + key)) orphans.push(`face:${key} (${items.length})`)
    for (const [key, items] of byMaterial) if (items?.length && !consumed.has('mat:' + key)) orphans.push(`mat:${key} (${items.length})`)
    if (orphans.length) {
      console.warn(`    ⛔ [BAKE] ${orphans.length} populated group key(s) have NO PAINT_ORDER slot and are being DROPPED from the slab: ${orphans.join(', ')}`)
      console.warn(`       ▶ They were collected, so the data is real — add each to PAINT_ORDER (and TREELAWN_LU_VARIANTS / WATER_SUBTYPES where it applies). The slab will otherwise render correctly and silently without them.`)
    }
  }

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
  // few metres along the run. (The conforming refinement keeps the
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
  // ⭐⭐ PRESS THE STACK DOWN BEFORE ANY GEOMETRY IS BUILT. Collect every visible
  // layer's rings in PAINT_ORDER, flatten them into a partition (top-down clip),
  // and build from the RESULT. See flattenPaintStack() for why this belongs here —
  // at the 2D→3D crossing — and not upstream in derive.
  // ⛔ `water` is excluded: it TINTS rather than replaces, so what is under it must
  // survive to be seen through. It keeps its own slot above the plane.
  const KEEP_OWN_SLOT = new Set()
  const DOES_NOT_CUT = new Set()
  const stackEntries = []
  for (const [kind, key] of PAINT_ORDER) {
    if (bakeLayerVis[groupLayerId(kind, key)] === false) continue
    const its = kind === 'face' ? byFaceUse.get(key) : byMaterial.get(key)
    if (!its || its.length === 0) continue
    const groupKey = kind + ':' + key
    // ⛔ WATER IS THE ONLY LAYER THAT DOES BOTH: it keeps its own slot AND does not
    // cut, because it TINTS rather than replaces — the ground beneath it has to
    // survive to be seen through it. Everything else, `stripe` included, cuts.
    const isWater = kind !== 'face' && (key === 'water' || key.startsWith('water:'))
    if (isWater) { KEEP_OWN_SLOT.add(groupKey); DOES_NOT_CUT.add(groupKey) }

    // ⚠️ `stripe` CUTS but KEEPS ITS SLOT — the one layer using both settings, and
    // it is a guard against an UNEXPLAINED residual, not a design choice.
    // Measured at 10 cm in a 500 m window, after the flatten: stripe ∩ asphalt is
    // 194 m², 39% of stripe's own area. Cutting halved it (386 → 194 m²) and did
    // not finish it. ⛔ CAUSE NOT ESTABLISHED — candidates are clipper's mixed
    // winding in the accumulator (29 of 392 stripe rings are CW) and holes that
    // touch the asphalt boundary rather than sitting inside it, but neither is
    // measured. ⇒ Until it is, a coplanar stripe would z-fight the tarmac on that
    // 194 m². Keeping its slot makes the residual harmless instead of visible.
    // ⭐ Remove this the day the residual measures zero — not before, and not on
    // the grounds that it "should" be zero.
    if (kind !== 'face' && key === 'stripe') KEEP_OWN_SLOT.add(groupKey)
    stackEntries.push({ groupKey, kind, key, items: its })
  }
  const _t0 = Date.now()
  const flattened = flattenPaintStack(stackEntries, { keepOwnSlot: KEEP_OWN_SLOT, doesNotCut: DOES_NOT_CUT })
  console.log(`  [bake-ground] paint stack pressed down: ${stackEntries.length} layers `
    + `(${KEEP_OWN_SLOT.size} keeping their own slot, ${DOES_NOT_CUT.size} not cutting) in ${((Date.now() - _t0) / 1000).toFixed(1)}s`)

  const planGroup = (kind, key) => {
    if (bakeLayerVis[groupLayerId(kind, key)] === false) return null
    // Faces are {outer, holes} entries (post-clip); ribbons are bare rings.
    // toPolys normalizes both — holes are honored at triangulation
    // time so the lawn ribbon underneath a clipped face fill stays visible.
    let items = flattened.get(kind + ':' + key) ?? (kind === 'face' ? byFaceUse.get(key) : byMaterial.get(key))
    if (!items || items.length === 0) return null

    // ⛔ The pairwise "cut overlays out of faces" that lived here is GONE — the
    // paint-stack flatten above supersedes it and does the whole stack, not one
    // pair. Two places deciding the same thing is how they drift.

    // Tiering: large soft land-use FILLS (faces) take the adaptive policy --
    // that is where the budget lives and where coarse triangles are least
    // visible. Landscape overlays keep the legacy fine uniform spacing
    // (crisp-edged, tiny budget). Ribbon bands bypass refinement entirely.
    const isSoftFill = kind === 'face'
    const isHardOverlay = LANDSCAPE_OVERLAY_KEYS.has(key)
    const isContourRibbon = CONTOUR_REFINE_KEYS.has(key)   // park_path: rides the park hill
    let refinePolicy = null
    if (!hasTerrain) { /* F3: nothing to drape — every group ships as triangulated */ }
    else if (isSoftFill) {
      // Terrain present → adaptive (follows the DEM). A sampler-less 'uniform' run (the legacy opt-in)
      // keeps the coarse cap. ⛔ With NO terrain at all this branch is never reached (F3, above): the
      // coarse cap it used to emit here bred Provincetown's 10.3M slivers (Altadena, 2026-07-14, was the
      // first no-terrain blow-up — the fine mesh then; the cap now).
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
    // ⭐⭐ THE LU FACES ARE ONE PLANE. Every `kind === 'face'` group shares slot 0
    // — no Y separation between them — because they are a PARTITION and never
    // overlap. Measured on huron 2026-09-20 by strict point-in-triangle sampling
    // (362,298 cells over 23.05 km², interiors only, shared edges excluded):
    // ZERO cells covered by two different LU interiors. 0.000 km².
    // ⇒ The ladder was separating surfaces that were never on top of each other.
    //
    // ⛔ WHY A BIGGER EPSILON COULD NEVER HAVE WORKED. The micro-Y is baked into
    // geometry, and the runtime then displaces every vertex by the DEM. Two layers
    // with different tessellation interpolate that displacement differently ACROSS
    // A TRIANGLE: a 64 m face triangle chords over ground a 3.5 m sidewalk triangle
    // follows. Measured sag vs huron's DEM at exag 1.5 — median / p95:
    //   3.5 m span 0.0 / 13 mm · 11.5 m 4.3 / 129 mm · 24 m 17 / 473 mm · 64 m 71 / 1574 mm
    // ⇒ layers nominally 2 mm apart sit up to 1.6 m apart in whichever direction the
    // terrain curves, and WHICH ONE WINS FLIPS WHEREVER THAT SIGN FLIPS — the torn,
    // lacy LU edges an operator reads as "axis fighting". A 10× A/B (2 → 20 mm)
    // changed nothing, exactly as the numbers predict.
    // ⭐ And the two constants are arithmetically incompatible: the adaptive refiner
    // is allowed to miss the ground by GROUND_REFINE_TOL_M = 0.50 m — 250× the
    // separation it must preserve. Tightening tol below 2 mm means subdividing every
    // fill to centimetres (altadena already hit 23.6M tris at a far looser setting);
    // widening EPS above tol puts water 34 m above its shore. NEITHER IS AVAILABLE.
    // ⛔ Do not reintroduce a per-face Y "to be safe": it cannot help, and it brings
    // the fighting back.
    //
    // ⚠️ Ribbon/overlay groups (asphalt, curb, sidewalk, stripe…) KEEP their ascending
    // slots — a road genuinely DOES sit on a parcel. They remain subject to the same
    // chord error, just less of it; if face-vs-ribbon fighting survives this, it needs
    // a different answer than a bigger gap.
    // ⭐⭐ THE GROUND TILING IS ONE PLANE — parcels AND roadway together.
    // Measured on huron at 0.25 m resolution (fine enough to resolve a 2 m
    // sidewalk; an 8 m grid fattens thin ribbons and invents overlap that is not
    // there — the first pass did exactly that and had to be thrown away):
    //     asphalt ∩ sidewalk  ZERO      asphalt ∩ curb  ZERO
    //     sidewalk ∩ curb     3 cells of 20,404 = 0.0%
    //     treelawn:* ∩ sidewalk 0.2–0.9% (hairline, shared edges)
    // ⇒ the street cross-section TILES the roadway exactly as the LU faces tile
    // the parcels. None of them were ever stacked on each other, so none of them
    // may be separated — see the ZEROTH RULE in ARCHITECTURE §8.
    //
    // ⛔ WHAT STAYS SEPARATED, because it genuinely DOES sit on something (same
    // measurement): stripe ∩ asphalt 91% · stripe ∩ treelawn:island 100% ·
    // wood ∩ agricultural 100% · pitch ∩ institutional 50% / ∩ agricultural 49%.
    // Those are LANDSCAPE_OVERLAY_KEYS plus stripe — real overlays, real slots.
    //
    // ⚠️ CONSERVATIVE BY DESIGN: only keys MEASURED as part of the tiling join the
    // plane. `alley`, `park_path`, `highway` and `water` are structurally roadway
    // or datum surfaces and probably belong here too, but huron's window carried
    // too few of them to measure, and putting an overlapping layer on the shared
    // plane is a z-fight. ⛔ Do not add a key here on structural reasoning alone —
    // measure it, the way these were.
    // ⭐⭐ ONE PLANE FOR THE WHOLE FLATTENED GROUND. Every layer that went through
    // flattenPaintStack is now DISJOINT from every other, so there is nothing to
    // separate and `GROUND_Y_EPS` has no work to do. ⛔ That matters because no
    // epsilon could ever have worked: the runtime DEM displacement is interpolated
    // per-triangle, so differently-tessellated layers disagree about the ground by
    // up to 1.6 m against a 2 mm gap (ARCHITECTURE §8 ZEROTH RULE, with the
    // chord-error table). The ladder is not tuned away — it is no longer needed.
    // ⚠️ An EXCLUDED layer (water — it tints rather than replaces) still overlaps
    // what is beneath it and keeps a real slot above the plane.
    const onGroundPlane = !KEEP_OWN_SLOT.has(kind + ':' + key)
    // ⭐ The PARTITION is every layer that cuts — which is not the same set as the
    // plane: `stripe` keeps its own slot but cuts its shape out of the asphalt, so the
    // tarmac's hole and the stripe share every edge. Only water, which tints rather
    // than replaces, lies over the ground instead of in it.
    const inPartition = !DOES_NOT_CUT.has(kind + ':' + key)
    return { polys: toPolys(items), refinePolicy, onGroundPlane, inPartition }
  }

  // ⭐⭐ THE GROUND STRETCHES, IT DOES NOT BREAK (H-21). Every group on the plane is
  // triangulated and refined TOGETHER, so a vertex one group puts on a shared edge
  // is a vertex of the group across it too. Refined one group at a time, a fill's
  // border midpoints sat mid-edge on the unrefined ribbons beside it — tens of
  // thousands of T-junctions per town, each a crack once the DEM lifts the mesh.
  // ⛔ Fails loudly: the result is re-checked and any T-junction throws.
  const planeBuffers = new Map()
  let groundShape = null
  {
    const planeKeys = [], planeSpecs = []
    for (const [kind, key] of PAINT_ORDER) {
      const plan = planGroup(kind, key)
      if (!plan || !plan.inPartition) continue
      planeKeys.push(kind + ':' + key)
      planeSpecs.push({ polys: plan.polys, refine: plan.refinePolicy, yLift: 0 })
    }
    const _tc = Date.now()
    const cstats = {}
    const bufs = conformAndRefine(planeSpecs, cstats)
    groundShape = { terrain: hasTerrain, groups: Object.fromEntries(planeKeys.map((k, i) => [k, {
      refine: planeSpecs[i].refine?.mode ?? 'none',
      ...(planeSpecs[i].refine?.maxEdge ? { maxEdgeM: planeSpecs[i].refine.maxEdge } : {}),
      ...(planeSpecs[i].refine?.minEdge ? { minEdgeM: planeSpecs[i].refine.minEdge } : {}),
      areaM2: Math.round(cstats.shapeAfter[i].areaM2),
      boundaryVerts: cstats.shapeAfter[i].boundaryVerts,
      tris: cstats.shapeAfter[i].tris, slivers: cstats.shapeAfter[i].slivers,
      trisTriangulated: cstats.shapeBefore[i].tris, sliversTriangulated: cstats.shapeBefore[i].slivers }])) }
    planeKeys.forEach((k, i) => planeBuffers.set(k, bufs[i]))
    const tj = findTJunctions(bufs.map((b, i) => ({ id: planeKeys[i], ...b })))
    if (tj.total > 0) {
      const w = tj.found[0]
      throw new Error(`[bake-ground] the ground partition still has ${tj.total} T-junctions after conformity `
        + `(${tj.within} within a group, ${tj.cross} across groups) — first at (${w.x.toFixed(2)}, ${w.z.toFixed(2)}), `
        + `a ${w.vertexGroup} vertex on a ${w.edgeGroup} edge. Refusing to write a ground that cracks.`)
    }
    console.log(`  [bake-ground] ground partition conformed as one mesh: ${planeSpecs.length} groups, `
      + `${cstats.inputTJunctions} input T-junctions closed, ${cstats.closures} refinement closures, ${cstats.refineTJunctions} hairline T-junctions closed after refining (≤${cstats.passes} passes), 0 left `
      + `in ${((Date.now() - _tc) / 1000).toFixed(1)}s`)
  }

  for (const [kind, key] of PAINT_ORDER) {
    const plan = planGroup(kind, key)
    if (!plan) continue
    const { onGroundPlane, inPartition } = plan
    const yLift = (onGroundPlane ? 0 : renderOrder) * GROUND_Y_EPS
    // A partition layer was conformed with the rest (at Y 0; its slot lift goes on
    // here). Water lies OVER the ground, sharing no edge with it, so it is conformed
    // on its own — which still joins its polygons to each other.
    const { positions, indices } = inPartition
      ? planeBuffers.get(kind + ':' + key)
      : conformAndRefine([{ polys: plan.polys, refine: plan.refinePolicy, yLift }])[0]
    if (inPartition && yLift) for (let i = 1; i < positions.length; i += 3) positions[i] = yLift
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
      // Which groups the no-T-junction guarantee spans; the check reads this, so it
      // cannot drift from the bake's own definition of the partition.
      partition: inPartition,
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
  // the fade is a LOOK band and nothing stops a scene authoring one narrower than
  // its own disc, on which the bare `fade.outer` under-sizes the bake.
  // ⭐ Since 2026-09-20 the band is ADDITIVE — `fade.outer = radius + fadeBand` — so
  // it can no longer fall below the radius unless `fadeBand` is negative, which
  // `classifyFade` now rejects outright. The floor stays as a belt-and-braces guard,
  // not because a live path can trip it.
  //
  // ⛔ NO FALLBACK. This read `?? 1000` — presented as "the prior hardcoded default",
  // it was DEAD: loadSceneStencil coerces an absent radius to 1 (`sceneStencil.js:35`
  // `s.radius || 1`), so the `??` never fired and a scene with no authored extent
  // baked a 51 m bbox — silently, and looking like a successful bake. That 1 is the
  // absent signal here; a real hood is never 1 m. ⚠️ The coercion itself is the
  // deeper defect and it lives one layer up, in sceneStencil.js.
  const _fadeOuter = Number.isFinite(stencil.faceFade?.outer) ? stencil.faceFade.outer : null
  const _discR = Number.isFinite(stencil.radius) && stencil.radius > 1 ? stencil.radius : null
  if (_fadeOuter === null && _discR === null) {
    console.error(`
⛔ scene '${scene}' has no authored extent (no fade.outer, no radius > 1)
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
  // When fade IS authored, emit the full block so the runtime can patch the
  // shader uniforms without a side import.
  //
  // ⛔⛔ THIS PREDICATE WAS `stencil.faceFade && stencil.streetFade`. Deleting
  // `streetFade` (2026-09-20) would have driven it NULL FOR EVERY TOWN — and null
  // here does not mean "wrong band", it means BakedGround.jsx:117 returns early and
  // the radial fade shader is NEVER APPLIED. Every baked town would have lost its
  // feather entirely, INVISIBLY until the next re-bake: the deletion would have
  // shipped looking correct and degraded the Slab later. ⭐ That is CLAUDE.md Layer 0
  // question 2 exactly — a deletion converted into a plausible-looking success.
  // Found while holding at the §7 gate; it is why the gate was worth holding.
  const manifestStencil = stencil.faceFade ? {
    center: stencil.center,
    radius: stencil.radius,
    fade: stencil.faceFade,
  } : null

  // ⭐⭐ groundKey — FNV-1a over the geometry the AO is baked AGAINST. The AO pass
  // stamps this key into its own block; BakedGround refuses a lightmap whose key
  // does not match. ⛔ WHY: this function REBUILDS the manifest from scratch, so
  // every ground re-bake used to ERASE the `lightmap` reference bake-ground-ao had
  // patched in. Measured 2026-09-20: BOTH lafayette-square and huron had an AO PNG
  // on disk and no manifest pointing at it — every town was rendering with no AO
  // and saying nothing. Worse, the staleness gate read GREEN in exactly that state,
  // because bake-ground-ao deliberately writes the manifest FIRST so ground.json
  // ends up newer than the PNG (see its own comment) — so "ground.json is newer"
  // means both "AO is current" and "AO was just destroyed". An mtime cannot tell
  // those apart. A key can.
  // ⭐ Same shape as tree-anchors' `placementKey`, which is the one derived-artifact
  // guard in this repo that failed correctly and loudly tonight.
  let _gk = 2166136261 >>> 0
  const _gkEat = (str) => { for (let i = 0; i < str.length; i++) { _gk ^= str.charCodeAt(i); _gk = Math.imul(_gk, 16777619) >>> 0 } }
  _gkEat(`${bx0.toFixed(2)},${bz0.toFixed(2)},${bx1.toFixed(2)},${bz1.toFixed(2)}`)
  for (const g of groups) _gkEat(`${g.id}|${g.kind}|${g.vertexCount}|${g.indexCount}|${g.vertexByteOffset}`)
  const groundKey = _gk.toString(16).padStart(8, '0')

  // ⛔ CARRY THE LIGHTMAP REFERENCE FORWARD, don't drop it. Dropping it loses the
  // AO silently; carrying a STALE one is now safe because the key exposes it at
  // load with a message naming the fix. Losing the pointer was the actual defect.
  let priorLightmap = null
  try { priorLightmap = JSON.parse(readFileSync(join(outDir, 'ground.json'), 'utf-8')).lightmap || null } catch { priorLightmap = null }

  const manifest = {
    version: 1,
    look,
    bbox: { min: [bx0, 0, bz0], max: [bx1, 0, bz1] },
    stencil: manifestStencil,
    groundKey,
    bin: 'ground.bin',
    positionFormat: 'float32',
    indexFormat: 'uint32',
    componentsPerVertex: 3,   // x, y, z
    groups,
    // F3 / F2 disclosure: did this scene have terrain, how was each partition group refined, and how many
    // slivers it came out with — read by the two ground-shape checks.
    ...(groundShape ? { groundShape } : {}),
    ...(priorLightmap ? { lightmap: priorLightmap } : {}),
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
  // ⛔ The scene comes from the ONE resolver (scene.js), which reads BOTH --scene=
  // and CARTOGRAPH_SCENE. This loop used to parse --scene itself over a
  // 'lafayette-square' seed, so the env channel was silently ignored and an
  // env-named bake rebuilt LS. See scene.js's header.
  const scene = requireExplicitMap('bake-ground')
  let look = null, proto = true   // ⭐ ① is the producer by default; --legacy opts out
  let outDir = null
  const refine = {}
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))         look  = m[1]
    // Adaptive ground-subdivision overrides (gated on argv/opts, never env):
    // ⭐⭐⭐ ① IS THE PRODUCER BY DEFAULT (Jacob, 2026-09-06: "make --proto the default and
    // rebake"). `--proto` is kept as an accepted no-op so existing invocations and docs still
    // work; `--legacy` is the ONLY way back to the chain curb, and it is explicit because a bake
    // that silently produced the other producer is what hid a full day of ① work from the
    // operator — `serve.js`'s bake button omitted `--proto` and clobbered every proto artifact
    // with a legacy one, so Section could never show ① no matter what was fixed.
    else if (arg === '--proto')                   proto = true            // accepted; now the default
    else if (arg === '--legacy' || arg === '--no-proto') proto = false    // the chain curb, explicitly
    else if ((m = arg.match(/^--refine=(.+)$/)))  refine.mode    = m[1]            // adaptive | uniform
    else if ((m = arg.match(/^--refine-tol=(.+)$/)))     refine.tol     = parseFloat(m[1])
    else if ((m = arg.match(/^--refine-min-edge=(.+)$/)))refine.minEdge = parseFloat(m[1])
    else if ((m = arg.match(/^--refine-max-edge=(.+)$/)))refine.maxEdge = parseFloat(m[1])
    else if ((m = arg.match(/^--out-dir=(.+)$/)))  outDir = m[1]   // a scratch A/B, not the live slab
  }
  await bakeGround({ look, scene, refine, proto, outDir })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
