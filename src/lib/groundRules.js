/**
 * groundRules.js — the live values of the ground rules (cartograph/surfaces.mjs GROUND_RULES), as
 * shared uniforms every ground material binds, the way lampGlowState carries the lamps. BakedGround
 * sets them from the Look's `surfaces.rules` (and the lab's preview); a material binds them once.
 */
import * as THREE from 'three'
import { resolveGroundRules } from '../../cartograph/surfaces.mjs'

const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255) }

export const groundRules = {
  canopyLitter: { value: 0 }, canopyLitterColor: { value: hex('#4b3f2c') },
  duneGrass: { value: 0 }, duneGrassFade: { value: 1 }, duneGrassColor: { value: hex('#7d8452') },
  buildingFoot: { value: 0 }, buildingFootWidth: { value: 1.5 }, buildingFootColor: { value: hex('#6b5a45') },
  pavedEdge: { value: 0 }, pavedEdgeWidth: { value: 1 }, pavedEdgeColor: { value: hex('#a89c7c') },
  // The baked rule distances (ground.rulemap.png), published by BakedGround.
  ruleMap: { value: null }, ruleMin: { value: new THREE.Vector2(0, 0) }, ruleSpan: { value: new THREE.Vector2(1, 1) },
  ruleRangeM: { value: 0 }, hasRuleMap: { value: 0 },
}

/** Apply a Look's authored rules (neutral defaults underneath). */
export function setGroundRules(authored) {
  const r = resolveGroundRules(authored)
  groundRules.canopyLitter.value = r.canopyLitter.strength
  groundRules.canopyLitterColor.value = hex(r.canopyLitter.color)
  groundRules.duneGrass.value = r.duneGrass.strength
  groundRules.duneGrassFade.value = r.duneGrass.fadeBands
  groundRules.duneGrassColor.value = hex(r.duneGrass.color)
  groundRules.buildingFoot.value = r.buildingFoot.strength
  groundRules.buildingFootWidth.value = r.buildingFoot.widthM
  groundRules.buildingFootColor.value = hex(r.buildingFoot.color)
  groundRules.pavedEdge.value = r.pavedEdge.strength
  groundRules.pavedEdgeWidth.value = r.pavedEdge.widthM
  groundRules.pavedEdgeColor.value = hex(r.pavedEdge.color)
  return r
}

/** Publish the baked rule distances (null = this ground has no rulemap). */
export function setGroundRuleMap(texture, meta) {
  groundRules.ruleMap.value = texture || null
  groundRules.hasRuleMap.value = texture ? 1 : 0
  if (meta?.min) groundRules.ruleMin.value.set(meta.min[0], meta.min[1])
  if (meta?.span) groundRules.ruleSpan.value.set(meta.span[0], meta.span[1])
  groundRules.ruleRangeM.value = meta?.rangeM ?? 0
}

/** The soft-ground rules' GLSL, after lighting (grass / sand / crop). `xz` = world XZ. */
export const GROUND_RULES_DECLS = `
       uniform sampler2D uRuleMap; uniform vec2 uRuleMin; uniform vec2 uRuleSpan; uniform float uRuleRangeM; uniform float uHasRuleMap;
       uniform float uBuildingFoot; uniform float uBuildingFootWidth; uniform vec3 uBuildingFootColor;
       uniform float uPavedEdge; uniform float uPavedEdgeWidth; uniform vec3 uPavedEdgeColor;`
export const groundRulesFragment = (xz) => `
       if (uHasRuleMap > 0.5 && (uBuildingFoot > 0.0 || uPavedEdge > 0.0)) {
         vec2 ruv = (${xz} - uRuleMin) / uRuleSpan;
         if (all(greaterThanEqual(ruv, vec2(0.0))) && all(lessThanEqual(ruv, vec2(1.0)))) {
           vec4 rm = texture2D(uRuleMap, ruv);
           float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
           // buildingFoot: a bare band at the wall's foot, fading out over its width, broken by noise.
           float fb = (1.0 - smoothstep(0.0, uBuildingFootWidth, rm.r * uRuleRangeM)) * uBuildingFoot;
           gl_FragColor.rgb = mix(gl_FragColor.rgb, uBuildingFootColor * lum / max(dot(uBuildingFootColor, vec3(0.299, 0.587, 0.114)), 0.05), clamp(fb, 0.0, 1.0));
           // pavedEdge: worn, frayed ground off the paving's edge — ragged by noise, not a ruled band.
           float fray = 0.6 + 0.8 * gNoise(${xz} * 1.7 + 23.0);
           float pe = (1.0 - smoothstep(0.0, uPavedEdgeWidth * fray, rm.g * uRuleRangeM)) * uPavedEdge;
           gl_FragColor.rgb = mix(gl_FragColor.rgb, uPavedEdgeColor * lum / max(dot(uPavedEdgeColor, vec3(0.299, 0.587, 0.114)), 0.05), clamp(pe, 0.0, 1.0));
         }
       }`

/** Bind the soft-ground rules' uniforms. */
export function bindGroundRules(u) {
  Object.assign(u, {
    uRuleMap: groundRules.ruleMap, uRuleMin: groundRules.ruleMin, uRuleSpan: groundRules.ruleSpan,
    uRuleRangeM: groundRules.ruleRangeM, uHasRuleMap: groundRules.hasRuleMap,
    uBuildingFoot: groundRules.buildingFoot, uBuildingFootWidth: groundRules.buildingFootWidth, uBuildingFootColor: groundRules.buildingFootColor,
    uPavedEdge: groundRules.pavedEdge, uPavedEdgeWidth: groundRules.pavedEdgeWidth, uPavedEdgeColor: groundRules.pavedEdgeColor,
  })
}
