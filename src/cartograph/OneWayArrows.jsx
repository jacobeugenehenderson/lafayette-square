// One-way street indicator — directional chevrons drawn along every chain
// flagged oneway, pointing in the travel direction (the OSM way-node order,
// = the centerline point order for oneway=yes). Distinguishes one-ways at a
// glance AND shows their direction. Designer overlay only; toggle via
// layerVis.oneway. Best-guess/overridable (NEIGHBORHOOD-INPUTS §0.0).
//
// Renders on the XZ ground plane like the other Survey overlays (arrowhead
// laid flat, high renderOrder, depthTest off so it reads over the pavement).
import { useMemo, useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'
import useCartographStore from './stores/useCartographStore.js'

const OVERLAY_Z = 10000
const ARROW_Y = 0.7        // just above the flat V2 surface
const SPACING = 42         // metres between chevrons along a chain
const AMBER = '#ffb03a'

// A single arrowhead pointing +X, laid flat on XZ. RotationY then aims it
// along each segment's travel direction. Built per-mount (useMemo) so a
// scene-switch unmount can't dispose a shared singleton.
function buildArrowGeo() {
  const w = 4.0, h = 3.0, notch = 1.3
  const s = new THREE.Shape()
  s.moveTo(w / 2, 0)
  s.lineTo(-w / 2, h / 2)
  s.lineTo(-w / 2 + notch, 0)
  s.lineTo(-w / 2, -h / 2)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)   // XY shape → flat on the XZ ground; +X stays +X
  return g
}

// Walk each one-way chain's centerline, emitting an arrow every SPACING metres
// oriented along the local segment. World +X maps to travel dir (dx,dz) at
// rotationY = atan2(-dz, dx).
function placements(streets) {
  const out = []
  for (const st of streets || []) {
    if (!st?.oneway || st.disabled) continue
    const pts = st.points
    if (!pts || pts.length < 2) continue
    let carry = SPACING * 0.5   // first chevron offset in from the chain start
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i].x, z0 = pts[i].z, x1 = pts[i + 1].x, z1 = pts[i + 1].z
      const dx = x1 - x0, dz = z1 - z0
      const len = Math.hypot(dx, dz)
      if (len < 1e-3) continue
      const rotY = Math.atan2(-dz, dx)
      for (let d = carry; d < len; d += SPACING) {
        const t = d / len
        out.push({ x: x0 + dx * t, z: z0 + dz * t, rotY })
      }
      carry = ((carry - len) % SPACING + SPACING) % SPACING
    }
  }
  return out
}

export default function OneWayArrows() {
  const centerlineData = useCartographStore(s => s.centerlineData)
  const layerVis = useCartographStore(s => s.layerVis)
  const hidden = layerVis?.oneway === false
  const items = useMemo(
    () => placements(centerlineData?.streets || []),
    [centerlineData],
  )
  const geo = useMemo(() => buildArrowGeo(), [])
  const ref = useRef()
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || !items.length) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const scale = new THREE.Vector3(1, 1, 1)
    const pos = new THREE.Vector3()
    for (let i = 0; i < items.length; i++) {
      const c = items[i]
      q.setFromAxisAngle(up, c.rotY)
      pos.set(c.x, ARROW_Y, c.z)
      m.compose(pos, q, scale)
      mesh.setMatrixAt(i, m)
    }
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
  }, [items])

  if (hidden || !items.length) return null
  return (
    <instancedMesh
      key={items.length}   // re-alloc buffer when the count changes (scene switch)
      ref={ref}
      args={[geo, undefined, items.length]}
      renderOrder={OVERLAY_Z + 2}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color={AMBER}
        transparent
        opacity={0.9}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}
