// claims-a-keyframe-carries-its-aim.mjs — IS EVERY SHOT THE OPERATOR'S OWN?
//
// ⭐ THE INVARIANT: every authored hero keyframe, in every Look, carries its own
// `position`, `target` and `fov`. Playback interpolates exactly those — nothing
// else aims the camera (ROADMAP H-7: "the camera does not orbit or orient to"
// the set-piece; BRIEF-camera-regimes).
//
// A keyframe without a target used to be aimed at the resolved HERO SUBJECT —
// the Arch, the hood centroid, or `[400,45,-100]`, a Lafayette Square point —
// so a town's shots silently depended on a designation nobody could see in the
// keyframe. The runtime now refuses such a keyframe loudly; this catches it in
// the authored state before any runtime has to.
//
// ⭐ AND ITS TIME (BRIEF-keyframe-timeline): every key carries `t` ∈ [0,1], the
// first at 0, rising strictly; an animated Look has heroMotion { length, mode }
// and its last key obeys the mode (bounce: at 1 · loop: before 1). Read through
// the runtime's own asserts, so the check and the players cannot disagree.
// Then the promise the timeline makes: PLAYED AT A KEY'S TIME, THE CAMERA IS ON
// THAT KEY — in both modes, whatever the Look's authored mode.
//
//   node checks/claims-a-keyframe-carries-its-aim.mjs
// Read-only. Exits 1 on any keyframe missing its aim or time, a bad motion, or a
// key the playback does not reach at its time.
import fs from 'fs'
import path from 'path'
import { assertKeyframesAimed, assertHeroMotion, heroPoseAtTime } from '../src/preview/heroAnim.js'

const LOOKS = 'public/looks'
const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)

const looks = fs.readdirSync(LOOKS).filter(d => fs.existsSync(path.join(LOOKS, d, 'design.json')))
if (!looks.length) { console.error(`⛔ no design.json under ${LOOKS} — the check is blind`); process.exit(1) }

let bad = 0, total = 0
for (const look of looks) {
  const d = JSON.parse(fs.readFileSync(path.join(LOOKS, look, 'design.json'), 'utf8'))
  const kfs = d.heroKeyframes ?? []
  if (!Array.isArray(kfs)) { console.log(`  ⛔ ${look}: heroKeyframes is not an array`); bad++; continue }
  const faults = []
  kfs.forEach((k, i) => {
    total++
    const miss = [!vec3(k?.position) && 'position', !vec3(k?.target) && 'target', !Number.isFinite(k?.fov) && 'fov'].filter(Boolean)
    if (miss.length) faults.push(`kf${i}: ${miss.join('+')}`)
  })
  if (!faults.length && kfs.length) {
    try { assertKeyframesAimed(kfs, look); assertHeroMotion(kfs, d.heroMotion, look) }
    catch (e) { faults.push(e.message.replace(`[${look}] `, '')) }
  }
  if (!faults.length && kfs.length > 1) {
    // Played at each key's time, the camera is on that key (≤ 1 mm, ≤ 0.001°).
    // Both modes, so a mode the Look does not use today is proven too.
    for (const mode of ['bounce', 'loop']) {
      const n = kfs.length, k = mode === d.heroMotion.mode ? 1 : mode === 'loop' ? (n - 1) / n : n / (n - 1)
      const ks = kfs.map((kf, i) => ({ ...kf, t: mode === 'bounce' && i === n - 1 ? 1 : kf.t * k }))
      const motion = { ...d.heroMotion, mode }
      ks.forEach((kf, i) => {
        const p = [0, 0, 0], q = [0, 0, 0]
        const { fov } = heroPoseAtTime(ks, motion, kf.t * motion.length, p, q)
        const off = Math.max(...p.map((v, j) => Math.abs(v - kf.position[j])), ...q.map((v, j) => Math.abs(v - kf.target[j])))
        if (off > 1e-3 || Math.abs(fov - kf.fov) > 1e-3) faults.push(`${mode}: kf${i} not reached at its time (${off.toFixed(3)} m off)`)
      })
    }
  }
  bad += faults.length
  const shape = kfs.length > 1 ? `  ${d.heroMotion.mode} ${d.heroMotion.length} s · t = ${kfs.map(k => k.t).join(', ')}` : ''
  console.log(`  ${faults.length ? '⛔' : '✅'} ${look.padEnd(28)} ${kfs.length} keyframe(s)${faults.length ? '  — ' + faults.join(' · ') : shape}`)
}
console.log(`\n${total} keyframes across ${looks.length} Looks, ${bad} fault(s).`)
process.exit(bad ? 1 : 0)
