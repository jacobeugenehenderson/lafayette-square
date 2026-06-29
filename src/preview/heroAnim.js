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

// Authored hero animation — the one the operator actually tunes in Stage.
// Mirrors StageApp.jsx HeroPreview exactly: position swings along the
// keyframe positions (Catmull-Rom, wave-eased period phase), the target is
// the SUBJECT (NOT per-keyframe targets — these keyframes carry only
// position + fov), and fov interpolates across keyframes. Shared by Stage
// (HeroPreview), Preview (ShotCamera), and production (Scene.jsx CameraRig)
// — one authored hero animation across all three environments.
//
// `elapsedSec` — seconds since mount; `motion` = { period, easing, speed?,
// tension? }; writes the camera position into `outPos` (THREE.Vector3).
// Returns { fov }.
// Per-entry random phase offset so each visit to the Hero view picks up at a
// DIFFERENT point in the pan. Set on hero entry by the consumer (production
// CameraRig calls randomizeHeroStart). Module-scoped → per app instance, so it
// never randomizes Stage/Preview authoring unless they opt in (default 0 =
// no shift, the deterministic pan).
let _startOffsetSec = 0
export function randomizeHeroStart(period = 720) { _startOffsetSec = Math.random() * period }

// ── Arc-length reparam + per-keyframe dwell (heroKeyframeAnim ONLY) ─────────
// Two problems with the raw uniform-param sweep: (1) Catmull-Rom's parameter
// isn't proportional to distance, so unequal segments make the camera LURCH
// through the longest one (LS: kf1→kf2 ≈ 2× kf0→kf1 → the "jumpy broad end");
// (2) pure even-speed then erases the natural beat at each keyframe, so a middle
// keyframe stops reading as a distinct viewpoint ("kf1 went missing"). Fix:
// arc-length reparam for even speed BETWEEN keyframes + a smoothstep dwell that
// slows (C1 — no lurch) AT each keyframe. The cache is PRIVATE to this function
// (Stage drives catmullRom directly; nothing is shared, so no cross-consumer
// thrash — the bug that messed up Cartograph last time). (2026-06-28)
const _ARC_SAMPLES = 256
const _kfArc = { sig: null, u: null, cum: null, total: 0 }
const _kfArcP = [0, 0, 0], _kfArcPrev = [0, 0, 0]
let _kfDwell = 0.55   // 0 = constant speed · 1 = full ease-stop at each keyframe
if (typeof window !== 'undefined') {
  window.__heroDwell = (v) => {
    if (v != null) _kfDwell = Math.max(0, Math.min(1, v))
    console.log(`[hero] keyframe dwell = ${_kfDwell}`)
    return _kfDwell
  }
}

function _kfArcSig(positions, tension) {
  let h = (tension * 1000) | 0
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    h = (Math.imul(h, 31) + ((p[0] * 16) | 0)) | 0
    h = (Math.imul(h, 31) + ((p[1] * 16) | 0)) | 0
    h = (Math.imul(h, 31) + ((p[2] * 16) | 0)) | 0
  }
  return h * 16 + positions.length
}

function _ensureKfArc(positions, tension) {
  const sig = _kfArcSig(positions, tension)
  if (sig === _kfArc.sig) return
  if (!_kfArc.u) { _kfArc.u = new Float32Array(_ARC_SAMPLES + 1); _kfArc.cum = new Float32Array(_ARC_SAMPLES + 1) }
  catmullRom(positions, 0, tension, _kfArcPrev)
  _kfArc.u[0] = 0; _kfArc.cum[0] = 0
  let cum = 0
  for (let i = 1; i <= _ARC_SAMPLES; i++) {
    const uu = i / _ARC_SAMPLES
    catmullRom(positions, uu, tension, _kfArcP)
    const dx = _kfArcP[0] - _kfArcPrev[0], dy = _kfArcP[1] - _kfArcPrev[1], dz = _kfArcP[2] - _kfArcPrev[2]
    cum += Math.sqrt(dx * dx + dy * dy + dz * dz)
    _kfArc.u[i] = uu; _kfArc.cum[i] = cum
    _kfArcPrev[0] = _kfArcP[0]; _kfArcPrev[1] = _kfArcP[1]; _kfArcPrev[2] = _kfArcP[2]
  }
  _kfArc.total = cum; _kfArc.sig = sig
}

// arc-length fraction f∈[0,1] → the Catmull-Rom param at that distance.
function _mapKfArc(f) {
  if (_kfArc.total <= 0) return f
  const target = f * _kfArc.total
  let lo = 1, hi = _ARC_SAMPLES
  while (lo < hi) { const mid = (lo + hi) >> 1; if (_kfArc.cum[mid] < target) lo = mid + 1; else hi = mid }
  const c0 = _kfArc.cum[lo - 1], c1 = _kfArc.cum[lo], seg = c1 - c0
  const local = seg > 1e-9 ? (target - c0) / seg : 0
  return _kfArc.u[lo - 1] + local * (_kfArc.u[lo] - _kfArc.u[lo - 1])
}

const _kfPositions = []
export function heroKeyframeAnim(elapsedSec, keyframes, motion, outPos) {
  const period = motion.period || 720
  const speed = motion.speed || 1
  const wave = WAVES[motion.easing] || WAVES.sine
  const t = wave((((elapsedSec + _startOffsetSec) * speed) % period) / period)

  if (keyframes.length <= 1) {
    const p = keyframes[0]?.position || [0, 0, 0]
    outPos.set(p[0], p[1], p[2])
    return { fov: keyframes[0]?.fov ?? 22 }
  }
  _kfPositions.length = 0
  for (const k of keyframes) _kfPositions.push(k.position)
  const tension = motion.tension ?? 0.5
  _ensureKfArc(_kfPositions, tension)
  // Even speed between keyframes (arc-length) kills the long-segment lurch;
  // a smoothstep dwell per segment keeps each keyframe a felt beat. The path
  // is unchanged — we only retime WHERE along it the camera sits. Passes
  // through every keyframe exactly (local 0/1 land on the knots).
  let u = _mapKfArc(t)
  const segs = _kfPositions.length - 1
  const g = u * segs
  const seg = Math.min(Math.floor(g), segs - 1)
  const localRaw = g - seg
  const localEased = localRaw * localRaw * (3 - 2 * localRaw)   // smoothstep
  const local = localRaw + (localEased - localRaw) * _kfDwell
  u = (seg + local) / segs
  const p = catmullRom(_kfPositions, u, tension)
  outPos.set(p[0], p[1], p[2])
  return { fov: lerpFov(keyframes, u) }
}
