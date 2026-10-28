/**
 * Cartograph — Derive map layers (centerline-first, four-zone model)
 *
 * Pipeline:
 *   1. Polygonize centerline network → faces
 *   2. Per-edge variable inset (survey ROW widths) → curb polygons (block boundaries)
 *   3. Lamp correction: validate/adjust widths from streetlamp positions
 *   4. Round block corners → curb returns
 *   5. Four-zone cross-section: pavement | infrastructure | sidewalk | lot
 *
 * Authority stack:
 *   - Survey ROW (assessor) → curb placement
 *   - Lamps (OSM) → correct widths, define infrastructure zone
 *   - Parcels (assessor) → lot lines, land use
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import clipperLib from 'clipper-lib'
import { STANDARDS, getStreetSpec, crossSection } from './standards.js'
import { createVocabularyGate, unreadableFace } from './osm-vocabulary.mjs'
import { RAW_DIR, CLEAN_DIR, CARTOGRAPH_DIR, SCENE, wgs84ToLocal } from './config.js'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { nodeAcrossGroups, splitAtPinches } from '../src/lib/latticeNode.js'
import { footprintWell } from './footprint-well.mjs'
import { nodeEdges } from './node.js'
import { polygonize } from './polygonize.js'
import { classify } from './classify.js'
import { defaultMeasure, measureFromSeed, KIT_CURB_WIDTH, isSweptClass, highwayStandard, highwaySection, townState } from '../src/cartograph/streetProfiles.js'
import { CLASSES, classOf, isOneway } from '../src/cartograph/streetClass.js'
import { selectMarkings, parkingSeed, MARKING_LOOK } from '../src/cartograph/streetMarkings.js'
import { expresswaySpeeds } from './speedContext.mjs'
// ① is minted HERE at prebake (`mintProtopolygon`) and frozen into the artifact; the other two imports run beside it.
import { mintProtopolygon, classifyHighwayBlocks, rampTerminalFlares, HIGHWAY_CLASSES } from '../src/lib/tileGround.js'
import { classifyParcelLandUse, loadCountyCodeTable, parcelLandUseReport, UNDERIVED } from './parcel-landuse.mjs'
import { readSources, undeclaredMessage } from './sources.js'
import { resolveCurbCutNorm } from './curb-cut-norm.mjs'
import { buildCurbCutEvidence, buildCrosswalkEvidence } from './curb-cut-evidence.mjs'
import { LAND_USE_READERS } from './states/index.mjs'
import { mintInputs, townBlockCustoms } from './mintInputs.mjs'
import { splitBoundary, discOf } from './boundaryRecords.mjs'
import { onGrid } from './snap.js'
import { localBB } from './geography.mjs'
import { parcelParts, pointInside, parcelId } from './parcelParts.js'

const { Clipper, ClipperOffset, Paths, IntPoint, PolyTree,
        ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib

// ⭐ ONE GRID (Jacob, 2026-10-17): derive cuts land evidence, alleys and medians on the kit's one lattice, never a grid of its own
// (it was its own `SCALE = 100`, a 1 cm grid; HPDM's parcel-vs-OSM weld class at 1–6 mm went 2,179 → 11 on the lattice, Zob measured)
// The highway typical section's cited values (H-3) — read from references/, never restated — and
// the town's state (voted from its own OSM `addr:state`), which picks the ramp manual. Built once.
let _hwyStd = null
// ⭐ every registry entry the section composer read this pour — stamped into map.json by pipeline.js (`registryRead`)
const _registryRead = new Map()
export const registryReadRecord = () => Object.fromEntries(_registryRead)
function hwyStd() {
  if (_hwyStd) return _hwyStd
  const state = townState(JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf8')))
  console.log(`    Highway section: town state ${state.code ?? '⛔ UNKNOWN'} (addr:state vote: ${state.vote}${state.tied ? ', TIED' : ''})`)
  return (_hwyStd = highwayStandard(JSON.parse(readFileSync(join(CARTOGRAPH_DIR, '..', 'references', 'registry.json'), 'utf8')), state, _registryRead))
}
const ARC_TOL = 0.01 * CLIP_SCALE  // 1cm — smooth arcs

// [curve-primitive] The ONE place a curve becomes points (HANDOFF-curve-primitive-skeleton.md).
// Tessellate a ribbon street's SELF-CONTAINED segments ({type, a,b[,c1,c2]}, all [x,z]) to a
// dense polyline: line segments pass through their endpoints EXACTLY (grid-safe); bezier
// segments subdivide at ~`spacing` m. A street without segments returns its points verbatim.
// ⭐⭐⭐ THE CURVE PRIMITIVE IS WHERE THE SMOOTHNESS LIVES — tessellate it, ADAPTIVELY.
// ⛔⛔ MEASURED 2026-09-06, and it is why "the protopoly isn't smooth at all, anywhere": the
// skeleton stores its curves in `segments`, not in `points`. LS carries **225 bezier segments over
// 9,948 m of street on 124 of 343 chains**, and `points` is only 1,978 anchors (5.8 per chain) —
// the CONTROL POLYGON. Minting ① from those anchors draws every curve as a straight chord and
// throws away a sagitta of **median 1.34 m · p90 5.43 m · max 20.80 m**.
// ⭐ That 20.80 m is the same figure the canon recorded as "the drawn centreline vs ①". It was
// never two lines diverging — it is the DISCARDED CURVE. Converging them to 0.00 m did not fix the
// divergence; it deleted the curve from both sides.
//
// ⛔ THIS DOES NOT REOPEN THE DENSITY RULING. `CURVE_FIT` densified EVERYTHING, straight runs
// included — 8.5× the points, 705 vertices on a block that should have ~8. Subdividing to an ARC
// TOLERANCE spends points only where there is real curvature: a straight street keeps its two
// anchors and a quadrilateral block keeps ~8 vertices. Measured on LS: 1,978 anchors → **3,086
// points at 0.10 m**, against the old densified trace's 9,547.
// ⛔ AND EVERY ANCHOR SURVIVES, which is what makes it safe for authoring: `segOrd` is an ordinal
// over the IX partition of the point array, and the IX vertices ARE anchors. Adding points BETWEEN
// them shifts indices but changes no ordinal.
// ▶ node checks/claims-simplify-preserves-authoring.mjs <scene>
const CURVE_TOL = 0.10   // m — the sagitta a tessellated chord may miss the true curve by

export function tessellateAdaptive(points, segments, tol = CURVE_TOL) {
  if (!segments || !segments.length || !(points?.length >= 2)) return points
  const cub = (a, c1, c2, b, t) => {
    const u = 1 - t, A = u*u*u, B = 3*u*u*t, C = 3*u*t*t, D = t*t*t
    return [A*a[0] + B*c1[0] + C*c2[0] + D*b[0], A*a[1] + B*c1[1] + C*c2[1] + D*b[1]]
  }
  const dev = (p, a, b) => {
    const dx = b[0]-a[0], dz = b[1]-a[1], L2 = dx*dx + dz*dz
    let t = L2 ? ((p[0]-a[0])*dx + (p[1]-a[1])*dz) / L2 : 0
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dz))
  }
  const flat = (a, c1, c2, b) => { for (let k = 1; k < 12; k++) if (dev(cub(a,c1,c2,b,k/12), a, b) > tol) return false; return true }
  // de Casteljau subdivision — no step count to pick, so no tuned number
  const emit = (a, c1, c2, b, out, d = 0) => {
    if (d > 14 || flat(a, c1, c2, b)) { out.push(b); return }
    const mid = (u, v) => [(u[0]+v[0])/2, (u[1]+v[1])/2]
    const p01 = mid(a,c1), p12 = mid(c1,c2), p23 = mid(c2,b)
    const p012 = mid(p01,p12), p123 = mid(p12,p23), M = mid(p012,p123)
    emit(a, p01, p012, M, out, d+1); emit(M, p123, p23, b, out, d+1)
  }
  // ⭐⭐ `hard` RIDES ALONG: which emitted points are ORIGINAL ANCHORS whose incident segments are
  // both straight — i.e. nodes with BROKEN handles, which `RIBBONS §1` rules are CORNERS ("broken
  // handles turn, continuous handles ease"). A point interpolated inside a bezier is never hard.
  // ⛔ This has to be computed HERE, before the anchors are diluted: afterwards the only way back to
  // it is an angle threshold, which is exactly what `easeRing` was built on and excised for.
  const hard = [true]                       // a chain END is always a broken handle
  const out = [[points[0][0], points[0][1]]]
  // ⭐ `anchorAt` RIDES ALONG too: anchor i → its index in the output, by IDENTITY (Zob, 2026-10-27), so a per-segment fact over
  // the anchors (the skeleton's `segmentWays`) maps onto the tessellated line without matching a coordinate (a loop revisits one)
  const anchorAt = [0]
  for (let i = 0; i < segments.length && i < points.length - 1; i++) {
    const g = segments[i]
    const a = [points[i][0], points[i][1]], b = [points[i+1][0], points[i+1][1]]
    // ⛔ Both schemas: the SKELETON's segments are index-referenced with {x,z} handles and implicit
    // anchors; a RIBBON street's are self-contained with [x,z]. One tessellator, or the two drift.
    if (g?.type === 'bezier') {
      const c1 = Array.isArray(g.c1) ? [g.c1[0], g.c1[1]] : [g.c1.x, g.c1.z]
      const c2 = Array.isArray(g.c2) ? [g.c2[0], g.c2[1]] : [g.c2.x, g.c2.z]
      const before = out.length
      emit(a, c1, c2, b, out)
      for (let q = before; q < out.length; q++) hard.push(false)      // inside a curve — never hard
    } else { out.push(b); hard.push(true) }
    anchorAt.push(out.length - 1)
  }
  // a chain with fewer segments than gaps: the tail is straight, keep its anchors
  for (let i = segments.length + 1; i < points.length; i++) { out.push([points[i][0], points[i][1]]); hard.push(true); anchorAt.push(out.length - 1) }
  // ⛔ An anchor that ENDS a bezier is still an anchor: the curve stops there, so the handle is
  // broken unless the NEXT segment is also a bezier. Fix those up in one pass rather than
  // special-casing inside the emit.
  let oi = 0
  for (let i = 0; i < segments.length && i < points.length - 1; i++) {
    const g = segments[i]
    if (g?.type === 'bezier') { let k = oi + 1; while (k < out.length && !hard[k]) k++; oi = Math.min(k, out.length - 1) }
    else oi++
    const nxt = segments[i + 1]
    if (oi < hard.length) hard[oi] = !(g?.type === 'bezier' && nxt?.type === 'bezier')
  }
  out.hard = hard
  out.anchorAt = anchorAt
  return out
}

function tessellateStreet(street, spacing = 1) {
  const segs = street.segments
  if (!segs || !segs.length) return street.points.map(p => [p[0], p[1]])
  const cubic = (a, c1, c2, b, t) => {
    const u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t
    return [A * a[0] + B * c1[0] + C * c2[0] + D * b[0], A * a[1] + B * c1[1] + C * c2[1] + D * b[1]]
  }
  const out = [[segs[0].a[0], segs[0].a[1]]]
  for (const g of segs) {
    if (g.type === 'bezier') {
      const L = Math.hypot(g.c1[0] - g.a[0], g.c1[1] - g.a[1]) + Math.hypot(g.c2[0] - g.c1[0], g.c2[1] - g.c1[1]) + Math.hypot(g.b[0] - g.c2[0], g.b[1] - g.c2[1])
      const n = Math.max(2, Math.round(L / spacing))
      for (let k = 1; k <= n; k++) out.push(k === n ? [g.b[0], g.b[1]] : cubic(g.a, g.c1, g.c2, g.b, k / n))
    } else {
      out.push([g.b[0], g.b[1]])
    }
  }
  return out
}

function toClipper(x, z) {
  return new IntPoint(Math.round(x * CLIP_SCALE), Math.round(z * CLIP_SCALE))
}
function fromClipper(pt) {
  return { x: pt.X / CLIP_SCALE, z: pt.Y / CLIP_SCALE }
}
function pathFromClipper(p) {
  return p.map(fromClipper)
}

/**
 * ⭐⭐⭐ WHICH LAND USES **COVER** THIS FACE, AND BY HOW MUCH? Returns `{ lu: m² }`.
 *
 * ⛔⛔ THE CENTROID VOTE THIS REPLACES WAS BACKWARDS FOR EVERY FEATURE BIGGER THAN A BLOCK.
 * A land-use polygon voted for exactly ONE face — the one containing its centroid — however
 * many it actually covered. MEASURED: Provincetown's median block face is 6,148 m² and its
 * largest `natural=sand` polygon is 4,130,249 m², **672× the median face**;
 * `leisure=nature_reserve` runs to 29,047×. 391 of 1,406 LU features are larger than the
 * median face. So a town's beach classified one block and left the hundreds it lay across to
 * fall through to parcels or `underived`. (`BRIEF-land-use-derivation` item #2;
 * `_archive/BRIEF-field-shader-2026-10-04 §3` measured the same on huron's farmland.)
 *
 * ⭐ HOLES ARE SUBTRACTED, and that is the other half of the ruling: the clip side is filled
 * `pftEvenOdd`, so an outer ring and its islands arrive as one region with the islands
 * REMOVED. A pond inside a wood therefore votes nothing for the faces under the pond — the
 * hole does not inherit its enclosing class, and if nothing else classifies it, it surfaces
 * as `underived` rather than silently becoming wood.
 * ⛔ `pftNonZero` on the clip side would fill the holes back in, which is the whole defect.
 *
 * @returns {{ [tag: string]: { lu: string, area: number } }} keyed by the SOURCE TAG, because
 *          `luWinnerFromCoverage` needs to know whether a claim is a ground cover or a
 *          jurisdiction, and the LU class cannot carry that.
 */
/**
 * ⭐⭐⭐ A PARK IS A JURISDICTION. SAND IS A GROUND COVER. THE SURFACE WANTS WHAT THE GROUND **IS**.
 * Ruled by Jacob, 2026-09-25, verbatim: *"yes, ground cover wins."*
 *
 * ⛔⛔ THE DEFECT THAT FORCED IT, and it was mine: once a face took the class of whatever
 * COVERED it (dc0c264f), Provincetown's dunes became LAWN. Measured — `leisure=nature_reserve`
 * admits **180,227,102 m²** to the vote (the Cape Cod National Seashore) against beach's
 * 13,908,598 m². The Seashore is a line on a map saying who MANAGES the land; it says nothing
 * about whether you are standing on sand. Area share alone cannot tell those apart, so it
 * handed the whole shore to the bigger claim.
 *
 * ⭐ So the two kinds are DECLARED here, per TAG, never inferred per town and never guessed
 * from the LU class (`park` can arrive from `leisure=park`, a lawn, or from a national park
 * boundary spanning dunes and forest alike — the class cannot carry the distinction, only the
 * source tag can).
 * ⛔ A tag in NEITHER list votes as it always did. This table adds precedence; it removes
 * nothing, and it is not a skip list.
 * ⚠️ `landuse=forest` and `natural=wood` are COVER — trees on the ground are a surface. A
 * forestry *boundary* would be management, but OSM does not distinguish them by tag, and we
 * take the reading that matches what a camera sees.
 * ▶ `references/` carries the ruling and the OSM wiki citations for each tag.
 */
export const OSM_LU_KIND = {
  // ── MANAGEMENT / JURISDICTION — who looks after it, not what it is made of ──
  'leisure:nature_reserve': 'management',
  'leisure:park': 'management',
  'boundary:protected_area': 'management',
  'boundary:national_park': 'management',
  'leisure:garden': 'management',
  'leisure:recreation_ground': 'management',
  'landuse:recreation_ground': 'management',
  'landuse:village_green': 'management',
  // ── GROUND COVER — what you are standing on ──
  'natural:sand': 'cover',
  'natural:beach': 'cover',
  'natural:dune': 'cover',
  'natural:wood': 'cover',
  'natural:scrub': 'cover',
  'natural:heath': 'cover',
  'natural:grassland': 'cover',
  'natural:wetland': 'cover',
  'natural:mud': 'cover',
  'natural:shingle': 'cover',
  'natural:bare_rock': 'cover',
  'natural:scree': 'cover',
  'landuse:forest': 'cover',
  'landuse:meadow': 'cover',
  // ⛔⛔ `landuse:grass` IS DELIBERATELY NOT A COVER, and the reason is the acceptance itself.
  // A park's own lawn is tagged `landuse=grass` INSIDE `leisure=park`, so declaring it a cover
  // displaces the park — measured: Lafayette Park's four faces all flip `park → recreation`,
  // 51,429 m² of a ~48,000 m² park, i.e. all of it, and HiPointe's Forest Park face flips on
  // 162 m² of grass against 11,080 m² of park.
  // ⭐ AND IT BUYS NOTHING: `park` already renders as lawn, so the class changes and the
  // SURFACE does not. The rule exists to stop a jurisdiction hiding what the ground is made
  // of; grass under a park is not a contradiction, it is the park.
  // ⚠️ `natural:grassland` stays a cover — wild grassland is a different surface from a mown
  // lawn, and it does not arrive inside park boundaries the way `landuse=grass` does.
}

// ⭐⭐ WIDENED 2026-09-20 (`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`, ruled by Jacob). This was a
// 32-entry table holding very nearly the vocabulary Lafayette Square happens to
// contain, and a tag it lacked NEVER BECAME AN LU POLYGON AT ALL — the face fell
// to the parcel vote, else to the bare `'residential'` default. So huron's corn
// arrived as somebody's lawn, confidently. Measured across LS · huron ·
// hipointedemun · altadena at the widening: 111 distinct tags on disk with no
// home. ▶ re-derive, never quote: `node checks/claims-every-lu-tag-has-a-home.mjs`.
//
// ⛔⛔ EVERY LU-BEARING TAG IS NOW EITHER MAPPED HERE OR DECLARED IN
// `OSM_LU_DECLARED` BELOW, AND THE CHECK FAILS ON A TAG THAT IS NEITHER. That is
// the whole deliverable: "we looked and decided no" and "nobody has looked" are
// the same silence otherwise (`sources.js`'s UNDECLARED / DECLARED-NONE /
// DECLARED, arriving in a third domain).
export const OSM_TO_LU = {
  // — residential / commercial / industrial —
  'landuse:residential': 'residential',
  'landuse:retail': 'commercial', 'landuse:commercial': 'commercial',
  'amenity:fuel': 'commercial', 'amenity:cafe': 'commercial',
  'amenity:bar': 'commercial', 'amenity:restaurant': 'commercial',
  'amenity:fast_food': 'commercial', 'amenity:veterinary': 'commercial',
  'amenity:charging_station': 'commercial', 'amenity:bank': 'commercial',
  'amenity:car_wash': 'commercial', 'amenity:pub': 'commercial',
  'amenity:cinema': 'commercial', 'amenity:theatre': 'commercial',
  'amenity:events_venue': 'commercial', 'amenity:pharmacy': 'commercial',
  'amenity:dentist': 'commercial', 'amenity:doctors': 'commercial',
  'leisure:fitness_centre': 'commercial', 'leisure:bowling_alley': 'commercial',
  'leisure:marina': 'commercial', 'leisure:hackerspace': 'commercial',
  'amenity:dojo': 'commercial',
  'amenity:car_rental': 'commercial', 'amenity:payment_centre': 'commercial',   // a rental lot like car_wash, a storefront like bank (jacksonheights; Boz, 2026-10-27)
  'landuse:industrial': 'industrial', 'amenity:waste_disposal': 'industrial',
  'landuse:landfill': 'industrial', 'landuse:quarry': 'industrial',
  // — institutional: schools, worship, government, care —
  'landuse:religious': 'institutional', 'landuse:institutional': 'institutional',
  'landuse:military': 'institutional',
  'amenity:school': 'institutional', 'amenity:place_of_worship': 'institutional',
  'amenity:library': 'institutional', 'amenity:university': 'institutional',
  'amenity:fire_station': 'institutional', 'amenity:crematorium': 'institutional',
  'amenity:college': 'institutional', 'amenity:hospital': 'institutional',
  'amenity:clinic': 'institutional', 'amenity:social_facility': 'institutional',
  'amenity:community_centre': 'institutional', 'amenity:townhall': 'institutional',
  'amenity:courthouse': 'institutional', 'amenity:police': 'institutional',
  'amenity:prison': 'institutional', 'amenity:post_office': 'institutional',
  'amenity:kindergarten': 'institutional', 'amenity:childcare': 'institutional',
  'amenity:public_building': 'institutional', 'amenity:funeral_hall': 'institutional',
  'amenity:arts_centre': 'institutional',
  'amenity:nursing_home': 'institutional',   // a care facility, like social_facility (jacksonheights; Boz, 2026-10-27)
  // — recreation: managed green that is PLAYED on —
  'landuse:grass': 'recreation', 'landuse:recreation_ground': 'recreation',
  'landuse:allotments': 'recreation', 'landuse:greenery': 'recreation',
  'leisure:garden': 'recreation', 'leisure:playground': 'recreation',
  'leisure:swimming_pool': 'recreation', 'leisure:pitch': 'recreation',
  'leisure:sports_centre': 'recreation', 'leisure:golf_course': 'recreation',
  'leisure:track': 'recreation', 'leisure:stadium': 'recreation',
  'leisure:sports_hall': 'recreation', 'leisure:horse_riding': 'recreation',
  'leisure:disc_golf_course': 'recreation', 'leisure:schoolyard': 'recreation',
  // ⭐ A WOOD IS FOREST (Jacob, 2026-10-05: ruled with the land-use close-out). It sat at `recreation` — a ballfield's
  // class — as an existing decision held for his call; ground cover is what you stand on (his 2026-09-25 ruling), and
  // `natural:wood` is ground cover (`OSM_LU_KIND`), so it paints the forest floor (`litter`) like `landuse:forest`.
  'natural:wood': 'forest',
  'natural:scrub': 'recreation', 'natural:tree_row': 'recreation',
  'natural:grass': 'recreation', 'natural:grassland': 'recreation',
  'natural:shrubbery': 'recreation',
  // — park: public open space, and NOT `recreation` (a different colour, a
  //   different feel; a park is walked, a pitch is played). ⚠️ The class existed
  //   in `LU_POLICY`, `PAINT_ORDER`, `TREELAWN_LU_VARIANTS` and the palettes and
  //   had NO OSM producer at all — its only two sources were the divided-road
  //   median and LS's authored park override. `leisure:park` is in ALL FOUR towns.
  'leisure:park': 'park', 'leisure:nature_reserve': 'park', 'leisure:dog_park': 'park',
  // — the worked and the wild —
  'landuse:construction': 'vacant',
  'landuse:greenfield': 'vacant',          // undeveloped land planned for building, like construction (Jacob, 2026-10-27)
  'landuse:brownfield': 'brownfield',     // its own class, ruled by Jacob 2026-09-20
  'landuse:farmland': 'agricultural', 'landuse:meadow': 'agricultural',
  'landuse:farmyard': 'agricultural', 'landuse:plant_nursery': 'agricultural',
  // A greenhouse is a BUILDING, not a field (Jacob, 2026-09-26): under `agricultural` it
  // took the crop surface, and huron's 47 ha of glasshouse sites would have grown rows.
  'landuse:greenhouse_horticulture': 'greenhouse',
  'landuse:orchard': 'orchard',           // trees, in rows, by a farmer
  'landuse:forest': 'forest',   // and `natural:wood`, above
  'natural:wetland': 'wetland', 'natural:mud': 'wetland',
  'natural:beach': 'beach', 'natural:sand': 'beach',
  // ⭐ A DUNE IS ITS OWN SURFACE (Jacob, 2026-09-24 — `docs/briefs/BRIEF-surface-lab.md §5`).
  // ⚠️ The TAG is the smaller half of the answer, MEASURED: on Provincetown `natural:dune`
  // is 11 polygons / 3.8 ha, while `natural:sand` that MassGIS itself calls "COASTAL
  // DUNE" is 464.6 ha (▶ node scratch/marram-sand-relief.mjs). ⛔ Do not key on
  // `massgis:*` — that is a Massachusetts-only instance patch. The dunes this tag misses
  // are the SAND SURFACE's job: one generator serves `beach` + `dune`, and its dune state
  // is driven by the relief (Boz ruling, 2026-09-24), so a tag only has to be right
  // where a mapper was sure.
  'natural:dune': 'dune',
  'natural:bare_rock': 'bare', 'natural:scree': 'bare',
  'landuse:cemetery': 'cemetery', 'amenity:grave_yard': 'cemetery',
  'landuse:railway': 'railway',
  // — hardscape lots —
  'amenity:parking': 'parking', 'amenity:parking_space': 'parking',
  // — provincetown's harbour and beach brought these (2026-10-05), each mapped like its nearest kin above —
  'amenity:ranger_station': 'institutional', 'amenity:ferry_terminal': 'institutional',   // public facilities, like fire_station
  'amenity:bus_station': 'institutional',
  'amenity:waste_transfer_station': 'industrial',                                          // like waste_disposal
  'amenity:taxi': 'parking', 'landuse:garages': 'parking',                                  // a vehicle stand, a row of garages
  'leisure:resort': 'commercial',                                                           // hospitality, like a hotel's lot
}
/**
 * ⭐ The OSM tags whose `agricultural` ground grows crop ROWS (Jacob, 2026-10-05). `landuse=meadow` (hay) and
 * `landuse=farmyard` (the yard round the barns) are farmed land but not row crops — they paint grass.
 */
export const CROP_TAGS = new Set(['landuse:farmland', 'landuse:plant_nursery'])

/**
 * ⭐ THE PRECEDENCE, applied to one face's coverage tally: if any GROUND COVER covers this
 * face at all, the winner is chosen among the covers only. A management polygon keeps the
 * face only where no cover reaches it — a lawn, a field, a car park inside a park boundary.
 * ⛔ It is a FILTER, not a weight: a 180 km² reserve must not out-vote 30 m² of sand, because
 * the question is not "how much" but "what kind".
 */
export function luWinnerFromCoverage(byTag) {
  let best = null, bestA = 0, bestKind = null, bestCover = null, bestCoverA = 0
  for (const [tag, v] of Object.entries(byTag)) {
    if (v.area > bestA) { bestA = v.area; best = v.lu; bestKind = OSM_LU_KIND[tag] ?? null }
    if (OSM_LU_KIND[tag] === 'cover' && v.area > bestCoverA) { bestCoverA = v.area; bestCover = v.lu }
  }
  // ⛔⛔ THE RULE FIRES ONLY AGAINST A JURISDICTION — not against everything. It displaces a
  // MANAGEMENT winner in favour of a ground cover, and touches nothing else.
  // ⚠️ MEASURED BEFORE LANDING, and this is why the disclosure exists: an earlier cut let any
  // cover displace any winner, and LS moved 43 faces `residential → recreation` and HiPointe
  // 62 — a scatter of street trees tagged `natural=wood` turning residential blocks into
  // woodland. Residential is neither a jurisdiction nor a ground cover; it is a built land use
  // and it is not this rule's business. Jacob's wording is exact: *where a MANAGEMENT polygon
  // and a GROUND-COVER polygon both cover a face, the ground cover takes it.*
  if (bestKind === 'management' && bestCover) return bestCover
  return best
}

export function luCoverageForFace(faceRing, luPolys) {
  const out = {}
  if (!Array.isArray(faceRing) || faceRing.length < 3) return out
  let fMinX = Infinity, fMaxX = -Infinity, fMinZ = Infinity, fMaxZ = -Infinity
  for (const p of faceRing) {
    const x = p[0] ?? p.x, z = p[1] ?? p.z
    if (x < fMinX) fMinX = x; if (x > fMaxX) fMaxX = x
    if (z < fMinZ) fMinZ = z; if (z > fMaxZ) fMaxZ = z
  }
  const facePath = faceRing.map(p => toClipper(p[0] ?? p.x, p[1] ?? p.z))
  // ⛔⛔ ONE TAG IS ONE CLAIM: its features' overlaps are UNIONED, never summed. Summing
  // counted ground twice wherever a town maps one tag nested or overlapping. MEASURED on
  // huron: two `landuse=greenhouse_horticulture` polygons (Mucci Farms, 33.1 ha lying wholly
  // inside 47.1 ha) voted 80.2 ha, beat farmland's 56.2 ha, and painted a 156 ha block
  // `greenhouse`. Each feature is still cut as outer MINUS its own holes first; only then are
  // the pieces merged, NonZero, so one feature's hole is filled only where another covers it.
  const byTag = new Map()
  for (const o of luPolys) {
    // cheap reject — a boolean op per (face × feature) is the whole cost of this vote
    if (o.bb[0] > fMaxX || o.bb[1] < fMinX || o.bb[2] > fMaxZ || o.bb[3] < fMinZ) continue
    const c = new Clipper()
    c.AddPath(facePath, PolyType.ptSubject, true)
    c.AddPath(o.ring.map(q => toClipper(q.x ?? q[0], q.z ?? q[1])), PolyType.ptClip, true)
    for (const h of o.holes || []) c.AddPath(h.map(q => toClipper(q.x ?? q[0], q.z ?? q[1])), PolyType.ptClip, true)
    const sol = new Paths()
    if (!c.Execute(ClipType.ctIntersection, sol, PolyFillType.pftNonZero, PolyFillType.pftEvenOdd)) continue
    if (!sol.length) continue
    const e = byTag.get(o.tag) || (byTag.set(o.tag, { lu: o.lu, paths: [] }), byTag.get(o.tag))
    for (const path of sol) e.paths.push(path)
  }
  for (const [tag, { lu, paths }] of byTag) {
    const u = new Clipper()
    u.AddPaths(paths, PolyType.ptSubject, true)
    const merged = new Paths()
    if (!u.Execute(ClipType.ctUnion, merged, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) continue
    // ⛔⛔ SUM THE SIGNED AREAS, THEN TAKE THE MAGNITUDE ONCE. `Math.abs` PER PATH destroys
    // the hole's sign and ADDS it instead of subtracting — a 40,000 m² wood with a 10,000 m²
    // pond measured 50,000 m² rather than 30,000, i.e. the hole voted for its own enclosing
    // class, twice over. ⭐ Caught by this function's own check, not by reading it.
    let a = 0
    for (const path of merged) a += Clipper.Area(path) / (CLIP_SCALE * CLIP_SCALE)
    a = Math.abs(a)
    if (a > 0) out[tag] = { lu, area: a }
  }
  return out
}

/**
 * ⭐⭐⭐ THE LAND IS PAINTED BY ITS EVIDENCE, POLYGON BY POLYGON (Jacob, 2026-10-05).
 * A block can be half a row of houses and half a field — Huron's tile 6 is 27% mapped field, 26% residential
 * parcels and 195 buildings — and one class per block paints one half wrong. So the paint reads the
 * evidence itself, as a set of DISJOINT regions, each with its class:
 *   1. an OSM land-use polygon paints its class where it lies — ground COVER over an untyped tag over a
 *      MANAGEMENT boundary (`OSM_LU_KIND`, the face vote's own precedence), and within a kind the SMALLER
 *      polygon over the larger (the more specific claim; "smallest containing face" kept as a layering);
 *   2. elsewhere each readable assessor parcel paints its class (unreadable codes are not evidence);
 *   3. ground neither reaches is NOT here — the painter leaves it `underived` (grass), by Jacob's ruling.
 * ⛔ Where parcels of DIFFERENT classes overlap, the overlap is evidence of nothing: it goes to neither and is
 * COUNTED (`parcelConflictM2`), never handed to whichever class came first.
 * @param osm      the vote's own polygons: [{ lu, tag, ring:[{x,z}], holes }]
 * @param parcels  [{ lu, rings:[[x,z]...] }] — readable parcels only
 * @param cdl      the CDL's crop region, [[x,z]...] rings, or null (cartograph/cdl.mjs)
 * ⭐ Every region carries `crop`: whether its ground grows crop ROWS (Jacob, 2026-10-05). True on a mapped field
 * (`CROP_TAGS`) and on farmland the CDL reads as crop — a farm parcel's CDL-crop part, and ground no other evidence
 * reaches where the CDL reads crop (src 'cdl'). False on meadow and farmyard (grass, by his ruling) and on a farm
 * parcel's ground the CDL does not read as crop.
 * @returns {{ evidence: [{ lu, src: 'osm'|'parcel'|'cdl', tag?, crop?, rings: [[x,z]...] }], parcelConflictM2: number, cdlM2: number,
 *   pinchDropped: { n, m2, outer, hole, orphan, revisits, at } }} — `pinchDropped`: the loops below the lattice the pinch split
 *   cut off (counted, never silent: off an outer it is evidence removed, off a hole evidence filled), and the revisits cut into lobes
 * ▶ node checks/claims-the-land-is-painted-by-its-evidence.mjs
 */
export function layerLandEvidence(osm, parcels, cdl = null) {
  const rank = (tag) => OSM_LU_KIND[tag] === 'cover' ? 0 : OSM_LU_KIND[tag] === 'management' ? 2 : 1
  const pathOf = (r) => r.map(q => toClipper(q.x ?? q[0], q.z ?? q[1]))
  const regionOf = (outer, holes) => {     // outer MINUS its holes, as Clipper paths
    const c = new Clipper(); c.AddPath(pathOf(outer), PolyType.ptSubject, true)
    for (const h of holes || []) if (h?.length >= 3) c.AddPath(pathOf(h), PolyType.ptClip, true)
    const out = new Paths(); c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return out
  }
  const op = (type, a, b) => { const c = new Clipper(); c.AddPaths(a, PolyType.ptSubject, true); if (b.length) c.AddPaths(b, PolyType.ptClip, true)
    const out = new Paths(); c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return out }
  const areaOf = (ps) => Math.abs(ps.reduce((t, q) => t + Clipper.Area(q), 0)) / (CLIP_SCALE * CLIP_SCALE)
  const toRings = (ps) => ps.map(q => q.map(pt => [pt.X / CLIP_SCALE, pt.Y / CLIP_SCALE]))
  const evidence = []
  const cdlPaths = cdl?.length ? op(ClipType.ctUnion, cdl.filter(r => r?.length >= 3).map(pathOf), []) : []
  const bbOf = (ps) => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const q of ps) for (const pt of q) { if (pt.X < b[0]) b[0] = pt.X; if (pt.X > b[1]) b[1] = pt.X; if (pt.Y < b[2]) b[2] = pt.Y; if (pt.Y > b[3]) b[3] = pt.Y } return b }
  const meets = (a, b) => !(a[0] > b[1] || a[1] < b[0] || a[2] > b[3] || a[3] < b[2])
  // ⭐ Each polygon is differenced only against the earlier claims its bbox meets — never against one growing
  // union of everything (that was O(n²) and ran past 9 minutes on hipointedemun's 4,959 polygons).
  const claims = []
  const items = (osm || []).filter(o => o?.ring?.length >= 3).map(o => ({ o, region: regionOf(o.ring, o.holes) }))
    .map(x => ({ ...x, a: areaOf(x.region), k: rank(x.o.tag), bb: bbOf(x.region) })).filter(x => x.a > 0)
    .sort((x, y) => x.k - y.k || x.a - y.a)
  for (const { o, region, bb } of items) {
    const over = claims.filter(c => meets(c.bb, bb)).flatMap(c => c.region)
    const mine = over.length ? op(ClipType.ctDifference, region, over) : region
    if (areaOf(mine) > 0) evidence.push({ lu: o.lu, src: 'osm', tag: o.tag, ...(o.lu === 'agricultural' ? { crop: CROP_TAGS.has(o.tag) } : {}), rings: toRings(mine) })
    claims.push({ region, bb })
  }
  const claimed = claims.length ? op(ClipType.ctUnion, claims.flatMap(c => c.region), []) : new Paths()
  // parcels: one region per class, minus the OSM evidence, minus every OTHER class's parcels (a conflict)
  const byClass = new Map()
  for (const p of parcels || []) for (const r of p.rings || []) if (r?.length >= 3) (byClass.get(p.lu) || byClass.set(p.lu, []).get(p.lu)).push(pathOf(r))
  const unions = new Map([...byClass].map(([lu, ps]) => [lu, op(ClipType.ctUnion, ps, [])]))
  let parcelConflictM2 = 0
  for (const [lu, u] of unions) {
    const others = [...unions].filter(([l]) => l !== lu).flatMap(([, q]) => q)
    const free = op(ClipType.ctDifference, u, [...claimed, ...others])
    const conflict = others.length ? op(ClipType.ctIntersection, op(ClipType.ctDifference, u, claimed), others) : []
    parcelConflictM2 += areaOf(conflict) / 2      // each overlap is seen from both classes
    if (!(areaOf(free) > 0)) continue
    if (lu !== 'agricultural') { evidence.push({ lu, src: 'parcel', rings: toRings(free) }); continue }
    // a farm parcel: crop where the CDL reads crop, grass elsewhere
    const rows = cdlPaths.length ? op(ClipType.ctIntersection, free, cdlPaths) : []
    const rest = rows.length ? op(ClipType.ctDifference, free, cdlPaths) : free
    if (areaOf(rows) > 0) evidence.push({ lu, src: 'parcel', crop: true, cropSource: 'usda-cdl', rings: toRings(rows) })
    if (areaOf(rest) > 0) evidence.push({ lu, src: 'parcel', crop: false, rings: toRings(rest) })
  }
  // ground no OSM polygon and no parcel reaches: crop where the CDL reads crop
  let cdlM2 = 0
  if (cdlPaths.length) {
    const taken = op(ClipType.ctUnion, [...claimed, ...[...unions.values()].flat()], [])
    const open_ = op(ClipType.ctDifference, cdlPaths, taken)
    cdlM2 = areaOf(open_)
    if (cdlM2 > 0) evidence.push({ lu: 'agricultural', src: 'cdl', crop: true, cropSource: 'usda-cdl', rings: toRings(open_) })
  }
  // ⭐ ONE PARTITION LEAVES (Boz's ruling, 2026-10-21, on HPDM's stamp refusal). Each region above is cut by its OWN boolean,
  // and each boolean rounds its own crossings, so where two regions meet their shared boundary left as two polylines up to a
  // lattice step apart, and the stamp could not settle on them (then tileGround#stampCrossings; the stamp now nodes through latticeNode.js#nodeCrossings). The paint's own noding rule
  // (src/lib/latticeNode.js#nodeAcrossGroups at NODE_BOUND, imported, one rule for both producers) joins them: every region is
  // its own group, and a vertex of one within the bound of another's edge is inserted into that edge, both ways, to a
  // fixpoint. Insert-only: ownership, the precedence above and parcelConflictM2 are untouched; a vertex farther off is a
  // separate line and is left as it is. ▶ node checks/claims-a-land-use-boundary-is-one-line.mjs
  // ⭐ FIRST, EACH REGION'S OWN PINCHES ARE SPLIT (Boz's ruling (b), 2026-10-21): a boolean can leave a ring that passes within
  // the bound of its OWN vertex, and the noder puts a point into a ring once (it would fold a needle), so a neighbour's
  // vertex at that point stayed off the pinching edge (HPDM, 11 sites after noding alone). The paint's own split
  // (latticeNode.js#splitAtPinches, the flatten's rule: cut at the pinch, a loop thinner than a step dropped and counted)
  // runs first, so the noder meets rings that do not pass near their own vertices.
  const pinchSub = {}
  evidence.forEach((e, i) => { e.rings = splitAtPinches(e.rings, `${e.src}:${e.lu}#${i}`, pinchSub, { who: 'land evidence' })
    .flatMap(it => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]) })
  const noded = nodeAcrossGroups(evidence.map((e, i) => ({ groupKey: `${e.src}:${e.lu}#${i}`, items: e.rings })), { who: 'land evidence' })
  noded.forEach((n, i) => { evidence[i].rings = n.items })
  // ⭐ AND SPLIT AGAIN (Boz's ruling (ii), 2026-10-21): a vertex the noder inserts can itself be a pinch in the ring that
  // receives it (HPDM osm:institutional#3973, 0.38 mm: 0 necks before the noding, 1 after). A split only cuts at a pinch and
  // drops loops below the lattice; it is not a second noding round. ⛔ Not looped: what this split leaves is what leaves.
  evidence.forEach((e, i) => { e.rings = splitAtPinches(e.rings, `${e.src}:${e.lu}#${i}`, pinchSub, { who: 'land evidence, after the noding' })
    .flatMap(it => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]) })
  // ⭐ WHAT THE SPLIT DROPPED IS REPORTED (Zob, 2026-10-21: a silent drop otherwise), as the flatten's subLattice goes into ground.json
  const dropped = Object.values(pinchSub).flatMap(v => v.pinches || [])
  const pinchDropped = { n: dropped.length, m2: +dropped.reduce((t, d) => t + d.m2, 0).toFixed(9),
    outer: dropped.filter(d => d.from === 'outer').length, hole: dropped.filter(d => d.from === 'hole').length, orphan: dropped.filter(d => d.from === 'orphan').length,
    revisits: Object.values(pinchSub).reduce((t, v) => t + (v.revisits || 0), 0), at: dropped.slice(0, 5).map(d => d.at) }
  return { evidence, parcelConflictM2, cdlM2, pinchDropped }
}

