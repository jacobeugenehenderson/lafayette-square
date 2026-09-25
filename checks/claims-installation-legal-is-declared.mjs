#!/usr/bin/env node
/**
 * claims-installation-legal-is-declared.mjs
 *
 * ⛔⛔ THE CLASS: an installation serving legal terms it never declared. Until 2026-09-24
 * the /privacy and /terms pages and the courier agreement were Lafayette Square's Missouri
 * text, hardcoded in shared components, so EVERY installation served them
 * (`BRIEF-ls-bleed-excision` site 8). Jacob, 2026-09-24: "HPDM can share the MO docs with
 * LS" — shared by DECLARATION, never as a fallback.
 *
 * Asserts, reading the source (never restating it):
 *   1. every registered installation's `legal.documents` is absent (→ "not declared") or
 *      an id that exists in `src/instances/copy/index.jsx#LEGAL_DOCUMENTS`;
 *   2. the resolution in index.jsx has NO default — a missing declaration resolves to null;
 *   3. no shared component (src/components, src/pages) carries governing-law text of its
 *      own — legal wording lives only in a declared document under src/instances/copy/.
 *
 * ⭐ MUTATION-TESTED: `--self-test` re-introduces each defect in memory and asserts the
 * named assertion goes red.
 *     node checks/claims-installation-legal-is-declared.mjs [--self-test]
 */
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const { registeredMaps, instanceForMap } = await import(join(ROOT, 'src/instances/registry.js'))

function codeLines(src) {
  let inBlock = false
  return src.split('\n').filter(line => {
    const t = line.trim()
    if (inBlock) { if (t.includes('*/')) inBlock = false; return false }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return false }
    return !t.startsWith('//') && !t.startsWith('*')
  }).join('\n')
}

function loadSources() {
  const shared = {}
  const walk = (rel) => {
    for (const d of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${d.name}`
      if (d.isDirectory()) walk(r)
      else if (/\.(jsx?|mjs)$/.test(d.name)) shared[r] = read(r)
    }
  }
  walk('src/components'); walk('src/pages')
  return {
    index: read('src/instances/copy/index.jsx'),
    declarations: Object.fromEntries(registeredMaps().map(m => [m, instanceForMap(m)?.legal?.documents ?? null])),
    shared,
  }
}

function run(S) {
  const out = []
  const assert = (name, ok, detail) => out.push({ name, ok: !!ok, detail })

  // The document ids, PARSED from the registry block.
  const block = /LEGAL_DOCUMENTS\s*=\s*\{([\s\S]*?)\n\}/.exec(S.index)?.[1] || ''
  const ids = [...block.matchAll(/['"]([a-z0-9-]+)['"]\s*:/g)].map(m => m[1])
  assert('documents/registry-parsed', ids.length > 0, 'could not parse LEGAL_DOCUMENTS out of src/instances/copy/index.jsx')

  const bad = Object.entries(S.declarations).filter(([, d]) => d !== null && !ids.includes(d))
  assert('documents/every-declaration-resolves', bad.length === 0,
    `installation(s) declare a legal document that does not exist: ${bad.map(([m, d]) => `${m} → '${d}'`).join(', ')} (have: ${ids.join(', ')})`)

  const legalLine = codeLines(S.index).split('\n').find(l => /export const LEGAL\s*=/.test(l)) || ''
  assert('resolution/no-default', /\?\?\s*null\)\s*:\s*null\s*$/.test(legalLine.trim()),
    `index.jsx resolves LEGAL with something other than null when undeclared: ${legalLine.trim()}`)

  const hits = Object.entries(S.shared).filter(([, src]) => /governed by the laws of|State of (Missouri|Ohio|California|Massachusetts|[A-Z][a-z]+ [A-Z][a-z]+)\b/.test(codeLines(src))).map(([f]) => f)
  assert('wording/none-in-shared-components', hits.length === 0,
    `governing-law text in a shared component (it belongs in a declared document under src/instances/copy/): ${hits.join(', ')}`)
  return out
}

const MUTATIONS = [
  { name: 'documents/every-declaration-resolves',
    apply: (S) => ({ ...S, declarations: { ...S.declarations, huron: 'cary-ohio-typo' } }) },
  { name: 'resolution/no-default',
    apply: (S) => ({ ...S, index: S.index.replace(/\?\? null\) : null/, "?? null) : LEGAL_DOCUMENTS['cary-missouri']") }) },
  { name: 'wording/none-in-shared-components',
    apply: (S) => ({ ...S, shared: { ...S.shared, 'src/pages/LegalPage.jsx': S.shared['src/pages/LegalPage.jsx'] + "\nconst X = 'This Agreement is governed by the laws of the State of Missouri.'" } }) },
]

if (process.argv.includes('--self-test')) {
  const base = loadSources()
  const red = run(base).filter(r => !r.ok)
  if (red.length) { for (const r of red) console.log(`⛔ baseline red: ${r.name} — ${r.detail}`); process.exit(1) }
  let bad = 0
  for (const m of MUTATIONS) {
    const hit = run(m.apply(base)).find(r => r.name === m.name)
    if (!hit || hit.ok) { console.log(`  ⛔ ${m.name} — defect re-introduced and the check STAYED GREEN`); bad++ }
    else console.log(`  ✓ ${m.name} — went red`)
  }
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not fail.` : '\n✅ every mutation produced its named failure.')
  process.exit(bad ? 1 : 0)
}

const S = loadSources()
const res = run(S)
for (const [m, d] of Object.entries(S.declarations)) console.log(`  ${m.padEnd(18)} legal → ${d ?? '(not declared)'}`)
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
const failed = res.filter(r => !r.ok)
console.log(`\n${res.length - failed.length}/${res.length} green`)
process.exit(failed.length ? 1 : 0)
