// claims-a-capture-run-finishes-what-it-started.mjs — CAN A GROVE CAPTURE RUN BE RESTARTED MID-LIST, OR UPLOAD AFTER IT WAS TORN DOWN?
//
// 2026-09-26, Provincetown: the hero capture "looped". maple_red and oak_white were re-shot while
// overlapping each other and the pines were never reached. The bakers' effects depended on `species`
// (so every re-render that rebuilt the batch tore a run down and restarted it at index 0), and
// `cancelled` was read only at the top of each species (so the torn-down run kept shooting and
// POSTed alongside the new one). And their per-shot wait was requestAnimationFrame, which never
// fires in a hidden tab, so a background capture stalled on its first shot. Holds, for BOTH bakers:
//   ① `species` is not in the run effect's dependency list;
//   ② every capture POST is immediately guarded by alive(), and the retry catch re-throws the cancel;
//   ③ the per-shot wait is the shared nextCaptureFrame (hidden-tab safe), never raw rAF;
//   ④ Grove's "not loaded yet" empties are one stable identity (no `|| []` on the batch inputs).
// Static: this is browser capture code with no harness. It reads the source.
//
// ▶ MUTATION-TEST IT:
//     · HeroImpostorBaker.jsx deps: add `species` back → ① RED
//     · OverheadBaker.jsx: delete the `alive()` line before postOverhead → ② RED
//
//   node checks/claims-a-capture-run-finishes-what-it-started.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (rel) => fs.readFileSync(process.env[`SRC_${path.basename(rel).replace(/\W/g, '_')}`] || path.join(REPO, rel), 'utf8')
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)

for (const [rel, post] of [['src/arborist/HeroImpostorBaker.jsx', 'postHeroImpostor'], ['src/arborist/OverheadBaker.jsx', 'postOverhead']]) {
  const s = src(rel), name = path.basename(rel)
  console.log(name)
  const deps = s.match(/\}, \[runTick[^\]]*\]\)/g) || []
  if (deps.length !== 1) bad(`${name}: expected one run-effect dependency list, found ${deps.length}`)
  else /\bspecies\b/.test(deps[0]) ? bad(`${name}: \`species\` is a run dependency — a re-render restarts the run (${deps[0]})`) : ok('① species is not a run dependency')
  const lines = s.split('\n')
  const posts = lines.map((l, i) => [l, i]).filter(([l]) => new RegExp(`await ${post}\\(`).test(l))
  if (!posts.length) bad(`${name}: no \`await ${post}(\` found — the check and the source have drifted`)
  for (const [, i] of posts) /^\s*alive\(\)\s*$/.test(lines[i - 1]) ? ok(`② ${post} at :${i + 1} is guarded by alive()`) : bad(`${name}:${i + 1} ${post} is not immediately guarded by alive()`)
  ;/catch \(e\) \{\s*\n\s*if \(e === CAPTURE_CANCELLED\) throw e/.test(s) ? ok('② the retry catch re-throws the cancel') : bad(`${name}: the retry catch can swallow CAPTURE_CANCELLED`)
  ;/if \(e === CAPTURE_CANCELLED\) break/.test(s) ? ok('② the run loop stops on the cancel') : bad(`${name}: the run loop doesn't stop on CAPTURE_CANCELLED`)
  const code = lines.filter(l => !/^\s*\/\//.test(l)).join('\n')
  ;/requestAnimationFrame/.test(code) ? bad(`${name}: calls requestAnimationFrame directly (stalls in a hidden tab)`) : (/nextCaptureFrame/.test(s) ? ok('③ per-shot wait is the shared nextCaptureFrame') : bad(`${name}: doesn't use nextCaptureFrame`))
}

console.log('captureImpostor.js')
{ const s = src('src/components/captureImpostor.js')
  ;/export function nextCaptureFrame\(\)[\s\S]{0,300}document\.hidden[\s\S]{0,120}setTimeout/.test(s) ? ok('③ nextCaptureFrame steps on a timer when the tab is hidden') : bad('nextCaptureFrame has no hidden-tab path') }

console.log('Grove.jsx')
{ const s = src('src/arborist/Grove.jsx')
  for (const v of ['rosterSpecies', 'activeLookTrees']) {
    const m = s.match(new RegExp(`const ${v} = ([^\\n]+)`))
    !m ? bad(`Grove.jsx: no \`const ${v}\``) : /\|\|\s*\[\]/.test(m[1]) ? bad(`Grove.jsx: ${v} falls back to a fresh [] each render: ${m[1]}`) : ok(`④ ${v} has a stable empty`)
  } }
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