/**
 * ⭐⭐ THE PARCEL RUNG WEIGHS BY AREA (Jacob, 2026-10-05 — "yes to underived grass and the rest").
 * A face no OSM land use covers takes the class its assessor parcels cover MOST OF, by the area each
 * parcel shares with the face. ⛔ It used to COUNT parcels: huron's tile 21 is 133.1 ha of farm parcels
 * (8) against 4.3 ha of house lots (8) — the count tied and LIST ORDER handed 129 ha of farmland to
 * `residential`. ⛔ A parcel whose code cannot be read ABSTAINS — it is evidence of nothing, so it may
 * not vote `underived` over a readable neighbour by sheer size. ⛔ A genuine tie (equal area on the
 * Clipper lattice) is RETURNED as a tie, never broken by order — the caller paints it `underived` and
 * says so. ▶ node checks/claims-parcels-vote-by-area.mjs
 * @returns {{ use: string|null, byUse: object, tie?: string[], tieArea?: number }}
 */
export function parcelWinnerByArea(faceRing, parcels, classify) {
  const byUse = {}
  if (!Array.isArray(faceRing) || faceRing.length < 3) return { use: null, byUse }
  const facePath = faceRing.map(p => toClipper(p.x ?? p[0], p.z ?? p[1]))
  for (const p of parcels || []) {
    const u = classify(p)
    if (!u || u === UNDERIVED) continue                     // unreadable: abstains
    const rings = (p.rings || []).filter(r => Array.isArray(r) && r.length >= 3)
    if (!rings.length) continue
    const c = new Clipper()
    c.AddPath(facePath, PolyType.ptSubject, true)
    for (const r of rings) c.AddPath(r.map(q => toClipper(q.x ?? q[0], q.z ?? q[1])), PolyType.ptClip, true)
    const sol = new Paths()
    if (!c.Execute(ClipType.ctIntersection, sol, PolyFillType.pftNonZero, PolyFillType.pftEvenOdd)) continue
    let a = 0; for (const path of sol) a += Clipper.Area(path); a = Math.abs(a)   // lattice units: exact, so a tie is a tie
    if (a > 0) byUse[u] = (byUse[u] || 0) + a
  }
  const ranked = Object.entries(byUse).sort((x, y) => y[1] - x[1])
  if (!ranked.length) return { use: null, byUse }
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    const tie = ranked.filter(r => r[1] === ranked[0][1]).map(r => r[0]).sort()
    return { use: null, byUse, tie, tieArea: ranked[0][1] / (CLIP_SCALE * CLIP_SCALE) }
  }
  return { use: ranked[0][0], byUse }
}

// Ray-casting point-in-polygon for {x, z} rings (from polygonize output)
function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, zi = ring[i].z
    const xj = ring[j].x, zj = ring[j].z
    if ((zi > pz) !== (zj > pz) &&
        px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function roundCorners(paths, radius) {
  if (radius <= 0) return paths
  const r = radius * CLIP_SCALE
  const co1 = new ClipperOffset()
  co1.ArcTolerance = ARC_TOL
  co1.AddPaths(paths, JoinType.jtRound, EndType.etClosedPolygon)
  const shrunk = new Paths()
  co1.Execute(shrunk, -r)
  if (shrunk.length === 0) return paths
  const co2 = new ClipperOffset()
  co2.ArcTolerance = ARC_TOL
  co2.AddPaths(shrunk, JoinType.jtRound, EndType.etClosedPolygon)
  const rounded = new Paths()
  co2.Execute(rounded, r)
  return rounded
}

function shrinkPaths(paths, dist) {
  const co = new ClipperOffset()
  co.ArcTolerance = ARC_TOL
  co.AddPaths(paths, JoinType.jtRound, EndType.etClosedPolygon)
  const result = new Paths()
  co.Execute(result, -dist * CLIP_SCALE)
  return result
}

function bufferPolyline(coords, halfWidth) {
  let path = coords.map(c => toClipper(c.x, c.z))

  // If closed (first ≈ last), remove last point so Clipper treats as open path.
  // Otherwise a closed loop buffer fills the interior.
  if (path.length > 2) {
    const first = path[0], last = path[path.length - 1]
    if (Math.abs(first.X - last.X) < 1 * CLIP_SCALE && Math.abs(first.Y - last.Y) < 1 * CLIP_SCALE) {
      path = path.slice(0, -1)
    }
  }

  const co = new ClipperOffset()
  co.ArcTolerance = ARC_TOL
  co.AddPath(path, JoinType.jtRound, EndType.etOpenRound)
  const result = new Paths()
  co.Execute(result, halfWidth * CLIP_SCALE)
  return result
}

function unionAll(pathSets) {
  if (pathSets.length === 0) return new Paths()
  const allPaths = new Paths()
  for (const ps of pathSets) {
    for (let i = 0; i < ps.length; i++) allPaths.push(ps[i])
  }
  const c = new Clipper()
  c.AddPaths(allPaths, PolyType.ptSubject, true)
  const result = new Paths()
  c.Execute(ClipType.ctUnion, result, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return result
}

/**
 * Generate contour lines from elevation grid using marching squares.
 * Returns array of { coords: [{x, z}], elev: number }
 */
function generateContours(elevData, interval) {
  const pts = elevData.points
  if (!pts || pts.length < 4) return []

  // Build a regular grid from the scattered points
  const xs = [...new Set(pts.map(p => p.x))].sort((a, b) => a - b)
  const zs = [...new Set(pts.map(p => p.z))].sort((a, b) => a - b)
  if (xs.length < 2 || zs.length < 2) return []

  const nx = xs.length, nz = zs.length

  // Index points into grid
  const grid = Array.from({ length: nz }, () => new Float64Array(nx))
  const ptMap = {}
  for (const p of pts) {
    ptMap[`${p.x},${p.z}`] = p.elev
  }
  for (let zi = 0; zi < nz; zi++) {
    for (let xi = 0; xi < nx; xi++) {
      grid[zi][xi] = ptMap[`${xs[xi]},${zs[zi]}`] ?? NaN
    }
  }

  // Generate contours at each level
  const minElev = Math.ceil(elevData.minElev / interval) * interval
  const maxElev = Math.floor(elevData.maxElev / interval) * interval
  const contours = []

  for (let level = minElev; level <= maxElev; level += interval) {
    // Marching squares for this level
    const segments = []

    for (let zi = 0; zi < nz - 1; zi++) {
      for (let xi = 0; xi < nx - 1; xi++) {
        const v00 = grid[zi][xi], v10 = grid[zi][xi + 1]
        const v01 = grid[zi + 1][xi], v11 = grid[zi + 1][xi + 1]
        if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) continue

        const x0 = xs[xi], x1 = xs[xi + 1]
        const z0 = zs[zi], z1 = zs[zi + 1]

        // Classify corners (above/below level)
        const code = (v00 >= level ? 8 : 0) | (v10 >= level ? 4 : 0) |
                     (v11 >= level ? 2 : 0) | (v01 >= level ? 1 : 0)
        if (code === 0 || code === 15) continue

        // Interpolate edge crossings
        const lerp = (va, vb, a, b) => a + (level - va) / (vb - va) * (b - a)
        const top    = { x: lerp(v00, v10, x0, x1), z: z0 }
        const bottom = { x: lerp(v01, v11, x0, x1), z: z1 }
        const left   = { x: x0, z: lerp(v00, v01, z0, z1) }
        const right  = { x: x1, z: lerp(v10, v11, z0, z1) }

        // Standard marching squares lookup
        const edges = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]],
          4: [[top, right]], 5: [[top, left], [bottom, right]], 6: [[top, bottom]],
          7: [[top, left]], 8: [[top, left]], 9: [[top, bottom]],
          10: [[top, right], [bottom, left]], 11: [[top, right]],
          12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
        }

        const segs = edges[code]
        if (segs) {
          for (const [a, b] of segs) {
            segments.push([
              { x: Math.round(a.x * 100) / 100, z: Math.round(a.z * 100) / 100 },
              { x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100 },
            ])
          }
        }
      }
    }

    // Chain segments into polylines
    if (segments.length > 0) {
      const chains = chainSegments(segments)
      for (const chain of chains) {
        contours.push({ coords: chain, elev: level })
      }
    }
  }

  return contours
}

/**
 * Chain disconnected line segments into continuous polylines.
 */
function chainSegments(segments) {
  const SNAP = 0.5
  const used = new Set()
  const chains = []

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue
    used.add(i)

    const chain = [segments[i][0], segments[i][1]]

    // Extend forward
    let changed = true
    while (changed) {
      changed = false
      const tail = chain[chain.length - 1]
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const [a, b] = segments[j]
        if (Math.abs(a.x - tail.x) < SNAP && Math.abs(a.z - tail.z) < SNAP) {
          chain.push(b); used.add(j); changed = true; break
        }
        if (Math.abs(b.x - tail.x) < SNAP && Math.abs(b.z - tail.z) < SNAP) {
          chain.push(a); used.add(j); changed = true; break
        }
      }
    }

    // Extend backward
    changed = true
    while (changed) {
      changed = false
      const head = chain[0]
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const [a, b] = segments[j]
        if (Math.abs(a.x - head.x) < SNAP && Math.abs(a.z - head.z) < SNAP) {
          chain.unshift(b); used.add(j); changed = true; break
        }
        if (Math.abs(b.x - head.x) < SNAP && Math.abs(b.z - head.z) < SNAP) {
          chain.unshift(a); used.add(j); changed = true; break
        }
      }
    }

    if (chain.length >= 2) chains.push(chain)
  }

  return chains
}

/**
 * Calibrate street half-widths from streetlamp positions.
 * Lamps sit on sidewalks/tree lawns — their perpendicular distance
 * from the street centerline tells us where the curb is.
 */
function calibrateFromLamps(highways, lamps) {
  const widths = {}
  if (!lamps.length) return widths

  const streets = highways.filter(f =>
    ['residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
     'tertiary', 'tertiary_link', 'unclassified'].includes(f.tags?.highway) &&
    f.tags?.name && f.coords.length >= 2
  )

  for (const st of streets) {
    const name = st.tags.name
    if (widths[name]) continue

    const coords = st.coords
    const dx = coords[coords.length - 1].x - coords[0].x
    const dz = coords[coords.length - 1].z - coords[0].z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 5) continue

    const nx = -dz / len, nz = dx / len
    const mx = (coords[0].x + coords[coords.length - 1].x) / 2
    const mz = (coords[0].z + coords[coords.length - 1].z) / 2

    const distances = []
    for (const lamp of lamps) {
      const lx = lamp.x - mx, lz = lamp.z - mz
      const along = lx * dx / len + lz * dz / len
      const perp = Math.abs(lx * nx + lz * nz)
      if (Math.abs(along) < len / 2 + 20 && perp < 25) {
        distances.push(perp)
      }
    }

    if (distances.length >= 2) {
      distances.sort((a, b) => a - b)
      // Closest lamp = curb position (lamps are at the curb/tree lawn)
      // Use the 2nd closest to avoid outliers
      widths[name] = distances.length >= 3
        ? distances[Math.floor(distances.length * 0.25)]
        : distances[0]
    }
  }

  return widths
}

/**
 * Detect divided boulevards — paired one-way streets with the same name
 * running in opposite directions close together.
 * Returns { streetName: gapBetweenCenterlines }
 */
/**
 * For each street segment, find the nearest streetlamp along the street
 * and use its perpendicular distance as the curb width. That width
 * propagates to adjacent segments until another lamp overrides it.
 */
/**
 * Lamp constraint solver: every lamp must be inside a block.
 * For each lamp outside all blocks, expand the nearest block edge outward.
 *
 * Algorithm:
 * 1. Test each lamp — inside any block?
 * 2. For lamps outside: find nearest block edge segment
 * 3. Group failed lamps by which block edge they're nearest to
 * 4. For each edge with failed lamps, push that edge out by the max lamp distance
 * 5. The edge stays straight — just shifted outward along its normal
 */
function solveLampConstraints(blocks, lamps) {
  if (!lamps.length || !blocks.length) return blocks

  // Convert blocks to JS arrays for manipulation
  const jsBlocks = []
  for (let i = 0; i < blocks.length; i++) {
    jsBlocks.push(blocks[i].map(pt => ({ X: pt.X, Y: pt.Y })))
  }

  // Test each lamp
  const failed = [] // lamps outside all blocks
  for (const lamp of lamps) {
    const lx = Math.round(lamp.x * CLIP_SCALE)
    const lz = Math.round(lamp.z * CLIP_SCALE)
    const pt = new IntPoint(lx, lz)

    let inside = false
    for (let bi = 0; bi < blocks.length; bi++) {
      if (Clipper.PointInPolygon(pt, blocks[bi]) !== 0) {
        inside = true
        break
      }
    }

    if (!inside) {
      failed.push({ x: lx, z: lz })
    }
  }

  console.log(`    ${failed.length} lamps outside blocks (of ${lamps.length})`)
  if (failed.length === 0) return blocks

  // For each failed lamp, find nearest block edge
  const edgeAdjustments = [] // { blockIdx, edgeIdx, distance }

  for (const lamp of failed) {
    let bestDist = Infinity
    let bestBlock = -1
    let bestEdge = -1
    let bestNormalDist = 0

    for (let bi = 0; bi < jsBlocks.length; bi++) {
      const block = jsBlocks[bi]
      for (let ei = 0; ei < block.length; ei++) {
        const a = block[ei]
        const b = block[(ei + 1) % block.length]

        // Distance from lamp to this edge segment
        const edx = b.X - a.X, edz = b.Y - a.Y
        const len2 = edx * edx + edz * edz
        if (len2 < 1) continue

        const t = Math.max(0, Math.min(1,
          ((lamp.x - a.X) * edx + (lamp.z - a.Y) * edz) / len2
        ))
        const projX = a.X + t * edx
        const projZ = a.Y + t * edz
        const dx = lamp.x - projX, dz = lamp.z - projZ
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist < bestDist) {
          bestDist = dist
          bestBlock = bi
          bestEdge = ei

          // Normal distance (how far to push the edge)
          const len = Math.sqrt(len2)
          const nx = -edz / len, nz = edx / len
          bestNormalDist = (lamp.x - a.X) * nx + (lamp.z - a.Y) * nz
        }
      }
    }

    if (bestBlock >= 0 && bestDist < 30 * CLIP_SCALE) {
      edgeAdjustments.push({
        blockIdx: bestBlock,
        edgeIdx: bestEdge,
        normalDist: bestNormalDist,
        lampDist: bestDist,
      })
    }
  }

  // Group adjustments by block+edge, take max distance per edge
  const edgeMax = {} // "blockIdx:edgeIdx" → max normal distance
  for (const adj of edgeAdjustments) {
    const key = `${adj.blockIdx}:${adj.edgeIdx}`
    const existing = edgeMax[key]
    if (!existing || Math.abs(adj.normalDist) > Math.abs(existing)) {
      edgeMax[key] = adj.normalDist
    }
  }

  console.log(`    ${Object.keys(edgeMax).length} block edges need adjustment`)

  // Apply adjustments: push each edge's two vertices outward along the edge normal
  // Include neighboring edges (propagate until we hit an edge that has its own lamp)
  const edgesWithLamps = new Set(Object.keys(edgeMax))

  for (const [key, normalDist] of Object.entries(edgeMax)) {
    const [bi, ei] = key.split(':').map(Number)
    const block = jsBlocks[bi]
    const n = block.length

    const a = block[ei]
    const b = block[(ei + 1) % n]
    const edx = b.X - a.X, edz = b.Y - a.Y
    const len = Math.sqrt(edx * edx + edz * edz)
    if (len < 1) continue

    // Outward normal (push away from block center)
    const nx = -edz / len, nz = edx / len

    // Determine push direction (toward the lamp, not away)
    const push = normalDist > 0 ? 1 : -1
    const amount = Math.abs(normalDist) + 2 * CLIP_SCALE // add 2m margin so lamp is clearly inside

    // Move both vertices of this edge
    a.X += nx * amount * push
    a.Y += nz * amount * push
    b.X += nx * amount * push
    b.Y += nz * amount * push

    // Propagate to adjacent edges if they don't have their own lamp adjustment
    // Forward
    for (let k = 1; k < n; k++) {
      const nextEi = (ei + 1 + k) % n
      const nextKey = `${bi}:${nextEi}`
      if (edgesWithLamps.has(nextKey)) break
      const v = block[(ei + 1 + k) % n]
      v.X += nx * amount * push
      v.Y += nz * amount * push
    }
    // Backward
    for (let k = 1; k < n; k++) {
      const prevEi = (ei - k + n) % n
      const prevKey = `${bi}:${prevEi}`
      if (edgesWithLamps.has(prevKey)) break
      const v = block[(ei - k + n) % n]
      v.X += nx * amount * push
      v.Y += nz * amount * push
    }
  }

  // Convert back to Clipper Paths
  const result = new Paths()
  for (const block of jsBlocks) {
    const path = block.map(pt => new IntPoint(pt.X, pt.Y))
    result.push(path)
  }

  // Verify improvement
  let nowInside = 0
  for (const lamp of failed) {
    const pt = new IntPoint(lamp.x, lamp.z)
    for (let bi = 0; bi < result.length; bi++) {
      if (Clipper.PointInPolygon(pt, result[bi]) !== 0) { nowInside++; break }
    }
  }
  console.log(`    Fixed ${nowInside} of ${failed.length} failed lamps`)

  return result
}

function calibrateSegmentsFromLamps(streets, lamps, survey, nameWidths) {
  const widths = new Array(streets.length)

  for (let si = 0; si < streets.length; si++) {
    const f = streets[si]
    const name = f.tags?.name
    const coords = f.coords
    if (coords.length < 2) { widths[si] = 7; continue }

    const dx = coords[coords.length-1].x - coords[0].x
    const dz = coords[coords.length-1].z - coords[0].z
    const len = Math.sqrt(dx*dx + dz*dz)
    if (len < 1) { widths[si] = 7; continue }

    const nx = -dz/len, nz = dx/len
    const mx = (coords[0].x + coords[coords.length-1].x) / 2
    const mz = (coords[0].z + coords[coords.length-1].z) / 2

    // Find the closest lamp to this segment (along + perpendicular)
    let bestLampDist = Infinity
    let bestPerp = null

    for (const lamp of lamps) {
      const lx = lamp.x - mx, lz = lamp.z - mz
      const along = lx * dx/len + lz * dz/len
      const perp = Math.abs(lx * nx + lz * nz)

      // Lamp must be within reach along the street and reasonably close perpendicular
      if (perp > 1 && perp < 30) {
        // Distance along street — allow extending beyond segment to catch propagation
        const alongDist = Math.max(0, Math.abs(along) - len/2)
        // Total "closeness" — prefer lamps near this segment
        const totalDist = alongDist + perp * 0.1 // slight preference for closer perp
        if (totalDist < bestLampDist) {
          bestLampDist = totalDist
          bestPerp = perp
        }
      }
    }

    if (bestPerp !== null && bestLampDist < 100) {
      // Lamp found — use its perpendicular distance
      widths[si] = bestPerp
    } else if (name && nameWidths[name]) {
      widths[si] = nameWidths[name]
    } else if (name && survey[name]?.rowWidth) {
      widths[si] = survey[name].rowWidth / 2
    } else {
      widths[si] = 7
    }
  }

  return widths
}

function detectDividedStreets(streets) {
  const oneway = streets.filter(f => isOneway(f.tags) && f.tags?.name)

  // Group by name
  const byName = {}
  for (const f of oneway) {
    if (!byName[f.tags.name]) byName[f.tags.name] = []
    byName[f.tags.name].push(f)
  }

  const gaps = {}
  for (const [name, segs] of Object.entries(byName)) {
    if (segs.length < 2) continue

    // Find pairs going opposite directions at similar locations
    for (let i = 0; i < segs.length; i++) {
      const c0 = segs[i].coords
      const dx0 = c0[c0.length-1].x - c0[0].x, dz0 = c0[c0.length-1].z - c0[0].z
      const len0 = Math.sqrt(dx0*dx0 + dz0*dz0)
      if (len0 < 10) continue
      const ang0 = Math.atan2(dz0, dx0)
      const mx0 = (c0[0].x + c0[c0.length-1].x) / 2
      const mz0 = (c0[0].z + c0[c0.length-1].z) / 2

      for (let j = i + 1; j < segs.length; j++) {
        const c1 = segs[j].coords
        const dx1 = c1[c1.length-1].x - c1[0].x, dz1 = c1[c1.length-1].z - c1[0].z
        const len1 = Math.sqrt(dx1*dx1 + dz1*dz1)
        if (len1 < 10) continue
        const ang1 = Math.atan2(dz1, dx1)

        // Opposite directions: angles differ by ~PI
        let angleDiff = Math.abs(ang0 - ang1)
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff

        if (angleDiff > 2.5) { // ~143°+ = roughly opposite
          // Measure perpendicular gap between midpoints
          const nx = -dz0/len0, nz = dx0/len0
          const mx1 = (c1[0].x + c1[c1.length-1].x) / 2
          const mz1 = (c1[0].z + c1[c1.length-1].z) / 2
          const gap = Math.abs((mx1-mx0)*nx + (mz1-mz0)*nz)

          if (gap > 2 && gap < 30) {
            gaps[name] = Math.max(gaps[name] || 0, gap)
          }
        }
      }
    }
  }

  return gaps
}

// `classify` is deriveLayers's jurisdiction-aware parcel classifier (it takes a
// PARCEL, not a bare code — the code alone is ambiguous across the two assessor
// taxonomies) and is threaded in rather than imported so the pour-time tally in
// `luStats` counts every parcel exactly once, from one place.
// ⭐ Every PART of a parcel is emitted (`parcelParts`): a multipart parcel's rings[0] is one part of several, in no
// promised order. Each part is clipped on its own, to the block that holds the parcel's centroid (of a multipart parcel:
// when the centroid lies in that part), else a point inside the part (`pointInside`). Every part's ring carries the parcel's
// `parcelId` (minted at the load, `parcelId`). ▶ checks/claims-a-parcel-keeps-all-its-parts.mjs
export function clipParcelsToRoundedBlocks(parcels, roundedBlocks, classify) {
  const result = []
  for (const p of parcels) { const parts = parcelParts(p.rings, p.handle ?? p.address ?? 'a parcel')
  // classified once per parcel, at its first emitted part, however many parts: the tally counts parcels
  let classified = false, use = null
  const useOf = () => { if (!classified) { use = classify(p); classified = true } return use }
  for (const { outer } of parts) {
    const parcelPath = outer.map(pt => toClipper(pt[0], pt[1]))

    // Find which rounded block holds this part's test point
    const own = !!p.centroid && (parts.length === 1 || pointInRing(p.centroid[0], p.centroid[1], outer.map(([x, z]) => ({ x, z }))))
    const [tx, tz] = own ? p.centroid : pointInside(outer)
    const testPt = new IntPoint(Math.round(tx * CLIP_SCALE), Math.round(tz * CLIP_SCALE))

    let blockIdx = -1
    for (let i = 0; i < roundedBlocks.length; i++) {
      if (Clipper.PointInPolygon(testPt, roundedBlocks[i]) !== 0) {
        blockIdx = i; break
      }
    }

    if (blockIdx === -1) {
      // Not in any rounded block — keep as-is
      result.push({
        ring: outer.map(pt => ({ x: pt[0], z: pt[1] })),
        ...(p.parcelId != null ? { parcelId: p.parcelId } : {}),
        use: useOf(),
        vacant: p.vacant ?? null,   // ⛔ a well without the column is null, never "not vacant"
      })
      continue
    }

    // Clip parcel to rounded block
    const clipper = new Clipper()
    const subj = new Paths(); subj.push(parcelPath)
    const clip = new Paths(); clip.push(roundedBlocks[blockIdx])
    clipper.AddPaths(subj, PolyType.ptSubject, true)
    clipper.AddPaths(clip, PolyType.ptClip, true)
    const clipped = new Paths()
    clipper.Execute(ClipType.ctIntersection, clipped, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

    if (clipped.length > 0) {
      // Use largest result
      let best = 0, bestArea = 0
      for (let i = 0; i < clipped.length; i++) {
        const a = Math.abs(Clipper.Area(clipped[i]))
        if (a > bestArea) { bestArea = a; best = i }
      }
      result.push({
        ring: pathFromClipper(clipped[best]),
        ...(p.parcelId != null ? { parcelId: p.parcelId } : {}),
        use: useOf(),
        vacant: p.vacant ?? null,   // ⛔ a well without the column is null, never "not vacant"
      })
    }
  } }
  return result
}

// ⛔ The city-only `classifyLandUse(code)` that lived here is GONE. It knew only
// St. Louis City's 4-digit ranges and ended `return 'residential'`, so every
// County 3-digit code — 14,587 of hipointedemun's 14,597 — came back
// 'residential' as confidently as a real single-family parcel. The replacement
// is `parcel-landuse.mjs` (jurisdiction-aware, no catch-all, returns null for a
// code it cannot read) wrapped by deriveLayers's `classifyLandUse(parcel)`,
// which turns a null into the honest `underived` class and tallies it for the
// pour report. See docs/briefs/BRIEF-land-use-derivation.md §2.

function loadSurvey() {
  const p = join(RAW_DIR, 'survey.json')
  if (!existsSync(p)) return {}
  return JSON.parse(readFileSync(p, 'utf-8')).streets || {}
}

// ══════════════════════════════════════════════════════════════════
// Centerline-first block generation
// ══════════════════════════════════════════════════════════════════

/**
 * Variable-width polygon inset: offset each edge inward by a different distance.
 *
 * For each vertex, finds the intersection of the two adjacent offset edges.
 * Works for CW-wound polygons (positive signed area in our coord system).
 *
 * @param {Array<{x,z}>} ring - Polygon vertices (CW winding)
 * @param {Array<number>} distances - Inset distance per edge (edge i = ring[i]→ring[i+1])
 * @returns {Array<{x,z}>|null} Inset polygon, or null if degenerate
 */
function variableInset(ring, distances) {
  const n = ring.length
  if (n < 3) return null

  // Compute offset edges (each edge shifted inward by its distance)
  const offsetEdges = []
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const dx = b.x - a.x, dz = b.z - a.z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 1e-6) {
      offsetEdges.push(null)
      continue
    }
    // Inward normal for CW polygon: (-dz, dx) / len
    const nx = -dz / len, nz = dx / len
    const d = distances[i]
    offsetEdges.push({
      ax: a.x + nx * d, az: a.z + nz * d,
      bx: b.x + nx * d, bz: b.z + nz * d,
      dx, dz,
    })
  }

  // Find intersection of adjacent offset edges → new vertices
  const result = []
  const MAX_MITER_RATIO = 4.0

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n
    const prev = offsetEdges[prevIdx]
    const curr = offsetEdges[i]

    if (!prev || !curr) continue

    // Intersect the two offset lines
    const denom = prev.dx * curr.dz - prev.dz * curr.dx

    if (Math.abs(denom) < 1e-10) {
      // Parallel — use midpoint of the two offset positions
      result.push({ x: (prev.bx + curr.ax) / 2, z: (prev.bz + curr.az) / 2 })
    } else {
      const t = ((curr.ax - prev.ax) * curr.dz - (curr.az - prev.az) * curr.dx) / denom
      const ix = prev.ax + t * prev.dx
      const iz = prev.az + t * prev.dz

      // Miter limit: clamp if the new point is too far from the original vertex
      const origX = ring[i].x, origZ = ring[i].z
      const dist = Math.sqrt((ix - origX) ** 2 + (iz - origZ) ** 2)
      const maxDist = Math.max(distances[prevIdx], distances[i]) * MAX_MITER_RATIO

      if (dist > maxDist) {
        const scale = maxDist / dist
        result.push({
          x: origX + (ix - origX) * scale,
          z: origZ + (iz - origZ) * scale,
        })
      } else {
        result.push({ x: ix, z: iz })
      }
    }
  }

  if (result.length < 3) return null

  // Check that the result has positive area (not inverted)
  let area = 0
  for (let i = 0; i < result.length; i++) {
    const a = result[i]
    const b = result[(i + 1) % result.length]
    area += a.x * b.z - b.x * a.z
  }
  if (area <= 0) return null

  return result
}

/**
 * Clean a polygon via Clipper to fix self-intersections.
 * Returns the largest positive-area ring, or null.
 */
function cleanPolygon(ring) {
  const path = ring.map(p => toClipper(p.x, p.z))
  const c = new Clipper()
  const subj = new Paths(); subj.push(path)
  c.AddPaths(subj, PolyType.ptSubject, true)
  const result = new Paths()
  c.Execute(ClipType.ctUnion, result, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

  let best = null, bestArea = 0
  for (let i = 0; i < result.length; i++) {
    const area = Clipper.Area(result[i])
    if (area > bestArea) { bestArea = area; best = result[i] }
  }

  return best ? pathFromClipper(best) : null
}

/**
 * Build spatial index of original street segments for edge-to-street matching.
 */
function buildStreetSegmentIndex(streets) {
  const CELL = 20
  const grid = {}
  const entries = []

  for (let si = 0; si < streets.length; si++) {
    const f = streets[si]
    const coords = f.coords
    const name = f.tags?.name || ''

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i + 1]
      const entry = { a, b, name, tags: f.tags, streetIdx: si }
      const idx = entries.length
      entries.push(entry)

      const minCx = Math.floor(Math.min(a.x, b.x) / CELL)
      const maxCx = Math.floor(Math.max(a.x, b.x) / CELL)
      const minCz = Math.floor(Math.min(a.z, b.z) / CELL)
      const maxCz = Math.floor(Math.max(a.z, b.z) / CELL)
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = `${cx},${cz}`
          if (!grid[key]) grid[key] = []
          grid[key].push(idx)
        }
      }
    }
  }

  return { entries, grid, CELL }
}

/**
 * Find the nearest original street segment for a given point.
 */
function findStreetForPoint(px, pz, index) {
  const cx = Math.floor(px / index.CELL)
  const cz = Math.floor(pz / index.CELL)

  let bestDist = Infinity
  let bestEntry = null

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const key = `${cx + dx},${cz + dz}`
      const indices = index.grid[key]
      if (!indices) continue

      for (const idx of indices) {
        const entry = index.entries[idx]
        const { a, b } = entry

        const edx = b.x - a.x, edz = b.z - a.z
        const len2 = edx * edx + edz * edz
        if (len2 < 1e-6) continue

        const t = Math.max(0, Math.min(1,
          ((px - a.x) * edx + (pz - a.z) * edz) / len2
        ))
        const projX = a.x + t * edx, projZ = a.z + t * edz
        const dist = Math.sqrt((px - projX) ** 2 + (pz - projZ) ** 2)

        if (dist < bestDist) {
          bestDist = dist
          bestEntry = entry
        }
      }
    }
  }

  return bestEntry
}

/**
 * Get the pavementHalfWidth for each edge of a face polygon,
 * by matching edges to original streets and looking up survey data.
 */
// The carriageway half-width of one RAW way, for the legacy layers that buffer raw ways: its class section
// (`getStreetSpec`), or the highway typical section for a swept class. ⛔ No residential default — the
// `defaultHalfWidth = crossSection(STANDARDS.streets.residential)` that these sites fell back to is gone.
// ⭐ THE PARKING DEPTH rides the measure beside pavementHW (`measure[side].parking`, the kerb → the parking edge; Boz,
// 2026-10-25): the type's house parking lane, the data selecting presence (streetMarkings.js#parkingSeed). Read only by
// the parking edge line. ⛔ It never changes pavementHW, the curb's input: an authored side keeps its pavementHW and
// takes the seed's parking only where it carries none (Survey's control is owed, BACKLOG). A highway's typical section has
// no parking lane: 0, said by its class, never left absent.
function withParkingSeed(st) {
  const m = st.measure
  if (!m?.left || !m?.right) return m
  const seed = (k) => isSweptClass(st.class) ? 0 : parkingSeed(st.class, st.markings, k).parking
  const side = (k) => Number.isFinite(m[k].parking) ? m[k] : { ...m[k], parking: seed(k) }
  return { ...m, left: side('left'), right: side('right') }
}
// the town's paint norm (`norms.json` → `markings`: { centre, edges }), or null when the town declares none
let _markingNorm
function townMarkingNorm() {
  if (_markingNorm !== undefined) return _markingNorm
  const p = join(CLEAN_DIR, '..', 'norms.json')
  _markingNorm = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).markings ?? null) : null
  return _markingNorm
}

function wayHalfWidth(tags) {
  const cls = classOf(tags).class
  if (isSweptClass(cls)) {
    const n = parseInt(tags.lanes, 10)
    const hs = highwaySection({ class: cls, oneway: isOneway(tags), lanes: n > 0 ? n : null, ref: tags.ref ?? null }, hwyStd())
    return Math.max(hs.left.pavementHW, hs.right.pavementHW)
  }
  return crossSection(getStreetSpec(tags)).pavement
}

function getEdgeWidths(ring, sourceStreets, survey, defaultWidth) {
  const n = ring.length
  const widths = []

  for (let i = 0; i < n; i++) {
    const vertex = ring[i]
    // Each vertex carries a source index from the noded segment
    // that produced this face edge — the street it came from.
    const src = vertex.source
    if (src >= 0 && src < sourceStreets.length) {
      const street = sourceStreets[src]
      const name = street.tags?.name
      if (name && survey[name]?.pavementHalfWidth) {
        widths.push(survey[name].pavementHalfWidth)
      } else {
        widths.push(wayHalfWidth(street.tags))
      }
    } else {
      widths.push(defaultWidth)
    }
  }

  return widths
}

/**
 * Correct street pavementHalfWidths using lamp positions.
 *
 * Lamps are on concrete infrastructure, never in the street.
 * If a lamp is closer to the centerline than the survey says the curb is,
 * the survey is wrong — reduce the pavementHalfWidth.
 *
 * Check both sides of each street:
 *   - Lamps close on BOTH sides → street is genuinely narrower
 *   - Lamps close on ONE side → infrastructure bulge, don't narrow street
 */
function correctStreetWidths(streets, lamps, survey) {
  const corrected = {}
  for (const [name, data] of Object.entries(survey)) {
    corrected[name] = { ...data }
  }

  const defaultInfra = STANDARDS.treeLawn.width

  for (const street of streets) {
    const name = street.tags?.name
    if (!name || !corrected[name]?.pavementHalfWidth) continue
    // Trust direct measurements and assessor ROW — lamps only correct computed values
    if (corrected[name].source === 'assessor' || corrected[name].source === 'measured') continue

    const coords = street.coords
    if (coords.length < 2) continue

    const dx = coords[coords.length - 1].x - coords[0].x
    const dz = coords[coords.length - 1].z - coords[0].z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 5) continue

    const nx = -dz / len, nz = dx / len
    const mx = (coords[0].x + coords[coords.length - 1].x) / 2
    const mz = (coords[0].z + coords[coords.length - 1].z) / 2

    // Collect lamp distances per side
    const leftDists = [], rightDists = []
    for (const lamp of lamps) {
      const lx = lamp.x - mx, lz = lamp.z - mz
      const along = lx * dx / len + lz * dz / len
      const perp = lx * nx + lz * nz // signed

      if (Math.abs(along) < len / 2 + 20 && Math.abs(perp) > 1 && Math.abs(perp) < 25) {
        if (perp > 0) rightDists.push(perp)
        else leftDists.push(-perp)
      }
    }

    if (leftDists.length === 0 && rightDists.length === 0) continue

    const surveyHW = corrected[name].pavementHalfWidth
    const minLeft = leftDists.length > 0 ? Math.min(...leftDists) : null
    const minRight = rightDists.length > 0 ? Math.min(...rightDists) : null

    // Both sides have lamps closer than survey half-width → street is narrower
    if (minLeft !== null && minRight !== null) {
      const avgLampDist = (minLeft + minRight) / 2
      if (avgLampDist < surveyHW) {
        // Lamp is at curb + infra. Curb = lamp distance - infra width.
        const impliedHW = Math.max(2, avgLampDist - defaultInfra)
        corrected[name].pavementHalfWidth = impliedHW
        corrected[name].correctedBy = 'lamps-both'
      }
    }
    // One-side only: don't narrow (it's an infrastructure bulge)
  }

  return corrected
}

