/**
 * ChassisPlate — B2 (2026-06-25): a live-rendered flat-GRAY silhouette of one
 * chassis GLB, as a fashion plate. The matcher's top-N ranked chassis render as
 * a small grid of these (live-render-top-N, operator-confirmed — not a 141-thumb
 * bake; the full library stays behind a "browse all"). Each plate is its own
 * `frameloop="demand"` Canvas (renders once on load, then static — N small
 * contexts, kept small by top-N). Per-plate Approve badge = the green-light gate
 * (approved → ships to the Grove). SALON-INTERFACE.md §5 / §2 (silhouette = the
 * most parametric part; gray shows pure structure).
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// One shared gray material — pure structure, no surface (the point of a
// silhouette plate is branching habit, nothing else).
const GRAY = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.85, metalness: 0 })

// A chassis silhouette is woody STRUCTURE only — strip the leaf prims (vendor
// GLBs carry them). Detect by atlasKind extras (if stamped) or leaf-keyword on
// the mesh/material name (raw chassis aren't atlas-stamped).
const LEAF_RE = /leaf|leaves|foliage|frond|needle/i
function isLeafMesh(o) {
  if (o.geometry?.userData?.atlasKind === 'leaf') return true
  if (LEAF_RE.test(o.name || '')) return true
  const m = o.material
  const mname = Array.isArray(m) ? m.map((x) => x?.name).join(' ') : m?.name
  return LEAF_RE.test(mname || '')
}

function Silhouette({ url }) {
  const { scene } = useGLTF(url)
  const invalidate = useThree((s) => s.invalidate)
  const obj = useMemo(() => {
    const s = scene.clone(true)
    const all = [], leaves = []
    s.traverse((o) => { if (o.isMesh) { all.push(o); if (isLeafMesh(o)) leaves.push(o) } })
    all.forEach((o) => { o.material = GRAY; o.castShadow = false; o.receiveShadow = false })
    // Strip leaves UNLESS the chassis is one merged mesh (can't separate → keep,
    // else the plate goes blank).
    if (leaves.length < all.length) leaves.forEach((o) => o.removeFromParent())
    // Normalize: fit the (wood) chassis into a ~2-unit-tall frame, base on the
    // floor, centered in X/Z, so every plate frames consistently.
    const box = new THREE.Box3().setFromObject(s)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)
    const k = 2.0 / (Math.max(size.x, size.y, size.z) || 1)
    s.scale.setScalar(k)
    s.position.set(-center.x * k, -box.min.y * k, -center.z * k)
    return s
  }, [scene])
  // demand-render: paint once the silhouette is built (Suspense resolved).
  useEffect(() => { invalidate() }, [obj, invalidate])
  return <primitive object={obj} />
}

export default function ChassisPlate({ name, label, selected, approved, onPick, onApprove }) {
  const url = `/trees/_chassis/${name}.glb`
  return (
    <div
      onClick={() => onPick(name)}
      title={label}
      style={{
        position: 'relative', borderRadius: 5, padding: 3, cursor: 'pointer',
        background: selected ? 'rgba(120,160,220,0.18)' : 'rgba(255,255,255,0.03)',
        border: '1px solid ' + (selected ? 'rgba(120,160,220,0.75)' : 'rgba(255,255,255,0.08)'),
        display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch',
      }}>
      <div style={{
        width: '100%', aspectRatio: '1 / 1', borderRadius: 3, overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', position: 'relative',
      }}>
        <Canvas frameloop="demand" dpr={[1, 1.5]}
          camera={{ position: [0, 1.0, 3.4], fov: 32, near: 0.1, far: 50 }}
          gl={{ alpha: true, antialias: true }} style={{ background: 'transparent' }}>
          <ambientLight intensity={0.75} />
          <directionalLight position={[2, 4, 3]} intensity={1.1} />
          <Suspense fallback={null}>
            <Silhouette url={url} />
          </Suspense>
        </Canvas>
        {/* Approve badge — the green-light gate, per plate. Stop propagation so
            tapping it toggles approval without also re-picking the chassis. */}
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onApprove(name) }}
          title={approved === true ? 'Approved — ships to the Grove (click to unset)'
               : approved === false ? 'Rejected (click to clear)' : 'Approve this chassis'}
          style={{
            position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 4,
            border: '1px solid ' + (approved === true ? 'rgba(80,200,140,0.7)'
                                  : approved === false ? 'rgba(230,120,120,0.6)' : 'rgba(255,255,255,0.2)'),
            background: approved === true ? 'rgba(80,200,140,0.28)' : 'rgba(0,0,0,0.45)',
            color: approved === true ? '#9ed8b0' : approved === false ? '#e87878' : '#999',
            cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0,
          }}>
          {approved === true ? '★' : approved === false ? '✗' : '·'}
        </button>
      </div>
      <span style={{
        fontSize: 9, color: selected ? '#cdd6df' : '#99a', textAlign: 'center',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
    </div>
  )
}
