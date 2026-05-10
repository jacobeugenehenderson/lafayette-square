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
import { buildBlockGeometryV2, buildChainBandsLive } from '../lib/buildBlockGeometryV2.js'
import { mergeLiveRibbons } from '../lib/mergeLiveRibbons.js'
import { BAND_COLORS } from './streetProfiles.js'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS, BAND_TO_LAYER } from './m3Colors.js'
import useSurfaceMaterial from '../lib/useSurfaceMaterial.js'
import useCartographStore from './stores/useCartographStore.js'

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
}) {
  const makeMaterial = useSurfaceMaterial(flat)
  // Read corner-authoring + palette state directly from the store. Keeps
  // the V2 mount simple (just `ribbons` + `stencil` as props) and lets the
  // helper participate in the per-IX / per-corner authoring kit without
  // any wrapper plumbing.
  const cornerRadiusScale         = useCartographStore(s => s.cornerRadiusScale ?? 1)
  const cornerRadiusOverrides     = useCartographStore(s => s.cornerRadiusOverrides)
  const cornerCornerRadiusOverrides = useCartographStore(s => s.cornerCornerRadiusOverrides)
  const curbWidth                 = useCartographStore(s => s.curbWidth ?? 0.1524)
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

  const { asphaltRounded, blockRounded, blockFill, blocks, curbBands, cornerAsphaltPlugs, cornerSidewalkPads, byChain, corners, frontageEdges, frontageBands, frontageCaps } = useMemo(() => {
    const empty = { asphaltRounded: [], blockRounded: [], blockFill: [], blocks: [], curbBands: [], cornerAsphaltPlugs: [], cornerSidewalkPads: [], byChain: [], corners: [], frontageEdges: [], frontageBands: [], frontageCaps: [] }
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
  useEffect(() => {
    useCartographStore.getState()._setV2FrontageEdges(frontageEdges)
  }, [frontageEdges])

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
  const blockGroups = useMemo(() => {
    const byLu = new Map()
    for (const b of (blocks || [])) {
      if (!byLu.has(b.lu)) byLu.set(b.lu, [])
      byLu.get(b.lu).push(b.ring)
    }
    const out = []
    for (const [lu, rings] of byLu) {
      const color = (luColors && luColors[lu]) || DEFAULT_LU_COLORS[lu] || DEFAULT_LU_COLORS.residential
      out.push({ lu, color, geo: ringsToFlatGeo(rings, 0.01, true) })
    }
    return out
  }, [blocks, luColors])
  const curbGeo     = useMemo(() => ringsToFlatGeo(curbBands,     0.035, true), [curbBands])
  // Asphalt corner plug — fills the rounded fillet wedges at IX corners
  // that the per-chain asphalt rectangles don't cover. Without this, the
  // ground/horizon shows through the corner. Sits at asphalt priority,
  // shared between chains, always opaque (no per-chain translucency).
  // Clipper-output rings — must go through asPolygonWithHoles=true so CW
  // holes pair with their CCW outers instead of rendering as filled
  // polygons over their parent's interior. Same partition the bake
  // adapter applies in cartograph/bake-ground.js.
  const cornerAsphaltGeo = useMemo(() => ringsToFlatGeo(cornerAsphaltPlugs, 0.038, true), [cornerAsphaltPlugs])
  // Concrete corner pad — sidewalk-color wedge at each IX corner where
  // the chains' ped-zone bands don't connect. Sits at sidewalk priority,
  // shared between chains, always opaque.
  const cornerSidewalkGeo = useMemo(() => ringsToFlatGeo(cornerSidewalkPads, 0.028, true), [cornerSidewalkPads])
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
    if (selectedStreet == null) return null
    const chain = liveRibbons?.streets?.[selectedStreet]
    if (!chain) return null
    return buildChainBandsLive(
      chain,
      blockCustoms?.[selectedStreet],
      { curbWidth }
    )
  }, [selectedStreet, liveRibbons, blockCustoms, curbWidth])

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

  const nonSelectedChainGeo = useMemo(() => {
    const out = []
    for (const entry of byChain || []) {
      if (!entry) continue
      if (entry.chainIdx === selectedStreet) continue
      const ag = entry.asphaltRings.length  ? ringsToFlatGeo(entry.asphaltRings,  0.04, true) : null
      const fb = frontageByChain.get(entry.chainIdx)
      const tlAll = (fb?.treelawn || []).concat(entry.treelawnCapRings || [])
      const swAll = (fb?.sidewalk || []).concat(entry.sidewalkCapRings || [])
      const tg = tlAll.length ? ringsToFlatGeo(tlAll, 0.02, true) : null
      const sg = swAll.length ? ringsToFlatGeo(swAll, 0.03, true) : null
      if (ag || tg || sg) out.push({ chainIdx: entry.chainIdx, asphalt: ag, treelawn: tg, sidewalk: sg })
    }
    return out
  }, [byChain, frontageByChain, selectedStreet])

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
    return { chainIdx: selectedStreet, asphalt: ag, treelawn: tg, sidewalk: sg }
  }, [liveSelectedRings, selectedStreet])

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
  const treelawnEdgeGeo = useMemo(() => {
    if (!measureActive || selectedStreet == null) return null
    return polysToLineGeo((byChain || [])[selectedStreet]?.treelawnEdges)
  }, [byChain, measureActive, selectedStreet])
  const sidewalkEdgeGeo = useMemo(() => {
    if (!measureActive || selectedStreet == null) return null
    return polysToLineGeo((byChain || [])[selectedStreet]?.sidewalkEdges)
  }, [byChain, measureActive, selectedStreet])

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
    asphalt:           makeMaterial(asphaltCol,  PRI.asphalt,  null, { measureActive, surveyActive }),
    asphaltSelected:   makeMaterial(asphaltCol,  PRI.asphalt,  null, { measureActive, surveyActive, selectedCorridor: true }),
    treelawn:          makeMaterial(treelawnCol, PRI.treelawn, null, { measureActive, surveyActive }),
    treelawnSelected:  makeMaterial(treelawnCol, PRI.treelawn, null, { measureActive, surveyActive, selectedCorridor: true }),
    sidewalk:          makeMaterial(sidewalkCol, PRI.sidewalk, null, { measureActive, surveyActive }),
    sidewalkSelected:  makeMaterial(sidewalkCol, PRI.sidewalk, null, { measureActive, surveyActive, selectedCorridor: true }),
    curb:              makeMaterial(curbCol,     PRI.curb,     null, { measureActive, surveyActive }),
    cornerSidewalk:    makeMaterial(sidewalkCol, PRI.residential + 0.5, null, { surveyActive }),
    cornerAsphalt:     makeMaterial(asphaltCol,  PRI.asphalt,  null, { surveyActive }),
  }), [makeMaterial, asphaltCol, treelawnCol, sidewalkCol, curbCol, measureActive, surveyActive])
  // LU block-fill materials cached per land-use color. Same N→1 win:
  // ~10 LU groups × 1 material each instead of one per render.
  const blockMats = useMemo(() => {
    const out = {}
    for (const g of blockGroups) out[g.lu] = makeMaterial(g.color, PRI.residential, null, { surveyActive })
    return out
  }, [makeMaterial, blockGroups, surveyActive])

  return (
    <group>
      {!hideLandUse && lotVisible && blockGroups.map(g => g.geo && (
        <mesh key={g.lu} geometry={g.geo} renderOrder={PRI.residential} receiveShadow
          material={blockMats[g.lu]} />
      ))}
      {/* Per-chain band meshes. Material picked from the cached pair
          (normal vs selectedCorridor). Selected chain gets opacity 0.55
          in Measure. Order: treelawn (3) → sidewalk (5) → curb (6,
          unified) → asphalt (8). */}
      {treelawnVisible && perChainGeo.map(g => g.treelawn && (
        <mesh key={`t${g.chainIdx}`} geometry={g.treelawn} renderOrder={PRI.treelawn} receiveShadow
          material={g.chainIdx === selectedStreet ? bandMats.treelawnSelected : bandMats.treelawn} />
      ))}
      {sidewalkVisible && perChainGeo.map(g => g.sidewalk && (
        <mesh key={`s${g.chainIdx}`} geometry={g.sidewalk} renderOrder={PRI.sidewalk} receiveShadow
          material={g.chainIdx === selectedStreet ? bandMats.sidewalkSelected : bandMats.sidewalk} />
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
            material={g.chainIdx === selectedStreet ? bandMats.asphaltSelected : bandMats.asphalt} />
        )
      })}
      {/* Corner asphalt plugs are shared between chains (no per-chain class),
          so they hide only when BOTH asphalt and highway are off. Also
          hidden while a chain is selected — the plugs were sized to the
          previous V2 pass and would mask the live-overlay bands at IXs. */}
      {(asphaltVisible || highwayVisible) && cornerAsphaltGeo && selectedStreet == null && (
        <mesh geometry={cornerAsphaltGeo} renderOrder={PRI.asphalt} receiveShadow
          material={bandMats.cornerAsphalt} />
      )}
      {/* Concrete corner pad — quad covering the corner wedge, clipped by
          the same blockRounded mask that shapes the bands and block fill.
          Renders UNDER treelawn/sidewalk so chain bands paint over it;
          pad shows only in the gap where neither band reaches (the
          rounded wedge between the curb arc and the band-zone). Hides
          with the sidewalk toggle since the pad reads as concrete. */}
      {sidewalkVisible && cornerSidewalkGeo && selectedStreet == null && (
        <mesh geometry={cornerSidewalkGeo} renderOrder={PRI.residential + 0.5} receiveShadow
          material={bandMats.cornerSidewalk} />
      )}
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
