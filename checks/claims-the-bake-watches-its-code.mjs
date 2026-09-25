#!/usr/bin/env node
// CLAIM — THE BAKE RE-POURS WHEN THE POUR'S CODE CHANGES, THE ① MINT INCLUDED.
//
// The Bake (serve.js /bake) re-runs pipeline + promote only when an input is newer than map.json. Its code inputs were
// a hand list (`pipeline.js, derive.js, snap.js, classify.js, standards.js, config.js`) that missed `coastline.mjs`,
// `src/lib/tileGround.js` (mintProtopolygon — ① itself) and `src/cartograph/streetProfiles.js` (the H-3 sections), so
// a fix to how ① is built sat unpoured behind a Bake that called the town clean (Gantry, 2026-09-24).
// ASSERTS, reading serve.js — never restating its list:
//   · the pipeline's code inputs are the IMPORT CLOSURE of pipeline.js (`importClosure`), not a hand list;
//   · run on the live tree, that closure contains the file that DEFINES `mintProtopolygon` and the one that defines
//     `coastRings` (each found by grepping the closure for its export, so a move stays covered);
//   · the pipeline inputs name `references/registry.json`, which the pour reads to compose highway sections.
//
//   node checks/claims-the-bake-watches-its-code.mjs [--serve=path]
//
// MUTATION (must go red): a temp serve.js with PIPELINE_SRC set back to the hand list (--serve).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ROOT } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const src = readFileSync(arg('serve') || join(ROOT, 'cartograph/serve.js'), 'utf8')
const bad = []
const line = src.match(/const PIPELINE_SRC = [^\n]+/)?.[0]
if (!line) { console.log('⛔ NOT CHECKED — no PIPELINE_SRC in serve.js'); process.exit(2) }
if (!/importClosure\(\[join\(here, 'pipeline\.js'\)\]\)/.test(line)) bad.push(`PIPELINE_SRC is not the import closure of pipeline.js: ${line.trim()}`)
if (!/references', 'registry\.json'/.test(line)) bad.push('PIPELINE_SRC does not name references/registry.json')
const a = src.indexOf('function importClosure'), b = src.indexOf('\n}\n', a)
let closure = []
if (a < 0 || b < 0) bad.push('importClosure not found in serve.js')
else {
  const { importClosure } = await import('data:text/javascript,' + encodeURIComponent(
    "import { readFileSync, existsSync } from 'node:fs'; import { join, dirname } from 'node:path';\n" + src.slice(a, b + 2) + '\nexport { importClosure }'))
  closure = importClosure([join(ROOT, 'cartograph/pipeline.js')])
  for (const sym of ['mintProtopolygon', 'coastRings']) {
    const re = new RegExp(`export (async )?function ${sym}\\b|export const ${sym}\\b`)
    if (!closure.some(f => { try { return re.test(readFileSync(f, 'utf8')) } catch { return false } })) bad.push(`the closure has no file defining ${sym} — a change to it would never re-pour`)
  }
}
console.log(`── bake inputs ── pipeline import closure: ${closure.length} file(s) ${bad.length ? '⛔' : '✅'}`)
for (const x of bad) console.log(`   ⛔ ${x}`)
console.log(bad.length ? '\n⛔ The Bake can call a town clean while the pour\'s own code has changed.' : '\n✅ The Bake watches every file the pour runs, the ① mint included.')
process.exit(bad.length ? 1 : 0)
