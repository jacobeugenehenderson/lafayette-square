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
import { useMemo } from 'react'
import * as THREE from 'three'
import { createArchGeometry } from '../components/GatewayArch.jsx'
import useCartographStore from './stores/useCartographStore.js'
import { ARCH_FLAT_DEFAULTS } from './skyLightChannels.js'

export function DesignerArch() {
  const archChannel = useCartographStore(s => s.arch)
  const a = archChannel?.values || ARCH_FLAT_DEFAULTS
  const geometry = useMemo(() => createArchGeometry(), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000' }), [])
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[a.distance * a.bearingX, 0, a.distance * a.bearingZ]}
      rotation={[0, a.rotation, 0]}
      scale={a.scale}
      frustumCulled={false}
    />
  )
}
