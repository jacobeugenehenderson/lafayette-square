#!/usr/bin/env node
/**
 * "DOES EVERY TOWN'S labels.json CARRY ITS WHOLE LABEL STYLE — AND IS THERE ONE DEFAULT?"
 *
 * WHY (Warden's ruling (A), 2026-09-28). The town's label style lives in labels.json's `style`, beside the geometry it
 * lays out (v4: the whole authored block). v3 carried only { sizeK, letterSpacing }, and the player drew the rest from
 * the authoring store's DEFAULTS — measured on staging (huron): mixed case, where the town authored upper case. src/lib/labelStyle.js#labelStyleOf fills a v3 artifact from the kit default, ⏳ until each town's labels
 * are re-baked; then that becomes a loud failure.
 *
 * Asserts, reading the sources and the baked artifacts:
 *   · every baked labels.json at v4 carries the town's authored label block exactly (design.json `labels`, migrated);
 *   · the kit's label default exists ONCE (src/lib/labelStyle.js) — no reader keeps its own fallback values;
 *   · and LISTS the towns still on v3 (draw with the kit default for the unbaked fields) — the re-bake list.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-labels-carry-their-style.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, relative } from 'path'
import { LABEL_STYLE_DEFAULT, migrateLabels, LABELS_FULL_STYLE_VERSION } from '../src/lib/labelStyle.js'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

export function auditTowns(towns) {
  const f = [], v3 = []
  for (const t of towns) {
    if (!t.artifact) continue
    if ((t.artifact.version ?? 0) < LABELS_FULL_STYLE_VERSION) { v3.push(t.id); continue }
    const want = migrateLabels(t.design?.labels || {})
    if (JSON.stringify(t.artifact.style) !== JSON.stringify(want)) f.push(`${t.id}: labels.json v${t.artifact.version} style ${JSON.stringify(t.artifact.style)} ≠ the town's authored labels ${JSON.stringify(want)} — re-bake its labels`)
  }
  return { f, v3 }
}
// A second copy of the default: the default's own distinctive values hard-coded outside the module.
export function copies(files) {
  const marks = [LABEL_STYLE_DEFAULT.fill, LABEL_STYLE_DEFAULT.halo].map(v => v.toLowerCase())
  return files.filter(x => x.path !== 'src/lib/labelStyle.js' && marks.some(m => code(x.src).toLowerCase().includes(`'${m}'`)))
    .map(x => x.path)
}

const towns = readdirSync(BAKED).filter(t => existsSync(join(BAKED, t, 'labels.json'))).map(id => ({
  id,
  artifact: JSON.parse(readFileSync(join(BAKED, id, 'labels.json'), 'utf8')),
  design: existsSync(join(ROOT, 'public/looks', id, 'design.json')) ? JSON.parse(readFileSync(join(ROOT, 'public/looks', id, 'design.json'), 'utf8')) : null,
}))
const files = []
;(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js|jsx)$/.test(n)) files.push({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }) } })(join(ROOT, 'src'))

if (process.argv.includes('--self-test')) {
  const cases = [
    ['a v4 artifact that dropped a field', () => auditTowns([{ id: 'x', artifact: { version: 4, style: { case: 'upper' } }, design: { labels: { case: 'upper', weight: 500 } } }]).f.length > 0],
    ['a v4 artifact with a stale value', () => auditTowns([{ id: 'x', artifact: { version: 4, style: { case: 'mixed' } }, design: { labels: { case: 'upper' } } }]).f.length > 0],
    ['a v3 town is listed', () => auditTowns([{ id: 'x', artifact: { version: 3, style: { sizeK: 1 } }, design: {} }]).v3.includes('x')],
    ['a reader keeps its own default', () => copies([{ path: 'src/components/X.jsx', src: `const c = style.fill ?? '#e8e8f0'` }]).length > 0],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run(); if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, v3 } = auditTowns(towns)
const dup = copies(files)
if (dup.length) f.push(`the label default is copied outside src/lib/labelStyle.js: ${dup.join(', ')} — take the resolved style (labelStyleOf)`)
const v4 = towns.filter(t => (t.artifact.version ?? 0) >= LABELS_FULL_STYLE_VERSION).map(t => t.id)
console.log(`ⓘ  labels.json v${LABELS_FULL_STYLE_VERSION} (the whole style): ${v4.join(', ') || 'none'}`)
console.log(`ⓘ  still v3 (draw the kit default for the unbaked fields — re-bake their labels): ${v3.join(', ') || 'none — make labelStyleOf refuse v3 now'}`)
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every v4 labels.json carries its town\'s authored style; one label default')
