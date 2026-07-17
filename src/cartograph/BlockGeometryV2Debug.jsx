/**
 * BlockGeometryV2Debug — Designer's V2 live ground render.
 *
 * Calls `buildBlockGeometryV2` against live store state (centerlines,
 * blockCustoms, corner overrides, curb width) and renders the output
 * through the shared cartograph surface pipeline (`useSurfaceMaterial`)
 * so colors, terrain displacement, shadow tinting, and post-FX match
 * the bake's V2 output. Designer authoring edits show without re-baking.
 *
 * Layers (back-to-front via BAND_PRIORITY):
 *   - treelawn bands  (pri 3)
 *   - sidewalk bands  (pri 5)
 *   - curb stroke     (pri 6)
 *   - asphalt rounded (pri 8)
 *
 * Coord convention: ShapeGeometry built from Vector2(x, z), then
 * per-vertex remap to (x, 0, z) flips XY→XZ.
 *
 * Name is historical — this was a debug probe during the V2 prototype;
 * promote to its proper name when convenient.
 */
import { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react'
import * as THREE from 'three'
import { buildBlockGeometryV2, differenceRings } from '../lib/buildBlockGeometryV2.js'
import { buildTileGround, sectionOpen } from '../lib/tileGround.js'  // T1 — toy tiles (transitional; shared with the bake for WYSIWYG); sectionOpen = the Wall's Phase-D open (Section ← frozen shape.json)
import { STREET_SMOOTH } from '../lib/smoothCenterline.js'  // the ONE smoothing knob — shared with the MeasureOverlay navy draw (SSoT; SKELETON.md §3.5)
import { buildPathRibbons } from '../lib/buildPathRibbons.js'
import { buildParkPathRings, mergeRings } from '../lib/parkPaths.js'
import parkPolygon from '../../cartograph/data/lafayette-square/clean/park-polygon.json'
import parkWaterData from '../data/lafayette-square/park_water.json'
import { mergeLiveRibbons } from '../lib/mergeLiveRibbons.js'
import { BAND_COLORS } from './streetProfiles.js'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS, BAND_TO_LAYER } from './m3Colors.js'
import useSurfaceMaterial from '../lib/useSurfaceMaterial.js'
import useCartographStore from './stores/useCartographStore.js'
import {
  BOUNDARY_CENTER_XZ,
  FADE_INNER, FADE_OUTER,
  STREET_FADE_INNER, STREET_FADE_OUTER,
} from './boundary.js'

// Single source of truth for the soft-circle silhouette in Designer's
// V2 live render. Mirrors BakedGround.fadeForGroup: face-kind layers
// (block fill) use the inner band; ribbon-kind layers (asphalt /
// sidewalk / treelawn / curb / corner pads/plugs) use the wider street
// band so streets trail past the dissolved blocks.
const FACE_FADE = {
  center: { x: BOUNDARY_CENTER_XZ[0], z: BOUNDARY_CENTER_XZ[1] },
  inner:  FADE_INNER,
  outer:  FADE_OUTER,
}
const BAND_FADE = {
  center: { x: BOUNDARY_CENTER_XZ[0], z: BOUNDARY_CENTER_XZ[1] },
  inner:  STREET_FADE_INNER,
  outer:  STREET_FADE_OUTER,
}

// Match StreetRibbons' BAND_PRIORITY for the bands V2 renders. Residential
// block fill sits at face-level (pri 1) — below all street/strip layers.
// Curb sits between sidewalk and asphalt to match V1's stack order.
const PRI = { residential: 1, treelawn: 3, sidewalk: 5, curb: 6, asphalt: 8 }

function ringSignedArea(ring) {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    a += (x1 * y2 - x2 * y1)
  }
  return a / 2
}

// Even-odd point-in-polygon (works for non-convex rings).
function pointInRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi || 1e-12) + xi)) inside = !inside
  }
  return inside
}

// Find which block ring contains a point; returns its lu (or null).
// Mirrors the bake's adjacent-parcel attribution for treelawn so

// Find an interior probe point for a hole ring (CW from Clipper). Holes
// share their boundary with surrounding outers, so a probe at a vertex is
// AT the boundary and lands ambiguously by point-in-polygon. Instead, take
// an edge midpoint and offset perpendicular-inward by epsilon. For CW
// rings interior sits to the right of the edge direction; for CCW left.
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

// Build a flat-on-ground geometry from a list of clipper-output rings.
// CCW outers + CW holes (Clipper non-zero output). When asPolygonWithHoles
// is set, all holes get paired with each outer (naive containment — fine
// for stencil-minus-asphalt where there's one big outer).
function ringsToFlatGeo(rings, yLift = 0, asPolygonWithHoles = false) {
  if (!rings || !rings.length) return null
  const outers = []
  const holes = []
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue
    if (ringSignedArea(ring) > 0) outers.push(ring)
    else holes.push(ring)
  }

  const allPos = [], allNrm = [], allIdx = []
  let vOffset = 0

  const buildShapeGeo = (outer, ringHoles) => {
    const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, z)))
    if (ringHoles) {
      for (const h of ringHoles) {
        const path = new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z)))
        shape.holes.push(path)
      }
    }
    return new THREE.ShapeGeometry(shape)
  }

  const append = (geo) => {
    const pos = geo.attributes.position.array
    const idx = geo.index ? geo.index.array : null
    for (let i = 0; i < pos.length; i += 3) {
      allPos.push(pos[i], yLift, pos[i + 1])
      allNrm.push(0, 1, 0)
    }
    if (idx) {
      for (let i = 0; i < idx.length; i += 3) {
        allIdx.push(idx[i] + vOffset, idx[i + 2] + vOffset, idx[i + 1] + vOffset)
      }
    }
    vOffset += pos.length / 3
    geo.dispose()
  }

  if (asPolygonWithHoles && outers.length) {
    // Pair each hole with the SMALLEST containing outer (point-in-polygon
    // by hole's first vertex). Without this, "stencil minus asphalt" with
    // 9 block-island outers floating inside the asphalt hole misroutes the
    // hole onto every outer, blanking the blocks. Smallest-containing
    // handles nested geometry — a hole inside a block-island would attach
    // to that block, not the stencil.
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
    for (let i = 0; i < outers.length; i++) {
      append(buildShapeGeo(outers[i], holesByOuter[i]))
    }
  } else {
    for (const ring of [...outers, ...holes]) append(buildShapeGeo(ring, null))
  }

  if (!allPos.length) return null
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3))
  if (allIdx.length) out.setIndex(allIdx)
  return out
}

// Build a LineSegments geometry (closed loops) from clipper-output rings.
// The Survey view shows the curb as an OUTLINE rather than a filled band, so
// it strokes the same `tg.curb` rings the tile fill uses — one geometry source,
// no separate Survey curb construction. Each ring edge becomes a segment pair.
function ringsToEdgeGeo(rings, yLift = 0) {
  if (!rings || !rings.length) return null
  const pos = []
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      pos.push(a[0], yLift, a[1], b[0], yLift, b[1])
    }
  }
  if (!pos.length) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return geo
}

// Build a merged disc geometry for the Survey IX markers — one small flat
// circle per canonical junction (ribbons.intersections), all in one mesh so
// hundreds of nodes cost a single draw call.
function ixMarkersGeo(intersections, R = 0.7, SEG = 12, y = 0.06) {
  if (!intersections?.length) return null
  const pos = [], idx = []
  let off = 0
  for (const ix of intersections) {
    const p = ix?.point
    if (!p) continue
    pos.push(p[0], y, p[1])                       // fan center
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2
      pos.push(p[0] + Math.cos(a) * R, y, p[1] + Math.sin(a) * R)
    }
    for (let s = 0; s < SEG; s++) idx.push(off, off + 1 + s, off + 2 + s)
    off += SEG + 2
  }
  if (!pos.length) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  return geo
}

// Survey's blue palette. Survey's job is to memorialize the BLOCK / land-use
// boundaries, so the blocks themselves read as a translucent blue fill; the
// curb outline + IX node markers + centerline (MapLayers) frame them. Distinct
// from Section's full per-LU paint. Jacob's eye tunes.
const SURVEY_BLUE = { block: '#3b7dd8', curbFill: '#27579e', curb: '#1f6fe0', ix: '#7ab8ff' }

