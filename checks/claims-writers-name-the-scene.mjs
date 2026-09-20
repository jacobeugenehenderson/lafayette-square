// claims-writers-name-the-scene.mjs — DOES EVERY WRITER MAKE THE OPERATOR NAME THE TOWN?
//
// ⭐ THE INVARIANT: a cartograph module that WRITES and can be RUN must refuse to run until the
// operator has named the scene. Defaulting does not show a wrong map — it OVERWRITES A RIGHT ONE.
// On 2026-07-31 that cost a full day: an agent rebuilt Lafayette Square repeatedly while the
// operator worked in `lafayette-square-staging`, and "no symptom change" was read as the fix
// failing rather than as the wrong town being built. `CLAUDE.md` Layer 0 q2 — a fallback turns a
// failure into a plausible-looking success, which for a kit is the worst outcome available.
//
// This is the CLASS, not the instance. The instances (2026-09-19) were: six bakers seeded
// `let scene = 'lafayette-square'`; `migrate-overlay` read `process.env.SCENE`, a variable nothing
// else in the repo sets, so the CORRECT env export missed it entirely; `rejoin-splits` took no
// scene input at all and rewrote LS's centerlines from any cwd. The next writer somebody adds gets
// caught here instead of after a day of rebuilding the wrong town.
//
// ⭐⭐ WHY THIS CHECK IS TRANSITIVE, AND WHY THAT IS THE WHOLE POINT. The brief that commissioned
// it found writers by grepping for `writeFileSync` BY NAME. That missed `fs.`-prefixed calls once
// and `io.js`'s `writeIfChanged` wrapper once, and so reported two different wrong writer counts
// in a single day. A check that reproduced that method would inherit the blindness that made the
// brief wrong twice. So this file:
//   · resolves each module's OWN fs import bindings (default, namespace, named, and `as` aliases),
//     so `fs.writeFileSync`, `writeFileSync` and `import { writeFileSync as wfs }` all count;
//   · propagates writer-ness ACROSS the local import graph to a fixed point, so a module that
//     writes only through `io.js#writeIfChanged` is a writer, and so is anything wrapping THAT.
// ⛔ Nothing here restates a list of writers. Add a bake step and it is classified on the next run.
//
// ⛔ NO SKIP LIST. A writer is GUILTY until its own source says otherwise: a genuinely
// non-scene-keyed writer carries `// @scene-independent: <reason>` in the file itself, where a
// reviewer sees it in the diff, and this check prints every one of them. An exemption with no
// reason fails. The check holds no names.
//
//   node checks/claims-writers-name-the-scene.mjs
// Read-only. Exits 1 on an unguarded writer, or an exemption with no reason.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = 'cartograph'
const GUARD_MODULE = 'scene.js'
const GUARD = 'requireExplicitScene'

const dirAbs = join(ROOT, DIR)
if (!existsSync(dirAbs)) throw new Error(`⛔ ${DIR}/ is missing — the writer roster is unknowable. NOT CHECKED.`)
const files = readdirSync(dirAbs).filter(f => /\.m?js$/.test(f)).sort()
const src = Object.fromEntries(files.map(f => [f, readFileSync(join(dirAbs, f), 'utf8')]))

// ── Node's filesystem MUTATION surface. This is an external API, not a fact about this repo,
//    so naming it here cannot go stale the way a list of our own files would.
const FS_WRITES = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'createWriteStream', 'cpSync',
  'copyFileSync', 'renameSync', 'rmSync', 'unlinkSync', 'rmdirSync', 'truncateSync', 'writevSync']

/** Every local identifier in `s` that resolves to one of Node's fs write calls. */
function fsWriteBindings(s) {
  const out = new Set()
  const FS = String.raw`['"](?:node:)?fs(?:/promises)?['"]`
  for (const m of s.matchAll(new RegExp(String.raw`import\s+(?:\*\s+as\s+)?(\w+)\s+from\s+${FS}`, 'g')))
    for (const p of FS_WRITES) out.add(`${m[1]}.${p}`)                       // fs.writeFileSync
  for (const m of s.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*${FS}`, 'gs')))
    for (const part of m[1].split(',')) {                                    // { writeFileSync as wfs }
      const [orig, alias] = part.split(/\s+as\s+/).map(x => x.trim())
      if (FS_WRITES.includes(orig)) out.add(alias || orig)
    }
  return out
}
const calls = (s, name) => new RegExp(String.raw`(?<![\w.])${name.replace('.', String.raw`\.`)}\s*\(`).test(s)

// ── Local import graph: file → [{ mod, names }] for `./x.js` imports only.
const imports = Object.fromEntries(files.map(f => [f, [...src[f].matchAll(
  /import\s*\{([^}]*)\}\s*from\s*['"]\.\/([\w.-]+\.m?js)['"]/gs)].map(m => ({
    mod: m[2], names: m[1].split(',').map(x => x.split(/\s+as\s+/).pop().trim()).filter(Boolean),
  }))]))

// ── Writers, to a fixed point: direct fs mutation, or calling into a module that is one.
const writers = new Set(files.filter(f => [...fsWriteBindings(src[f])].some(n => calls(src[f], n))))
const viaWrapper = new Map()
for (let changed = true; changed;) {
  changed = false
  for (const f of files) {
    if (writers.has(f)) continue
    for (const { mod, names } of imports[f]) {
      if (!writers.has(mod)) continue
      const used = names.find(n => calls(src[f], n))
      if (used) { writers.add(f); viaWrapper.set(f, `${mod}#${used}`); changed = true; break }
    }
  }
}

