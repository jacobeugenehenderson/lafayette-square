// Scene building + land-use overlay for neighborhoods the LS-static MapLayers
// doesn't cover (hipointe-demun and future pours). Fetches the scene's derived
// map.json per-scene and draws its BUILDINGS + sub-block land-use fills, clipped
// to the scene's own boundary. Designer-only, non-LS scenes only.
//
// NOTE (doctrine): this is a Designer visualization for a not-yet-baked
// neighborhood, deliberately narrow — it does NOT render the base block/park
// land-use (BlockGeometryV2Debug's tiles already own those) to avoid
// double-draw. The long-term move is to generalize MapLayers itself so every
// scene flows one path (feedback_designer_is_canonical); tracked as a follow-up.
import { useMemo, useEffect, useState } from 'react'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'
import { fetchMap } from './api.js'
import { makeBoundary } from './boundary.js'
import { DEFAULT_LU_COLORS } from './m3Colors.js'

const px = (p) => (p.x ?? p[0])
const pz = (p) => (p.z ?? p[1])

// Ear-clip a ring into flat XZ triangle positions at height y, appended to out.
function triRing(ring, y, out) {
  const n = ring.length
  if (n < 3) return
  const pts = new Array(n)
  for (let i = 0; i < n; i++) pts[i] = new THREE.Vector2(px(ring[i]), pz(ring[i]))
  let tris
  try { tris = THREE.ShapeUtils.triangulateShape(pts, []) } catch { return }
  for (const t of tris) for (const idx of t) out.push(pts[idx].x, y, pts[idx].y)
}

// One merged BufferGeometry from every feature whose centroid is in-boundary.
function mergedGeo(features, y, boundary) {
  const pos = []
  for (const f of features || []) {
    const ring = f.ring || (f.rings && f.rings[0])
    if (!ring || ring.length < 3) continue
    let sx = 0, sz = 0
    for (const p of ring) { sx += px(p); sz += pz(p) }
    if (!boundary.pointInBoundary(sx / ring.length, sz / ring.length)) continue
    triRing(ring, y, pos)
  }
  if (!pos.length) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return geo
}

export default function SceneMapLayers({ hiddenLayers }) {
  const scene = useCartographStore(s => s.scene)
  const sceneBoundary = useCartographStore(s => s.sceneBoundary)
  const layerColors = useCartographStore(s => s.layerColors) || {}
  const luColors = useCartographStore(s => s.luColors) || {}
  const [map, setMap] = useState(null)

  useEffect(() => {
    let cancelled = false
    setMap(null)
    fetchMap(scene).then(m => { if (!cancelled) setMap(m) }).catch(() => {})
    return () => { cancelled = true }
  }, [scene])

  // Clip to the ACTIVE installation's own silhouette (fetched by id).
  const boundary = useMemo(() => sceneBoundary ? makeBoundary(sceneBoundary) : null, [sceneBoundary])
  const hide = hiddenLayers || {}

  const groups = useMemo(() => {
    if (!map || !boundary) return []
    const out = []
    const col = (k, d) => luColors[k] || layerColors[k] || DEFAULT_LU_COLORS[k] || d
    // Sub-block land-use overlays, just above the tile surface (parks/water/
    // parking/landscape are features the base tiles don't paint). Base
    // block/park LU is owned by the tiles — intentionally skipped.
    const LU = [
      ['parking_lot', map.layers?.parking_lot, 0.10, col('parking_lot', '#6A6A62')],
      ['water', map.layers?.water, 0.12, col('water', '#4A6A8E')],
      ['leisure', map.layers?.leisure, 0.11, col('leisure', '#7EB04A')],
      ['natural', map.layers?.natural, 0.09, col('natural', '#6E9A4A')],
    ]
    for (const [key, feats, y, color] of LU) {
      if (!feats || hide[key]) continue
      const geo = mergedGeo(feats, y, boundary)
      if (geo) out.push({ key, geo, color, opacity: 0.92, order: 1 })
    }
    // Buildings on top (flat footprints).
    if (map.buildings && !hide.building) {
      const geo = mergedGeo(map.buildings, 0.6, boundary)
      if (geo) out.push({ key: 'building', geo, color: layerColors.building || DEFAULT_LU_COLORS.building || '#3A3A3A', opacity: 1, order: 2 })
    }
    return out
  }, [map, boundary, layerColors, luColors, hide])

  // Dispose merged geometries on change/unmount.
  useEffect(() => () => { for (const g of groups) g.geo.dispose() }, [groups])

  if (!groups.length) return null
  return (
    <group>
      {groups.map(g => (
        <mesh key={g.key} geometry={g.geo} renderOrder={g.order}>
          <meshBasicMaterial color={g.color} side={THREE.DoubleSide} transparent opacity={g.opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
