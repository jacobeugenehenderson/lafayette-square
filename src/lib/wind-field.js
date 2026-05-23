/**
 * wind-field — frozen cross-helper seam between Meteorologist (publisher)
 * and Arborist (tree sway consumer; Brief 9b will add Atmosphere). Neither
 * helper imports the other. Both import this module. Precedent:
 * `src/lib/almanac-eval.js`.
 *
 * Contract: see scratch/wind-contract-phase7a.md (signed off 2026-05-22).
 *
 *   windAt(t, pos, windState) → { force: Vector3 (m/s), intensity: number (m/s) }
 *
 * Composes three temporal scales:
 *   1. DRIFT — `baseDirection * baseSpeedMps`. Constant within a tween window.
 *   2. GUST ENVELOPE — slow (~30s) modulator-authored amplitude on spikes.
 *   3. GUST SPIKES — smoothmax-shaped 1–2s spikes whose phase is offset by
 *      `dot(pos, gustFrontVelocity) / |gustFrontVelocity|²` seconds. Trees on
 *      the upwind side of the front see the spike before trees downwind,
 *      so the gust visibly travels through the scene.
 *
 * Pure: identical (t, pos, windState) → identical output. No globals.
 *
 * `windState` is the resolved state Meteorologist publishes once per frame:
 *
 *   {
 *     baseSpeedMps,      // number, m/s (directive.wind.speed)
 *     baseDirection,     // Vector3 unit, XZ-plane, world-space TO direction
 *     gustsScale,        // number, m/s peak (directive.wind.gustsScale)
 *     gustEnvelope,      // number in [0,1], slow modulator-authored
 *     gustFrontVelocity, // Vector3 m/s, world-space (independent of base wind
 *                        // per ADR decision S2; default = baseDirection × 10)
 *   }
 *
 * Use `resolveWindState(tweenedDirective)` to derive a `windState` from the
 * directive channel; consumers that want overrides (e.g. Salon workstage
 * wind toggle) can build their own.
 *
 * NOTE on directive.wind.dir: directive.schema.json declares `dir` as the
 * bearing the wind is blowing TO; `<Atmosphere />` (line 188–199) treats
 * it as FROM and flips. We match Atmosphere's reading here for visual
 * parity — a degree of disagreement between schema-doc and code that
 * predates this brief. Surfaced in commit body.
 */

import * as THREE from 'three'

// -------------------------------------------------------------------------
// Noise — small deterministic value-noise. No three.js / no external dep.
// Good enough for gust spikes (we only need a smooth random in 1D + 2D).
// Cheap on CPU because Atmosphere/InstancedTrees only sample 1–2× per
// frame per consumer (not per-pixel; per-pixel work is in the shader).
// -------------------------------------------------------------------------

function hash3(x, y, z) {
  // Mix three floats into a [0, 1) pseudo-random using sin-hash.
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453123
  return s - Math.floor(s)
}

function smoothstep(t) { return t * t * (3 - 2 * t) }

/** 2D value noise at integer grid, smoothly interpolated. Range ~[-1, 1]. */
function valueNoise2D(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const tx = smoothstep(xf), ty = smoothstep(yf)
  const n00 = hash3(xi,     yi,     z) * 2 - 1
  const n10 = hash3(xi + 1, yi,     z) * 2 - 1
  const n01 = hash3(xi,     yi + 1, z) * 2 - 1
  const n11 = hash3(xi + 1, yi + 1, z) * 2 - 1
  return (n00 * (1 - tx) + n10 * tx) * (1 - ty) +
         (n01 * (1 - tx) + n11 * tx) * ty
}

/**
 * Smooth-max — soft maximum of (a, b) with sharpness k. As k→∞ approaches
 * max(a, b); at k=0 returns the average. Used for gust spikes: noise
 * passed through smoothmax(noise, threshold, k) gives sharp peaks above
 * the threshold and a near-zero floor below.
 *
 * Implementation guards against exp() overflow by subtracting the maximum
 * before exponentiating (numerically stable softmax trick).
 */
export function smoothmax(a, b, k = 8) {
  const m = Math.max(a, b)
  const ea = Math.exp(k * (a - m))
  const eb = Math.exp(k * (b - m))
  return (a * ea + b * eb) / (ea + eb)
}

// -------------------------------------------------------------------------
// State helpers
// -------------------------------------------------------------------------

const GUST_FRONT_DEFAULT_MPS = 10  // operator-authored default per ADR S2

const _tmpForce = new THREE.Vector3()
const _tmpDir   = new THREE.Vector3()
const _tmpFront = new THREE.Vector3()

export function defaultWindState() {
  return {
    baseSpeedMps:      0,
    baseDirection:     new THREE.Vector3(1, 0, 0),
    gustsScale:        0,
    gustEnvelope:      0,
    gustFrontVelocity: new THREE.Vector3(GUST_FRONT_DEFAULT_MPS, 0, 0),
  }
}

/**
 * Resolve a `windState` from a tweenedDirective. Meteorologist publishes
 * `directive.wind` as `{ scale, dir, speed?, gustsScale?, gustEnvelope?,
 * gustFrontVelocity? }`; we derive the canonical state from those.
 *
 * Backwards-compat: if `speed` is absent we fall back to `scale * 3` (a
 * generous heuristic — 5 ⇒ "stiff breeze" 15 m/s — used only until the
 * directive schema migration lands in deployed look files). Briefs 9a and
 * 9b ship with `wind.speed` added to the schema.
 */
