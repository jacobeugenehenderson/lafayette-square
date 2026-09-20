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
// ⭐ MUTATION-TESTED, AND A PASS HERE MEANS NOTHING WITHOUT IT (2026-09-20, M1/M2 — see M3 at the
// exemption regex below). Both mutants are unguarded async writers dropped into cartograph/:
//   M1  import { promises as fs } from 'node:fs'  +  fs.writeFile(…)
//   M2  import fs from 'node:fs/promises'         +  fs.mkdir(…)
// Pre-fix this check exited 0 and printed neither. It now exits 1 and names both. A read-only
// control (`readFileSync` only) is correctly NOT flagged, so the catch is the write, not the import.
// And for the widened roster + the domain predicate (M4/M5, same day):
//   M4  an unguarded scene-keyed writer in arborist/  → FAILS   (the roster really is repo-wide)
//   M5  an unguarded writer with no scene signal      → OUT OF DOMAIN, not a failure
//
// ⛔⛔ AND TWO FALSE RESULTS OF ITS OWN, BOTH FOUND BY OPENING THE FILE THE CHECK HAD JUST
// JUDGED RATHER THAN BELIEVING THE VERDICT (2026-09-20). Neither was a mutation; both were live:
//   F1  FALSE POSITIVE — it accused `arborist/selection.mjs`, a module with ZERO write calls.
//       The import graph was static-only and arborist reaches it by `await import()`.
//   F2  FALSE NEGATIVE, AND IT HID THE FILE THIS WIDENING EXISTS FOR. Fixing F1 put
//       bake-trees.js into `importedBy`, and the main-guard test then called it imported-only
//       and DROPPED IT FROM THE GATE. The test matched two spellings; bake-trees:1359 writes
//       the guard the other way round. ⭐ THE CHECK WAS ONE COMMIT FROM GOING GREEN ON THE ONE
//       DESTRUCTIVE WRITER IT WAS BUILT TO CATCH, in a way that would have looked like success.
// ⭐⭐ WHAT GENERALISED IT — the reusable half: TEST FOR THE SHAPE, NOT THE SPELLING. A module
// that reaches for BOTH `process.argv[1]` and its own `import.meta.url`, in any order, through
// any wrapper, is deciding whether it was run. That rewrite also surfaced two more writers the
// narrow test had been hiding all along, which is how you know it generalised instead of patched.
//
// ⚠️ THE ROSTER IS TRACKED FILES, SO A BRAND-NEW WRITER IS INVISIBLE UNTIL IT IS `git add`ed.
// Found while mutation-testing: M4 and M5 were ignored entirely until `git add --intent-to-add`,
// because `git ls-files` does not list untracked paths. Correct for a gate that runs on committed
// code, and the right trade for excluding node_modules without naming directories — but it means
// this check cannot warn you mid-edit, and anyone re-running the mutation test must stage the
// mutants or they will prove nothing and look like a pass.
//
//   node checks/claims-writers-name-the-scene.mjs
// Read-only. Exits 1 on an unguarded writer, or an exemption with no reason.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GUARD_MODULE = 'cartograph/scene.js'
const GUARD = 'requireExplicitMap'

