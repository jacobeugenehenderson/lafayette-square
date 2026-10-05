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
//   ④ Grove's "not loaded yet" empties are one stable identity (no `|| []` on the batch inputs);
//   ⑤ both capture gestures await the atlas ON DISK (its generatedAt) before ticking the baker;
//   ⑥ a forced (⟳) batch carries computed capture keys (never null);
//   ⑦ the tree material is compiled before the first masked/depth shot, and a missing switch throws;
//   ⑧ both gestures await THIS Look's roster board (the store stamps its owner) before ticking the baker.
// Static: this is browser capture code with no harness. It reads the source.
//
// ▶ MUTATION-TEST IT:
//     · HeroImpostorBaker.jsx deps: add `species` back → ① RED
//     · OverheadBaker.jsx: delete the `alive()` line before postOverhead → ② RED
//     · Grove.jsx bakeAll: delete its `await awaitDiskAtlas(` line → ⑤ RED
//     · Grove.jsx: `forceAll.current ? overheadSpecies` (the raw pool) → ⑥ RED
//     · captureImpostor.js: delete the `gl.compile(scene, cam)` retry → ⑦ RED
//     · Grove.jsx bakeAll: delete its `await awaitRosterBoard(activeLookId);` → ⑧ RED
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

console.log('captureImpostor.js — the first shot')
{ const s = src('src/components/captureImpostor.js')
  // ⑦ The capture switches exist only on a COMPILED shader, and the Grove hands the baker a fresh material, so the
  // first shot of every run fired before compile and captured the whole tree (2026-10-04, HPDM: woody into a leaf shell).
  ;/if \(!shaderUniforms\) \{ gl\.compile\(scene, cam\); shaderUniforms = captureUniforms\(\) \}/.test(s) ? ok('⑦ the material is compiled before the first masked/depth shot') : bad('captureImpostor.js: no compile before the first shot — the first hero shot of a run captures the whole tree')
  ;/capturing whole tree/.test(s) ? bad('captureImpostor.js: a missing capture switch still falls back to a whole-tree capture') : ok('⑦ a missing capture switch throws; it never captures the whole tree') }

console.log('Grove.jsx')
{ const s = src('src/arborist/Grove.jsx'), st = src('src/arborist/stores/useArboristStore.js')
  // ⑧ …and against THIS Look's roster board (2026-10-05: HPDM→Huron judged Huron by HPDM's board, two placed species
  // silently `out`). The store stamps whose board it holds; both gestures wait for it before ticking the baker.
  ;/if \(get\(\)\.activeLookId === look\) set\(\{ rosterBoardLook: look \}\)/.test(st) ? ok('⑧ the store stamps whose roster board it holds') : bad('useArboristStore: the roster board is not stamped with its Look')
  ;/useEffect\(\(\) => \{ loadRosterCoverage\(\) \}, \[activeLookId, loadRosterCoverage\]\)/.test(s) ? ok('⑧ the Grove loads its own roster board on every Look change') : bad('Grove.jsx: the Grove does not load its own roster board — a Look switch keeps the previous board')
  for (const fn of ['const bakeAll = async', 'const recaptureImpostors = async']) {
    const body = s.slice(s.indexOf(fn), s.indexOf(fn) + 4000)
    const iB = body.indexOf('await awaitRosterBoard('), iTick = body.indexOf('setOverheadTick(')
    iB > 0 && iTick > iB ? ok(`⑧ ${fn.split(' ')[1]} awaits this Look's roster board before ticking`) : bad(`Grove.jsx: ${fn.split(' ')[1]} ticks without awaiting this Look's roster board`)
  } }
{ const s = src('src/arborist/Grove.jsx')
  for (const v of ['rosterSpecies', 'activeLookTrees']) {
    const m = s.match(new RegExp(`const ${v} = ([^\\n]+)`))
    !m ? bad(`Grove.jsx: no \`const ${v}\``) : /\|\|\s*\[\]/.test(m[1]) ? bad(`Grove.jsx: ${v} falls back to a fresh [] each render: ${m[1]}`) : ok(`④ ${v} has a stable empty`)
   }
  // ⑤ A capture is judged and shot against the atlas ON DISK, not this page's cached one (2026-10-04: four towns
  // captured against the previous atlas — 6 of Provincetown's 8 species never shot). Both gestures await the disk
  // atlas before ticking the baker, and the wait compares the atlas's own stamp.
  const wait = s.match(/const awaitDiskAtlas = async[\s\S]*?\n  \}\n/)?.[0] || ''
  ;/generatedAt === stamp/.test(wait) && /invalidateTreeAtlas\(lookId\)/.test(wait) ? ok('⑤ awaitDiskAtlas drops the cache and waits for the stamp on disk') : bad('Grove.jsx: awaitDiskAtlas missing, or it does not wait for the disk atlas\'s generatedAt')
  for (const fn of ['const bakeAll = async', 'const recaptureImpostors = async']) {
    const body = s.slice(s.indexOf(fn), s.indexOf(fn) + 4000)
    const iWait = body.indexOf('await awaitDiskAtlas('), iTick = body.indexOf('setOverheadTick(')
    s.includes(fn) && iWait > 0 && iTick > iWait ? ok(`⑤ ${fn.split(' ')[1]} awaits the disk atlas before ticking the baker`) : bad(`Grove.jsx: ${fn.split(' ')[1]} ticks the baker without awaiting the disk atlas (wait ${iWait}, tick ${iTick})`)
  }
  // ⑥ A FORCED (⟳) batch carries each species' captureKey: the raw pool has none, and a null key makes the next
  // ordinary bake re-shoot every species ⟳ touched (2026-10-04: all 9 LS overhead records written null).
  const forced = (s.match(/const overheadBatch = forceAll\.current \? (\w+)/) || [])[1], forcedH = (s.match(/const heroBatch = forceAll\.current \? (\w+)/) || [])[1]
  const keyed = (name) => name && new RegExp(`const ${name} = useMemo\\([\\s\\S]{0,300}captureKey: computeCaptureKey\\(`).test(s)
  keyed(forced) && keyed(forcedH) ? ok('⑥ a forced (⟳) batch carries computed capture keys, overhead and hero') : bad(`Grove.jsx: the forced batch (${forced} / ${forcedH}) does not carry computed capture keys — ⟳ would stamp null`) }
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
