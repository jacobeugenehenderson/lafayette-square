// claims-a-cli-scene-has-one-resolver.mjs — DOES ANY SCRIPT ASK "WHICH TOWN?" TWICE?
//
// cartograph/scene.js's requireExplicitMap() is THE resolver (reads `--scene=` and CARTOGRAPH_SCENE)
// and returns the scene. A script that calls it and ALSO parses --scene itself has two answers, and
// they disagree on some spelling. bake-trees.js did exactly this (2026-09-25): the guard accepted
// `--scene=provincetown`, its own parseArgs only knew `--scene X`, so the bake fell to
// scene='lafayette-square' with no inputs, aimed at LS's trees.json.
// Fails on any script under arborist/ cartograph/ scripts/ that calls requireExplicitMap() and
// reads the scene another way (`args.scene`, `get('--scene')`, an argv scan for --scene).
//
// ▶ MUTATION-TEST IT: in arborist/bake-trees.js, change `scene: cliScene,` back to `scene: args.scene,` → RED.
//
//   node checks/claims-a-cli-scene-has-one-resolver.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SECOND = /\bargs\.scene\b|\bargs\[['"]scene['"]\]|get\(\s*['"]--scene['"]\s*\)|indexOf\(\s*['"]--scene['"]\s*\)|startsWith\(\s*['"]--scene/
const files = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (e.name === 'node_modules' || e.name.startsWith('_archive') || e.name.startsWith('.')) continue
  const p = path.join(d, e.name)
  e.isDirectory() ? walk(p) : /\.m?js$/.test(e.name) && files.push(p) } }
for (const d of ['arborist', 'cartograph', 'scripts']) walk(path.join(REPO, d))
let callers = 0, red = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  if (!/requireExplicitMap\(/.test(src) || /export function requireExplicitMap/.test(src)) continue
  callers++
  src.split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return          // comments may name the old bug
    if (SECOND.test(line)) { red++; console.log(`   ⛔ ${path.relative(REPO, f)}:${i + 1} reads the scene a second way: ${line.trim().slice(0, 100)}`) }
  })
}
if (!callers) { console.log('⛔ FAIL — found no caller of requireExplicitMap; the check tested nothing'); process.exit(1) }
console.log(red ? `\n⛔ FAIL — ${red}` : `✅ PASS — ${callers} scripts ask requireExplicitMap which town, and none asks a second way`)
process.exit(red ? 1 : 0)
