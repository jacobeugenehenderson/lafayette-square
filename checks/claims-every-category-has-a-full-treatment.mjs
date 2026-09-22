#!/usr/bin/env node
/**
 * claims-every-category-has-a-full-treatment — every category resolves to a COMPLETE class set.
 *
 * ⛔⛔ A CATEGORY THAT RESOLVES TO `undefined` TAKES THE WHOLE PANEL DOWN. `SidePanel`
 * reads `COLOR_CLASSES[category.color].border`; `CATEGORY_LIST`'s `unclassified` carries
 * `color: null` deliberately, so that lookup is `undefined` and the panel throws "Cannot
 * read properties of undefined (reading 'border')" — not a degraded row, the entire
 * Society surface gone.
 *
 * Instance, 2026-09-21: that row had existed UNEXERCISED. Lafayette Square's assessor
 * classifies every building, so nothing ever reached it. huron's roster was wired into
 * `loadInstanceData` the same day and brought 338 buildings with no readable use — the
 * first to land on `unclassified` — and the panel died on the next render. ⭐ The kit's
 * signature shape again: fine on town #1 because town #1 cannot produce the input.
 *
 * ⛔ THE NULL IS NOT THE DEFECT. `classifyZoning` returns null for an unreadable code and
 * null must travel, or a town with no St. Louis zoning letter gets every building filed as
 * `residential` — the Layer 0 q2 bug that rule exists to kill. The defect is a consumer
 * that indexes by it without a fallback.
 *
 * ⭐ AND IT CHECKS THE FULL SHAPE, NOT MERE PRESENCE. A fallback missing one key just moves
 * the crash to `.dot` or `.activeBg` the next time a different consumer renders, which is
 * the same bug wearing a different property name.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const mod = await import(path.join(ROOT, 'src/tokens/categories.js'))
const { CATEGORY_LIST, COLOR_CLASSES, UNCLASSIFIED_CLASSES } = mod

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nEvery category resolves to a complete class set')

// The required shape is READ from a real entry, never listed here — add a key to the
// design system and this check demands it of the fallback too, with no edit.
const sample = Object.values(COLOR_CLASSES)[0]
if (!sample) { bad('COLOR_CLASSES is empty — nothing to check'); process.exit(1) }
const REQUIRED = Object.keys(sample)
ok(`class shape read from the tokens: ${REQUIRED.join(', ')}`)

for (const [name, set] of [['UNCLASSIFIED_CLASSES', UNCLASSIFIED_CLASSES]]) {
  if (!set) { bad(`${name} is not exported — a category with no colour has no fallback`); continue }
  const missing = REQUIRED.filter((k) => !set[k])
  if (missing.length) bad(`${name} is missing ${missing.join(', ')} — the crash just moves to that key`)
  else ok(`${name} carries all ${REQUIRED.length} keys`)
}

for (const c of CATEGORY_LIST) {
  const direct = COLOR_CLASSES[c.color]
  const resolved = direct || UNCLASSIFIED_CLASSES
  if (!resolved) { bad(`category '${c.id}' (color ${JSON.stringify(c.color)}) resolves to nothing`); continue }
  const missing = REQUIRED.filter((k) => !resolved[k])
  if (missing.length) {
    bad(`category '${c.id}' resolves to a set missing ${missing.join(', ')}`)
  } else if (!direct) {
    ok(`'${c.id}' has no colour of its own and falls back to the neutral treatment — by design`)
  }
}
if (!failed) ok(`all ${CATEGORY_LIST.length} categories render`)

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ every category has a full treatment\n')
process.exit(failed ? 1 : 0)
