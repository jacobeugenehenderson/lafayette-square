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

// ⭐ AN INTEGER HASH, EXACT IN FLOAT32 — so the GPU wind sheet (`windSheet.js`, which evaluates this same field
// in GLSL) and this CPU function agree to the bit on the lattice. The sin-hash it replaced (2026-10-04) cannot:
// `sin(x·12.98)·43758` at a lattice index in the thousands is a different number in a float32 shader than in a JS
// double, so the two would have drawn two winds. Every product here stays below 2^24 (578·34·578 ≈ 11.4M), so
// float32 represents it exactly. ⚠️ The lattice is periodic in 289 — the wind sheet wraps its clock on that period.
const mod289 = (x) => x - Math.floor(x * (1 / 289)) * 289
const permute = (x) => mod289((x * 34 + 1) * x)
function hash3(x, y, z) {
  return permute(permute(permute(mod289(x)) + mod289(y)) + mod289(z)) / 289
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
const SPIKE_RATE = 1.5             // lattice cells per second at a squall front (gustShape 1)
const SPATIAL_NOISE_SCALE = 0.01   // 1 / the gust's correlation length across the wind (100 m)
const SMOOTHMAX_K = 8

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
    gustShape:         1,  // the squall line this field always drew; the wind sheet's state sets its own
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
  const L = gustLengths(ws)
  return windAtAdvect(t * L.advectRate, pos, ws, out)
}

/**
 * ⭐ THE GUST'S SHAPE — how long a gust is along the wind against across it (Jacob, 2026-10-04: "this linear wind
 * looks like a storm"). `ws.gustShape` 0..1: 1 = a squall line (a thin front, ~7 m deep at the default front speed,
 * 100 m long, the shape this field always had), 0 = round patches 100 m across drifting downwind. Across the wind a
 * gust is always the correlation length (100 m); along it the length runs from that down to front speed ÷ spike rate.
 *   advectRate = cells per second the pattern moves past a fixed point (so a squall pulses fast, a patch slowly).
 */
export function gustLengths(ws) {
  const across = 1 / SPATIAL_NOISE_SCALE
  const frontSpeed = Math.hypot(ws.gustFrontVelocity.x, ws.gustFrontVelocity.z)
  const shape = Math.min(1, Math.max(0, ws.gustShape ?? 1))
  const along = frontSpeed > 1e-3 ? across + (frontSpeed / SPIKE_RATE - across) * shape : across
  return { along, across, advectRate: frontSpeed > 1e-3 ? frontSpeed / along : 0 }
}

/**
 * The field at an ADVECTION (cells the gust pattern has moved downwind) instead of a time. windAt is this at
 * `t × advectRate`; the wind sheet accumulates the advection frame by frame, wrapped on the lattice period, so a
 * change of shape or speed never makes the pattern jump and float32 never runs out of precision.
 */
export function windAtAdvect(advect, pos, windState, out) {
  const ws = windState || defaultWindState()
  const dst = out || { force: new THREE.Vector3(), intensity: 0 }
  // 1. DRIFT
  _tmpForce.copy(ws.baseDirection).multiplyScalar(ws.baseSpeedMps)
  // 2. GUSTS — a 2D pattern in the front's own frame, moving downwind with it.
  const amp = ws.gustsScale * ws.gustEnvelope
  if (amp > 1e-5) {
    const px = (pos && pos.x) || 0
    const pz = (pos && pos.z) || 0
    _tmpFront.copy(ws.gustFrontVelocity)
    const fl = Math.hypot(_tmpFront.x, _tmpFront.z)
    const fx = fl > 1e-3 ? _tmpFront.x / fl : ws.baseDirection.x
    const fz = fl > 1e-3 ? _tmpFront.z / fl : ws.baseDirection.z
    const L = gustLengths(ws)
    const u = advect - (px * fx + pz * fz) / L.along
    const v = (-px * fz + pz * fx) / L.across
    const spike = smoothmax(valueNoise2D(u, v), 0, SMOOTHMAX_K) * amp
    // The spike blows along the front (the front carries the wind it pushes — outflow boundary semantics).
    _tmpForce.x += fx * spike
    _tmpForce.z += fz * spike
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
  SMOOTHMAX_K,
  SPIKE_RATE,
  SPATIAL_NOISE_SCALE,                // ~100m correlation length
  // The hash lattice repeats every 289 cells, so an advection wrapped on 289 is seamless; the wind sheet's is.
  LATTICE_PERIOD: 289,
})

/**
 * ⭐ THE SAME FIELD, IN GLSL — `windAt` above, line for line, for the GPU wind sheet (`windSheet.js`). It lives HERE,
 * beside the JS, so the two are one definition read twice: change one and you change both, in one file.
 * ▶ node checks/claims-the-wind-has-one-authority.mjs (runs both on the same inputs and compares).
 *
 *   vec2 windFieldAt(float t, vec2 posXZ, vec2 baseForce, vec2 frontVel, float amp)
 *     baseForce = baseDirection.xz × baseSpeedMps · frontVel = gustFrontVelocity.xz · amp = gustsScale × gustEnvelope
 */
export const WIND_FIELD_GLSL = /* glsl */`
  float wfMod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  float wfPermute(float x) { return wfMod289((x * 34.0 + 1.0) * x); }
  float wfHash3(float x, float y, float z) {
    return wfPermute(wfPermute(wfPermute(wfMod289(x)) + wfMod289(y)) + wfMod289(z)) / 289.0;
  }
  float wfValueNoise2D(float x, float y) {
    float xi = floor(x), yi = floor(y);
    float xf = x - xi, yf = y - yi;
    float tx = xf * xf * (3.0 - 2.0 * xf), ty = yf * yf * (3.0 - 2.0 * yf);
    float n00 = wfHash3(xi,       yi,       0.0) * 2.0 - 1.0;
    float n10 = wfHash3(xi + 1.0, yi,       0.0) * 2.0 - 1.0;
    float n01 = wfHash3(xi,       yi + 1.0, 0.0) * 2.0 - 1.0;
    float n11 = wfHash3(xi + 1.0, yi + 1.0, 0.0) * 2.0 - 1.0;
    return (n00 * (1.0 - tx) + n10 * tx) * (1.0 - ty) + (n01 * (1.0 - tx) + n11 * tx) * ty;
  }
  float wfSmoothmax(float a, float b, float k) {
    float m = max(a, b);
    float ea = exp(k * (a - m)), eb = exp(k * (b - m));
    return (a * ea + b * eb) / (ea + eb);
  }
  // windAtAdvect: advect = cells moved downwind; frontDir = unit front direction; lengths = (along, across) metres.
  vec2 windFieldAt(float advect, vec2 p, vec2 baseForce, vec2 frontDir, vec2 lengths, float amp) {
    vec2 force = baseForce;
    if (amp > 1e-5) {
      float u = advect - dot(p, frontDir) / lengths.x;
      float v = dot(p, vec2(-frontDir.y, frontDir.x)) / lengths.y;
      force += frontDir * (wfSmoothmax(wfValueNoise2D(u, v), 0.0, ${SMOOTHMAX_K.toFixed(1)}) * amp);
    }
    return force;
  }
`
