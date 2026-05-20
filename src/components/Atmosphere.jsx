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
import useAtmosphere from '../hooks/useAtmosphere.js'
import { getPresetsCache } from '../hooks/useAtmosphereDirective.js'

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

// Phase 5a — directive-driven uniform binding for production (no
// authoring preset). Looks up each preset in the directive's blend
// against the cached presets.json, resolves each param at the current
// minute via resolveGroupAtMinute, then weighted-blends across the
// blend's presets and writes to the matching uniform.
//
// v0 simplification: weighted-blends across multiple presets where each
// preset's channel resolves at the current minute. Presets in the blend
// that aren't in the cache are skipped (with their weight excluded from
// the normalization). If no presets resolve, the function returns
// without touching uniforms — Atmosphere falls back to whatever the
// uniforms already held (hardcoded defaults from createAtmosphereMaterial).
function bindUniformsFromDirective(material, directive, minute, slotMinutes, presetsCache) {
  const blend = directive?.clouds
  if (!blend?.length || !presetsCache?.presets) return false
  const presetById = presetsCache._byId || (presetsCache._byId = Object.fromEntries(
    presetsCache.presets.map(p => [p.id, p])
  ))

  let totalWeight = 0
  const resolved = []
  for (const entry of blend) {
    const preset = presetById[entry.preset]
    if (!preset?.params) continue
    const w = entry.weight ?? 0
    if (w <= 0) continue
    totalWeight += w
    resolved.push({ preset, weight: w })
  }
  if (!totalWeight) return false

  for (const [paramKey, uniformKey] of Object.entries(PARAM_TO_UNIFORM)) {
    const uniform = material.uniforms[uniformKey]
    if (!uniform) continue
    const defaults = { value: uniform.value }
    let acc = 0
    for (const { preset, weight } of resolved) {
      const channel = preset.params[paramKey]
      if (!channel) continue
      const r = resolveGroupAtMinute(channel, minute, slotMinutes, CHANNEL_FIELD_KEYS, defaults)
      acc += (r.value ?? defaults.value) * weight
    }
    uniform.value = acc / totalWeight
  }
  return true
}

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

    // Drive shape + lighting uniforms. Authoring path wins: if
    // Meteorologist Teacup has a preset loaded, slider drags drive
    // uniforms directly. Otherwise fall back to the live directive
    // (Phase 5a — production atmosphere reads from Almanac
    // selection + tween).
    const preset = useMeteorologistStore.getState().getActivePreset()
    const directive = useAtmosphere.getState().tweenedDirective
    let usedDirective = false
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
    } else if (directive) {
      usedDirective = bindUniformsFromDirective(material, directive, minute, slotMinutes, getPresetsCache())
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

    // Directive override of sun/sky color when no authoring preset is
    // active. The Almanac's authored sun.tint + lightDome ARE the
    // weather-aware lighting (thunderstorm dim, post-storm gold);
    // they overwrite the sky-light coupling values when present so the
    // Almanac wins over the sky channel for cloud lighting on
    // weather-coloured days. Sky channel still drives the dome itself —
    // this only affects what light Atmosphere sees the clouds catch.
    if (usedDirective && directive) {
      if (directive.sun?.tint) {
        material.uniforms.uSunColor.value.set(directive.sun.tint)
      }
      if (directive.lightDome?.horizon) {
        material.uniforms.uSkyColor.value.set(directive.lightDome.horizon)
      }
      if (directive.lightDome?.ambientFloor != null) {
        material.uniforms.uAmbientFloor.value = directive.lightDome.ambientFloor
      }
    }

    // Wind from the directive — speed scales the existing advection,
    // dir orients it. uWindDir is a unit XZ vector; dir is degrees the
    // wind blows FROM (meteorological convention). Convert to a TO
    // vector so positive uTime drift moves clouds with the wind.
    if (directive?.wind) {
      material.uniforms.uWindScale.value = directive.wind.scale ?? 1.0
      const fromRad = (directive.wind.dir ?? 0) * Math.PI / 180
      // FROM → TO: add π. XZ in three: +X east, +Z south.
      material.uniforms.uWindDir.value.set(
        -Math.sin(fromRad),
        0,
        -Math.cos(fromRad),
      ).normalize()
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
