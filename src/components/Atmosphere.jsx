/**
 * <Atmosphere /> — raymarched volumetric cloud slab.
 *
 * Phase 4b.1: replaces v1 <CloudDome /> with a BoxGeometry slab whose
 * fragment shader does an analytic ray–slab intersection and marches
 * the procedural cloud field (3D FBM + domain warp + vertical density
 * profile) with three-tier lighting, self-shadowing, and silver-lining
 * forward scatter.
 *
 * Phase 4b.2: the twelve shape + lighting uniforms now read from the
 * active preset's per-param TodChannels each frame via
 * `resolveGroupAtMinute`. Operator slider mutations land synchronously
 * in the store's in-memory `presets` array (per `_patchParam`); the
 * next useFrame picks them up — no debounce wait. Animated channels
 * lerp between TOD slot waypoints as the time strip scrubs.
 *
 * Phase 4b.2 amendment (sky-light coupling): uSunDir / uSunColor /
 * uSkyColor stop being hardcoded. uSunDir reads SunCalc at the
 * instance's lat/lon. uSunColor + uSkyColor read the Look's sky
 * channel (sunGlow band + low band) via the same resolveSkyAtMinute
 * the skydome shader consumes. Result: clouds warm at golden hour,
 * deepen at twilight, dim at night — automatically tracking the sky.
 * Operator sunGlow overrides at a given hour propagate to the cloud's
 * lit side; uniform sky authoring drives uniform cloud lighting.
 *
 * The BoxGeometry is rendered BackSide so the shader still receives a
 * fragment if the camera ever enters the slab. The analytic slab
 * intersection in the fragment shader gives correct tEnter/tExit
 * regardless of which face of the box the rasterizer hit.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import SunCalc from 'suncalc'
import { createAtmosphereMaterial, SLAB_BASE_ALT, SLAB_THICKNESS, SLAB_HALF_XZ } from './atmosphere-materials.js'
import useMeteorologistStore from '../meteorologist/stores/useMeteorologistStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { resolveSkyAtMinute } from '../cartograph/skyGrid.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { INSTANCE } from '../instance.js'

const LATITUDE = INSTANCE.geography.lat
const LONGITUDE = INSTANCE.geography.lon

// Same first-paint fallback shape CelestialBodies' SKY_DEFAULT_CHANNEL uses
// post-sky-pivot — empty overrides → pure procedural mosaic. Avoids a flash
// of hardcoded warm/grey-blue lighting in the ~100ms before scene.json
// resolves at mount.
const SKY_DEFAULT_CHANNEL = { overrides: [] }

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

export default function Atmosphere({ lookId } = {}) {
  const material = useMemo(() => createAtmosphereMaterial(), [])
  const meshRef = useRef()
  const scene = useSceneJson(lookId || INSTANCE.lookId)

  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uCameraPos.value.copy(camera.position)

    const tod = useTimeOfDay.getState()
    const currentTime = tod.currentTime
    const minute = currentTime.getHours() * 60 + currentTime.getMinutes()
    const slotMinutes = getTodSlotMinutes(currentTime)

    // Drive shape + lighting uniforms from the active preset's per-param
    // channels. The store's _patchParam mutates `presets` synchronously so
    // operator slider drags reflect on the next frame — no autosave wait.
    const preset = useMeteorologistStore.getState().getActivePreset()
    if (preset?.params) {
      for (const [paramKey, uniformKey] of Object.entries(PARAM_TO_UNIFORM)) {
        const channel = preset.params[paramKey]
        if (!channel) continue
        const uniform = material.uniforms[uniformKey]
        if (!uniform) continue
        const defaults = { value: uniform.value }
        const resolved = resolveGroupAtMinute(channel, minute, slotMinutes, CHANNEL_FIELD_KEYS, defaults)
        uniform.value = resolved.value
      }
    }

    // Sky-light coupling — read the Look's sky channel and SunCalc's real
    // sun position. Clouds catch sunGlow on the lit side and the sky's
    // low band as ambient. Same skyChannel resolver the skydome consumes.
    const skyChannel = scene?.sky ?? SKY_DEFAULT_CHANNEL
    const sky = resolveSkyAtMinute(skyChannel, minute, slotMinutes)
    if (sky) {
      // resolveSkyAtMinute returns [r, g, b] floats per band.
      material.uniforms.uSunColor.value.setRGB(sky.sunGlow[0], sky.sunGlow[1], sky.sunGlow[2])
      material.uniforms.uSkyColor.value.setRGB(sky.low[0], sky.low[1], sky.low[2])
    }

    // Real sun direction — same projection CelestialBodies uses
    // (celestialToPosition: x = cos(alt)·sin(az), y = sin(alt),
    //  z = -cos(alt)·cos(az)). Stable for months; treat as the authority.
    const sunPos = SunCalc.getPosition(currentTime, LATITUDE, LONGITUDE)
    material.uniforms.uSunDir.value.set(
      Math.cos(sunPos.altitude) * Math.sin(sunPos.azimuth),
      Math.sin(sunPos.altitude),
      -Math.cos(sunPos.altitude) * Math.cos(sunPos.azimuth),
    ).normalize()
  })

  const slabY = SLAB_BASE_ALT + SLAB_THICKNESS * 0.5
  const slabW = SLAB_HALF_XZ * 2

  return (
    <mesh ref={meshRef} position={[0, slabY, 0]} material={material} frustumCulled={false}>
      <boxGeometry args={[slabW, SLAB_THICKNESS, slabW]} />
    </mesh>
  )
}
