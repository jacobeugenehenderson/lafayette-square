import * as THREE from 'three'
// ⚠️ DEFERRED-TO-PRODUCER (Universal Reader Phase 2): street_lamps is render
// geometry (shared with the bake pipeline); its by-lookId load belongs to the
// roster/render-emit arc. Left static + LS-guarded (below). Owner: that arc.
import lampData from '../data/street_lamps.json'
import { INSTANCE } from '../instance.js'

let _cache = null

// Gaussian splat of lamp positions → a 256² R-float DataTexture covering
// [-200, 200]² world. Used by grass / bark / foliage / ribbon-face shaders
// to add a warm lamp glow at night. Pure data, cached per-session.
export function getLampLightmap() {
  if (_cache) return _cache
  const SIZE = 256
  const EXTENT = 200
  const SIGMA = 12
  const SIGMA2 = 2 * SIGMA * SIGMA
  const CUTOFF2 = (4 * SIGMA) * (4 * SIGMA)
  const data = new Float32Array(SIZE * SIZE)
  // HPDM-safety guard (byte-identical for LS today): a non-LS look gets no lamp
  // glow rather than LS's lamp positions on its ground.
  const lamps = INSTANCE.lookId === 'lafayette-square' ? lampData.lamps : []
  for (let j = 0; j < SIZE; j++) {
    const wz = (j / (SIZE - 1)) * 2 * EXTENT - EXTENT
    for (let i = 0; i < SIZE; i++) {
      const wx = (i / (SIZE - 1)) * 2 * EXTENT - EXTENT
      let acc = 0
      for (let l = 0; l < lamps.length; l++) {
        const dx = wx - lamps[l].x
        const dz = wz - lamps[l].z
        const dist2 = dx * dx + dz * dz
        if (dist2 > CUTOFF2) continue
        acc += Math.exp(-dist2 / SIGMA2)
      }
      data[j * SIZE + i] = Math.min(acc, 1.5)
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RedFormat, THREE.FloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  _cache = tex
  return tex
}
