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
import { useMemo } from 'react'
import * as THREE from 'three'
import { buildBlockGeometryV2 } from '../lib/buildBlockGeometryV2.js'
import { BAND_COLORS } from './streetProfiles.js'
import useSurfaceMaterial from '../lib/useSurfaceMaterial.js'

// Match StreetRibbons' BAND_PRIORITY for the bands V2 renders.
const PRI = { treelawn: 3, sidewalk: 5, asphalt: 8 }

function ringSignedArea(ring) {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    a += (x1 * y2 - x2 * y1)
  }
  return a / 2
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
    for (const outer of outers) append(buildShapeGeo(outer, holes))
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

export default function BlockGeometryV2Debug({ ribbons, cornerRadiusScale = 1, flat = true, showCornerDots = true }) {
  const makeMaterial = useSurfaceMaterial(flat)

  const { asphaltRounded, treelawnBands, sidewalkBands, corners } = useMemo(() => {
    if (!ribbons) return { asphaltRounded: [], treelawnBands: [], sidewalkBands: [], corners: [] }
    try {
      return buildBlockGeometryV2(ribbons, { cornerRadiusScale })
    } catch (e) {
      console.error('[BlockGeometryV2Debug] build failed:', e)
      return { asphaltRounded: [], treelawnBands: [], sidewalkBands: [], corners: [] }
    }
  }, [ribbons, cornerRadiusScale])

  // Tiny y-lifts keep coplanar layers from z-fighting; polygonOffset (driven
  // by pri in makeMaterial) is the authoritative depth resolver.
  const treelawnGeo = useMemo(() => ringsToFlatGeo(treelawnBands, 0.02), [treelawnBands])
  const sidewalkGeo = useMemo(() => ringsToFlatGeo(sidewalkBands, 0.03), [sidewalkBands])
  const asphaltGeo  = useMemo(() => ringsToFlatGeo(asphaltRounded, 0.04), [asphaltRounded])

  const treelawnMat = useMemo(() => makeMaterial(BAND_COLORS.treelawn, PRI.treelawn), [makeMaterial])
  const sidewalkMat = useMemo(() => makeMaterial(BAND_COLORS.sidewalk, PRI.sidewalk), [makeMaterial])
  const asphaltMat  = useMemo(() => makeMaterial(BAND_COLORS.asphalt,  PRI.asphalt),  [makeMaterial])

  return (
    <group>
      {treelawnGeo && (
        <mesh geometry={treelawnGeo} renderOrder={PRI.treelawn} receiveShadow material={treelawnMat} />
      )}
      {sidewalkGeo && (
        <mesh geometry={sidewalkGeo} renderOrder={PRI.sidewalk} receiveShadow material={sidewalkMat} />
      )}
      {asphaltGeo && (
        <mesh geometry={asphaltGeo} renderOrder={PRI.asphalt} receiveShadow material={asphaltMat} />
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
