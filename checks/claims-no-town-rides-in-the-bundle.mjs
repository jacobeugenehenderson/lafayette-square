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
 * ⚠️ AN ALL-TOWNS TABLE IS REPORTED, NOT FAILED: it names every town rather than carrying one, and the
 * town manifest (BRIEF-slab-loading ⑧) retires it. Two shapes:
 *   - public/looks/index.json, the list of every town;
 *   - one importer statically importing the SAME-NAMED file once per roster town, for EVERY roster town:
 *     the registry's sealed ids, cartograph/data/<map>/town-id.json (Jacob, 2026-10-04, 15818b51), a few
 *     bytes each. The roster is the maps src/instances/registry.js registers (its INSTANCES keys, read
 *     from the source), each of which must also be a town id read below.
 *   ⛔ A table missing one roster town FAILS: a partial table is one town's data in disguise. So does one
 *   town's file imported alone. Both are planted and judged on every run (`selfTest`).
 *
 * ⛔ READ-ONLY. Exit 2 on any hit, naming the importer, the line, and the file.
 *
 * MUTATION TEST (a check only ever seen to pass is not evidence):
 *   echo "import x from '../data/lafayette-square/seedEvents.json'; export default x" > src/components/__mut.js
 *   echo "import './components/__mut.js'" >> src/main.jsx
 *   node checks/claims-no-town-rides-in-the-bundle.mjs   # ⇒ must FAIL naming menus.json
 *   git checkout src/main.jsx && rm src/components/__mut.js
 * The table rule's mutations run themselves, every run, before the bundle is judged.
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

// The roster: the maps the registry registers — its INSTANCES keys, read from the source.
const REGISTRY = resolve(ROOT, 'src/instances/registry.js')
const block = readFileSync(REGISTRY, 'utf8').match(/\bconst\s+INSTANCES\s*=\s*\{([^}]*)\}/)
const roster = new Set(block ? [...block[1].matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:/gm)].map(m => m[1] || m[2] || m[3]) : [])
if (!roster.size) { console.error('⛔ read no roster from src/instances/registry.js#INSTANCES — cannot judge a table'); process.exit(2) }
const strangers = [...roster].filter(t => !towns.has(t))
if (strangers.length) { console.error(`⛔ the registry registers ${strangers.join(', ')}, which is no town id under cartograph/data/ or in the looks index — cannot judge`); process.exit(2) }

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

/** The town a path names, or null. */
const townOf = (rel) => rel.split(sep).find(p => towns.has(p) || towns.has(p.replace(/\.json$/, ''))) ?? null

/**
 * Judge the static JSON edges. An all-towns table — one importer, one file name, each roster town exactly once,
 * no roster town missing — is a note; every other edge that belongs to a town is a hit.
 */
function judge(edges, roster) {
  const hits = [], notes = []
  const groups = new Map()
  for (const e of edges) {
    const rel = relative(ROOT, e.json), key = `${e.from}\u0000${rel.split(sep).pop()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ ...e, rel, town: townOf(rel) })
  }
  for (const g of groups.values()) {
    const named = g.map(e => e.town)
    const isTable = g.length === roster.size && named.every(t => t && roster.has(t)) && new Set(named).size === roster.size
    if (isTable) { notes.push(`${relative(ROOT, g[0].from)} → ${g.map(e => e.rel).join(', ')} (one ${g[0].rel.split(sep).pop()} per roster town, all ${roster.size}: every town's table; retired by the town manifest, BRIEF-slab-loading ⑧)`); continue }
    const missing = named.some(t => t && roster.has(t)) && g.length > 1 ? [...roster].filter(t => !named.includes(t)) : []
    for (const e of g) {
      if (e.rel === `public${sep}looks${sep}index.json`) { notes.push(`${relative(ROOT, e.from)}:${e.line} → ${e.rel} (every town's list; retired by the town manifest, BRIEF-slab-loading ⑧)`); continue }
      const why = owner(e.json)
      if (why) hits.push(`${relative(ROOT, e.from)}:${e.line} → ${e.rel} — ${why}${missing.length ? ` (a table missing ${missing.join(', ')}: one town's data in disguise)` : ''}. Load it with import() behind the town's own guard, or move it under that town's slab.`)
    }
  }
  return { hits, notes }
}

// ⭐ The table rule, judged on planted edges before the bundle is: a full table passes; each way short of one fails.
function selfTest() {
  const R = [...roster], from = resolve(ROOT, 'src/instances/__planted.js')
  const edge = (t, name = 'town-id.json') => ({ json: resolve(ROOT, 'cartograph/data', t, name), from, line: 1 })
  const cases = [
    ['a full table (every roster town once)', R.map(t => edge(t)), 0],
    ['one town\'s file imported alone', [edge(R[0])], 1],
    ['a table missing one roster town', R.slice(1).map(t => edge(t)), R.length - 1],
    ['a table with one town twice in place of another', [...R.slice(1), R[1]].map(t => edge(t)), R.length],
  ]
  // A town the kit knows but the registry does not register, in place of a roster town: still not every town's table.
  const outsider = [...towns].find(t => !roster.has(t))
  if (outsider) cases.push(['a table with an unregistered town in place of a roster town', [...R.slice(1), outsider].map(t => edge(t)), R.length])
  for (const [what, edges, wantHits] of cases) {
    const got = judge(edges, roster).hits.length
    if (got !== wantHits) { console.error(`⛔ self-test: ${what} gave ${got} hit(s), want ${wantHits} — the all-towns table rule is broken`); process.exit(2) }
  }
}
if (roster.size < 2) { console.error('⛔ the roster has fewer than two towns — a table cannot be told from one town\'s file'); process.exit(2) }
selfTest()
const { hits, notes } = judge(jsonEdges, roster)

console.log(`NO TOWN RIDES IN THE BUNDLE — ${seen.size} files reached statically from src/main.jsx, ${jsonEdges.length} static JSON imports, ${towns.size} town ids read.`)
for (const n of notes) console.log(`  ⚠️  ${n}`)
if (hits.length) {
  console.log(`⛔ FAIL — ${hits.length} static import(s) of one town's data, shipped to every town:`)
  for (const h of hits) console.log(`  ${h}`)
  process.exit(2)
}
console.log('✅ PASS — the bundle carries no town.')
