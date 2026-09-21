/**
 * shadowMaskDebug — ?shadowmask=1 paints three's own shadow term as raw colour.
 *
 * ⭐ WHY THIS EXISTS. "No cast shadows" is unfalsifiable from the outside: a
 * shadow that is absent, one drowned by ambient, and one landing outside the
 * frustum all look identical. This outputs the shadow factor three computes
 * per fragment — 1.0 lit, 0.0 fully shadowed — BEFORE light, colour, AO,
 * tone-mapping or post-FX touch it.
 *   all white  → nothing is reaching the surface
 *   dark shapes → shadows ARE landing; something downstream hides them
 *
 * ⛔⛔ USE getShadow(), NOT getShadowMask(). `getShadowMask()` is defined in
 * `shadowmask_pars_fragment`, which three includes for Lambert/Phong but NOT
 * for MeshStandardMaterial — physical materials call `getShadow()` inline from
 * `lights_fragment_begin`. A first cut of this file called getShadowMask() and
 * every ground shader died with `VALIDATE_STATUS false / no matching
 * overloaded function`, which renders as a UNIFORM WHITE SCENE — i.e. it looks
 * exactly like a legitimate "mask = 1.0 everywhere" reading. ⭐ Read the
 * console for shader errors BEFORE believing any pixel this file produces.
 *
 * Patches shared ShaderChunks, so it must run BEFORE any material compiles —
 * import at the app entry, not inside a component.
 *
 * ⛔ Debug only, off unless the URL says so.
 */
import * as THREE from 'three'

export function installShadowMaskDebug() {
  if (typeof window === 'undefined') return false
  if (!/[?&]shadowmask=1/.test(window.location.search)) return false

  // Declared in <common> so every shader has it; only lit shaders assign it.
  THREE.ShaderChunk.common += '\nfloat _dbgShadow = 1.0;\n'

  THREE.ShaderChunk.lights_fragment_begin += `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  _dbgShadow = getShadow(
    directionalShadowMap[ 0 ],
    directionalLightShadows[ 0 ].shadowMapSize,
    directionalLightShadows[ 0 ].shadowBias,
    directionalLightShadows[ 0 ].shadowRadius,
    vDirectionalShadowCoord[ 0 ]
  );
#endif
`

  THREE.ShaderChunk.dithering_fragment += `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  gl_FragColor.rgb = vec3( _dbgShadow );
  gl_FragColor.a = 1.0;
#endif
`

  console.log('[shadowmask] ON — white = lit, black = shadowed. CHECK FOR SHADER ERRORS FIRST.')
  return true
}
