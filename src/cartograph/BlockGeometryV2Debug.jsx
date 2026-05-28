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
import { useEffect, useMemo, useState, useRef } from 'react'
import * as THREE from 'three'
import { buildBlockGeometryV2, buildChainBandsLive, resolveChainSegmentation, differenceRings } from '../lib/buildBlockGeometryV2.js'
import { buildPathRibbons } from '../lib/buildPathRibbons.js'
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
// Designer and Stage agree on which LU drives each treelawn ring's
// color. Coordinate-based on purpose — fee.blockKey (pass-1) drifts
// from v2.blocks blockKey (pass-2) when asphalt widens.
function blockLuAtPoint(point, blocks) {
  if (!point || !blocks) return null
  for (const b of blocks) {
    if (!b?.ring || b.ring.length < 3) continue
    if (pointInRing(point, b.ring)) return b.lu || 'unknown'
  }
  return null
}

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

export default function BlockGeometryV2Debug({
  ribbons, stencil = null, flat = true, showCornerDots = false, residentialColor,
  measureActive = false, surveyActive = false, hideLandUse = false,
  useBoundary = false,
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
  const curbWidth                 = useCartographStore(s => s.curbWidth ?? 0.1524)
  const alleyCap                  = useCartographStore(s => s.alleyCap ?? 'square')
  const blockCustoms              = useCartographStore(s => s.blockCustoms)
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
  // Non-street ribbon visibility. Five kinds with one row each in the
  // Stage Surfaces panel; all default-visible. Routed through buildPathRibbons
  // (same helper bake-ground.js consumes), so Designer + slab cannot drift.
  const alleyVisible              = layerVis?.alley     !== false
  const footwayVisible            = layerVis?.footway   !== false
  const cyclewayVisible           = layerVis?.cycleway  !== false
  const stepsVisible              = layerVis?.steps     !== false
  const pathVisible               = layerVis?.path      !== false
  // Highway-class chains route through the `highway` toggle row; everything
  // else through `street` (Asphalt). Same split the bake adapter does
  // — keep both in sync so toggling Highway in Designer matches Stage.
  const HIGHWAY_CLASSES = useMemo(() => new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link']), [])
  const isHighwayChain = (chainIdx) => HIGHWAY_CLASSES.has(liveRibbons?.streets?.[chainIdx]?.highway)
  // Live operator intent — Survey caps, Measure overrides, smooth, anchor.
  // Merged onto the static `ribbons` prop so V2 reflects edits without
  // waiting for a re-bake. Structural data (chain points, IX positions,
  // face rings) still comes from the static artifact.
  const liveStreets               = useCartographStore(s => s.centerlineData?.streets)
  const selectedStreet            = useCartographStore(s => s.selectedStreet)
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
  const curbCol     = colorFor('curb')
  const treelawnCol = colorFor('treelawn')
  const sidewalkCol = colorFor('sidewalk')
  const liveRibbons = useMemo(
    () => mergeLiveRibbons(ribbons, liveStreets),
    [ribbons, liveStreets]
  )
  // Coord-match IX identity per chain. Memoized on liveRibbons so the
  // drag-tick path doesn't re-resolve. Passed into buildChainBandsLive
  // so naturalSegments partitions on the same boundaries the full V2
  // pass uses (otherwise drag-preview bands would snap to different
  // segment edges than the post-drag bake).
  const liveIxByChain = useMemo(
    () => resolveChainSegmentation(liveRibbons?.streets || []),
    [liveRibbons]
  )
  // Translation: selectedStreet (skeleton-order index) → ribbons-order
  // index. -1 if no match. See comment above on the two arrays.
  const selectedRibbonsChainIdx = useMemo(() => {
    if (selectedStreet == null) return -1
    const sel = liveStreets?.[selectedStreet]
    if (!sel) return -1
    const skelId = sel.id
    const name = sel.name
    const streets = liveRibbons?.streets || []
    for (let i = 0; i < streets.length; i++) {
      const s = streets[i]
      if (skelId && s?.skelId === skelId) return i
      if (!skelId && name && s?.name === name) return i
    }
    return -1
  }, [selectedStreet, liveStreets, liveRibbons])
  // V2 input snapshot. While a chain is selected, the operator's drag
  // edits route exclusively through `liveSelectedRings` below — V2 stays
  // frozen at the snapshot taken when the chain was first selected, so
  // the heavy Clipper pass never runs during drag. When selectedStreet
  // changes (deselect or pick a different chain), or any non-blockCustoms
  // input changes (corner overrides, scale, curb width, etc.), we
  // re-snapshot and let V2 rebuild. This makes drag effectively free:
  // the selected chain's bands track handles via the live overlay,
  // everything else stays cached at last V2 output.
  const v2DebounceMs = 250
  const [debouncedInputs, setDebouncedInputs] = useState({
    blockCustoms, cornerRadiusScale,
    cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockLandUse,
  })
  const debounceRef = useRef(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      setDebouncedInputs({
        blockCustoms, cornerRadiusScale,
        cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockLandUse,
      })
    }, v2DebounceMs)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // Note `blockCustoms` is intentionally NOT in this dep list — while a
    // chain is selected, blockCustoms changes EVERY drag tick, but the
    // selected chain's bands route through the live overlay, not V2.
    // V2's snapshot only refreshes when the operator changes selection
    // (which IS in deps via `selectedStreet`) or edits any non-blockCustoms
    // input. On selection change the snapshot picks up whatever
    // blockCustoms looks like at that moment, including the just-edited
    // chain's customs.
  }, [selectedStreet, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockLandUse])

  const { asphaltRounded, blockRounded, blockFill, blocks, curbBands, byChain, corners, frontageEdges, frontageBands, frontageCaps, cornerOrphanAsphalt } = useMemo(() => {
    const empty = { asphaltRounded: [], blockRounded: [], blockFill: [], blocks: [], curbBands: [], byChain: [], corners: [], frontageEdges: [], frontageBands: [], frontageCaps: [], cornerOrphanAsphalt: [] }
    if (!liveRibbons) return empty
    try {
      return buildBlockGeometryV2(liveRibbons, {
        stencil, ...debouncedInputs,
      })
    } catch (e) {
      console.error('[BlockGeometryV2Debug] build failed:', e)
      return empty
    }
  }, [liveRibbons, stencil, debouncedInputs])

  // Stash the rounded block rings into the store so MeasureOverlay's
  // drag path can resolve block adjacency at drag time without re-running
  // buildBlockGeometryV2 (Clipper booleans aren't free).
  useEffect(() => {
    useCartographStore.getState()._setV2Blocks(blockRounded)
  }, [blockRounded])
  // D.5: Stash frontageEdges so MeasureOverlay can resolve a clicked
  // chain point → (blockKey, edgeOrd) for per-block-edge customs.
  //
  // Identity translation: V2's `chainIdx` indexes `liveRibbons.streets`
  // (ordered like the static ribbons artifact). MeasureOverlay's
  // `streetIdx` indexes `centerlineData.streets` (live-store order) —
  // a different ordering on toy + LS. Enrich each fe with `chainSkelId`
  // so consumers can match by identity instead of array index.
  const enrichedFrontageEdges = useMemo(() => {
    const streets = liveRibbons?.streets || []
    return frontageEdges.map(fe => ({
      ...fe,
      chainSkelId: streets[fe.chainIdx]?.skelId,
      chainName:   streets[fe.chainIdx]?.name,
    }))
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
  const selectedAdjacentBlockKeys = useMemo(() => {
    if (!measureActive || selectedRibbonsChainIdx < 0) return null
    const chain = liveRibbons?.streets?.[selectedRibbonsChainIdx]
    if (!chain?.points || chain.points.length < 2) return null
    const m = chain.measure || {}
    const hwL = m.left?.pavementHW || 0
    const hwR = m.right?.pavementHW || 0
    const tlL = m.left?.treelawn || 0,  swL = m.left?.sidewalk || 0
    const tlR = m.right?.treelawn || 0, swR = m.right?.sidewalk || 0
    // Slack covers per-block customs that widen beyond the chain default.
    const PROBE_SLACK = 10
    const probeR = Math.max(hwL + tlL + swL, hwR + tlR + swR) + curbWidth + PROBE_SLACK
    const probeR2 = probeR * probeR

    // Probe by chain SEGMENT MIDPOINTS, not chain.points. Endpoints
    // (chain.points[0] and points[n-1]) sit at the IX where the chain
    // terminates; the blocks across that IX are physically close but
    // the chain doesn't run ALONGSIDE them — they're end-on, not side-
    // adjacent. Segment midpoints sit inside the chain's run, so probing
    // from them excludes end-on blocks while still catching every block
    // the chain genuinely runs alongside.
    const segMids = []
    for (let i = 0; i < chain.points.length - 1; i++) {
      const a = chain.points[i], b = chain.points[i + 1]
      segMids.push([(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5])
    }
    const minDist2 = (ring) => {
      let best = Infinity
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        const dx = b[0] - a[0], dz = b[1] - a[1]
        const L2 = dx * dx + dz * dz
        if (L2 < 1e-9) continue
        for (const p of segMids) {
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2))
          const qx = a[0] + t * dx, qz = a[1] + t * dz
          const d2 = (p[0] - qx) ** 2 + (p[1] - qz) ** 2
          if (d2 < best) { best = d2; if (best <= 1) return best }
        }
      }
      return best
    }
    const keys = new Set()
    for (const b of (blocks || [])) {
      if (!b?.ring || !b.blockKey) continue
      if (minDist2(b.ring) <= probeR2) keys.add(b.blockKey)
    }

    // Per-block mode: narrow to the two blocks at the anchor. Probe a
    // point at perp ±(hw+cw+1) from the anchor on each side and check
    // which block ring contains it.
    if (measureMode?.type === 'block' && selectedMeasurePoint && keys.size > 1) {
      const pts = chain.points
      const ap = selectedMeasurePoint
      // Nearest segment of chain to the anchor for the perp basis.
      let bestI = 0, bestD2 = Infinity
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], az = pts[i][1], bx = pts[i+1][0], bz = pts[i+1][1]
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
        if (L2 < 1e-9) continue
        const t = Math.max(0, Math.min(1, ((ap.x - ax) * dx + (ap.z - az) * dz) / L2))
        const qx = ax + t * dx, qz = az + t * dz
        const d2 = (ap.x - qx) ** 2 + (ap.z - qz) ** 2
        if (d2 < bestD2) { bestD2 = d2; bestI = i }
      }
      const ax = pts[bestI][0], az = pts[bestI][1]
      const bx = pts[bestI + 1][0], bz = pts[bestI + 1][1]
      const tx = bx - ax, tz = bz - az
      const tL = Math.hypot(tx, tz) || 1
      const lnx = -tz / tL, lnz = tx / tL  // left perp
      const probeL = hwL + curbWidth + 1
      const probeR2dist = hwR + curbWidth + 1
      const pL = [ap.x + lnx * probeL, ap.z + lnz * probeL]
      const pR = [ap.x - lnx * probeR2dist, ap.z - lnz * probeR2dist]
      const narrowed = new Set()
      for (const b of (blocks || [])) {
        if (!b?.ring || !b.blockKey || !keys.has(b.blockKey)) continue
        if (pointInRing(pL, b.ring) || pointInRing(pR, b.ring)) narrowed.add(b.blockKey)
      }
      return narrowed.size ? narrowed : keys
    }
    return keys.size ? keys : null
  }, [measureActive, selectedRibbonsChainIdx, liveRibbons, blocks, curbWidth, measureMode, selectedMeasurePoint])

  // Group blocks by (lu, selected). Selected blocks render through the
  // `selectedCorridor` material variant (opacity 0.55 in Measure, same
  // as the chain's bands); unselected blocks render opaque.
  const blockGroups = useMemo(() => {
    const byKey = new Map()
    for (const b of (blocks || [])) {
      const selected = !!(selectedAdjacentBlockKeys && selectedAdjacentBlockKeys.has(b.blockKey))
      const key = `${b.lu}|${selected ? 1 : 0}`
      let entry = byKey.get(key)
      if (!entry) { entry = { lu: b.lu, selected, rings: [] }; byKey.set(key, entry) }
      entry.rings.push(b.ring)
    }
    const out = []
    for (const [key, entry] of byKey) {
      const color = (luColors && luColors[entry.lu]) || DEFAULT_LU_COLORS[entry.lu] || DEFAULT_LU_COLORS.residential
      out.push({ key, lu: entry.lu, selected: entry.selected, color, geo: ringsToFlatGeo(entry.rings, 0.01, true) })
    }
    return out
  }, [blocks, luColors, selectedAdjacentBlockKeys])
  const curbGeo     = useMemo(() => ringsToFlatGeo(curbBands,     0.035, true), [curbBands])
  // Phase 2.1: per-corner outer-face asphalt fill. Per-chain rectangles
  // have square ends at IXs; the fillet residual against asphaltRounded
  // is attributed to corner records (via centroid-match) and pushed
  // onto each arc-span frontageBand entry's `asphaltRings` field, with
  // unattributed orphans collected in cornerOrphanAsphalt. Both render
  // as asphalt material. asPolygonWithHoles=true on Clipper-output
  // rings so CW holes pair with CCW outers cleanly.
  const cornerFilletAsphaltGeo = useMemo(() => {
    const rings = []
    for (const fb of frontageBands) {
      if (fb?.asphaltRings?.length) rings.push(...fb.asphaltRings)
    }
    if (cornerOrphanAsphalt?.length) rings.push(...cornerOrphanAsphalt)
    return ringsToFlatGeo(rings, 0.038, true)
  }, [frontageBands, cornerOrphanAsphalt])
  // Live overlay for the SELECTED chain. While the operator drags
  // measure handles on chain X, V2's full pass takes ~2.5s — so the
  // bands can't follow handles in real time. `buildChainBandsLive`
  // emits chain X's bands directly from chain.measure ⊕
  // blockCustoms[X], no Clipper, ~1ms. We replace V2's `byChain[X]`
  // entry with this live version so the rendered bands track the
  // handles at 60fps. Other chains keep their cached V2 output. On
  // drag release, V2's next full pass overwrites with the rounded /
  // unioned / corner-padded version.
  const liveSelectedRings = useMemo(() => {
    if (selectedRibbonsChainIdx < 0) return null
    const chain = liveRibbons?.streets?.[selectedRibbonsChainIdx]
    if (!chain) return null
    // D.5/D.6: blockCustoms keyed by (blockKey, edgeOrd). Pass the full
    // map + frontageEdges so buildChainBandsLive can resolve each
    // segOrd-side → fe → customs entry. Falls through to chain.measure
    // when no fe matches (chain endpoints, parcel-internal sides).
    return buildChainBandsLive(
      chain,
      selectedRibbonsChainIdx,
      blockCustoms,
      frontageEdges,
      { curbWidth, ixByChain: liveIxByChain }
    )
  }, [selectedRibbonsChainIdx, liveRibbons, blockCustoms, frontageEdges, curbWidth, liveIxByChain])

  // Per-chain BufferGeometries split into two passes for drag perf:
  //
  // • `nonSelectedChainGeo` — every chain EXCEPT the selected one,
  //   triangulated from V2's frozen byChain snapshot. Cached on byChain
  //   alone, so a drag tick (which doesn't change byChain — V2 is
  //   frozen during selection) doesn't re-triangulate all 241 chains
  //   every frame. ~700 ShapeGeometry calls become a one-time cost
  //   per chain selection instead of per drag tick.
  //
  // • `selectedChainGeo` — just the selected chain, triangulated from
  //   `liveSelectedRings`. Rebuilds every drag tick (~4 quads), ~1ms.
  //
  // Render mounts both. Selected chain's meshes are layered separately
  // and pull from the cached pair (translucent vs opaque material).
  // D.3c: per-chain treelawn/sidewalk now sources from frontageBands
  // (block-edge-owned, extended + pulled-back, clipped to blockRounded)
  // instead of the per-chain-segment byChain.{tl,sw}Rings. Round
  // dead-end caps still come from byChain.{tl,sw}CapRings (split out
  // in D.3b.1 so this swap leaves them in place). Group frontage
  // rings by chainIdx so the existing per-chain mesh structure (and
  // the selected-chain drag perf split) keeps working.
  const frontageByChain = useMemo(() => {
    const m = new Map()
    for (const fe of frontageBands || []) {
      let entry = m.get(fe.chainIdx)
      if (!entry) { entry = { treelawn: [], sidewalk: [] }; m.set(fe.chainIdx, entry) }
      if (fe.treelawnRings?.length) entry.treelawn.push(...fe.treelawnRings)
      if (fe.sidewalkRings?.length) entry.sidewalk.push(...fe.sidewalkRings)
    }
    return m
  }, [frontageBands])

  // Per-LU treelawn aggregation for non-selected chains. Each fe is
  // attributed to its adjacent parcel via a coordinate probe (same logic
  // as bake-ground.js's bake-side split), then bucketed by that LU.
  // Selected-chain treelawn is excluded here and rendered separately by
  // the per-chain path so the live drag preserves its translucent
  // material. Result: ~10 per-LU meshes instead of ~80 per-chain meshes
  // — net draw-count REDUCTION while landing the per-parcel coloring.
  const treelawnByLuGeo = useMemo(() => {
    const buckets = new Map()
    for (const fe of frontageBands || []) {
      if (!fe.treelawnRings?.length) continue
      if (fe.chainIdx === selectedRibbonsChainIdx) continue
      const probe = ringInteriorProbe(fe.treelawnRings[0])
      const lu = probe ? blockLuAtPoint(probe, blocks) : null
      const luKey = lu || '_unattributed'
      if (!buckets.has(luKey)) buckets.set(luKey, [])
      buckets.get(luKey).push(...fe.treelawnRings)
    }
    const out = []
    for (const [lu, rings] of buckets) {
      const geo = ringsToFlatGeo(rings, 0.02, true)
      if (!geo) continue
      const color = lu === '_unattributed'
        ? treelawnCol
        : (luColors && luColors[lu]) || DEFAULT_LU_COLORS[lu] || treelawnCol
      out.push({ lu, geo, color })
    }
    return out
  }, [frontageBands, blocks, selectedRibbonsChainIdx, luColors, treelawnCol])

  const nonSelectedChainGeo = useMemo(() => {
    const out = []
    for (const entry of byChain || []) {
      if (!entry) continue
      if (entry.chainIdx === selectedRibbonsChainIdx) continue
      const ag = entry.asphaltRings.length  ? ringsToFlatGeo(entry.asphaltRings,  0.04, true) : null
      const fb = frontageByChain.get(entry.chainIdx)
      // Treelawn for non-selected chains is rendered globally per-LU via
      // treelawnByLuGeo above; only dead-end caps (which don't have a
      // single adjacent parcel) flow through the per-chain path.
      const swAll = (fb?.sidewalk || []).concat(entry.sidewalkCapRings || [])
      const tg = (entry.treelawnCapRings?.length)
        ? ringsToFlatGeo(entry.treelawnCapRings, 0.02, true)
        : null
      const sg = swAll.length ? ringsToFlatGeo(swAll, 0.03, true) : null
      if (ag || tg || sg) out.push({ chainIdx: entry.chainIdx, asphalt: ag, treelawn: tg, sidewalk: sg })
    }
    return out
  }, [byChain, frontageByChain, selectedRibbonsChainIdx])

  // D.3c keeps cornerSidewalkPads mounted as the corner concrete; no
  // frontageCaps mesh is mounted (extendCorners=false default leaves
  // frontageCaps empty anyway). The hook below stays as a no-op so the
  // mesh slot exists if extendCorners is ever enabled.
  const frontageCapsGeo = useMemo(() => {
    if (!frontageCaps || !frontageCaps.length) return null
    const rings = []
    for (const cap of frontageCaps) {
      const src = cap.ringClipped?.length ? cap.ringClipped : (cap.ring ? [cap.ring] : [])
      if (src.length) rings.push(...src)
    }
    return rings.length ? ringsToFlatGeo(rings, 0.029, true) : null
  }, [frontageCaps])

  const selectedChainGeo = useMemo(() => {
    if (selectedStreet == null || !liveSelectedRings) return null
    const ag = liveSelectedRings.asphaltRings.length  ? ringsToFlatGeo(liveSelectedRings.asphaltRings,  0.04, true) : null
    const tg = liveSelectedRings.treelawnRings.length ? ringsToFlatGeo(liveSelectedRings.treelawnRings, 0.02, true) : null
    const sg = liveSelectedRings.sidewalkRings.length ? ringsToFlatGeo(liveSelectedRings.sidewalkRings, 0.03, true) : null
    if (!ag && !tg && !sg) return null
    return { chainIdx: selectedRibbonsChainIdx, asphalt: ag, treelawn: tg, sidewalk: sg }
  }, [liveSelectedRings, selectedRibbonsChainIdx])

  // Composite array kept for downstream code that still expects a flat
  // perChainGeo list. Selected chain's geo (if any) tacked on at end.
  const perChainGeo = useMemo(
    () => selectedChainGeo ? [...nonSelectedChainGeo, selectedChainGeo] : nonSelectedChainGeo,
    [nonSelectedChainGeo, selectedChainGeo]
  )

  // Stripe edges — opaque strokes drawn on the SELECTED chain only when
  // Measure is active. They mark where boundary handles attach. The
  // asphalt|curb and curb|treelawn boundaries don't need strokes — the
  // curb stripe IS the stroke between asphalt and treelawn. The two
  // strokes that DO render: treelawn outer (colored treelawn-green) and
  // sidewalk outer (colored sidewalk-white).
  const polysToLineGeo = (polys) => {
    if (!polys?.length) return null
    const positions = []
    for (const poly of polys) {
      if (!poly || poly.length < 2) continue
      for (let i = 0; i < poly.length - 1; i++) {
        positions.push(poly[i][0],   0.06, poly[i][1])
        positions.push(poly[i+1][0], 0.06, poly[i+1][1])
      }
    }
    if (!positions.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }
  // Selected chain's edge strokes come exclusively from `liveSelectedRings`
  // (D.7c). The pre-D.7d byChain.{tl,sw}Edges fallback was redundant —
  // liveSelectedRings is always built whenever a chain is selected, with
  // identical edge polylines.
  const treelawnEdgeGeo = useMemo(() => {
    if (!measureActive || !liveSelectedRings?.treelawnEdges?.length) return null
    return polysToLineGeo(liveSelectedRings.treelawnEdges)
  }, [liveSelectedRings, measureActive])
  const sidewalkEdgeGeo = useMemo(() => {
    if (!measureActive || !liveSelectedRings?.sidewalkEdges?.length) return null
    return polysToLineGeo(liveSelectedRings.sidewalkEdges)
  }, [liveSelectedRings, measureActive])
  // Asphalt outer-edge stroke — curb-colored line at the asphalt|curb
  // boundary on the selected chain. The curb mesh itself is hidden during
  // selection (its silhouette is stale relative to the live overlay), but
  // the operator still needs a precise asphalt-boundary line to align
  // against the aerial during a drag. Mirrors the treelawn/sidewalk
  // outer-edge strokes.
  const asphaltEdgeGeo = useMemo(() => {
    if (!measureActive || !liveSelectedRings?.asphaltEdges?.length) return null
    return polysToLineGeo(liveSelectedRings.asphaltEdges)
  }, [liveSelectedRings, measureActive])

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
    asphalt:           makeMaterial(asphaltCol,  PRI.asphalt,  bandFade, { measureActive, surveyActive }),
    asphaltSelected:   makeMaterial(asphaltCol,  PRI.asphalt,  bandFade, { measureActive, surveyActive, selectedCorridor: true }),
    treelawn:          makeMaterial(treelawnCol, PRI.treelawn, bandFade, { measureActive, surveyActive }),
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
        out.push([lu, makeMaterial(color, PRI.treelawn, bandFade, { measureActive, surveyActive })])
      }
      return out
    })()),
    sidewalk:          makeMaterial(sidewalkCol, PRI.sidewalk, bandFade, { measureActive, surveyActive }),
    sidewalkSelected:  makeMaterial(sidewalkCol, PRI.sidewalk, bandFade, { measureActive, surveyActive, selectedCorridor: true }),
    curb:              makeMaterial(curbCol,     PRI.curb,     bandFade, { measureActive, surveyActive }),
    cornerSidewalk:    makeMaterial(sidewalkCol, PRI.residential + 0.5, bandFade, { surveyActive }),
    cornerAsphalt:     makeMaterial(asphaltCol,  PRI.asphalt,  bandFade, { surveyActive }),
  }), [makeMaterial, asphaltCol, treelawnCol, sidewalkCol, curbCol, luColors, measureActive, surveyActive, bandFade])

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
    const blockRings = (blocks || []).map(b => b.ring).filter(r => r?.length >= 3)
    const subtract = []
    for (const r of (curbBands || [])) if (r?.length >= 3) subtract.push(r)
    for (const fb of (frontageBands || [])) {
      for (const r of (fb.treelawnRings || [])) if (r?.length >= 3) subtract.push(r)
      for (const r of (fb.sidewalkRings || [])) if (r?.length >= 3) subtract.push(r)
    }
    if (!blockRings.length) return []
    if (!subtract.length) return blockRings
    return differenceRings(blockRings, subtract)
  }, [blocks, curbBands, frontageBands])
  const pathGeoByKind = useMemo(() => {
    const ringsByKind = buildPathRibbons(liveRibbons, { intersect: parcelInteriors, alleyCap })
    const out = {}
    for (const [kind, rings] of ringsByKind) {
      const geo = ringsToFlatGeo(rings, 0.05, true)
      if (geo) out[kind] = geo
    }
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
  // LU block-fill materials cached per (lu, selected) key. Selected
  // adjacent blocks route through the `selectedCorridor` variant so the
  // parcel translucency matches the chain's band translucency (0.55 in
  // Measure). Same N→1 caching win as before; ~10 LU × 2 selected-states.
  const blockMats = useMemo(() => {
    const out = {}
    for (const g of blockGroups) {
      out[g.key] = makeMaterial(g.color, PRI.residential, faceFade, {
        measureActive, surveyActive, selectedCorridor: g.selected,
      })
    }
    return out
  }, [makeMaterial, blockGroups, measureActive, surveyActive, faceFade])

  return (
    <group>
      {!hideLandUse && lotVisible && blockGroups.map(g => g.geo && (
        <mesh key={g.key} geometry={g.geo} renderOrder={PRI.residential} receiveShadow
          material={blockMats[g.key]} />
      ))}
      {/* Per-chain band meshes. Material picked from the cached pair
          (normal vs selectedCorridor). Selected chain gets opacity 0.55
          in Measure. Order: treelawn (3) → sidewalk (5) → curb (6,
          unified) → asphalt (8). */}
      {/* Per-LU treelawn meshes (non-selected chains). Each LU paints in
          its adjacent parcel's authored color so the treelawn reads as a
          frontage extension of the block rather than a uniform green
          strip. Bake side splits the same way. */}
      {treelawnVisible && treelawnByLuGeo.map(({ lu, geo }) => (
        <mesh key={`tlu:${lu}`} geometry={geo} renderOrder={PRI.treelawn} receiveShadow
          material={bandMats.treelawnByLu.get(lu) || bandMats.treelawn} />
      ))}
      {/* Per-chain treelawn — now only carries dead-end caps for non-
          selected chains (per-LU global mesh above covers the frontage
          portion) plus the SELECTED chain's full treelawn so its
          translucent material still wins during Measure drag. */}
      {treelawnVisible && perChainGeo.map(g => g.treelawn && (
        <mesh key={`t${g.chainIdx}`} geometry={g.treelawn} renderOrder={PRI.treelawn} receiveShadow
          material={g.chainIdx === selectedRibbonsChainIdx ? bandMats.treelawnSelected : bandMats.treelawn} />
      ))}
      {sidewalkVisible && perChainGeo.map(g => g.sidewalk && (
        <mesh key={`s${g.chainIdx}`} geometry={g.sidewalk} renderOrder={PRI.sidewalk} receiveShadow
          material={g.chainIdx === selectedRibbonsChainIdx ? bandMats.sidewalkSelected : bandMats.sidewalk} />
      ))}
      {/* While a chain is selected (drag in flight), the global curb
          stroke is sized to the PREVIOUS V2 pass's asphaltRounded —
          it's stale relative to the live-band overlay. Hide it during
          selection so the selected chain's bands aren't masked by an
          old curb position. V2's next pass (after 250ms idle) refreshes
          the curb to the correct silhouette. */}
      {curbVisible && curbGeo && selectedStreet == null && (
        <mesh geometry={curbGeo} renderOrder={PRI.curb} receiveShadow material={bandMats.curb} />
      )}
      {perChainGeo.map(g => {
        if (!g.asphalt) return null
        const visible = isHighwayChain(g.chainIdx) ? highwayVisible : asphaltVisible
        if (!visible) return null
        return (
          <mesh key={`a${g.chainIdx}`} geometry={g.asphalt} renderOrder={PRI.asphalt} receiveShadow
            material={g.chainIdx === selectedRibbonsChainIdx ? bandMats.asphaltSelected : bandMats.asphalt} />
        )
      })}
      {/* Phase 2.1: corner outer-face asphalt fill. asphaltRounded has
          rounded mouths inherently (stencil − blockRounded), but the
          per-chain asphalt rectangles have square ends at IXs and
          leave a fillet residual. The regime emitter's per-arc loop
          attributes that residual to corner records; render here under
          asphalt material. Hides while a chain is selected so the
          live-overlay bands aren't masked. */}
      {(asphaltVisible || highwayVisible) && cornerFilletAsphaltGeo && selectedStreet == null && (
        <mesh geometry={cornerFilletAsphaltGeo} renderOrder={PRI.asphalt} receiveShadow
          material={bandMats.cornerAsphalt} />
      )}
      {/* Non-street ribbons (alleys, footways, cycleways, steps, paths).
          Same geometry the bake emits via buildPathRibbons — shared helper
          guarantees Designer and slab don't drift. Each kind has its own
          Stage Surfaces visibility row + color. */}
      {PATH_KINDS.map(kind => (
        PATH_VISIBLE[kind] && pathGeoByKind[kind] && (
          <mesh key={`path-${kind}`} geometry={pathGeoByKind[kind]}
            renderOrder={PRI.asphalt + 1} receiveShadow material={pathMats[kind]} />
        )
      ))}
      {/* Phase 2: corner concrete pad retired — the regime emitter
          emits sidewalk-material wedges (ramp / asym plug) as part of
          frontageBands' arc-span branch. Those render under the
          sidewalk material above. */}
      {/* D.3c: frontageCaps — concrete cap quads at (tl+sw)↔(tl+sw)
          corners. Sits at sidewalk priority over the corner pads.
          Hides with the sidewalk toggle. */}
      {sidewalkVisible && frontageCapsGeo && selectedStreet == null && (
        <mesh geometry={frontageCapsGeo} renderOrder={PRI.sidewalk} receiveShadow
          material={bandMats.cornerSidewalk} />
      )}
      {treelawnEdgeGeo && (
        <lineSegments geometry={treelawnEdgeGeo} renderOrder={PRI.asphalt + 1}>
          <lineBasicMaterial color={treelawnCol} transparent opacity={1} depthWrite={false} />
        </lineSegments>
      )}
      {sidewalkEdgeGeo && (
        <lineSegments geometry={sidewalkEdgeGeo} renderOrder={PRI.asphalt + 1}>
          <lineBasicMaterial color={sidewalkCol} transparent opacity={1} depthWrite={false} />
        </lineSegments>
      )}
      {/* Asphalt outer-edge — curb-colored line at the asphalt|curb
          boundary on the selected chain. Replaces the visual role of the
          (hidden-during-selection) curb mesh during a drag, while staying
          handle-tracked via liveSelectedRings. */}
      {asphaltEdgeGeo && (
        <lineSegments geometry={asphaltEdgeGeo} renderOrder={PRI.asphalt + 1}>
          <lineBasicMaterial color={curbCol} transparent opacity={1} depthWrite={false} />
        </lineSegments>
      )}
      {showCornerDots && corners.map((c, i) => (
        <mesh
          key={i}
          position={[c.point[0], 0.07, c.point[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={502}
        >
          <circleGeometry args={[0.45, 16]} />
          <meshBasicMaterial color="#ffdd22" transparent opacity={1.0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
