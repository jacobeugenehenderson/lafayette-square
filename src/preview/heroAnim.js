// Hero camera: a timeline of keyframes, played in time.
// Pure math, no React, allocation-free on the hot path (write into `out`).
//
// ⭐ A KEY CARRIES ITS TIME (BRIEF-keyframe-timeline, Jacob 2026-09-26: "a real
// timeline, like After Effects"). The shot is
//   keyframes: [{ position, target, fov, t }]   t ∈ [0,1], a fraction of the length
//   motion:    { length, mode }                  length in seconds · 'bounce' | 'loop'
// The first key sits at t = 0 and is never removed. One key is a static shot.
//   · bounce — the last key sits at t = 1; the camera plays 0 → length, turns, and
//              plays back.
//   · loop   — after the last key the camera travels on to the FIRST key, which it
//              reaches at t = 1, and carries straight on: a lighthouse turn. The
//              closing key is the first key itself — never stored, so the seam
//              cannot come apart.
// Storing t as a fraction means changing the length stretches every key with it.
//
// ⛔ The camera reaches every key at exactly its time. Between keys the speed
// changes gradually THROUGH a key (a monotone cubic over distance travelled), so
// dragging a key retimes the shot without a jolt and without slowing at the key.
// There is no whole-shot ease: the retired sine wave put the camera nowhere near
// the operator's times, and stalled it at the ends (Jacob, 2026-09-26: "it feels
// like the camera is stalled because it's static for so long on the ends").

const TENSION = 0.5
export const HERO_MODES = ['bounce', 'loop']

// ── The shot, checked loudly where it is loaded ─────────────────────────────
// ⛔ EVERY KEYFRAME CARRIES ITS OWN AIM AND ITS OWN TIME (BRIEF-camera-regimes,
// ROADMAP H-7, BRIEF-keyframe-timeline). Playback interpolates the keys' own
// `position`, `target`, `fov` at their own `t` and nothing else. A key without
// them is refused here rather than placed somewhere plausible: a slab baked
// before targets or times existed must be re-baked
// (`checks/claims-a-keyframe-carries-its-aim.mjs` guards the authored side).
// Throws; call it where a render-time error reaches an error boundary.
const _vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
export function assertKeyframesAimed(keyframes, where = 'hero') {
  keyframes.forEach((k, i) => {
    if (!_vec3(k?.position) || !_vec3(k?.target) || !Number.isFinite(k?.fov)) {
      throw new Error(`[${where}] hero keyframe ${i} has no finite position/target/fov — ` +
        'every keyframe carries its own aim; re-bake a slab that predates keyframe targets')
    }
    if (!Number.isFinite(k.t) || k.t < 0 || k.t > 1 || (i === 0 && k.t !== 0) ||
        (i > 0 && !(k.t > keyframes[i - 1].t))) {
      throw new Error(`[${where}] hero keyframe ${i} has no valid time (t=${k.t}) — ` +
        'the first key sits at 0 and times rise strictly to at most 1; re-bake a slab that predates keyframe times')
    }
  })
  return keyframes
}

// The motion an animated shot (2+ keys) needs, and the mode's end rule.
export function assertHeroMotion(keyframes, motion, where = 'hero') {
  if (keyframes.length < 2) return motion
  if (!(motion?.length > 0) || !HERO_MODES.includes(motion?.mode)) {
    throw new Error(`[${where}] an animated hero shot needs heroMotion { length > 0, mode: bounce|loop } — ` +
      `got ${JSON.stringify(motion)}; re-bake a slab that predates the keyframe timeline`)
  }
  const last = keyframes[keyframes.length - 1].t
  if (motion.mode === 'bounce' && last !== 1) {
    throw new Error(`[${where}] a bounce shot's last key sits at the end (t = 1), not ${last}`)
  }
  if (motion.mode === 'loop' && !(last < 1)) {
    throw new Error(`[${where}] a loop shot's last key sits before the end (the loop closes on the first key at t = 1)`)
  }
  return motion
}

// ── The path through the keys ───────────────────────────────────────────────
// Catmull-Rom through the keys' positions and, on the same parameter, their
// targets — so aim and position cannot desynchronise. Knot j is key j; a loop
// has one more knot (the first key again) and wraps its neighbours, so the seam
// is as smooth as any other key.
function _crSeg(points, n, closed, seg, local, out) {
  const at = (j) => points[closed ? ((j % n) + n) % n : Math.max(0, Math.min(n - 1, j))]
  const p0 = at(seg - 1), p1 = at(seg), p2 = at(seg + 1), p3 = at(seg + 2)
  const t0 = local, t2 = t0 * t0, t3 = t2 * t0
  const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t0, c = -2 * t3 + 3 * t2, d = t3 - t2
  for (let i = 0; i < 3; i++) {
    const m1 = TENSION * (p2[i] - p0[i]), m2 = TENSION * (p3[i] - p1[i])
    out[i] = a * p1[i] + b * m1 + c * p2[i] + d * m2
  }
  return out
}

