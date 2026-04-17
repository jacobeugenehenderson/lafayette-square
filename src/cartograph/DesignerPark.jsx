/**
 * DesignerPark — flat plan-view rendering of Lafayette Park using the same
 * authored geometry that the 3D Stage viewer reads. Replaces the bounding-box
 * park polygon that MapLayers used to ship with, giving Designer the real
 * park silhouette, the path network, and both water features.
 *
 * Data sources (all shared with LafayettePark):
 *   - ribbons.json .faces where use==='park'   → park boundary rings
 *   - park_paths.json .paths                    → interior path polylines
 *   - park_water.json .lake / .grotto           → water rings
 *
 * Rendering is intentionally flat (MeshBasicMaterial) — this component only
 * runs in the Designer. Stage gets the shader-rich LafayettePark instead.
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import ribbonsData from '../data/ribbons.json'
import parkPathData from '../data/park_paths.json'
import parkWaterData from '../data/park_water.json'
import useCartographStore from './stores/useCartographStore.js'
import { DEFAULT_LAYER_COLORS } from './m3Colors.js'

const PATH_WIDTH = 2.4  // meters — matches LafayettePark's visual weight
// Park paths + water rings are stored in park-local coordinates (aligned to
// the park's own street grid). LafayettePark rotates its internal group by
// -GRID_ROTATION to land them at world bearing. We do the same here.
const GRID_ROTATION = -9.2 * (Math.PI / 180)

// Build a flat (XZ-plane) geometry by triangulating a ring with THREE.Shape.
function ringToGeom(ring) {
  if (!ring || ring.length < 3) return null
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, z)))
  const g = new THREE.ShapeGeometry(shape)
  g.rotateX(-Math.PI / 2)  // XY-plane → XZ-plane (ground)
  return g
}

// Build a thin quad strip from a polyline by extruding perpendicular to each
// segment. Produces clean path silhouettes without needing a MeshLine import.
function polylineToStrip(points, width) {
  if (!points || points.length < 2) return null
  const half = width / 2
  const positions = []
  const indices = []
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i]
    // Perpendicular: average of adjacent segment normals
    let nx = 0, nz = 0
    if (i > 0) {
      const [px, pz] = points[i - 1]
      const dx = x - px, dz = z - pz
      const len = Math.hypot(dx, dz) || 1
      nx += -dz / len; nz += dx / len
    }
    if (i < points.length - 1) {
      const [nxp, nzp] = points[i + 1]
      const dx = nxp - x, dz = nzp - z
      const len = Math.hypot(dx, dz) || 1
      nx += -dz / len; nz += dx / len
    }
    const nlen = Math.hypot(nx, nz) || 1
    nx /= nlen; nz /= nlen
    positions.push(x + nx * half, 0, z + nz * half)
    positions.push(x - nx * half, 0, z - nz * half)
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function mergeGeoms(geoms) {
  const valid = geoms.filter(Boolean)
  if (!valid.length) return null
  const positions = []
  const indices = []
  let offset = 0
  for (const g of valid) {
    const p = g.attributes.position.array
    for (let i = 0; i < p.length; i++) positions.push(p[i])
    const idx = g.index ? g.index.array : null
    if (idx) {
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + offset)
    } else {
      for (let i = 0; i < p.length / 3; i++) indices.push(i + offset)
    }
    offset += p.length / 3
    g.dispose()
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setIndex(indices)
  merged.computeVertexNormals()
  return merged
}

export default function DesignerPark() {
  const layerColors = useCartographStore(s => s.layerColors) || {}
  const color = (id) => layerColors[id] || DEFAULT_LAYER_COLORS[id]

  // Park boundary intentionally NOT rendered here — the ribbons pipeline
  // renders the park face like any other block, and the grass-shader upgrade
  // (for shots) will attach to that same ribbon face. DesignerPark only owns
  // features no other layer paints: interior paths + water.

  // Paths — thin strips so they read as silhouettes, no texture.
  const pathGeo = useMemo(() => {
    const paths = (parkPathData.paths || []).map(p => polylineToStrip(p.points, PATH_WIDTH))
    return mergeGeoms(paths)
  }, [])

  // Water — lake is {outer, island} (island is a hole in the lake);
  // grotto is a single flat ring of [x,z] points.
  const waterGeo = useMemo(() => {
    const geoms = []
    const lake = parkWaterData.lake
    if (lake && Array.isArray(lake.outer) && lake.outer.length >= 3) {
      // Build a Shape with the island as a hole so the water has the correct
      // silhouette — LafayettePark does the same.
      const shape = new THREE.Shape(lake.outer.map(([x, z]) => new THREE.Vector2(x, z)))
      if (Array.isArray(lake.island) && lake.island.length >= 3) {
        const hole = new THREE.Path(lake.island.map(([x, z]) => new THREE.Vector2(x, z)))
        shape.holes.push(hole)
      }
      const g = new THREE.ShapeGeometry(shape)
      g.rotateX(-Math.PI / 2)
      geoms.push(g)
    }
    if (Array.isArray(parkWaterData.grotto) && parkWaterData.grotto.length >= 3) {
      geoms.push(ringToGeom(parkWaterData.grotto))
    }
    return mergeGeoms(geoms)
  }, [])

  const pathMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: color('footway'),
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16,
  }), [layerColors])
  const waterMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#4A6A8E',  // muted blue — will get its own picker later
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12,
  }), [])

  // Paths + water live in the same coord system as LafayettePark uses —
  // placement relative to ribbons park face is tomorrow's work.
  return (
    <group>
      {waterGeo && <mesh geometry={waterGeo} material={waterMat} renderOrder={3} />}
      {pathGeo && <mesh geometry={pathGeo} material={pathMat} renderOrder={4} />}
    </group>
  )
}
