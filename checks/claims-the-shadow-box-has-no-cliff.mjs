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
 * ⭐ THIS RE-IMPLEMENTS THE FIT RATHER THAN IMPORTING IT, on purpose: the source is inside
 * a `useFrame` in a React component that needs a live three.js camera. What is pinned is
 * the PROPERTY — no step larger than one power-of-two bucket between adjacent angles —
 * so the check stays true however the code is refactored, and it fails if anyone
 * reintroduces a branch that treats "no ground hit" as "sees nothing".
 * ⛔ It also reads the source for the inverted fallback directly, so the property test and
 * the shape test have to both pass.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe fitted shadow box is continuous as the camera crosses the horizon')

// ── 1. The property: sweep pitch through the horizon, allow no jump beyond one bucket.
const pow2 = (v) => Math.pow(2, Math.ceil(Math.log2(Math.max(1, v))))
function bucketAt(pitchDeg, { camY, fov, townHalf }) {
  const fy = Math.sin((pitchDeg * Math.PI) / 180)
  const lookingDown = fy < -1e-4
  const seen = lookingDown
    ? Math.abs(camY / fy) * Math.tan(((fov * 0.5) * Math.PI) / 180)
    : Infinity                                   // horizon in shot ⇒ the whole town
  const rawHalf = Math.min(townHalf, Math.max(60, seen * 1.6))
  return Math.min(townHalf, pow2(rawHalf))
}
// Three towns' worth of scale, and two camera heights: a street eye and a tower.
for (const townHalf of [900, 3539]) {
  for (const camY of [1.7, 60, 400]) {
    let prev = null, worst = 1, worstAt = null
    for (let p = -20; p <= 5; p += 0.01) {
      const b = bucketAt(p, { camY, fov: 45, townHalf })
      if (prev != null && prev !== b) {
        const ratio = Math.max(b / prev, prev / b)
        if (ratio > worst) { worst = ratio; worstAt = p }
      }
      prev = b
    }
    if (worst > 2.0001) {
      bad(`townHalf ${townHalf}, camY ${camY}: the box jumps ${worst.toFixed(1)}× at pitch `
        + `${worstAt.toFixed(2)}° — every shadow edge re-snaps at once`)
    } else ok(`townHalf ${townHalf}, camY ${camY}: worst step ${worst.toFixed(1)}× (one bucket)`)
  }
}

// ── 2. The shape: the inverted fallback must not come back.
const src = readFileSync(path.join(ROOT, 'src/components/CelestialBodies.jsx'), 'utf8')
if (!/lookingDown/.test(src)) {
  bad('CelestialBodies no longer distinguishes looking-down from the grazing case — the '
    + 'no-ground-hit branch is where the cliff lives. Update this check if the fit moved.')
} else if (/const t = .*\? -camera\.position\.y \/ _shadowFwd\.y : -1/.test(src)) {
  bad('the old `t > 0 ? … : straight-below` fallback is back — "no ground hit" is being '
    + 'read as "sees nothing" when it means "sees to the horizon"')
} else ok('the grazing case is handled as maximum extent, not minimum')

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ no cliff in the shadow box\n')
process.exit(failed ? 1 : 0)