// ── Reachable as a command? Anything nothing imports can only be run; anything with a main guard
//    can be run even though it is also imported.
const importedBy = {}
for (const f of files) for (const { mod } of imports[f]) (importedBy[mod] ??= []).push(f)
const isEntry = f => !(importedBy[f]?.length) || /import\.meta\.url\s*===|pathToFileURL\(\s*process\.argv\[1\]\s*\)/.test(src[f])
const isGuarded = f => calls(src[f], GUARD)
// ⛔ `[ \t]*`, NOT `\s*`: `\s` matches a newline, so an EMPTY reason silently swallowed the
//    line break and captured the NEXT line of the file as its justification — an exemption with
//    no reason read as a well-reasoned one. Found by mutation-testing this check (M3), which is
//    the only reason it is not still true.
const exemption = f => src[f].match(/@scene-independent:[ \t]*(.*(?:\n[ \t]*\/\/[ \t]{2,}.*)*)/)?.[1]
  ?.replace(/\n[ \t]*\/\/[ \t]+/g, ' ').trim()

// ── Report ───────────────────────────────────────────────────────────────────────────────────
const sorted = [...writers].sort()
console.log(`writers in ${DIR}/, resolved from source (direct fs + through local wrappers): ${sorted.length}`)
console.log(`  guard: ${GUARD}() from ${DIR}/${GUARD_MODULE}\n`)

const fail = [], noReason = [], exempt = [], libs = []
for (const f of sorted) {
  const how = viaWrapper.has(f) ? `via ${viaWrapper.get(f)}` : 'direct fs'
  if (!isEntry(f)) { libs.push([f, how]); continue }
  if (isGuarded(f)) { console.log(`  ✅ GUARDED    ${f.padEnd(30)} ${how}`); continue }
  const why = exemption(f)
  if (why === undefined) { fail.push([f, how]); console.log(`  ⛔ UNGUARDED  ${f.padEnd(30)} ${how}`); continue }
  if (!why) { noReason.push(f); console.log(`  ⛔ NO REASON  ${f.padEnd(30)} @scene-independent with an empty reason`); continue }
  exempt.push([f, why])
}
if (libs.length) {
  console.log(`\nnot reachable as a command — imported only, so the CALLER names the scene:`)
  for (const [f, how] of libs) console.log(`  ·  ${f.padEnd(30)} ${how}; imported by ${importedBy[f].join(', ')}`)
}
if (exempt.length) {
  console.log(`\ndeclared non-scene-keyed, in their own source (reviewed in the diff, printed here):`)
  for (const [f, why] of exempt) console.log(`  ·  ${f}\n       ${why}`)
}

if (fail.length || noReason.length) {
  console.log(`\n⛔ FAIL — ${fail.length + noReason.length} writer(s) can be run without naming the town.`)
  for (const [f, how] of fail) console.log(`   ${DIR}/${f}  (writes ${how})`)
  for (const f of noReason) console.log(`   ${DIR}/${f}  (@scene-independent with no reason given)`)
  console.log(`\n   Each will silently target '${'lafayette-square'}' when the operator forgets, overwriting`)
  console.log(`   a real build with another town's run. Either call ${GUARD}('<name>') from`)
  console.log(`   ./${GUARD_MODULE} — the ONE resolver, which reads --scene= AND CARTOGRAPH_SCENE — or, if the`)
  console.log(`   writer genuinely has no scene, say so IN THE FILE with a reason:`)
  console.log(`      // @scene-independent: <why this writes no per-scene path>`)
  process.exit(1)
}
console.log(`\n✅ PASS — every runnable writer in ${DIR}/ refuses an unnamed scene, or says in its own`)
console.log(`   source why it has none.`)
console.log(`⚠️ Scope note: this proves the guard is CALLED, not that the resolved scene is the one the`)
console.log(`   operator meant. The look↔scene cross-write is a separate guard (cartograph/bake-target.js).`)
