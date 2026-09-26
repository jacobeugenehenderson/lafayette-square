/**
 * lampGlowState — module-scoped uniforms for lamp-glow strength on each
 * receiving surface category. Shaders subscribe via shared uniform
 * objects; the Preview panel writes to them. Values persist in
 * localStorage so reloads don't reset.
 *
 * Tomorrow: lift these into cartograph's Surfaces panel as proper Look
 * authored parameters. For tonight they live in Preview so the operator
 * can dial without re-bake.
 */
import * as THREE from 'three'

const STORAGE_KEY = 'preview.lampGlow.v1'

const DEFAULTS = {
  grass:  0,      // amber additive strength on lawn / treelawn / median
  trees:  0,      // emissive strength on tree foliage
  pool:   1.00,   // intensity multiplier on the pool radial gradient
}

function load() {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { return { ...DEFAULTS } }
}
function save(state) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
  catch { /* ignore */ }
}

const initial = load()

// Module-scoped uniform objects so shaders can hold a stable reference.
// Each shader does `shader.uniforms.uMyKnob = lampGlow.grassUniform`.
export const lampGlow = {
  grassUniform: { value: initial.grass },
  treesUniform: { value: initial.trees },
  // Init 0, not the legacy default — the pool is driven live by StreetLights
  // (lantern output) from frame 1, so a non-zero init only causes a bright
  // flash before the first drive. (Was `initial.pool` = 1.0 → the flash.)
  poolUniform:  { value: 0 },
  // The lamp's light COLOUR — written each frame from the resolved `lantern`
  // channel (StreetLights) so the ground pool (and canopy glow) take on the
  // lantern's colour instead of a hardcoded warm. THREE.Color so shaders read
  // it as a vec3. Default = the legacy warm pool tint (sRGB-ish, baked into
  // the shaders before; no day-one change).
  colorUniform: { value: new THREE.Color(0.80, 0.62, 0.32) },
}

const subs = new Set()
function notify() { for (const fn of subs) fn() }

export function setLampGlow(key, value) {
  if (key === 'grass') lampGlow.grassUniform.value = value
  if (key === 'trees') lampGlow.treesUniform.value = value
  if (key === 'pool')  lampGlow.poolUniform.value  = value
  save({
    grass: lampGlow.grassUniform.value,
    trees: lampGlow.treesUniform.value,
    pool:  lampGlow.poolUniform.value,
  })
  notify()
}

import { useEffect, useState } from 'react'
export function useLampGlow() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(n => n + 1)
    subs.add(fn)
    return () => { subs.delete(fn) }
  }, [])
  return {
    grass: lampGlow.grassUniform.value,
    trees: lampGlow.treesUniform.value,
    pool:  lampGlow.poolUniform.value,
  }
}
