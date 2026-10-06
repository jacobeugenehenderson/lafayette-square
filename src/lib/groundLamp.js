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
import { POOL_SHAPE_GLSL } from './lampPool.js'
import { lampGrid as _lampGrid } from '../preview/lampGlowState.js'
import { groundRules } from './groundRules.js'

/** Marks the chunk in a compiled shader, so the check can find it. */
export const GROUND_LAMP_MARKER = '/* ground-lamp: poolmap, after lighting */'

export const GROUND_LAMP_DECLS = `
       uniform sampler2D uPoolMap; uniform vec2 uPoolMin; uniform vec2 uPoolSpan;
       uniform float uPoolScale;  // poolmap R × this = metres to the nearest lamp (the town's reach; encoding 'lamp-distance')
       uniform float uPool; uniform float uShadowStr; uniform vec3 uLampColor;
       uniform float uPoolRadius; // Pool radius knob, 0..1 of the reach (0 = no pool)
       uniform float uPoolCentre; // Pool centre, metres — the dark circle under the lamp
       uniform float uPoolCentreSoft; // Pool centre softness, 0..1 of the centre's radius either side of its edge
       uniform sampler2D uLampGrid; uniform vec2 uLampGridMin; uniform vec3 uLampGridDims; uniform float uLampGridCell;
       uniform float uCanopyLitter; uniform vec3 uCanopyLitterColor;   // ground rule (surfaces.mjs GROUND_RULES)
       ${POOL_SHAPE_GLSL}
       // Exact distance to the nearest drawn lamp (the walls' grid) — only asked near a lamp, for the crisp centre.
       float nearestLampDist(vec2 p) {
         int K = int(uLampGridDims.z);
         if (K == 0) return 1e6;
         int cols = int(uLampGridDims.x), rows = int(uLampGridDims.y);
         ivec2 c = ivec2(floor((p - uLampGridMin) / uLampGridCell));
         float best = 1e6;
         for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
           ivec2 cc = c + ivec2(dx, dz);
           if (cc.x < 0 || cc.y < 0 || cc.x >= cols || cc.y >= rows) continue;
           for (int k = 0; k < K; k++) {
             vec4 L = texelFetch(uLampGrid, ivec2(cc.x * K + k, cc.y), 0);
             if (L.w < 0.5) break;
             best = min(best, length(L.xy - p));
           }
         }
         return best;
       }`

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
           // ⭐ THE POOL — a circle the Radius knob sizes, minus a pronounced dark centre (lampPool.js POOL_SHAPE_GLSL),
           // as LIGHT ON THE SURFACE: albedo × lamp colour, screen-added so it rolls off and never clips flat white
           // (Jacob, 2026-09-26: "edges too hard, too opaque/flat"). One texture read; the lamp grid only near a lamp.
           float dN = gfx.r * uPoolScale;
           float E = poolDisc(dN, uPoolRadius * uPoolScale);
           float nearBand = uPoolCentre * (1.1 + uPoolCentreSoft) + 2.0 * uPoolSpan.x / float(textureSize(uPoolMap, 0).x);
           if (E > 0.0 && uPoolCentre > 0.0 && dN < nearBand) E *= poolCentre(nearestLampDist(${xz}), uPoolCentre, uPoolCentreSoft);
           vec3 poolLight = diffuseColor.rgb * uLampColor * E * uPool;
           gl_FragColor.rgb += (1.0 - gl_FragColor.rgb) * (1.0 - exp(-poolLight));
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
  uniforms.uPoolRadius = _lampGlow.poolRadiusUniform
  uniforms.uPoolCentre = _lampGlow.poolCentreUniform
  uniforms.uPoolCentreSoft = _lampGlow.poolCentreSoftUniform
  uniforms.uLampGrid = _lampGrid.uLampGrid; uniforms.uLampGridMin = _lampGrid.uLampGridMin
  uniforms.uLampGridDims = _lampGrid.uLampGridDims; uniforms.uLampGridCell = _lampGrid.uLampGridCell
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
  uniforms.uPoolRadius = _lampGlow.poolRadiusUniform
  uniforms.uPoolCentre = _lampGlow.poolCentreUniform
  uniforms.uPoolCentreSoft = _lampGlow.poolCentreSoftUniform
  uniforms.uLampGrid = _lampGrid.uLampGrid; uniforms.uLampGridMin = _lampGrid.uLampGridMin
  uniforms.uLampGridDims = _lampGrid.uLampGridDims; uniforms.uLampGridCell = _lampGrid.uLampGridCell
  uniforms.uCanopyLitter = groundRules.canopyLitter
  uniforms.uCanopyLitterColor = groundRules.canopyLitterColor
}