// ══════════════════════════════════════════════════════════════════

export function deriveLayers(highways, { cropland = null, onAbsorbRefusal = null, homeLook } = {}) {
  const opts = { onAbsorbRefusal }
  console.log(`  ${highways.length} highway features`)

  // ── Load parcels ──────────────────────────────────────────────
  // Scene-homed like every other raw input: the ACTIVE scene's raw dir
  // (RAW_DIR = mapRawDir(SCENE)). LS's parcels used to be pinned to the
  // legacy scripts/raw/ dump — the one input that never got the scene fork —
  // which meant a poured scene silently read LS's St. Louis parcels. Now each
  // scene reads its own, and LS's file sits inside the reproject-on-recenter
  // safety net alongside osm/msbf. (bake-content reads the same location.)
  console.log('  [1/4] Loading parcels...')
  // ⭐ THE TOWN'S DECLARED WELLS (`sources.json`), each tagged with its jurisdiction AND
  // its code format. ⛔ Until 2026-09-24 this walked St. Louis's two filenames, so every
  // other town poured as if it had no parcels (huron's oh_parcels.json sat unread).
  // ⚠️ Jurisdiction is carried, not inferred: St. Louis City and County taxonomies are
  // NOT compatible (`parcel-landuse.mjs` owns that fact), and a town's codes are read
  // only in the format it DECLARES — never in St. Louis's by default.
  const parcels = []
  const declared = readSources(SCENE)
  if (!declared.declared) {
    console.warn('\n' + undeclaredMessage(SCENE, declared.path) + '\n')
  } else if (!declared.parcels.length) {
    console.log(`    DECLARED-NONE — ${declared.absentReason}`)
  } else {
    for (const decl of declared.parcels) {
      const f = join(RAW_DIR, decl.file)
      // ⛔ A declared well with no file is an error, not a skip (bake-content.js agrees).
      if (!existsSync(f)) throw new Error(`[parcels] ${SCENE} declares '${decl.id}' → raw/${decl.file}, which is not there. Acquire it: CARTOGRAPH_SCENE=${SCENE} node cartograph/fetch-parcels.mjs`)
      const parcelData = JSON.parse(readFileSync(f, 'utf-8'))
      let noId = 0
      for (const p of Object.values(parcelData.parcels || {})) {
        const id = parcelId(decl.id, p); if (id == null) noId++
        parcels.push({ ...p, ...(id != null ? { parcelId: id } : {}), jurisdiction: decl.jurisdiction, land_use_code_format: decl.land_use_code_format || null })
      }
      // ⛔ a record with no source id carries none (never its place in the file): said here, by name, per pour
      if (noId) console.log(`    ⚠️ ${decl.id}: ${noId} parcel record(s) carry no source id (\`handle\`) — their emitted rings carry no parcelId`)
    }
  }
  const countyCodeTable = loadCountyCodeTable(SCENE)
  const byWell = {}
  for (const p of parcels) { const k = `${p.jurisdiction}/${p.land_use_code_format}`; byWell[k] = (byWell[k] || 0) + 1 }
  console.log(`    ${parcels.length} parcels${parcels.length ? ` (${Object.entries(byWell).map(([k, n]) => `${n} ${k}`).join(' + ')})` : ''}`)

  // The parcel-code join, reported at pour time so a failed one is visible here
  // rather than weeks later on the render (`lu-policy.mjs` report(), same intent).
  const luStats = { city: { total: 0, underived: 0 }, county: { total: 0, underived: 0 }, formats: {}, countyTableSize: countyCodeTable.size }
  // Memoized per PARCEL, not per call. Three separate sites classify the same
  // parcels (the parcel faces, the block dominant-use vote, the face-fill vote),
  // so an un-memoized tally counts calls and reports several times more parcels
  // than exist on disk — a loud report that overstates its own denominator is
  // worse than no report, because it is the number an operator would act on.
  const luCache = new Map()
  const classifyLandUse = (parcel) => {
    if (!parcel) return UNDERIVED
    if (luCache.has(parcel)) return luCache.get(parcel)
    const jur = parcel.jurisdiction
    const fmt = parcel.land_use_code_format
    let lu = null
    if (fmt === 'stl-assessor-numeric') {
      // St. Louis's City / County tables — only for a well that declares St. Louis codes.
      lu = classifyParcelLandUse(parcel.land_use_code, jur, countyCodeTable)
      luStats[jur].total++
      if (!lu) luStats[jur].underived++
    } else {
      // A self-describing code ("500: Res-Vacant Land") is read as text, with the SAME
      // classifier bake-content uses. Any other or undeclared format is UNREADABLE and
      // counted as such, never guessed in another town's taxonomy.
      // ⭐ Every other format is read by its READER — the kit's text reader, or a state's vocabulary
      // (cartograph/states/: Massachusetts' DOR codes). A format with no reader is UNREADABLE, counted.
      const reader = LAND_USE_READERS[fmt]
      if (reader && parcel.land_use_code != null) {
        const u = reader(String(parcel.land_use_code)).use
        lu = u === 'unknown' ? null : u
      }
      const k = fmt || '(undeclared format)'
      const st = luStats.formats[k] || (luStats.formats[k] = { total: 0, underived: 0 })
      st.total++
      if (!lu) st.underived++
    }
    const out = lu || UNDERIVED
    luCache.set(parcel, out)
    return out
  }

  // ⛔ No park-parcel exclusion. It tested LS's park point (-15,-15) and St. Louis codes
  // 4800–4900 on EVERY town's parcels, and matched nothing even on LS (its 65 parcels
  // within 250 m carry none of those codes). Deleted 2026-09-24 (bleed site 22).

  // Load OSM data (for park polygon fallback)
  const osmData = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))

  // Park polygon: prefer the authored 4-corner polygon; fall back to the
  // OSM leisure=park trace only if the authored file is missing. Authored
  // polygon is the canonical source per the ribbon doctrine — clean
  // 4-corner topology means the round-corners op + the three corner-plug
  // components (asphalt / curb / concrete) reconcile cleanly. The OSM
  // trace's 41-vertex slow turns at each corner produce dirty plug
  // geometry; never use it as the geometry authority when we have an
  // authored polygon. See cartograph/FEATURES.md "The ribbon doctrine".
  let parkPolygon = null
  const authoredParkPath = join(CLEAN_DIR, 'park-polygon.json')
  if (existsSync(authoredParkPath)) {
    const authored = JSON.parse(readFileSync(authoredParkPath, 'utf-8'))
    parkPolygon = authored.corners.map(([x, z]) => toClipper(x, z))
    console.log(`    Park polygon: ${authored.corners.length} authored corners (${authored.name || 'unnamed'})`)
  } else {
    const osmLeisure = osmData.ground?.leisure || []
    const lafayettePark = osmLeisure.find(f => f.tags?.name === 'Lafayette Park' && f.isClosed)
    if (lafayettePark) {
      parkPolygon = lafayettePark.coords.map(c => toClipper(c.x, c.z))
      console.warn(`    [park] Using OSM 41-vertex polygon — authored 4-corner polygon expected at ${authoredParkPath}; corner plugs will degrade.`)
    }
  }

  // ── Load streetlamps (used for width correction + rendering) ──
  // Scene-aware source (installations are independent). The DEFAULT scene (LS)
  // reads its manually-exported Overpass file under scripts/raw; a POURED scene
  // reads its OWN lamp file from its scene raw dir. Projection is always the
  // ACTIVE scene's wgs84ToLocal, so reading LS's file for a poured scene (the
  // old hardcoded path) landed LS's lamps ~7 km outside the poured frame. A
  // poured scene with no lamp file gets honest zero (no cross-installation
  // ghosts) rather than LS's lamps.
  // ⭐⭐ LAMPS COME FROM THE PULL EVERY TOWN ALREADY HAS. `fetch.js`'s LIGHT_NODES
  // is ['highway'], so `node["highway"]` has ALWAYS returned `highway=street_lamp`
  // — huron's pull carries 30 of them. They were discarded twice over: node tags
  // were dropped on the floor at ingest (fixed 2026-09-20), and this reader only
  // ever looked at `osm_street_lamps.json`, a file NOTHING IN THE PIPELINE WRITES.
  // It exists once, hand-exported from Overpass years ago, for LS. ⇒ every poured
  // town got an honest zero forever, and the honesty hid that the data was already
  // on disk. ⛔ The absent thing was never the lamps; it was the reader.
  //
  // Two DECLARED sources, merged and deduped, provenance printed:
  //   ① `pois` — the live pull. Works for any town fetched after the ingest fix.
  //   ② the town's own `raw/osm_street_lamps.json` where it has one — LS's is a hand
  //      export (641 elements). Every town reads its OWN; no town inherits LS's. (LS's
  //      used to be read from scripts/raw/ by a test of the default map's name; the two
  //      files were byte-identical on 2026-10-21 when the default went.)
  // ⛔ Positions are RE-PROJECTED from lon/lat, never taken from the poi's cached
  // x/z: that was computed at fetch time and the extent may have moved since.
  const streetlamps = []
  const _lampSeen = new Set()
  const _addLamp = (lon, lat, type) => {
    const [x, z] = wgs84ToLocal(lon, lat)
    const rx = Math.round(x * 100) / 100, rz = Math.round(z * 100) / 100
    const k = `${rx},${rz}`
    if (_lampSeen.has(k)) return false
    _lampSeen.add(k)
    streetlamps.push({ x: rx, z: rz, type: type || 'street' })
    return true
  }

  let nFromPois = 0
  for (const poi of osmData.pois || []) {
    if (poi?.tags?.highway !== 'street_lamp') continue
    const c = poi.coords?.[0]
    if (!(Number.isFinite(c?.lon) && Number.isFinite(c?.lat))) continue
    if (_addLamp(c.lon, c.lat, poi.tags.lamp_type)) nFromPois++
  }

  const lampSourcePath = join(RAW_DIR, 'osm_street_lamps.json')
  let nFromFile = 0, lampFileNote = 'absent'
  if (existsSync(lampSourcePath)) {
    // ⛔ Only the ABSENT case is silent. A file that exists and will not parse is a
    // real failure and must not read the same as "this town has no lamps."
    const lampRaw = JSON.parse(readFileSync(lampSourcePath, 'utf-8'))
    for (const n of (lampRaw.elements || [])) {
      if (n.type !== 'node' || !Number.isFinite(n.lat) || !Number.isFinite(n.lon)) continue
      if (_addLamp(n.lon, n.lat, n.tags?.lamp_type)) nFromFile++
    }
    lampFileNote = `${nFromFile} new`
  }
  console.log(`    ${streetlamps.length} streetlamps — ${nFromPois} from the pull, ${lampFileNote} from ${lampSourcePath.split('/').slice(-3).join('/')}`)
  if (!streetlamps.length) {
    console.log('    ⛔ ZERO lamps. If this town should have them, the pull predates the '
      + 'tagged-node ingest fix (2026-09-20) — re-fetch. `node["highway"]` already asks for them.')
  }

  // ── Filter street types ──────────────────────────────────────
  console.log('  [2/8] Filtering street types...')

  const vehicularStreets = highways.filter(f => {
    const t = f.tags?.highway
    return ['residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
            'tertiary', 'tertiary_link', 'unclassified',
            // Freeway corridor — included so the I-44 edge of the
            // neighborhood reads as real geography rather than absence.
            'motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(t) && f.coords.length >= 2
  })
  console.log(`    ${vehicularStreets.length} vehicular street segments`)

  const alleys = highways.filter(f =>
    f.tags?.highway === 'service' && f.tags?.service === 'alley' && f.coords.length >= 2
  )
  console.log(`    ${alleys.length} alley segments`)

  const sidewalks = highways.filter(f => f.tags?.footway === 'sidewalk' && f.coords.length >= 2)

  // Compute bounding box from all street coordinates
  let bboxMinX = Infinity, bboxMaxX = -Infinity
  let bboxMinZ = Infinity, bboxMaxZ = -Infinity
  for (const f of vehicularStreets) {
    for (const c of f.coords) {
      if (c.x < bboxMinX) bboxMinX = c.x
      if (c.x > bboxMaxX) bboxMaxX = c.x
      if (c.z < bboxMinZ) bboxMinZ = c.z
      if (c.z > bboxMaxZ) bboxMaxZ = c.z
    }
  }
  const BBOX_PAD = 50
  bboxMinX -= BBOX_PAD; bboxMaxX += BBOX_PAD
  bboxMinZ -= BBOX_PAD; bboxMaxZ += BBOX_PAD

  // ── Polygonize street network → block superstructure ────────
  console.log('  [3/8] Polygonizing street network...')

  // Feed street centerlines into noding + polygonization.
  // Interior faces of the street grid = city blocks.
  // Boundary streets that exit the area don't form closed faces,
  // so edge parcels are handled by fallback below.
  // ── Densify curved streets (Goldilocks, offset-safe) ─────────
  // Curved streets with too few OSM points → faceted face boundaries. Catmull-
  // Rom subdivision adds interpolated points so blocks follow a smooth arc.
  // (Formerly two per-name hacks here — see the [Vesalius P1] note below.)
  function catmullRomPt(p0, p1, p2, p3, t) {
    const t2 = t*t, t3 = t2*t
    return {
      x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      z: 0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)
    }
  }
  function densifyCoords(coords, maxSegLen) {
    if (coords.length < 2) return coords
    const result = [coords[0]]
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i-1)]
      const p1 = coords[i]
      const p2 = coords[i+1]
      const p3 = coords[Math.min(coords.length-1, i+2)]
      const segLen = Math.hypot(p2.x-p1.x, p2.z-p1.z)
      const steps = Math.max(1, Math.ceil(segLen / maxSegLen))
      for (let s = 1; s <= steps; s++) {
        result.push(catmullRomPt(p0, p1, p2, p3, s/steps))
      }
    }
    return result
  }
  // [Vesalius P1-frame-enrichment] Replaced two frame-thinness hacks here:
  //   (a) the per-name `CURVE_STREETS=['West 18th Street']` densify, and
  //   (b) the `Lasalle Street` magic-coordinate extend — which forensics found
  //       was already a DEAD no-op (its guard never matched current raw OSM).
  // (a) is generalized to a principled Goldilocks curve-densify: any vehicular
  // street that actually bends (max interior turn > CURVE_TURN) is subdivided
  // to CURVE_MAX_SEG so a wide ribbon offset of its block face stays kink-free
  // (OSM-FORENSICS.md Part 3.3 — density target set by the widest ribbon, a
  // frame-quality rule, not a per-street patch). Densify preserves the ring
  // bbox, so blockKey stays stable. The deeper fix — routing the faces path
  // through the enriched skeleton instead of raw OSM — is the Layer-2 unify.
  const CURVE_TURN = 12 * Math.PI / 180   // a "real bend" threshold
  const CURVE_MAX_SEG = 5                  // meters between samples on a bend
  let densifiedCurves = 0
  for (const f of vehicularStreets) {
    const c = f.coords
    if (c.length < 3) continue
    let maxTurn = 0
    for (let i = 1; i < c.length - 1; i++) {
      const a1 = Math.atan2(c[i].z - c[i-1].z, c[i].x - c[i-1].x)
      const a2 = Math.atan2(c[i+1].z - c[i].z, c[i+1].x - c[i].x)
      let t = Math.abs(a2 - a1); if (t > Math.PI) t = 2 * Math.PI - t
      if (t > maxTurn) maxTurn = t
    }
    if (maxTurn > CURVE_TURN) { f.coords = densifyCoords(c, CURVE_MAX_SEG); densifiedCurves++ }
  }
  console.log(`    Densified ${densifiedCurves} curved streets (Goldilocks, max-seg ${CURVE_MAX_SEG}m)`)

  const streetPolylines = vehicularStreets.map(f =>
    f.coords.map(c => ({ x: c.x, z: c.z }))
  )

  // ⭐ THE FACES ARE WALKED ON THE BB (ORIENTATION §2, "everything is drawn to the bb first"; BRIEF-the-disc-is-one-source
  // §2b, Boz 2026-10-25). The bb is the frozen fetch envelope (`osm.bbox`), never derived from the disc; its rectangle
  // closes the outermost faces. The disc is applied to finished geometry, last. ⛔ The boundary ring is NOT a closing
  // edge here: splitting faces at the circle before they are voted made the rim a seam of the land-use partition.
  // ONE bb (geography.mjs#localBB, through this scene's projection) and TWO VIEWS OF IT, ≤ 5 cm apart:
  //   `_bb`     — the coast and the mint read it raw;
  //   `_frame`  — the face walk's closing edge, the same bb on the noding grid (snap.js#onGrid): nodeEdges snaps every
  //               crossing to that grid, so a frame off it puts its own nodes up to half a cell off its lines, where no
  //               test can tell a frame segment from a street one.
  // ⚠️ Not one view, MEASURED (Boz's condition, 2026-10-25): handing the gridded frame to the coast and the mint changes ①
  // (LS's `blocks`; a Huron ring 3.4 cm at the frame, (−4944.6, −3037.3)), so the mint keeps the raw bb.
  const _bb = localBB(osmData, wgs84ToLocal), _frame = onGrid(_bb)
  if (!_bb) throw new Error(`[faces] ⛔ ${SCENE}'s raw/osm.json carries no bbox — the face walk closes against the fetched envelope and there is none. Re-fetch.`)
  streetPolylines.push([[_frame.x0, _frame.z0], [_frame.x1, _frame.z0], [_frame.x1, _frame.z1], [_frame.x0, _frame.z1], [_frame.x0, _frame.z0]].map(([x, z]) => ({ x, z })))
  console.log(`    Faces close against the bb (${Math.round(_bb.x1 - _bb.x0)} × ${Math.round(_bb.z1 - _bb.z0)} m)`)

  // The disc: ①'s `boundary` ring, the coast's centre + radius and the ramp flares read it far below. ⛔ No fallback: a
  // missing file, ring, centre or radius refuses by name (splitBoundary, discOf).
  const { disc: _disc } = splitBoundary(JSON.parse(readFileSync(join(CARTOGRAPH_DIR, 'data', SCENE, 'neighborhood_boundary.json'), 'utf-8')), `derive: ${SCENE}'s neighborhood_boundary.json`)
  const _discAt = discOf(_disc, `derive: ${SCENE}`)
  const boundaryPolyXZ = _disc.boundary

  const nodedSegments = nodeEdges(streetPolylines)
  const faces = polygonize(nodedSegments)

  // Classify faces using OSM overlays
  const classifiedFaces = classify(faces, osmData, SCENE)
  const blockFaces = classifiedFaces.filter(f => f.type === 'block')
  console.log(`    ${blockFaces.length} block faces from ${classifiedFaces.length} total faces`)

  // ── Independent street pavement layer ───────────────────────
  console.log('  [4/8] Buffering streets by standards...')

  const survey = loadSurvey()

  const correctedSurvey = correctStreetWidths(vehicularStreets, streetlamps, survey)
  const corrections = Object.values(correctedSurvey).filter(s => s.correctedBy).length
  console.log(`    ${corrections} streets corrected by lamp data`)

  // Spatial index for matching face edges to streets (used by face-inset clipping)
  const streetIndex = buildStreetSegmentIndex(vehicularStreets)

  // Detect divided roads
  const dividedStreets = new Set()
  for (const [name, data] of Object.entries(correctedSurvey)) {
    if (data.oneway && data.rowWidth && data.rowWidth > 20) {
      dividedStreets.add(name)
    }
  }
  const geoDivided = detectDividedStreets(vehicularStreets)
  for (const [name, gap] of Object.entries(geoDivided)) {
    if (!correctedSurvey[name]?.source && gap > 3 && gap < 15) {
      dividedStreets.add(name)
    }
  }
  if (dividedStreets.size > 0) {
    console.log(`    Divided roads: ${[...dividedStreets].join(', ')}`)
  }

  // Douglas-Peucker simplification
  function simplifyPolyline(coords, tolerance) {
    if (coords.length <= 2) return coords
    const a = coords[0], b = coords[coords.length - 1]
    const dx = b.x - a.x, dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    let maxDist = 0, maxIdx = 0
    for (let i = 1; i < coords.length - 1; i++) {
      const p = coords[i]
      let dist
      if (len2 < 1e-6) {
        dist = Math.sqrt((p.x - a.x) ** 2 + (p.z - a.z) ** 2)
      } else {
        const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2
        const projX = a.x + t * dx, projZ = a.z + t * dz
        dist = Math.sqrt((p.x - projX) ** 2 + (p.z - projZ) ** 2)
      }
      if (dist > maxDist) { maxDist = dist; maxIdx = i }
    }
    if (maxDist <= tolerance) return [a, b]
    const left = simplifyPolyline(coords.slice(0, maxIdx + 1), tolerance)
    const right = simplifyPolyline(coords.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }

  // Buffer streets: for non-divided streets, merge all same-name segments
  // into a single polyline and buffer once. This avoids centerline offset
  // problems from independent OSM segments.
  const streetBufferPaths = new Paths()

  // Group segments by name (unnamed get buffered individually)
  const streetsByName = new Map()
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (!name || dividedStreets.has(name)) {
      // Divided streets or unnamed: buffer each segment independently
      let hw
      if (name && correctedSurvey[name]?.pavementHalfWidth) {
        hw = correctedSurvey[name].pavementHalfWidth / 2
      } else {
        hw = wayHalfWidth(f.tags)
      }
      if (name && dividedStreets.has(name)) hw = hw / 2
      const simplified = simplifyPolyline(f.coords, 1.0)
      const buf = bufferPolyline(simplified, hw)
      for (let i = 0; i < buf.length; i++) streetBufferPaths.push(buf[i])
      continue
    }
    if (!streetsByName.has(name)) streetsByName.set(name, [])
    streetsByName.get(name).push(f)
  }

  // Chain and buffer each named non-divided street
  const SNAP = 3  // meters — endpoints within this distance are joined
  for (const [name, segs] of streetsByName) {
    let hw
    if (correctedSurvey[name]?.pavementHalfWidth) {
      hw = correctedSurvey[name].pavementHalfWidth
    } else {
      hw = wayHalfWidth(segs[0].tags)
    }

    // Chain segments into continuous polylines
    const pieces = segs.map(f => f.coords.map(c => ({ x: c.x, z: c.z })))
    const used = new Set()
    const chains = []
    for (let i = 0; i < pieces.length; i++) {
      if (used.has(i)) continue
      used.add(i)
      let chain = [...pieces[i]]
      let changed = true
      while (changed) {
        changed = false
        const tail = chain[chain.length - 1]
        for (let j = 0; j < pieces.length; j++) {
          if (used.has(j)) continue
          const pts = pieces[j]
          const dHead = Math.hypot(pts[0].x - tail.x, pts[0].z - tail.z)
          const dTail = Math.hypot(pts[pts.length-1].x - tail.x, pts[pts.length-1].z - tail.z)
          if (dHead < SNAP) { chain.push(...pts.slice(1)); used.add(j); changed = true; break }
          if (dTail < SNAP) { chain.push(...[...pts].reverse().slice(1)); used.add(j); changed = true; break }
        }
      }
      changed = true
      while (changed) {
        changed = false
        const head = chain[0]
        for (let j = 0; j < pieces.length; j++) {
          if (used.has(j)) continue
          const pts = pieces[j]
          const dHead = Math.hypot(pts[0].x - head.x, pts[0].z - head.z)
          const dTail = Math.hypot(pts[pts.length-1].x - head.x, pts[pts.length-1].z - head.z)
          if (dTail < SNAP) { chain = [...pts.slice(0, -1), ...chain]; used.add(j); changed = true; break }
          if (dHead < SNAP) { chain = [...[...pts].reverse().slice(0, -1), ...chain]; used.add(j); changed = true; break }
        }
      }
      chains.push(chain)
    }

    for (const chain of chains) {
      const simplified = simplifyPolyline(chain, 1.0)
      const buf = bufferPolyline(simplified, hw)
      for (let i = 0; i < buf.length; i++) streetBufferPaths.push(buf[i])
    }
  }

  // Build a grid-only street union for cutting blocks.
  // Loop streets and alleys do NOT cut blocks — they render on top.
  // Sidewalks go straight across them.
  const LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay Place'])
  const gridStreetPaths = new Paths()
  for (let i = 0; i < streetBufferPaths.length; i++) {
    gridStreetPaths.push(streetBufferPaths[i])
  }
  // Remove loop streets from the grid buffer (they were included via vehicularStreets)
  // We rebuild without them:
  const gridBufferPaths = new Paths()
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (name && LOOP_STREET_NAMES.has(name)) continue  // skip loop streets
    let hw
    if (name && correctedSurvey[name]?.pavementHalfWidth) {
      hw = correctedSurvey[name].pavementHalfWidth
    } else {
      hw = wayHalfWidth(f.tags)
    }
    if (name && dividedStreets.has(name)) hw = hw / 2
    const simplified = simplifyPolyline(f.coords, 1.0)
    const buf = bufferPolyline(simplified, hw)
    for (let i = 0; i < buf.length; i++) gridBufferPaths.push(buf[i])
  }
  const gridUnionClipper = new Clipper()
  gridUnionClipper.AddPaths(gridBufferPaths, PolyType.ptSubject, true)
  const gridStreetUnion = new Paths()
  gridUnionClipper.Execute(ClipType.ctUnion, gridStreetUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

  // Union all street buffers → independent street pavement (for rendering)
  const streetUnionClipper = new Clipper()
  streetUnionClipper.AddPaths(streetBufferPaths, PolyType.ptSubject, true)
  const streetUnion = new Paths()
  streetUnionClipper.Execute(ClipType.ctUnion, streetUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  // NOTE: streetUnion will be clipped to exclude blocks after blocks are built (below)

  // ── Build blocks: parcel-union per face, face-polygon fallback ──
  console.log('  [5/8] Building blocks...')

  const radius = STANDARDS.intersection.curbReturnRadius
  const allBlockPaths = new Paths()
  const blockMeta = []

  // Assign parcels to faces — a parcel contributes to every face it overlaps
  const faceParcelMap = new Map()
  for (const parcel of parcels) {
    const parts = parcelParts(parcel.rings, parcel.handle ?? parcel.address ?? 'a parcel')
    if (!parcel.centroid && !parts.length) continue
    const assignedFaces = new Set()
    // Check centroid
    if (parcel.centroid) {
      const cx = parcel.centroid[0], cz = parcel.centroid[1]
      for (let fi = 0; fi < blockFaces.length; fi++) {
        if (pointInRing(cx, cz, blockFaces[fi].ring)) {
          assignedFaces.add(fi)
        }
      }
    }
    // Check every part's ring vertices — parcel belongs to every face it touches
    for (const { outer } of parts) {
      for (const pt of outer) {
        for (let fi = 0; fi < blockFaces.length; fi++) {
          if (assignedFaces.has(fi)) continue
          if (pointInRing(pt[0], pt[1], blockFaces[fi].ring)) {
            assignedFaces.add(fi)
          }
        }
      }
    }
    for (const fi of assignedFaces) {
      if (!faceParcelMap.has(fi)) faceParcelMap.set(fi, [])
      faceParcelMap.get(fi).push(parcel)
    }
  }

  function buildFaceBlock(faceRing) {
    const facePath = faceRing.map(p => toClipper(p.x, p.z))
    if (facePath.length < 3) return new Paths()
    const FACE_INSET = 3.0
    const co = new ClipperOffset(); co.ArcTolerance = ARC_TOL
    const fp = new Paths(); fp.push(facePath)
    co.AddPaths(fp, JoinType.jtMiter, EndType.etClosedPolygon)
    const result = new Paths(); co.Execute(result, -FACE_INSET * CLIP_SCALE)
    return result
  }

  // ── Detect dead-end street endpoints ──────────────────────────
  // Only true streets (not alleys/service) — only things with sidewalks.
  // Use noded segments (post-polygonize) which are properly connected,
  // so we detect true dead ends, not multi-segment gaps.
  const DEAD_END_SNAP = 5  // tight snap on noded data (already snapped by nodeEdges)
  // Build endpoint list from the noded street segments
  const nodedEndpoints = []
  for (const seg of nodedSegments) {
    nodedEndpoints.push({ x: seg[0].x, z: seg[0].z })
    nodedEndpoints.push({ x: seg[1].x, z: seg[1].z })
  }
  // A noded vertex is a dead end if it appears in exactly 1 segment
  // (degree-1 node in the planar graph)
  const vertexDegree = {}
  for (const seg of nodedSegments) {
    for (const pt of [seg[0], seg[1]]) {
      const key = `${Math.round(pt.x*10)},${Math.round(pt.z*10)}`
      vertexDegree[key] = (vertexDegree[key] || 0) + 1
    }
  }
  const deadEndNodes = new Set()
  for (const [key, deg] of Object.entries(vertexDegree)) {
    if (deg === 1) deadEndNodes.add(key)  // degree-1 = dead end
  }

  // Which streets have operator-marked caps? Used below to skip the tip-cap
  // circle-cut so the ribbon cap paints over the face without leaving
  // uncovered half-circle artifacts.
  const streetNamesWithOperatorCaps = new Set()
  try {
    const cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(cPath)) {
      const cd = JSON.parse(readFileSync(cPath, 'utf-8'))
      for (const cl of (cd.streets || [])) {
        if (cl.name && (cl.capStart || cl.capEnd || cl.deadEnd)) {
          streetNamesWithOperatorCaps.add(cl.name)
        }
      }
    }
  } catch { /* ignore */ }

  const deadEndPoints = []
  for (const f of vehicularStreets) {
    if (LOOP_STREET_NAMES.has(f.tags?.name)) continue
    const c = f.coords
    if (c.length < 2) continue
    for (const ep of [c[0], c[c.length-1]]) {
      const key = `${Math.round(ep.x*10)},${Math.round(ep.z*10)}`
      if (!deadEndNodes.has(key)) continue
      // Skip boundary dead ends
      if (ep.x < bboxMinX + 40 || ep.x > bboxMaxX - 40 ||
          ep.z < bboxMinZ + 40 || ep.z > bboxMaxZ - 40) continue
      const isStart = ep === c[0]
      const adj = isStart ? c[1] : c[c.length - 2]
      const dx = ep.x - adj.x, dz = ep.z - adj.z
      const len = Math.sqrt(dx*dx + dz*dz)
      if (len < 0.1) continue
      const hw = (correctedSurvey[f.tags?.name]?.pavementHalfWidth) || wayHalfWidth(f.tags)
      // Use a longer segment (up to 15 points / ~60m) so the pad overlaps
      // well with the existing block, preventing disconnected gaps
      const segLen = Math.min(15, c.length)
      const seg = isStart ? c.slice(0, segLen).reverse() : c.slice(c.length - segLen)
      // Pull the dead-end point BACK so the round cap (radius=cutHW)
      // doesn't extend too far past the dead end. The cap should extend
      // only about halfWidth + sidewalk zone past the pulled-back point,
      // matching the road cap + a consistent sidewalk gap.
      const swZ2 = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      // Cap should extend (cutHW - hw - 0.6) past curb cap (which is 0.6m
      // past dead end), matching the side gap. So cap extends cutHW - hw
      // past dead end, and pullback = cutHW - (cutHW - hw) = hw.
      const pullback = hw
      const lastIdx = seg.length - 1
      if (pullback > 0 && seg.length >= 2) {
        const last = seg[lastIdx]
        const prev = seg[lastIdx - 1]
        const pdx = prev.x - last.x, pdz = prev.z - last.z
        const plen = Math.sqrt(pdx*pdx + pdz*pdz)
        if (plen > pullback) {
          seg[lastIdx] = { x: last.x + pdx/plen * pullback, z: last.z + pdz/plen * pullback }
        }
      }
      deadEndPoints.push({
        x: ep.x, z: ep.z,
        dirX: dx/len, dirZ: dz/len,
        name: f.tags?.name || '',
        halfWidth: hw,
        segment: seg,
      })
    }
  }
  if (deadEndPoints.length > 0) {
    console.log(`    ${deadEndPoints.length} dead-end streets: ${[...new Set(deadEndPoints.map(d=>d.name))].join(', ')}`)
  }

  let faceBlocks = 0

  for (let fi = 0; fi < blockFaces.length; fi++) {
    const face = blockFaces[fi]
    const faceParcels = faceParcelMap.get(fi) || []

    // ⭐ PARCELS VOTE THE LAND USE; THEY DO NOT DRAW THE BLOCK (ruling (b), 2026-09-24).
    // The block is always the street face, inset. It used to be the UNION OF ITS
    // PARCELS when a face had any, which made the surface layers (block / lot /
    // sidewalk / pavement, and through `pavement` the tree mask) depend on whether a
    // town's assessor well happened to be readable. Jacob's ruling was parcels for LAND
    // USE ("it's a map, it is supposed to reflect reality"), not for surfaces.
    // The parcel-block builder and its S 18th curve special case went with it.
    let closed = buildFaceBlock(face.ring)
    faceBlocks++

    // Cut loop streets from blocks (so sidewalk follows the loop curve)
    const loopCutPaths = new Paths()
    for (const f of vehicularStreets) {
      const name = f.tags?.name
      if (!name || !LOOP_STREET_NAMES.has(name)) continue
      const isOw = isOneway(f.tags)
      const curatedHW = (correctedSurvey[name]?.pavementHalfWidth) || 2
      const renderHW = isOw ? curatedHW : curatedHW * 2
      const swW = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      const buf = bufferPolyline(f.coords, renderHW + swW)
      for (let bi = 0; bi < buf.length; bi++) loopCutPaths.push(buf[bi])
    }
    if (loopCutPaths.length > 0) {
      // Save pre-cut block as clipping mask
      const preCut = new Paths()
      for (let i = 0; i < closed.length; i++) preCut.push(closed[i])

      const loopCutter = new Clipper()
      loopCutter.AddPaths(closed, PolyType.ptSubject, true)
      loopCutter.AddPaths(loopCutPaths, PolyType.ptClip, true)
      const afterCut = new Paths()
      loopCutter.Execute(ClipType.ctDifference, afterCut, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

      // Patch the frontage gap: for each loop street stem, add a small
      // rectangle at its entry point to fill the concavity left by the cut.
      const patchPaths = new Paths()
      for (const f of vehicularStreets) {
        const name = f.tags?.name
        if (!name || !LOOP_STREET_NAMES.has(name)) continue
        if (f.isClosed) continue  // only stems, not loops
        // Stem entry = first coordinate (the street-grid end)
        const entry = f.coords[0]
        const next = f.coords[1]
        // Stem direction at entry
        const sdx = next.x - entry.x, sdz = next.z - entry.z
        const slen = Math.sqrt(sdx * sdx + sdz * sdz)
        if (slen < 0.1) continue
        // Perpendicular = frontage direction
        const fx = -sdz / slen, fz = sdx / slen
        // Patch dimensions
        const curatedHW = (correctedSurvey[name]?.pavementHalfWidth) || 2
        const swW = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
        const halfWidth = (curatedHW * 2) + swW + 5  // stem buffer + margin
        const depth = halfWidth + 2  // just enough to cover the opening
        // Rectangle perpendicular to stem at entry
        const p1x = entry.x + fx * halfWidth, p1z = entry.z + fz * halfWidth
        const p2x = entry.x - fx * halfWidth, p2z = entry.z - fz * halfWidth
        const p3x = p2x + (sdx / slen) * depth, p3z = p2z + (sdz / slen) * depth
        const p4x = p1x + (sdx / slen) * depth, p4z = p1z + (sdz / slen) * depth
        patchPaths.push([
          toClipper(p1x, p1z), toClipper(p2x, p2z),
          toClipper(p3x, p3z), toClipper(p4x, p4z),
        ])
      }

      if (patchPaths.length > 0) {
        // Union patches with cut block
        const patcher = new Clipper()
        patcher.AddPaths(afterCut, PolyType.ptSubject, true)
        patcher.AddPaths(patchPaths, PolyType.ptClip, true)
        const patched = new Paths()
        patcher.Execute(ClipType.ctUnion, patched, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        // Clip to pre-cut boundary (patch can't extend beyond original block)
        const clipper = new Clipper()
        clipper.AddPaths(patched, PolyType.ptSubject, true)
        clipper.AddPaths(preCut, PolyType.ptClip, true)
        const clipped = new Paths()
        clipper.Execute(ClipType.ctIntersection, clipped, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        closed = clipped.length > 0 ? clipped : afterCut
      } else {
        closed = afterCut
      }
    }

    // ── Detect street-offset faces early (needed to skip dead-end cuts) ──
    let useStreetOffset = false
    for (let ci = 0; ci < closed.length && !useStreetOffset; ci++) {
      for (const pt of closed[ci]) {
        const px = pt.X / CLIP_SCALE, pz = pt.Y / CLIP_SCALE
        if (px > 15 && px < 55 && pz > -510 && pz < -430) { useStreetOffset = true; break }
        if (px > -270 && px < -94 && pz > -490 && pz < -410) { useStreetOffset = true; break }
        if (px > -32 && px < 268 && pz > -421 && pz < -181) { useStreetOffset = true; break }
      }
    }

    // ── Dead-end "Divide" treatment ────────────────────────────────
    // When a dead-end street is in this face, carve the road channel
    // from the block. The cut removes block material in the road zone
    // and creates a semicircular gap at the dead end.
    const deadsInFace = deadEndPoints.filter(dep => {
      for (const p of face.ring) {
        if (Math.hypot(p.x - dep.x, p.z - dep.z) < 1) return true
      }
      return false
    })
    for (const dep of deadsInFace) {
      // Check if dead end is inside the block already
      let insideBlock = false
      for (let ci = 0; ci < closed.length; ci++) {
        const ring = closed[ci].map(pt => ({ x: pt.X / CLIP_SCALE, z: pt.Y / CLIP_SCALE }))
        if (pointInRing(dep.x, dep.z, ring)) { insideBlock = true; break }
      }
      // If not inside, fill first — but only if the block is close to the
      // road (within ~15m). Otherwise the fill creates standalone blobs.
      if (!insideBlock) {
        let blockNearDead = false
        const proxDist = dep.halfWidth + 10  // ~16m proximity check
        for (let ci = 0; ci < closed.length && !blockNearDead; ci++) {
          for (const pt of closed[ci]) {
            if (Math.hypot(pt.X/CLIP_SCALE - dep.x, pt.Y/CLIP_SCALE - dep.z) < proxDist) {
              blockNearDead = true; break
            }
          }
        }
        if (!blockNearDead) continue
        const swZ = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
        const fillHW = dep.halfWidth + swZ + 5
        // Only fill near the dead end (last 3 points), not the full street
        const fillSeg = dep.segment.slice(Math.max(0, dep.segment.length - 3))
        const fillBuf = bufferPolyline(fillSeg, fillHW)
        if (fillBuf.length > 0) {
          const merger = new Clipper()
          merger.AddPaths(closed, PolyType.ptSubject, true)
          merger.AddPaths(fillBuf, PolyType.ptClip, true)
          const merged = new Paths()
          merger.Execute(ClipType.ctUnion, merged, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
          if (merged.length > 0) closed = merged
        }
      }
      // Cut the full street right-of-way: pavement + curb + tree lawn +
      // sidewalk. Flat end at dead end so sidewalk doesn't wrap around cap.
      const swZ = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      const cutHW = dep.halfWidth + swZ + 2  // road + sidewalk zone + margin
      const roadBuf = bufferPolyline(dep.segment, cutHW)
      if (roadBuf.length > 0) {
        const cutter = new Clipper()
        cutter.AddPaths(closed, PolyType.ptSubject, true)
        cutter.AddPaths(roadBuf, PolyType.ptClip, true)
        const afterCut = new Paths()
        cutter.Execute(ClipType.ctDifference, afterCut, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        if (afterCut.length > 0) closed = afterCut
      }
    }

    // ── Street-offset block (edge-case fallback) ─────────────────
    // When parcel boundaries produce jagged blocks, build the block
    // directly from street centerlines: face - street buffers at
    // per-street halfWidth + sidewalkZone. This gives perfectly straight
    // edges by construction. NOT a universal fix — invoke manually for
    // specific problem faces. Will break normal blocks if applied blindly.
    //
    // To use: check face centroid against target coordinates, or wire up
    // marker-stroke trigger. Currently hardcoded for the Mackay/Hickory
    // channel area where parcel boundaries don't align.
    const faceCx = face.ring.reduce((s, p) => s + p.x, 0) / face.ring.length
    const faceCz = face.ring.reduce((s, p) => s + p.z, 0) / face.ring.length
    // Target: Mackay/Hickory channel area (hardcoded for now)
    // Log all face centroids in broad area to find the right ones
    // Check if this face should use street-offset block instead of parcels.
    // Currently targets the Mackay/Hickory channel where parcel boundaries
    // don't align. TODO: wire up marker-stroke trigger for other areas.
    if (useStreetOffset && face.ring.length >= 3 && closed.length > 0) {
      const swZone = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      const edgeWidths = getEdgeWidths(face.ring, vehicularStreets, correctedSurvey, 6.0)
      const streetBufs = new Paths()
      for (let ei = 0; ei < face.ring.length; ei++) {
        const a = face.ring[ei]
        const b = face.ring[(ei + 1) % face.ring.length]
        const hw = edgeWidths[ei] + swZone
        // At dead-end endpoints, pull back to match render.js street cap
        const segPts = [{ ...a }, { ...b }]
        for (let si = 0; si < 2; si++) {
          const pt = si === 0 ? a : b
          for (const dep of deadsInFace) {
            if (Math.hypot(pt.x - dep.x, pt.z - dep.z) < 2) {
              const other = si === 0 ? b : a
              const dx = other.x - pt.x, dz = other.z - pt.z
              const len = Math.hypot(dx, dz)
              if (len > dep.halfWidth) {
                segPts[si] = { x: pt.x + dx/len * dep.halfWidth, z: pt.z + dz/len * dep.halfWidth }
              }
            }
          }
        }
        const buf = bufferPolyline([segPts[0], segPts[1]], hw)
        for (let bi = 0; bi < buf.length; bi++) streetBufs.push(buf[bi])
      }
      const facePath = face.ring.map(p => toClipper(p.x, p.z))
      const fp = new Paths(); fp.push(facePath)
      const maskClipper = new Clipper()
      maskClipper.AddPaths(fp, PolyType.ptSubject, true)
      maskClipper.AddPaths(streetBufs, PolyType.ptClip, true)
      const mask = new Paths()
      maskClipper.Execute(ClipType.ctDifference, mask, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
      if (mask.length > 0) closed = mask
    }

    // Smooth + round corners
    for (let i = 0; i < closed.length; i++) {
      const area = Math.abs(Clipper.Area(closed[i]))
      if (area < 50 * CLIP_SCALE * CLIP_SCALE) continue
      const single = new Paths(); single.push(closed[i])
      const smoothed = roundCorners(single, 1.0)
      for (let j = 0; j < smoothed.length; j++) {
        const s2 = new Paths(); s2.push(smoothed[j])
        const rounded = roundCorners(s2, radius)
        for (let k = 0; k < rounded.length; k++) {
          allBlockPaths.push(rounded[k])
          // No parcels on this face → nothing derived it. `underived`, not a
          // confident 'residential' (see the faceFills ladder below).
          let dominant = UNDERIVED, maxCount = 0
          const useCounts = {}
          for (const p of faceParcels) {
            const use = classifyLandUse(p)
            useCounts[use] = (useCounts[use] || 0) + 1
          }
          for (const [use, count] of Object.entries(useCounts)) {
            if (count > maxCount) { maxCount = count; dominant = use }
          }
          // A median by SHAPE, not by the absence of parcels (which varied with the well).
          const isMedian = face.absArea < 5000
          blockMeta.push({ clipperPath: rounded[k], dominantUse: dominant, isMedian })
        }
      }
    }
  }

  // Create medians from closed loop street geometry
  // (These don't form faces in polygonize — they're dead-end loops)
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (!name || !LOOP_STREET_NAMES.has(name)) continue
    if (!f.isClosed) continue  // only the closed loop, not the stem
    // Shrink the loop inward to get the median polygon
    const loopPath = f.coords.map(c => toClipper(c.x, c.z))
    const medInset = new ClipperOffset()
    medInset.ArcTolerance = ARC_TOL
    const lp = new Paths(); lp.push(loopPath)
    medInset.AddPaths(lp, JoinType.jtRound, EndType.etClosedPolygon)
    const medPaths = new Paths()
    // Inset by road half-width + sidewalk to get green median
    const curatedHW = (correctedSurvey[name]?.pavementHalfWidth) || 2
    medInset.Execute(medPaths, -(curatedHW + 1.0) * CLIP_SCALE)  // road + small gap
    for (let i = 0; i < medPaths.length; i++) {
      const area = Math.abs(Clipper.Area(medPaths[i]))
      if (area < 20 * CLIP_SCALE * CLIP_SCALE) continue
      allBlockPaths.push(medPaths[i])
      blockMeta.push({ clipperPath: medPaths[i], dominantUse: 'park', isMedian: true })
    }
  }


  console.log(`    ${allBlockPaths.length} blocks (${faceBlocks} from face polygons, medians included; parcels vote land use only)`)

  // ── SPIKE: street-offset blocks for comparison ──────────────
  // Build blocks from face − street buffers (pavementHalfWidth only,
  // block edge = curb). Run for ALL block faces so we can compare
  // the full street-offset model against the parcel-union model.
  const SPIKE = true
  const spikeBlockPaths = new Paths()
  if (SPIKE) {
    console.log('  [SPIKE] Building street-offset blocks (block edge = curb)...')
    let spikeDeadEndHits = 0
    for (let fi = 0; fi < blockFaces.length; fi++) {
      const face = blockFaces[fi]
      if (face.ring.length < 3) continue

      // Buffer each face edge by its street's pavementHalfWidth
      const edgeWidths = getEdgeWidths(face.ring, vehicularStreets, correctedSurvey, 6.0)
      const streetBufs = new Paths()
      for (let ei = 0; ei < face.ring.length; ei++) {
        const a = face.ring[ei]
        const b = face.ring[(ei + 1) % face.ring.length]
        const hw = edgeWidths[ei]
        const buf = bufferPolyline([a, b], hw)
        for (let bi = 0; bi < buf.length; bi++) streetBufs.push(buf[bi])
      }

      // Dead-end tip caps: the face has a slit going to the dead-end
      // vertex and back. The edge buffers along the slit leave a small
      // uncovered triangle at the very tip. Add a circle at the dead-end
      // point (radius = pavementHalfWidth) to close it.
      // Skip when the operator has marked this street with a cap — the
      // ribbon cap covers 180°, so a full 360° cut here leaves the other
      // 180° exposed as a "green artifact." Let the cap render on top.
      for (const f of vehicularStreets) {
        if (LOOP_STREET_NAMES.has(f.tags?.name)) continue
        const c = f.coords
        if (c.length < 2) continue
        if (streetNamesWithOperatorCaps.has(f.tags?.name)) continue
        for (const ep of [c[0], c[c.length - 1]]) {
          let onFace = false
          for (const p of face.ring) {
            if (Math.hypot(p.x - ep.x, p.z - ep.z) < 2) { onFace = true; break }
          }
          if (!onFace) continue
          const key = `${Math.round(ep.x*10)},${Math.round(ep.z*10)}`
          if (!deadEndNodes.has(key)) continue
          const hw = (correctedSurvey[f.tags?.name]?.pavementHalfWidth) || wayHalfWidth(f.tags)
          // Approximate circle at the dead-end point
          const N = 24
          const circle = []
          for (let i = 0; i < N; i++) {
            const angle = (2 * Math.PI * i) / N
            circle.push(toClipper(ep.x + hw * Math.cos(angle), ep.z + hw * Math.sin(angle)))
          }
          streetBufs.push(circle)
          spikeDeadEndHits++
          break
        }
      }

      // Block = face minus street buffers
      const facePath = face.ring.map(p => toClipper(p.x, p.z))
      const fp = new Paths(); fp.push(facePath)
      const maskClipper = new Clipper()
      maskClipper.AddPaths(fp, PolyType.ptSubject, true)
      maskClipper.AddPaths(streetBufs, PolyType.ptClip, true)
      const mask = new Paths()
      maskClipper.Execute(ClipType.ctDifference, mask, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

      // Round corners same as regular blocks
      for (let i = 0; i < mask.length; i++) {
        const area = Math.abs(Clipper.Area(mask[i]))
        if (area < 50 * CLIP_SCALE * CLIP_SCALE) continue
        const single = new Paths(); single.push(mask[i])
        const smoothed = roundCorners(single, 1.0)
        for (let j = 0; j < smoothed.length; j++) {
          const s2 = new Paths(); s2.push(smoothed[j])
          const rounded = roundCorners(s2, radius)
          for (let k = 0; k < rounded.length; k++) {
            spikeBlockPaths.push(rounded[k])
          }
        }
      }
    }
    console.log(`    [SPIKE] ${spikeBlockPaths.length} street-offset blocks, ${spikeDeadEndHits} dead-end buffers applied, ${[...new Set(blockFaces.flatMap((f,fi) => { const dvs = []; for (let ri = 0; ri < f.ring.length; ri++) { const p = f.ring[ri]; const key = Math.round(p.x*10)+","+Math.round(p.z*10); if (deadEndNodes.has(key)) dvs.push(key); } return dvs; }))].length} dead-end vertices on face rings`)
  }

  // (block_patches reserved for future gap-fill work)

  // ── Sidewalk: uniform geometric inset ────────────────────────
  console.log('  [6/8] Deriving sidewalk strips...')

  const sidewalkWidth = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
  const lotPaths = new Paths()
  const sidewalkStripPaths = new Paths()

  for (let bi = 0; bi < allBlockPaths.length; bi++) {
    const blockPath = allBlockPaths[bi]

    // Medians (loop interiors): all green, no sidewalk inset
    if (blockMeta[bi]?.isMedian) {
      lotPaths.push(blockPath)
      continue
    }

    // Uniform inset: shrink block by sidewalk width to get lot
    const single = new Paths(); single.push(blockPath)
    const shrunk = shrinkPaths(single, sidewalkWidth)

    if (shrunk.length === 0) {
      // Block too small to shrink — lot IS the block
      lotPaths.push(blockPath)
      continue
    }

    for (let i = 0; i < shrunk.length; i++) {
      lotPaths.push(shrunk[i])
    }

    // Sidewalk strip = block minus lot
    const stripClipper = new Clipper()
    const blockSingle = new Paths(); blockSingle.push(blockPath)
    stripClipper.AddPaths(blockSingle, PolyType.ptSubject, true)
    stripClipper.AddPaths(shrunk, PolyType.ptClip, true)
    const strip = new Paths()
    stripClipper.Execute(ClipType.ctDifference, strip, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    for (let i = 0; i < strip.length; i++) sidewalkStripPaths.push(strip[i])
  }

  const sidewalkEdgeCount = allBlockPaths.length > 0
    ? Math.round(lotPaths.length / allBlockPaths.length * 100) : 0
  console.log(`    ${sidewalkStripPaths.length} sidewalk strips, ${lotPaths.length} lots`)

  // ── Alleys: separate internal layer ─────────────────────────
  console.log('  [7/8] Processing alleys...')
  // ⭐⭐⭐ THE ALLEY IS CUT AT THE ASPHALT, NOT AT THE SIDEWALK (Jacob, 2026-09-08:
  // "We have/had a rule that the alleys are cut off flush with the *sidewalks* but it would make
  // more sense to have them cut off at the asphalt").
  // ⛔ THIS BUFFER USED TO REACH `pavementHW + curb + treelawn + sidewalk` — the back of the
  // sidewalk — so an alley stopped at the OUTER edge of the ped zone and never touched the road.
  // That is why an alley crossing a street is stored as two stubs with a hole in it: the hole is
  // the whole right-of-way, not the roadway. ▶ MEASURED: 104 of 108 facing stub pairs on LS have a
  // street dead-centre in the gap, median gap 16.5 m — `checks/claims-alley-stub-pairs.mjs`.
  // ⇒ Reaching only to the asphalt edge lets the alley run through the ped zone and meet the road,
  // which is what it does on the ground. The remaining gap is then the ROADWAY, not the ROW.
  // ⛔⛔ ACCEPTED AS A STOPGAP, NOT AS CORRECT (Jacob, 2026-09-08: "It looked better when the
  // alleys terminated at the asphalt, even if it's a stopgap until we figure out a real fix").
  // It was landed, REVERTED on his eye, and reinstated on the same eye. TWO ARTIFACTS ARE KNOWN,
  // OPEN, AND UNEXPLAINED — do not read this code as finished:
  //   1. "the curbs go into the alley" — and the render order says that is IMPOSSIBLE:
  //      treelawn 0.020 · sidewalk 0.030 · curb 0.035 · asphalt 0.040 · paths 0.050. A path is
  //      above the curb. The only same-height suspect is `curbOutline` (0.050), which is the
  //      SURVEY wireframe, and the verdict was taken in Measure. Mechanism NOT established.
  //   2. "the alley doesn't span the whole block" — and shrinking this buffer can only make an
  //      alley LONGER, so this is the opposite of the change's only effect. Either such alleys
  //      were always short and the new length made them conspicuous, or the trim interacts with
  //      the 8 m minimum-fragment drop below. Mechanism NOT established. (Alleys 244 → 243.)
  // ⛔ AND ONE ARGUMENT MADE FOR THIS CHANGE WAS WITHDRAWN: that the ped band must be cut BY the
  // alley because the tree gate reads the painted polygons. It does not reach them —
  // `forbidden-surface.mjs` tests obstruction footprints, `alley` among them, FIRST. Measured:
  // 102 of 110 points both painted-treelawn and under an alley are already forbidden.
  // ⚠️ The 8 that slip through are real and survive here: they sit inside the LIVE alley ribbon
  // but not the BAKED `layers.alley` — the render and the bake disagree slightly about where an
  // alley is. That discrepancy is its own open item.
  //
  // ⛔⛔⛔ THIRD OPEN ITEM, AND THIS ONE IS MEASURED TO A CAUSE — PARKED 2026-09-08, NOT FIXED.
  // **EVERY ALLEY IS CUT BACK ~2.85 m BEYOND THE ROAD IT SHOULD MEET, AND IT PREDATES THIS BLOCK.**
  // The trim below prefers `raw/centerlines.json` for `pavementHW`; the ASPHALT is drawn from the
  // POURED measure in `ribbons.json`. They are two sources for one quantity and they disagree:
  //     40 comparable streets · 27 disagree by >0.25 m · mean (drawn − trim) = −2.85 m
  // so the ROW buffer is wider than the road actually drawn and the alley stops short of it.
  // ▶ MEASURED against the drawn asphalt edge: 157 alley ends, median 2.40 m short; only 20 sit
  //   on the edge; 64 are 0.5-3 m short.
  // ⭐⭐ AND IT WAS INVISIBLE BECAUSE A CAP WAS COMPENSATING FOR IT. `etOpenRound` bulges half a
  // width (2.29 m) past the endpoint — almost exactly the 2.40 m shortfall — so with the Look's
  // `alleyCap: 'round'` the alleys LOOKED right. Switching the dial to `square` (`etOpenButt`,
  // flush at the endpoint) removed the camouflage and the operator saw "not long enough".
  // ⛔ THE TWO REPORTS — "rounded caps where it should butt" and "now they're not long enough" —
  // ARE ONE DEFECT, and neither is the cap or the asphalt-edge trim above. A cosmetic default was
  // load-bearing, which is why removing it looked like a regression it did not cause.
  // ▶ THE FIX, when it is taken up: trim from the SAME measure the render draws from, not a second
  //   source that disagrees on two thirds of streets. It is the `_centerlineForAlleys` preference
  //   immediately below. ⛔ Do not "fix" it by restoring the round cap — the operator's verdict is
  //   that rounded is WORSE; the short alley is the honest symptom and it should stay visible.
  // Preference order: centerlines.json measure (per-side, surveyor-authored)
  // → standards.crossSection fallback.
  let _centerlineForAlleys = new Map()
  try {
    const _cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(_cPath)) {
      const cd = JSON.parse(readFileSync(_cPath, 'utf-8'))
      for (const st of (cd.streets || [])) {
        if (!st.name || _centerlineForAlleys.has(st.name)) continue
        _centerlineForAlleys.set(st.name, st)
      }
    }
  } catch { /* no centerlines */ }

  const _rowBufferPaths = new Paths()
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (name && LOOP_STREET_NAMES.has(name)) continue
    let rowHW
    const cl = _centerlineForAlleys.get(name)
    if (cl?.measure?.left && cl?.measure?.right) {
      const L = cl.measure.left, R = cl.measure.right
      // Full spectrum: pavement + curb + treelawn + sidewalk (matches
      // streetProfiles.getHalfWidth — the exact back-of-sidewalk reach
      // that StreetRibbons renders).
      const lCurb = L.terminal === 'none' ? 0 : KIT_CURB_WIDTH
      const rCurb = R.terminal === 'none' ? 0 : KIT_CURB_WIDTH
      // ⭐ ASPHALT EDGE — pavement + curb. ⛔ NOT `+ treelawn + sidewalk`; see the block above.
      rowHW = Math.max(L.pavementHW + lCurb, R.pavementHW + rCurb)
    } else if (isSweptClass(classOf(f.tags).class)) {
      // A highway way's reach is its typical section (H-3), from the way's own tags.
      const n = parseInt(f.tags?.lanes, 10)
      const hs = highwaySection({ class: classOf(f.tags).class, oneway: isOneway(f.tags), lanes: Number.isFinite(n) ? n : null, ref: f.tags?.ref ?? null }, hwyStd())
      rowHW = Math.max(hs.left.pavementHW, hs.right.pavementHW)
    } else {
      // The way's own class section (`streetClass.js`), configured by its own lanes. Pass survey so
      // fallback streets (Chouteau, Jefferson, Dolman, …) still pick up their surveyed
      // pavementHalfWidth + sidewalk offsets. The inline highway→type ternary that stood here (a
      // copy of `mapHighwayToStreetType`, defaulting to 'residential') is gone.
      const n = parseInt(f.tags?.lanes, 10)
      const dm = defaultMeasure(classOf(f.tags).class, correctedSurvey[name], { lanes: Number.isFinite(n) && n > 0 ? n : null, oneway: isOneway(f.tags) })
      const L = dm.left, R = dm.right
      const lCurb = L.terminal === 'none' ? 0 : KIT_CURB_WIDTH
      const rCurb = R.terminal === 'none' ? 0 : KIT_CURB_WIDTH
      rowHW = Math.max(L.pavementHW + lCurb, R.pavementHW + rCurb)   // asphalt edge, as above
    }
    // NOTE: no divide-by-2 for divided streets here.  For alley clipping we
    // want the ROW buffer to reach the outer back-of-sidewalk regardless of
    // whether the OSM centerline represents the whole pavement or one half.
    const simplified = simplifyPolyline(f.coords, 1.0)
    const buf = bufferPolyline(simplified, rowHW)
    for (let i = 0; i < buf.length; i++) _rowBufferPaths.push(buf[i])
  }
  const streetROWUnion = new Paths()
  {
    const c = new Clipper()
    c.AddPaths(_rowBufferPaths, PolyType.ptSubject, true)
    c.Execute(ClipType.ctUnion, streetROWUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  }

  const alleyKeptPieces = new Paths()
  const alleyCenterlines = []  // {name, points:[[x,z]], pavedWidth}
  for (const f of alleys) {
    if (!f.coords || f.coords.length < 2) continue
    const linePath = f.coords.map(c => toClipper(c.x, c.z))
    const lineClipper = new Clipper()
    lineClipper.AddPath(linePath, PolyType.ptSubject, false)  // open
    lineClipper.AddPaths(streetROWUnion, PolyType.ptClip, true)
    const tree = new PolyTree()
    lineClipper.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    const trimmedSegs = Clipper.OpenPathsFromPolyTree(tree)
    for (const seg of trimmedSegs) {
      if (seg.length < 2) continue
      let segLen = 0
      for (let k = 1; k < seg.length; k++) {
        const dx = (seg[k].X - seg[k - 1].X) / CLIP_SCALE
        const dy = (seg[k].Y - seg[k - 1].Y) / CLIP_SCALE
        segLen += Math.hypot(dx, dy)
      }
      // Drop tiny fragments (OSM polyline ends that barely poked past a
      // curb — they'd buffer into useless stubs on far sides of streets).
      if (segLen < 8) continue
      // Emit centerline (pre-buffer polyline) so StreetRibbons can render
      // the alley as a proper ribbon (centerline spine + silhouette + edge
      // strokes) matching street treatment in Survey/Measure/Design.
      const pts = []
      for (let k = 0; k < seg.length; k++) {
        pts.push([seg[k].X / CLIP_SCALE, seg[k].Y / CLIP_SCALE])
      }
      alleyCenterlines.push({
        name: f.tags?.name || null,
        points: pts,
        pavedWidth: STANDARDS.alley.pavedWidth,
      })
      const co = new ClipperOffset()
      co.ArcTolerance = ARC_TOL
      // etOpenButt: flat cap terminating at the polyline endpoint (no
      // bulge past it).  Alley ends flush at the block boundary where
      // the polyline was trimmed — no rounded caps, no pavement poke.
      co.AddPath(seg, JoinType.jtRound, EndType.etOpenButt)
      const buf = new Paths()
      co.Execute(buf, STANDARDS.alley.pavedWidth / 2 * CLIP_SCALE)
      for (let i = 0; i < buf.length; i++) alleyKeptPieces.push(buf[i])
    }
  }
  // Union overlapping kept pieces (alleys meeting at T/+ junctions).
  const alleyUnion = new Paths()
  {
    const c = new Clipper()
    c.AddPaths(alleyKeptPieces, PolyType.ptSubject, true)
    c.Execute(ClipType.ctUnion, alleyUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  }
  console.log(`    ${alleyUnion.length} alley polygons (trimmed at the ASPHALT edge, not the back of sidewalk)`)

  // ── Street markings ─────────────────────────────────────────
  // ⛔ The centre stripe and the parking edge line are NOT built here any more (BRIEF-the-ink-is-owned-by-its-labels §3,
  // 2026-10-25): they were raw-OSM chains past the Wall (`centerStripe`, every non-oneway surveyed class; `parkingLine`, a
  // spec offset of the way). The road's paint is selected per street (`marks`, below) and drawn by the ground from the
  // sealed centreline and ②'s labelled kerb (`tileGround.js#roadMarkings`). Bike lanes stay here (filed, BACKLOG).
  const bikeLanes = []
  for (const f of highways) {
    const t = f.tags?.highway
    if (!CLASSES[classOf(f.tags).class].surveyed) continue   // the vocabulary's surveyed street classes
    if (f.coords.length < 2) continue
    const cyc = f.tags.cycleway || f.tags['cycleway:left'] || f.tags['cycleway:right']
    if (cyc === 'lane' || cyc === 'track') {
      const spec = getStreetSpec(f.tags)
      bikeLanes.push({ coords: f.coords.map(c => ({ x: c.x, z: c.z })), name: f.tags.name || t, offset: (spec.lanes / 2) * spec.laneWidth })
    }
  }

  // ── Footways, cycleways, steps, paths ───────────────────────
  function bufferEach(features, hw) {
    const result = []
    for (const f of features) {
      const buf = bufferPolyline(f.coords, hw)
      for (let i = 0; i < buf.length; i++)
        result.push({ ring: pathFromClipper(buf[i]) })
    }
    return result
  }
  // Emit path centerlines alongside polygons so StreetRibbons can render
  // them as roadway ribbons (centerline + silhouette + edge strokes) in
  // Survey/Measure/Design, matching the street/alley treatment.
  function centerlinesFor(features, kind, width) {
    const out = []
    for (const f of features) {
      if (!f.coords || f.coords.length < 2) continue
      out.push({
        name: f.tags?.name || null,
        kind,
        points: f.coords.map(c => [c.x, c.z]),
        pavedWidth: width,
      })
    }
    return out
  }

  const footways = highways.filter(f =>
    f.tags?.highway === 'footway' && f.tags?.footway !== 'crossing' && f.tags?.footway !== 'sidewalk' && f.coords.length >= 2
  )
  const cycleways = highways.filter(f => f.tags?.highway === 'cycleway' && f.coords.length >= 2)
  const steps = highways.filter(f => f.tags?.highway === 'steps' && f.coords.length >= 2)
  const paths = highways.filter(f => (f.tags?.highway === 'path' || f.tags?.highway === 'pedestrian') && f.coords.length >= 2)

  const pathCenterlines = [
    ...centerlinesFor(footways,  'footway',  STANDARDS.footway.width),
    ...centerlinesFor(cycleways, 'cycleway', STANDARDS.cycleway.width),
    ...centerlinesFor(steps,     'steps',    STANDARDS.steps.width),
    ...centerlinesFor(paths,     'path',     STANDARDS.path.width),
  ]

  const toFeats = (cp) =>
    Array.from({ length: cp.length }, (_, i) => ({ ring: pathFromClipper(cp[i]) }))

  // ── Elevation contours ──────────────────────────────────────
  let contours = []
  try {
    const elevData = JSON.parse(readFileSync(join(RAW_DIR, 'elevation.json'), 'utf-8'))
    contours = generateContours(elevData, 2)
    console.log(`    Contours: ${contours.length} lines (2m interval, ${elevData.minElev.toFixed(0)}-${elevData.maxElev.toFixed(0)}m)`)
  } catch { console.log('    No elevation data (run pipeline without --skip-elevation)') }

  // ── Park ────────────────────────────────────────────────────
  let parkFeats = []
  let parkSidewalkFeats = []
  if (parkPolygon) {
    parkFeats = [{ ring: pathFromClipper(parkPolygon) }]

    const PARK_SIDEWALK = 2.5
    const parkSWOffset = new ClipperOffset()
    parkSWOffset.ArcTolerance = ARC_TOL
    const parkPaths = new Paths()
    parkPaths.push(parkPolygon)
    parkSWOffset.AddPaths(parkPaths, JoinType.jtRound, EndType.etClosedPolygon)
    const parkSidewalkPaths = new Paths()
    parkSWOffset.Execute(parkSidewalkPaths, PARK_SIDEWALK * CLIP_SCALE)

    parkSidewalkFeats = Array.from({ length: parkSidewalkPaths.length }, (_, i) => ({
      ring: pathFromClipper(parkSidewalkPaths[i])
    }))
    console.log(`    Park sidewalk: ${parkSidewalkFeats.length}`)
  }

  // ── Clip street pavement to exclude blocks ──────────────────
  // OSM centerlines can be off-center in the ROW, causing street buffers
  // to overlap block perimeters (and cover sidewalks). Clip streets to
  // the space between blocks so they never paint over sidewalks.
  const streetClipClipper = new Clipper()
  streetClipClipper.AddPaths(streetUnion, PolyType.ptSubject, true)
  streetClipClipper.AddPaths(allBlockPaths, PolyType.ptClip, true)
  const clippedStreets = new Paths()
  streetClipClipper.Execute(ClipType.ctDifference, clippedStreets, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const pavementFeats = toCompoundFeatures(clippedStreets)
  console.log(`    ${pavementFeats.length} street pavement polygons (clipped to exclude blocks)`)

  // ── Compute ribbons layer (3D street cross-section data) ───
  console.log('  [8/8] Computing ribbons layer...')

  // Load measurements (user overrides from the measure tool)
  let measurements = []
  try {
    const mPath = join(RAW_DIR, 'measurements.json')
    if (existsSync(mPath)) {
      measurements = JSON.parse(readFileSync(mPath, 'utf-8')).measurements || []
    }
  } catch { /* no measurements */ }

  // Load centerlines (surveyor-curated street metadata + optional measure).
  // `measure: {left, right}` is the current schema; per-name first-segment wins.
  let centerlineByName = new Map()
  try {
    const cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(cPath)) {
      const cd = JSON.parse(readFileSync(cPath, 'utf-8'))
      for (const st of (cd.streets || [])) {
        if (!st.name) continue
        if (!centerlineByName.has(st.name)) {
          centerlineByName.set(st.name, st)
        } else if (st.measure && !centerlineByName.get(st.name).measure) {
          centerlineByName.set(st.name, st)
        }
      }
    }
  } catch { /* no centerlines */ }

  /**
   * Resolve the cross-section measure for a street. Returns {left, right, source}
   * where each side is {pavementHW, treelawn, sidewalk, terminal}.
   *
   * Authority: skeleton seed → survey-driven default. The seed IS the width
   * base (E1): skeleton.js bakes custom (survey.json) → OSM lanes → AASHTO
   * into it, per side, name-propagated to every chain (divided carriageways
   * included; their median sides are zeroed by the divided-pair pass below).
   * The operator's overlay wins upstream of this call (overlay = tweaks only).
   *
   * The legacy centerlines.json measure tier was REMOVED here (E1): its 11
   * measured names are all carried by overlay.json already (migrate-overlay
   * broadcast them), so the tier could only re-shadow the seed base with
   * stale machine values — South 18th's pavementHW=2 lived there.
   */
  function computeStreetMeasure(name, cls, seed, chain) {
    if (isSweptClass(cls)) {
      const hs = highwaySection(chain, hwyStd())
      hwyReport.push({ id: chain.id, ...hs.report, sources: hs.right.section.sources })
      const m = measureFromSeed(seed, cls, hs)
      return { left: m.left, right: m.right, symmetric: m.symmetric, source: 'highway-section' }
    }
    // ⛔ Every skeleton chain is seeded from its class (`classSection`); a chain without a seed is a
    // skeleton that predates it. The seedless survey/type default that stood here is gone.
    if (!seed) throw new Error(`⛔ computeStreetMeasure: "${name}" (${chain.id}) has no seed — re-pour the skeleton`)
    const m = measureFromSeed(seed, cls)
    return {
      left: m.left,
      right: m.right,
      symmetric: m.symmetric,
      source: seed.widthSource === 'survey' ? 'seed-survey' : 'seed',
    }
  }

  // Street geometry comes from skeleton.json (Phase 0). Skeleton has already
  // welded same-name fragments, collapsed divided pairs (where listed in
  // DIVIDED_PAIRS), simplified, and fixed direction. Every skeleton entry
  // becomes one ribbon chain here — no re-welding, no reversal-detection,
  // no substantive-ratio heuristics. If Park Ave still splits into three
  // chains, that's because it isn't in DIVIDED_PAIRS yet; the signal is
  // visible and correct.
  const hwyReport = [], hwyRefused = []
  const skelPath = join(CLEAN_DIR, 'skeleton.json')
  if (!existsSync(skelPath)) {
    throw new Error(`skeleton.json not found at ${skelPath}. Run \`node skeleton.js\` first.`)
  }
  const skeleton = JSON.parse(readFileSync(skelPath, 'utf-8'))
  const skelStreets = skeleton.streets || []
  // ⛔ AN ID IS ONE CHAIN. Every map below is keyed by it (`simplifiedPoints`, `faceSimplified`,
  // `simplified`, `byskelId`, the overlay), and a Map keeps the LAST — Provincetown's two
  // `head-of-the-meadow-road` chains came out of this pour sharing one chain's points. Never first-wins.
  // ▶ node checks/claims-a-chain-id-is-one-chain.mjs
  {
    const idOwner = new Map()
    for (const s of [...skelStreets, ...(skeleton.paths || [])]) {
      const prev = idOwner.get(s.id)
      if (prev) throw new Error(`[derive] ⛔ skeleton.json has duplicate chain id "${s.id}": "${prev.name}" (${prev.points?.length ?? 0} pts) and "${s.name}" (${s.points?.length ?? 0} pts). Re-run skeleton.js, which now refuses to write one.`)
      idOwner.set(s.id, s)
    }
  }

  // [name-aware corner doctrine — SKELETON §5a / the curve-primitive brief's
  // name-awareness note] Canonical THROUGH-ROAD id: union chains linked by
  // `continuesAs` into one road (a name-transition is one continuous road — the
  // road is the line, the name is a label). Frozen onto every street so the curb's
  // cornerAt and Section's ADA bid treat a `continuesAs` seam as a THROUGH-node
  // (the curve flows straight through, no corner, no phantom ramp) instead of
  // minting a corner from a raw-skelId mismatch (the West-18th↔Dolman /
  // South-18th↔West-18th junction-curb bump, HANDOFF-curve-primitive-skeleton.md).
  // Representative = the MIN skelId in each component → deterministic across rebuilds.
  const roadIdOf = (() => {
    const parent = new Map()
    const add = (x) => { if (x != null && !parent.has(x)) parent.set(x, x) }
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
    for (const s of skelStreets) { add(s.id); add(s.continuesAs) }
    for (const s of skelStreets) {
      if (s.id == null || s.continuesAs == null) continue
      const ra = find(s.id), rb = find(s.continuesAs)
      if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)   // attach to the lexicographically-smaller root
    }
    // [Brief B — same-corridor-join roadId, 2026-06-16 / §10] Extend the union
    // BEYOND continuesAs: two chains of the SAME corridor whose ends MEET and
    // CONTINUE through the node (outward tangents ~opposite — not an L-corner, not
    // a divided A|B pair, not a cw↔spine transition) are one physical road through
    // a same-corridor-join. Union their roadId so the curb's cornerAt reads a
    // THROUGH-node (the inward offset runs straight, no miter step) AND width
    // reconciliation (~:2489, MAX per side per roadId) gives ONE width — else the
    // offset steps at the join (e.g. Mackay 3.96→5.49) → two close corners → the
    // fillet terminates non-tangent → the perpendicular-join curb tab (Brief B).
    // Same family as the continuesAs junction-curb bump; the join is topological
    // (ends meet) not a name-seam, so it needs its own union. skelStreets points are {x,z}.
    {
      const corOf = (s) => s.phase?.corridorName || s.name
      const isCwR = (r) => /^carriageway/.test(r || '')
      const nrm = (vx, vz) => { const L = Math.hypot(vx, vz) || 1; return [vx / L, vz / L] }
      const vk = (p) => p.x.toFixed(3) + ',' + p.z.toFixed(3)
      const ends = new Map()   // vKey → [{ id, out:[x,z], corr, pairKey, role }]
      for (const s of skelStreets) {
        if (s.id == null || !s.points || s.points.length < 2) continue
        for (const end of ['start', 'end']) {
          const p = s.points
          const [nd, ax] = end === 'start' ? [p[0], p[1]] : [p[p.length - 1], p[p.length - 2]]
          const k = vk(nd)
          if (!ends.has(k)) ends.set(k, [])
          ends.get(k).push({ id: s.id, out: nrm(ax.x - nd.x, ax.z - nd.z), corr: corOf(s), pairKey: s.phase?.pairKey || null, role: s.phase?.role || '' })
        }
      }
      const DOT_CONTINUES = -0.6
      for (const list of ends.values()) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const P = list[i], Q = list[j]
          if (P.id === Q.id || P.corr !== Q.corr) continue                              // same corridor only
          if (P.pairKey && P.pairKey === Q.pairKey && P.role !== Q.role) continue       // the divided A|B pair itself
          if (isCwR(P.role) !== isCwR(Q.role)) continue                                 // cw↔spine = a Source-1 transition, not a join
          if (P.out[0] * Q.out[0] + P.out[1] * Q.out[1] > DOT_CONTINUES) continue        // L-corner / parallel — not a through-join
          add(P.id); add(Q.id)
          const ra = find(P.id), rb = find(Q.id)
          if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
        }
      }
    }
    return (id) => (id != null && parent.has(id)) ? find(id) : id
  })()

  // Operator-intent overlay: skelId-keyed measure/caps/segmentMeasures/
  // couplers/anchor overrides written by Survey + Measure tools. The
  // Designer runtime merges these the same way (useCartographStore.js
  // `_loadCenterlines`); applying here makes the bake reflect operator
  // edits, otherwise pipeline reads stale defaults and Stage diverges
  // from Designer Preview.
  let overlayById = {}
  let overlayLoops = {}   // [E2-loop] per-loop interior override: { <bodySkelId>: { interior: 'median'|'block' } }
  try {
    const overlayPath = join(CLEAN_DIR, 'overlay.json')
    if (existsSync(overlayPath)) {
      const overlay = JSON.parse(readFileSync(overlayPath, 'utf-8'))
      overlayById = overlay.streets || {}
      overlayLoops = overlay.loops || {}
    }
  } catch { /* no overlay; bake from defaults */ }

  const ribbonStreets = []
  const intersections = []
  for (const s of skelStreets) {
    if (!s.name || !s.points || s.points.length < 2) continue
    const points = s.points.map(p => [p.x, p.z])
    const ov = overlayById[s.id] || null
    // Measure: overlay override → computeStreetMeasure default fallback.
    // `_measureAuthored` distinguishes operator-authored overlay measures from
    // name-keyed/default fallbacks — the divided-pair pass below normalizes
    // NON-authored carriageway measures to the inner-edge model (corridor
    // facts must not land verbatim on a carriageway's sides — that is the
    // broadcast smear that flooded every LS median, D1). Underscore-prefixed,
    // so the serializer whitelist drops it from the artifact.
    // ⛔ A highway takes no authoring (`r-highway-no-authoring`): an overlay measure on one is
    // REFUSED, kept in the file, and printed by name with its source — never applied, never dropped.
    if (!s.class) throw new Error(`⛔ derive: skeleton chain ${s.id} carries no class — re-pour the skeleton (streetClass.js)`)
    const ovOnHighway = isSweptClass(s.class) && !!(ov?.measure?.left && ov?.measure?.right)
    if (ovOnHighway) hwyRefused.push(`${s.id}(source:${ov.measure.source ?? 'none'})`)
    const ovAuthored = !ovOnHighway && !!(ov?.measure?.left && ov?.measure?.right)
    const measure = ovAuthored
      ? ov.measure
      : computeStreetMeasure(s.name, s.class, s.seed, s)
    // [curve-primitive] Convert the skeleton's index-referenced curve segments
    // (HANDOFF-curve-primitive-skeleton.md) to SELF-CONTAINED ribbon segments —
    // each carries its own endpoints + handles ([x,z]) so it survives the points
    // TESSELLATION below (points get densified for ix/legacy byte-identity; segments
    // stay sparse + index-free, the editor's "few nodes" + the concentric curb).
    // Omitted when the chain has no genuine curve → grid-identical.
    const segments = s.segments
      ? s.segments.map((g, i) => g.type === 'bezier'
          ? { type: 'bezier', a: [points[i][0], points[i][1]], b: [points[i + 1][0], points[i + 1][1]], c1: [g.c1.x, g.c1.z], c2: [g.c2.x, g.c2.z] }
          : { type: 'line', a: [points[i][0], points[i][1]], b: [points[i + 1][0], points[i + 1][1]] })
      : null
    const street = {
      name: s.name,
      points,
      ...(segments ? { segments } : {}),
      measure,
      // the road's paint tags in point order (skeleton.js#carryMarkings) and Survey's street-keyed override slot
      // (overlay.json streets[id].markings — reserved: no control writes it yet, BACKLOG)
      markings: s.markings ?? null,
      _marksAuthored: ov?.markings ?? null,
      intersections: [],
      oneway: !!s.oneway,
      skelId: s.id,
      roadId: roadIdOf(s.id),                 // canonical through-road id (continuesAs union)
      // [BRIEF-terminal-node-sweep] The frozen IDENTITY + terminal/through fact,
      // stamped in skeleton.js from the identity graph (same-name + shared vertex).
      // `throughId` is the identity the SHAPE cornerAt keys on (same identity both
      // sides of a tile vertex = a pass-through, no corner — dissolves the split-
      // carriageway/dogleg false corner). `through` marks each endpoint TERMINAL
      // (tip → real corner belongs here) vs THROUGH (interior → runs straight).
      // Distinct from roadId (the continuesAs/width union): throughId spans a
      // spine↔carriageway divided transition that roadId deliberately does NOT
      // (so widths are never smeared across it). A LABEL — no geometry moved.
      ...(s.throughId ? { throughId: s.throughId } : {}),
      ...(s.through ? { through: s.through } : {}),
      phase: s.phase || null,
      // The raw OSM highway tag (the chain's length vote), and its CLASS from the one vocabulary
      // (`streetClass.js`) — what every consumer reads. The re-guessed `type` vocabulary is gone.
      highway: s.highway,
      class: s.class,
      _measureAuthored: ovAuthored,
      // [P1 frame-enrichment] Carry the enriched frame fields off the skeleton
      // street so they survive into ribbons.json. These are PRESENT-but-not-yet-
      // consumed (the consumers — caps→chainPavementRing, seed→computeStreetMeasure,
      // chainGap/continuesAs — wire up at the Wall / Layer-2). Plumbing only.
      ...(Number.isFinite(s.lanes) ? { lanes: s.lanes } : {}),
      ...(s.surface ? { surface: s.surface } : {}),
      ...(s.maxspeed ? { maxspeed: s.maxspeed } : {}),
      ...(s.seed ? { seed: s.seed } : {}),
      ...(s.caps ? { caps: s.caps } : {}),
      ...(s.continuesAs ? { continuesAs: s.continuesAs } : {}),
      // The skeleton made this name up (an unnamed way, `<highway> <n>`): it is
      // an id, never a label. Label consumers read this field, not the name.
      ...(s.synthetic ? { synthetic: true } : {}),
      // [Part 2 grade separation] Carry the frame's grade flag through so the
      // face consumer (tileGround.extractFaces) can exclude grade-separated
      // roads from the planar face walk — the fix for the interchange-triangle /
      // sliver / false-block degenerates, which are grade-separated centerlines
      // crossing in 2D without a shared vertex. `gradeSeparated` is the operative
      // one-field filter (`streets.filter(s => !s.gradeSeparated)`); layer/bridge/
      // tunnel are the raw facts for any finer rule. See HANDOFF-onframe-faces.
      gradeSeparated: !!s.gradeSeparated,
      ...(s.layer ? { layer: s.layer } : {}),
      ...(s.bridge ? { bridge: true } : {}),
      ...(s.tunnel ? { tunnel: true } : {}),
    }
    // Skel owns geometric couplers; overlay-authored couplers override.
    if (ov?.couplers) street.couplers = ov.couplers
    else if (s.couplers) street.couplers = s.couplers
    if (ov?.segmentMeasures) street.segmentMeasures = ov.segmentMeasures
    if (ov?.anchor) street.anchor = ov.anchor
    if (ov?.innerSign) street.innerSign = ov.innerSign
    if (ov?.disabled) street.disabled = true
    // capEnds: overlay-first; legacy centerlines.json fallback runs below.
    if (ov?.capStart || ov?.capEnd) {
      street.capEnds = { start: ov.capStart || null, end: ov.capEnd || null }
    }
    ribbonStreets.push(street)
  }
  console.log(`    ${ribbonStreets.length} ribbon chains from skeleton (${skelStreets.length} skeleton streets, ${Object.keys(overlayById).length} overlay overrides)`)

  // [name-aware width reconciliation — SKELETON §5a, RIBBONS §1 "the road is the
  // line, the name a label"] A through-road (continuesAs union → one roadId) must
  // carry ONE curb half-width PER SIDE — a per-name-fragment width step on the same
  // continuous road is a datum artifact (RIBBONS:178), and it renders as a curb BUMP
  // at the seam (the West-18th↔Dolman / South-18th↔West-18th junction-curb bump,
  // HANDOFF-curve-primitive-skeleton.md). Reconcile each canonical road's per-side
  // BASE pavementHW to the MAX across its chains — widen the narrow artifacts to the
  // road's true width; never narrow a genuinely-wide segment. (Per-fe blockCustoms
  // overrides are reconciled separately in design.json, the Survey SHAPE SSoT.)
  // ⭐ RECONCILE BY THE PHYSICAL SIDE, NOT THE SIDE LABEL. `left`/`right` are
  // POINT-ORDER-RELATIVE: they name the hand relative to each chain's own
  // digitisation order, so two chains of ONE road whose point orders oppose each
  // other put the SAME physical curb under OPPOSITE labels. Keying the max on
  // `${roadId}|${side}` then makes each LABEL uniform while leaving a real step
  // in the ground — the two values that physically meet at the seam are never
  // compared. Measured on LS: a U whose two legs both START at the shared node,
  // so west-18th.left IS south-18th-3.right; both labels reconciled to a uniform
  // 5.49/6.93 and the curb still stepped 1.44 m at the join.
  //
  // Fix: union the (chain, side) keys that are physically continuous — two chains
  // of one road sharing an endpoint agree on labels only when the shared node is
  // one chain's END and the other's START; head-to-head or tail-to-tail FLIPS
  // them — then take the max per physical group. Pure topology: no street name,
  // no per-town table, no threshold beyond the existing endpoint tolerance.
  {
    const parent = new Map()
    const add = (k) => { if (!parent.has(k)) parent.set(k, k) }
    const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k) } return k }
    const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
    const sideKey = (st, side) => `${st.skelId}|${side}`
    for (const st of ribbonStreets) for (const side of ['left', 'right']) add(sideKey(st, side))

    const byRoad = new Map()
    for (const st of ribbonStreets) {
      const rid = st.roadId || st.skelId
      if (!byRoad.has(rid)) byRoad.set(rid, [])
      byRoad.get(rid).push(st)
    }
    // ⭐ Join only at a DEGREE-2 end. "Shares an endpoint" is NOT "is continuous
    // with": where three or more of a road's chains meet (a Y, or a chain
    // rejoining its own road), the pair is not a pass-through and the hand does
    // not carry across it. Unioning there manufactures a false orientation cycle
    // that then reads as a contradiction and suppresses the whole road's
    // reconcile. Count the chain-ends at each node first; union only the 2-ended
    // ones, where "continuous" is unambiguous.
    const EPS = 0.15                                   // = tileGround's ENDPOINT_SNAP
    const nodeKey = (p) => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`
    let joins = 0, flips = 0, skippedDeg = 0
    for (const group of byRoad.values()) {
      const ends = new Map()                           // node → [{ st, isStart }]
      for (const st of group) {
        const p = st.points
        if (!p?.length) continue
        for (const [pt, isStart] of [[p[0], true], [p[p.length - 1], false]]) {
          const k = nodeKey(pt)
          if (!ends.has(k)) ends.set(k, [])
          ends.get(k).push({ st, isStart })
        }
      }
      for (const [, inc] of ends) {
        if (inc.length !== 2) { if (inc.length > 2) skippedDeg++; continue }
        const [X, Y] = inc
        if (X.st === Y.st) continue                    // a chain closing on itself
        // Labels agree iff the shared node is one chain's END and the other's
        // START; start-to-start or end-to-end means the point orders oppose.
        const reversed = X.isStart === Y.isStart
        joins++; if (reversed) flips++
        union(sideKey(X.st, 'left'), sideKey(Y.st, reversed ? 'right' : 'left'))
        union(sideKey(X.st, 'right'), sideKey(Y.st, reversed ? 'left' : 'right'))
      }
    }
    // ⛔ FAIL LOUDLY on a contradiction: if a chain's own two sides landed in one
    // group, the road's topology carries an odd number of flips and there is no
    // consistent physical side. Reconciling anyway would smear one width across
    // BOTH sides of a street — a plausible-looking wrong map, the worst outcome.
    const contradicted = new Set()
    for (const st of ribbonStreets) {
      if (find(sideKey(st, 'left')) === find(sideKey(st, 'right'))) {
        contradicted.add(find(sideKey(st, 'left')))
        console.warn(`    ⛔ [name-aware] ${st.skelId}: left and right resolved to the SAME physical side — orientation cycle in road ${st.roadId || st.skelId}; its widths are left UNRECONCILED`)
      }
    }
    const maxByGroup = new Map()
    for (const st of ribbonStreets) for (const side of ['left', 'right']) {
      const v = st.measure?.[side]?.pavementHW
      if (v == null) continue
      const g = find(sideKey(st, side))
      if (contradicted.has(g)) continue
      if (!maxByGroup.has(g) || v > maxByGroup.get(g)) maxByGroup.set(g, v)
    }
    let reconciled = 0
    for (const st of ribbonStreets) for (const side of ['left', 'right']) {
      const m = st.measure?.[side]
      if (!m || m.pavementHW == null) continue
      const mx = maxByGroup.get(find(sideKey(st, side)))
      if (mx != null && mx - m.pavementHW > 1e-3) { m.pavementHW = mx; reconciled++ }
    }
    if (reconciled || flips) console.log(`    [name-aware] reconciled ${reconciled} through-road side-width step(s) to the road's max half-width (${joins} chain joins, ${flips} orientation flips)`)
  }

  // [curve-primitive] TESSELLATE bezier'd chains' points to a dense polyline (the ONE
  // place curves become points — HANDOFF-curve-primitive-skeleton.md). Done BEFORE the
  // IX pass so `intersections.ix` indexes the dense array and every legacy point-consumer
  // (extractFaces/tiles/emitChain) keeps working byte-identically; `segments` stays sparse
  // (self-contained) for the editor + concentric curb. Lines pass through endpoints exactly
  // and chains WITHOUT segments are untouched → grid streets byte-identical.
  let tessChains = 0
  for (const st of ribbonStreets) {
    if (!st.segments) continue
    st.points = tessellateStreet(st)
    tessChains++
  }
  if (tessChains) console.log(`    [curve-primitive] tessellated ${tessChains} bezier'd chain(s) → dense points (segments kept sparse)`)

  // Find intersection points: use noded segments (which have shared vertices
  // at crossings) to detect where different streets' polylines meet.
  // For each noded vertex, find the closest point on each street's polyline.
  const IX_SNAP = 1.0 // meters — tolerance for matching noded vertices to polylines

  // Collect all noded intersection vertices (degree >= 3 in the noded graph)
  // ⛔ THE FRAME IS NOT A STREET (Boz, 2026-10-25): an intersection is where ≥ 2 STREET polylines meet. The bb rectangle
  // closes the faces (above) and is noded with them, so a street that runs off the frame meets it at a degree-3 node; it
  // is an edge of the drawing, never a junction, and its segments carry no degree here. (The disc ring used to feed this
  // list the same way, at the rim.) ▶ node checks/claims-the-frame-makes-no-intersection.mjs
  const onFrame = (seg) => [[0, 'x0'], [0, 'x1'], [1, 'z0'], [1, 'z1']].some(([c, k]) =>
    Math.abs((c ? seg[0].z : seg[0].x) - _frame[k]) < 1e-6 && Math.abs((c ? seg[1].z : seg[1].x) - _frame[k]) < 1e-6)
  const nodedVertexDeg = new Map()
  for (const seg of nodedSegments) {
    if (onFrame(seg)) continue
    for (const pt of [seg[0], seg[1]]) {
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`
      nodedVertexDeg.set(key, (nodedVertexDeg.get(key) || 0) + 1)
    }
  }

  // Intersection vertices have degree >= 3 (two streets crossing = 4 segments meeting)
  const nodedIxPts = []
  for (const seg of nodedSegments) {
    if (onFrame(seg)) continue
    for (const pt of [seg[0], seg[1]]) {
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`
      if (nodedVertexDeg.get(key) >= 3) {
        if (!nodedIxPts.find(p => Math.hypot(p.x - pt.x, p.z - pt.z) < 0.1)) {
          nodedIxPts.push(pt)
        }
      }
    }
  }

  // For each noded intersection, find matching points on ribbon polylines.
  // Skeleton polylines are RDP-simplified, so an intersection often falls
  // on the INTERIOR of a segment rather than at a vertex. We project the
  // noded intersection onto the nearest segment of each polyline; if the
  // projection lies within IX_SEG_SNAP of a segment, we splice a new
  // vertex at the projection (unless an endpoint of that segment is
  // already within IX_VERTEX_SNAP, in which case we snap the vertex).
  const IX_SEG_SNAP = 3.0    // meters — how close an OSM-noded intersection must lie to a skeleton segment
  const IX_VERTEX_SNAP = 0.2 // meters — only "snap" (move) an existing vertex if it's already essentially at the intersection
  // When ≥2 noded intersections land within this distance on the SAME chain,
  // they represent effectively one junction location; merging their splice
  // points into a single vertex avoids 0.2–0.8m micro-segments at junctions
  // that collapse into needles/notches once offset inward by band depth.
  // (IX_VERTEX_SNAP dedups a splice against EXISTING vertices; this dedups
  // candidate splice points against EACH OTHER.) Tunable.
  const IX_INTER_SPLICE_SNAP = 1.0 // meters — merge near-coincident NEW splice points on the same chain
  const MICRO_SEG_COLLAPSE = 0.8   // meters — collapse residual micro-segments at intersection vertices post-splice
                                   // (covers the 0.2–0.8m junction-clustering band; kept below ~1m so genuinely
                                   //  distinct closely-noded junctions — e.g. motorway ramp nodes 1–2m apart — survive)

  // Apply splices in descending pointIdx order so earlier indices stay
  // valid. Collect first, sort, then mutate.
  const splicesByStreet = new Map()
  const ixMatches = []
  for (const npt of nodedIxPts) {
    const matches = []
    for (let si = 0; si < ribbonStreets.length; si++) {
      const st = ribbonStreets[si]
      let best = { dist: Infinity, segIdx: -1, t: 0, projX: 0, projZ: 0 }
      for (let pi = 0; pi < st.points.length - 1; pi++) {
        const ax = st.points[pi][0], az = st.points[pi][1]
        const bx = st.points[pi + 1][0], bz = st.points[pi + 1][1]
        const dx = bx - ax, dz = bz - az
        const len2 = dx * dx + dz * dz
        if (len2 < 1e-9) continue
        let t = ((npt.x - ax) * dx + (npt.z - az) * dz) / len2
        t = Math.max(0, Math.min(1, t))
        const px = ax + t * dx, pz = az + t * dz
        const d = Math.hypot(px - npt.x, pz - npt.z)
        if (d < best.dist) best = { dist: d, segIdx: pi, t, projX: px, projZ: pz }
      }
      if (best.dist < IX_SEG_SNAP) matches.push({ streetIdx: si, ...best })
    }
    if (matches.length < 2) continue
    ixMatches.push({ npt, matches })
  }

  // Closed-loop streets (weld: start ≈ end). When the IX-snap moves ONE weld
  // endpoint onto an intersection vertex, its TWIN must move with it or the loop
  // OPENS — the cul-de-sac stem-circle node then scatters across two mm-buckets,
  // drops below degree-3, and no junction is built (HANDOFF-junction-construction.md
  // step (b); the SV cul-de-sac). Captured pre-snap; only loops whose weld actually
  // meets an intersection are touched (SV; Park's stems join mid-ring).
  const LOOP_WELD_TOL = 0.05
  const closedLoopStreet = new Set()
  for (let si = 0; si < ribbonStreets.length; si++) {
    const p = ribbonStreets[si].points
    if (p.length >= 4 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < LOOP_WELD_TOL) closedLoopStreet.add(si)
  }
  for (const { npt, matches } of ixMatches) {
    const pt = [npt.x, npt.z]
    const ixData = { point: pt, streets: [] }
    for (const m of matches) {
      const st = ribbonStreets[m.streetIdx]
      // Decide: snap to an endpoint of the matched segment, or splice a
      // new vertex at the projection.
      const a = st.points[m.segIdx], b = st.points[m.segIdx + 1]
      const dA = Math.hypot(a[0] - npt.x, a[1] - npt.z)
      const dB = Math.hypot(b[0] - npt.x, b[1] - npt.z)
      let targetIdx
      if (dA < IX_VERTEX_SNAP && dA <= dB) {
        st.points[m.segIdx] = pt
        targetIdx = m.segIdx
      } else if (dB < IX_VERTEX_SNAP) {
        st.points[m.segIdx + 1] = pt
        targetIdx = m.segIdx + 1
      } else {
        // Schedule a splice; apply in descending order later.
        // `t` is the projection parameter along segment afterIdx→afterIdx+1.
        const list = splicesByStreet.get(m.streetIdx) || []
        list.push({ afterIdx: m.segIdx, t: m.t, point: pt, ixData })
        splicesByStreet.set(m.streetIdx, list)
        continue
      }
      // Keep a closed loop closed through the snap: drag the twin weld endpoint.
      if (closedLoopStreet.has(m.streetIdx)) {
        const last = st.points.length - 1
        if (targetIdx === 0) st.points[last] = pt
        else if (targetIdx === last) st.points[0] = pt
      }
      st.intersections.push({ ix: targetIdx, with: ixData })
      ixData.streets.push({ name: st.name, ix: targetIdx })
    }
    intersections.push(ixData)
  }

  // Apply splices in descending (afterIdx, t) order so earlier indices
  // stay valid AND multiple splices onto the same segment land in
  // increasing-t order in the final polyline (later-spliced points get
  // pushed before earlier ones, so splice LAST what should end up FIRST).
  for (const [streetIdx, list] of splicesByStreet) {
    const st = ribbonStreets[streetIdx]
    list.sort((a, b) => (b.afterIdx - a.afterIdx) || (b.t - a.t))

    // ── Inter-splice dedup ──────────────────────────────────────────
    // Merge splice points that land within IX_INTER_SPLICE_SNAP of each
    // other (by actual coords) into a SINGLE group. Each group becomes
    // one spliced vertex; ALL its source intersections are recorded at
    // that one index (so no genuine crossing is dropped — only the
    // duplicate VERTEX is). Walk the sorted list (descending afterIdx,t,
    // i.e. by decreasing position along the chain) and start a new group
    // whenever the next splice is farther than the tolerance from the
    // current group's representative point.
    const groups = []
    let cur = null
    for (const sp of list) {
      if (cur && Math.hypot(sp.point[0] - cur.point[0], sp.point[1] - cur.point[1]) <= IX_INTER_SPLICE_SNAP) {
        cur.ixDatas.push(sp.ixData)
      } else {
        // Representative position = the LAST splice in chain order within
        // the group (largest afterIdx/t); since the list is descending,
        // that is the FIRST splice we see, so seed the group from it.
        cur = { afterIdx: sp.afterIdx, point: sp.point, ixDatas: [sp.ixData] }
        groups.push(cur)
      }
    }

    for (const { afterIdx, point, ixDatas } of groups) {
      const newIdx = afterIdx + 1
      st.points.splice(newIdx, 0, point)
      // Shift any previously-recorded intersections on this street whose
      // ix >= newIdx up by 1 (they moved due to the splice).
      for (const prev of st.intersections) {
        if (prev.ix >= newIdx) prev.ix += 1
      }
      for (const ix of intersections) {
        for (const s of ix.streets) {
          if (s.name === st.name && s.ix >= newIdx) s.ix += 1
        }
      }
      // Record every source intersection of this merged group at the one
      // shared vertex index.
      for (const ixData of ixDatas) {
        st.intersections.push({ ix: newIdx, with: ixData })
        ixData.streets.push({ name: st.name, ix: newIdx })
      }
    }
  }

  // ── Collapse residual micro-segments at intersection vertices ──────
  // The inter-splice dedup above only merges NEW splice points against each
  // other. A noded intersection can still land within ~IX_VERTEX_SNAP of an
  // EXISTING skeleton vertex (snapped) while a second intersection splices a
  // new vertex a fraction of a metre away — leaving a <MICRO_SEG_COLLAPSE
  // segment between two vertices that offsets inward into a needle/notch.
  // For each such short segment we either:
  //   • drop the NON-intersection endpoint (merge it into the IX vertex), or
  //   • if BOTH endpoints are intersection vertices (two distinct noded
  //     crossings effectively coincident at this scale), merge them into the
  //     LOWER vertex and re-point the upper vertex's intersection records to
  //     it — so no genuine crossing is dropped, only the duplicate vertex.
  // Segments with NEITHER endpoint at an intersection are left alone (real
  // skeleton/RDP geometry, not a junction artifact). Never drop an endpoint
  // of the chain.
  let microCollapsed = 0
  for (let si = 0; si < ribbonStreets.length; si++) {
    const st = ribbonStreets[si]
    if (!st.points || st.points.length < 3) continue
    const isIx = () => new Set(st.intersections.map(x => x.ix))
    let ix = isIx()
    // Walk high→low so removals don't invalidate lower indices.
    for (let i = st.points.length - 2; i >= 0; i--) {
      const a = st.points[i], b = st.points[i + 1]
      const d = Math.hypot(a[0] - b[0], a[1] - b[1])
      if (d >= MICRO_SEG_COLLAPSE || d < 1e-9) continue
      const aIx = ix.has(i), bIx = ix.has(i + 1)
      if (!aIx && !bIx) continue // real geometry — not a junction artifact
      // Choose which vertex to drop. Prefer dropping a non-IX endpoint;
      // for IX-to-IX, drop the upper (i+1) and keep the lower (i).
      let dropIdx, keepIdx
      if (aIx && !bIx) { dropIdx = i + 1; keepIdx = i }
      else if (bIx && !aIx) { dropIdx = i; keepIdx = i + 1 }
      else { dropIdx = i + 1; keepIdx = i } // both IX
      const lastIdx = st.points.length - 1
      // Never drop a chain endpoint. If the chosen drop is an endpoint
      // (e.g. a terminal junction sliver), flip to drop the inner vertex so
      // the geometric terminus is preserved — but only when the survivor is
      // itself an intersection vertex (so we don't move a non-IX endpoint).
      if (dropIdx === 0 || dropIdx === lastIdx) {
        if ((keepIdx === 0 || keepIdx === lastIdx) || !ix.has(keepIdx)) continue
        const tmp = dropIdx; dropIdx = keepIdx; keepIdx = tmp
      }
      st.points.splice(dropIdx, 1)
      // Re-point records AT dropIdx onto the surviving vertex; shift records
      // ABOVE dropIdx down by one. keepIdx itself shifts down if it was above.
      const survivor = keepIdx > dropIdx ? keepIdx - 1 : keepIdx
      const remap = (rec) => {
        if (rec.ix === dropIdx) rec.ix = survivor
        else if (rec.ix > dropIdx) rec.ix -= 1
      }
      for (const prev of st.intersections) remap(prev)
      for (const isec of intersections) {
        for (const s of isec.streets) {
          if (s.name === st.name) remap(s)
        }
      }
      microCollapsed++
      ix = isIx()
    }
  }
  if (microCollapsed) console.log(`    Collapsed ${microCollapsed} micro-segment(s) at junctions`)

  // ── Emit capEnds from operator-marked centerlines ──────────────
  // Per-chain emission: for each ribbon chain, scan all centerlines of the
  // same name and apply cap flags whose endpoint matches the chain's endpoint
  // (handles reversed direction too). This fixes two bugs:
  //   - caps lost when centerlineByName kept a different segment per name
  //   - caps over-spread to every chain of a multi-chain street
  const centerlinesByName = new Map()
  try {
    const cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(cPath)) {
      const cd = JSON.parse(readFileSync(cPath, 'utf-8'))
      for (const cl of (cd.streets || [])) {
        if (!cl.name) continue
        if (!centerlinesByName.has(cl.name)) centerlinesByName.set(cl.name, [])
        centerlinesByName.get(cl.name).push(cl)
      }
    }
  } catch { /* ignore */ }
  const PTS_EQ_TOL = 2  // meters — endpoints within this are "the same"
  function ptsNear(a, b) {
    const ax = a[0] ?? a.x, az = a[1] ?? a.z
    const bx = b[0] ?? b.x, bz = b[1] ?? b.z
    return Math.hypot(ax - bx, az - bz) <= PTS_EQ_TOL
  }
  for (const st of ribbonStreets) {
    // Overlay-supplied caps win; skip the legacy fallback for these chains.
    if (st.capEnds && (st.capEnds.start || st.capEnds.end)) continue
    let capStart = null, capEnd = null
    const chFirst = st.points[0], chLast = st.points[st.points.length - 1]
    for (const cl of (centerlinesByName.get(st.name) || [])) {
      let cStart = cl.capStart ?? null
      let cEnd = cl.capEnd ?? null
      if (cStart === null && cEnd === null && cl.deadEnd) cEnd = cl.capStyle || 'round'
      if (!cStart && !cEnd) continue
      if (!cl.points || cl.points.length < 2) continue
      const clFirst = cl.points[0], clLast = cl.points[cl.points.length - 1]
      // Match by endpoint. Handle reversed polyline: if chain's start == cl's end,
      // then cl.capEnd belongs to chain's start.
      if (cStart && ptsNear(chFirst, clFirst)) capStart = capStart || cStart
      if (cStart && ptsNear(chLast,  clFirst)) capEnd   = capEnd   || cStart
      if (cEnd   && ptsNear(chFirst, clLast))  capStart = capStart || cEnd
      if (cEnd   && ptsNear(chLast,  clLast))  capEnd   = capEnd   || cEnd
    }
    st.capEnds = { start: capStart, end: capEnd }
  }

  // ── Face fills (land-use classification per polygonized face) ──
  // Each polygonized face gets a single land-use color. Block faces:
  //   1. OSM landuse/leisure/natural/amenity polygons (authoritative) —
  //      whichever LU category covers the most area of this face wins.
  //   2. Parcel majority vote (fallback when no OSM polygon hits the face).
  //   3. 'residential' default (when neither is available).
  // `OSM_TO_LU` — the tag → land-use table — lives at module scope (below `OSM_LU_KIND`),
  // exported, because the tree gate asks the same question per POINT (`forbidden-surface.mjs`).

  /**
   * ⭐⭐ DECLARED-NOT-A-LAND-USE — "we looked and decided no", by name, with the reason.
   *
   * ⛔ THE DISTINCTION IS THE WHOLE POINT and it is `sources.js`'s, reused rather than
   * re-invented: an UNDECLARED tag and a DECLARED-NONE tag are the same silence today.
   * A tag here contributes nothing to the land-use vote ON PURPOSE, and
   * `claims-every-lu-tag-has-a-home.mjs` treats its absence from BOTH tables as a
   * failure. Delete a row and the check goes red naming the tag and the town.
   *
   * ⭐ "IS THIS A LAND-USE FACE?" AND "SHOULD THIS BE ON THE MAP?" ARE TWO QUESTIONS
   * (Jacob, 2026-09-20). A bench is not a land use and painting a whole block face the
   * colour of *bench* is a real error — but a bench absolutely belongs on the map. So
   * `map-layer` is NOT a synonym for `ignore`: it is a destination, and the work is
   * `docs/briefs/BRIEF-lu-map-layers.md`. ⛔ Do not quietly promote one of these to
   * `OSM_TO_LU` to make it visible; that paints the block.
   */
  const OSM_LU_DECLARED = {
    // ── map-layer: a marker, an overlay or a line — never a block face ──
    'amenity:shelter':          'map-layer: a structure you stand under, not land use',
    'amenity:toilets':          'map-layer: a public toilet is local-map value; a marker',
    'amenity:marketplace':      'map-layer: an event or marker on public space, not a land use; like leisure:outdoor_seating (Jacob, 2026-10-27)',
    'amenity:dog_toilet':       'map-layer: a fixture (a pet relief patch), like amenity:toilets',
    'amenity:recycling':        'map-layer: a fixture (a recycling or compost container), like amenity:toilets. ⚠️ Keyed by tag, so a recycling_type=centre LOT reads as a fixture too; none on disk today',
    'amenity:bicycle_parking':  'map-layer: street furniture',
    'amenity:bench':            'map-layer: street furniture',
    'amenity:fountain':         'map-layer: street furniture',
    'leisure:outdoor_seating':  'map-layer: cafe seating, a sub-block patch',
    'leisure:bleachers':        'map-layer: a structure beside a pitch',
    'leisure:fitness_station':  'map-layer: street furniture',
    'leisure:bandstand':        'map-layer: a structure in a park',
    'leisure:batting_cage':     'map-layer: a structure beside a pitch',
    'landuse:flowerbed':        'map-layer: a planting bed is a sub-block overlay, not a block',
    'man_made:compass_rose':    'map-layer: a painted ground marking, a sub-block overlay like landuse:flowerbed',
    'man_made:planter':         'map-layer: street furniture',
    'man_made:courtyard':       'map-layer: a sub-block overlay',
    'man_made:surveillance':    'map-layer: a point fixture',
    'amenity:outdoor_seating':  'map-layer: the amenity-keyed twin of leisure:outdoor_seating',
    'leisure:slipway':          'map-layer (STRUCTURE): a boat ramp — huron\'s waterfront',
    'man_made:cutline':         'map-layer (LINE): a cleared strip through forest',
    'natural:cliff':            'map-layer (LINE): arrives as an OPEN way — barrier-shaped, not a face',
    'natural:ridge':            'map-layer (LINE): arrives as an OPEN way — barrier-shaped, not a face',
    'man_made:embankment':      'map-layer (LINE): arrives as an OPEN way',
    'man_made:pipeline':        'map-layer (LINE): arrives as an OPEN way',
    'man_made:pier':            'map-layer (STRUCTURE): huron\'s waterfront — see BRIEF-boulder-revetment.md',
    'man_made:breakwater':      'map-layer (STRUCTURE): huron\'s waterfront — see BRIEF-boulder-revetment.md',
    'man_made:groyne':          'map-layer (STRUCTURE): huron\'s waterfront — see BRIEF-boulder-revetment.md',
    'man_made:storage_tank':    'map-layer (STRUCTURE): an object on a lot, not the lot',
    'man_made:gasometer':       'map-layer (STRUCTURE): a gas holder, an object on a lot like man_made:storage_tank',
    'man_made:beacon':          'map-layer (STRUCTURE): a navigation beacon, like man_made:tower',
    'man_made:silo':            'map-layer (STRUCTURE): an object on a lot, not the lot',
    'man_made:tower':           'map-layer (STRUCTURE)',
    'man_made:water_tower':     'map-layer (STRUCTURE)',
    'man_made:lighthouse':      'map-layer (STRUCTURE)',
    'man_made:gantry':          'map-layer (STRUCTURE)',
    'man_made:reservoir_covered': 'map-layer (STRUCTURE)',
    'man_made:ventilation_shaft': 'map-layer (STRUCTURE)',
    'man_made:satellite_dish':  'map-layer (STRUCTURE)',
    'man_made:chiller':         'map-layer (STRUCTURE)',
    'man_made:works':           'map-layer (STRUCTURE): the plant, not the industrial land it sits on',
    'man_made:wastewater_plant':'map-layer (STRUCTURE): the plant, not the industrial land it sits on',
    'man_made:water_works':     'map-layer (STRUCTURE): the plant, not the industrial land it sits on',
    // ── none: genuinely not a land use and not a thing to draw ──
    'man_made:bridge':          'none: the SKELETON owns grade separation (layer/bridge/tunnel). A bridge is not a land use.',
    'man_made:tunnel':          'none: the SKELETON owns grade separation, like man_made:bridge. A tunnel is not a land use.',
    'landuse:traffic_island':   'none: ground inside the roadway; the street pour owns it, as it owns the divided-road median (Jacob, 2026-10-27)',
    'boundary:administrative':  'none: an administrative line, not a physical feature',
    'boundary:census':          'none: a statistical line, not a physical feature',
    'place:islet':              'none: land inside water; the water producer carries its holes',
    'natural:water':            'none: water is ①\'s water face (the coast the mint is given; coastFile.mjs#waterFace) and both renderers skip it here on purpose. ⚠️ Whether a small INLAND pond reaches that producer is NOT established — see cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md §6.',
    'natural:reef':             'none: submerged; belongs to the water producer, not to land use',
    'natural:coastline':        'none: a LINE — the shore is coastline.mjs\'s, and the coast is an edge of the drawing, not a face',
    'natural:bay':              'none: water; belongs to the water producer',
    'natural:peninsula':        'none: a named landform spanning many uses, not a land use',
    'man_made:quay':            'map-layer (STRUCTURE): a waterfront edge, like man_made:pier',
    'amenity:shower':           'map-layer: a fixture (a beach shower), like amenity:toilets',
    'amenity:dressing_room':    'map-layer: a fixture (a beach changing room), like amenity:shelter',
  }
  // Collect every OSM polygon with an LU mapping, annotate with centroid + area.
  function ringArea(coords) {
    let a = 0
    for (let i = 0; i < coords.length; i++) {
      const p = coords[i], q = coords[(i + 1) % coords.length]
      a += (p.x ?? p[0]) * (q.z ?? q[1]) - (q.x ?? q[0]) * (p.z ?? p[1])
    }
    return Math.abs(a / 2)
  }
  const osmLUPolys = []
  let compoundCount = 0, compoundArea = 0
  let declaredNotLU = 0
  // The SECOND customer of the ingest vocabulary gate. `OSM_TO_LU` is an
  // allow-list, so a tag it lacks was silently not-a-land-use — the same shape
  // as classify.js's `unknown` hijack, one stage down. One gate, one account per
  // pour, so the operator sees the whole vocabulary gap at once rather than two
  // half-reports. (`osm-vocabulary.mjs` — a sentinel is not a value.)
  const luVocabGap = createVocabularyGate('osm-lu',
    'Add the class(es) above to OSM_TO_LU in derive.js if they name a land use. ' +
    'Until then they contribute NOTHING to the land-use vote, so the faces they ' +
    'cover are decided by parcels or fall to `underived`.')
  for (const [cat, key] of [['landuse','landuse'],['leisure','leisure'],['natural','natural'],['amenity','amenity']]) {
    for (const f of (osmData.ground?.[cat] || [])) {
      const subtype = f.tags?.[key]
      if (!subtype) continue
      // ⛔ GEOMETRY THE KIT CANNOT READ DOES NOT VOTE EITHER. A clipped lake or a
      // holed polygon would otherwise contribute its OUTER ring's whole area to the
      // land-use vote — the biggest polygons in the town casting the loudest vote
      // on the strength of a shape we know is wrong.
      // ⛔ GEOMETRY WE CANNOT READ STILL DOES NOT VOTE — but HOLES ARE READABLE, and calling
      // them unreadable cost this kit a town. `clipped` (closes outside the fetch) and `open`
      // (not a closed way) stay refused: their interiors are genuinely undefined.
      // ⭐⭐ `compound` DOES vote, as OUTER MINUS ITS HOLES. Refusing it was correct only in
      // the sense that voting the outer ring alone would FILL the hole; the repair is to
      // subtract, not to drop. MEASURED on Provincetown: 34 compound features carrying
      // 13,171,887 m², including `natural=sand` ×7 (9.2 km², 56 inner rings) and
      // `natural=beach` ×3 — a dune town's entire beach, refused on shape while the kit had
      // mapped the tag since before it was poured. ⛔ And it drops the BIGGEST features by
      // construction: a large polygon is the one likely to carry an island or a courtyard.
      // Lafayette Square has no relations at all, so this was invisible on town #1.
      const unreadable = unreadableFace(f)
      if (unreadable && unreadable !== 'compound') { luVocabGap.record(`${unreadable}:${cat}=${subtype}`, f.coords, f.tags); continue }
      const tagKey = `${cat}:${subtype}`
      // ⛔ A DECLARED tag is not a gap. "We looked and decided no" and "nobody has
      // looked" are the same silence unless the decision is written down, so the
      // gate reports only the UNDECLARED — and `claims-every-lu-tag-has-a-home.mjs`
      // is what stops this branch from becoming a skip list, by failing on any tag
      // that is in neither table.
      if (OSM_LU_DECLARED[tagKey]) { declaredNotLU++; continue }
      const lu = OSM_TO_LU[tagKey]
      if (!lu) { luVocabGap.record(`${cat}=${subtype}`, f.coords, f.tags); continue }
      if (!f.coords || f.coords.length < 3) continue
      const holes = (f.holes || []).filter(h => Array.isArray(h) && h.length >= 3)
      if (holes.length) compoundCount++, compoundArea += ringArea(f.coords) - holes.reduce((a, h) => a + ringArea(h), 0)
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const p of f.coords) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z }
      osmLUPolys.push({
        lu,
        tag: tagKey,                             // ⭐ the source tag decides cover vs jurisdiction

        ring: f.coords,
        holes,                                   // ⭐ even-odd: the hole is NOT this class
        bb: [minX, maxX, minZ, maxZ],            // cheap reject before any boolean op
        area: ringArea(f.coords) - holes.reduce((a, h) => a + ringArea(h), 0),
      })
    }
  }
  if (compoundCount) console.log(`    ⭐ ${compoundCount} COMPOUND feature(s) vote as outer MINUS holes — ${Math.round(compoundArea).toLocaleString()} m² net. Their holes take no class from them.`)
  console.log(`    OSM LU-annotated polygons: ${osmLUPolys.length}` +
              (declaredNotLU ? `; ${declaredNotLU} feature(s) DECLARED not-a-land-use (${Object.keys(OSM_LU_DECLARED).length} tags declared — see OSM_LU_DECLARED)` : ''))
  const luGapReport = luVocabGap.report(SCENE)
  if (luGapReport) console.warn(luGapReport)

  const faceFills = []
  let osmClassified = 0, parcelClassified = 0, underivedFaces = 0
  const parcelTies = []
  for (let fi = 0; fi < classifiedFaces.length; fi++) {
    const face = classifiedFaces[fi]
    if (face.type === 'fragment') continue

    let use = face.type
    if (face.type === 'block') {
      // ⭐⭐⭐ A FACE TAKES THE LAND USE OF WHAT **COVERS** IT — by area share of the
      // overlap, not by whose CENTROID happens to land inside it (Jacob, 2026-09-25).
      // ⛔⛔ THE CENTROID VOTE WAS BACKWARDS FOR EVERY FEATURE BIGGER THAN A BLOCK, WHICH IS
      // MOST OF THE ONES THAT MATTER. A land-use polygon voted for exactly ONE face — the one
      // containing its centroid — however many it actually covered. MEASURED: Provincetown's
      // median block face is 6,148 m² and its largest `natural=sand` polygon is 4,130,249 m²,
      // **672× the median face**; `leisure=nature_reserve` runs to 29,047×. 391 of 1,406 LU
      // features are larger than the median face. So a town's beach classified one block and
      // left the several hundred it lay across to fall through to parcels or `underived`.
      // (`BRIEF-land-use-derivation` item #2; `_archive/BRIEF-field-shader-2026-10-04 §3` measured the same on
      // huron's farmland, 24 of 52 with their centroid in no face at all.)
      // ⭐ The overlap is computed with the holes SUBTRACTED, so a pond inside a wood does not
      // vote "wood" for the faces under the pond — that is the even-odd half of the ruling.
      const osmAreas = luCoverageForFace(face.ring, osmLUPolys)
      // ⭐ GROUND COVER WINS over a jurisdiction that merely contains it — `luWinnerFromCoverage`.
      const bestLU = luWinnerFromCoverage(osmAreas)
      if (bestLU) { use = bestLU; osmClassified++ }
      else {
        // Fall back to parcel majority vote.
        const bfi = blockFaces.indexOf(face)
        if (bfi >= 0) {
          const faceParcels = faceParcelMap.get(bfi) || []
          if (faceParcels.length > 0) {
            // ⭐ BY AREA, and a tie is SAID — `parcelWinnerByArea`.
            const v = parcelWinnerByArea(face.ring, faceParcels, classifyLandUse)
            if (v.use) { use = v.use; parcelClassified++ }
            else {
              use = UNDERIVED; underivedFaces++
              if (v.tie) parcelTies.push(`${v.tie.join(' = ')} (${Math.round(v.tieArea)} m² each)`)
            }
          } else {
            // ⛔ THE THIRD RUNG USED TO BE `use = 'residential'`. No OSM polygon
            // covers this face and no assessor parcel overlaps it — nothing
            // derived it — and the map said "residential" in the same voice it
            // uses for a face backed by 40 single-family parcels. That is
            // `CLAUDE.md` Layer 0's fallback shape: a failure rendered as a
            // plausible success, invisible to an operator who has not walked
            // the street. Measured before this change: 121 of hipointedemun's
            // 302 faces (17.6% of its area, largest 97,393 m²) and 19 of
            // lafayette-square's 173.
            //
            // `underived` is soft and plantable (lu-policy.mjs), so a data gap
            // reads as land rather than as pavement — but it is its OWN class,
            // so the census can see it, the report can count it, and the
            // operator can paint over it deliberately. A gap should look like a
            // gap. NEVER route this to 'unknown': that class is ratified HARD.
            use = UNDERIVED
            underivedFaces++
          }
        }
      }
    }
    faceFills.push({
      ring: face.ring.map(p => [p.x, p.z]),
      use,
    })
  }
  console.log(`    ${faceFills.length} face fills (${osmClassified} via OSM, ${parcelClassified} via parcels, ${underivedFaces} UNDERIVED)`)
  if (parcelTies.length) console.warn(`    ⛔ ${parcelTies.length} face(s) where the parcels TIE by area — painted underived, NOT broken by list order: ${parcelTies.slice(0, 6).join(' · ')}`)
  // The parcel-code join, and the land-use gap, announced at pour time. An
  // operator pouring town #7 learns the assessor join failed HERE, not by
  // noticing weeks later that half the map is one colour (`lu-policy.mjs`).
  console.log(parcelLandUseReport(SCENE, luStats))
  if (underivedFaces) {
    const pct = (100 * underivedFaces / faceFills.length).toFixed(1)
    console.log(`   ⚠️  ${underivedFaces} face(s) — ${pct}% — have NO land-use evidence: no OSM`)
    console.log(`      landuse/leisure/natural/amenity polygon covers them and no assessor parcel`)
    console.log(`      overlaps them. They paint '${UNDERIVED}' (soft, plantable) so the gap is`)
    console.log(`      visible rather than silently plausible. Close it with better intake, or`)
    console.log(`      paint over it deliberately in the Designer — do not default it.`)
  }

  // Park face polygon override: if an authored park polygon exists, replace
  // the polygonized park face's ring with the 4 authored corners. The
  // polygonization inherits OSM's 41-vertex slow-turn corners; the authored
  // polygon has clean 4-corner topology so V2's round-corners op + the
  // three corner-plug components reconcile cleanly. Targets the largest
  // park-classified face whose centroid sits inside the authored polygon.
  // See cartograph/FEATURES.md "The ribbon doctrine".
  if (parkPolygon) {
    const authoredRing = pathFromClipper(parkPolygon).map(p => [p.x, p.z])
    function ringAreaXZ(ring) {
      let a = 0
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length]
        a += p[0] * q[1] - q[0] * p[1]
      }
      return Math.abs(a / 2)
    }
    function ringCentroid(ring) {
      let sx = 0, sz = 0
      for (const v of ring) { sx += v[0]; sz += v[1] }
      return [sx / ring.length, sz / ring.length]
    }
    const authoredCentroid = ringCentroid(authoredRing)
    const authoredAuthorRing = authoredRing.map(([x, z]) => ({ x, z }))
    let bestIdx = -1, bestArea = 0
    for (let i = 0; i < faceFills.length; i++) {
      const f = faceFills[i]
      if (f.use !== 'park') continue
      const c = ringCentroid(f.ring)
      // Centroid of the polygonized face must lie inside the authored polygon.
      if (!pointInRing(c[0], c[1], authoredAuthorRing)) continue
      const area = ringAreaXZ(f.ring)
      if (area > bestArea) { bestArea = area; bestIdx = i }
    }
    if (bestIdx >= 0) {
      const before = faceFills[bestIdx].ring.length
      faceFills[bestIdx] = { ring: authoredRing, use: 'park' }
      console.log(`    Park face overridden: ${before} polygonized vertices → ${authoredRing.length} authored corners`)
    } else {
      console.warn(`    [park] No polygonized park face matched authored polygon centroid; override skipped.`)
    }
  }

  // Face fills are emitted UNCLIPPED (extending to street centerlines).
  // StreetRibbons.jsx clips them at render time against the live ribbon
  // silhouette so blocks shrink/grow as Measure drags widths.

  // ── Corridors, divided pairs, medians, anchors ─────────────
  // Phase 4 (Path B): skeleton.js now classifies each chain as
  // single/spine or carriageway-A/-B, with corridorName and start/end
  // node coords stamped into `street.phase`. We consume that directly
  // — no perpendicular-distance hunting, no oneway-edge pair detection.
  //
  // One pass builds:
  //   - corridors[]  → per-name ordered list of phases (single | divided)
  //                    plus transition nodes; consumed by ribbons.json.
  //   - dividedPairs → list of {aIdx, bIdx} carriageway pairs; drives
  //                    median ring construction and anchor stamping.
  //
  // The median ring itself is purely geometric: walk A forward, B
  // reversed, close the ring. Pick the larger-area orientation as a
  // self-intersection guard for figure-eight cases.
  function polygonArea(ring) {
    let a = 0
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i]
      const [x2, z2] = ring[(i + 1) % ring.length]
      a += x1 * z2 - x2 * z1
    }
    return a / 2
  }
  function innerSideSign(aPoints, bPoints) {
    // FACE ADJACENCY, not a centroid vote: which side of A is the inner
    // (median-facing) side = which side of A bounds the inter-carriageway
    // face = which side faces the MATE LOCALLY. Per segment of A, drop the
    // midpoint's FOOT on B's polyline and vote toward the foot, weighted by
    // segment length. The old form voted every segment, unweighted, toward
    // B's global CENTROID — on a snaking corridor a segment's perp can point
    // away from the centroid while the mate runs right alongside (s18-6
    // verified flipped; the E3.4 foot-vote bug class). The local foot is the
    // operational half-edge adjacency until a frozen face fact carries it (the port
    // to face adjacency is open: RIBBONS, E3.4's prescription; OSM2STREETS-GROUNDING §2 'innerSign' row).
    // CONVENTION (pin it here, it has bitten twice — see tileGround.js:347):
    // the perp used below, (-dz, dx), is what production's measure calls the
    // RIGHT-perp. So innerSign === +1 means the partner (the median) lies on
    // the measure-RIGHT side → inboard key 'right'; -1 → 'left'. This matches
    // tileGround.isMedianFacing and streetProfiles.innerEdgeMeasure exactly.
    const bPts = bPoints.map(p => [p[0], p[1]])
    const bCum = arcLengths(bPts)
    let acc = 0
    for (let i = 0; i < aPoints.length - 1; i++) {
      const dx = aPoints[i + 1][0] - aPoints[i][0]
      const dz = aPoints[i + 1][1] - aPoints[i][1]
      const L = Math.hypot(dx, dz)
      if (L < 1e-9) continue
      // measure-RIGHT perpendicular of the point-order tangent.
      const px = -dz / L, pz = dx / L
      const mx = (aPoints[i][0] + aPoints[i + 1][0]) / 2
      const mz = (aPoints[i][1] + aPoints[i + 1][1]) / 2
      const foot = pointAtS(bPts, bCum, closestOnPolyline([mx, mz], bPts, bCum).s)
      const dot = (foot[0] - mx) * px + (foot[1] - mz) * pz
      if (Math.abs(dot) < 1e-6) continue                 // foot on-axis — no information
      acc += (dot > 0 ? 1 : -1) * L
    }
    return acc >= 0 ? +1 : -1
  }
  // Build corridors + divided pairs from phase metadata. One pass per
  // corridor name: cluster endpoints into nodes, look up which chains
  // are paired carriageways via phase.role, and walk the node graph to
  // order phases along the corridor.
  const NODE_TOL = 15 // meters — carriageway pair ends often sit apart
  const byCorridorName = new Map()
  for (let i = 0; i < ribbonStreets.length; i++) {
    const s = ribbonStreets[i]
    const cname = s.phase?.corridorName || s.name
    if (!byCorridorName.has(cname)) byCorridorName.set(cname, [])
    byCorridorName.get(cname).push(i)
  }

  const corridors = []
  const dividedPairs = [] // [{ aIdx, bIdx }, ...] — drives medians + anchors

  for (const [name, idxs] of byCorridorName) {
    // Cluster endpoints within NODE_TOL into nodes.
    const nodes = [] // { pt: avg, endpoints: [{ chainIdx, which }] }
    for (const ci of idxs) {
      const pts = ribbonStreets[ci].points
      for (const which of ['start', 'end']) {
        const pt = which === 'start' ? pts[0] : pts[pts.length - 1]
        let found = null
        for (const n of nodes) {
          if (Math.hypot(pt[0] - n.pt[0], pt[1] - n.pt[1]) < NODE_TOL) { found = n; break }
        }
        if (found) {
          found.endpoints.push({ chainIdx: ci, which })
          const k = found.endpoints.length
          found.pt = [
            found.pt[0] + (pt[0] - found.pt[0]) / k,
            found.pt[1] + (pt[1] - found.pt[1]) / k,
          ]
        } else {
          nodes.push({ pt: [pt[0], pt[1]], endpoints: [{ chainIdx: ci, which }] })
        }
      }
    }

    // Chain → [startNodeIdx, endNodeIdx]
    const chainNodes = new Map()
    for (const [ni, node] of nodes.entries()) {
      for (const { chainIdx, which } of node.endpoints) {
        if (!chainNodes.has(chainIdx)) chainNodes.set(chainIdx, [null, null])
        chainNodes.get(chainIdx)[which === 'start' ? 0 : 1] = ni
      }
    }

    // Pair carriageway-A ↔ carriageway-B by phase.pairKey. The skeleton
    // analyzer assigned a stable pairKey at the OSM level; weldChains
    // gates on (signature, pairKey), so welded A and B chains for the
    // same pair carry the same pairKey. No geometry guessing.
    const inPair = new Map()
    const byPairKey = new Map() // pairKey → { a, b }
    for (const ci of idxs) {
      const phase = ribbonStreets[ci].phase
      if (!phase?.pairKey) continue
      if (!byPairKey.has(phase.pairKey)) byPairKey.set(phase.pairKey, {})
      const slot = byPairKey.get(phase.pairKey)
      if (phase.role === 'carriageway-A') slot.a = ci
      else if (phase.role === 'carriageway-B') slot.b = ci
    }
    for (const { a, b } of byPairKey.values()) {
      if (a == null || b == null) continue
      inPair.set(a, b); inPair.set(b, a)
      dividedPairs.push({ aIdx: a, bIdx: b })
    }

    // Walk the node graph to order phases. Start at a leaf (degree 1)
    // if available so single→divided→single transitions emit in order.
    const nodeDegree = nodes.map(n => n.endpoints.length)
    let startNode = nodeDegree.findIndex(d => d === 1)
    if (startNode < 0) startNode = 0

    const phases = []
    const transitions = []
    const visitedChains = new Set()
    let current = startNode
    let prevPhaseKind = null

    while (true) {
      const node = nodes[current]
      let nextChain = null
      for (const { chainIdx } of node.endpoints) {
        if (!visitedChains.has(chainIdx)) { nextChain = chainIdx; break }
      }
      if (nextChain == null) break

      const isDivided = inPair.has(nextChain)
      const phase = isDivided
        ? { kind: 'divided', chainIds: [ribbonStreets[nextChain].skelId, ribbonStreets[inPair.get(nextChain)].skelId] }
        : { kind: 'single', chainIds: [ribbonStreets[nextChain].skelId] }

      if (prevPhaseKind && prevPhaseKind !== phase.kind) {
        transitions.push({ at: node.pt, from: prevPhaseKind, to: phase.kind, pinch: prevPhaseKind === 'single' || phase.kind === 'single' })
      }
      phases.push(phase)
      prevPhaseKind = phase.kind

      visitedChains.add(nextChain)
      if (isDivided) visitedChains.add(inPair.get(nextChain))

      const [sNode, eNode] = chainNodes.get(nextChain)
      current = sNode === current ? eNode : sNode
    }

    // Disconnected components: emit any chains the walk didn't reach.
    for (const ci of idxs) {
      if (visitedChains.has(ci)) continue
      const isDivided = inPair.has(ci)
      if (isDivided && visitedChains.has(inPair.get(ci))) { visitedChains.add(ci); continue }
      const phase = isDivided
        ? { kind: 'divided', chainIds: [ribbonStreets[ci].skelId, ribbonStreets[inPair.get(ci)].skelId] }
        : { kind: 'single', chainIds: [ribbonStreets[ci].skelId] }
      phases.push(phase)
      visitedChains.add(ci)
      if (isDivided) visitedChains.add(inPair.get(ci))
    }

    corridors.push({ name, phases, transitions })
  }
  const pinchCount = corridors.reduce((a, c) => a + c.transitions.filter(t => t.pinch).length, 0)
  console.log(`    ${corridors.length} corridors, ${pinchCount} pinch transitions`)

  // [E2] DIVIDED corridor — nose truth + corridor merge asphalt. The MEDIAN
  // itself is NO LONGER constructed here: it is the walked face between the two
  // carriageways, painted by sectionPass's open-field flooded remainder (the
  // 'median' class; RIBBONS §1 update 2026-06-15, HANDOFF-divided-corridor-
  // construction.md). This block keeps only what the walked face CANNOT supply:
  // merge asphalt (kind:'merge') at the HARD spots — the cross-street
  //      CROSSING windows + the nose-taper regions (node → nose) — so those read
  //      corridor asphalt ("lanes joining"), never a parcel pill. The median
  //      BODY is left empty; the walked-face flood paints its grass.
  // (The old chain-to-chain median stamp ring is DELETED — that was the
  // construction Jacob's "why aren't we using the same walk-polygon process?"
  // retired. If the eye confirms the carriageway strokes already cover the merge
  // spots, the merge emits can go too — design §5.D.)
  const NOSE_GAP = 2.0   // m — median trimmed back to where the chains are ≥ this apart
  const NOSE_STEP = 0.5  // m — gap-profile sampling step for the trim search
  const arcLengths = (pts) => {
    const s = [0]
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return s
  }
  const pointAtS = (pts, cum, s) => {
    const t = Math.max(0, Math.min(cum[cum.length - 1], s))
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= t) {
        const f = cum[i] === cum[i - 1] ? 0 : (t - cum[i - 1]) / (cum[i] - cum[i - 1])
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]
      }
    }
    return [pts[pts.length - 1][0], pts[pts.length - 1][1]]
  }
  // closest point on polyline → { d: distance, s: arclength station of the foot }
  const closestOnPolyline = (p, pts, cum) => {
    let best = { d: Infinity, s: 0 }
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1]
      const dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az
      const L2 = dx * dx + dz * dz
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2)) : 0
      const d = Math.hypot(p[0] - (ax + dx * t), p[1] - (az + dz * t))
      if (d < best.d) best = { d, s: cum[i] + Math.sqrt(L2) * t }
    }
    return best
  }
  const cutPolylineAt = (pts, cum, s0, s1) => {
    const out = [pointAtS(pts, cum, s0)]
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] > s0 + 1e-9 && cum[i] < s1 - 1e-9) out.push([pts[i][0], pts[i][1]])
    }
    out.push(pointAtS(pts, cum, s1))
    const ded = [out[0]]
    for (const p of out.slice(1)) if (Math.hypot(p[0] - ded[ded.length - 1][0], p[1] - ded[ded.length - 1][1]) > 1e-6) ded.push(p)
    return ded
  }
  // Shared-vertex index over all ribbon streets (junction = exact shared
  // coordinate, the same identity extractFaces uses) — drives the crossing
  // detection below.
  const NOSE_SETBACK = 1.5  // m — median nose set back from a crossing street's curb line
  const MIN_SEG = 4.0       // m — a median segment shorter than this folds into the adjacent merge
  const vKey = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
  const vertexStreets = new Map()
  ribbonStreets.forEach((s, i) => {
    for (const p of s.points) {
      const k = vKey(p)
      let set = vertexStreets.get(k)
      if (!set) { set = new Set(); vertexStreets.set(k, set) }
      set.add(i)
    }
  })

  // ── [BRIEF-through-road-edge-straight] THE PREVAILING-DIRECTION OVERLAY ────
  // A divided corridor whose two carriageway tips CONVERGE onto ONE shared node
  // that is an INTERIOR vertex of a through-road (De Mun × Clayton: both De Mun
  // carriageways + Clayton meet at a single OSM node) makes the median lens
  // pinch to gap→0 there. The E2 nose-taper `stamp('merge', …)` below then
  // collapses to a degenerate duplicated-vertex needle sitting ON the
  // through-road's curb line — the eye reads it as the through-edge bulging
  // (SKELETON §5d/§5e). The root is the survey's shared-node convergence: the
  // carriageway BODIES run straight and parallel; only their TIPS kink together
  // to reach the one node.
  //
  // FIX (Jacob, 2026-07-21): virtually continue each carriageway straight along
  // its prevailing (body) direction to the through-road, so the two tips stay ~a
  // median-gap apart → the gap never pinches → the degenerate stamp is never
  // emitted and the median terminates clean at the through-edge. This is a
  // CONSTRUCTION OVERLAY (`st.strokePoints`), NEVER a survey edit: `st.points`
  // (the navy centerline) stays the true surveyed line; only the derived
  // median/asphalt/faces read the correction. (feedback_survey_chains_immutable
  // _corner_is_stroke — the reverted frame-straighten RELOCATED the endpoint +
  // dead-ended the carriageway; this never mutates the chain, and the tip delta
  // is < a road-width so the centerline shows no visible seam.)
  // The straighten touches ONLY the vertices INSIDE the intersection zone — the
  // through-road's own asphalt footprint (its half-width + a small margin), the
  // literal junction box — never the natural approach outside it (Jacob, app eye
  // 2026-07-22: "it really is just the points in the intersection zone"). Reach
  // scales with the actual crossing, not a fixed radius.
  const OVL_MARGIN = 2   // m — a hair beyond the through curb, so the tip clears the asphalt edge
  const OVL_DIR = 12     // m — the prevailing body tangent is read over this much chain outside the zone
  const OVL_KINK_DEG = 30 // ° — a leg whose tip approach bends less than this off its body has no
                          //     terminal kink → it already runs where it points → leave it natural
  let overlayCount = 0
  const rayHitPolyline = (o, d, poly) => {
    let best = null, bestT = Infinity
    for (let i = 0; i < poly.length - 1; i++) {
      const p = poly[i], q = poly[i + 1]
      const ex = q[0] - p[0], ez = q[1] - p[1]
      const den = d[0] * ez - d[1] * ex
      if (Math.abs(den) < 1e-9) continue
      const t = ((p[0] - o[0]) * ez - (p[1] - o[1]) * ex) / den   // ray param (≥0 forward)
      const u = ((p[0] - o[0]) * d[1] - (p[1] - o[1]) * d[0]) / den // segment param [0,1]
      if (t > 0 && u >= -0.01 && u <= 1.01 && t < bestT) { bestT = t; best = [o[0] + d[0] * t, o[1] + d[1] * t] }
    }
    return best
  }
  const isInteriorVertexOf = (node, sIdx) => {
    const P = ribbonStreets[sIdx].points
    for (let i = 1; i < P.length - 1; i++) if (Math.hypot(P[i][0] - node[0], P[i][1] - node[1]) < 0.05) return true
    return false
  }
  // Straighten one carriageway's converging tip: keep the body up to the first
  // vertex clear of the node's kink zone, then a single straight extension of the
  // prevailing tangent to the through-road (+2 m overshoot so the asphalt/median
  // reaches into it; tileGround clips it to the through curb).
  const correctedTipChain = (idx, tipAtStart, thru, node) => {
    const P = ribbonStreets[idx].points.map(p => [p[0], p[1]])
    if (P.length < 3) return null
    const tip = tipAtStart ? 0 : P.length - 1
    const step = tipAtStart ? 1 : -1
    // The intersection zone = the through-road's asphalt footprint (perp distance
    // to its centerline < its half-width + margin) — the literal junction box.
    const thruHW = Math.max(thru.measure?.left?.pavementHW || 0, thru.measure?.right?.pavementHW || 0)
    const zoneR = thruHW + OVL_MARGIN
    const cumT = arcLengths(thru.points)
    const perp = (p) => closestOnPolyline(p, thru.points, cumT).d
    // outV = the first vertex walking inward that is OUTSIDE the intersection
    // footprint. The natural approach beyond it is KEPT; the straight extension
    // replaces only the in-zone (kinked) vertices — span ≈ the zone width.
    let ai = tip
    while (ai + step >= 0 && ai + step < P.length && perp(P[ai]) < zoneR) ai += step
    if (ai === tip || perp(P[ai]) < zoneR) return null   // chain never leaves the zone → give up
    const outV = P[ai]
    // prevailing body tangent, read over ~OVL_DIR of chain from outV further into the body
    let ri = ai, back = 0
    while (ri + step >= 0 && ri + step < P.length && back < OVL_DIR) { back += Math.hypot(P[ri + step][0] - P[ri][0], P[ri + step][1] - P[ri][1]); ri += step }
    let bx = outV[0] - P[ri][0], bz = outV[1] - P[ri][1]
    const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl
    // the leg's ACTUAL trajectory into its tip (first distinct inward vertex → tip)
    let tn = tip + step
    while (tn >= 0 && tn < P.length && Math.hypot(P[tn][0] - P[tip][0], P[tn][1] - P[tip][1]) < 1e-6) tn += step
    if (tn < 0 || tn >= P.length) return null
    let tx = P[tip][0] - P[tn][0], tz = P[tip][1] - P[tn][1]
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl
    // KINK TEST: if the tip approach already agrees with the body direction (no
    // terminal kink toward the shared node), the leg runs where it points — it did
    // NOT need fixing, leave it natural (Jacob: "that leg didn't need fixing").
    if (Math.acos(Math.max(-1, Math.min(1, bx * tx + bz * tz))) * 180 / Math.PI < OVL_KINK_DEG) return null
    // extend the clean body STRAIGHT from outV to the through-road — no interpolated
    // crossing (that put a vertex on the kinked segment → a subtle bend in the edge).
    const hit = rayHitPolyline(outV, [bx, bz], thru.points)
    if (!hit) return null
    const body = tipAtStart ? P.slice(ai) : P.slice(0, ai + 1)   // natural chain, outside the zone
    return { sp: tipAtStart ? [hit, ...body] : [...body, hit], tip: hit }
  }
  for (const { aIdx, bIdx } of dividedPairs) {
    const corr = ribbonStreets[aIdx].phase?.corridorName || ribbonStreets[aIdx].name
    for (const endA of ['start', 'end']) {
      const pa = ribbonStreets[aIdx].points, pb = ribbonStreets[bIdx].points
      const tipA = endA === 'start' ? pa[0] : pa[pa.length - 1]
      // B's same-side tip = whichever of B's endpoints is nearer A's tip
      const bStartD = Math.hypot(pb[0][0] - tipA[0], pb[0][1] - tipA[1])
      const bEndD = Math.hypot(pb[pb.length - 1][0] - tipA[0], pb[pb.length - 1][1] - tipA[1])
      const endB = bStartD <= bEndD ? 'start' : 'end'
      const tipB = endB === 'start' ? pb[0] : pb[pb.length - 1]
      if (Math.hypot(tipA[0] - tipB[0], tipA[1] - tipB[1]) > NODE_TOL) continue   // tips not converged this end
      const node = [(tipA[0] + tipB[0]) / 2, (tipA[1] + tipB[1]) / 2]
      // the node must be an INTERIOR vertex of a through-road outside this corridor
      let thru = null
      for (const si of vertexStreets.get(vKey(tipA)) || vertexStreets.get(vKey(node)) || []) {
        if (si === aIdx || si === bIdx) continue
        const S = ribbonStreets[si]
        if ((S.phase?.corridorName || S.name) === corr) continue
        if (S.gradeSeparated) continue
        if (isInteriorVertexOf(node, si)) { thru = S; break }
      }
      if (!thru) continue   // not the divided-into-through-road class — leave emergent
      for (const [idx, tas] of [[aIdx, endA === 'start'], [bIdx, endB === 'start']]) {
        const r = correctedTipChain(idx, tas, thru, node)
        if (r) { ribbonStreets[idx].strokePoints = r.sp; overlayCount++ }
      }
    }
  }
  if (overlayCount) console.log(`    [through-edge overlay] straightened ${overlayCount} carriageway tip(s) at divided→through-road nodes (strokePoints; centerline untouched)`)

  const medians = []
  let medianSkips = 0, mergeCount = 0, crossingCount = 0
  for (const { aIdx, bIdx } of dividedPairs) {
    const A = ribbonStreets[aIdx]
    const B = ribbonStreets[bIdx]
    // [through-edge overlay] build the median lens off the prevailing-direction
    // CORRECTED chains (strokePoints) where present, so a divided→through-road
    // pinch never stamps a degenerate merge needle. Centerline (.points) stays true.
    const a = (A.strokePoints || A.points).map(p => [p[0], p[1]])
    const b = (B.strokePoints || B.points).map(p => [p[0], p[1]])
    // Orient B co-directional with A so stations correspond end-to-end.
    const dot = (a[a.length - 1][0] - a[0][0]) * (b[b.length - 1][0] - b[0][0]) +
                (a[a.length - 1][1] - a[0][1]) * (b[b.length - 1][1] - b[0][1])
    const eb = dot > 0 ? b : b.slice().reverse()
    const cumA = arcLengths(a)
    const cumB = arcLengths(eb)
    const lenA = cumA[cumA.length - 1]
    const gapAt = (s) => closestOnPolyline(pointAtS(a, cumA, s), eb, cumB).d
    // (1) mutual-overlap window on A
    const vb0 = closestOnPolyline(eb[0], a, cumA).s
    const vb1 = closestOnPolyline(eb[eb.length - 1], a, cumA).s
    const winLo = Math.max(0, Math.min(vb0, vb1))
    const winHi = Math.min(lenA, Math.max(vb0, vb1))
    // (2) nose trim from each pinching end (a transition: the chains taper
    // into the shared spine node; gap → 0)
    const startPinched = gapAt(0) < NOSE_GAP
    const endPinched = gapAt(lenA) < NOSE_GAP
    let s0 = 0
    if (startPinched) {
      while (s0 < lenA && gapAt(s0) < NOSE_GAP) s0 += NOSE_STEP
      const g1 = gapAt(s0), g0 = gapAt(s0 - NOSE_STEP)
      if (g1 > g0) s0 = s0 - NOSE_STEP + NOSE_STEP * (NOSE_GAP - g0) / (g1 - g0)
    }
    let s1 = lenA
    if (endPinched) {
      while (s1 > 0 && gapAt(s1) < NOSE_GAP) s1 -= NOSE_STEP
      const g0 = gapAt(s1), g1 = gapAt(s1 + NOSE_STEP)
      if (g0 > g1) s1 = s1 + NOSE_STEP - NOSE_STEP * (NOSE_GAP - g1) / (g0 - g1)
    }
    s0 = Math.max(s0, winLo)
    s1 = Math.min(s1, winHi)
    if (!(s1 - s0 > 1)) { medianSkips++; continue }   // window collapsed — pair too short
    // (3) CROSSING cuts — a street that junctions BOTH carriageways (shared
    // vertex on each, not the corridor itself, not grade-separated) crosses
    // the median: the median OPENS there. Cut halfwidth = the crossing
    // street's asphalt halfwidth + NOSE_SETBACK. One-sided T's (junction on
    // one carriageway only) do NOT cut — the median runs over them (the
    // Truman addendum fragmentation cure).
    const corridorName = A.phase?.corridorName || A.name
    const crossersA = new Map(), crossersB = new Map()   // street idx → junction point
    const collect = (pts, self, into) => {
      for (const p of pts) {
        for (const j of vertexStreets.get(vKey(p)) || []) {
          if (j === aIdx || j === bIdx) continue
          const S = ribbonStreets[j]
          if (S.gradeSeparated) continue
          if ((S.phase?.corridorName || S.name) === corridorName) continue
          if (!into.has(j)) into.set(j, p)
        }
      }
    }
    collect(a, aIdx, crossersA)
    collect(eb, bIdx, crossersB)
    const cuts = []   // [lo, hi] station intervals on A
    for (const [j, pA] of crossersA) {
      if (!crossersB.has(j)) continue
      const S = ribbonStreets[j]
      const sOnA = closestOnPolyline(pA, a, cumA).s
      const sOfB = closestOnPolyline(crossersB.get(j), a, cumA).s
      const c = (sOnA + sOfB) / 2
      const hw = Math.max(S.measure?.left?.pavementHW || 0, S.measure?.right?.pavementHW || 0)
      const w = hw + NOSE_SETBACK
      cuts.push([c - w, c + w])
      crossingCount++
    }
    // Merge overlapping/near cut intervals; fold sub-MIN_SEG median slivers
    // between cuts into the cuts (a divided×divided crossing's central box
    // must be merge-asphalt, not a 1 m median crumb).
    cuts.sort((p, q) => p[0] - q[0])
    let merged = []
    for (const c of cuts) {
      const last = merged[merged.length - 1]
      if (last && c[0] - last[1] < MIN_SEG) last[1] = Math.max(last[1], c[1])
      else merged.push([c[0], c[1]])
    }
    merged = merged.map(c => [Math.max(c[0], s0), Math.min(c[1], s1)]).filter(c => c[1] - c[0] > 0.1)
    // (4) emit — median segments between cuts (kind:'median') + the merge
    // regions (kind:'merge': the nose-trimmed transition tapers AND the
    // crossing windows — corridor asphalt, lanes joining, constructed
    // positively per DIVIDED-CORRIDOR-PLAN §4.4). Both are polygons between
    // the chains: cut A at the window, follow the feet on B, blunt closes.
    const stamp = (kind, w0, w1, minArea) => {
      if (!(w1 - w0 > 0.25)) return false
      const P0 = pointAtS(a, cumA, w0)
      const P1 = pointAtS(a, cumA, w1)
      const u0 = closestOnPolyline(P0, eb, cumB).s
      const u1 = closestOnPolyline(P1, eb, cumB).s
      if (!(u1 - u0 > 0.25)) return false
      const ta = cutPolylineAt(a, cumA, w0, w1)
      const tb = cutPolylineAt(eb, cumB, u0, u1)
      const ring = [...ta, ...tb.reverse()]
      if (Math.abs(polygonArea(ring)) < minArea) return false
      medians.push({
        kind,
        name: corridorName,
        streets: [A.name, B.name],
        chains: [A.skelId, B.skelId],
        pairKey: A.phase?.pairKey || null,
        ring,
      })
      return true
    }
    // [universal-median 2026-06-15] The median BODY is NOT stamped — it is the
    // walked face between the carriageways (sectionPass open-field flood → grass).
    // Emit ONLY corridor MERGE asphalt at the hard spots: the cross-street CROSSING
    // windows + the nose-taper regions (node → nose). The median body between the
    // crossings is left empty for the walked face to paint. (medianSkips no longer
    // tracks divided medians; it still counts window-collapsed degenerate pairs.)
    for (const [lo, hi] of merged) {
      if (stamp('merge', lo, hi, 1)) mergeCount++
    }
    if (stamp('merge', winLo, s0, 1)) mergeCount++
    if (stamp('merge', s1, winHi, 1)) mergeCount++
  }
  console.log(`    divided medians = walked faces (no rings) — ${mergeCount} corridor merge patches from ${dividedPairs.length} pairs (${crossingCount} crossings${medianSkips ? `, ${medianSkips} pairs degenerate` : ''})`)

  // [E2-loop] CLOSED LOOP-BODY medians — a teardrop / cul-de-sac body (Benton
  // Place, Park Place, Saint Vincent) closes on itself, so its interior is a
  // green island. But the body ring closes within ~3 cm — ABOVE the 0.1 mm
  // node-quantization — so polygonize reads it as a pendant, not a face: the
  // street is walked out-and-back inside the block, slitting it, and the
  // ribbon follows the slit (the disrupted-ribbon root, BENTON forensics).
  // Decide the interior here as a real polygon instead, the [E2] way: snap the
  // body ring closed, inset by the cross-section (pavement + curb + sidewalk)
  // to the inner sidewalk's grass edge, and emit kind:'median'. tileGround's
  // medianClipFor paints it grass and the outer sidewalk stays contiguous —
  // ONE root, the three Benton defects (base overlap/pill · grass interior ·
  // sidewalk contiguity) dissolve together. Per-loop override:
  // overlay.loops[bodySkelId].interior = 'median' (default) | 'block' (the
  // 18th-St subtype: interior is a buildable block — emit nothing here).
  const LOOP_SNAP = 2.0    // m — body endpoints within this read as a closed loop
  const LOOP_MIN_MED = 20  // m² — below this the inset island collapsed (a paved turning circle); skip
  let loopMedians = 0
  for (const S of ribbonStreets) {
    const pts = S.points.map(p => [p[0], p[1]])
    if (pts.length < 4) continue
    const gap = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1])
    if (gap > LOOP_SNAP) continue                     // not a closed body
    const loopId = S.skelId || S.name
    const interior = overlayLoops[loopId]?.interior || 'median'
    if (interior !== 'median') continue               // 'block' → interior is a block, not grass
    pts[pts.length - 1] = [pts[0][0], pts[0][1]]       // SNAP closed (kill the quantization gap)
    const hw = S.measure?.left?.pavementHW || S.measure?.right?.pavementHW
    if (!(hw > 0)) throw new Error(`⛔ derive loop body ${loopId}: its measure carries no carriageway (pavementHW)`)
    // LOOP-STREETS §2 body cross-section: the inner (median-facing) side is curb +
    // treelawn only, NO sidewalk — the treelawn flows into the median (all grass
    // from the curb inward). So inset to the CURB's inner edge (hw + curb), not past
    // a sidewalk: the grass ring then covers the interior face → isMedianTile fires
    // → the inner ped band zeros, no sidewalk ring.
    const inset = hw + STANDARDS.curb.width
    const co = new ClipperOffset(); co.ArcTolerance = ARC_TOL
    const lp = new Paths(); lp.push(pts.map(p => toClipper(p[0], p[1])))
    co.AddPaths(lp, JoinType.jtRound, EndType.etClosedPolygon)
    const out = new Paths(); co.Execute(out, -inset * CLIP_SCALE)
    let best = null, bestA = 0                          // largest surviving ring = the island
    for (let i = 0; i < out.length; i++) { const a = Math.abs(Clipper.Area(out[i])); if (a > bestA) { bestA = a; best = out[i] } }
    if (!best || bestA / (CLIP_SCALE * CLIP_SCALE) < LOOP_MIN_MED) continue  // collapsed → paved turning circle
    medians.push({ kind: 'median', name: S.name, loopId, ring: best.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE]) })
    loopMedians++
  }
  if (loopMedians) console.log(`    ${loopMedians} closed loop-body median island${loopMedians > 1 ? 's' : ''}`)

  // D1 (carriageway measure hygiene): canonicalize a divided carriageway's
  // per-side measure to the anchor='inner-edge' model — the chain sits at the
  // carriageway's median-facing edge, so the OUTER side carries the full
  // carriageway width and the median-facing (inboard) side is effectively 0.
  //
  // Why this must be re-resolved EVERY bake, through innerSign: the measure's
  // left/right keys are point-order-relative, and a longitudinal weld can
  // REVERSE a chain's stored direction (commit 5348fbc reversed
  // lafayette-avenue-6, silently swapping which physical side every persisted
  // key referred to — the false-corner's data root: outer pavementHW became 0,
  // the block ran flush to the chain). innerSign is recomputed from current
  // geometry each bake, so sides resolved through it are reversal-proof.
  //
  //   1. RECLAIM a misfiled width: outer pavementHW <= 0 with inboard > 0 is
  //      an impossible road (a zero-width carriageway) — the width datum is
  //      sitting on the median key because the chain reversed under it.
  //      Swap the two side sections back.
  //   2. NON-authored measures (name-keyed centerlines fallback / class
  //      default) are CORRIDOR facts, not carriageway facts — landing them
  //      verbatim on a carriageway puts corridor half-widths on the median
  //      side and floods the gap with asphalt (the broadcast smear; 42/44 LS
  //      carriageways). Zero the inboard side outright. Authored (overlay)
  //      inboard values are preserved: inboard pavement > 0 is the operator's
  //      documented "eat into the median" control (streetProfiles.js).
  // [survey-based divided median — recovered DIVIDED-CORRIDOR-PLAN + Cambour II, 2026-06-15]
  // The median-facing (inboard) side of a divided carriageway, resolved GEOMETRICALLY
  // (the side whose inward perp points toward the mate). ⛔ `innerSign`'s side-key is
  // UNRELIABLE — it zeroed the OUTBOARD side on real pairs (Lafayette/Geyer/Chouteau,
  // Cambour). One oracle, shared with tileGround.inboardSideOf + the detector's toMate.
  const inboardKeyGeom = (s, mate) => {
    const pa = s?.points, pb = mate?.points
    if (!pa || pa.length < 2 || !pb || pb.length < 2) return s?.innerSign === +1 ? 'right' : 'left'
    const i = Math.max(1, Math.floor(pa.length / 2))
    const ca = pa[i], cb = pb[Math.floor(pb.length / 2)]
    const dx = pa[i][0] - pa[i - 1][0], dz = pa[i][1] - pa[i - 1][1], L = Math.hypot(dx, dz) || 1
    const toMate = [cb[0] - ca[0], cb[1] - ca[1]]
    return ((-dz / L) * toMate[0] + (dx / L) * toMate[1] > 0) ? 'left' : 'right'
  }
  // Build the carriageway measure SYMMETRIC + centered on the chain: each side carries
  // half the surveyed carriageway width (surveyHW/2). The MEDIAN = chainGap − surveyHW
  // then falls out as the gap between the two inner asphalt edges (the subtractive
  // median) — the recovered "centerlines re-registered to the inside, median = the
  // virtual tile between them" model, frozen by the Wall (RIBBONS §1 doctrine).
  // ⛔ surveyHW (correctedSurvey — the reliable, eye-validated datum: Lafayette 9.35 →
  // no median, S-Jefferson 9.16 → a real strip) OVERRIDES the stale authored broadcast
  // widths (10.56/7.90 = the whole-road width smeared onto a carriageway, impossible
  // vs the 25.4 m ROW). The median-facing side carries no ped. The asphalt-edge handle
  // remains the per-road override going forward (operator's eye where the survey is wrong).
  function innerEdgeAssign(m, inbKey, surveyHW) {
    if (!m || !m.left || !m.right) return m
    const outKey = inbKey === 'left' ? 'right' : 'left'
    const inb = m[inbKey], out = m[outKey]
    const hw = surveyHW > 0 ? surveyHW / 2 : Math.max(out?.pavementHW || 0, inb?.pavementHW || 0)
    return {
      ...m, symmetric: false,
      [outKey]: { ...out, pavementHW: hw },
      [inbKey]: { ...inb, pavementHW: hw, treelawn: 0, sidewalk: 0, terminal: 'none' },
    }
  }

  // Anchor + innerSign for paired carriageways. Runtime uses these to
  // render the visible centerline at the inner edge and emit ribbons
  // outward. Operator can override `anchor` per chain in Survey.
  for (const { aIdx, bIdx } of dividedPairs) {
    const A = ribbonStreets[aIdx]
    const B = ribbonStreets[bIdx]
    A.anchor = 'inner-edge'
    A.innerSign = innerSideSign(A.points, B.points)
    A.pairId = B.skelId
    B.anchor = 'inner-edge'
    B.innerSign = innerSideSign(B.points, A.points)
    B.pairId = A.skelId
    // Survey-based symmetric carriageway → median = chainGap − surveyHW (see innerEdgeAssign).
    // Side resolved GEOMETRICALLY (innerSign unreliable); surveyHW from the corridor survey.
    for (const st of [A, B]) {
      const mate = st === A ? B : A
      const inbKey = inboardKeyGeom(st, mate)
      // RAW survey, not correctedSurvey: the lamp correction (correctStreetWidths)
      // mis-fires on a divided road's outer-edge lamps — it halved Lafayette 9.35→4.78
      // (a 6-lane road can't be 9.56 m wide → a 6.7 m phantom median). Cambour validated
      // the median against the raw survey pHW; that is the carriageway-width datum here.
      const surveyHW = survey[st.name]?.pavementHalfWidth || correctedSurvey[st.name]?.pavementHalfWidth || 0
      st.measure = innerEdgeAssign(st.measure, inbKey, surveyHW)
      if (st.segmentMeasures) {
        const sm = {}
        for (const k of Object.keys(st.segmentMeasures)) {
          sm[k] = innerEdgeAssign(st.segmentMeasures[k], inbKey, surveyHW)
        }
        st.segmentMeasures = sm
      }
    }
  }
  const innerEdgeCount = ribbonStreets.filter(s => s.anchor === 'inner-edge').length
  if (innerEdgeCount) console.log(`    ${innerEdgeCount} chains marked anchor=inner-edge (divided carriageways)`)

  // ⭐ H-3 step 1 disclosure, every pour — the highway section and where each value came from.
  {
    const ids = (f) => hwyReport.filter(f).map(r => r.id)
    const main = hwyReport.filter(r => !r.ramp)
    console.log(`\n    Highway section (H-3): ${main.length} carriageway(s) + ${hwyReport.length - main.length} ramp(s), composed from lanes + references/registry.json`)
    const bySrc = new Map(); for (const r of hwyReport) { const k = `${r.ramp ? 'ramp' : 'mainline'}: ${r.sources.join(' + ')}`; bySrc.set(k, (bySrc.get(k) || 0) + 1) }
    for (const [k, n] of bySrc) console.log(`      ${n} × ${k}`)
    const a = ids(r => r.assumed && !r.ramp); if (a.length) console.log(`      ⚠️ ASSUMED lanes (untagged → the Interstate minimum per direction) on ${a.length}: ${a.join(', ')}`)
    const ni = ids(r => !r.ramp && r.interstate === false); if (ni.length) console.log(`      ⚠️ Interstate standard applied to non-Interstate on ${ni.length}: ${ni.join(', ')}`)
    const un = ids(r => !r.ramp && r.interstate == null); if (un.length) console.log(`      ⚠️ Interstate status unknown (no ref) on ${un.length}: ${un.join(', ')}`)
    const uv = new Map(); for (const r of hwyReport) for (const u of r.unknowns) { if (!uv.has(u)) uv.set(u, []); uv.get(u).push(r.id) }
    for (const [u, xs] of uv) console.log(`      ⚠️ ${u} on ${xs.length}: ${xs.join(', ')}`)
    if (hwyRefused.length) console.log(`      ⚠️ ${hwyRefused.length} overlay measure(s) on a highway REFUSED (r-highway-no-authoring), kept in the file: ${hwyRefused.join(', ')}`)
    const flat = ribbonStreets.filter(s => s.anchor === 'inner-edge' && isSweptClass(s.class)).map(s => s.skelId)
    if (flat.length) console.log(`      ⚠️ ${flat.length} divided highway carriageway(s): section flattened + anchored inner-edge by the divided pass — Jacob: B now, (A) the highway guard lands WITH the LS pour: ${flat.join(', ')}`)
  }

  // [Brief C — divided "d" curb] OUTER-curb continuity at the divided→undivided
  // transition. The undivided spine is WIDE (asymmetric L/R pavementHW — Lafayette
  // is genuinely asymmetric even in single blocks); the carriageways are NARROW
  // (their own surveyHW pavementHW, just assigned by innerEdgeAssign above — so this
  // block MUST run AFTER that, or it reads a stale pre-survey width), and they
  // emanate from the spine centerline at the nose. So each carriageway's OUTER curb
  // steps inward ~(spineOuter − cwHW) at the node, and the per-edge parallel offset
  // (tileGround offsetRingVariable) renders that step as the "d" spike/bow (the
  // residual after D6a; HANDOFF-freeze-the-curb… §LANDING). DOCTRINE (Jacob): the
  // OUTER edge of the road must run STRAIGHT THROUGH the transition — only the
  // MEDIAN (inner) opens. Enforce it in the frame (derivation, not construction):
  // ramp the carriageway's outer half-width from spineOuter at the node toward its
  // base over the nose, so the outer edge = centerline + outer_hw = the spine's
  // outer line, CONSTANT (proven: oe·spN = spineLine·spN exactly). Emitted as a
  // side-agnostic per-vertex profile {vKey → outer half-width}; the consumer applies
  // it on the OUTER block tile only (gated `!isMedianTile` — a carriageway's only
  // non-median neighbour). The offset is already variable-depth per edge (depthAt),
  // so no consumer-shape change — only how depthByEdge is filled. Bounded to the nose
  // (along ≤ 2.5·spineOuter, its own half) so the curving body away from the
  // transition is byte-identical. perp matches the codebase offset convention
  // ([dy,-dx]: Lafayette spine measure.left=10.56 renders SOUTH). (probe +
  // validation: scratch/dcurb-profile-test.mjs — every emitted vertex 0 m off-line.)
  {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
    const dotv = (a, b) => a[0] * b[0] + a[1] * b[1]
    const lenv = v => Math.hypot(v[0], v[1])
    const unitv = v => { const l = lenv(v) || 1; return [v[0] / l, v[1] / l] }
    const perpv = v => [v[1], -v[0]]
    const pvKey = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
    const bySkel = new Map()
    for (const s of ribbonStreets) bySkel.set(s.skelId || s.name, s)
    let rampedCarriageways = 0, rampedVerts = 0
    const unresolved = []                              // ⛔ NO FALLBACKS: an end we cannot
    const noLink = []                                  // continue is NAMED, never silently skipped
    for (const cw of ribbonStreets) {
      if (!/^carriageway/.test(cw.phase?.role || '')) continue
      const pts = cw.points
      if (!pts || pts.length < 2) continue
      const cwHW = cw.measure?.left?.pavementHW || cw.measure?.right?.pavementHW || 0
      if (!(cwHW > 0)) continue
      let totLen = 0; for (let i = 1; i < pts.length; i++) totLen += lenv(sub(pts[i], pts[i - 1]))
      const half = totLen / 2
      const prof = {}
      const ends = [
        { spineId: cw.phase?.spineAtStart, nodeIdx: 0, adjIdx: 1 },
        { spineId: cw.phase?.spineAtEnd, nodeIdx: pts.length - 1, adjIdx: pts.length - 2 },
      ]
      for (const e of ends) {
        if (!e.spineId) { noLink.push(`${cw.skelId} @${e.nodeIdx === 0 ? 'start' : 'end'}`); continue }
        const sp = bySkel.get(e.spineId)
        if (!sp || !sp.points || sp.points.length < 2) { unresolved.push(`${cw.skelId} @${e.spineId}: spine chain missing/degenerate`); continue }
        const node = pts[e.nodeIdx], adj = pts[e.adjIdx]
        const s0 = sp.points[0], sN = sp.points[sp.points.length - 1]
        const atStart = lenv(sub(s0, node)) < lenv(sub(sN, node))
        // spine FORWARD (start→end) at the node — matches measure.left/right keys
        const spFwd = unitv(atStart ? sub(sp.points[1], s0) : sub(sN, sp.points[sp.points.length - 2]))
        const spN = perpv(spFwd)
        const spL = sp.measure?.left?.pavementHW || 0, spR = sp.measure?.right?.pavementHW || 0
        const cwDir = unitv(sub(adj, node))            // into the carriageway body
        const sideSign = Math.sign(dotv(sub(adj, node), spN)) || 1   // which spine side it departs to
        const spineOuter = sideSign > 0 ? spL : spR
        if (!(spineOuter > 0)) { unresolved.push(`${cw.skelId} @${e.spineId}: spine carries no outer pavementHW`); continue }
        // ⭐ SIGN-SYMMETRIC (2026-08-11). The old gate here was
        //     if (!(spineOuter > cwHW + 0.05)) continue
        // which encodes an ASSUMPTION, not a measurement: that the spine is always
        // the WIDER of the two. Where that reverses the pass produced ZERO
        // correction, leaving the carriageway's outer edge off the spine's outer
        // line AT THE NODE (lateral = 0) — the one place no amount of profile
        // coverage can reach, because the ramp is anchored there. Measured on LS:
        // 34 ends spine-wider, 2 spine-NARROWER (russell-boulevard-1/-3, +0.52 m at
        // the node) — and those 2 carry the LARGEST world-space curb step on the
        // map. The discontinuity is |cwHW − spineOuter| in EITHER direction, so the
        // ramp runs in either direction. (`checks/claims-divided-seam-step.mjs`.)
        const dHW = cwHW - spineOuter                  // > 0 ⇒ carriageway wider than the spine
        if (Math.abs(dHW) < 1e-6) continue             // already continuous → nothing to ramp
        const noseLat = Math.abs(dHW)                  // the splay at which the median has fully
        const rampSign = Math.sign(dHW)                // opened — read off the datums, never tuned
        const outerN = [spN[0] * sideSign, spN[1] * sideSign]        // outward (away from median)
        // Walk OUTWARD from the node, ramping outer_hw from spineOuter TOWARD the base
        // so the outer edge stays on the spine outer line, and STOP at the natural end
        // of the nose: when the carriageway reaches full splay (lateral ≥ |cwHW −
        // spineOuter|, whichever of the two is wider) OR the centerline curves back toward the spine
        // axis (lateral decreases — a far body vertex that wanders near the straight
        // node-axis must NOT be re-ramped) OR past the carriageway's own half. This
        // covers a gently-splaying long carriageway fully (outer edge straight the whole
        // nose) without a fixed cap, while the curve-back guard keeps the body untouched.
        const order = e.nodeIdx === 0 ? [...pts.keys()] : [...pts.keys()].reverse()
        let prevLat = -Infinity
        for (const i of order) {
          const along = dotv(sub(pts[i], node), cwDir)
          if (along < -0.5) continue
          if (along > half) break
          const lateral = dotv(sub(pts[i], node), outerN)
          if (lateral < prevLat - 0.5) break          // curve-back → end of nose
          prevLat = Math.max(prevLat, lateral)
          const lat = Math.max(0, lateral)
          // ⛔ Stop BEFORE stamping the far end of the nose. The consumer's null
          // endpoint falls back to the edge's own `base`, which carries the
          // OPERATOR'S AUTHORED width; `cwHW` is the frame default and does not
          // (Layer 0 q3). Tapering to `base` is right; stamping cwHW over it is not.
          if (lat >= noseLat) break                   // full splay reached → the rest IS base
          // oh(0) = spineOuter — the outer edge starts ON the spine's outer line —
          // ramping to base at full splay. Sign-symmetric: identical to the old
          // expression when the spine is wider, and the mirror of it when it is not.
          const oh = spineOuter + rampSign * lat
          const k = pvKey(pts[i]); if (!(prof[k] >= oh)) prof[k] = oh
        }
      }
      const keys = Object.keys(prof)
      if (keys.length) { cw.outerHWProfile = prof; rampedCarriageways++; rampedVerts += keys.length }
    }
    if (rampedCarriageways) console.log(`    [Brief C] outer-curb continuity: ramped ${rampedVerts} nose verts on ${rampedCarriageways} carriageways (outer edge runs straight through the transition)`)
    // ⛔ LOUD, BY NAME. A carriageway end with no spine to continue FROM has no
    // inheritance source — it is not "passing", it is UNMEASURED. Printing the
    // count only would let an unresolved end read as a handled one.
    if (noLink.length) console.log(`    [Brief C] ⛔ ${noLink.length} carriageway end(s) carry NO phase.spineAt* link — no outer edge to continue, NOT corrected: ${noLink.join(', ')}`)
    if (unresolved.length) console.log(`    [Brief C] ⛔ ${unresolved.length} linked end(s) UNRESOLVABLE: ${unresolved.join(' · ')}`)
  }

  // Serialize (remove circular refs)
  // ⭐ ONE read of the skeleton, shared by the emit below — the same file ① and the face walk take.
  // ⛔ Loaded here rather than passed in, so there is exactly one place that answers
  // "what is the simplified geometry of this chain" for the whole pour.
  // ⭐⭐⭐ THE SIMPLIFIED SKELETON, WITH ITS CURVES TESSELLATED. `points` on a skeleton street is
  // the CONTROL POLYGON; the smoothness lives in `segments`. Reading the anchors alone is what made
  // ① faceted everywhere — see `tessellateAdaptive`'s header for the measurement.
  // ⛔ ONE MAP, BOTH CONSUMERS — the drawn centreline (the emit below) and ① (the `[①]` block).
  // When a source moves, every consumer of it moves in the same window; a half-migrated SSoT is
  // worse than none, because both halves render.
  const simplifiedPoints = (() => {
    const fp = join(CLEAN_DIR, 'skeleton.json')
    if (!existsSync(fp)) return null
    const j = JSON.parse(readFileSync(fp, 'utf-8'))
    let curved = 0, anchors = 0, out = 0
    const m = new Map((j.streets || []).map(st => {
      const pts = (st.points || []).map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z]))
      anchors += pts.length
      const t = tessellateAdaptive(pts, st.segments)
      if (t.length > pts.length) curved++
      out += t.length
      return [st.id, t]
    }))
    console.log(`    [curve-primitive] simplified skeleton tessellated to ${CURVE_TOL} m: ${anchors} anchor(s) → ${out} point(s) across ${m.size} chain(s); ${curved} carried a curve`)
    return m
  })()

  // ⭐ The evidence the painter reads (see `layerLandEvidence`): the vote's own OSM polygons, and every
  // parcel whose code this town's reader can read, in its class.
  // ⛔ CROPLAND IS DECLARED OR IT IS LOUD (cartograph/cdl.mjs): without it crop grows on mapped fields only.
  if (!cropland) console.warn('    ⛔ cropland NOT LOADED (deriveLayers called without it) — crop rows on mapped OSM fields only')
  else if (cropland.state === 'undeclared') console.warn(`    ⛔ cropland UNDECLARED for ${SCENE} — nobody has looked; crop rows grow on mapped OSM fields only. Declare "cropland" in sources.json (cartograph/cdl.mjs).`)
  else if (cropland.state === 'none') console.log(`    cropland: declared none — ${cropland.reason}`)
  const landEvidence = layerLandEvidence(osmLUPolys,
    parcels.map(p => ({ lu: classifyLandUse(p), rings: p.rings })).filter(p => p.lu && p.lu !== UNDERIVED),
    cropland?.crop?.rings || null)
  if (cropland?.crop) console.log(`    cropland: ${cropland.crop.attribution} ${cropland.crop.year} — ${cropland.crop.rings.length} crop ring(s), unioned on the pixel grid; ${(landEvidence.cdlM2 / 1e4).toFixed(1)} ha of crop, across the fetch extent, on ground no other evidence reaches`)
  {
    const by = {}; for (const e of landEvidence.evidence) { const k = `${e.src}:${e.lu}`; by[k] = (by[k] || 0) + Math.abs(e.rings.reduce((t, r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return t + a / 2 }, 0)) }
    console.log(`    land evidence: ${landEvidence.evidence.length} region(s) — ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1e4).toFixed(1)} ha`).join(' · ')}`)
    { const P = landEvidence.pinchDropped
      console.log(`    land evidence, pinches split: ${P.n} loop(s) below the lattice dropped, ${P.m2.toFixed(6)} m² (${P.outer} off an outer, evidence removed · ${P.hole} off a hole, evidence filled · ${P.orphan} orphan hole(s)) · ${P.revisits} revisit(s) cut into lobes${P.n ? ` · first at ${P.at.map(a => `(${a.map(v => v.toFixed(3))})`).join(' ')}` : ''}`) }
    if (landEvidence.parcelConflictM2 > 0) console.warn(`    ⛔ ${(landEvidence.parcelConflictM2 / 1e4).toFixed(2)} ha where parcels of DIFFERENT classes overlap — evidence of nothing, painted underived.`)
  }
  const ribbonsLayer = {
    streets: ribbonStreets.map(st => ({
      skelId: st.skelId,
      // canonical through-road id (continuesAs union) — the curb cornerAt + Section
      // ADA bid read this so a name-transition seam is a through-node, not a corner.
      ...(st.roadId != null ? { roadId: st.roadId } : {}),
      // [BRIEF-terminal-node-sweep] the frozen IDENTITY (throughId) + per-endpoint
      // terminal/through fact, surviving the whitelist so the SHAPE cornerAt +
      // FILL corner/ADA bid read it post-Wall. throughId spans a spine↔carriageway
      // divided transition that roadId deliberately does not (widths stay unsmeared).
      ...(st.throughId != null ? { throughId: st.throughId } : {}),
      ...(st.through ? { through: st.through } : {}),
      name: st.name,
      // ⭐⭐⭐ THE DRAWN CENTRELINE IS THE SIMPLIFIED SKELETON — ruled 2026-09-06 (Jacob):
      // "all data should skew to SSoT" · "the skeleton should simplify and make ironclad and
      // foolproof." ⛔ THIS EMIT WAS THE LAST DIVERGENCE. ① is minted from the skeleton and the face
      // walk was moved onto it, but `points` still carried the post-`CURVE_FIT` DENSIFIED trace — so
      // the curb was a perfect parallel offset of a line the operator could not see, beside the line
      // he could. Measured: median 1.00 m apart, p90 7.50 m, max 20.8 m, 4,781 of 9,547 points more
      // than a metre off. Jacob, on the render: "these centerlines aren't related to the curbs."
      // ⛔ NO FALLBACK: a chain with no simplified geometry makes the pour REFUSE. Emitting the
      // densified points for some chains and the skeleton for others is the half-migrated state that
      // caused this, and it is invisible — both render.
      // ⚠️ IT RE-POINTS AUTHORING AND THAT IS A DECISION, NOT AN ACCIDENT: `segOrd` is an ordinal
      // over the IX partition, and 35 of 217 chains change their count (mississippi-avenue 15→10),
      // silently moving 17 of LS's 83 authored slots to different spans. ⭐ Ruled acceptable by Jacob
      // ("I don't care about losing authoring") — LS's hand-authoring is a fixture on the mould town,
      // not the product. ⛔ Nothing is destroyed on disk: `design.json` is untouched, so reverting
      // this emit restores the old meaning. ▶ `node checks/claims-simplify-preserves-authoring.mjs`
      points: (() => {
        const p = simplifiedPoints?.get(st.skelId ?? st.name)
        if (!(p?.length >= 2)) throw new Error(`[derive] ⛔ no simplified skeleton geometry for chain "${st.skelId ?? st.name}" — refusing to emit the densified trace for it. The drawn centreline and the protopolygon must be ONE line; a per-chain mix is invisible because both render.`)
        return p
      })(),
      // ⛔ `strokePoints` IS NO LONGER EMITTED. It is the densified chain with carriageway tips
      // straightened — a SECOND geometry in the artifact, which is the thing this ruling removes.
      // Measured before removing: written on ONE chain, read once inside `derive.js` itself, and
      // read by NOTHING in `src/`. It stays internal to the pour; it does not cross the wall.
      // [curve-primitive] sparse, self-contained curve segments (HANDOFF-curve-primitive-
      // skeleton.md) — the editor's "few nodes" + the concentric curb read these; `points`
      // above is their dense tessellation (so ix/legacy consumers stay byte-identical).
      ...(st.segments ? { segments: st.segments } : {}),
      measure: withParkingSeed(st),
      // ⭐ THE ROAD'S PAINT, SELECTED AT THE POUR (streetMarkings.js#selectMarkings; BRIEF-the-ink-is-owned-by-its-labels §3a/§3b):
      // the centre kind and the edge lines, each with the rung that chose it. The ground draws them past the Wall.
      ...(st.markings ? { markings: st.markings } : {}),
      marks: selectMarkings(st, { norm: townMarkingNorm(), authored: st._marksAuthored }),
      capEnds: st.capEnds,
      anchor: st.anchor || 'center',
      innerSign: st.innerSign || 0,
      pairId: st.pairId || null,
      // [D6] oneway was dropped here until now → Survey's One-way checkbox
      // always rendered unchecked on divided carriageways. Carry it through
      // (plus phase.role/pairKey, so the cross-section-origination half of the
      // divided-road authoring goal can read the carriageway identity without
      // re-deriving it). See HANDOFF-divided-carriageway-weld.md.
      oneway: !!st.oneway,
      // phase.chainGap: the paired-carriageway CHAIN gap (formerly mislabeled
      // `medianWidth` — it measures chain-to-chain, not the median; D1). The
      // `?? medianWidth` read is back-compat for a pre-rename skeleton.json.
      ...(st.phase ? { phase: { role: st.phase.role || null, kind: st.phase.kind || null, pairKey: st.phase.pairKey || null, ...((st.phase.chainGap ?? st.phase.medianWidth) != null ? { chainGap: st.phase.chainGap ?? st.phase.medianWidth } : {}), ...(st.phase.spineAtStart ? { spineAtStart: st.phase.spineAtStart } : {}), ...(st.phase.spineAtEnd ? { spineAtEnd: st.phase.spineAtEnd } : {}) } } : {}),
      highway: st.highway,
      class: st.class,
      // Operator-intent fields the V2 emitter consumes. Designer reads
      // these from the live store via `_loadCenterlines`; if we strip
      // them here, the bake's V2 call sees a narrower per-side ped
      // zone than Designer and faces extend past the curb. Keep shape
      // parity with `_loadCenterlines` output.
      ...(st.couplers ? { couplers: st.couplers } : {}),
      ...(st.segmentMeasures ? { segmentMeasures: st.segmentMeasures } : {}),
      // [Brief C] per-vertex OUTER half-width ramp at a divided→undivided nose
      // (vKey → outer pavementHW) — makes the outer curb run STRAIGHT THROUGH the
      // transition. Consumed per-edge in tileGround's depthByEdge (outboard side
      // only, via inboardSideOf). See the "outer-curb continuity" block above.
      ...(st.outerHWProfile ? { outerHWProfile: st.outerHWProfile } : {}),
      ...(st.disabled ? { disabled: true } : {}),
      // [P1 frame-enrichment] Enriched frame fields surviving the serializer
      // whitelist. PRESENT-but-not-yet-consumed: the consumer wiring is
      // deferred to the Wall / Layer-2 (caps→chainPavementRing cap-as-fact,
      // seed→computeStreetMeasure standards cross-section, lanes/surface/
      // maxspeed cross-section priors, continuesAs→per-street name-transition).
      // Without this the fields were stripped here and P1 was invisible.
      ...(Number.isFinite(st.lanes) ? { lanes: st.lanes } : {}),
      ...(st.surface ? { surface: st.surface } : {}),
      ...(st.maxspeed ? { maxspeed: st.maxspeed } : {}),
      ...(st.seed ? { seed: st.seed } : {}),
      ...(st.caps ? { caps: st.caps } : {}),
      ...(st.continuesAs ? { continuesAs: st.continuesAs } : {}),
      // A skeleton-made name (`<highway> <n>`) — an id, never a label.
      ...(st.synthetic ? { synthetic: true } : {}),
      // [Part 2 grade separation] The operative exclude-from-faces flag + raw
      // facts, surviving the serializer whitelist so they reach ribbons.streets.
      // CONSUMER: tileGround.extractFaces filters `streets.filter(s => !s.gradeSeparated)`
      // before the planar walk — clears the interchange-triangle/sliver/false-block
      // degenerates (grade-separated centerlines crossing without a shared vertex).
      gradeSeparated: !!st.gradeSeparated,
      ...(st.layer ? { layer: st.layer } : {}),
      ...(st.bridge ? { bridge: true } : {}),
      ...(st.tunnel ? { tunnel: true } : {}),
      intersections: st.intersections.map(ix => ({
        ix: ix.ix,
        withStreets: ix.with.streets.filter(s => s.name !== st.name).map(s => s.name),
      })),
    })),
    // Alleys + paths as roadway ribbons (centerline + paved width).
    // StreetRibbons renders them with the same silhouette/edge-stroke
    // pipeline as streets; widths are pavement-only (no curb/treelawn/
    // sidewalk bands).
    alleys: alleyCenterlines,
    paths: pathCenterlines,
    intersections: intersections.map(ix => ({
      point: ix.point,
      streets: ix.streets.map(s => ({ name: s.name, ix: s.ix })),
    })),
    faces: faceFills,
    // ⭐ THE LAND EVIDENCE — disjoint regions, each with its class: OSM polygons, then readable parcels
    // (`layerLandEvidence`). The painter paints each piece by these, and `underived` where none reaches.
    landEvidence: landEvidence.evidence,
    // [E2] constructed medians (kind:'median') — consumed by identity in
    // tileGround (median-tile detection + the merge-region asphalt fill).
    medians: medians.map(m => ({ kind: m.kind, name: m.name, streets: m.streets, chains: m.chains, pairKey: m.pairKey, ...(m.loopId ? { loopId: m.loopId } : {}), ring: m.ring })),
    corridors,
    // [P1 frame-enrichment] Top-level frame metadata carried straight from the
    // skeleton so the typed-node graph + name-transition stamps survive into
    // ribbons.json. PRESENT-but-not-yet-consumed: the on-frame faces/intersection
    // unify (which reads junctions) is the Wall (Phase 3); here we only stop the
    // strip so the data is available when that consumer lands.
    ...(skeleton.junctions ? { junctions: skeleton.junctions } : {}),
    ...(skeleton.nameTransitions ? { nameTransitions: skeleton.nameTransitions } : {}),
    // the paint's look, frozen for the ground: the kit's house look, each value the town's norm names overriding it
    markingLook: { ...MARKING_LOOK, ...(townMarkingNorm()?.look || {}) },
  }
  console.log(`    [paint] look: ${Object.entries(ribbonsLayer.markingLook).map(([k, v]) => `${k} ${v.toFixed(3)} m${townMarkingNorm()?.look?.[k] != null ? ' (norm)' : ' (house)'}`).join(' · ')}`)
  // ⭐ THE PAINT, PRINTED BY RUNG, EVERY POUR — so a kit default is never read as the town's (streetMarkings.js)
  { const c = {}, e = {}, ex = { 'grade-separated': 0 }
    for (const st of ribbonsLayer.streets) { const M = st.marks
      if (M.excluded) { ex[M.excluded]++; continue }
      const k = `${M.centre.kind} (${M.centre.rung}${M.centre.rung === 'data' ? ': ' + M.centre.why : ''})`; c[k] = (c[k] || 0) + 1
      const ek = M.edges.kind ? `both (${M.edges.rung})` : `none (${M.edges.why})`; e[ek] = (e[ek] || 0) + 1 }
    const list = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(' · ')
    const parked = ribbonsLayer.streets.filter(st => (st.measure?.left?.parking || 0) + (st.measure?.right?.parking || 0) > 0).length
    console.log(`    [paint] centre: ${list(c)} · edges: ${list(e)} · ${ex['grade-separated']} grade-separated (excluded) · ${parked} street(s) with a parking lane`) }

  // ⛔ THE D2 FACE FREEZE (`ribbons.tiles[]`, with its early boundary crop of the face streets, `clipStreet`) is DELETED
  // (BRIEF-the-disc-is-one-source §2a, 2026-10-22): its last reader, the Measure tool's cap handles, reads the frozen
  // shape's own cap records (capEnd + the ① tip, stamped at the mint). Record: cartograph/_archive/ (SURVEY's eviction).

  // [① — THE PROTOPOLYGON FREEZE] The width-free ink of the whole network, minted
  // ONCE here and frozen into the artifact. `RIBBONS §1` (ruled 2026-09-04/05):
  // the grout is a POSITIVE compound path — every chain expanded at ε and united,
  // the blocks its HOLES — and we offset from IT, not from the chains. ② the curb
  // is a SEPARATE object offset FROM ①; ⛔ not one object at two moments.
  //
  // ⭐⭐⭐ WHY THIS ONE CAN LIVE HERE WHEN THE CURB CANNOT. `POLYGON-FIRST §3`
  // rules D6b's literal wording impossible: prebake is blind to `design.json` /
  // `blockCustoms`, so freezing `iA` here would freeze a bare-defaults curb —
  // `CLAUDE.md` Layer 0 q3, baked into an artifact. ⛔ That objection cannot reach
  // ①, because ① HAS NO WIDTH. It is chains and ε and nothing else, so there is
  // no authored value for the freeze to pin. Enforced, not asserted:
  // `node checks/claims-proto-wall.mjs` claim A fails if any authored read
  // appears inside the mint.
  //
  // ⭐ The per-edge stamp carries IDENTITY ONLY — {skelId, side, segOrd,
  // gradeSeparated}. Authored widths and ped depths resolve DOWNSTREAM off that
  // identity, at build time, so the artifact is look-agnostic: one scene's ①
  // serves every Look, exactly as A03's `baseHW` does for the curb facts.
  //
  // ⛔ ONE CONSTRUCTION, TWO CALLERS — `buildTileGround` calls this same function.
  // Two copies is how "live == bake" stops being true with nobody editing either.
  //
  // ⛔ THE INPUT MATCHES THE CONSUMER'S EXACTLY — `points` (not `strokePoints`),
  // and the same two lists `buildTileGround` splits: non-grade-separated chains
  // with ≥2 points, plus the grade-separated ones. ⭐ Grade-separated roads belong
  // IN ① (Jacob, 2026-09-05: "the highways etc. have to be there") — the canon
  // pulls them out of the BLOCK GRID, which says nothing about the DRAWING.
  // ⭐⭐⭐ RULED 2026-09-06 (Jacob) — ① IS MINTED FROM THE **SIMPLIFIED SKELETON**, NOT FROM THE
  // DERIVED CHAINS. "The protopoly is a simplified shape with no rounding." "Blocks are, for the
  // most part, quadrilateral and even when 'extreme' they're predictable."
  // ⛔ THIS LINE USED TO READ `ribbonsLayer.streets`, and the comment here said "whether ① SHOULD
  // take the corrected chains is a real question and it is NOT settled here." It is settled now,
  // and the cost of it having been open is the whole of 2026-09-06:
  //     source              blocks   median verts   p90   max   >20 verts
  //     ribbons (was)         155         10        286   705      65
  //     skeleton (is)         102          6         25    68      13
  // ⭐⭐ 102 against the map's 101 tiles — the skeleton-minted ① REPRODUCES THE BLOCK COUNT, while
  // the derived chains INVENT ~54 extra "blocks" that are artifacts of re-sampling. Those are the
  // "homeless holes" `claims-proto-tiles-vs-faces` has been failing on, and a prior session chased
  // them as a topology defect. ⭐ Every guard built against corner clusters, exploding fillet
  // setbacks and self-intersections was coping with vertices that do not belong in ① at all.
  // ⛔ The chain geometry is the SAME CURVES, merely re-sampled 8.5× finer by `CURVE_FIT`
  // (1,123 skeleton points vs 9,547) — so this loses no shape, only density. SMOOTHNESS IS
  // SKELETON's and it is already in these points; ROUNDING is Survey's and happens after ② is
  // offset (`RIBBONS §1`). ① sits between the two stages and does neither.
  // ⚠️ ① does NOT use `strokePoints` (the corrected chains) and must not.
  {
    // ⛔ NO FALLBACK TO THE DENSE CHAINS. A silently dense ① is exactly the failure this ruling
    // fixes and it is invisible — it renders, it just carries hundreds of phantom vertices. So a
    // missing or unjoinable skeleton REFUSES TO FREEZE ①; the consumer already handles an absent
    // protopolygon by live-minting with a reason string, which is loud (`CLAUDE.md` Layer 0 q2).
    const skPath = join(CLEAN_DIR, 'skeleton.json')
    let simplified = null
    let skOffGrade = null                  // H-3 step 4: chains off grade (bridge/tunnel/layer≠0), for the overpass span
    if (existsSync(skPath)) {
      const sk = JSON.parse(readFileSync(skPath, 'utf-8'))
      skOffGrade = new Set((sk.streets || []).filter(st => st.bridge || st.tunnel || (st.layer | 0) !== 0).map(st => st.id))
      // ⭐ THE SPEED EACH EXPRESSWAY SPAN IS DRAWN FOR, AND ITS EDGE (`speedContext.mjs`, q-atgrade-expressway-edge):
      // posted maxspeed on the chain's own ways, else the state's statutory default for its context, else [U] — and
      // the edge the governing manual gives that speed. Stamped on the ribbons street (`speed`) and printed per span;
      // ⛔ every basis is disclosed (posted / statutory / [U]), and a [U] edge leaves the construction as it was.
      {
        const E = expresswaySpeeds(sk.streets || [], osmData, townState(osmData).code)
        const byId = new Map(ribbonsLayer.streets.map(r => [r.skelId, r]))
        for (const row of E.rows) { const r = byId.get(row.id); if (r) r.speed = { candidates: row.candidates, basis: row.basis, cites: row.cites, unknowns: row.unknowns, edge: row.edge, threshold: row.threshold } }
        if (E.facilities.length) {
          console.log(`    [expressway speed] ${E.facilities.length} at-grade expressway facility/ies · municipal boundaries: ${E.municipal.join(', ') || 'none in the data'}`)
          for (const F of E.facilities) { const t = F.test
            console.log(`      ${F.chains.map(c => c.id).join(' ')} — ORC 4511.01(ZZ) crossroads: ${t.atGrade} at grade · ${t.separated} separated · ${t.contradictory} contradictory ⇒ legal expressway ${t.legalExpressway}`)
            for (const r of t.rows.filter(r => r.contradictory)) console.log(`        ⛔ CONTRADICTORY DATA: ${r.name} — ${r.why.join('; ')}`) }
          for (const row of E.rows) console.log(`      ${row.id}: ${row.candidates.length ? row.candidates.join(' or ') + ' mph' : '[U]'} (${row.basis}) ⇒ edge ${row.edge}${row.unknowns.length ? ' · ' + row.unknowns.join(' · ') : ''}`)
        }
      }
      // ⭐ ①'s inputs (the tessellated curve, `hard`, the coast, the bb, the disc) are built in ONE place,
      // `cartograph/mintInputs.mjs`, which claims-proto-frozen-matches-live calls too: the witness mints what the pour minted.
      simplified = sk.streets || []
    }
    const MI = simplified && mintInputs({ ribbonStreets: ribbonsLayer.streets, skeletonStreets: simplified, osm: osmData, bb: _bb, disc: _disc, discAt: _discAt, cleanDir: CLEAN_DIR, blockCustoms: townBlockCustoms(homeLook, `derive: ${SCENE}`), who: `derive: ${SCENE}` })
    if (!simplified || MI.unjoined.length) {
      console.warn(`    ⛔ [①] NOT FROZEN — ${!simplified ? `no skeleton at ${skPath}` : `${MI.unjoined.length} of ${MI.total} chain(s) have no simplified geometry (${MI.unjoined.slice(0, 4).join(', ')})`}. ⛔ Refusing to mint ① from the DERIVED chains: that silently produces a dense contour with phantom blocks, which renders and cannot be seen to be wrong.`)
    } else {
    const pStreets = MI.streets, pGradeSep = MI.gradeSep
    // ⭐ THE CIRCLE STENCILS ① (Jacob, 2026-09-06). The whole grid is built, then cut square
    // at the perimeter — "there should be no tips; the streets clip at the perimeter edge."
    // ⛔ The boundary is NOT passed as a chain; it is the CLIP. See mintProtopolygon's header.
    // ⭐⭐ THE COAST IS — and that is the difference between a render knob and ground truth.
    // It is COMBINED with the ink and EXCLUDED from the bb in one move, so it CLOSES faces (the
    // water is a discrete object on one side, and on the landward side the land-use
    // polygons and the coast-facing dead-ends on the other). The circle still stamps last.
    // ⭐ The bb in LOCAL coords — the frozen data extent, recovered from the paired lon/lat +
    // x/z the fetch already writes on every vertex, so no second projection can disagree with
    // the first. ⛔ The coast closes against THIS, never against the disc: the disc is a render
    // knob and the bb is declared data.
    // (`_bb` is computed once, at the face walk: the raw bb; the walk itself closes on its gridded view.)
    for (const line of MI.coastReport) console.log(line)
    console.log(MI.joinReport)
    // ⚙ DIAGNOSTIC: the caller's `onAbsorbRefusal` (pipeline.js, on `--absorb-dump=<path>`) receives the absorption's inputs when it refuses
    const MP = mintProtopolygon({ streets: MI.streets, gradeSep: MI.gradeSep, boundary: MI.boundary, coast: MI.coast, coastArcs: MI.coastArcs, bb: MI.bb, onAbsorbRefusal: opts.onAbsorbRefusal || null })
    // ⭐ H-3 step 4 — classify every ① block (verge / jr / block) HERE, at the mint: the skeleton's grade facts
    // and the RAW footprints exist only on this side of the Wall. ⛔ Reads no authoring. Frozen per block.
    let protoBlockClass = null
    if (MP.blocks?.length) {
      const hwySk = new Set(pGradeSep.filter(g => HIGHWAY_CLASSES.has(g.highway)).map(g => g.skelId ?? g.name))
      const msbfPath = footprintWell(SCENE).path   // the town's footprint geometry well (footprint-well.mjs)
      // ⛔ RAW intake footprints, NEVER the member/shown set (ruling g: a building the operator hid still fronts).
      const centroids = existsSync(msbfPath)
        ? (JSON.parse(readFileSync(msbfPath, 'utf-8')).buildings || []).filter(b => b.coords?.length >= 3)
            .map(b => { let x = 0, z = 0; for (const c of b.coords) { x += c.x; z += c.z } return [x / b.coords.length, z / b.coords.length] })
        : null
      const C = classifyHighwayBlocks(MP, { hwy: hwySk, offGrade: skOffGrade, centroids })
      protoBlockClass = C.cls
      const where = (k) => { const r = MP.blocks[k]; let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1] } return `(${Math.round(x / r.length)}, ${Math.round(z / r.length)})` }
      const nBlock = C.cls.filter(c => c === 'block').length
      console.log(`    [H-3 ④] regions: ${C.verges.length} verge · ${C.jr.length} junction residual (building-less, raw footprints: ${centroids ? centroids.length : 'NONE'}) · ${nBlock} block`)
      for (const j of C.jr) console.log(`      JR ${where(j.k)} fronting ${j.streets.join(', ') || '(no town street)'}`)
      if (C.jrRejected.length) console.log(`      ${C.jrRejected.length} ramp-end block(s) kept as BLOCK — they carry buildings: ${C.jrRejected.map(j => `${where(j.k)} ×${j.inside}`).join(', ')}`)
      if (C.jrRefused.length) console.warn(`      ⛔ JR REFUSED for ${C.jrRefused.length} ramp-end block(s): NO building layer (raw/msbf.json) — frontage cannot be tested, so they stay blocks: ${C.jrRefused.map(j => where(j.k)).join(', ')}`)
      if (C.gores.length) console.log(`      gore sliver(s): ${C.gores.length} — ${C.gores.map(g => `${g.chains.join('×')} ${where(g.k)}`).join(' · ')}`)
      // ⭐ PARCELS — RULED TO MEASURE, NOT BUILT (Jacob, 2026-09-23): the same ramp-end candidates judged by the
      // PARCEL test ("no parcel → road land": zero parcel centroids inside — the building test's own form, no
      // constant), printed where it DISAGREES with the building test. Nothing acts on it. The parcel well is the
      // scene's DECLARED one (sources.json), never a file name typed here.
      {
        let wells = null
        try { const S = readSources(SCENE); wells = S.declared ? (S.parcels || []) : null } catch (e) { console.warn(`      ⛔ parcel test not run — ${e.message.split('\n')[0]}`) }
        const cands = [...C.jr.map(j => ({ ...j, bJR: true })), ...C.jrRejected.map(j => ({ ...j, bJR: false }))]
        if (wells == null) console.log(`      parcel-vs-building: not run — ${SCENE} declares no parcel well (no sources.json)`)
        else if (!wells.length) console.log(`      parcel-vs-building: not run — ${SCENE} declares NONE`)
        else if (cands.length) {
          const pc = []
          for (const w of wells) { try { const d = JSON.parse(readFileSync(join(RAW_DIR, w.file), 'utf-8'))
            for (const p of Object.values(d.parcels || {})) { if (p.centroid) pc.push(p.centroid); else for (const { outer: r } of parcelParts(p.rings)) pc.push([r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length]) } }
            catch { console.warn(`      ⛔ declared parcel well ${w.file} could not be read`) } }
          const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
          const dis = []
          for (const c of cands) { const outer = MP.blocks[c.k], holes = MP.blockHoles?.[c.k] || []
            const n = pc.filter(([x, z]) => pip(x, z, outer) && !holes.some(h => pip(x, z, h))).length
            if ((n === 0) !== c.bJR) dis.push(`${where(c.k)} buildings→${c.bJR ? 'JR' : 'block'}, parcels(${n})→${n === 0 ? 'JR' : 'block'}`) }
          console.log(`      parcel-vs-building (measured, not acted on): ${cands.length} ramp-end block(s), ${dis.length} disagree${dis.length ? ': ' + dis.join(' · ') : ''}`)
        }
      }
    }
    // ⭐⭐ THE RAMP-TERMINAL FLARE (`r-ramp-terminal-flares`): where a highway end arrives at full width and its butt
    // corner lies outside the town street, the town street flares to receive it. Frozen per corner here, beside the
    // region class, because the flare needs the same identity facts (the simplified points, the section at the end,
    // the mint's segOrd); ② draws it WITH authoring and check 5 reads it. ⛔ An empty list is frozen too — absent
    // means "poured before flares", never "none".
    const protoFlares = (() => {
      const F = rampTerminalFlares(pStreets, pGradeSep, HIGHWAY_CLASSES, boundaryPolyXZ)
      console.log(`    [H-3 flare] ${F.flares.length} ramp-terminal flare(s) declared (the town street widens to receive a wider highway end, 10:1) · ${F.offRim} highway end(s) beyond the circle, not judged`)
      for (const f of F.flares) console.log(`      ${f.hwy}.${f.end} ${f.corner} corner → ${f.street} ${f.side}/${f.segOrd}: overhang ${f.baseO.toFixed(2)} m on the base width (${f.baseHW.toFixed(2)}), taper ${(f.rate * f.baseO).toFixed(1)} m · ${f.sources.filter(x => x.startsWith('[U]')).join(' · ')}`)
      for (const u of F.unreceived) console.warn(`      ⛔ ${u.hwy}.${u.end} ${u.corner} corner at (${u.node.map(v => v.toFixed(0)).join(', ')}): NO town leg can receive it — no flare is possible, check 5 stays red`)
      return F.flares
    })()
    // ⭐ THE CURB-CUT NORM, resolved scene → state → kit (perpendicular, PROWAG's sizes, cited) and frozen with its rung, so Section paints a
    // junction corner's curb cuts live off the shape without reaching for a state record (`cartograph/curb-cut-norm.mjs`).
    {
      const src = readSources(SCENE)
      ribbonsLayer.streetDecks = MI.decks.map(d => ({ ring: d.ring.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]), streets: d.streets }))   // frozen beside ①, for the terrain
      ribbonsLayer.deckSlivers = MI.deckSlivers   // the water beside a street deck narrower than one trace cell, taken with it (structures.mjs#waterWithoutDecks)
    ribbonsLayer.curbCutNorm = resolveCurbCutNorm(SCENE, src.declared ? src.state : null, _registryRead)
      const N = ribbonsLayer.curbCutNorm
      // ⭐ the RUNG that decided each, and why every rung above it gave nothing — never the kit's value printed as the town's
      const rung = (n) => `from ${n.source}${n.passed?.length ? ` (${n.passed.join(' · ')})` : ''}${n.cites ? `, cited ${n.cites.join(', ')}` : ''}`
      console.log(`    [curb cuts] norm: ${N.style}${N.width ? ` (width ${+N.width.toFixed(4)} m, warning ${+N.warningDepth.toFixed(4)} m)` : ''} — ${rung(N)}`)
      console.log(`    [crosswalks] norm: ${N.crosswalks.style} — ${rung(N.crosswalks)}`)
      console.log(`    [kerb] height ${N.kerb.height} m${N.kerb.height > 0 ? ` · ramp ${N.kerb.rampSlopeText ?? '⛔ NOT GIVEN'} · flare ${N.kerb.flareSlopeText ?? '⛔ NOT GIVEN'}` : ' (one flat plane)'} — ${rung(N.kerb)}`)
      // ⭐ THE RECORDED CUTS — the rung above the norm (`cartograph/curb-cut-evidence.mjs`), frozen here and landed on
      // the curb at the freeze. ⛔ No kerb file is "not fetched", said out loud — never a town with no kerbs.
      const E = ribbonsLayer.curbCutEvidence = buildCurbCutEvidence({ osmPath: join(RAW_DIR, 'osm.json'),
        kerbsPath: join(RAW_DIR, 'osm_kerbs.json'), skeletonPath: join(CLEAN_DIR, 'skeleton.json') })
      if (!E.fetched) console.warn(`    [curb cuts] ⛔ kerb evidence: NOT FETCHED — no ${E.file}. Every corner falls to the norm. ▶ node fetch-kerbs.mjs --scene=${SCENE}`)
      else { const c = E.census
        console.log(`    [curb cuts] kerb evidence (${E.fetchedAt}): ${c.nodes} kerb node(s) — ${Object.entries(c.byKind).map(([k, v]) => `${v} ${k}`).join(' · ')} → ${c.records} record(s) bound to a crossing`)
        console.log(`    [curb cuts]   unbound: ${c.notOnCrossing} on no crossing · ${c.notOneRoadNode} crossing not on exactly one road node · ${c.positionNotRecorded} on the crossing's road node (lowered, position not recorded) · ${c.roadNotInSkeleton} road in no chain`) }
      // ⭐ THE RECORDED CROSSINGS — where a crosswalk IS (its station), never a cut's style. From osm.json; nothing to fetch.
      const CX = ribbonsLayer.crosswalkEvidence = buildCrosswalkEvidence({ osmPath: join(RAW_DIR, 'osm.json'), skeletonPath: join(CLEAN_DIR, 'skeleton.json') })
      console.log(`    [crosswalks] crossing evidence: ${CX.census.crossings} footway=crossing way(s) → ${CX.census.records} bound to the road they cross · unbound: ${CX.census.notOneRoadNode} not on exactly one road node · ${CX.census.roadNotInSkeleton} road in no chain`)
    }
    ribbonsLayer.protopolygon = {
      eps: MP.eps,                          // the ε the mint stroked at (tileGround.js#INK_EPS), recorded, never retyped
      rings: MP.rings.map(r => r.map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6])),
      labels: MP.labels,
      owners: MP.owners,
      // ⭐⭐ THE WATER AND THE REMAINDER TRAVEL WITH ①, for the same reason `blocks` does: the
      // bake reads this artifact and never re-mints. The water is a POSITIVE OBJECT to be
      // shaded ("360 degrees of circle filled with map"). The land no street bounds is NOT a
      // separate class: it is the OUTER ZONE, an ordinary compound block whose holes are the
      // streets — see `mintProtopolygon`'s drop rule.
      waterRings: MP.waterRings ? MP.waterRings.map(r => r.map(p => [Math.round(p[0]*1e6)/1e6, Math.round(p[1]*1e6)/1e6])) : null,
      // ⭐⭐ `blocks` = boundary − stroked roads (the substrate ruling), frozen WITH ① because the
      // bake reads ① from this artifact and never re-mints. Without it the consumer falls back to
      // ①'s holes, which LOSE every block the circle cuts — 36 on LS, 30 of them at the rim.
      // ⛔ Rounded to the same 1e-6 as `rings`: a block edge and the ① edge it lies on must not
      // disagree in the 7th decimal, or a downstream containment test can put a point on the
      // wrong side of a shared edge.
      // ⭐⭐⭐ A BLOCK IS A COMPOUND FACE — outer ring + its holes, carried together. `blockHoles[k]`
      // and `blockHoleLabels[k]` are PARALLEL to `blocks[k]`, deliberately: `easedByBlock` keys
      // every ②/③ consumer by position in the block list, and splitting that index space cost 61
      // tiles once. ⛔ Frozen, because the bake reads ① from this artifact and never re-mints — a
      // face whose holes were not frozen is offset AS IF SOLID downstream.
      ...(MP.blocks ? {
        blocks: MP.blocks.map(r => r.map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6])),
        blockLabels: MP.blockLabels,
        ...(protoBlockClass ? { blockClass: protoBlockClass } : {}),
        flares: protoFlares,
        ...(MP.blockHoles ? {
          blockHoles: MP.blockHoles.map(hs => hs.map(r => r.map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]))),
          blockHoleLabels: MP.blockHoleLabels,
        } : {}),
      } : {}),
      // ⭐⭐⭐ THE CORNER NODES, FROZEN — the centreline is INERT past this point (Jacob, 2026-09-06:
      // "as long as the centerline is rendered completely inert and unreachable by the
      // protopolygon"). ② needs the centreline node only to key the authored corner radius; frozen
      // here, it never has to reach for a chain. A pair that shares more than one vertex freezes as
      // `null` — refused, not guessed.
      ...(MP.nodes && Object.keys(MP.nodes).length ? {
        nodes: Object.fromEntries(Object.entries(MP.nodes).map(([k, v]) =>
          [k, v ? [Math.round(v[0] * 1e6) / 1e6, Math.round(v[1] * 1e6) / 1e6] : null])),
      } : {}),
      // ⭐ the SEALED CENTRELINE, frozen with ① (mintProtopolygon): the road's paint reads it past the Wall, never the chains
      ...(MP.centrelines ? { centrelines: MP.centrelines } : {}),
      ...(MP.outlineRefused ? { outlineRefused: MP.outlineRefused } : {}),
      // ⛔ ALWAYS written ([] when none): absent is a map before the rule, and the paint and the shore pin refuse it
      offGradeSpans: MP.offGradeSpans,
      endsInWater: MP.endsInWater,   // ⛔ always written too: the untagged streets that stop at the coast (a slipway)
      chainJoins: MI.chainJoins,     // ⛔ always written too: each chain end in another roadway, joined as a T or not and why (chainJoins.mjs)
      // ⭐ the ink ABSORBED (absorbInk.js): each face's painted boundary + labels, and the water / grade-separated cells
      ...(MP.paint ? { paint: MP.paint, inkCells: MP.inkCells } : {}),
      // ⭐ the STAMP, frozen with ①: the disc is applied to the RESULT of ②③, never to their input.
      ...(MP.boundaryRing ? { boundaryRing: MP.boundaryRing.map(p => [Math.round(p[0]*1e6)/1e6, Math.round(p[1]*1e6)/1e6]) } : {}),
      // ⛔⛔ CROSSINGS MUST BE FROZEN OR ① HAS NO CORNERS. A corner is exactly where two chains
      // cross, and `booleanLabelled` resolves a crossing vertex by INHERITING a neighbour's label —
      // so the label alone cannot say "this vertex is a node". The crossing record (who met here,
      // captured by Clipper's ZFillFunction and carried THROUGH the union) is the only thing that
      // can, and dropping it made every consumer read the whole contour as "no corners" and ease
      // NOTHING. ⭐ Caught by the consumer's own warning rather than by inspection, which is the
      // point of that warning existing.
      ...(MP.crossings ? { crossings: MP.crossings } : {}),
      ...(MP.refused ? { refused: MP.refused } : {}),
    }
    // ⛔ THE SAME SHOELACE `signedArea` USES — outer contour POSITIVE, holes NEGATIVE, which
    // is the convention ② reads (`if (signedArea(ring) > 0) continue — the blocks are the
    // HOLES`). The first cut here used the trapezoid form, whose sign is the NEGATIVE of it,
    // and printed 2 holes where there are 156. The geometry was never wrong; the disclosure
    // was — the same class as the "0 gradeSeparated" line this pass corrected.
    const holes = MP.rings.filter(r => {
      let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 }
      return a / 2 < 0
    }).length
    // ⛔ LOUD IF IT REFUSED. `booleanLabelled` refuses rather than hand back a
    // ring whose identity it could not carry — an unlabelled ① is worse than none,
    // because every downstream offset would silently take depth 0 and lay the curb
    // on the centreline. A plausible-looking wrong map is the one outcome a kit
    // may not have (`CLAUDE.md` Layer 0 q2).
    if (MP.refused) console.warn(`    ⛔ [①] identity REFUSED on the union — the protopolygon is frozen WITHOUT usable labels; downstream must not offset from it.`)
    const nCross = (MP.crossings || []).reduce((n, rg) => n + rg.filter(Boolean).length, 0)
    console.log(`    [①] froze the protopolygon: ${MP.chainRings} chain outline(s) → ${MP.rings.length} ring(s), ${holes} holes (= blocks), ${MP.owners.length} identity stamps, ${nCross} crossings (= the corners) at ε=${MP.eps} m`)
    if (!nCross) console.warn(`    ⛔ [①] ZERO crossings frozen — every downstream consumer will read this contour as having NO CORNERS and round nothing.`)
    }
  }

  console.log(`    ${ribbonStreets.length} streets, ${intersections.length} intersections`)
  for (const st of ribbonsLayer.streets) {
    const m = st.measure
    const tag = m.source === 'default' ? ' [DEFAULT]' : ''
    const L = m.left, R = m.right
    console.log(`      ${st.name}: L{pav=${L.pavementHW.toFixed(2)} tl=${L.treelawn.toFixed(2)} sw=${L.sidewalk.toFixed(2)} ${L.terminal}} R{pav=${R.pavementHW.toFixed(2)} tl=${R.treelawn.toFixed(2)} sw=${R.sidewalk.toFixed(2)} ${R.terminal}}${tag}`)
  }

  // ── Surface overlays (sub-face features from OSM) ───────────
  // These sit inside block faces as visual overlays above face fill, below
  // buildings. They never replace ribbon-block geometry (use landuse=* for
  // face classification, not rendering).
  const _amenity = osmData.ground?.amenity || []
  const _leisure = osmData.ground?.leisure || []
  const _natural = osmData.ground?.natural || []
  const _barrier = osmData.ground?.barrier || []

  // ⛔⛔ THESE FOUR LOOPS RENDER, so an unreadable ring here is not a bad vote — it is
  // a wrong shape drawn on the map. They took `f.coords` as the face and gated only on
  // vertex count, which was correct while every ground feature was a single closed way
  // and is wrong now that relations are in the intake. One gate, one account, reported
  // with the land-use gap above rather than as a second half-report.
  const ovVocabGap = createVocabularyGate('osm-overlay',
    'These features are DRAWN, not merely voted on. A clipped ring has no trustworthy ' +
    'interior and a compound one has holes no consumer here can express, so they are ' +
    'skipped rather than drawn wrong. Teaching the overlays to carry holes is the fix.')
  const overlayReadable = (f) => {
    const why = unreadableFace(f)
    if (!why) return true
    const cat = f.tags?.amenity ? 'amenity' : f.tags?.leisure ? 'leisure' : f.tags?.natural ? 'natural' : 'feature'
    ovVocabGap.record(`${why}:${cat}=${f.tags?.[cat] ?? '(missing)'}`, f.coords, f.tags)
    return false
  }

  const parkingLots = []
  const institutionOverlays = []
  for (const f of _amenity) {
    if (!overlayReadable(f)) continue
    const ring = f.coords.map(c => ({ x: c.x, z: c.z }))
    if (f.tags?.amenity === 'parking') {
      parkingLots.push({ ring, surface: f.tags.surface || 'asphalt', access: f.tags.access || null })
    } else if (f.tags?.amenity) {
      institutionOverlays.push({ ring, use: f.tags.amenity })
    }
  }
  // ⛔⛔ THIS SKIPPED THE WHOLE CLASS BECAUSE ONE PARK ON ONE TOWN HAS A BESPOKE
  // RENDERER. The line read `if (f.tags?.leisure === 'park') continue  // Lafayette
  // Park rendered separately` — true of Lafayette Park, applied to every park in
  // every town. Measured at the fix: huron carries 11 NAMED parks (Fabens,
  // Oklahoma, Lake Front, Nickleplate, the Marina & Amphitheater…) and drew ZERO;
  // even on LS it dropped SIX, of which only Lafayette Park is rendered separately
  // — Fox, Buder, Ray Leisure, Eads Square and Fountain Park Plaza were rendered by
  // nothing at all. ⭐ Layer 0's signature, and the twin of `MapLayers.jsx`'s
  // `natural=water` skip (`ROADMAP H-8`): correct on the town it was written for,
  // blind everywhere else, and invisible in any aggregate taken on LS.
  //
  // ⭐ THE SKIP NOW NAMES THE PARK, NOT THE CLASS. The double-draw it exists to
  // prevent can only happen where the authored polygon actually draws, so the test
  // is "is this feature THAT park" — the authored polygon's own centroid falling
  // inside this ring. One point lies inside at most one ring, so there is nothing
  // to tune and no threshold; a town with no authored park (every town but LS)
  // skips nothing, which is the correct answer there.
  // ⛔ NOT a centroid-of-the-OSM-feature test: a park ring is often non-convex and
  // its centroid can land outside itself, which is the misfiling `RIBBONS §1`'s
  // reconcile gate already warns about. The AUTHORED polygon is the 4-corner one.
  const authoredParkPt = parkPolygon ? (() => {
    const r = pathFromClipper(parkPolygon)
    let x = 0, z = 0
    for (const p of r) { x += p.x; z += p.z }
    return r.length ? { x: x / r.length, z: z / r.length } : null
  })() : null
  const ringHasPt = (coords, pt) => {
    let inside = false
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const a = coords[i], b = coords[j]
      if ((a.z > pt.z) !== (b.z > pt.z) &&
          pt.x < (b.x - a.x) * (pt.z - a.z) / ((b.z - a.z) || 1e-12) + a.x) inside = !inside
    }
    return inside
  }
  const leisureOverlays = []
  let parkSkipped = 0, parkDrawn = 0
  for (const f of _leisure) {
    if (!overlayReadable(f)) continue
    if (f.tags?.leisure === 'park') {
      if (authoredParkPt && ringHasPt(f.coords, authoredParkPt)) { parkSkipped++; continue }
      parkDrawn++
    }
    leisureOverlays.push({ ring: f.coords.map(c => ({ x: c.x, z: c.z })), use: f.tags?.leisure })
  }
  // ⛔ NOT SILENT, either way. A scene with an authored park and NO OSM twin skips
  // nothing and may double-draw; a scene with no authored park draws every park.
  // Both are legitimate and neither may be discovered on a map.
  if (parkSkipped || parkDrawn) console.log(`    ${parkDrawn} leisure=park drawn as overlays; ${parkSkipped} skipped as the AUTHORED park (rendered separately)`)
  if (authoredParkPt && !parkSkipped) console.warn(`    ⛔ this scene has an AUTHORED park polygon but no OSM leisure=park contains it — nothing was skipped, so the authored park may draw twice.`)
  const naturalOverlays = []
  for (const f of _natural) {
    if (!overlayReadable(f)) continue
    naturalOverlays.push({ ring: f.coords.map(c => ({ x: c.x, z: c.z })), use: f.tags?.natural })
  }
  const ovGapReport = ovVocabGap.report(SCENE)
  if (ovGapReport) console.log(ovGapReport)
  // Barriers are linear. Emit as polylines (coords, not ring) keyed by kind.
  const barrierLines = []
  for (const f of _barrier) {
    if (!f.coords || f.coords.length < 2) continue
    if (!['fence', 'wall', 'hedge', 'retaining_wall'].includes(f.tags?.barrier)) continue
    barrierLines.push({ coords: f.coords.map(c => ({ x: c.x, z: c.z })), kind: f.tags.barrier })
  }
  console.log(`    parking_lot: ${parkingLots.length}, institution: ${institutionOverlays.length}, leisure: ${leisureOverlays.length}, natural: ${naturalOverlays.length}, barrier: ${barrierLines.length}`)


  // ── Assemble layers ─────────────────────────────────────────
  console.log('  [9/9] Assembling layers...')

  // ⭐⭐⭐ THE WATER AND THE REMAINDER ARE DRAWN. "The water is a positive object which will
  // require shading and not just the empty half of the composition. We have 360 degrees of
  // circle filled with map" (Jacob, 2026-09-20). A blank here would be the ABSENCE the rim
  // doctrine forbids — `ORIENTATION`: the rim is an EDGE OF THE DRAWING, never an absence.
  // ⛔ They are LAYERS, not blocks: nothing offsets a curb from either, and neither carries an
  // authoring slot. Measured on Huron: 0 of 204 block faces touch a `__water__` edge, so no
  // editable surface abuts the coast and the Wall is not crossed to draw them.
  // ⭐ THE WATER is ①'s water face, frozen as `layers.ribbons.protopolygon.waterRings` and read by every bake through
  // coastFile.mjs#waterFace (BRIEF-the-shore-is-one-line §3 step 2a). It is no longer copied into a `water` layer: a copy
  // is a second source, and ①'s coast IS the high-water mark.

  const layers = {
    pavement:       pavementFeats,                                     // streets from standards (independent)
    block:          toFeats(allBlockPaths),                             // parcel-union boundaries
    sidewalk:       toFeats(sidewalkStripPaths),                        // geometric insets where OSM confirms
    lot:            toFeats(lotPaths),                                  // block minus sidewalk strips
    parkSidewalk:   parkSidewalkFeats,
    park:           parkFeats,
    parcel:         clipParcelsToRoundedBlocks(parcels, allBlockPaths, classifyLandUse),
    alley:          toFeats(alleyUnion),
    bikeLane:       bikeLanes,
    footway:        bufferEach(footways, STANDARDS.footway.width / 2),
    cycleway:       bufferEach(cycleways, STANDARDS.cycleway.width / 2),
    steps:          bufferEach(steps,    STANDARDS.steps.width    / 2),
    path:           bufferEach(paths,    STANDARDS.path.width     / 2),
    streetlamp:     streetlamps,
    contour:        contours,
    spike:          toFeats(spikeBlockPaths),
    parking_lot:    parkingLots,
    institution:    institutionOverlays,
    leisure:        leisureOverlays,
    natural:        naturalOverlays,
    barrier:        barrierLines,
    ribbons:        ribbonsLayer,
  }

  // Store block polygons for building clipping
  _lotPaths = allBlockPaths

  // Validate: how many lamps are inside blocks?
  let lampsInside = 0
  for (const lamp of streetlamps) {
    const pt = new IntPoint(Math.round(lamp.x * CLIP_SCALE), Math.round(lamp.z * CLIP_SCALE))
    for (let i = 0; i < allBlockPaths.length; i++) {
      if (Clipper.PointInPolygon(pt, allBlockPaths[i]) !== 0) { lampsInside++; break }
    }
  }
  console.log(`    Lamp validation: ${lampsInside}/${streetlamps.length} lamps inside blocks (${(100 * lampsInside / streetlamps.length).toFixed(0)}%)`)

  console.log('  Layers:')
  for (const [n, f] of Object.entries(layers)) {
    if (f.length > 0) console.log(`    ${n}: ${f.length}`)
  }

  return layers
}

