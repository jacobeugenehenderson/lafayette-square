/**
 * weather-uniforms — module-level THREE.IUniform singletons shared between
 * Phase 7 atmospheric-consumer drivers (WetnessDriver, SnowAccumulationDriver,
 * LightningDriver) and opt-in shaders (BakedGround, LafayetteScene buildings,
 * atmosphere cloud shader).
 *
 * Drivers mutate `.value`; consumers pass the same uniform object by
 * reference into their `shader.uniforms` map, picking up writes next frame.
 * No store subscription overhead.
 *
 *   uWetness          ∈ [0,1]  — rain integrator. Darkens albedo + drops
 *                                 roughness on top-facing surfaces.
 *   uSnowAccumulation ∈ [0,1]  — snow integrator. Mixes diffuse toward
 *                                 white on top-facing normals.
 *   uLightningFlash   ∈ [0,1]  — fast spike (50ms attack / 200ms decay)
 *                                 driven by LightningDriver. Boosts
 *                                 ambient + cloud lighting briefly.
 *
 * `applyWeatherToShader(shader)` injects the GLSL block any onBeforeCompile
 * caller can use. Patches MeshStandardMaterial-derived shaders by
 * extending the `<map_fragment>` chunk; the wet/snow modulation reads
 * world-space normal Y (top-facing mask). Lightning brightens uniformly.
 */
import * as THREE from 'three'

export const WEATHER_UNIFORMS = {
  uWetness:          { value: 0.0 },
  uSnowAccumulation: { value: 0.0 },
  uLightningFlash:   { value: 0.0 },
}

const VERT_DECLARE = `
varying vec3 vWeatherWorldNormal;
`

const VERT_BODY = `
vWeatherWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`

const FRAG_DECLARE = `
uniform float uWetness;
uniform float uSnowAccumulation;
uniform float uLightningFlash;
varying vec3 vWeatherWorldNormal;
`

const FRAG_BODY = `
{
  float topFacing = clamp(vWeatherWorldNormal.y, 0.0, 1.0);
  float snowMask = uSnowAccumulation * topFacing;
  float wetMask  = uWetness * topFacing * (1.0 - uSnowAccumulation);
  // Wet: darken albedo (~45% mix toward 0.55x), specular suppression
  // happens implicitly via the roughness adjust below.
  diffuseColor.rgb *= mix(1.0, 0.55, wetMask);
  // Snow: whiten albedo. Slight blue cast reads as snow vs flat white.
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.00), snowMask);
  // Lightning: brief brightening, applied uniformly (not normal-gated).
  diffuseColor.rgb += vec3(0.40, 0.42, 0.55) * uLightningFlash;
}
`

const ROUGHNESS_BODY = `
{
  float topFacing = clamp(vWeatherWorldNormal.y, 0.0, 1.0);
  float wetMask  = uWetness * topFacing * (1.0 - uSnowAccumulation);
  // Wet surfaces become smooth — boost specular by collapsing roughness.
  roughnessFactor = mix(roughnessFactor, 0.18, wetMask);
}
`

/**
 * Inject weather uniforms + GLSL into a shader object received in
 * `material.onBeforeCompile(shader)`. Idempotent within a single shader
 * compile (the marker comment guards against double-injection if a
 * caller chains another onBeforeCompile that also calls us).
 *
 * Call AFTER any other shader chunk edits in the same onBeforeCompile so
 * the wet/snow modulation sees the final `diffuseColor.rgb` set by the
 * material's prior color stage.
 */
export function applyWeatherToShader(shader) {
  if (shader.__weatherInjected) return
  shader.__weatherInjected = true

  shader.uniforms.uWetness          = WEATHER_UNIFORMS.uWetness
  shader.uniforms.uSnowAccumulation = WEATHER_UNIFORMS.uSnowAccumulation
  shader.uniforms.uLightningFlash   = WEATHER_UNIFORMS.uLightningFlash

  // Vertex: world normal varying.
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    '#include <common>\n' + VERT_DECLARE
  )
  shader.vertexShader = shader.vertexShader.replace(
    '#include <beginnormal_vertex>',
    '#include <beginnormal_vertex>\n' + VERT_BODY
  )

  // Fragment: declare + modulate. Insert AFTER <map_fragment> so any
  // texture sample is already in diffuseColor.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\n' + FRAG_DECLARE
  )
  // Inject AFTER <color_fragment> (not map_fragment) so we modulate the
  // material's final albedo write — grass material rewrites diffuseColor
  // inside color_fragment, so a map_fragment hook gets clobbered.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    '#include <color_fragment>\n' + FRAG_BODY
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    '#include <roughnessmap_fragment>\n' + ROUGHNESS_BODY
  )
}

/**
 * Convenience for materials that DON'T already have an onBeforeCompile —
 * wraps the material with one that applies weather modulation.
 * Caller must provide a unique cacheKey suffix so this material's program
 * doesn't collapse onto another patched variant
 * (feedback_unique_program_cache_key_before_wrappers).
 */
export function patchMaterialWithWeather(material, cacheKeySuffix = 'default') {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader) => {
    if (prev && prev !== material.onBeforeCompile) prev(shader)
    applyWeatherToShader(shader)
  }
  const prevKey = material.customProgramCacheKey
  material.customProgramCacheKey = prevKey
    ? () => `${prevKey()}|wx-${cacheKeySuffix}`
    : () => `wx-${cacheKeySuffix}`
  return material
}
