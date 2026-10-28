#!/usr/bin/env node
// claims-the-authoring-store-reloads-on-edit.mjs — DOES AN EDIT TO THE AUTHORING STORE RELOAD THE PAGE, NEVER SWAP IT HOT?
//
// ⭐ 2026-10-28 (Boz's ruling): two failures lived in long-lived tabs across edits of src/cartograph/stores/useCartographStore.js
// — Survey's crash on old street data, and Stage's re-pour question set where its modal did not read it. A hot swap of a zustand
// store makes a SECOND store: the components keep the first, new code writes the second. The store module therefore self-accepts
// a hot update only to reload the page (`import.meta.hot.accept(() => { window.location.reload() })`), so a tab never holds two.
//   ① the module declares that guard, at module scope, and it does nothing else on a hot update (read from the source);
//   ② it is not `invalidate()`, which hands the update to the importers' fast-refresh (a partial swap again).
// ⭐ MUTANT (--mutants): the guard removed → RED.
//   node checks/claims-the-authoring-store-reloads-on-edit.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
const SRC = readFileSync(join(ROOT, 'src/cartograph/stores/useCartographStore.js'), 'utf8')
const GUARD = 'if (import.meta.hot) import.meta.hot.accept(() => { window.location.reload() })'
function claims(src) {
  const out = []
  const lines = src.split('\n'), at = lines.findIndex(l => l === GUARD)
  if (at < 0) out.push('① the store module does not reload the page on a hot update (no module-scope `' + GUARD + '`)')
  if (/import\.meta\.hot\.invalidate\(/.test(src)) out.push('② the store calls import.meta.hot.invalidate(): the update goes to the importers, a partial swap')
  const hot = lines.filter(l => /import\.meta\.hot/.test(l) && !/^\s*\/\//.test(l))
  if (hot.length > 1) out.push(`① the store does more on a hot update than reload: ${hot.map(l => l.trim()).join(' | ')}`)
  return out
}
let bad = 0
const real = claims(SRC)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log('✅ the authoring store reloads the page on any hot update of itself or its imports; a tab never holds two stores')
if (process.argv.includes('--mutants')) { const got = claims(SRC.replace(GUARD + '\n', '')), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · the guard removed: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
console.log(bad ? '\n⛔ RED — the authoring store can be swapped hot, and a long-lived tab holds two' : '\n✅ GREEN')
process.exit(bad ? 1 : 0)
