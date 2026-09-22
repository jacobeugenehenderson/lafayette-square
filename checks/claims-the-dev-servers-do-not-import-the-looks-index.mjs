/**
 * claims-the-dev-servers-do-not-import-the-looks-index — no dev server imports a file it WRITES.
 *
 * ⛔⛔ A LONG-LIVED NODE SERVER MAY NOT CARRY A FILE IT WRITES IN ITS MODULE GRAPH.
 *
 * `node --watch` watches the entry point AND everything it statically imports — and
 * only that (a `readFileSync`'d file is NOT watched; measured). So the moment a
 * server imports a file it rewrites at runtime, it SIGTERMs itself the instant it
 * does its job.
 *
 * Instance, 2026-09-21 — and it is the shape Layer 0 q2 names as the worst outcome:
 * `cartograph/config.js` imported `src/instance.js`, which statically imports
 * `public/looks/index.json` (correctly — the browser needs the look→map table
 * synchronously at build time). The bake's last two acts are to stamp `bakedAt`
 * into that index and then upload the slab to R2. The write fired the watcher, the
 * watcher killed the server mid-upload, the socket closed with nothing written, and
 * the Stage reported a 500 on a pour that had SUCCEEDED. The orphaned upload ran on
 * parentless, never finished, and staging kept serving the previous slab with
 * nothing said. `arborist/serve.js` was hit too, via the same config.js.
 *
 * ⭐ THE SUBJECT LIST IS READ, NEVER LISTED — twice over:
 *   · the servers come from package.json's `dev:*` scripts, so a fourth dev server
 *     is covered the day it is added, with no edit here;
 *   · the forbidden tree is `public/` itself, not a named file, so the next
 *     runtime-written artifact that drifts into a graph is caught as well.
 * ⛔ Do NOT narrow this to `public/looks/index.json`: the file was never the defect,
 * the coupling was.
 *
 * ⛔ It does not care whether the script says `--watch` today. A server that imports
 * what it writes is one flag away from the bug, and the flag goes on and off.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
// The mutable tree: everything under it is served, and much of it is rewritten by
// the servers themselves (the looks index on every bake, the baked slabs, photos).
const FORBIDDEN_DIR = 'public'

// ── The servers, read out of package.json's dev scripts.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const entries = []
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  if (!name.startsWith('dev:')) continue
  const m = String(cmd).match(/(?:^|\s)([\w./-]+\.m?js)(?:\s|$)/)
  if (m && fs.existsSync(path.join(ROOT, m[1]))) entries.push({ script: name, file: m[1] })
}
if (!entries.length) {
  console.error('FAIL claims-the-dev-servers-do-not-import-the-looks-index')
  console.error('  ⛔ no `dev:*` script in package.json resolves to a .js/.mjs entry point — this check')
  console.error('     reads its subjects from there, so it is now scanning nothing. Fix the reader.')
  process.exit(1)
}

// ── Static import graph. Relative specifiers only: a bare specifier is a package,
// and a package cannot be under public/.
const SPEC = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"()]*?\sfrom\s+)?['"]([^'"]+)['"]|(?:^|[\s;}])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function resolveFrom(importer, spec) {
  const base = path.resolve(path.dirname(importer), spec)
  for (const cand of [base, base + '.js', base + '.mjs', base + '.jsx', path.join(base, 'index.js')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
  }
  return null
}

function graphOf(entryRel) {
  const start = path.join(ROOT, entryRel)
  const seen = new Set([start])
  const parent = new Map()            // module → who imported it (for the chain in the report)
  const queue = [start]
  while (queue.length) {
    const f = queue.shift()
    if (!/\.(m?js|jsx)$/.test(f)) continue     // a .json leaf imports nothing
    let src
    try { src = fs.readFileSync(f, 'utf8') } catch { continue }
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1] ?? m[2]
      if (!spec || !spec.startsWith('.')) continue
      const r = resolveFrom(f, spec)
      if (!r || seen.has(r)) continue
      seen.add(r); parent.set(r, f); queue.push(r)
    }
  }
  return { seen, parent }
}

function chain(parent, file, start) {
  const out = [file]
  let cur = file
  while (parent.has(cur) && cur !== start) { cur = parent.get(cur); out.push(cur) }
  return out.reverse().map((p) => path.relative(ROOT, p)).join('\n       → ')
}

const findings = []
let scanned = 0
for (const e of entries) {
  const { seen, parent } = graphOf(e.file)
  scanned += seen.size
  for (const f of seen) {
    const rel = path.relative(ROOT, f)
    if (rel.split(path.sep)[0] !== FORBIDDEN_DIR) continue
    findings.push({ script: e.script, rel, chain: chain(parent, f, path.join(ROOT, e.file)) })
  }
}

if (findings.length) {
  console.error(`FAIL claims-the-dev-servers-do-not-import-the-looks-index (${entries.length} servers, ${scanned} modules)`)
  console.error(`  ⛔ a dev server's static module graph reaches ${FORBIDDEN_DIR}/ — the tree it WRITES.`)
  console.error('     Under `node --watch` the server kills itself mid-request the moment it saves one:')
  for (const f of findings) {
    console.error(`  • ${f.script}:\n       → ${f.chain}`)
  }
  console.error('  ▶ import the data at RUNTIME (readFileSync is not watched), or split the browser-only')
  console.error('    import into its own module the server never loads — as `src/instances/registry.js`')
  console.error('    does for `src/instance.js`. Account: src/instances/registry.js.')
  process.exit(1)
}
console.log(`PASS claims-the-dev-servers-do-not-import-the-looks-index — ${entries.length} dev servers ` +
  `(${entries.map((e) => e.file).join(', ')}), ${scanned} modules, none under ${FORBIDDEN_DIR}/`)
