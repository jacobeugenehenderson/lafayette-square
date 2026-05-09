/**
 * BlockGeometryV2Debug — visual probe for the rounded-block-clip prototype.
 *
 * Renders the V2 helper's output through the shared cartograph surface
 * pipeline (useSurfaceMaterial) so colors, terrain displacement, shadow
 * tinting, and post-FX match the legacy StreetRibbons render exactly.
 *
 * Layers (back-to-front via BAND_PRIORITY):
 *   - treelawn bands  (#5a6e42, pri 3)
 *   - sidewalk bands  (#a89e8e, pri 5)
 *   - asphalt rounded (#3e3e3c, pri 8)
 *   - yellow IX-corner dots (debug overlay, plain basic material)
 *
 * Strip bands are emitted raw by the helper (no stencil clip in toy v0).
 * The rounded asphalt paints on top at IX corners, which produces the
 * correct visual rounding without an explicit block-polygon clip.
 *
 * Coord convention follows StreetRibbons: ShapeGeometry built from
 * Vector2(x, z), then per-vertex remap to (x, 0, z) flips XY→XZ.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildBlockGeometryV2 } from '../lib/buildBlockGeometryV2.js'
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
  const vertexSmoothing           = useCartographStore(s => s.vertexSmoothing)
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
  const { asphaltRounded, blockRounded, blockFill, blocks, curbBands, cornerAsphaltPlugs, cornerSidewalkPads, byChain, corners } = useMemo(() => {
    const empty = { asphaltRounded: [], blockRounded: [], blockFill: [], blocks: [], curbBands: [], cornerAsphaltPlugs: [], cornerSidewalkPads: [], byChain: [], corners: [] }
    if (!liveRibbons) return empty
    try {
      return buildBlockGeometryV2(liveRibbons, {
        cornerRadiusScale, stencil,
        cornerRadiusOverrides, cornerCornerRadiusOverrides,
        curbWidth, blockCustoms, vertexSmoothing, blockLandUse,
      })
    } catch (e) {
      console.error('[BlockGeometryV2Debug] build failed:', e)
      return empty
    }
  }, [liveRibbons, stencil, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockCustoms, vertexSmoothing, blockLandUse])

  // Stash the rounded block rings into the store so MeasureOverlay's
  // drag path can resolve block adjacency at drag time without re-running
  // buildBlockGeometryV2 (Clipper booleans aren't free).
  useEffect(() => {
    useCartographStore.getState()._setV2Blocks(blockRounded)
  }, [blockRounded])

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
  const cornerAsphaltGeo = useMemo(() => ringsToFlatGeo(cornerAsphaltPlugs, 0.038, false), [cornerAsphaltPlugs])
  // Concrete corner pad — sidewalk-color wedge at each IX corner where
  // the chains' ped-zone bands don't connect. Sits at sidewalk priority,
  // shared between chains, always opaque.
  const cornerSidewalkGeo = useMemo(() => ringsToFlatGeo(cornerSidewalkPads, 0.028, false), [cornerSidewalkPads])
  // Per-chain band geometries so the selected chain's meshes can swap to
  // the translucent material variant while every other chain stays
  // opaque. Block + curb stay unified above (block-level surfaces).
  const perChainGeo = useMemo(() => {
    const out = []
    for (const entry of byChain || []) {
      if (!entry) continue
      const ag = entry.asphaltRings.length  ? ringsToFlatGeo(entry.asphaltRings,  0.04, true) : null
      const tg = entry.treelawnRings.length ? ringsToFlatGeo(entry.treelawnRings, 0.02, true) : null
      const sg = entry.sidewalkRings.length ? ringsToFlatGeo(entry.sidewalkRings, 0.03, true) : null
      if (ag || tg || sg) out.push({ chainIdx: entry.chainIdx, asphalt: ag, treelawn: tg, sidewalk: sg })
    }
    return out
  }, [byChain])

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

  // Materials. Mirroring V1's pattern (StreetRibbons.jsx:2297) of building
  // a fresh material inline per mesh per render, no caching — `useMemo`
  // caching plus prop-swap on the mesh dropped state somewhere when the
  // selectedCorridor flag flipped. V1 has been working this way; V2
  // matches.
  //
  // Block (residential land-use) and curb (unified boundary stroke)
  // stay opaque always — block-level surfaces, never selectedCorridor.
  // Asphalt + treelawn + sidewalk get selectedCorridor: true on the
  // selected chain → useSurfaceMaterial returns opacity 0.55 in Measure.
  const curbMat = useMemo(
    () => makeMaterial(curbCol, PRI.curb, null, { measureActive, surveyActive }),
    [makeMaterial, curbCol, measureActive, surveyActive]
  )

  return (
    <group>
      {!hideLandUse && lotVisible && blockGroups.map(g => g.geo && (
        <mesh key={g.lu} geometry={g.geo} renderOrder={PRI.residential} receiveShadow
          material={makeMaterial(g.color, PRI.residential, null, { surveyActive })} />
      ))}
      {/* Per-chain band meshes. Material built fresh per mesh per render
          (matching V1). Selected chain → selectedCorridor:true → opacity
          0.55. Order: treelawn (3) → sidewalk (5) → curb (6, unified)
          → asphalt (8). */}
      {treelawnVisible && perChainGeo.map(g => g.treelawn && (
        <mesh key={`t${g.chainIdx}`} geometry={g.treelawn} renderOrder={PRI.treelawn} receiveShadow
          material={makeMaterial(treelawnCol, PRI.treelawn, null, { measureActive, surveyActive, selectedCorridor: g.chainIdx === selectedStreet })} />
      ))}
      {sidewalkVisible && perChainGeo.map(g => g.sidewalk && (
        <mesh key={`s${g.chainIdx}`} geometry={g.sidewalk} renderOrder={PRI.sidewalk} receiveShadow
          material={makeMaterial(sidewalkCol, PRI.sidewalk, null, { measureActive, surveyActive, selectedCorridor: g.chainIdx === selectedStreet })} />
      ))}
      {curbVisible && curbGeo && (
        <mesh geometry={curbGeo} renderOrder={PRI.curb} receiveShadow material={curbMat} />
      )}
      {perChainGeo.map(g => {
        if (!g.asphalt) return null
        const visible = isHighwayChain(g.chainIdx) ? highwayVisible : asphaltVisible
        if (!visible) return null
        return (
          <mesh key={`a${g.chainIdx}`} geometry={g.asphalt} renderOrder={PRI.asphalt} receiveShadow
            material={makeMaterial(asphaltCol, PRI.asphalt, null, { measureActive, surveyActive, selectedCorridor: g.chainIdx === selectedStreet })} />
        )
      })}
      {/* Corner asphalt plugs are shared between chains (no per-chain class),
          so they hide only when BOTH asphalt and highway are off. */}
      {(asphaltVisible || highwayVisible) && cornerAsphaltGeo && (
        <mesh geometry={cornerAsphaltGeo} renderOrder={PRI.asphalt} receiveShadow
          material={makeMaterial(asphaltCol, PRI.asphalt, null, { surveyActive })} />
      )}
      {/* Concrete corner pad — quad covering the corner wedge, clipped by
          the same blockRounded mask that shapes the bands and block fill.
          Renders UNDER treelawn/sidewalk so chain bands paint over it;
          pad shows only in the gap where neither band reaches (the
          rounded wedge between the curb arc and the band-zone). Hides
          with the sidewalk toggle since the pad reads as concrete. */}
      {sidewalkVisible && cornerSidewalkGeo && (
        <mesh geometry={cornerSidewalkGeo} renderOrder={PRI.residential + 0.5} receiveShadow
          material={makeMaterial(sidewalkCol, PRI.residential + 0.5, null, { surveyActive })} />
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
