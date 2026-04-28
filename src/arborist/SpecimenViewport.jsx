/**
 * SpecimenViewport — renders one specimen's point cloud via Three.js
 * PLYLoader. Backend caches the .laz → .ply conversion so first hit is
 * a few hundred ms, repeat hits are instant.
 *
 * Camera framing assumes the PLY is centered on XY median + Z-floored
 * to 0 by preview-laz.py — so any tree-shaped specimen (~6 m to ~28 m
 * tall, ~5–15 m crown) frames cleanly with a fixed orbit camera. No
 * runtime auto-fit needed for v1.
 */
import { Suspense, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import * as THREE from 'three'

function PointCloud({ url }) {
  const geometry = useLoader(PLYLoader, url)
  // PLY axis convention: source files use Z-up (forestry standard);
  // Three.js cameras assume Y-up. Rotate -90° about X so the trunk
  // goes vertical in the viewport.
  const oriented = useMemo(() => {
    const g = geometry.clone()
    g.rotateX(-Math.PI / 2)
    g.computeBoundingBox()
    return g
  }, [geometry])
  return (
    <points geometry={oriented}>
      <pointsMaterial size={0.05} sizeAttenuation color="#cfd6cf" />
    </points>
  )
}

function Stage() {
  // Subtle ground reference + low ambient. The point cloud is already
  // centered + floored at 0, so a 30 m grid at y=0 reads as the ground.
  return (
    <>
      <ambientLight intensity={0.6} />
      <gridHelper args={[30, 15, '#222', '#1a1a1a']} position={[0, 0, 0]} />
    </>
  )
}

export default function SpecimenViewport({ treeId }) {
  if (!treeId) {
    return (
      <div style={{
        height: '100%', display: 'grid', placeItems: 'center',
        color: '#555', fontSize: 12,
      }}>Select a specimen to preview</div>
    )
  }
  // Key on treeId so PLYLoader / Suspense fully reset between specimens —
  // avoids any stale geometry sticking around between rapid clicks.
  return (
    <Canvas
      key={treeId}
      camera={{ position: [22, 14, 22], near: 0.1, far: 500, fov: 45 }}
      style={{ background: '#0e0e0e' }}
    >
      <Stage />
      <Suspense fallback={null}>
        <PointCloud url={`/api/arborist/specimens/${treeId}/preview.ply`} />
      </Suspense>
      <OrbitControls
        target={[0, 10, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={120}
      />
    </Canvas>
  )
}
