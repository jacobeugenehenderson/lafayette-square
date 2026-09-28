#!/usr/bin/env node
/**
 * "DOES ONE TOWN'S DATA SHIP TO EVERY TOWN?" — the stowaway, made impossible.
 *
 * WHY THIS EXISTS (2026-09-27). The load audit (docs/briefs/BRIEF-slab-loading.md ③) found one
 * town's data bundled into the player by static import — `ribbons.json` alone was 6 MB in a chunk
 * the app preloads — so every town downloaded Lafayette Square. Jacob: "if nothing else happens
 * from this session tonight, I want to make this line untrue forevermore. We MUST eliminate LS as
 * the fallback and weird stowaway everywhere."
 * This is the check BRIEF-ls-bleed-excision §4 item 2 specified and nobody had built.
 *
 * THE RULE. Walk the player's STATIC import graph from src/main.jsx — static imports are what the
 * bundler puts in the chunks every visit loads; a dynamic `import()` becomes a chunk fetched only
 * when that code runs, so it is the sanctioned way to load one town's data. Every JSON file reached
 * statically must belong to no town. A file belongs to a town when:
 *   - a path segment names a town — the town ids are READ from cartograph/data/<id>/ and
 *     public/looks/index.json at run time, never listed here; or
 *   - it sits directly in src/data/ — the legacy namespace that has only ever held one town's data.
 * Kit-wide catalogues live in a subfolder named for no town (src/data/planetarium/).
 *
 * ⚠️ public/looks/index.json (the list of every town) is reported, not failed: it names every town
 * rather than carrying one, and the town manifest (BRIEF-slab-loading ⑧) retires it.
 *
 * ⛔ READ-ONLY. Exit 2 on any hit, naming the importer, the line, and the file.
 *
 * MUTATION TEST (a check only ever seen to pass is not evidence):
 *   echo "import x from '../data/lafayette-square/menus.json'; export default x" > src/components/__mut.js
 *   echo "import './components/__mut.js'" >> src/main.jsx
 *   node checks/claims-no-town-rides-in-the-bundle.mjs   # ⇒ must FAIL naming menus.json
 *   git checkout src/main.jsx && rm src/components/__mut.js
 *
 * Usage: node checks/claims-no-town-rides-in-the-bundle.mjs
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = resolve(ROOT, 'src/main.jsx')
const EXTS = ['', '.js', '.jsx', '.mjs', '.ts', '.tsx', '/index.js', '/index.jsx']

// Town ids, read from the kit itself.
const towns = new Set(readdirSync(resolve(ROOT, 'cartograph/data'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name))
for (const l of JSON.parse(readFileSync(resolve(ROOT, 'public/looks/index.json'), 'utf8')).looks || []) {
  if (l.id) towns.add(l.id)
  if (l.scene) towns.add(l.scene)
}
for (const notATown of ['clean', 'raw', 'kit-default']) towns.delete(notATown)
if (!towns.size) { console.error('⛔ read no town ids — cannot judge'); process.exit(2) }

// Static imports only: `import … from 'x'`, `export … from 'x'`, bare `import 'x'`. Never `import('x')`.
const STATIC_RE = /^\s*(?:import|export)\b[^;'"()]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec.split('?')[0])
  for (const e of EXTS) {
    const p = base + e
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

const seen = new Set()
const jsonEdges = [] // { json, from, line }
const stack = [ENTRY]
while (stack.length) {
  const f = stack.pop()
  if (seen.has(f)) continue
  seen.add(f)
  if (!/\.(m?jsx?|tsx?)$/.test(f)) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(STATIC_RE)) {
    const spec = m[1] || m[2]
    const r = resolveSpec(f, spec)
    if (!r) continue
    if (r.endsWith('.json')) {
      jsonEdges.push({ json: r, from: f, line: src.slice(0, m.index).split('\n').length })
    } else stack.push(r)
  }
}

function owner(jsonPath) {
  const rel = relative(ROOT, jsonPath)
  const parts = rel.split(sep)
  const town = parts.find(p => towns.has(p) || towns.has(p.replace(/\.json$/, '')))
  if (town) return `names the town "${town}"`
  if (parts.length === 3 && parts[0] === 'src' && parts[1] === 'data') return 'sits in src/data/, the one-town namespace'
  return null
}

const hits = [], notes = []
for (const e of jsonEdges) {
  const rel = relative(ROOT, e.json)
  if (rel === `public${sep}looks${sep}index.json`) { notes.push(`${relative(ROOT, e.from)}:${e.line} → ${rel} (every town's list; retired by the town manifest)`); continue }
  const why = owner(e.json)
  if (why) hits.push(`${relative(ROOT, e.from)}:${e.line} → ${rel} — ${why}. Load it with import() behind the town's own guard, or move it under that town's slab.`)
}

console.log(`NO TOWN RIDES IN THE BUNDLE — ${seen.size} files reached statically from src/main.jsx, ${jsonEdges.length} static JSON imports, ${towns.size} town ids read.`)
for (const n of notes) console.log(`  ⚠️  ${n}`)
if (hits.length) {
  console.log(`⛔ FAIL — ${hits.length} static import(s) of one town's data, shipped to every town:`)
  for (const h of hits) console.log(`  ${h}`)
  process.exit(2)
}
console.log('✅ PASS — the bundle carries no town.')
