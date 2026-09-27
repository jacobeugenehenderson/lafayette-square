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
  buildingGreen: { value: 0 }, buildingGreenWidth: { value: 12 }, buildingGreenColor: { value: hex('#6b7043') },
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
  groundRules.buildingGreen.value = r.buildingGreen.strength
  groundRules.buildingGreenWidth.value = r.buildingGreen.widthM
  groundRules.buildingGreenColor.value = hex(r.buildingGreen.color)
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
       uniform float uPavedEdge; uniform float uPavedEdgeWidth; uniform vec3 uPavedEdgeColor;
       uniform float uBuildingGreen; uniform float uBuildingGreenWidth; uniform vec3 uBuildingGreenColor;`
export const groundRulesFragment = (xz) => `
       if (uHasRuleMap > 0.5 && (uBuildingFoot > 0.0 || uPavedEdge > 0.0 || uBuildingGreen > 0.0)) {
         vec2 ruv = (${xz} - uRuleMin) / uRuleSpan;
         if (all(greaterThanEqual(ruv, vec2(0.0))) && all(lessThanEqual(ruv, vec2(1.0)))) {
           vec4 rm = texture2D(uRuleMap, ruv);
           float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
           // buildingGreen: yards — solid dull green at the house, breaking into clumps over darker dirt
           // as it fades out over its width. Each octave is rotated to its own angle and the whole field
           // domain-warped, so the lattice under gNoise never lines up into a plaid. Grass sits at about half
           // the ground's value, as live grass does against dry sand, so it reads as grass, not a tint (Jacob,
           // 2026-09-27: "dirtier, more uneven/organic", "too plaid", "more straight up green by the corner
           // of the house", "too subtle").
           float yd = rm.r * uRuleRangeM;
           float yard = (1.0 - smoothstep(0.0, uBuildingGreenWidth, yd)) * uBuildingGreen;
           float core = 1.0 - smoothstep(0.0, 0.35 * uBuildingGreenWidth, yd);
           vec2 yw = ${xz} + 3.0 * vec2(gNoise(${xz} * 0.09 + 5.0), gNoise(${xz} * 0.09 + 17.0));
           float yn = 0.5 * gNoise(mat2(0.80, -0.60, 0.60, 0.80) * yw * 0.15 + 41.0)
                    + 0.3 * gNoise(mat2(0.28, 0.96, -0.96, 0.28) * yw * 0.7 + 7.0)
                    + 0.2 * gNoise(mat2(-0.49, 0.87, -0.87, -0.49) * yw * 2.9 + 13.0);
           float clump = smoothstep(0.44, 0.56, yn + 0.45 * core);
           float grain = 0.55 * gNoise(mat2(0.93, 0.37, -0.37, 0.93) * yw * 4.3 + 3.0) + 0.45 * gNoise(mat2(-0.21, 0.98, -0.98, -0.21) * yw * 7.9 + 29.0);
           vec3 grassC = uBuildingGreenColor * (0.85 + 0.3 * grain) * (0.55 * max(lum, 0.08) / max(dot(uBuildingGreenColor, vec3(0.299, 0.587, 0.114)), 0.05));
           vec3 dirtC = gl_FragColor.rgb * vec3(0.74, 0.68, 0.62) * (0.9 + 0.2 * grain);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(dirtC, grassC, clump), clamp(yard * (0.5 + 0.5 * clump), 0.0, 1.0));
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
    uBuildingGreen: groundRules.buildingGreen, uBuildingGreenWidth: groundRules.buildingGreenWidth, uBuildingGreenColor: groundRules.buildingGreenColor,
  })
}
