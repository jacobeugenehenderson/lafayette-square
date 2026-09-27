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
}

/** Apply a Look's authored rules (neutral defaults underneath). */
export function setGroundRules(authored) {
  const r = resolveGroundRules(authored)
  groundRules.canopyLitter.value = r.canopyLitter.strength
  groundRules.canopyLitterColor.value = hex(r.canopyLitter.color)
  groundRules.duneGrass.value = r.duneGrass.strength
  groundRules.duneGrassFade.value = r.duneGrass.fadeBands
  groundRules.duneGrassColor.value = hex(r.duneGrass.color)
}
