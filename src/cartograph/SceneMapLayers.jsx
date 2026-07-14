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

// Triangulate one ring straight INTO a Float32Array at `off`, returning the new
// offset — the chunked building build writes into a pre-sized buffer (no per-chunk
// allocation, no geometry rebuild) so it can grow a draw-range across frames.
function triRingInto(ring, y, arr, off) {
  const n = ring.length
  if (n < 3) return off
  const pts = new Array(n)
  for (let i = 0; i < n; i++) pts[i] = new THREE.Vector2(px(ring[i]), pz(ring[i]))
  let tris
  try { tris = THREE.ShapeUtils.triangulateShape(pts, []) } catch { return off }
  for (const t of tris) for (const idx of t) { arr[off++] = pts[idx].x; arr[off++] = y; arr[off++] = pts[idx].y }
  return off
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
  const prefetched = useCartographStore(s => s.sceneMap)
  const [map, setMap] = useState(null)

  useEffect(() => {
    // Bake (onBuild) prefetches map.json into the store — if it's this scene's, use it
    // directly so the Designer opens with the data already in memory (no gray-screen
    // fetch of a big map.json). Otherwise fetch it here as before.
    if (prefetched?.scene === scene && prefetched.map) { console.log('[SML] map: from prefetch store (no fetch)'); setMap(prefetched.map); return }
    let cancelled = false
    setMap(null)
    console.time('[SML] map fetch+parse')
    fetchMap(scene).then(m => { if (!cancelled) { console.timeEnd('[SML] map fetch+parse'); setMap(m) } }).catch(() => {})
    return () => { cancelled = true }
  }, [scene, prefetched])

  // Clip to the ACTIVE installation's own silhouette (fetched by id).
  const boundary = useMemo(() => sceneBoundary ? makeBoundary(sceneBoundary) : null, [sceneBoundary])
  const hide = hiddenLayers || {}

  // Sub-block land-use — few features, built synchronously; appears with the ground
  // while the heavy buildings layer streams in below.
  const luGroups = useMemo(() => {
    if (!map || !boundary) return []
    const out = []
    const col = (k, d) => luColors[k] || layerColors[k] || DEFAULT_LU_COLORS[k] || d
    // ONLY in-hood infrastructure the authoring view cares about. `natural`/`leisure`
    // (the mountains/landscape) are Stage-only terrain — DEM lift in the hero shot, an
    // impostor plate in browse — never geometry in the Designer. Not our concern here.
    const LU = [
      ['parking_lot', map.layers?.parking_lot, 0.10, col('parking_lot', '#6A6A62')],
      ['water', map.layers?.water, 0.12, col('water', '#4A6A8E')],
    ]
    for (const [key, feats, y, color] of LU) {
      if (!feats || hide[key]) continue
      const geo = mergedGeo(feats, y, boundary)
      if (geo) out.push({ key, geo, color, opacity: 0.92, order: 1 })
    }
    return out
  }, [map, boundary, layerColors, luColors, hide])
  useEffect(() => () => { for (const g of luGroups) g.geo.dispose() }, [luGroups])

  // Buildings — the heavy layer (a big hood is ~15k footprints). Triangulated all at
  // once it froze the tab (>10s block → the browser's "Page Unresponsive" dialog).
  // Instead: build into a pre-sized buffer in CHUNKS across animation frames, growing
  // the draw-range — the main thread breathes between chunks (no freeze) and the
  // footprints visibly stream in, so it FEELS like it's loading.
  const [buildingGeo, setBuildingGeo] = useState(null)
  const buildingColor = layerColors.building || DEFAULT_LU_COLORS.building || '#3A3A3A'
  useEffect(() => {
    setBuildingGeo(null)
    if (!map?.buildings || !boundary || hide.building) return
    const feats = map.buildings
    // Upper bound on triangle-vertex floats: a ring of n verts → ≤(n-2) triangles →
    // <n*3 verts → <n*9 floats. Over-allocate to one buffer we never reallocate.
    let cap = 0
    for (const f of feats) { const r = f.ring || (f.rings && f.rings[0]); if (r) cap += r.length * 9 }
    if (!cap) return
    const arr = new Float32Array(cap)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    geo.setDrawRange(0, 0)
    setBuildingGeo(geo)
    let cancelled = false, raf = 0, i = 0, off = 0
    const CHUNK = 900
    const step = () => {
      if (cancelled) return
      const end = Math.min(i + CHUNK, feats.length)
      for (; i < end; i++) {
        const f = feats[i]
        const ring = f.ring || (f.rings && f.rings[0])
        if (!ring || ring.length < 3) continue
        let sx = 0, sz = 0
        for (const p of ring) { sx += px(p); sz += pz(p) }
        if (!boundary.pointInBoundary(sx / ring.length, sz / ring.length)) continue
        off = triRingInto(ring, 0.6, arr, off)
      }
      geo.attributes.position.needsUpdate = true
      geo.setDrawRange(0, off / 3)
      if (i < feats.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelled = true; cancelAnimationFrame(raf); geo.dispose() }
  }, [map, boundary, hide.building])

  if (!luGroups.length && !buildingGeo) return null
  return (
    <group>
      {luGroups.map(g => (
        <mesh key={g.key} geometry={g.geo} renderOrder={g.order}>
          <meshBasicMaterial color={g.color} side={THREE.DoubleSide} transparent opacity={g.opacity} depthWrite={false} />
        </mesh>
      ))}
      {buildingGeo && (
        <mesh geometry={buildingGeo} renderOrder={2} frustumCulled={false}>
          <meshBasicMaterial color={buildingColor} side={THREE.DoubleSide} transparent opacity={1} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
