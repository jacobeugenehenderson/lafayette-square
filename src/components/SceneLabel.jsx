import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import useCartographStore from '../cartograph/stores/useCartographStore.js'

// Shared text label renderer. drei <Text> (TroikaText/SDF) at fontSize=1;
// world scale is rewritten every frame so the label hits a target screen
// height in pixels, clamped to [minPx, maxPx]. All style params route
// through useCartographStore(s => s.labels) so the Designer Labels panel
// is the single authoring surface.
//
// `tier` ('street' | 'park') multiplies the target pixel size via
// labels.tierScale[tier]. New tiers (landmark, poi, …) add an entry
// there — no renderer change needed.
//
// renderOrder + depthTest=false keep labels on top of terrain-displaced
// ground and median grass without z-fighting (carries over from the
// retired canvas-sprite LabelSprite's PRI.labels=16 behavior).
const RENDER_ORDER = 16

const _tmpVec = new THREE.Vector3()

export default function SceneLabel({ position, rotation, text, tier = 'street' }) {
  const style = useCartographStore(s => s.labels) || {}
  const groupRef = useRef()
  const { camera, size } = useThree()

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const targetPx = style.targetPx ?? 24
    const minPx    = style.minPx    ?? 14
    const maxPx    = style.maxPx    ?? 48
    const tierMul  = (style.tierScale && style.tierScale[tier]) ?? 1
    const desiredPx = Math.max(minPx, Math.min(maxPx, targetPx * tierMul))
    // worldUnitsPerPixel depends on camera type:
    //   Perspective: 2 * dist * tan(fov/2) / viewportHeight
    //   Orthographic: viewportHeightInWorldUnits / viewportHeightInPixels
    //     where viewportHeightInWorldUnits = (top - bottom) / zoom
    let worldPerPx
    if (camera.isOrthographicCamera) {
      const viewH = (camera.top - camera.bottom) / (camera.zoom || 1)
      worldPerPx = viewH / size.height
    } else {
      const dist = g.getWorldPosition(_tmpVec).distanceTo(camera.position)
      const fovRad = ((camera.fov ?? 50) * Math.PI) / 180
      worldPerPx = (2 * dist * Math.tan(fovRad / 2)) / size.height
    }
    if (!Number.isFinite(worldPerPx) || worldPerPx <= 0) return
    g.scale.setScalar(desiredPx * worldPerPx)
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation || [0, 0, 0]}>
      <Text
        fontSize={1}
        color={style.fill ?? '#e8e8f0'}
        outlineWidth={style.haloWidth ?? 0.07}
        outlineColor={style.halo ?? '#14141c'}
        letterSpacing={style.letterSpacing ?? 0.05}
        fillOpacity={style.opacity ?? 1}
        outlineOpacity={style.opacity ?? 1}
        anchorX="center"
        anchorY="middle"
        renderOrder={RENDER_ORDER}
      >
        {text}
      </Text>
    </group>
  )
}
