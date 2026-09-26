// claims-a-town-never-bakes-from-the-whole-library.mjs — CAN A TREE BAKE PLANT A SPECIES FROM OUTSIDE THE TOWN'S GROVE?
//
// ROADMAP H-20 / Layer 0 q2. bake-trees' variant pool is the town's SELECTION (its grove). It used
// to fall back to `index.variants` — every library species — on three paths (empty selection,
// uncomputable selection, selection matching no variant), and the category lottery then planted
// other towns' species. Those paths now refuse. This check reads bake-trees.js and fails if any
// path can hand pickVariant the whole library:
//   · variantPool is never assigned `index.variants` (or a copy of it);
//   · pickVariant is never called with `index.variants`;
//   · no message still promises to bake "with the full pool".
//
// ▶ MUTATION-TEST IT: `let variantPool = null` → `let variantPool = index.variants` → RED.
//
//   node checks/claims-a-town-never-bakes-from-the-whole-library.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.env.BAKE_TREES_SRC || path.join(REPO, 'arborist/bake-trees.js')
const lines = fs.readFileSync(file, 'utf8').split('\n')
let red = 0, calls = 0, pools = 0
lines.forEach((line, i) => {
  if (/^\s*(\/\/|\*)/.test(line)) return
  const at = `bake-trees.js:${i + 1}`
  if (/\bvariantPool\s*=/.test(line)) { pools++; if (/index\.variants(?!\.filter)|\[\s*\.\.\.\s*index\.variants/.test(line)) { red++; console.log(`   ⛔ ${at} the pool is the whole library: ${line.trim()}`) } }
  if (/\bpickVariant\(/.test(line) && !/function pickVariant/.test(line)) { calls++; if (/index\.variants/.test(line)) { red++; console.log(`   ⛔ ${at} pickVariant is handed the whole library: ${line.trim()}`) } }
  if (/full pool/i.test(line)) { red++; console.log(`   ⛔ ${at} still offers a full-pool bake: ${line.trim().slice(0, 100)}`) }
})
if (!pools || !calls) { console.log(`⛔ FAIL — found ${pools} pool assignment(s) and ${calls} pickVariant call(s); the check and the source have drifted`); process.exit(1) }
console.log(red ? `\n⛔ FAIL — ${red}` : `✅ PASS — ${pools} pool assignment(s), ${calls} pickVariant call(s); none reaches the whole library`)
process.exit(red ? 1 : 0)
