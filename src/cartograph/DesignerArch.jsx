/**
 * DesignerArch — flat-black plan-view silhouette of the Gateway Arch
 * shown only in the cartograph Designer mode. Shares the catenary
 * geometry with the shared GatewayArch consumer (src/components/
 * GatewayArch.jsx) so the 2D shadow reads as "that's the arch from
 * above" — matches the black-footprint language used by buildings /
 * park in plan view.
 *
 * Extracted from src/stage/StageArch.jsx 2026-05-13 (SC.7). Lives in
 * the cartograph chunk because it's Designer-only and reads
 * useCartographStore directly (store-reach is acceptable inside the
 * cartograph bundle, forbidden inside the production / Preview shared
 * consumer).
 */
import { useMemo, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { createArchGeometry } from '../components/GatewayArch.jsx'
import useCartographStore from './stores/useCartographStore.js'
import { placedLook, onPlaceMoved, townPlace } from '../lib/townPlace.js'
import { archSite, archPose } from '../setpieces/gatewayArch.js'

// Drawn where the 3D Arch stands: its real feet through the town's place (src/setpieces/gatewayArch.js), with the Look's
// scale and rotation (archPose). CartographApp places the active town in a layout effect, so the first render may precede it.
export function DesignerArch() {
  const archChannel = useCartographStore(s => s.arch)
  const lookId = useCartographStore(s => s.activeLookId)
  const placed = useSyncExternalStore(onPlaceMoved, placedLook)
  const geometry = useMemo(() => createArchGeometry(), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000' }), [])
  const a = archChannel?.values
  if (!a || placed !== lookId) return null
  const pose = archPose(archSite(townPlace()), a)
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[pose.x, 0, pose.z]}
      rotation={[0, pose.rotation, 0]}
      scale={pose.scale}
      frustumCulled={false}
    />
  )
}
