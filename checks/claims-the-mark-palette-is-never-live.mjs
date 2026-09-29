#!/usr/bin/env node
/**
 * claims-the-mark-palette-is-never-live.mjs — IS "SUGGEST FROM MARK" AUTHORING-ONLY?
 *
 * Jacob, 2026-09-28: "the emoji color scheme would never be live." The suggester (src/cartograph/suggestFromMark.js)
 * runs in Stage on the operator's device; what ships is plain hex in the Look. Asserts, reading the import graph (static
 * and dynamic, walked through everything — the bundle does):
 *   · nothing a VISITOR loads reaches it: the Ward's one entry (src/components/Town.jsx) and the old player's
 *     (src/main.jsx, index.html's script);
 *   · every file that imports it lives in src/cartograph/ (the authoring app).
 * ⭐ MUTATION-TESTED EVERY RUN: Town.jsx given an import of the suggester must fail.
 *
 *   node checks/claims-the-mark-palette-is-never-live.mjs
 */
import { sourceFiles, specsOf, resolveSpec, closure } from './_imports.mjs'

const SUGGESTER = 'src/cartograph/suggestFromMark.js'
const VISITOR_ENTRIES = ['src/components/Town.jsx', 'src/main.jsx']

function audit(files) {
  const f = []
  const byPath = new Map(files.map((x) => [x.path, x]))
  if (!byPath.has(SUGGESTER)) f.push(`${SUGGESTER} does not exist — nothing to hold to authoring`)
  for (const entry of VISITOR_ENTRIES) {
    if (!byPath.has(entry)) { f.push(`${entry} does not exist — the visitor entry moved; update this check`); continue }
    if (closure(files, entry).some((x) => x.path === SUGGESTER)) f.push(`${entry} (a visitor's entry) reaches ${SUGGESTER} — the mark's palette would be derived on a visitor's device`)
  }
  for (const x of files) {
    if (x.path === SUGGESTER) continue
    if (specsOf(x.src).some((s) => resolveSpec(byPath, x.path, s) === SUGGESTER) && !x.path.startsWith('src/cartograph/'))
      f.push(`${x.path} imports the suggester from outside src/cartograph/`)
  }
  return f
}

const files = sourceFiles()
const fails = audit(files)
const mutant = files.map((x) => (x.path === 'src/components/Town.jsx' ? { ...x, src: `import '../cartograph/suggestFromMark.js'\n${x.src}` } : x))
const caught = audit(mutant).length > fails.length
console.log(`visitor entries: ${VISITOR_ENTRIES.join(', ')} · mutation (Town.jsx imports the suggester) ${caught ? 'caught ✓' : 'NOT caught'}`)
if (!caught) fails.push('MUTATION NOT CAUGHT: a visitor entry importing the suggester passes')
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? `\n⛔ FAIL — ${fails.length}` : '\n✅ PASS — the mark\'s palette is suggested in Stage only; nothing a visitor loads reaches it')
process.exit(fails.length ? 1 : 0)
