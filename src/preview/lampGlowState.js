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
  // Lamp output × the trees share — written by StreetLights each frame; 0 with no lamps.
  treesUniform: { value: 0 },
  // The authored shares of the lamp's output (the Lamp Glow card), written by LampGlowPump (Stage,
  // live) / LampGlowDriver (production, baked); StreetLights multiplies the lamp's output by them.
  share: { trees: 1, pool: 1 },
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

// ⭐ THE LAMPS, FOR BUILDING WALLS — a grid of the lamps StreetLights DRAWS (one lamp list; `buildLampGrid`,
// src/lib/lampPool.js). Stable uniform objects: SlabBuildings binds them once, StreetLights fills them.
// dims = (cols, rows, k); k = 0 ⇒ no lamps ⇒ no wall light.
export const lampGrid = {
  uLampGrid:     { value: null },
  uLampGridMin:  { value: new THREE.Vector2() },
  uLampGridDims: { value: new THREE.Vector3(0, 0, 0) },
  uLampGridCell: { value: 16 },
  uLampHeadY:    { value: 0 },
}

const subs = new Set()
function notify() { for (const fn of subs) fn() }

export function setLampGlow(key, value) {
  if (key === 'grass') lampGlow.grassUniform.value = value
  // trees / pool are SHARES of the lamp's output — StreetLights owns the uniforms (output × share).
  if (key === 'trees') lampGlow.share.trees = value
  if (key === 'pool')  lampGlow.share.pool  = value
  save({ grass: lampGlow.grassUniform.value, trees: lampGlow.share.trees, pool: lampGlow.share.pool })
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
