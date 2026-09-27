/**
 * groundLamp.js — THE ONE WAY A LAMP LIGHTS THE GROUND, whatever the ground is made of.
 *
 * ⭐ Jacob, 2026-09-26: *"Light needs to reach sidewalks, treelawns, LU, asphalt, curbs, everything.
 * Currently there are gaps."* The model of the light is Wick's (`src/lib/lampPool.js`), baked into the
 * R channel of `ground.poolmap.png` by `cartograph/bake-ground-ao.js`; G is the contact shadow under
 * trees and lamps. This module is how every ground material APPLIES that map — once, the same way.
 *
 * ⛔ THE GAP IT CLOSES (measured 2026-09-26): the asphalt/curb/sidewalk/land-use faces added the pool
 * AFTER lighting, while grass, sand and the fields mixed it INTO THEIR ALBEDO — so the night's light
 * multiplied it nearly to nothing and the pool broke at every treelawn and lawn edge; the park's gravel
 * read a different, LS-only lightmap. ⇒ After lighting, for every surface: the contact shadow darkens
 * the lit colour, the pool adds the lamp's colour × the live TOD Pool value.
 *
 * ▶ `node checks/claims-every-ground-surface-takes-the-lamp.mjs` — compiles each ground group's real
 *   material and fails if one draws without this chunk (mutation-tested every run).
 */
import * as THREE from 'three'
import { lampGlow as _lampGlow } from '../preview/lampGlowState.js'
import { groundColor } from '../components/groundColorState.js'
import { LAMP_WIPE_GLSL } from './lampPool.js'
import { groundRules } from './groundRules.js'

/** Marks the chunk in a compiled shader, so the check can find it. */
export const GROUND_LAMP_MARKER = '/* ground-lamp: poolmap, after lighting */'

export const GROUND_LAMP_DECLS = `
       uniform sampler2D uPoolMap; uniform vec2 uPoolMin; uniform vec2 uPoolSpan;
       uniform float uPoolScale; uniform float uPool; uniform float uShadowStr; uniform vec3 uLampColor;
       uniform float uPoolWipe;   // the Pool radius knob (lampPool.js#poolWipe) — 0 = fully open
       uniform float uCanopyLitter; uniform vec3 uCanopyLitterColor;   // ground rule (surfaces.mjs GROUND_RULES)
       ${LAMP_WIPE_GLSL}`

/** The fragment code, to follow `#include <dithering_fragment>`. `xz` = the fragment's world XZ. */
export const groundLampFragment = (xz) => `
       ${GROUND_LAMP_MARKER}
       { vec2 puv = (${xz} - uPoolMin) / uPoolSpan;
         if (all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)))) {
           vec4 gfx = texture2D(uPoolMap, puv);
           gl_FragColor.rgb *= (1.0 - gfx.g * uShadowStr);                  // contact shadow
           // Ground rule canopyLitter: under trees the ground is damp and littered — the same channel
           // tints the lit colour toward the litter hue (0 = off). G also rings lamp bases, at a pole's scale.
           gl_FragColor.rgb *= mix(vec3(1.0), uCanopyLitterColor / max(dot(uCanopyLitterColor, vec3(0.333)), 0.05) * 0.85,
                                   clamp(gfx.g * uCanopyLitter, 0.0, 1.0));
           gl_FragColor.rgb += uLampColor * lampWipe(gfx.r * uPoolScale, uPoolWipe) * uPool;   // the lamp's pool, in its colour, clipped to the Radius
         } }`

/** Bind the pool uniforms. `pool` = { map, min, span, scale } from ground.json#poolmap (+ its texture). */
export function bindGroundLamp(uniforms, pool) {
  uniforms.uPoolMap   = { value: pool.map }
  uniforms.uPoolMin   = { value: new THREE.Vector2(pool.min?.[0] ?? 0, pool.min?.[1] ?? 0) }
  uniforms.uPoolSpan  = { value: new THREE.Vector2(pool.span?.[0] ?? 1, pool.span?.[1] ?? 1) }
  uniforms.uPoolScale = { value: pool.scale ?? 1 }
  uniforms.uPool      = _lampGlow.poolUniform
  uniforms.uShadowStr = { value: 0.5 }
  uniforms.uLampColor = _lampGlow.colorUniform
  uniforms.uPoolWipe  = _lampGlow.poolWipeUniform
  uniforms.uCanopyLitter = groundRules.canopyLitter
  uniforms.uCanopyLitterColor = groundRules.canopyLitterColor
}

/**
 * Bind the pool from the SHARED ground state BakedGround publishes (`setGroundFxMap`), for a material
 * whose caller does not hold the poolmap (the park's gravel, also mounted by LafayettePark). An unbound
 * map samples 0 — no pool and no contact shadow, never a stand-in.
 */
export function bindGroundLampShared(uniforms) {
  uniforms.uPoolMap   = groundColor.fxMapUniform
  uniforms.uPoolMin   = groundColor.fxMinUniform
  uniforms.uPoolSpan  = groundColor.fxSpanUniform
  uniforms.uPoolScale = groundColor.fxScaleUniform
  uniforms.uPool      = _lampGlow.poolUniform
  uniforms.uShadowStr = { value: 0.5 }
  uniforms.uLampColor = _lampGlow.colorUniform
  uniforms.uPoolWipe  = _lampGlow.poolWipeUniform
  uniforms.uCanopyLitter = groundRules.canopyLitter
  uniforms.uCanopyLitterColor = groundRules.canopyLitterColor
}