export default function BlockGeometryV2Debug({
  ribbons, stencil = null, flat = true, showCornerDots = false, residentialColor,
  measureActive = false, surveyActive = false, hideLandUse = false,
  useBoundary = false,
  scene = null,
  useRingBandEmitter = true,  // C5: keeper for all scenes (LS cutover); legacy else-branch removed in commit 3
}) {
  // Gate fade on the per-scene flag. LS turns on the soft-circle
  // silhouette; toy stays rectangular (its stencil is a 360×360 box).
  const faceFade = useBoundary ? FACE_FADE : null
  const bandFade = useBoundary ? BAND_FADE : null
  const makeMaterial = useSurfaceMaterial(flat)
  // Read corner-authoring + palette state directly from the store. Keeps
  // the V2 mount simple (just `ribbons` + `stencil` as props) and lets the
  // helper participate in the per-IX / per-corner authoring kit without
  // any wrapper plumbing.
  const cornerRadiusScale         = useCartographStore(s => s.cornerRadiusScale ?? 1)
  const cornerRadiusOverrides     = useCartographStore(s => s.cornerRadiusOverrides)
  const cornerCornerRadiusOverrides = useCartographStore(s => s.cornerCornerRadiusOverrides)
  const cornerEditMode            = useCartographStore(s => s.cornerEditMode)
  const curbWidth                 = useCartographStore(s => s.curbWidth ?? 0.1524)
  // [curve-fit — THE ONE KNOB] The curb derives from the single shared smoothing
  // tension `STREET_SMOOTH` (smoothCenterline.js). The smooth>0 path re-walks
  // extractFaces over the smoothed centerline → the curb iA + ped ribbon follow
  // the smooth curve. The navy editable centerline derives from the SAME constant
  // + the SAME junction keys (junctionKeysOf) in MeasureOverlay, so the two are
  // ONE smooth curve, concentric by construction — no two-source desync (the SSoT,
  // SKELETON.md §3.5, RIBBONS.md §1 the Derivation Chain). NOT a UI slider — an
  // internal constant tuned once on the eye, then baked at the source.
  const streetSmooth = STREET_SMOOTH
  const alleyCap                  = useCartographStore(s => s.alleyCap ?? 'square')
  const blockCustoms              = useCartographStore(s => s.blockCustoms)
  // TRUE once the active Look's design.json has hydrated. Until then curbWidth /
  // blockCustoms are still store DEFAULTS, so any geometry built off them is wrong
  // and gets discarded the moment the design lands. Set even when design.json is
  // absent (it hydrates {}), so this can't deadlock the render.
  const designHydrated            = useCartographStore(s => s._designHydrated)
  const blockLandUse              = useCartographStore(s => s.blockLandUse)
  const layerColors               = useCartographStore(s => s.layerColors)
  const luColors                  = useCartographStore(s => s.luColors)
  // Per-layer visibility — Designer panel writes `false` to hide. Same
  // map used by MapLayers / Stage so the toggle is unified across the
  // app. Default (undefined) = visible. Each ribbon-band material has
  // its own row in the Designer panel; gate every renderer here on its
  // matching layer key so the toggles actually take effect on V2's live
  // output (toggles previously only flipped V1 / MapLayers).
  const layerVis                  = useCartographStore(s => s.layerVis)
  const asphaltVisible            = layerVis?.street    !== false
  const highwayVisible            = layerVis?.highway   !== false
  const curbVisible               = layerVis?.curb      !== false
  const sidewalkVisible           = layerVis?.sidewalk  !== false
  const treelawnVisible           = layerVis?.treelawn  !== false
  const lotVisible                = layerVis?.lot       !== false
  const medianVisible             = layerVis?.median    !== false
  // Per-land-use face visibility ('lu-<class>' key — matches bake-ground
  // groupLayerId + BakedGround.isGroupVisible). Lets a Designer LU toggle
  // hide that class live, WYSIWYG with the slab. Unset = visible.
  const luVisible = (lu) => layerVis?.[`lu-${lu}`] !== false
  // Non-street ribbon visibility. Five kinds with one row each in the
  // Stage Surfaces panel; all default-visible. Routed through buildPathRibbons
  // (same helper bake-ground.js consumes), so Designer + slab cannot drift.
  const alleyVisible              = layerVis?.alley     !== false
  const footwayVisible            = layerVis?.footway   !== false
  const cyclewayVisible           = layerVis?.cycleway  !== false
  const stepsVisible              = layerVis?.steps     !== false
  const pathVisible               = layerVis?.path      !== false
  const parkPathVisible           = layerVis?.park_path !== false
  // Highway-class chains route through the `highway` toggle row; everything
  // else through `street` (Asphalt). Same split the bake adapter does
  // — keep both in sync so toggling Highway in Designer matches Stage.
  // Live operator intent — Survey caps, Measure overrides, smooth, anchor.
  // Merged onto the static `ribbons` prop so V2 reflects edits without
  // waiting for a re-bake. Structural data (chain points, IX positions,
  // face rings) still comes from the static artifact.
  const liveStreets               = useCartographStore(s => s.centerlineData?.streets)
  const selectedStreet            = useCartographStore(s => s.selectedStreet)
  // Survey is "editing" whenever there's something being authored — a street
  // selected or corner-edit mode on. While editing, the map FILLS go translucent
  // so the operator reads the grid backdrop through them (the curb stroke +
  // handles + centerlines stay solid); Enter/Escape clears the selection → opaque
  // again. (Section's translucency rides the §5 selected-corridor path; this is
  // Survey's whole-map edit-state translucency.) Declared after selectedStreet /
  // cornerEditMode so it doesn't reference them in their temporal dead zone.
  const surveyEditing = surveyActive && (selectedStreet != null || cornerEditMode)
  // selectedStreet indexes centerlineData.streets (skeleton order, N
  // entries). V2's `byChain` and `frontageEdges.chainIdx` index
  // liveRibbons.streets (ribbons order, M entries — derive.js inserts
  // extra carriageways for divided roads). Toy hits this hard
  // (M=15 vs N=9). Translate once by skelId; use this everywhere
  // byChain or chainIdx is indexed against `selectedStreet`.
  // Color resolution: Look-level overrides (layerColors / luColors from the
  // active design) win over BAND_COLORS / DEFAULT_LU_COLORS defaults.
  // BAND_TO_LAYER maps band → layer key (e.g., "asphalt" → "street").
  const colorFor = (band) => {
    const layer = BAND_TO_LAYER[band] || band
    return (layerColors && layerColors[layer]) || DEFAULT_LAYER_COLORS[layer] || BAND_COLORS[band]
  }
  const asphaltCol  = colorFor('asphalt')
  const highwayCol  = colorFor('highway')
  const medianCol   = colorFor('median')   // layerColors['median'] — same source the slab bakes (WYSIWYG)
  const curbCol     = colorFor('curb')
  const treelawnCol = colorFor('treelawn')
  const sidewalkCol = colorFor('sidewalk')
  const liveRibbons = useMemo(
    () => mergeLiveRibbons(ribbons, liveStreets),
    [ribbons, liveStreets]
  )
  // Coord-match IX identity per chain, memoized on liveRibbons — the same
  // segmentation boundaries buildFrontageEdges/assignSegOrdsToFes partition on,
  // so fe segOrds stay stable (they key blockCustoms via feCustomKey).
  // Translation: selectedStreet (skeleton-order index) → ribbons-order
  // index. -1 if no match. See comment above on the two arrays.
  // V2 input snapshot. While a chain is selected, the operator's drag
  // edits route through `liveSelectedRings` below, so V2 doesn't need to
  // rebuild on every drag tick. The inputs (blockCustoms, corner overrides,
  // scale, curb width, …) are DEBOUNCED: rapid edits reset the timer and
  // the heavy Clipper pass fires once ~250ms after the edit settles. This
  // makes drag effectively free — the selected chain tracks handles via the
  // live overlay, and the rest of the map refreshes from the settled
  // snapshot (which now MUST track blockCustoms, since post-redesign every
  // measure edit, whole-chain included, writes per-fe blockCustoms).
  const v2DebounceMs = 250
  const [debouncedInputs, setDebouncedInputs] = useState({
    blockCustoms, cornerRadiusScale,
    cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockLandUse,
    smooth: streetSmooth,
  })
  const debounceRef = useRef(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // [Section perf #2] The figure-ground V2 pass is DEAD in non-Survey views
    // (Section/Design render from the frozen sectionGeos; V2 meshes never mount).
    // But it's a ~2.5s whole-map rebuild that re-fired on every FILL edit's
    // blockCustoms write — pure waste. Gate it on surveyActive: don't recompute
    // in Section; on re-entering Survey the effect re-runs (surveyActive in deps)
    // and refreshes the snapshot. (HANDOFF-section-perf.md root #2.)
    if (!surveyActive) return
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      setDebouncedInputs({
        blockCustoms, cornerRadiusScale,
        cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockLandUse,
        smooth: streetSmooth,
      })
    }, v2DebounceMs)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // `blockCustoms` IS a refresh trigger. Post measure-authoring redesign
    // ALL measure edits — including whole-chain — write per-fe blockCustoms
    // (the data wall: chains carry no authored measure). The non-selected
    // map render reads V2's snapshot, so it must track blockCustoms or
    // whole-chain edits go invisible on the map (the live overlay only
    // covers the selected chain). The 250ms debounce coalesces drag ticks:
    // each tick resets the timer, so the full rebuild fires once ~250ms
    // after the edit settles — during the drag the selected chain is still
    // covered by the live overlay, so there's no mid-drag full rebuild.
  }, [surveyActive, selectedStreet, blockCustoms, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockLandUse, streetSmooth, useRingBandEmitter])

  // `frontageEdges` is buildBlockGeometryV2's ONE remaining output: the
  // chain-anchored block-edge identity (feCustomKey = [chainSkelId, side,
  // min(segOrds)]) that SurveyorOverlay / MeasureOverlay / MeasurePanel resolve
  // blockCustoms against. The figure-ground geometry it used to emit alongside
  // was deleted at T4 (2026-07-15).
  const { frontageEdges } = useMemo(() => {
    const empty = { frontageEdges: [] }
    if (!liveRibbons) return empty
    // ⛔ GATE — the fe consumers mount only under tool==='surveyor'|'measure';
    // the neutral Design view reads none of this. Pre-T4 this pass also built the
    // figure-ground meshes and cost 285 s on Altadena — 95% of a 320 s load, drawing
    // nothing (DESIGNER-LOAD-FORENSIC.md). That geometry is gone and the build is
    // now ~0.5 s, so the gate is no longer load-bearing — it stays because the work
    // is still not free and still unread outside those two tools.
    // surveyActive/measureActive are in the deps: entering either tool builds it.
    if (!surveyActive && !measureActive) return empty
    // [LOAD-FORENSIC 2026-07-14] throwaway stage timing; strip once Jacob has
    // eye-confirmed the load in the browser.
    console.time('[LOAD] buildBlockGeometryV2')
    try {
      return buildBlockGeometryV2(liveRibbons, {
        stencil, ...debouncedInputs, useRingBandEmitter,
      })
    } catch (e) {
      console.error('[BlockGeometryV2Debug] build failed:', e)
      return empty
    } finally {
      console.timeEnd('[LOAD] buildBlockGeometryV2')
    }
  }, [liveRibbons, stencil, debouncedInputs, useRingBandEmitter, surveyActive, measureActive])


  // D.5: Stash frontageEdges so MeasureOverlay can resolve a clicked
  // chain point → (blockKey, edgeOrd) for per-block-edge customs.
  //
  // Identity translation: V2's `chainIdx` indexes `liveRibbons.streets`
  // (ordered like the static ribbons artifact). MeasureOverlay's
  // `streetIdx` indexes `centerlineData.streets` (live-store order) —
  // a different ordering on toy + LS. Each fe carries `chainSkelId`/
  // `chainName` so consumers match by identity instead of array index.
  //
  // buildFrontageEdges now stamps these at construction (the SINGLE source
  // of the chain-anchored customs key, feCustomKey). This pass only DEFERS
  // to that stamp, recomputing with the IDENTICAL formula (skelId || name)
  // for any legacy fe that predates the stamp — never a second formula, so
  // the live fe and bake fe can't diverge on the key.
  const enrichedFrontageEdges = useMemo(() => {
    const streets = liveRibbons?.streets || []
    return frontageEdges.map(fe => {
      if (fe.chainSkelId != null) return fe  // already stamped at construction
      const st = streets[fe.chainIdx]
      return { ...fe, chainSkelId: st?.skelId || st?.name || null, chainName: st?.name || null }
    })
  }, [frontageEdges, liveRibbons])
  useEffect(() => {
    useCartographStore.getState()._setV2FrontageEdges(enrichedFrontageEdges)
  }, [enrichedFrontageEdges])

  // Tiny y-lifts keep coplanar layers from z-fighting; polygonOffset (driven
  // by pri in makeMaterial) is the authoritative depth resolver.
  // blockRounded is rendered as a polygon-with-holes (the stencil outer is
  // the residential land mass; rounded asphalt rings are holes).
  // asPolygonWithHoles=true on asphalt is critical: asphalt's union output
  // is 1 corridor outer + N block-shaped holes. Without hole-aware rendering,
  // the holes are drawn as filled asphalt-color rectangles, occluding the
  // block parcels underneath.
  // Block geometry uses the TIGHT blockFill (stencil − all ribbons) so
  // the green parcel doesn't bleed under translucent treelawn / sidewalk.
  // The loose blockRounded (stencil − asphalt) stays available for
  // adjacency lookups (_setV2Blocks below) where the wider area better
  // identifies "which block is on this side of the chain".
  // Group blocks by land use → one mesh per LU type, each colored from
  // luColors[lu] || DEFAULT_LU_COLORS[lu]. The hash-fallback assignment
  // happens inside buildBlockGeometryV2 (deterministic per blockKey).
  // Adjacent-block resolution for the selected chain. While Measure is
  // active and a chain is selected, block-fill polygons within the
  // chain's authoring scope go translucent so the aerial reads through
  // every layer (asphalt + treelawn + sidewalk + lot).
  //
  // Scope per measureMode:
  //   - 'global' (whole-chain, default): every block whose ring shares
  //     an edge with the selected chain's centerline. Geometric
  //     proximity test (chain.points within hw+cw+tl+sw+slack of any
  //     block-edge segment) — robust to walker fe-coverage gaps that
  //     can appear on complex multi-carriageway corridors (Park Ave,
  //     Truman) where some chain↔block pairs lose their fe.
  //   - 'block' (per-segment): narrow to just the two blocks on either
  //     side of the centerline at `selectedMeasurePoint` — the anchor
  //     the drag will actually write to.
  const measureMode = useCartographStore(s => s.measureMode)
  const selectedMeasurePoint = useCartographStore(s => s.selectedMeasurePoint)

  // Group blocks by (lu, selected). Selected blocks render through the
  // `selectedCorridor` material variant (opacity 0.55 in Measure, same
  // as the chain's bands); unselected blocks render opaque.

  // The tile construction (all scenes). Same module the bake calls
  // (src/lib/tileGround.js), same inputs → live == bake (WYSIWYG). This is now
  // the ONLY construction — figure-ground was deleted at T4.
  // M1/M2: LU faces + treelawn are grouped per land-use
  // class so each paints its block's colour. Each band is annular (CW holes)
  // → asPolygonWithHoles=true; yLift stacks them under the PRI order.
  // ── THE WALL · Phase D — Section OPENS the frozen Survey shape ──────────
  // The Measure/Section tab renders the ground from the bake's frozen
  // `shape.json` artifact (the `_shapeArtifact` Survey froze), NOT from a live
  // re-run of the Survey build. Fetched once per scene when the tool first
  // activates; `sectionOpen` (chain-free signature — artifact + design params
  // only) composes block/curb/asphalt off the frozen iA and the ped FILL via
  // sectionPass. Note what this is: the freeze→open MECHANISM (WALL.md §4) —
  // the §5(b) "correct data" half stays gated on the prebake cure; this view
  // shows the shape exactly as frozen, defects included.
  const bakeLastMs = useCartographStore(s => s.bakeLastMs)
  const shapeFrozenMs = useCartographStore(s => s.shapeFrozenMs)
  const freezeShape = useCartographStore(s => s.freezeShape)
  const [frozenShape, setFrozenShape] = useState(null)
  // TRUE while the frozen-shape fetch for the current (scene, freeze) is in
  // flight. ⛔ Load-bearing: without it the live build RACES the fetch. Both
  // `frozenShape` and `sectionGeos` are null until shape.json resolves, so
  // `tileGeos` fell straight through to a full buildTileGround — 27.5 s on
  // Altadena, and it ran THREE times, every run discarded the instant the freeze
  // landed. The live build is the fallback for "there IS no freeze", never for
  // "the freeze hasn't arrived yet". Seeded true so the very first render (before
  // this effect fires) can't slip through. (Found in the browser console
  // 2026-07-15 — an async race is invisible to a Node harness; the ~80 s it cost
  // was the bulk of DESIGNER-LOAD-FORENSIC.md's unattributed "gray screen".)
  const [frozenPending, setFrozenPending] = useState(() => !surveyActive && !!scene)
  const frozenKeyRef = useRef(null)
  useEffect(() => {
    // Any NON-Survey view consumes the frozen shape — Measure/Section AND the
    // neutral "Design" view (tool===null). Only Survey live-strokes (it edits
    // the SHAPE). This kills the "geometry redraws when not active" perf leak:
    // in Design the heavy live buildTileGround no longer runs to merely display
    // the map; it reads the frozen shape.json (the idle-case slice of the
    // freeze-curb program, HANDOFF-freeze-the-curb-in-the-first-bake.md Phase 1b).
    if (surveyActive || !scene) { setFrozenPending(false); return }
    // One fetch per (scene, freeze): a fresh slab bake (bakeLastMs) OR the
    // light Survey-exit freeze (shapeFrozenMs) re-opens the new shape; take
    // whichever is newer as the cache-bust + key.
    const freezeTag = Math.max(bakeLastMs || 0, shapeFrozenMs || 0)
    const key = `${scene}|${freezeTag}`
    if (frozenKeyRef.current === key) return
    frozenKeyRef.current = key
    setFrozenPending(true)
    let dead = false, done = false
    // [LOAD-FORENSIC 2026-07-14] shape.json is ~8 MB for a CDP-sized hood — this
    // fetch+parse is a prime suspect for the 60s of gray before anything draws.
    console.time(`[LOAD] shape.json fetch+parse (${scene})`)
    fetch(`${import.meta.env.BASE_URL}baked/${scene}/shape.json${freezeTag ? `?t=${freezeTag}` : ''}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        console.timeEnd(`[LOAD] shape.json fetch+parse (${scene})`)
        done = true
        if (dead) return
        // [G1] New shape.json form is { tiles, highway }; legacy was a bare tiles
        // array (no highway). Normalize to { tiles, highway } so the frozen path
        // always knows the grade-sep group (empty for legacy freezes).
        const tiles = Array.isArray(d) ? d : (Array.isArray(d?.tiles) ? d.tiles : null)
        const highway = Array.isArray(d) ? [] : (Array.isArray(d?.highway) ? d.highway : [])
        setFrozenPending(false)
        setFrozenShape(tiles && tiles.length ? { tiles, highway } : null)
      })
      .catch(e => { done = true; console.warn('[BlockGeometryV2Debug] no frozen shape artifact (Section falls back to live build):', e); if (!dead) { setFrozenPending(false); setFrozenShape(null) } })
    // Abort mid-flight (tool flipped / re-mount): clear the key so the next
    // activation refetches instead of silently falling back to the live build.
    return () => { dead = true; if (!done && frozenKeyRef.current === key) { frozenKeyRef.current = null; setFrozenPending(false) } }
  }, [surveyActive, scene, bakeLastMs, shapeFrozenMs])
  // Frozen whenever NOT surveying (Measure + neutral Design), if a freeze exists;
  // no freeze yet (fresh scene) → falls through to the live build below.
  const sectionFrozen = !surveyActive && !!frozenShape
  // ⛔ THE ONE RULE for the live build: outside Survey, the frozen artifact OWNS
  // the render — from the moment we know a freeze is coming until sectionGeos
  // exists. "Not ready yet" is NOT an invitation for buildTileGround.
  //
  // This has now bitten twice, from two different directions, because tileGeos
  // gated on sectionGeos' OUTPUT rather than on intent — so every new reason
  // sectionGeos can return null silently reopens the race:
  //   1. shape.json in flight              → frozenPending  (fixed 72bbc989)
  //   2. stencil / design not yet hydrated → the readiness gates (59e5f109 —
  //      which fixed sectionGeos and promptly reopened this, ~27s of discarded
  //      buildTileGround, observed 2026-07-15)
  // Naming the condition once, here, is what stops a third. The live build is
  // legitimate ONLY when: we're surveying, there is genuinely no freeze, or
  // sectionOpen actually failed.
  const frozenNotReady = !surveyActive && (
    frozenPending ||                                       // freeze in flight
    (!!frozenShape && (!stencil || !designHydrated))       // freeze here, its inputs aren't
  )
  // [Section perf #1] Block-local FILL cache. sectionOpen memoizes each tile's
  // rings keyed by (cw, stripMat, the tile's own blockCustoms slice), so a FILL
  // drag — which writes a fresh blockCustoms object every frame — only recomputes
  // the edited tile, not all 101. Lives in a ref so it survives the memo re-run;
  // reset when the frozen artifact changes (tile indices change). (HANDOFF-section-perf.md #1.)
  const sectionCacheRef = useRef({ shape: null, map: new Map() })
  // [LOAD-FORENSIC 2026-07-15] throwaway — the 19.8s task's tail.
  const __composeDoneRef = useRef(0)
  const __composeVertsRef = useRef(0)
  // [LOAD-FORENSIC 2026-07-15] throwaway. sectionGeos ran FOUR times on an Altadena
  // load (~17s each = ~69s, which is the whole load). Each async arrival invalidates
  // the memo. Name the culprit instead of guessing: log WHICH dep changed identity.
  const __depsRef = useRef(null)
  const __whyRerun = () => {
    const cur = { sectionFrozen, frozenShape, curbWidth, stencil, blockCustoms, selSkel, designHydrated }
    const prev = __depsRef.current
    __depsRef.current = cur
    if (!prev) return 'FIRST RUN'
    const changed = Object.keys(cur).filter(k => cur[k] !== prev[k])
    return changed.length
      ? changed.map(k => `${k}(${prev[k] === undefined ? 'undef' : prev[k] === null ? 'null' : 'set'}→${cur[k] === undefined ? 'undef' : cur[k] === null ? 'null' : 'set'})`).join(' ')
      : '(no dep changed?!)'
  }
  // The selected chain's skelId — the ONLY thing sectionGeos wants from
  // liveStreets. Hoisted out so the heavy memo depends on this STRING, not on the
  // streets array's identity: a store write that re-creates centerlineData with
  // nothing selected used to force a full ~17s rebuild for a value that could not
  // change ("trigger: liveStreets(set→set)", 2026-07-15 console).
  const selSkel = useMemo(
    () => (selectedStreet != null ? (liveStreets?.[selectedStreet]?.id ?? null) : null),
    [selectedStreet, liveStreets]
  )
  const sectionGeos = useMemo(() => {
    if (!sectionFrozen) return null
    // ⛔ Don't build before the inputs that DEFINE the geometry have landed. Same
    // disease as the buildTileGround race, one layer up: frozenShape arrives off
    // vite static in ~360ms, but `stencil` (the fetched boundary) and the design
    // (curbWidth / blockCustoms) come off the API server much later. Building in
    // between doesn't just waste ~17s — it builds the WRONG map (unclipped, with
    // default curbWidth and no customs) and then throws it away. The 2026-07-15
    // console showed four builds, ~70s total, of which only the last was correct.
    // Both gates are load-only: once landed they stay landed, and a genuine edit
    // to curbWidth/blockCustoms still rebuilds normally.
    if (!stencil) return null
    if (!designHydrated) return null
    if (sectionCacheRef.current.shape !== frozenShape) sectionCacheRef.current = { shape: frozenShape, map: new Map() }
    // [Section translucency] Selected-corridor tiles = those whose runs front the
    // selected street (its skelId) → the selected block + the across-street
    // neighbour. Rendered translucent below so the hi-res aerial reads through.
    // Identity-only (skelId), no chain geometry — the wall holds.
    let selSet = null
    if (selSkel) {
      selSet = new Set()
      frozenShape.tiles.forEach((t, i) => { if ((t.runs || []).some(r => r.skelId === selSkel)) selSet.add(i) })
      if (!selSet.size) selSet = null
    }
    // ⛔ wall: the SHAPE stays frozen — every vertex of geometry comes from the
    // fetched silhouette (frozenShape). blockCustoms is passed for MATERIAL routing
    // ONLY (the per-edge LU↔SW override, keyed by the frozen run identity — design
    // intent, not chain geometry; it cannot move a vertex). liveRibbons / streets
    // stay absent. So the FILL re-strokes live off the frozen curb when you swap a
    // strip, while the curb sits still — SECTION.md §4.
    let sg
    // [LOAD-FORENSIC 2026-07-14] see the note at buildBlockGeometryV2 above.
    console.log(`[LOAD] ▶ sectionGeos rebuilding — trigger: ${__whyRerun()}`)
    console.time(`[LOAD] sectionOpen (${frozenShape.tiles.length} tiles)`)
    try { sg = sectionOpen(frozenShape.tiles, curbWidth, { outer: 'LU', inner: 'SW' }, stencil, blockCustoms, sectionCacheRef.current.map, selSet) }
    catch (e) { console.error('[BlockGeometryV2Debug] sectionOpen failed:', e); return null }
    finally { console.timeEnd(`[LOAD] sectionOpen (${frozenShape.tiles.length} tiles)`) }
    // [LOAD-FORENSIC 2026-07-15] The 19.8s frozen-shape task = sectionOpen (timed
    // above, 7.5s) + ~12s that NOTHING timed. This is that gap: the ringsToFlatGeo
    // triangulation tail. Per-layer so we know WHICH layer, and vert counts because
    // the GPU upload after this scales with them, not with wall time. Throwaway.
    const __t = {}
    let __verts = 0
    const __time = (label, fn) => {
      const t0 = performance.now()
      const geo = fn()
      __t[label] = +(performance.now() - t0).toFixed(0)
      const arr = Array.isArray(geo) ? geo : [geo]
      for (const g of arr) {
        const gg = g?.geo || g
        __verts += gg?.attributes?.position?.count || 0
      }
      return geo
    }
    const perLu = (byLu, yLift) => Object.entries(byLu)
      .map(([lu, rings]) => ({ lu, geo: ringsToFlatGeo(rings, yLift, true) }))
      .filter(e => e.geo)
    const __t0all = performance.now()
    const __out = {
      lu:       __time('lu',       () => perLu(sg.luByClass,    0.010)),
      treelawn: __time('treelawn', () => perLu(sg.treelawnByLu, 0.020)),
      sidewalk: __time('sidewalk', () => ringsToFlatGeo(sg.sidewalk, 0.030, true)),
      curb:     __time('curb',     () => ringsToFlatGeo(sg.curb,     0.035, true)),
      asphalt:  __time('asphalt',  () => ringsToFlatGeo(sg.asphalt,  0.040, true)),
      highway:  __time('highway',  () => ringsToFlatGeo(frozenShape.highway, 0.015, true)),   // G1 — frozen grade-sep highways (sibling group, not tile-derived)
      block:    __time('block',    () => ringsToFlatGeo(sg.block, 0.008, true)),   // frozen block silhouette, under the LU paint
      blockRings: sg.block,   // raw iA rings — handle anchoring (one geometry truth)
      curbRings: sg.curb || [],
      sidewalkRings: sg.sidewalk || [],
      treelawnRings: Object.values(sg.treelawnByLu || {}).flat(),
      parkRings: (sg.luByClass && sg.luByClass.park) || [],
      // The selected corridor (selected block + neighbours), composed separately so
      // the render branch paints it translucent (opacity 0.55 → the aerial reads
      // through). null when nothing is selected. Same yLifts as the opaque set —
      // disjoint tiles, so no z-fight.
      selected: sg.selected && __time('selected', () => ({
        lu:       perLu(sg.selected.luByClass,    0.010),
        treelawn: perLu(sg.selected.treelawnByLu, 0.020),
        sidewalk: ringsToFlatGeo(sg.selected.sidewalk, 0.030, true),
        curb:     ringsToFlatGeo(sg.selected.curb,     0.035, true),
        asphalt:  ringsToFlatGeo(sg.selected.asphalt,  0.040, true),
        block:    ringsToFlatGeo(sg.selected.block,    0.008, true),
      })),
    }
    // [LOAD-FORENSIC 2026-07-15] throwaway
    const __all = +(performance.now() - __t0all).toFixed(0)
    console.log(`[LOAD] sectionGeos compose (ringsToFlatGeo): ${__all} ms · ${(__verts / 1000).toFixed(0)}k verts — by layer:`,
      Object.fromEntries(Object.entries(__t).sort((a, b) => b[1] - a[1])))
    __composeDoneRef.current = performance.now()
    __composeVertsRef.current = __verts
    return __out
  }, [sectionFrozen, frozenShape, curbWidth, stencil, blockCustoms, selSkel, designHydrated])

  // [LOAD-FORENSIC 2026-07-15] throwaway — closes the 19.8s task's accounting.
  // sectionOpen + compose are timed inside the memo; this catches the two stages
  // AFTER it returns: React's commit, and the first drawn frame (when three.js
  // actually uploads the BufferGeometries to the GPU — it's lazy, at draw time,
  // so the upload cost lands on the frame, not the memo).
  useLayoutEffect(() => {
    if (!sectionGeos || !__composeDoneRef.current) return
    const t = performance.now()
    console.log(`[LOAD] compose → React commit: ${(t - __composeDoneRef.current).toFixed(0)} ms`)
    requestAnimationFrame(() => {
      console.log(`[LOAD] commit → first frame drawn (GPU upload of ${(__composeVertsRef.current / 1000).toFixed(0)}k verts): ${(performance.now() - t).toFixed(0)} ms`)
    })
  }, [sectionGeos])

  const tileGeos = useMemo(() => {
    if (!liveRibbons) return null
    // The frozen path is going to render this — don't duplicate its work. See
    // frozenNotReady: this covers "in flight" AND "waiting on stencil/design".
    if (frozenNotReady) return null
    // Frozen path already produced geometry → nothing to do. (Still gated on the
    // OUTPUT here, deliberately: if sectionOpen actually THREW, sectionGeos is
    // null with frozenNotReady false, and the live build is the visible fallback.)
    if (sectionGeos) return null
    let tg
    try { tg = buildTileGround(liveRibbons, { stencil, curbWidth, smooth: streetSmooth, blockLandUse, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, blockCustoms, emitArtifact: true }) }
    catch (e) { console.error('[BlockGeometryV2Debug] tile build failed:', e); return null }
    const perLu = (byLu, yLift) => Object.entries(byLu)
      .map(([lu, rings]) => ({ lu, geo: ringsToFlatGeo(rings, yLift, true) }))
      .filter(e => e.geo)
    return {
      lu:       perLu(tg.luByClass,    0.010),
      treelawn: perLu(tg.treelawnByLu, 0.020),
      sidewalk: ringsToFlatGeo(tg.sidewalk, 0.030, true),
      curb:     ringsToFlatGeo(tg.curb,     0.035, true),
      curbOutline: ringsToEdgeGeo(tg.curb,  0.050),   // Survey wireframe stroke
      asphalt:  ringsToFlatGeo(tg.asphalt,  0.040, true),
      highway:  ringsToFlatGeo(tg.highway,  0.015, true),   // above LU faces, below the ribbon network — grade-sep shows in its corridor, occluded by local roads
      highwayRings: tg.highway || [],   // G1 — raw grade-sep rings, frozen alongside the tiles so non-Survey views + slab restore highways
      block:    ringsToFlatGeo(tg.block,    0.010, true),   // Survey block-polygon fill
      blockRings: tg.block,   // raw iA rings — handle anchoring (one geometry truth)
      // Raw band rings for the path-ribbon parcel clip (mirrors bake-ground's
      // buildTileBakeShape): paths clip to block − curb − treelawn − sidewalk,
      // park excluded. Exposed off the TILE geometry so the Designer's path clip
      // matches the slab and doesn't depend on the dead figure-ground V2 path.
      curbRings: tg.curb || [],
      sidewalkRings: tg.sidewalk || [],
      treelawnRings: Object.values(tg.treelawnByLu || {}).flat(),
      parkRings: (tg.luByClass && tg.luByClass.park) || [],
      cornerFillets: tg.cornerFillets || {},
      cornerSet: tg.cornerSet || [],   // T3 — the injective corner set the handle rides
      _shapeArtifact: tg._shapeArtifact,   // the frozen-shape candidate — autosaved on Survey-exit
    }
  }, [liveRibbons, sectionGeos, frozenNotReady, stencil, curbWidth, streetSmooth, blockLandUse, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, blockCustoms])

  // ── Autosave the SHAPE freeze on Survey-exit (the Data Wall, made invisible) ──
  // While in Survey, keep the latest live `_shapeArtifact` (exactly what the
  // operator sees). When they LEAVE Survey — the deliberate "this shape is done,
  // now I'll do the FILL" moment, their eye just on it (WALL.md §5b) — persist it
  // so Section opens the current, eye-gated curb. No manual bake, no per-edit
  // churn: a discrete freeze at the boundary keeps Section's substrate stable
  // ("autosave on exit"). Going to Stage re-freezes via the full bake instead.
  const latestShapeArtifactRef = useRef(null)
  useEffect(() => {
    const art = tileGeos?._shapeArtifact
    // [G1] Freeze the per-tile shape AND the top-level grade-sep highway rings
    // as a sibling group ({ tiles, highway }) — highways aren't tile-shaped, so
    // they can't ride a tile, and the bare-array artifact dropped them from every
    // non-Survey view (regression 4924d9a). Now Section/Design restore them.
    if (surveyActive && art && art.length) {
      latestShapeArtifactRef.current = { tiles: art, highway: tileGeos.highwayRings || [] }
    }
  }, [surveyActive, tileGeos])
  const wasSurveyRef = useRef(surveyActive)
  const frozenSigRef = useRef(null)
  useEffect(() => {
    if (wasSurveyRef.current && !surveyActive && latestShapeArtifactRef.current) {
      // DIRTY-GATE the freeze: only re-freeze when the SHAPE actually changed
      // since the last freeze. An unconditional re-freeze bumps shapeFrozenMs,
      // which re-fetches shape.json → a fresh frozenShape object → resets the
      // block-local FILL cache (sectionCacheRef) → a full sectionOpen over all
      // 101 tiles on Section entry. So toggling Survey↔Section↔Design with ZERO
      // edits paid a whole-map recompute every time. Skipping the no-op freeze
      // keeps frozenShape reference-stable, so the cache survives and the toggle
      // is a FREE HOP (vs the deliberate bake STONE). The signature is a one-time
      // stringify on exit — cheap vs the POST + recompute it saves; it errs
      // toward re-freezing (a changed shape never matches), never drops an edit.
      const sig = JSON.stringify(latestShapeArtifactRef.current)
      if (sig !== frozenSigRef.current) {
        frozenSigRef.current = sig
        freezeShape(latestShapeArtifactRef.current)
      }
    }
    wasSurveyRef.current = surveyActive
  }, [surveyActive, freezeShape])

  // Publish the achieved per-corner fillets so CornerEditHandles draws the REAL
  // curb arc (one corner truth — the handle reads geometry, never re-derives).
  // Publish the frozen curb (iA) rings so MeasureOverlay anchors handles to the
  // SAME geometry the FILL strokes (Plumb forensic: "one geometry truth").
  const setSectionCurbRings = useCartographStore(s => s.setSectionCurbRings)
  useEffect(() => {
    // Curb (iA) rings from whichever FILL path actually renders — frozen Section
    // (sectionGeos) OR the live tile build (tileGeos) — so handle anchoring works
    // regardless of mode, not only when the frozen artifact is loaded.
    const rings = sectionGeos?.blockRings?.length ? sectionGeos.blockRings
      : tileGeos?.blockRings?.length ? tileGeos.blockRings
      : []
    setSectionCurbRings(rings)
  }, [sectionGeos, tileGeos, setSectionCurbRings])
  const setTileCornerFillets = useCartographStore(s => s.setTileCornerFillets)
  useEffect(() => {
    setTileCornerFillets(tileGeos?.cornerFillets || {})
  }, [tileGeos, setTileCornerFillets])
  // Publish the injective corner SET so CornerEditHandles sources its corner LIST
  // from the corners actually drawn (the tile graph), not legacy ribbons.intersections.
  const setTileCorners = useCartographStore(s => s.setTileCorners)
  useEffect(() => {
    setTileCorners(tileGeos?.cornerSet || [])
  }, [tileGeos, setTileCorners])

  // Phase 2.1: per-corner outer-face asphalt fill. Per-chain rectangles
  // have square ends at IXs; the fillet residual against asphaltRounded
  // is attributed to corner records (via centroid-match) and pushed
  // onto each arc-span frontageBand entry's `asphaltRings` field, with
  // unattributed orphans collected in cornerOrphanAsphalt. Both render
  // as asphalt material. asPolygonWithHoles=true on Clipper-output
  // rings so CW holes pair with CCW outers cleanly.
  // T4 (2026-07-15): the figure-ground live-drag overlay (liveSelectedRings /
  // buildChainBandsLive) and the per-chain band meshes (perChainGeo,
  // frontageByChain, treelawnByLuGeo) lived here. All deleted with the emitter —
  // the tile path renders selection natively via sectionGeos.selected.

  // Per-LU treelawn aggregation for non-selected chains. Each fe is
  // attributed to its adjacent parcel via a coordinate probe (same logic
  // as bake-ground.js's bake-side split), then bucketed by that LU.
  // Selected-chain treelawn is excluded here and rendered separately by
  // the per-chain path so the live drag preserves its translucent
  // material. Result: ~10 per-LU meshes instead of ~80 per-chain meshes
  // — net draw-count REDUCTION while landing the per-parcel coloring.


  // D.3c keeps cornerSidewalkPads mounted as the corner concrete; no
  // frontageCaps mesh is mounted (extendCorners=false default leaves
  // frontageCaps empty anyway). The hook below stays as a no-op so the
  // mesh slot exists if extendCorners is ever enabled.


  // Composite array kept for downstream code that still expects a flat
  // perChainGeo list. Selected chain's geo (if any) tacked on at end.

  // Stripe edges — opaque strokes drawn on the SELECTED chain only when
  // Measure is active. They mark where boundary handles attach. The
  // asphalt|curb and curb|treelawn boundaries don't need strokes — the
  // curb stripe IS the stroke between asphalt and treelawn. The two
  // strokes that DO render: treelawn outer (colored treelawn-green) and
  // sidewalk outer (colored sidewalk-white).
  // Selected chain's edge strokes come exclusively from `liveSelectedRings`
  // (D.7c). The pre-D.7d byChain.{tl,sw}Edges fallback was redundant —
  // liveSelectedRings is always built whenever a chain is selected, with
  // identical edge polylines.
  // Asphalt outer-edge stroke — curb-colored line at the asphalt|curb
  // boundary on the selected chain. The curb mesh itself is hidden during
  // selection (its silhouette is stale relative to the live overlay), but
  // the operator still needs a precise asphalt-boundary line to align
  // against the aerial during a drag. Mirrors the treelawn/sidewalk
  // outer-edge strokes.

  // Materials. We mount ~700+ per-chain meshes on LS (242 chains × 3
  // bands + corner geometries), and `makeMaterial(...)` allocates a new
  // THREE.Material every call. Calling it inline per mesh per render
  // (the previous V1-style pattern) is what made Designer sluggish — at
  // LS scale that's hundreds of new materials and uniform uploads every
  // frame. Cache one material per (band, selected) pair and reuse them
  // across all chains. Two materials per band — one normal, one
  // selectedCorridor (opacity 0.55 in Measure) — lets us do an O(1) ref
  // lookup per chain instead of O(N) allocations per render.
  const bandMats = useMemo(() => ({
    asphalt:           makeMaterial(asphaltCol,  PRI.asphalt,  bandFade, { measureActive, surveyActive, editing: surveyEditing }),
    asphaltSelected:   makeMaterial(asphaltCol,  PRI.asphalt,  bandFade, { measureActive, surveyActive, selectedCorridor: true }),
    highway:           makeMaterial(highwayCol,  PRI.asphalt,  bandFade, { measureActive, surveyActive, editing: surveyEditing }),
    treelawn:          makeMaterial(treelawnCol, PRI.treelawn, bandFade, { measureActive, surveyActive, editing: surveyEditing }),
    treelawnSelected:  makeMaterial(treelawnCol, PRI.treelawn, bandFade, { measureActive, surveyActive, selectedCorridor: true }),
    // Per-LU treelawn materials — opaque variants keyed by LU so each
    // non-selected treelawn mesh paints in its adjacent parcel's color.
    // Selected-chain treelawn still uses `treelawnSelected` (translucent
    // during Measure drag) regardless of LU.
    treelawnByLu: new Map((function buildLuMats() {
      const out = []
      const luSet = new Set([
        ...Object.keys(luColors || {}),
        ...Object.keys(DEFAULT_LU_COLORS),
      ])
      for (const lu of luSet) {
        const color = (luColors && luColors[lu]) || DEFAULT_LU_COLORS[lu] || treelawnCol
        out.push([lu, makeMaterial(color, PRI.treelawn, bandFade, { measureActive, surveyActive, editing: surveyEditing })])
      }
      return out
    })()),
    sidewalk:          makeMaterial(sidewalkCol, PRI.sidewalk, bandFade, { measureActive, surveyActive, editing: surveyEditing }),
    sidewalkSelected:  makeMaterial(sidewalkCol, PRI.sidewalk, bandFade, { measureActive, surveyActive, selectedCorridor: true }),
    // Curb is the silhouette STROKE — stays solid even while editing so the
    // hardscape outline reads against the translucent fills (Jacob's "solid
    // strokes"). No `editing` flag.
    curb:              makeMaterial(curbCol,     PRI.curb,     bandFade, { measureActive, surveyActive }),
    cornerSidewalk:    makeMaterial(sidewalkCol, PRI.residential + 0.5, bandFade, { surveyActive, editing: surveyEditing }),
    cornerAsphalt:     makeMaterial(asphaltCol,  PRI.asphalt,  bandFade, { surveyActive, editing: surveyEditing }),
    // Median — a grass face between paired carriageways. Colored from
    // layerColors['median'] (the slab's source, not luColors) so the panel's
    // Median color edit previews live; faceFade + PRI.residential to sit with
    // the LU faces it lives among.
    median:            makeMaterial(medianCol,   PRI.residential, faceFade, { measureActive, surveyActive, editing: surveyEditing }),
  }), [makeMaterial, asphaltCol, highwayCol, medianCol, treelawnCol, sidewalkCol, curbCol, luColors, measureActive, surveyActive, surveyEditing, bandFade, faceFade])

  // Non-street ribbons (alley/footway/cycleway/steps/path). Pavement-only
  // strips buffered from each ribbon's pavedWidth via the shared helper
  // bake-ground.js also consumes. We want paths clipped to PARCEL
  // interiors — stop at the sidewalk's inner edge, no trespass on the
  // ped zone OR curb. block.ring extends all the way to the asphalt
  // edge (curb stroke + ped-zone bands paint on top), so
  //   parcelInteriors = block.ring − curbBands − (treelawn ∪ sidewalk).
  // Y-lift 0.05 sits paths above asphalt (0.04) — Designer stacks
  // ground layers by tiny Y increments.
  const parcelInteriors = useMemo(() => {
    // The TILE geometry (tileGeos live, or sectionGeos when frozen) is the ONE
    // construction — the Designer's path clip matches bake-ground's
    // buildTileBakeShape exactly. The old figure-ground fallback (blocks /
    // curbBands / frontageBands) was deleted at T4; it was unreachable, since
    // one of tileGeos/sectionGeos is always present.
    const tg = tileGeos || sectionGeos
    if (!tg?.blockRings?.length) return []
    const blockRings = tg.blockRings.filter(r => r?.length >= 3)
    const subtract = []
    for (const r of (tg.curbRings || [])) if (r?.length >= 3) subtract.push(r)
    for (const r of (tg.treelawnRings || [])) if (r?.length >= 3) subtract.push(r)
    for (const r of (tg.sidewalkRings || [])) if (r?.length >= 3) subtract.push(r)
    for (const r of (tg.parkRings || [])) if (r?.length >= 3) subtract.push(r)
    if (!blockRings.length) return []
    if (!subtract.length) return blockRings
    // [LOAD-FORENSIC 2026-07-15] throwaway. One Clipper diff, N block rings minus
    // EVERY curb/treelawn/sidewalk/park ring. Prime suspect for the 9s that sits
    // between "compose done" and "React commit" — it runs after sectionGeos in the
    // same render, and nothing timed it.
    const __t0 = performance.now()
    const __r = differenceRings(blockRings, subtract)
    console.log(`[LOAD] parcelInteriors (${blockRings.length} blocks − ${subtract.length} rings): ${(performance.now() - __t0).toFixed(0)} ms`)
    return __r
  }, [tileGeos, sectionGeos])
  const pathGeoByKind = useMemo(() => {
    // [LOAD-FORENSIC 2026-07-15] throwaway — the other half of the untimed 9s.
    const __t0 = performance.now()
    const ringsByKind = buildPathRibbons(liveRibbons, { intersect: parcelInteriors, alleyCap })
    const __tRib = performance.now()
    const out = {}
    for (const [kind, rings] of ringsByKind) {
      const geo = ringsToFlatGeo(rings, 0.05, true)
      if (geo) out[kind] = geo
    }
    console.log(`[LOAD] pathGeoByKind: ${(performance.now() - __t0).toFixed(0)} ms (buildPathRibbons ${(__tRib - __t0).toFixed(0)} ms + triangulate ${(performance.now() - __tRib).toFixed(0)} ms)`)
    return out
  }, [liveRibbons, parcelInteriors, alleyCap])
  // Per-kind materials. PRI.asphalt + 1 sits these above asphalt + curb
  // but below paint/barriers, matching bake-ground.js's PAINT_ORDER slot
  // for paths.
  const PATH_KINDS = ['alley', 'footway', 'cycleway', 'steps', 'path']
  const pathMats = useMemo(() => {
    const out = {}
    for (const kind of PATH_KINDS) {
      const col = colorFor(kind)
      out[kind] = makeMaterial(col, PRI.asphalt + 1, bandFade, { measureActive, surveyActive })
    }
    return out
    // colorFor depends on layerColors + DEFAULT_LAYER_COLORS via closure;
    // re-derive when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeMaterial, layerColors, measureActive, surveyActive, bandFade])
  const PATH_VISIBLE = {
    alley: alleyVisible, footway: footwayVisible, cycleway: cyclewayVisible,
    steps: stepsVisible, path: pathVisible,
  }
  // Park footpaths (gravel) — the LAND park paths from the SAME shared builder
  // the bake uses (buildParkPathRings), clipped to the park polygon, so the 2D
  // Designer shows them too and they gate off the `park_path` toggle. Flat
  // gravel colour in 2D (the 3D render uses the Voronoi shader).
  const parkPathGeo = useMemo(() => {
    const { land } = buildParkPathRings(liveRibbons, { polygon: parkPolygon, water: parkWaterData })
    const rings = mergeRings(land)
    return rings.length ? ringsToFlatGeo(rings, 0.05, true) : null
  }, [liveRibbons])
  const parkPathMat = useMemo(
    () => makeMaterial(colorFor('park_path'), PRI.asphalt + 1, bandFade, { measureActive, surveyActive }),
    // colorFor closes over layerColors + DEFAULT_LAYER_COLORS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [makeMaterial, layerColors, measureActive, surveyActive, bandFade]
  )
  // Park steps render as 3D staircases in the runtime; in the top-down 2D view
  // they read as flat footprints (same shared builder), in the steps colour,
  // gated off the same `steps` toggle.
  const parkStepsGeo = useMemo(() => {
    const { stepRings } = buildParkPathRings(liveRibbons, { polygon: parkPolygon, water: parkWaterData })
    const rings = mergeRings(stepRings)
    return rings.length ? ringsToFlatGeo(rings, 0.05, true) : null
  }, [liveRibbons])
  // LU block-fill materials cached per (lu, selected) key. Selected
  // adjacent blocks route through the `selectedCorridor` variant so the
  // parcel translucency matches the chain's band translucency (0.55 in
  // Measure). Same N→1 caching win as before; ~10 LU × 2 selected-states.

  // Per-LU face materials for the tile land-use regions (M1) — one cached
  // material per class, painted in its per-Look colour.
  const tileLuMats = useMemo(() => {
    const out = new Map()
    const luSet = new Set([...Object.keys(luColors || {}), ...Object.keys(DEFAULT_LU_COLORS)])
    for (const lu of luSet) {
      const col = (luColors && luColors[lu]) || DEFAULT_LU_COLORS[lu] || DEFAULT_LU_COLORS.residential
      out.set(lu, makeMaterial(col, PRI.residential, faceFade, { measureActive, surveyActive, editing: surveyEditing }))
    }
    return out
  }, [makeMaterial, luColors, faceFade, measureActive, surveyActive, surveyEditing])
  const tileLuFallback = tileLuMats.get('residential')
  // Translucent per-LU variants for the SELECTED corridor in Section (opacity
  // 0.55 → the hi-res aerial reads through while authoring against it). Mirrors
  // tileLuMats with selectedCorridor:true. Band layers (treelawn/sidewalk/
  // asphalt) reuse the existing bandMats.*Selected; curb stays solid.
  const tileLuMatsSelected = useMemo(() => {
    const out = new Map()
    const luSet = new Set([...Object.keys(luColors || {}), ...Object.keys(DEFAULT_LU_COLORS)])
    for (const lu of luSet) {
      const col = (luColors && luColors[lu]) || DEFAULT_LU_COLORS[lu] || DEFAULT_LU_COLORS.residential
      out.set(lu, makeMaterial(col, PRI.residential, faceFade, { measureActive, surveyActive, selectedCorridor: true }))
    }
    return out
  }, [makeMaterial, luColors, faceFade, measureActive, surveyActive])
  const tileLuFallbackSelected = tileLuMatsSelected.get('residential')
  const medianSelected = useMemo(
    () => makeMaterial(medianCol, PRI.residential, faceFade, { measureActive, surveyActive, selectedCorridor: true }),
    [makeMaterial, medianCol, faceFade, measureActive, surveyActive])
  const tlLuFallback = bandMats.treelawn

  // ── Survey wireframe (tool === 'surveyor') ──────────────────────────────
  // Survey shows the skeleton + hardscape boundary only — no ped/LU fill (that
  // is Section's domain). Curb as an outline, IXs as node markers, both blue, so
  // skeleton-vs-ribbon problems are visually separable ("is this chains again?").
  const surveyIxGeo = useMemo(
    () => (surveyActive ? ixMarkersGeo(liveRibbons?.intersections) : null),
    [surveyActive, liveRibbons]
  )
  const surveyCurbMat = useMemo(() => new THREE.LineBasicMaterial({
    color: SURVEY_BLUE.curb, transparent: true, opacity: 0.95, depthWrite: false,
  }), [])
  // The curb band filled a touch darker than the block — it's the 'handle rail',
  // where the corner-rounding controls live, so it reads slightly proud of the
  // block interior.
  const surveyCurbFillMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: SURVEY_BLUE.curbFill, transparent: true, opacity: 0.55, depthWrite: false,
  }), [])
  const surveyIxMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: SURVEY_BLUE.ix, transparent: true, opacity: 0.9, depthWrite: false,
  }), [])
  // The blocks / land-use spaces, filled translucent so their boundaries read
  // while the aerial shows through. One flat blue for all of them — per-LU
  // colour is Section's concern; Survey only memorializes the boundaries.
  const surveyBlockMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: SURVEY_BLUE.block, transparent: true, opacity: 0.30, depthWrite: false,
  }), [])

  // Every scene renders the tile construction. The figure-ground meshes were
  // deleted at T4 (2026-07-15) along with the isTileScene flag that had been
  // pinned true since the LS cutover — see RIBBONS.md §1.
  // M1/M2: LU faces + treelawn paint per land-use class. Bands reuse the cached
  // materials so colours/toggles match. live == bake (both call buildTileGround).
  // Survey view: this step intakes the skeleton and bakes the block POLYGONS.
  // The strips/bands (treelawn/sidewalk/LU subdivision) aren't in this scene —
  // they're scalars in the artifact, geometry only downstream in Section. So
  // fill the whole block polygon to the curb edge (tg.block = stencil−asphalt),
  // one flat translucent blue, roads as gaps. The curb OUTLINE + IX markers
  // frame the blocks; centerlines come from MapLayers; corner controls from
  // CornerEditHandles (both already Survey-gated). Aerial shows through.
  // ── THE WALL · Phase D — every NON-Survey view (Section/Measure AND the
  // neutral "Design" view) renders this FROZEN artifact. Everything below comes
  // from sectionGeos (shape.json via sectionOpen) — the live tileGeos build is
  // skipped entirely in these modes (its memo returns null), so the render
  // provably cannot reach the chain graph, and idle viewing costs no live
  // buildTileGround. Same band materials as the live view (WYSIWYG, just frozen).
  // [G1] Grade-sep highways NOW freeze as a sibling group in shape.json
  // ({ tiles, highway }) and draw here — the regression where they vanished from
  // Design/Measure (4924d9a routed non-Survey views to the frozen path, which
  // dropped them) is restored. (Perimeter-fill still stays Survey/Stage-only.)
  if (sectionFrozen && sectionGeos) {
    return (
      <group>
        {!hideLandUse && lotVisible && sectionGeos.block && (
          <mesh geometry={sectionGeos.block} renderOrder={PRI.residential} receiveShadow
            material={tileLuFallback} />
        )}
        {!hideLandUse && lotVisible && sectionGeos.lu?.filter(({ lu }) => lu !== 'median' && luVisible(lu)).map(({ lu, geo }) => (
          <mesh key={`flu:${lu}`} geometry={geo} renderOrder={PRI.residential} receiveShadow
            material={tileLuMats.get(lu) || tileLuFallback} />
        ))}
        {/* Median — own toggle (layerVis.median) + own material (layerColors),
            independent of the parcel/lot toggle. */}
        {!hideLandUse && medianVisible && sectionGeos.lu?.filter(({ lu }) => lu === 'median').map(({ geo }, i) => (
          <mesh key={`fmed:${i}`} geometry={geo} renderOrder={PRI.residential} receiveShadow material={bandMats.median} />
        ))}
        {treelawnVisible && sectionGeos.treelawn?.map(({ lu, geo }) => (
          <mesh key={`ftl:${lu}`} geometry={geo} renderOrder={PRI.treelawn} receiveShadow
            material={bandMats.treelawnByLu.get(lu) || tlLuFallback} />
        ))}
        {sidewalkVisible && sectionGeos.sidewalk && (
          <mesh geometry={sectionGeos.sidewalk} renderOrder={PRI.sidewalk} receiveShadow material={bandMats.sidewalk} />
        )}
        {curbVisible && sectionGeos.curb && (
          <mesh geometry={sectionGeos.curb} renderOrder={PRI.curb} receiveShadow material={bandMats.curb} />
        )}
        {asphaltVisible && sectionGeos.asphalt && (
          <mesh geometry={sectionGeos.asphalt} renderOrder={PRI.asphalt} receiveShadow material={bandMats.asphalt} />
        )}
        {/* G1 — grade-sep highways: above LU faces, below the local ribbon network
            (same render order as the live Survey branch), so the freeway shows in
            its corridor and is occluded where local roads cross it. */}
        {highwayVisible && sectionGeos.highway && (
          <mesh geometry={sectionGeos.highway} renderOrder={PRI.residential + 1} receiveShadow material={bandMats.highway} />
        )}
        {PATH_KINDS.map(kind => (
          PATH_VISIBLE[kind] && pathGeoByKind[kind] && (
            <mesh key={`path-${kind}`} geometry={pathGeoByKind[kind]}
              renderOrder={PRI.asphalt + 1} receiveShadow material={pathMats[kind]} />
          )
        ))}
        {parkPathVisible && parkPathGeo && (
          <mesh geometry={parkPathGeo} renderOrder={PRI.asphalt + 1} receiveShadow material={parkPathMat} />
        )}
        {stepsVisible && parkStepsGeo && (
          <mesh geometry={parkStepsGeo} renderOrder={PRI.asphalt + 1} receiveShadow material={pathMats.steps} />
        )}
        {/* [Section translucency] The selected corridor (selected block +
            neighbours) painted translucent (opacity 0.55) so the hi-res aerial
            reads through while you author against it. Disjoint tiles from the
            opaque set above, so they replace — not overlay — those fills. Curb
            stays SOLID (the hardscape outline reads against the translucency). */}
        {sectionGeos.selected && (<>
          {!hideLandUse && lotVisible && sectionGeos.selected.block && (
            <mesh geometry={sectionGeos.selected.block} renderOrder={PRI.residential} receiveShadow material={tileLuFallbackSelected} />
          )}
          {!hideLandUse && lotVisible && sectionGeos.selected.lu?.filter(({ lu }) => lu !== 'median' && luVisible(lu)).map(({ lu, geo }) => (
            <mesh key={`fsel-lu:${lu}`} geometry={geo} renderOrder={PRI.residential} receiveShadow material={tileLuMatsSelected.get(lu) || tileLuFallbackSelected} />
          ))}
          {!hideLandUse && medianVisible && sectionGeos.selected.lu?.filter(({ lu }) => lu === 'median').map(({ geo }, i) => (
            <mesh key={`fsel-med:${i}`} geometry={geo} renderOrder={PRI.residential} receiveShadow material={medianSelected} />
          ))}
          {treelawnVisible && sectionGeos.selected.treelawn?.map(({ lu, geo }) => (
            <mesh key={`fsel-tl:${lu}`} geometry={geo} renderOrder={PRI.treelawn} receiveShadow material={bandMats.treelawnSelected} />
          ))}
          {sidewalkVisible && sectionGeos.selected.sidewalk && (
            <mesh geometry={sectionGeos.selected.sidewalk} renderOrder={PRI.sidewalk} receiveShadow material={bandMats.sidewalkSelected} />
          )}
          {curbVisible && sectionGeos.selected.curb && (
            <mesh geometry={sectionGeos.selected.curb} renderOrder={PRI.curb} receiveShadow material={bandMats.curb} />
          )}
          {asphaltVisible && sectionGeos.selected.asphalt && (
            <mesh geometry={sectionGeos.selected.asphalt} renderOrder={PRI.asphalt} receiveShadow material={bandMats.asphaltSelected} />
          )}
        </>)}
      </group>
    )
  }
  if (surveyActive) {
    return (
      <group>
        {!hideLandUse && lotVisible && tileGeos?.block && (
          <mesh geometry={tileGeos.block} renderOrder={PRI.residential}
            material={surveyBlockMat} />
        )}
        {/* G1 — grade-sep highways show in Survey too (the corridor is part of
            the frozen SHAPE the operator eyes); same material/order as elsewhere. */}
        {highwayVisible && tileGeos?.highway && (
          <mesh geometry={tileGeos.highway} renderOrder={PRI.residential + 1} receiveShadow material={bandMats.highway} />
        )}
        {curbVisible && tileGeos?.curb && (
          <mesh geometry={tileGeos.curb} renderOrder={PRI.sidewalk}
            material={surveyCurbFillMat} />
        )}
        {curbVisible && tileGeos?.curbOutline && (
          <lineSegments geometry={tileGeos.curbOutline} renderOrder={PRI.curb}
            material={surveyCurbMat} />
        )}
        {surveyIxGeo && (
          <mesh geometry={surveyIxGeo} renderOrder={PRI.curb + 1} material={surveyIxMat} />
        )}
      </group>
    )
  }
  return (
    <group>
      {!hideLandUse && lotVisible && tileGeos?.lu?.filter(({ lu }) => lu !== 'median' && luVisible(lu)).map(({ lu, geo }) => (
        <mesh key={`lu:${lu}`} geometry={geo} renderOrder={PRI.residential} receiveShadow
          material={tileLuMats.get(lu) || tileLuFallback} />
      ))}
      {/* Median — own toggle (layerVis.median) + own material (layerColors),
          independent of the parcel/lot toggle. */}
      {!hideLandUse && medianVisible && tileGeos?.lu?.filter(({ lu }) => lu === 'median').map(({ geo }, i) => (
        <mesh key={`med:${i}`} geometry={geo} renderOrder={PRI.residential} receiveShadow material={bandMats.median} />
      ))}
      {treelawnVisible && tileGeos?.treelawn?.map(({ lu, geo }) => (
        <mesh key={`tl:${lu}`} geometry={geo} renderOrder={PRI.treelawn} receiveShadow
          material={bandMats.treelawnByLu.get(lu) || tlLuFallback} />
      ))}
      {sidewalkVisible && tileGeos?.sidewalk && (
        <mesh geometry={tileGeos.sidewalk} renderOrder={PRI.sidewalk} receiveShadow material={bandMats.sidewalk} />
      )}
      {curbVisible && tileGeos?.curb && (
        <mesh geometry={tileGeos.curb} renderOrder={PRI.curb} receiveShadow material={bandMats.curb} />
      )}
      {asphaltVisible && tileGeos?.asphalt && (
        <mesh geometry={tileGeos.asphalt} renderOrder={PRI.asphalt} receiveShadow material={bandMats.asphalt} />
      )}
      {highwayVisible && tileGeos?.highway && (
        <mesh geometry={tileGeos.highway} renderOrder={PRI.residential + 1} receiveShadow material={bandMats.highway} />
      )}
      {/* Non-street ribbons (alley/footway/cycleway/steps/path). These were
          ONLY in the non-tile V2 return below, so on a tile scene (LS) the
          render returned here and never drew them — toggled-on-but-invisible.
          Same geometry the bake emits (buildPathRibbons, tile-clipped). */}
      {PATH_KINDS.map(kind => (
        PATH_VISIBLE[kind] && pathGeoByKind[kind] && (
          <mesh key={`path-${kind}`} geometry={pathGeoByKind[kind]}
            renderOrder={PRI.asphalt + 1} receiveShadow material={pathMats[kind]} />
        )
      ))}
      {parkPathVisible && parkPathGeo && (
        <mesh geometry={parkPathGeo} renderOrder={PRI.asphalt + 1} receiveShadow material={parkPathMat} />
      )}
      {stepsVisible && parkStepsGeo && (
        <mesh geometry={parkStepsGeo} renderOrder={PRI.asphalt + 1} receiveShadow material={pathMats.steps} />
      )}
    </group>
  )
}