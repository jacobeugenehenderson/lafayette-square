#!/usr/bin/env node
/**
 * claims-a-town-chooses-its-lamp — the lamp post is the town's AUTHORED choice, never its name.
 *
 * The chain: a Look's `design.json#lamps.model` → bake-scene stamps `scene.json#lampModel` →
 * BakedLamps passes it to StreetLights → `lampModels.js#lampModelOf` resolves it in the library;
 * absent ⇒ the kit's standard post, said aloud; an unknown id throws (BRIEF-lamps, 2026-10-04).
 *
 * Holds, reading the source (never a copied list):
 *   ① the library's keys (parsed from LAMP_MODELS) include STANDARD_LAMP, and every model declares
 *     a headY and a load(), and lampModelOf throws on an unknown id;
 *   ② no file on the chain branches on a town name (a string literal compared to a town/look id);
 *   ③ bake-scene stamps `lampModel` from `design.lamps.model`, and BakedLamps passes `scene.lampModel`;
 *   ④ every Look that declares `lamps.model` names a model the library holds;
 *   ⑤ StreetLights takes its head height from the model, never a constant.
 *
 *   node checks/claims-a-town-chooses-its-lamp.mjs [--root=<dir>]   (the mutation test points --root at a copy)
 * Mutation-tested: an `if (town === 'lafayette-square')` in StreetLights fails ②; deleting the bake-scene
 * stamp fails ③; `const GLOW_Y = 3.3` fails ⑤; a Look naming "gaslamp" fails ④.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv.find(a => a.startsWith('--root='))?.slice(7) || new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(ROOT, p), 'utf-8')
const fails = []
const fail = (m) => fails.push(m)

const LIB = 'src/lib/lampModels.js', SL = 'src/components/StreetLights.jsx', BL = 'src/components/BakedLamps.jsx', BS = 'cartograph/bake-scene.js'
const lib = read(LIB), sl = read(SL), bl = read(BL), bs = read(BS)

// ① the library
const std = lib.match(/export const STANDARD_LAMP = '([^']+)'/)?.[1]
const block = lib.match(/export const LAMP_MODELS = Object\.freeze\(\{([\s\S]*?)\n\}\)/)?.[1]
if (!std) fail(`① ${LIB}: no STANDARD_LAMP export`)
if (!block) fail(`① ${LIB}: no LAMP_MODELS block`)
const entries = block ? [...block.matchAll(/^\s*(\[STANDARD_LAMP\]|\w+):\s*\{([^}]*)\}/gm)] : []
const ids = entries.map(([, k]) => (k === '[STANDARD_LAMP]' ? std : k))
if (std && !ids.includes(std)) fail(`① the library holds no "${std}" (the standard post): ${ids.join(', ')}`)
for (const [, k, body] of entries) {
  if (!/headY:\s*[\d.]+/.test(body)) fail(`① model ${k} declares no headY`)
  if (!/load:\s*\w+/.test(body)) fail(`① model ${k} declares no load()`)
}
if (!/if \(!m\) throw/.test(lib)) fail(`① lampModelOf does not throw on an unknown id`)

// ② no town-name branch anywhere on the chain
const NAME_BRANCH = /(?:town|look|lookId|resolvedLookId|scene|id)\s*[!=]==?\s*['"][a-z][\w-]*['"]|['"][a-z][\w-]*['"]\s*[!=]==?\s*(?:town|look|lookId|resolvedLookId|scene|id)\b|lafayette/i
for (const [p, s] of [[LIB, lib], [SL, sl], [BL, bl]]) {
  s.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    if (NAME_BRANCH.test(code) && !/^\s*\*/.test(line)) fail(`② ${p}:${i + 1} branches on a town name: ${line.trim()}`)
  })
}

// ③ the declaration travels
if (!/lampModel:\s*design\.lamps\.model/.test(bs)) fail(`③ ${BS} does not stamp lampModel from design.lamps.model`)
if (!/model=\{scene\?\.lampModel\}/.test(bl)) fail(`③ ${BL} does not pass scene.lampModel to StreetLights`)
if (!/lampModelOf\(modelId, town\)/.test(sl)) fail(`③ ${SL} does not resolve its model through lampModelOf`)

// ④ every declaring Look names a held model
const looksDir = join(ROOT, 'public/looks')
let declared = 0
for (const d of existsSync(looksDir) ? readdirSync(looksDir) : []) {
  const f = join(looksDir, d, 'design.json')
  if (!existsSync(f)) continue
  const m = JSON.parse(readFileSync(f, 'utf-8')).lamps?.model
  if (m == null) continue
  declared++
  if (!ids.includes(m)) fail(`④ public/looks/${d} declares lamp model "${m}", not in the library (${ids.join(', ')})`)
}

// ⑤ the head height is the model's
if (/const GLOW_Y\s*=\s*[\d.]/.test(sl)) fail(`⑤ ${SL}: GLOW_Y is a constant, not the model's headY`)
if (!/GLOW_Y = model\.headY/.test(sl)) fail(`⑤ ${SL}: the head height is not read from the model`)

if (fails.length) { console.error(`✗ a town chooses its lamp — ${fails.length} failure(s):\n  ` + fails.join('\n  ')); process.exit(1) }
console.log(`✓ a town chooses its lamp — library [${ids.join(', ')}], default "${std}", ${declared} Look(s) declare a model, no town-name branch`)
