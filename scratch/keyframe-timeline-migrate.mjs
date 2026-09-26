// keyframe-timeline-migrate.mjs — ONE-TIME: give every authored hero key its time
// (BRIEF-keyframe-timeline, 2026-09-26). Each key gets the moment TODAY's playback
// reaches it, so every key is hit at the same second before and after; the length
// is the old one-way pass (period / 2); the mode is 'bounce' (today's motion).
//
//   node scratch/keyframe-timeline-migrate.mjs <path-to-OLD-heroAnim.js> [--write]
// The old module comes from git: `git show 81748fa4:src/preview/heroAnim.js > old.mjs`.
// Without --write it prints the times and changes nothing.
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const [oldPath, flag] = process.argv.slice(2)
if (!oldPath) { console.error('usage: <old heroAnim.js> [--write]'); process.exit(1) }
const { heroKeyframeAnim } = await import(pathToFileURL(path.resolve(oldPath)).href)
const V = () => { const a = [0, 0, 0]; a.set = (x, y, z) => { a[0] = x; a[1] = y; a[2] = z }; return a }

let keys = 0, looks = 0
for (const look of fs.readdirSync('public/looks')) {
  const file = path.join('public/looks', look, 'design.json')
  if (!fs.existsSync(file)) continue
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  const K = d.heroKeyframes || []
  if (!K.length) continue
  if (K.every(k => 't' in k)) { console.log(`  ${look}: already migrated`); continue }
  const m = d.heroMotion, P = m?.period
  if (!(P > 0)) throw new Error(`${look}: no heroMotion.period to migrate from`)
  const n = K.length, half = P / 2, N = 400000, times = [0]
  // Today's playback over the forward half: the second at which u reaches each knot.
  let ki = 1
  for (let s = 1; s <= N && ki < n; s++) {
    const sec = (s / N) * half
    const { u } = heroKeyframeAnim(sec, K, m, V(), V())
    while (ki < n && u >= ki / (n - 1) - 1e-6) { times.push(sec); ki++ }
  }
  if (times.length !== n) throw new Error(`${look}: today's playback did not reach every key`)
  const t = times.map((s, i) => i === n - 1 ? 1 : Math.round((s / half) * 1e6) / 1e6)
  console.log(`  ${look.padEnd(18)} ${n} keys · length ${half} s · t = ${t.join(', ')} (${times.map(s => s.toFixed(1)).join(' · ')} s)`)
  keys += n; looks++
  if (flag === '--write') {
    d.heroKeyframes = K.map((k, i) => ({ ...k, t: t[i] }))
    d.heroMotion = { length: half, mode: 'bounce' }
    fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n')
  }
}
console.log(`\n${keys} keys in ${looks} Looks${flag === '--write' ? ' — written' : ' (dry run)'}`)
