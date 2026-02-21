import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useUserLocation from '../hooks/useUserLocation'
import useCamera from '../hooks/useCamera'

const DOT_RADIUS = 3
const RING_RADIUS = 6

export default function UserDot() {
  const dotRef = useRef()
  const ringRef = useRef()
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
  }), [])

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    // Gentle pulse: scale 1.0 → 1.6 over 2 seconds
    const t = (Math.sin(clock.elapsedTime * Math.PI) + 1) / 2
    const s = 1 + t * 0.6
    ringRef.current.scale.set(s, s, 1)
    ringMat.opacity = 0.35 * (1 - t * 0.6)
  })

  if (viewMode === 'hero' || x == null || z == null || !inBounds) return null

  return (
    <group position={[x, 35, z]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Solid blue dot */}
      <mesh ref={dotRef}>
        <circleGeometry args={[DOT_RADIUS, 24]} />
        <meshBasicMaterial color="#f97316" depthWrite={false} />
      </mesh>
      {/* White border */}
      <mesh position={[0, 0, -0.01]}>
        <ringGeometry args={[DOT_RADIUS, DOT_RADIUS + 1, 24]} />
        <meshBasicMaterial color="#ffffff" depthWrite={false} />
      </mesh>
      {/* Pulsing ring */}
      <mesh ref={ringRef} position={[0, 0, -0.02]} material={ringMat}>
        <ringGeometry args={[RING_RADIUS - 1, RING_RADIUS, 32]} />
      </mesh>
    </group>
  )
}
