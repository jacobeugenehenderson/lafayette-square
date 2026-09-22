#!/usr/bin/env node
/**
 * claims-the-shadow-box-has-no-cliff — the fitted shadow box is continuous at the horizon.
 *
 * ⛔⛔ THE SHADOW BOX IS FITTED TO WHAT THE CAMERA SEES, AND ITS SIZE SETS THE TEXEL GRID
 * (`texel = 2 * half / SHADOW_MAP_SIZE`). So the moment `half` changes, EVERY shadow edge
 * in the scene re-snaps to a grid of a different pitch — one frame, whole screen. A size
 * that is DISCONTINUOUS in camera angle is therefore a flash, not a detail.
 *
 * Instance, 2026-09-21 (Jacob: "the flashing is worse than ever… only at certain angles
 * and ranges"): the ground-hit ray fell back to the point straight BELOW the camera when
 * it found no intersection — i.e. the SMALLEST extent at exactly the angle where the
 * camera sees the FURTHEST. Measured at camY 60 / fov 45 / townHalf 3539, the box went
 * **3539 m → 64 m across 0.1° of pitch**, a 55× step in texel size. A near-level camera —
 * a lighthouse-height pan, say — sits on that cliff and jitters across it every frame.
 * ⚠️ It only became possible when the frustum became camera-fitted the same week; a fixed
 * box cannot flap. ⛔ And no hysteresis band can damp a 55× step, so "tune the hysteresis"
 * is not a fix and must not be attempted as one.
 *
 * ⛔⛔ AND THE BOX HAS TWO DEGREES OF FREEDOM, SO IT HAS TWO CLIFFS. `c8bb79d9` closed the
 * SIZE one and left the CENTRE one untouched — and the centre's is UNBOUNDED, because the
 * ground hit is `-camY / fwd.y`. Measured 2026-09-22 at 0.001° on huron: **573 km in one
 * step at pitch −0.005°**. A 3.7 km box centred 573 km out holds no town, so every shadow
 * in frame disappears — the same whole-screen two-state flicker, in the same place, which
 * is exactly why measuring the size alone read as "fixed". §1 pins all three properties.
 *
 * ⭐ THIS RE-IMPLEMENTS THE FIT RATHER THAN IMPORTING IT, on purpose: the source is inside
 * a `useFrame` in a React component that needs a live three.js camera. What is pinned are
 * the PROPERTIES — one bucket of size step; a centre that never jumps further than the box
 * is wide; and a full-extent box that is the whole-town box — so the check stays true
 * however the code is refactored. ⛔ It also reads the source for both cliffs' original
 * shapes, so the property test and the shape test have to both pass.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe fitted shadow box is continuous as the camera crosses the horizon')

// ── 1. The property: sweep pitch through the horizon. SIZE may step one bucket;
//      the CENTRE may not teleport off the ground it was covering, and once the fit
//      saturates to the whole town the box must actually contain the whole town.
//
// ⛔⛔ SIZE AND POSITION ARE TWO CLIFFS, NOT ONE. `c8bb79d9` closed the size cliff and
// left the position one untouched, and the position one is UNBOUNDED: looking down the
// focus is the ground hit at `-camY / fwd.y`, which runs to infinity as the pitch goes
// level; grazing or up it snaps to the point under the camera. Measured at 0.001° on
// huron (camY 60, fov 45, townHalf 3697.9): **573 km in one step at pitch −0.005°**,
// bounded only by the sampling resolution. A 3.7 km box centred hundreds of km out
// contains no town ⇒ every shadow in frame disappears until the pitch jitters back.
// Same signature as the size cliff and in the same place, which is why one measurement
// of the size alone read as "fixed".
const SHADOW_MAP_SIZE = 4096
const pow2 = (v) => Math.pow(2, Math.ceil(Math.log2(Math.max(1, v))))
// One frame of the fit, reproducing `CelestialBodies`' useFrame arithmetic. Sun
// straight up, so the light's tangent axes are world x/z and the focus reads directly.
function fitAt(pitchDeg, { camY, fov, townHalf }, prevHalf) {
  const fy = Math.sin((pitchDeg * Math.PI) / 180)
  const fh = Math.cos((pitchDeg * Math.PI) / 180)
  const lookingDown = fy < -1e-4
  const t = lookingDown ? -camY / fy : 0
  let fx = fh * t
  const dist = Math.hypot(fx, camY)
  const seen = lookingDown
    ? dist * Math.tan(((fov * 0.5) * Math.PI) / 180)
    : Infinity                                   // horizon in shot ⇒ the whole town
  const rawHalf = Math.min(townHalf, Math.max(60, seen * 1.6))
  let half = prevHalf
  if (half == null || rawHalf > half) half = Math.min(townHalf, pow2(rawHalf))
  else if (rawHalf < half * 0.45) half = Math.min(townHalf, pow2(rawHalf))
  // ⭐ The slack the box has before it pushes town off its own edge. Derived from the
  // scene's stencil extent — never a constant. At saturation it is zero, i.e. the
  // town centre, which is what makes the two sides of the horizon meet.
  const slack = Math.max(0, townHalf - half)
  fx = Math.max(-slack, Math.min(slack, fx))
  const texel = (2 * half) / SHADOW_MAP_SIZE
  return { half, focus: Math.round(fx / texel) * texel }
}
// Two towns' worth of scale — LS's disc and huron's — and three camera heights.
for (const townHalf of [1013.2, 3697.9]) {
  for (const camY of [1.7, 60, 400]) {
    let prev = null, worstSize = 1, worstSizeAt = null
    let worstJump = 0, worstJumpAt = null, worstJumpBudget = Infinity
    let worstStray = 0, worstStrayAt = null
    // 0.001° — the cliff is a step function and a coarse sweep walks straight over it.
    for (let p = -20; p <= 5; p += 0.001) {
      const f = fitAt(p, { camY, fov: 45, townHalf }, prev?.half ?? null)
      if (prev) {
        if (prev.half !== f.half) {
          const ratio = Math.max(f.half / prev.half, prev.half / f.half)
          if (ratio > worstSize) { worstSize = ratio; worstSizeAt = p }
        }
        // ⛔ The centre may move, but never further than the box is wide: past that the
        // new box shares no ground with the old one and the whole screen changes state.
        const jump = Math.abs(f.focus - prev.focus)
        const budget = Math.min(prev.half, f.half)
        if (jump / budget > worstJump / worstJumpBudget) {
          worstJump = jump; worstJumpBudget = budget; worstJumpAt = p
        }
      }
      // ⛔ And when the fit has saturated to the whole town, the box IS the whole-town
      // box — anything else means the town is partly or wholly outside the shadow map.
      if (f.half >= townHalf - 1e-9) {
        const stray = Math.abs(f.focus)
        if (stray > worstStray) { worstStray = stray; worstStrayAt = p }
      }
      prev = f
    }
    const tag = `townHalf ${townHalf}, camY ${camY}`
    if (worstSize > 2.0001) {
      bad(`${tag}: the box SIZE jumps ${worstSize.toFixed(1)}× at pitch `
        + `${worstSizeAt.toFixed(3)}° — every shadow edge re-snaps at once`)
    } else ok(`${tag}: worst size step ${worstSize.toFixed(1)}× (one bucket)`)
    if (worstJump > worstJumpBudget) {
      bad(`${tag}: the box CENTRE jumps ${(worstJump / 1000).toFixed(1)} km at pitch `
        + `${worstJumpAt.toFixed(3)}° — more than the box's own ${worstJumpBudget.toFixed(0)} m `
        + `half-extent, so the new box covers none of the ground the old one did: every `
        + `shadow in frame disappears for a frame`)
    } else {
      ok(`${tag}: worst centre jump ${worstJump.toFixed(0)} m, inside the box's own `
        + `${worstJumpBudget.toFixed(0)} m half-extent`)
    }
    const texelAtTown = (2 * townHalf) / SHADOW_MAP_SIZE
    if (worstStray > texelAtTown) {
      bad(`${tag}: at full extent the box is centred ${worstStray.toFixed(0)} m off the town `
        + `(pitch ${worstStrayAt.toFixed(3)}°) — the town is outside its own shadow map`)
    } else ok(`${tag}: at full extent the box is the whole-town box (≤1 texel off centre)`)
  }
}

// ── 2. The shape: neither cliff's original form may come back.
const src = readFileSync(path.join(ROOT, 'src/components/CelestialBodies.jsx'), 'utf8')
if (!/lookingDown/.test(src)) {
  bad('CelestialBodies no longer distinguishes looking-down from the grazing case — the '
    + 'no-ground-hit branch is where the cliff lives. Update this check if the fit moved.')
} else if (/const t = .*\? -camera\.position\.y \/ _shadowFwd\.y : -1/.test(src)) {
  bad('the old `t > 0 ? … : straight-below` fallback is back — "no ground hit" is being '
    + 'read as "sees nothing" when it means "sees to the horizon"')
} else ok('the grazing case is handled as maximum extent, not minimum')
if (!/townHalf - half/.test(src)) {
  bad('the fit no longer holds the focus inside the town\'s remaining slack '
    + '(`townHalf - half`) — the box centre is free to run to the horizon ray\'s '
    + 'intersection again, which is the 573 km step')
} else ok('the focus is held inside the town\'s remaining slack, in the light\'s axes')

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ no cliff in the shadow box\n')
process.exit(failed ? 1 : 0)