function toCompoundFeatures(clipperPaths) {
  const outers = [], holes = []
  for (let i = 0; i < clipperPaths.length; i++) {
    const area = Clipper.Area(clipperPaths[i])
    const ring = pathFromClipper(clipperPaths[i])
    if (area >= 0) outers.push({ ring, cp: clipperPaths[i] })
    else holes.push({ ring, cp: clipperPaths[i] })
  }
  const features = []
  const used = new Set()
  for (const o of outers) {
    const myH = []
    for (let h = 0; h < holes.length; h++) {
      if (used.has(h)) continue
      if (Clipper.PointInPolygon(holes[h].cp[0], o.cp) !== 0) {
        myH.push(holes[h].ring)
        used.add(h)
      }
    }
    features.push({ ring: o.ring, holes: myH.length ? myH : undefined })
  }
  return features
}

/**
 * Compute building footprints.
 *
 * For OSM-sourced buildings we *used to* scale by sqft/stories because
 * OSM footprints were unreliable. MSBF footprints are ML-derived from
 * recent aerial imagery and are already accurate — scaling them based
 * on gross-sqft-per-story is actively wrong (gross sqft includes wall
 * thickness, stairwells, etc., so the target area is not the real
 * footprint area). So we pass MSBF through untouched.
 *
 * The `source` argument is 'project', 'microsoft', 'declared:<well>' (a town's own footprint well,
 * footprint-well.mjs — measured outlines, passed through like MSBF) or 'osm' (from pipeline.js).
 */
