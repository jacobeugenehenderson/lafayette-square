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
//   node checks/claims-a-keyframe-carries-its-aim.mjs
// Read-only. Exits 1 on any keyframe missing a finite position/target/fov.
import fs from 'fs'
import path from 'path'

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
  bad += faults.length
  console.log(`  ${faults.length ? '⛔' : '✅'} ${look.padEnd(28)} ${kfs.length} keyframe(s)${faults.length ? '  — ' + faults.join(' · ') : ''}`)
}
console.log(`\n${total} keyframes across ${looks.length} Looks, ${bad} without their own aim.`)
process.exit(bad ? 1 : 0)
