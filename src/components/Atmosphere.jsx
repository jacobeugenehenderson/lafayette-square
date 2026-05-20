/**
 * <Atmosphere /> — raymarched volumetric cloud slab.
 *
 * Phase 4b.1: replaces v1 <CloudDome /> with a BoxGeometry slab whose
 * fragment shader does an analytic ray–slab intersection and marches
 * the procedural cloud field (3D FBM + domain warp + vertical density
 * profile) with three-tier lighting, self-shadowing, and silver-lining
 * forward scatter.
 *
 * Phase 4b.2 (this commit): the twelve shape + lighting uniforms now
 * read from the active preset's per-param TodChannels each frame via
 * `resolveGroupAtMinute`. Operator slider mutations land synchronously
 * in the store's in-memory `presets` array (per `_patchParam`); the
 * next useFrame picks them up — no debounce wait. Animated channels
 * lerp between TOD slot waypoints as the time strip scrubs.
 *
 * The BoxGeometry is rendered BackSide so the shader still receives a
 * fragment if the camera ever enters the slab. The analytic slab
 * intersection in the fragment shader gives correct tEnter/tExit
 * regardless of which face of the box the rasterizer hit.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { createAtmosphereMaterial, SLAB_BASE_ALT, SLAB_THICKNESS, SLAB_HALF_XZ } from './atmosphere-materials.js'
import useMeteorologistStore from '../meteorologist/stores/useMeteorologistStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'

// Twelve cloud-param TodChannels → twelve shader uniforms. uWindScale lives
// in Conditions/directive (not in CLOUD_PARAM_FIELDS) so it's not wired here.
// noiseSeed + octaves write through as floats; the shader casts as needed.
const PARAM_TO_UNIFORM = {
  coverage:       'uCoverage',
  density:        'uDensity',
  thickness:      'uThickness',
  baseAlt:        'uBaseAlt',
  warpFreq:       'uWarpFreq',
  warpAmp:        'uWarpAmp',
  noiseSeed:      'uNoiseSeed',
  octaves:        'uOctaves',
  sunScatter:     'uSunScatter',
  ambientFloor:   'uAmbientFloor',
  edgeSilver:     'uEdgeSilver',
  shadowStrength: 'uShadowStrength',
}

// Single-field channel — resolveGroupAtMinute returns { value }.
const CHANNEL_FIELD_KEYS = ['value']

export default function Atmosphere(/* { lookId } */) {
  const material = useMemo(() => createAtmosphereMaterial(), [])
  const meshRef = useRef()

  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uCameraPos.value.copy(camera.position)

    // Drive shape + lighting uniforms from the active preset's per-param
    // channels. The store's _patchParam mutates `presets` synchronously so
    // operator slider drags reflect on the next frame — no autosave wait.
    const preset = useMeteorologistStore.getState().getActivePreset()
    if (!preset?.params) return
    const tod = useTimeOfDay.getState()
    const minute = tod.currentTime.getHours() * 60 + tod.currentTime.getMinutes()
    const slotMinutes = getTodSlotMinutes(tod.currentTime)
    for (const [paramKey, uniformKey] of Object.entries(PARAM_TO_UNIFORM)) {
      const channel = preset.params[paramKey]
      if (!channel) continue
      const uniform = material.uniforms[uniformKey]
      if (!uniform) continue
      const defaults = { value: uniform.value }
      const resolved = resolveGroupAtMinute(channel, minute, slotMinutes, CHANNEL_FIELD_KEYS, defaults)
      uniform.value = resolved.value
    }
  })

  const slabY = SLAB_BASE_ALT + SLAB_THICKNESS * 0.5
  const slabW = SLAB_HALF_XZ * 2

  return (
    <mesh ref={meshRef} position={[0, slabY, 0]} material={material} frustumCulled={false}>
      <boxGeometry args={[slabW, SLAB_THICKNESS, slabW]} />
    </mesh>
  )
}