// ── The built shot (cached per keyframes array + motion) ────────────────────
// Distance along the path is measured over position AND aim together, so a
// camera that only turns (a lighthouse keeper's pan: the eye stays put, the
// target sweeps) still has a distance to pace by. A segment with no travel at
// all (a hold, or a FOV-only change) is paced by time.
const SUB = 64
function buildShot(keyframes, motion) {
  const n = keyframes.length
  const loop = motion.mode === 'loop'
  const L = motion.length
  const knots = loop ? n + 1 : n
  const segs = knots - 1
  const pos = keyframes.map(k => k.position), tgt = keyframes.map(k => k.target)
  const T = new Float64Array(knots)
  for (let i = 0; i < n; i++) T[i] = keyframes[i].t * L
  if (loop) T[n] = L

  // Per-segment cumulative distance at SUB+1 samples.
  const cum = new Float64Array(segs * (SUB + 1))
  const S = new Float64Array(knots)
  const pa = [0, 0, 0], pb = [0, 0, 0], ta = [0, 0, 0], tb = [0, 0, 0]
  for (let s = 0; s < segs; s++) {
    _crSeg(pos, n, loop, s, 0, pa); _crSeg(tgt, n, loop, s, 0, ta)
    let c = 0
    cum[s * (SUB + 1)] = 0
    for (let k = 1; k <= SUB; k++) {
      _crSeg(pos, n, loop, s, k / SUB, pb); _crSeg(tgt, n, loop, s, k / SUB, tb)
      c += Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2], tb[0] - ta[0], tb[1] - ta[1], tb[2] - ta[2])
      cum[s * (SUB + 1) + k] = c
      pa[0] = pb[0]; pa[1] = pb[1]; pa[2] = pb[2]; ta[0] = tb[0]; ta[1] = tb[1]; ta[2] = tb[2]
    }
    S[s + 1] = S[s] + c
  }

  // Monotone cubic (PCHIP) of distance over time: passes every key at its
  // time, speed continuous through each key, never runs backwards.
  const h = new Float64Array(segs), d = new Float64Array(segs), m = new Float64Array(knots)
  for (let s = 0; s < segs; s++) { h[s] = T[s + 1] - T[s]; d[s] = (S[s + 1] - S[s]) / h[s] }
  const blend = (d0, d1, h0, h1) => {
    if (!(d0 > 0 && d1 > 0)) return 0
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0
    return (w1 + w2) / (w1 / d0 + w2 / d1)
  }
  for (let k = 1; k < segs; k++) m[k] = blend(d[k - 1], d[k], h[k - 1], h[k])
  if (loop) m[0] = m[segs] = blend(d[segs - 1], d[0], h[segs - 1], h[0])
  else { m[0] = d[0]; m[segs] = d[segs - 1] }

  return { n, loop, L, segs, pos, tgt, T, S, cum, h, m }
}

const _shots = new WeakMap()
function shotFor(keyframes, motion) {
  const sig = `${motion.length}|${motion.mode}`
  const hit = _shots.get(keyframes)
  if (hit && hit.sig === sig) return hit.shot
  assertKeyframesAimed(keyframes)
  assertHeroMotion(keyframes, motion)
  const shot = buildShot(keyframes, motion)
  _shots.set(keyframes, { sig, shot })
  return shot
}

// Pose at segment `seg`, local path parameter `lam` ∈ [0,1].
function _poseSeg(shot, keyframes, seg, lam, outPos, outTgt) {
  _crSeg(shot.pos, shot.n, shot.loop, seg, lam, outPos)
  _crSeg(shot.tgt, shot.n, shot.loop, seg, lam, outTgt)
  const f0 = keyframes[seg % shot.n].fov, f1 = keyframes[(seg + 1) % shot.n].fov
  return f0 + lam * (f1 - f0)
}

/**
 * The pose at timeline time `sec` ∈ [0, length] — the one interpolation every
 * consumer uses: playback asks for the playhead's time, the Stage scrub asks for
 * the time under the pointer. Writes into the caller's arrays; returns { fov }.
 */
export function heroPoseAtTime(keyframes, motion, sec, outPos, outTgt) {
  const n = keyframes.length
  if (n === 1) {
    const k = keyframes[0]
    for (let i = 0; i < 3; i++) { outPos[i] = k.position[i]; outTgt[i] = k.target[i] }
    return { fov: k.fov }
  }
  const shot = shotFor(keyframes, motion)
  const { T, S, h, m, cum, segs } = shot
  const x = Math.max(0, Math.min(shot.L, sec))
  let seg = 0
  while (seg < segs - 1 && x >= T[seg + 1]) seg++
  const u = h[seg] > 0 ? (x - T[seg]) / h[seg] : 0
  const run = S[seg + 1] - S[seg]
  let lam = u
  if (run > 1e-9) {
    const u2 = u * u, u3 = u2 * u
    let s = (2 * u3 - 3 * u2 + 1) * S[seg] + (u3 - 2 * u2 + u) * h[seg] * m[seg] +
            (-2 * u3 + 3 * u2) * S[seg + 1] + (u3 - u2) * h[seg] * m[seg + 1]
    s = Math.max(0, Math.min(run, s - S[seg]))
    const base = seg * (SUB + 1)
    let lo = 1, hi = SUB
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[base + mid] < s) lo = mid + 1; else hi = mid }
    const c0 = cum[base + lo - 1], c1 = cum[base + lo]
    lam = (lo - 1 + (c1 > c0 ? (s - c0) / (c1 - c0) : 0)) / SUB
  }
  return { fov: _poseSeg(shot, keyframes, seg, lam, outPos, outTgt) }
}