// ── THE ROSTER IS DISCOVERED, NOT LISTED. `git ls-files` = what we actually version, so
//    node_modules excludes itself and no directory has to be named. `_archive/` is the Diary.
// ⛔ A SECOND HARDCODED DIRECTORY WOULD HAVE BEEN THE SAME DEFECT WITH A LONGER NAME. The old
//    `DIR = 'cartograph'` + non-recursive readdirSync missed `cartograph/pipeline/` too — a
//    subdirectory of the very directory it claimed to cover.
const files = execFileSync('git', ['ls-files', '*.js', '*.mjs'], { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(f => f && !f.includes('_archive/')).sort()
if (!files.length) throw new Error('⛔ git ls-files returned nothing — the writer roster is unknowable. NOT CHECKED.')
const read = f => { try { return readFileSync(join(ROOT, f), 'utf8') } catch { return '' } }
const src = Object.fromEntries(files.map(f => [f, read(f)]))

// ── TIERS. Product code is ASSERTED (a failure here exits 1). Probes and the checks themselves
//    are REPORTED — printed as a count, never gating.
// ⭐ Why reported and not asserted: scratch/ holds 135 runnable writers. Gating on them makes the
//    check unusable, and an unusable gate is how a skip list gets added six months later. Printing
//    them keeps them visible at zero cost to the gate. (Same discipline as
//    `claims-every-lu-tag-has-a-home.mjs`, which reports its home count rather than asserting it.)
const isReported = f => /^(scratch|checks)\//.test(f)

// ── Node's filesystem MUTATION surface. This is an external API, not a fact about this repo,
//    so naming it here cannot go stale the way a list of our own files would.
//
// ⛔⛔ BOTH HALVES, AND THE ASYNC HALF IS WHY THIS CHECK ONCE PASSED OVER A DESTRUCTIVE WRITER.
// This list held only the *Sync names. `arborist/bake-trees.js` writes with `fs.mkdir` /
// `fs.writeFile` off `import { promises as fs }`, so it was invisible — a bake that overwrites
// Lafayette Square's trees.json, sitting outside a check whose whole subject it is.
// ⭐ AND THE TWO BLIND SPOTS WERE CORRELATED, WHICH IS WHY NEITHER EVER SURFACED: measured
// repo-wide 2026-09-20, 186 writers are sync-only, 24 are async-only, and ZERO do both — every
// async-only one is in arborist/, while cartograph/ is uniformly sync. So this check was
// genuinely complete inside cartograph/ and would have gone GREEN the moment its directory was
// widened, still not seeing the file that motivated widening it. Fixing the scope without
// fixing this list would have been worse than leaving it alone, because today's scope note is
// at least honest.
const FS_WRITES_SYNC = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'createWriteStream', 'cpSync',
  'copyFileSync', 'renameSync', 'rmSync', 'unlinkSync', 'rmdirSync', 'truncateSync', 'writevSync']
const FS_WRITES_ASYNC = ['writeFile', 'appendFile', 'mkdir', 'cp', 'copyFile', 'rename', 'rm',
  'unlink', 'rmdir', 'truncate']
const FS_WRITES = [...FS_WRITES_SYNC, ...FS_WRITES_ASYNC]

/** Every local identifier in `s` that resolves to one of Node's fs write calls. */
function fsWriteBindings(s) {
  const out = new Set()
  const FS = String.raw`['"](?:node:)?fs(?:/promises)?['"]`
  for (const m of s.matchAll(new RegExp(String.raw`import\s+(?:\*\s+as\s+)?(\w+)\s+from\s+${FS}`, 'g')))
    for (const p of FS_WRITES) out.add(`${m[1]}.${p}`)                       // fs.writeFileSync, fs.writeFile
  for (const m of s.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*${FS}`, 'gs')))
    for (const part of m[1].split(',')) {                                    // { writeFileSync as wfs }
      const [orig, alias] = part.split(/\s+as\s+/).map(x => x.trim())
      if (FS_WRITES.includes(orig)) out.add(alias || orig)
      // ⛔ THE NAMESPACE CASE THIS LIST CANNOT EXPRESS: `import { promises as fs }` binds the
      //    WHOLE async API under one local name. `FS_WRITES.includes('promises')` is false, so
      //    the loop above skips it and every `fs.writeFile` in the file goes unseen.
      if (orig === 'promises') for (const p of FS_WRITES_ASYNC) out.add(`${alias || orig}.${p}`)
    }
  return out
}
const calls = (s, name) => new RegExp(String.raw`(?<![\w.])${name.replace('.', String.raw`\.`)}\s*\(`).test(s)

// ── Local import graph: file → [{ mod, names }], resolved to repo-relative paths.
// ⛔ `../` TOO, NOT JUST `./`. The old form matched same-directory imports only, so wrapper
//    propagation stopped at every directory boundary — `arborist/x.js` importing
//    `../cartograph/io.js` was not seen to write through it.
const imports = Object.fromEntries(files.map(f => [f, [...src[f].matchAll(
  /import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+?\.m?js)['"]/gs)].map(m => ({
    mod: normalize(join(dirname(f), m[2])),
    names: m[1].split(',').map(x => x.split(/\s+as\s+/).pop().trim()).filter(Boolean),
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
// ⛔ DYNAMIC IMPORTS COUNT AS IMPORTS. `await import('./selection.mjs')` is how arborist defers
//    its heavy modules, and a static-only graph reported selection.mjs — a module with zero write
//    calls, imported by bake-look and bake-trees — as an unguarded runnable writer. A FALSE
//    POSITIVE in this check, found by reading the file it accused rather than believing it
//    (2026-09-20). A check that cries wolf is how the next reader learns to skim its output.
const dynImports = f => [...src[f].matchAll(/\bimport\s*\(\s*['"](\.[^'"]+?\.m?js)['"]\s*\)/g)]
  .map(m => normalize(join(dirname(f), m[1])))
const importedBy = {}
for (const f of files) {
  for (const { mod } of imports[f]) (importedBy[mod] ??= []).push(f)
  for (const mod of dynImports(f)) (importedBy[mod] ??= []).push(f)
}
// ⛔⛔ THE MAIN-GUARD TEST MUST NOT KNOW ONE IDIOM. It matched `import.meta.url ===` and
//    `pathToFileURL(process.argv[1])` only. `arborist/bake-trees.js:1359` writes its guard the
//    other way round — `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)` — so
//    the moment serve.js's `await import('./bake-trees.js')` put it in `importedBy`, this test
//    called it imported-only and DROPPED IT FROM THE GATE. ⭐ The check was one commit from
//    going green on the single destructive writer that motivated widening it, in a way that
//    would have looked like success. Both false results in this file were found the same way:
//    by opening the file the check had just judged, instead of trusting the verdict.
// ⇒ The rule is the SHAPE, not the spelling: a module that reaches for BOTH `process.argv[1]`
//    and its own `import.meta.url` is deciding whether it was run. Any comparison order, any
//    wrapper. `import.meta.main` is the newer spelling of the same intent.
const hasMainGuard = f => (/\bprocess\.argv\[1\]/.test(src[f]) && /\bimport\.meta\.url\b/.test(src[f]))
  || /\bimport\.meta\.main\b/.test(src[f])
const isEntry = f => !(importedBy[f]?.length) || hasMainGuard(f)
const isGuarded = f => calls(src[f], GUARD)

// ── IS THIS WRITER EVEN IN THE DOMAIN? ────────────────────────────────────────────────────────
// ⭐⭐ THE INVARIANT IS NOT "THIS FILE WRITES" — IT IS "THIS FILE WRITES SOMEWHERE A SCENE NAME
// SELECTS." `vite.config.js` writing a build and `extract-bark-detail.mjs` writing textures are
// not near-misses to be exempted; they are OUT OF DOMAIN, and a predicate that cannot tell them
// apart is asking the wrong question — which is this brief's own recurring lesson.
// Without this, widening the roster raised 52 failures of which ~46 were not bugs, and 46
// hand-written exemptions is a skip list with extra steps.
//
// ⛔⛔ AND THE DROP MUST BE VISIBLE: A PREDICATE THAT QUIETLY DROPS 46 FILES IS ITSELF A SKIP
// LIST UNLESS THE DROP IS VISIBLE. Every out-of-domain writer is printed below with the reason,
// so the boundary is reviewable in the output instead of buried in a regex — and the day this
// predicate is wrong, somebody can see it. ⚠️ Known residual shape it cannot see: a writer that
// builds a scene path LITERALLY inline (`join('cartograph','data',scene,…)`) while importing none
// of the resolver's bindings and taking no --scene/--look arg. Unmeasured whether any exists;
// it would appear in the out-set as "no scene-keyed signal found", which is where to look.
//
// ⭐ HOW THIS WAS ESTABLISHED, AND THE ORDER MATTERS — KEEP IT IF YOU CHANGE THE SIGNALS:
// the 23 writers that already call the guard are the VALIDATION SET. The predicate was checked
// against them FIRST, before the 52→6 reduction was quoted to anyone, because a predicate that
// misses a guarded writer is unusable no matter how good its reduction looks. It failed that
// check on the first attempt — missing seed-centerlines / skeleton / survey, which name no scene
// and build no path, but import RAW_DIR/CLEAN_DIR. ⇒ any edit here must still mark all 23.
const resolverSrc = existsSync(join(ROOT, GUARD_MODULE)) ? readFileSync(join(ROOT, GUARD_MODULE), 'utf8') : ''
if (!resolverSrc) throw new Error(`⛔ ${GUARD_MODULE} is unreadable — the scene signals are underivable. NOT CHECKED.`)
// ⭐ DERIVED FROM THE RESOLVER'S SOURCE, NOT RESTATED: exports whose VALUE mentions SCENE are
//    scene-RESOLVED aliases (`RAW_DIR = mapRawDir(SCENE)`), so importing one is, by construction,
//    writing into the active scene's directory. Add a fourth alias and it is picked up here.
// ⛔ GUARD excluded, or validating against guarded files would be circular.
const sceneBound = [...resolverSrc.matchAll(/^export\s+(?:const|let)\s+(\w+)\s*=\s*(.+)$/gm)]
  .filter(m => /\bSCENE\b/.test(m[2])).map(m => m[1]).filter(n => n !== GUARD)
const sceneFns = [...resolverSrc.matchAll(/^export\s+function\s+(map\w*Dir|mapDataPaths)\s*\(/gm)].map(m => m[1])
const RESOLVER_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*(?:scene|config)\.js['"]/gs

const SIGNALS = [
  ['resolver-binding', s => [...s.matchAll(RESOLVER_IMPORT)].some(m => m[1].split(',')
    .some(p => { const o = p.split(/\s+as\s+/)[0].trim(); return sceneBound.includes(o) || sceneFns.includes(o) }))],
  ['scene-dir-helper', s => /\bmap(?:Clean|Raw|Data)?(?:Dir|Paths)\s*\(/.test(s)],
  ['scene-const',      s => /\b(?:SCENE|DEFAULT_MAP|CARTOGRAPH_SCENE)\b/.test(s)],
  ['scene-arg',        s => /--scene|--look|\bargs?\.(?:scene|look)\b|\bopts?\.(?:scene|look)\b/.test(s)],
  ['scene-path-tmpl',  s => /[`'"][^`'"]*(?:data|baked|looks)\/\$\{\s*(?:scene|look|map|mapName|lookId|sceneName)/i.test(s)],
  ['scene-path-join',  s => /join\([^)]*['"](?:data|baked|looks)['"][^)]*,\s*(?:scene|look|map|mapName|lookId)\b/i.test(s)],
  ['scene-param',      s => /\bfunction\s+\w+\s*\([^)]*\b(?:scene|lookId)\b|\{\s*[^}]*\b(?:scene|lookId)\b[^}]*\}\s*=\s*\{\s*\}/.test(s)],
]
const signalsFor = f => SIGNALS.filter(([, t]) => t(src[f])).map(([n]) => n)
const inDomain = f => signalsFor(f).length > 0
// ⛔ `[ \t]*`, NOT `\s*`: `\s` matches a newline, so an EMPTY reason silently swallowed the
//    line break and captured the NEXT line of the file as its justification — an exemption with
//    no reason read as a well-reasoned one. Found by mutation-testing this check (M3), which is
//    the only reason it is not still true.
const exemption = f => src[f].match(/@scene-independent:[ \t]*(.*(?:\n[ \t]*\/\/[ \t]{2,}.*)*)/)?.[1]
  ?.replace(/\n[ \t]*\/\/[ \t]+/g, ' ').trim()

// ── SELF-VALIDATION. The 23 writers that already call the guard are known-good; a predicate
//    that drops one of them is under-inclusive and this check must refuse to report at all
//    rather than print a reassuring number. (`claims-*` standing pattern: pin the rule you model
//    and refuse to go green if it has moved.)
const validation = [...writers].filter(f => isEntry(f) && isGuarded(f))
const blind = validation.filter(f => !inDomain(f))
if (blind.length) {
  console.error(`⛔ NOT CHECKED — the scene-path predicate no longer recognises ${blind.length} of ` +
    `${validation.length} writers that DO call the guard:`)
  for (const f of blind) console.error(`   ${f}`)
  console.error(`\n   These are the validation set: they are known to be scene-keyed because they` +
    `\n   already guard. A predicate that cannot see them would silently drop real writers from` +
    `\n   the domain, so no result here is trustworthy until SIGNALS covers them again.`)
  process.exit(2)
}

// ── Report ───────────────────────────────────────────────────────────────────────────────────
const runnable = [...writers].filter(isEntry).sort()
const libs = [...writers].filter(f => !isEntry(f)).sort()
const asserted = runnable.filter(f => !isReported(f))
const reported = runnable.filter(isReported)
const outOfDomain = asserted.filter(f => !inDomain(f))
const subject = asserted.filter(inDomain)

console.log(`writers, discovered from source across ${new Set(files.map(f => f.split('/')[0])).size} top-level paths`)
console.log(`  roster    : git ls-files *.js *.mjs, minus _archive/  (${files.length} files)`)
console.log(`  writers   : ${writers.size} — direct fs (sync + async) or through a local wrapper, to a fixed point`)
console.log(`  runnable  : ${runnable.length}   imported-only: ${libs.length}`)
console.log(`  IN DOMAIN : ${subject.length} — the write target derives from a scene/look selector`)
console.log(`  guard     : ${GUARD}() from ${GUARD_MODULE}`)
console.log(`  ✅ predicate validated against all ${validation.length} already-guarded writers\n`)

const fail = [], noReason = [], exempt = []
for (const f of subject) {
  const how = viaWrapper.has(f) ? `via ${viaWrapper.get(f)}` : 'direct fs'
  if (isGuarded(f)) { console.log(`  ✅ GUARDED    ${f.padEnd(44)} ${how}`); continue }
  const why = exemption(f)
  if (why === undefined) { fail.push([f, how]); console.log(`  ⛔ UNGUARDED  ${f.padEnd(44)} ${how}`); continue }
  if (!why) { noReason.push(f); console.log(`  ⛔ NO REASON  ${f.padEnd(44)} @scene-independent with an empty reason`); continue }
  exempt.push([f, why])
}

// ⛔ THE DROP IS THE PART THAT MUST NOT BE SILENT — see the predicate's header.
console.log(`\nOUT OF DOMAIN — writers whose target no scene name selects (${outOfDomain.length}).`)
console.log(`⛔ Printed, not hidden: a predicate that quietly drops files is itself a skip list.`)
console.log(`   Reason is always the same shape — no scene-keyed signal found — so scan for anything`)
console.log(`   you believe DOES write per-scene; that is where this predicate would be wrong.`)
for (const f of outOfDomain) console.log(`  ·  ${f}`)

if (libs.length) {
  console.log(`\nnot reachable as a command — imported only, so the CALLER names the scene (${libs.length}):`)
  for (const f of libs) console.log(`  ·  ${f.padEnd(44)} imported by ${importedBy[f].slice(0, 3).join(', ')}${importedBy[f].length > 3 ? ` +${importedBy[f].length - 3}` : ''}`)
}
if (exempt.length) {
  console.log(`\ndeclared non-scene-keyed, in their own source (reviewed in the diff, printed here):`)
  for (const [f, why] of exempt) console.log(`  ·  ${f}\n       ${why}`)
}
if (reported.length) {
  const byDir = {}
  for (const f of reported) byDir[f.split('/')[0]] = (byDir[f.split('/')[0]] || 0) + 1
  const unguarded = reported.filter(f => inDomain(f) && !isGuarded(f) && exemption(f) === undefined)
  console.log(`\nREPORTED, NOT ASSERTED — probes and checks (${reported.length}: ${Object.entries(byDir).map(([d, n]) => `${d} ${n}`).join(', ')}).`)
  console.log(`   ${unguarded.length} of them write a scene-keyed path without naming the scene. ⚠️ These do NOT`)
  console.log(`   fail the gate — a throwaway probe is not a product writer — but they run against real`)
  console.log(`   data, so a wrong one overwrites a real town just as thoroughly. Gating on them would`)
  console.log(`   make this check unusable, and an unusable gate is how a skip list gets added later.`)
}

if (fail.length || noReason.length) {
  console.log(`\n⛔ FAIL — ${fail.length + noReason.length} in-domain writer(s) can be run without naming the town.`)
  for (const [f, how] of fail) console.log(`   ${f}  (writes ${how}; signals: ${signalsFor(f).join(', ')})`)
  for (const f of noReason) console.log(`   ${f}  (@scene-independent with no reason given)`)
  console.log(`\n   Each will silently target 'lafayette-square' when the operator forgets, overwriting`)
  console.log(`   a real build with another town's run. Either call ${GUARD}('<name>') from`)
  console.log(`   ${GUARD_MODULE} — the ONE resolver, which reads --scene= AND CARTOGRAPH_SCENE — or, if the`)
  console.log(`   writer genuinely has no scene, say so IN THE FILE with a reason:`)
  console.log(`      // @scene-independent: <why this writes no per-scene path>`)
  process.exit(1)
}
console.log(`\n✅ PASS — every runnable in-domain writer refuses an unnamed scene, or says in its own`)
console.log(`   source why it has none.`)
console.log(`⚠️ Scope notes — three, and none of them is covered by the PASS above:`)
console.log(`   · it proves the guard is CALLED, not that the resolved scene is the one the operator`)
console.log(`     meant. The look↔scene cross-write is a separate guard (cartograph/bake-target.js).`)
console.log(`   · the roster is TRACKED files, so a new writer is invisible until it is git-added.`)
console.log(`   · the ${outOfDomain.length} out-of-domain writers above were judged by a source-text predicate, not`)
console.log(`     proven harmless. That list is printed so it can be argued with — read it.`)
