// Hero camera animation: Catmull-Rom path through keyframes, eased phase.
// Pure math, no React, allocation-free on the hot path (write into `out`).

// Wave shapes: map normalized phase t01 ∈ [0,1] of one full period to
// a path-position s ∈ [0,1] along the keyframe sweep.
//
//   sine     — smooth ping-pong, slows at endpoints. (1 - cos(2π t)) / 2
//   triangle — linear ping-pong, constant speed, sharp turn at endpoints
//   sawtooth — one-way sweep 0→1, snap-reset at the end of the period
//
// Legacy keys (linear/easeInOut/slowInOut) still resolve for back-compat
// with any in-flight design.json before we migrate them.
export const WAVES = {
  sine:     (t) => (1 - Math.cos(2 * Math.PI * t)) / 2,
  triangle: (t) => t < 0.5 ? t * 2 : 2 - t * 2,
  sawtooth: (t) => t,
  // legacy:
  linear:    (t) => t < 0.5 ? t * 2 : 2 - t * 2,
  easeInOut: (t) => {
    const tri = t < 0.5 ? t * 2 : 2 - t * 2
    return tri < 0.5 ? 2 * tri * tri : 1 - Math.pow(-2 * tri + 2, 2) / 2
  },
  slowInOut: (t) => {
    const tri = t < 0.5 ? t * 2 : 2 - t * 2
    return tri < 0.5 ? 4 * tri * tri * tri : 1 - Math.pow(-2 * tri + 2, 3) / 2
  },
}
export const EASINGS = WAVES  // back-compat alias

// Catmull-Rom along an array of N-vectors (component-wise).
// `out` (length 3) is written and returned. Falls back to allocating if absent.
export function catmullRom(points, t, tension = 0.5, out) {
  const dst = out || [0, 0, 0]
  const n = points.length
  if (n < 2) {
    const p = points[0]
    if (p) { dst[0] = p[0]; dst[1] = p[1]; dst[2] = p[2] }
    else { dst[0] = 0; dst[1] = 0; dst[2] = 0 }
    return dst
  }
  const total = n - 1
  const segment = Math.min(Math.floor(t * total), total - 1)
  const local = t * total - segment

  const p0 = points[Math.max(0, segment - 1)]
  const p1 = points[segment]
  const p2 = points[Math.min(n - 1, segment + 1)]
  const p3 = points[Math.min(n - 1, segment + 2)]

  const t0 = local, t2 = t0 * t0, t3 = t2 * t0
  const a = 2 * t3 - 3 * t2 + 1
  const b = t3 - 2 * t2 + t0
  const c = -2 * t3 + 3 * t2
  const d = t3 - t2

  for (let i = 0; i < 3; i++) {
    const m1 = tension * (p2[i] - p0[i])
    const m2 = tension * (p3[i] - p1[i])
    dst[i] = a * p1[i] + b * m1 + c * p2[i] + d * m2
  }
  return dst
}

// Linear interpolation of FOV across keyframes (matches StageApp.jsx behavior).
export function lerpFov(keyframes, t) {
  const n = keyframes.length
  if (n < 2) return keyframes[0]?.fov ?? 22
  const segment = t * (n - 1)
  const idx = Math.min(Math.floor(segment), n - 2)
  const local = segment - idx
  return keyframes[idx].fov + local * (keyframes[idx + 1].fov - keyframes[idx].fov)
}

// Compute hero pose at normalized time t01 ∈ [0,1] along the keyframe path.
// `motion` = { tension, easing }. Writes into `outPos` and `outTgt` if provided.
// Returns { position, target, fov }.
export function heroAnimPose(t01, keyframes, motion, outPos, outTgt) {
  const ease = EASINGS[motion.easing] || EASINGS.easeInOut
  // Triangle wave + ease so the path swings start→end→start smoothly,
  // matching the legacy `-cos(2π t)` pattern when keyframes are colinear.
  const tri = t01 < 0.5 ? t01 * 2 : (1 - t01) * 2
  const eased = ease(tri)

  const positions = keyframes.map(k => k.position)
  const targets = keyframes.map(k => k.target)
  const tension = motion.tension ?? 0.5

  const position = catmullRom(positions, eased, tension, outPos)
  const target = catmullRom(targets, eased, tension, outTgt)
  const fov = lerpFov(keyframes, eased)

  return { position, target, fov }
}