/**
 * A pose along the PATH (not the timeline), `f` ∈ [0,1] over every segment —
 * including a loop's closing one. For consumers that want the set of poses the
 * camera occupies, not when (the 3D path line, the tree bake's hero tiers).
 */
export function heroPathPose(keyframes, motion, f, outPos = [0, 0, 0], outTgt = [0, 0, 0]) {
  if (keyframes.length === 1) {
    const { fov } = heroPoseAtTime(keyframes, motion, 0, outPos, outTgt)
    return { position: outPos, target: outTgt, fov }
  }
  const shot = shotFor(keyframes, motion)
  const g = Math.max(0, Math.min(1, f)) * shot.segs
  const seg = Math.min(Math.floor(g), shot.segs - 1)
  const fov = _poseSeg(shot, keyframes, seg, g - seg, outPos, outTgt)
  return { position: outPos, target: outTgt, fov }
}

// ── The playhead: wall clock → timeline time ────────────────────────────────
// loop   — the playhead runs 0 → length and wraps; the seam is the first key.
// bounce — it runs 0 → length and back. At each end it TURNS rather than stops:
//          its speed ramps through zero over `_turnSec` either side of the
//          turn, and is exactly 1 s/s everywhere else — so the spacing of keys
//          in time is the spacing the viewer sees, and each turn costs only
//          `_turnSec` of wall clock beyond the length.
// ⚠️ The turn is the only easing left, and it is short on purpose. Live-tunable
// for the eye-gate: `window.__heroTurn(4)`.
let _turnSec = 4
if (typeof window !== 'undefined') {
  window.__heroTurn = (v) => {
    if (v != null) _turnSec = Math.max(0, v)
    console.log(`[hero] bounce turn = ${_turnSec} s each side (0 = an instant reversal)`)
    return _turnSec
  }
}
const _turn = (L) => Math.min(_turnSec, L / 4)

/** Seconds of wall clock one full cycle takes (a loop, or there-and-back). */
export function heroCycleSec(motion) {
  if (!(motion?.length > 0)) return 0
  return motion.mode === 'loop' ? motion.length : 2 * (motion.length + _turn(motion.length))
}

function _playhead(clock, motion) {
  const L = motion.length
  const C = heroCycleSec(motion)
  let x = ((clock % C) + C) % C
  if (motion.mode === 'loop') return x
  const w = _turn(L), H = L + w
  if (x > H) x = C - x                     // the way back mirrors the way out
  if (!(w > 0)) return Math.min(L, x)
  if (x < w) return (x * x) / (2 * w)
  if (x > H - w) return L - ((H - x) * (H - x)) / (2 * w)
  return w / 2 + (x - w)
}

/** The wall-clock phase at which the playhead sits at `sec`, heading forward. */
export function heroClockAt(motion, sec) {
  const L = motion.length
  if (motion.mode === 'loop') return Math.max(0, Math.min(L, sec))
  const w = _turn(L), H = L + w, p = Math.max(0, Math.min(L, sec))
  if (!(w > 0)) return p
  if (p < w / 2) return Math.sqrt(2 * w * p)
  if (p > L - w / 2) return H - Math.sqrt(2 * w * (L - p))
  return p + w / 2
}

// The authored hero animation — played by ONE driver, src/camera/MovieCamera.jsx, in every app (production,
// Preview, Stage); the driver owns the clock, the start phase and the speed (BRIEF-one-movie-driver).
//
// `clockSec` — the driver's clock, already scaled by speed; `motion` = { length, mode }. Writes the camera
// position/aim into `outPos`/`outTgt` (THREE.Vector3). Returns { fov, time } — `time` is the playhead's second on
// the timeline, the same coordinate the Stage timeline's key markers and scrub use.
// ⛔ The camera is aimed by nothing but the keyframes (no subject fallback).
const _poseP = [0, 0, 0], _poseT = [0, 0, 0]
export function heroKeyframeAnim(clockSec, keyframes, motion, outPos, outTgt) {
  let time = 0
  if (keyframes.length > 1) time = _playhead(clockSec, motion)
  const { fov } = heroPoseAtTime(keyframes, motion, time, _poseP, _poseT)
  outPos.set(_poseP[0], _poseP[1], _poseP[2])
  if (outTgt) outTgt.set(_poseT[0], _poseT[1], _poseT[2])
  return { fov, time }
}