export function deriveBuildings(buildings, source = 'osm') {
  // Curated project data / MSBF / a declared well: pass through, no scaling.
  if (source === 'project' || source === 'microsoft' || source.startsWith('declared:')) {
    const result = buildings.map(b => ({
      ring: b.coords.map(c => ({ x: c.x, z: c.z })),
      projectId: b.projectId,
      msbfId: b.msbfId,
      osmId: b.osmId,   // an OSM footprint the union added (building-union.mjs)
      // Who a declared well's footprint is (fetch-buildings.mjs) — minted by membership.mjs#buildingIdOf.
      ...(b.well ? { well: b.well, keyKind: b.keyKind, keyWhy: b.keyWhy, ...(b.permanentId != null ? { permanentId: b.permanentId } : {}), ...(b.wellN != null ? { wellN: b.wellN } : {}) } : {}),
      // OSM twins' footprints, for containment JOINS only (never drawn): building-union.mjs
      ...(b.joinRings ? { joinRings: b.joinRings.map(r => r.map(c => ({ x: c.x, z: c.z }))), twinOsmIds: b.twinOsmIds } : {}),
      tags: b.tags,
      elev: b.elev || null,
    })).filter(b => b.ring.length >= 3)
    console.log(`  Buildings: ${result.length} ${source} footprints kept as-is (no scaling)`)
    return result
  }

  // OSM path: the original fix-up logic, unchanged.
  return _deriveBuildingsOSM(buildings)
}

