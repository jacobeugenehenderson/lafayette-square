import * as THREE from 'three'
import { lampGlow as _lampGlow } from '../preview/lampGlowState'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'

/**
 * Reusable factory for the noise-based park grass material.
 *
 * Returns `{ material, shaderRef }`. The caller is responsible for driving
 * `shaderRef.current.uniforms.uSunAltitude` per frame; the factory only
 * builds the material and exposes the shader once it compiles.
 *
 * Options:
 *   - lampLightmap:  optional THREE.DataTexture lookup for night lamp glow.
 *                    When omitted, lamp glow is skipped.
 *   - clipMask / clipMin / clipSize: optional SVG-rasterized boundary
 *                    discard. The ribbon park face renders inside its own
 *                    geometry so it doesn't need a clip; LafayettePark's
 *                    big SVG-extent plane does.
 *   - color:         base albedo (defaults to '#2d5a2d').
 */
export function makeGrassMaterial({
  lampLightmap = null, clipMask = null, clipMin = null, clipSize = null,
  color = '#2d5a2d',
  // Optional radial alpha fade — soft neighborhood-stencil edge.
  // { center: [x,z], inner, outer } ; alpha → 0 at outer.
  fade = null,
  // Baked lamp light-pool map (ground.poolmap.png). When provided, the warm
  // pool is sampled from it at world-XZ and scaled by the live TOD Pool value
  // (no night gate — the channel animates it). poolMin/poolSpan map world→UV.
  poolMap = null, poolMin = null, poolSpan = null, poolScale = 1,
} = {}) {
  const shaderRef = { current: null }
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, color })
  if (fade) material.transparent = true

  material.onBeforeCompile = (shader) => {
    // Phase 7c (Tempest, 2026-05-20): snow accumulates on top-facing
    // grass; wet barely shows on grass so the wet uniform contributes
    // little here. Inject FIRST so our injection of <color_fragment>
    // appears before the grass shader's own replacement of the same
    // chunk (later replace() calls operate on the modified string).
    applyWeatherToShader(shader)
    shader.uniforms.uSunAltitude = { value: 0.5 }
    shader.uniforms.uClipMap   = { value: clipMask }
    shader.uniforms.uClipMin   = { value: clipMin || new THREE.Vector2(0, 0) }
    shader.uniforms.uClipSize  = { value: clipSize || new THREE.Vector2(1, 1) }
    shader.uniforms.uHasClip   = { value: clipMask ? 1.0 : 0.0 }
    shader.uniforms.uLampMap   = { value: lampLightmap }
    shader.uniforms.uHasLamp   = { value: lampLightmap ? 1.0 : 0.0 }
    shader.uniforms.uLampGlow = _lampGlow.grassUniform
    // Baked lamp light-pool map — warm pool on the ground, sampled at
    // world-XZ, scaled by the live TOD Pool value (uPool = poolUniform).
    shader.uniforms.uPoolMap   = { value: poolMap }
    shader.uniforms.uHasPool   = { value: poolMap ? 1.0 : 0.0 }
    shader.uniforms.uPoolMin   = { value: new THREE.Vector2(poolMin?.[0] ?? 0, poolMin?.[1] ?? 0) }
    shader.uniforms.uPoolSpan  = { value: new THREE.Vector2(poolSpan?.[0] ?? 1, poolSpan?.[1] ?? 1) }
    shader.uniforms.uPoolScale = { value: poolScale }
    shader.uniforms.uPool      = _lampGlow.poolUniform
    shader.uniforms.uShadowStr = { value: 0.5 }   // contact-shadow (G) strength
    shader.uniforms.uLampColor = _lampGlow.colorUniform  // pool colour = lamp colour
    shader.uniforms.uFadeCenter = { value: new THREE.Vector2(fade?.center?.[0] ?? 0, fade?.center?.[1] ?? 0) }
    shader.uniforms.uFadeInner  = { value: fade?.inner ?? 0 }
    shader.uniforms.uFadeOuter  = { value: fade?.outer ?? 0 }
    shader.uniforms.uHasFade    = { value: fade ? 1.0 : 0.0 }
    shaderRef.current = shader

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vGrassPos;`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vGrassPos = (modelMatrix * vec4(position, 1.0)).xyz;`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uSunAltitude;
       uniform sampler2D uClipMap;
       uniform vec2 uClipMin;
       uniform vec2 uClipSize;
       uniform float uHasClip;
       uniform sampler2D uLampMap;
       uniform float uHasLamp;
       uniform float uLampGlow;
       uniform sampler2D uPoolMap;
       uniform float uHasPool;
       uniform vec2 uPoolMin;
       uniform vec2 uPoolSpan;
       uniform float uPoolScale;
       uniform float uPool;
       uniform float uShadowStr;
       uniform vec3 uLampColor;
       uniform vec2 uFadeCenter;
       uniform float uFadeInner;
       uniform float uFadeOuter;
       uniform float uHasFade;
       varying vec3 vGrassPos;

       float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
       float gNoise(vec2 p) {
         vec2 i = floor(p), f = fract(p);
         f = f * f * (3.0 - 2.0 * f);
         return mix(
           mix(gHash(i), gHash(i + vec2(1,0)), f.x),
           mix(gHash(i + vec2(0,1)), gHash(i + vec2(1,1)), f.x), f.y);
       }
       float gFBM(vec2 p) {
         float v = 0.0, a = 0.5;
         for (int i = 0; i < 5; i++) { v += a * gNoise(p); p *= 2.03; a *= 0.49; }
         return v;
       }`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       vec2 gp = vGrassPos.xz;

       float gn1 = gFBM(gp * 0.06);
       float gn2 = gFBM(gp * 0.15 + 42.0);
       float gn3 = gFBM(gp * 0.8 + 100.0);
       float gn4 = gFBM(gp * 0.025 + 200.0);
       // Fine blade detail (~25cm features) — makes grass read as grass
       // instead of painted green.
       float gnBlade = gFBM(gp * 4.0 + 17.0);
       float gnBladeFine = gNoise(gp * 12.0 + 71.0);

       vec3 gBase  = vec3(0.22, 0.40, 0.19);
       vec3 gLight = vec3(0.30, 0.50, 0.27);
       vec3 gDark  = vec3(0.15, 0.32, 0.13);
       vec3 gWarm  = vec3(0.26, 0.44, 0.17);
       vec3 gCool  = vec3(0.18, 0.38, 0.22);

       vec3 grass = mix(gBase, gLight, smoothstep(0.35, 0.65, gn1));
       grass = mix(grass, gDark, smoothstep(0.4, 0.7, gn2) * 0.35);
       grass = mix(grass, gWarm, smoothstep(0.55, 0.8, gn4) * 0.25);
       grass = mix(grass, gCool, smoothstep(0.2, 0.45, gn4) * 0.2);
       grass += (gn3 - 0.5) * 0.018;
       // Fine-scale detail layers so the grass has actual texture, not
       // smooth gradient. Stronger than the gn3 dust before.
       grass *= 0.85 + gnBlade * 0.30;
       grass += (gnBladeFine - 0.5) * 0.06;

       float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
       float brightness = mix(0.7, 1.0, dayBright);
       vec3 nightTint = vec3(0.6, 0.7, 1.0);
       grass = mix(grass * nightTint, grass, dayBright) * brightness;

       // Lamp light pool — baked ring profile (dark center → bright soft
       // ring → 0), summed across lamps, sampled at world-XZ and scaled by
       // the live TOD Pool value. No night gate: the Pool channel is
       // manually animated, so it owns when the pool shows.
       if (uHasPool > 0.5) {
         vec2 poolUV = (vGrassPos.xz - uPoolMin) / uPoolSpan;
         if (poolUV.x >= 0.0 && poolUV.x <= 1.0 && poolUV.y >= 0.0 && poolUV.y <= 1.0) {
           vec4 gfx = texture2D(uPoolMap, poolUV);
           // G — contact shadow (tree + lamp bases): darken the albedo DIRECTLY
           // so the ring reads in daytime (not just ambient like aoMap).
           grass *= (1.0 - gfx.g * uShadowStr);
           // R — lamp light pool in the LAMP'S colour, scaled by the live TOD Pool value.
           grass += uLampColor * gfx.r * uPoolScale * uPool;
         }
       }

       diffuseColor.rgb = pow(grass, vec3(2.2));`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       if (uHasClip > 0.5) {
         vec2 clipUV = (vGrassPos.xz - uClipMin) / uClipSize;
         float mask = texture2D(uClipMap, clipUV).r;
         if (mask < 0.5) discard;
       }
       if (uHasFade > 0.5) {
         float dFade = length(vGrassPos.xz - uFadeCenter);
         gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, dFade);
       }`
    )
  }

  // Unique cache key so this grass program doesn't collapse onto any
  // other patched-terrain material's compiled shader (three caches by
  // customProgramCacheKey; without a unique key here the procedural-
  // grass shader can silently get replaced by an earlier-compiled
  // plain-MeshStandardMaterial program from the same scene).
  material.customProgramCacheKey = () =>
    `grass-${fade ? `f${fade.inner}-${fade.outer}` : 'nf'}-${clipMask ? 'clip' : 'noclip'}-${lampLightmap ? 'lamp' : 'nolamp'}-${poolMap ? 'pool' : 'nopool'}-wx1`

  return { material, shaderRef }
}
