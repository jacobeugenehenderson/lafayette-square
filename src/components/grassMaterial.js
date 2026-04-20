import * as THREE from 'three'

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
export function makeGrassMaterial({ lampLightmap = null, clipMask = null, clipMin = null, clipSize = null, color = '#2d5a2d' } = {}) {
  const shaderRef = { current: null }
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, color })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunAltitude = { value: 0.5 }
    shader.uniforms.uClipMap   = { value: clipMask }
    shader.uniforms.uClipMin   = { value: clipMin || new THREE.Vector2(0, 0) }
    shader.uniforms.uClipSize  = { value: clipSize || new THREE.Vector2(1, 1) }
    shader.uniforms.uHasClip   = { value: clipMask ? 1.0 : 0.0 }
    shader.uniforms.uLampMap   = { value: lampLightmap }
    shader.uniforms.uHasLamp   = { value: lampLightmap ? 1.0 : 0.0 }
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

       float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
       float brightness = mix(0.7, 1.0, dayBright);
       vec3 nightTint = vec3(0.6, 0.7, 1.0);
       grass = mix(grass * nightTint, grass, dayBright) * brightness;

       if (uHasLamp > 0.5) {
         vec2 grassWorld = vec2(vGrassPos.x * 0.9871 + vGrassPos.z * 0.1599,
                               -vGrassPos.x * 0.1599 + vGrassPos.z * 0.9871);
         vec2 grassLampUV = (grassWorld + 200.0) / 400.0;
         float grassLampI = texture2D(uLampMap, grassLampUV).r;
         float grassLampOn = clamp((0.15 - uSunAltitude) / 0.45, 0.0, 1.0);
         grass += vec3(0.40, 0.50, 0.22) * grassLampI * grassLampOn * 0.4;
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
       }`
    )
  }

  return { material, shaderRef }
}