function _deriveBuildingsOSM(buildings) {
  // Load enriched buildings with sqft data, indexed by position for matching
  let enrichedList = []
  try {
    const bd = JSON.parse(readFileSync(
      join(CARTOGRAPH_DIR, '..', 'src', 'data', 'buildings.json'), 'utf-8'
    ))
    enrichedList = Object.values(bd.buildings || bd).filter(b => b.position && b.building_sqft)
    console.log(`  Building enrichment: ${enrichedList.length} with sqft data`)
  } catch { console.log('  No enriched building data') }

  const result = []
  let scaled = 0, kept = 0

  for (const b of buildings) {
    const ring = b.coords.map(c => ({ x: c.x, z: c.z }))
    if (ring.length < 3) continue

    // Match by proximity — find enriched building closest to this one's centroid
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length
    const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length

    let match = null, bestDist = 5 // max 5m matching radius
    for (const e of enrichedList) {
      const dx = e.position[0] - cx
      const dz = e.position[2] - cz
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d < bestDist) { bestDist = d; match = e }
    }

    if (match?.building_sqft && match?.stories) {
      const SQFT_TO_SQM = 0.0929
      const targetArea = (match.building_sqft * SQFT_TO_SQM) / match.stories

      // Current footprint area (shoelace formula)
      let currentArea = 0
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length
        currentArea += ring[i].x * ring[j].z - ring[j].x * ring[i].z
      }
      currentArea = Math.abs(currentArea) / 2

      if (currentArea > 1 && targetArea > 1) {
        // Scale factor: sqrt because area scales as square of linear dimension
        const scale = Math.sqrt(targetArea / currentArea)

        // Only shrink, never grow (rooflines >= foundations)
        // And only if meaningfully different (> 5%)
        if (scale < 0.95) {
          // Scale around centroid
          const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length
          const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length

          const scaledRing = ring.map(p => ({
            x: Math.round((cx + (p.x - cx) * scale) * 100) / 100,
            z: Math.round((cz + (p.z - cz) * scale) * 100) / 100,
          }))

          result.push({
            ring: scaledRing,
            osmId: b.osmId, tags: b.tags, elev: b.elev || null,
          })
          scaled++
          continue
        }
      }
    }

    // No sqft data or scale not needed — keep as-is
    result.push({
      ring, osmId: b.osmId, tags: b.tags, elev: b.elev || null,
    })
    kept++
  }

  console.log(`  Buildings: ${scaled} scaled from assessor data, ${kept} kept as-is`)
  return result
}

export let _lotPaths = null
