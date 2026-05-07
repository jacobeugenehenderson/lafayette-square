/**
 * BlockGeometryV2Debug — visual probe for the rounded-block-clip prototype.
 *
 * Renders the V2 helper's output as semi-transparent overlay meshes:
 *   - Sharp asphalt void (red, low alpha) — what the union of chain
 *     pavement rings looks like before rounding.
 *   - Rounded asphalt void (blue, higher alpha, stacked on top) — same
 *     polygon with round-corners applied at every block-convex vertex.
 *   - Yellow dots at each detected IX corner (the round-corners
 *     candidates, before R is applied).
 *
 * Mounted unconditionally in toy scene; no toggle UI yet (drive via
 * a constant in CartographApp until the prototype validates).
 *
 * Coord convention follows StreetRibbons.jsx: ShapeGeometry built from
 * Vector2(x, z), then per-vertex remap to (x, 0, z) flips XY→XZ. Winding
 * also flips (handled in indices).
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { buildBlockGeometryV2 } from '../lib/buildBlockGeometryV2.js'

// Signed area; >0 if CCW (in XY where Y is up; here our [x, z] follows
// the same convention so CCW outer means +area, CW hole means -area).
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
// Treats CCW rings as outers and CW rings as holes (standard PolyFillType
// non-zero output). Pairs holes with the outer that contains them.
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

  if (asPolygonWithHoles && outers.length) {
    // Naive containment: assume any single outer contains ALL holes
    // (true for stencil-minus-asphalt since the stencil is one big rect
    // and the asphalt void sits inside it). For multi-block neighborhoods
    // we'd point-in-polygon-test holes against outers.
    for (const outer of outers) {
      const geo = buildShapeGeo(outer, holes)
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
  } else {
    // Each ring becomes its own shape (no holes paired).
    for (const ring of [...outers, ...holes]) {
      const geo = buildShapeGeo(ring, null)
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
  }

  if (!allPos.length) return null
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3))
  if (allIdx.length) out.setIndex(allIdx)
  return out
}

export default function BlockGeometryV2Debug({ ribbons, cornerRadiusScale = 1 }) {
  const { asphaltSharp, asphaltRounded, corners } = useMemo(() => {
    if (!ribbons) return { asphaltSharp: [], asphaltRounded: [], corners: [] }
    try {
      return buildBlockGeometryV2(ribbons, { cornerRadiusScale })
    } catch (e) {
      console.error('[BlockGeometryV2Debug] build failed:', e)
      return { asphaltSharp: [], asphaltRounded: [], corners: [] }
    }
  }, [ribbons, cornerRadiusScale])

  const sharpGeo = useMemo(() => ringsToFlatGeo(asphaltSharp, 0.05), [asphaltSharp])
  const roundedGeo = useMemo(() => ringsToFlatGeo(asphaltRounded, 0.06), [asphaltRounded])

  return (
    <group>
      {sharpGeo && (
        <mesh geometry={sharpGeo} renderOrder={500}>
          <meshBasicMaterial color="#ff3344" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
      {roundedGeo && (
        <mesh geometry={roundedGeo} renderOrder={501}>
          <meshBasicMaterial color="#3388ff" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
      {corners.map((c, i) => (
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
