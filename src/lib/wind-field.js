/**
 * wind-field — THE AIR: one definition of the wind field, read by the CPU (windAtAdvect) and, line for line, by the GPU
 * (WIND_FIELD_GLSL, which the wind sheet draws every frame — src/lib/windSheet.js, cartograph/ARCHITECTURE.md §8).
 *
 *   windAtAdvect(advect, pos, windState) → { force: Vector3 (m/s, world XZ, TO direction), intensity: m/s }
 *
 *   1. DRIFT — baseDirection × baseSpeedMps.
 *   2. GUSTS — a 2D noise pattern in the gust front's own frame, moving downwind with it; its size along and across
 *      the wind is the gust's SHAPE (gustLengths: squall lines ↔ round patches). `advect` = cells the pattern has moved.
 *
 * Pure: identical inputs → identical output. `windState` is the ONE CABLE's object (windSheet.js#windStateOfWeather,
 * or a specimen's named wind) as Vector3s: { baseSpeedMps, baseDirection, gustsScale, gustEnvelope, gustFrontVelocity,
 * gustShape }. ⛔ There is no other way in: the directive reader (resolveWindState) was deleted 2026-10-04 with its
 * last caller, and it had mirrored the wind north↔south (the world is +X east, +Z south).
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

// -------------------------------------------------------------------------
// The field
// -------------------------------------------------------------------------

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
 * The field at an ADVECTION (cells the gust pattern has moved downwind), not a time. The wind sheet accumulates the advection frame by frame, wrapped on the lattice period, so a
 * change of shape or speed never makes the pattern jump and float32 never runs out of precision.
 */
export function windAtAdvect(advect, pos, windState, out) {
  if (!windState) throw new Error('[wind-field] ⛔ windAtAdvect needs the one cable\'s windState — there is no default wind')
  const ws = windState
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
