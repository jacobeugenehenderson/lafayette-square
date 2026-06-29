import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useUserLocation from '../hooks/useUserLocation'
import useCamera from '../hooks/useCamera'
import { getElevationRaw } from '../utils/elevation'
import { terrainExag } from '../utils/terrainShader'

const DOT_RADIUS = 3
const RING_RADIUS = 6
// Float just above the ground so the disc never z-fights the terrain it rides.
const DOT_CLEARANCE = 2
// "You are here" must never be hidden by what it sits on — at the user's own
// building the roof is directly above the dot in the top-down view. depthTest:
// false + a high renderOrder draws it over everything, like a map locator.
const RENDER_ORDER = 9999

export default function UserDot() {
  const dotRef = useRef()
  const ringRef = useRef()
  const groupRef = useRef()
  const viewMode = useCamera((s) => s.viewMode)
  const x = useUserLocation((s) => s.x)
  const z = useUserLocation((s) => s.z)
  const inBounds = useUserLocation((s) => s.inBounds)

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#f97316',
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,   // always-on-top locator (see RENDER_ORDER below)
  }), [])

  useFrame(({ clock }) => {
    // Ride the terrain at the user's real (GPS-derived) x/z. Ground height =
    // raw elevation × the runtime exag uniform (matches how the ground mesh,
    // buildings, and park objects displace), so the dot stays on the surface in
    // every view — flat Browse (exag 0) and elevated planetarium (exag 1) alike,
    // instead of a fixed Y that buries it. x/z stay device-driven; only the
    // height is derived. (2026-06-28 — "user dot trapped underground".)
    if (groupRef.current && x != null && z != null) {
      groupRef.current.position.y = getElevationRaw(x, z) * terrainExag.value + DOT_CLEARANCE
    }
    if (!ringRef.current) return
    // Gentle pulse: scale 1.0 → 1.6 over 2 seconds
    const t = (Math.sin(clock.elapsedTime * Math.PI) + 1) / 2
    const s = 1 + t * 0.6
    ringRef.current.scale.set(s, s, 1)
    ringMat.opacity = 0.35 * (1 - t * 0.6)
  })

  if (viewMode === 'hero' || x == null || z == null || !inBounds) return null

  return (
    <group ref={groupRef} position={[x, getElevationRaw(x, z) * terrainExag.value + DOT_CLEARANCE, z]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Solid blue dot — drawn last so it sits atop the border + ring */}
      <mesh ref={dotRef} renderOrder={RENDER_ORDER + 2}>
        <circleGeometry args={[DOT_RADIUS, 24]} />
        <meshBasicMaterial color="#f97316" depthWrite={false} depthTest={false} />
      </mesh>
      {/* White border */}
      <mesh position={[0, 0, -0.01]} renderOrder={RENDER_ORDER + 1}>
        <ringGeometry args={[DOT_RADIUS, DOT_RADIUS + 1, 24]} />
        <meshBasicMaterial color="#ffffff" depthWrite={false} depthTest={false} />
      </mesh>
      {/* Pulsing ring */}
      <mesh ref={ringRef} position={[0, 0, -0.02]} renderOrder={RENDER_ORDER} material={ringMat}>
        <ringGeometry args={[RING_RADIUS - 1, RING_RADIUS, 32]} />
      </mesh>
    </group>
  )
}