export function resolveWindState(directive, out) {
  const state = out || defaultWindState()
  const w = directive?.wind
  if (!w) {
    state.baseSpeedMps = 0
    state.baseDirection.set(1, 0, 0)
    state.gustsScale = 0
    state.gustEnvelope = 0
    state.gustFrontVelocity.set(GUST_FRONT_DEFAULT_MPS, 0, 0)
    return state
  }

  state.baseSpeedMps = w.speed ?? (w.scale != null ? w.scale * 3 : 0)

  // directive.wind.dir: see header NOTE. Treated as degrees-FROM to match
  // Atmosphere.jsx; convert to a TO unit vector via (-sin, 0, -cos).
  const fromRad = ((w.dir ?? 0) * Math.PI) / 180
  state.baseDirection.set(-Math.sin(fromRad), 0, -Math.cos(fromRad))

  state.gustsScale   = w.gustsScale   ?? 0
  state.gustEnvelope = w.gustEnvelope ?? 1.0

  // gustFrontVelocity defaults to baseDirection * 10 m/s; modulators may
  // author it (carried in directive as either a {x,z} pair or a magnitude
  // + direction; the simple {x,z} shape is what the schema sketch shows).
  if (w.gustFrontVelocity) {
    const g = w.gustFrontVelocity
    state.gustFrontVelocity.set(g.x ?? 0, 0, g.z ?? 0)
  } else {
    state.gustFrontVelocity.copy(state.baseDirection).multiplyScalar(GUST_FRONT_DEFAULT_MPS)
  }
  return state
}

// -------------------------------------------------------------------------
// windAt — the contract function
// -------------------------------------------------------------------------

/**
 * Sample the wind field at time `t` (seconds) and world position `pos`
 * (Vector3 or {x, z}).
 *
 * Returns `{ force, intensity }` where `force` is a Vector3 in m/s
 * (XZ-plane) and `intensity = |force|`. Caller may pass an `out` object
 * with a reusable Vector3 `force` to avoid allocations in a hot loop.
 *
 * Spatial advection: the gust front is treated as a plane moving with
 * velocity `gustFrontVelocity`. A point at `pos` lies a signed distance
 * `s = dot(pos, gustFrontVelocity)/|gustFrontVelocity|²` "ahead" of the
 * origin in front-time units; the spike phase at `pos` is therefore
 * `t - s`. Downstream points see the same phase later → the gust visibly
 * travels.
 *
 * Determinism: pure function of inputs. Two calls with bit-identical
 * arguments return bit-identical outputs.
 */
export function windAt(t, pos, windState, out) {
  const ws = windState || defaultWindState()
  const dst = out || { force: new THREE.Vector3(), intensity: 0 }

  // 1. DRIFT
  _tmpForce.copy(ws.baseDirection).multiplyScalar(ws.baseSpeedMps)

  // 2/3. GUST ENVELOPE × SPIKES (with spatial advection)
  const env = ws.gustEnvelope
  const amp = ws.gustsScale * env
  if (amp > 1e-5) {
    _tmpFront.copy(ws.gustFrontVelocity)
    const frontLenSq = _tmpFront.lengthSq()
    let phaseOffset = 0
    if (frontLenSq > 1e-6) {
      const px = (pos && pos.x) || 0
      const pz = (pos && pos.z) || 0
      // dot(pos.xz, frontVel.xz) / |front|²  → seconds the front took to
      // travel from origin to pos along its own axis.
      phaseOffset = (px * _tmpFront.x + pz * _tmpFront.z) / frontLenSq
    }
    const phase = t - phaseOffset
    // Smooth random shape; smoothmax against 0 gives sharp positive spikes.
    // Spatial scale `0.01` (~100 m) means neighboring trees see correlated
    // spikes; far apart trees see independent noise within the wave.
    const px = (pos && pos.x) || 0
    const pz = (pos && pos.z) || 0
    const raw = valueNoise2D(phase * 1.5, px * 0.01 + pz * 0.01 * 0.7)
    const spike = smoothmax(raw, 0, 8) * amp
    // Spike vector aligns with the gust front direction (the front
    // carries the wind it's pushing — outflow boundary semantics).
    if (frontLenSq > 1e-6) {
      _tmpDir.copy(_tmpFront).multiplyScalar(spike / Math.sqrt(frontLenSq))
    } else {
      _tmpDir.copy(ws.baseDirection).multiplyScalar(spike)
    }
    _tmpForce.add(_tmpDir)
  }

  dst.force.copy(_tmpForce)
  dst.intensity = _tmpForce.length()
  return dst
}

// -------------------------------------------------------------------------
// Constants exported for ADR-checkable invariants + consumer defaults.
// -------------------------------------------------------------------------

export const WIND_FIELD = Object.freeze({
  GUST_FRONT_DEFAULT_MPS,
  RUSTLE_AMPLITUDE_DEFAULT_M: 0.005,  // ~5 mm leaf-tip — operator spec
  SMOOTHMAX_K: 8,
  SPIKE_RATE: 1.5,
  SPATIAL_NOISE_SCALE: 0.01,          // ~100m correlation length
})
