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
  measureActive = false, surveyActive = false,
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
  const layerColors               = useCartographStore(s => s.layerColors)
  const luColors                  = useCartographStore(s => s.luColors)
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
  const blockCol    = residentialColor || (luColors && luColors.residential) || DEFAULT_LU_COLORS.residential

  const liveRibbons = useMemo(
    () => mergeLiveRibbons(ribbons, liveStreets),
    [ribbons, liveStreets]
  )
  const { asphaltRounded, blockRounded, curbBands, byChain, stripeEdges, corners } = useMemo(() => {
    const empty = { asphaltRounded: [], blockRounded: [], curbBands: [], byChain: [], stripeEdges: [], corners: [] }
    if (!liveRibbons) return empty
    try {
      return buildBlockGeometryV2(liveRibbons, {
        cornerRadiusScale, stencil,
        cornerRadiusOverrides, cornerCornerRadiusOverrides,
        curbWidth, blockCustoms,
      })
    } catch (e) {
      console.error('[BlockGeometryV2Debug] build failed:', e)
      return empty
    }
  }, [liveRibbons, stencil, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, curbWidth, blockCustoms])

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
  const blockGeo    = useMemo(() => ringsToFlatGeo(blockRounded, 0.01, true), [blockRounded])
  const curbGeo     = useMemo(() => ringsToFlatGeo(curbBands,     0.035, true), [curbBands])
  // Aggregated band geometries — flatten the per-chain rings back into
  // single meshes per band type now that translucency is uniform across
  // chains in Measure mode. Per-chain provenance still lives in `byChain`
  // for any future per-chain emphasis (e.g. a glow on the selected
  // chain's edge stroke).
  const treelawnGeo = useMemo(() => {
    const all = (byChain || []).flatMap(c => c?.treelawnRings || [])
    return all.length ? ringsToFlatGeo(all, 0.02, true) : null
  }, [byChain])
  const sidewalkGeo = useMemo(() => {
    const all = (byChain || []).flatMap(c => c?.sidewalkRings || [])
    return all.length ? ringsToFlatGeo(all, 0.03, true) : null
  }, [byChain])
  const asphaltGeo  = useMemo(() => {
    const all = (byChain || []).flatMap(c => c?.asphaltRings || [])
    return all.length ? ringsToFlatGeo(all, 0.04, true) : null
  }, [byChain])

  // Stripe edges — opaque white strokes between bands when Measure is
  // active. Lifted slightly above the asphalt (y=0.06) with depthWrite
  // off so the lines aren't occluded by the translucent bands.
  const edgeGeo = useMemo(() => {
    if (!measureActive || !stripeEdges?.length) return null
    const positions = []
    for (const poly of stripeEdges) {
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
  }, [stripeEdges, measureActive])

  // Materials. Block (residential land-use) is always opaque per the
  // operator's mental model: the inside-of-sidewalk area IS the parcel,
  // a stable land-use surface. Asphalt + curb + treelawn + sidewalk are
  // "ribbons" — they go translucent in Measure mode so the operator can
  // see the centerline + handles + adjacent context underneath while
  // authoring widths. Opaque stripe edge strokes (rendered separately)
  // delineate where each band boundary sits so the translucency doesn't
  // wash out the geometry the operator is targeting.
  const measureDim = useMemo(
    () => ({ measureActive, surveyActive, selectedCorridor: !!measureActive }),
    [measureActive, surveyActive]
  )
  const blockMat    = useMemo(() => makeMaterial(blockCol,    PRI.residential, null, { surveyActive }), [makeMaterial, blockCol, surveyActive])
  const curbMat     = useMemo(() => makeMaterial(curbCol,     PRI.curb,        null, measureDim),       [makeMaterial, curbCol,     measureDim])
  const asphaltMat  = useMemo(() => makeMaterial(asphaltCol,  PRI.asphalt,     null, measureDim),       [makeMaterial, asphaltCol,  measureDim])
  const treelawnMat = useMemo(() => makeMaterial(treelawnCol, PRI.treelawn,    null, measureDim),       [makeMaterial, treelawnCol, measureDim])
  const sidewalkMat = useMemo(() => makeMaterial(sidewalkCol, PRI.sidewalk,    null, measureDim),       [makeMaterial, sidewalkCol, measureDim])

  return (
    <group>
      {blockGeo && (
        <mesh geometry={blockGeo} renderOrder={PRI.residential} receiveShadow material={blockMat} />
      )}
      {treelawnGeo && (
        <mesh geometry={treelawnGeo} renderOrder={PRI.treelawn} receiveShadow material={treelawnMat} />
      )}
      {sidewalkGeo && (
        <mesh geometry={sidewalkGeo} renderOrder={PRI.sidewalk} receiveShadow material={sidewalkMat} />
      )}
      {curbGeo && (
        <mesh geometry={curbGeo} renderOrder={PRI.curb} receiveShadow material={curbMat} />
      )}
      {asphaltGeo && (
        <mesh geometry={asphaltGeo} renderOrder={PRI.asphalt} receiveShadow material={asphaltMat} />
      )}
      {edgeGeo && (
        <lineSegments geometry={edgeGeo} renderOrder={PRI.asphalt + 1}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.95} depthWrite={false} />
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
