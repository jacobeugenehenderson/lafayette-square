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
 *   · every baked labels.json at v4 carries the town's COMPLETE label style exactly (the kit default under design.json
 *     `labels`, migrated) — and no field a reader does not use (Warden, 2026-09-28: the unread fields are ROT);
 *   · LABEL_STYLE_FIELDS is exactly the set the readers read — derived from their SOURCES (SceneLabel, the park title,
 *     the layout), never restated;
 *   · the kit's label default exists ONCE (src/lib/labelStyle.js) — no reader keeps its own fallback values;
 *   · and LISTS the towns still on v3 (draw with the kit default for the unbaked fields) — the re-bake list.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-labels-carry-their-style.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, relative } from 'path'
import { LABEL_STYLE_DEFAULT, LABEL_STYLE_FIELDS, authoredLabelStyle, LABELS_FULL_STYLE_VERSION } from '../src/lib/labelStyle.js'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

export function auditTowns(towns) {
  const f = [], v3 = []
  for (const t of towns) {
    if (!t.artifact) continue
    if ((t.artifact.version ?? 0) < LABELS_FULL_STYLE_VERSION) { v3.push(t.id); continue }
    const extra = Object.keys(t.artifact.style || {}).filter(k => !LABEL_STYLE_FIELDS.includes(k))
    if (extra.length) f.push(`${t.id}: labels.json v${t.artifact.version} style carries field(s) no reader uses: ${extra.join(', ')}`)
    const want = authoredLabelStyle(t.design?.labels)
    if (JSON.stringify(t.artifact.style) !== JSON.stringify(want)) f.push(`${t.id}: labels.json v${t.artifact.version} style ${JSON.stringify(t.artifact.style)} ≠ the town's authored labels ${JSON.stringify(want)} — re-bake its labels`)
  }
  return { f, v3 }
}
// The fields the readers actually read, from their sources: `style.X` / `style?.X` and `{ a, b } = style`.
const READERS = ['src/components/SceneLabel.jsx', 'src/components/LafayetteParkBody.jsx', 'src/lib/labelLayout.js', 'src/lib/useLabelPlacements.js']
export function readSet(files) {
  const out = new Set()
  for (const x of files.filter(f => READERS.includes(f.path))) {
    const c = code(x.src)
    for (const m of c.matchAll(/\bstyle\??\.(\w+)/g)) out.add(m[1])
    for (const m of c.matchAll(/\{([^{}]*)\}\s*=\s*style\b/g)) for (const k of m[1].split(',')) { const n = k.trim().split(/\s*:\s*/)[0]; if (n) out.add(n) }
  }
  return out
}
// A second copy of the default: the default's own distinctive values hard-coded outside the module.
export function copies(files) {
  const marks = [LABEL_STYLE_DEFAULT.fill, LABEL_STYLE_DEFAULT.halo].map(v => v.toLowerCase())
  return files.filter(x => x.path !== 'src/lib/labelStyle.js' && marks.some(m => code(x.src).toLowerCase().includes(`'${m}'`)))
    .map(x => x.path)
}

// A retired scene declares it in its own directory (cartograph/data/<scene>/RETIRED.md — the kit's convention): it is
// not a town, and it is listed, never judged.
const isRetired = (scene) => existsSync(join(ROOT, 'cartograph/data', scene, 'RETIRED.md'))
const retiredScenes = readdirSync(BAKED).filter(isRetired)
if (retiredScenes.length) console.log(`   retired, not a town: ${retiredScenes.join(', ')}`)
const towns = readdirSync(BAKED).filter(t => !isRetired(t) && existsSync(join(BAKED, t, 'labels.json'))).map(id => ({
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
    ['a v4 artifact carries a rot field', () => auditTowns([{ id: 'x', artifact: { version: 4, style: { ...authoredLabelStyle({}), tierScale: {} } }, design: {} }]).f.some(m => /no reader uses/.test(m))],
    ['a reader reads a field the list does not keep', () => readSet([{ path: 'src/components/SceneLabel.jsx', src: 'x = style.plate' }]).has('plate')],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run(); if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, v3 } = auditTowns(towns)
const read = readSet(files)
const unread = LABEL_STYLE_FIELDS.filter(k => !read.has(k)), unlisted = [...read].filter(k => !LABEL_STYLE_FIELDS.includes(k))
if (unread.length) f.push(`LABEL_STYLE_FIELDS lists field(s) no reader reads: ${unread.join(', ')} — drop them (src/lib/labelStyle.js)`)
if (unlisted.length) f.push(`a reader reads label field(s) LABEL_STYLE_FIELDS does not keep: ${unlisted.join(', ')} — they would never be stored or baked`)
const dup = copies(files)
if (dup.length) f.push(`the label default is copied outside src/lib/labelStyle.js: ${dup.join(', ')} — take the resolved style (labelStyleOf)`)
const v4 = towns.filter(t => (t.artifact.version ?? 0) >= LABELS_FULL_STYLE_VERSION).map(t => t.id)
console.log(`ⓘ  labels.json v${LABELS_FULL_STYLE_VERSION} (the whole style): ${v4.join(', ') || 'none'}`)
console.log(`ⓘ  still v3 (draw the kit default for the unbaked fields — re-bake their labels): ${v3.join(', ') || 'none — make labelStyleOf refuse v3 now'}`)
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every v4 labels.json carries its town\'s authored style; one label default')
