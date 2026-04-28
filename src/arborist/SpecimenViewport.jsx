/**
 * SpecimenViewport — workstage's 3D canvas. Two modes:
 *
 *   cloud     → input point cloud, loaded from
 *               /api/arborist/specimens/:treeId/preview.ply
 *   skeleton  → baked variant GLB, loaded from
 *               /trees/:species/skeleton-N.glb (per the manifest)
 *
 * The mode is driven by the store's viewMode; this component just
 * picks the right loader. Camera + orbit framing is shared.
 */
import { Suspense, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'

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
      {/* Dark points so the cloud reads against the white cyclorama. */}
      <pointsMaterial size={0.045} sizeAttenuation color="#1a2418" />
    </points>
  )
}

function Skeleton({ url }) {
  // bake-tree.py emits trimesh GLBs with the trunk along +Z (forestry
  // convention preserved). Apply the same -90° X rotation as PLYs so
  // both modes line up in the viewport.
  const { scene } = useGLTF(url)
  return (
    <primitive
      object={scene}
      rotation={[-Math.PI / 2, 0, 0]}
      // Walk the GLB's children so the imported meshes cast shadows.
      onUpdate={(g) => g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })}
    />
  )
}

function Cyclorama() {
  // Large white sweep: floor + back wall, bridged by a quarter cylinder so
  // the seam reads as a continuous infinity. Lit by a hemisphere ambient
  // (soft sky → floor) plus a subtle key light to give the tree shape +
  // a soft shadow on the floor. Same idea as a product-photography studio.
  return (
    <>
      <color attach="background" args={['#f7f5f1']} />
      <hemisphereLight args={['#ffffff', '#e8e4dc', 0.85]} />
      <directionalLight
        position={[8, 22, 12]} intensity={0.55}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
      />
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#f7f5f1" roughness={1} />
      </mesh>
      {/* Curved sweep — quarter cylinder bridging floor → back wall.
          Open at the front (toward the camera) so the tree sits in front
          of the curve. Radius is large relative to tree height so the curve
          reads as a soft infinity, not a tight backdrop. */}
      <mesh rotation={[0, 0, 0]} position={[0, 0, -25]}>
        <cylinderGeometry args={[60, 60, 80, 64, 1, true, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#f7f5f1" roughness={1} side={2 /* DoubleSide */} />
      </mesh>
    </>
  )
}

export default function SpecimenViewport({ mode, cloudUrl, glbUrl, viewKey }) {
  if (mode === 'skeleton' && !glbUrl) {
    return (
      <div style={{
        height: '100%', display: 'grid', placeItems: 'center',
        color: '#666', fontSize: 12, padding: 24, textAlign: 'center', lineHeight: 1.5,
      }}>
        No baked variant for this specimen.<br />
        Pick + Save + Bake — or switch to <strong>Cloud</strong> to inspect the source.
      </div>
    )
  }
  if (mode === 'cloud' && !cloudUrl) {
    return (
      <div style={{
        height: '100%', display: 'grid', placeItems: 'center',
        color: '#555', fontSize: 12,
      }}>Select a specimen to preview</div>
    )
  }
  // viewKey forces a clean Canvas remount when the URL changes — avoids
  // any stale loader state between rapid clicks or mode flips.
  return (
    <Canvas
      key={viewKey}
      shadows
      camera={{ position: [22, 14, 22], near: 0.1, far: 500, fov: 45 }}
    >
      <Cyclorama />
      <Suspense fallback={null}>
        {mode === 'cloud'    && cloudUrl && <PointCloud url={cloudUrl} />}
        {mode === 'skeleton' && glbUrl   && <Skeleton url={glbUrl} />}
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
