/**
 * fadeGroundMaterial — the FLAT ground material: asphalt, curb, sidewalk, stripe, and every land-use
 * class with no procedural surface. The class colour (already treated by the caller), the fade band at
 * the rim, the weather socket, and the lamp's light the one way every ground surface takes it
 * (src/lib/groundLamp.js). Extracted from BakedGround.jsx's FadeMesh so
 * `checks/claims-every-ground-surface-takes-the-lamp.mjs` can compile the real thing.
 * The caller adds cascades (attachCSM) and terrain (patchTerrain) — both wrap this material's hook.
 *
 * `pool` = { map, min, span, scale } (ground.json#poolmap + its texture) or null.
 */
import * as THREE from 'three'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'
import { GROUND_LAMP_DECLS, groundLampFragment, bindGroundLamp } from '../lib/groundLamp.js'

export function makeFadeGroundMaterial({ color, fade = null, pool = null }) {
  const hasPool = !!pool?.map
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    // No polygonOffset — it's INERT under the log-depth canvas (the
    // <logdepthbuf_fragment> writes gl_FragDepth, bypassing GL_POLYGON_OFFSET_FILL).
    // Coplanar groups separate by baked geometric Y + renderOrder. ARCHITECTURE §8.
  })
  if (fade) mat.transparent = true
  mat.onBeforeCompile = (shader) => {
    applyWeatherToShader(shader)  // Phase 7b/c: wet + snow opt-in
    // A shared world-XZ varying + the fade discard and/or the lamp's light. Skipped entirely when
    // neither is needed (the cheap plain asphalt path).
    if (fade || hasPool) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>', '#include <common>\nvarying vec3 vGndPos;')
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vGndPos = (modelMatrix * vec4(position, 1.0)).xyz;')
      let decls = 'varying vec3 vGndPos;\n'
      if (fade)    decls += 'uniform vec2 uFadeCenter; uniform float uFadeInner; uniform float uFadeOuter;\n'
      if (hasPool) decls += GROUND_LAMP_DECLS + '\n'
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>', '#include <common>\n' + decls)
      if (fade) {
        shader.uniforms.uFadeCenter = { value: new THREE.Vector2(fade.center[0], fade.center[1]) }
        shader.uniforms.uFadeInner  = { value: fade.inner }
        shader.uniforms.uFadeOuter  = { value: fade.outer }
      }
      if (hasPool) bindGroundLamp(shader.uniforms, pool)
      let post = '#include <dithering_fragment>\n'
      if (hasPool) post += groundLampFragment('vGndPos.xz') + '\n'
      if (fade) post +=
        `gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, length(vGndPos.xz - uFadeCenter));\n`
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', post)
    }
  }
  mat.customProgramCacheKey = () =>
    `bg-${fade ? `fade-${fade.inner}-${fade.outer}` : 'plain'}-${hasPool ? 'pool' : 'nopool'}-wx2`
  return mat
}
