/**
 * <Atmosphere /> — raymarched volumetric cloud slab.
 *
 * Phase 4b.1: replaces v1 <CloudDome /> with a BoxGeometry slab whose
 * fragment shader does an analytic ray–slab intersection and marches
 * the procedural cloud field (3D FBM + domain warp + vertical density
 * profile) with three-tier lighting, self-shadowing, and silver-lining
 * forward scatter. All thirteen authoring uniforms are hardcoded to
 * cumulus_humilis values from public/clouds/presets.json. Phase 4b.2
 * wires them to active-preset TodChannel resolution.
 *
 * The BoxGeometry is rendered BackSide so the shader still receives a
 * fragment if the camera ever enters the slab. The analytic slab
 * intersection in the fragment shader gives correct tEnter/tExit
 * regardless of which face of the box the rasterizer hit.
 *
 * lookId is accepted for parity with Phase 4b.2's signature; today it
 * is unused (Phase 4b.1 hardcodes sun direction + colors).
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { createAtmosphereMaterial, SLAB_BASE_ALT, SLAB_THICKNESS, SLAB_HALF_XZ } from './atmosphere-materials.js'

export default function Atmosphere(/* { lookId } */) {
  const material = useMemo(() => createAtmosphereMaterial(), [])
  const meshRef = useRef()

  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uCameraPos.value.copy(camera.position)
  })

  const slabY = SLAB_BASE_ALT + SLAB_THICKNESS * 0.5
  const slabW = SLAB_HALF_XZ * 2

  return (
    <mesh ref={meshRef} position={[0, slabY, 0]} material={material} frustumCulled={false}>
      <boxGeometry args={[slabW, SLAB_THICKNESS, slabW]} />
    </mesh>
  )
}
