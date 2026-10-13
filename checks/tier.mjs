#!/usr/bin/env node
/**
 * TIER THE CHECK SUITE BY READING ITS SOURCE — never by its name, never from a typed list.
 *
 * WHY THIS EXISTS (2026-09-13). 157 `claims-*` scripts existed and none were wired, because a
 * blanket run is not safe: `claims-onboarding-guard.sh` performs an unconditional
 * `POST /auth/v1/signup` against the live Supabase project with no teardown, and has already left
 * anonymous users behind (`SECURITY.md`, the 2026-08-31 audit disclosure). So the wiring needs a
 * gate, and a HAND-MAINTAINED gate is a skip list — wrong the first time someone adds a check
 * (`CLAUDE.md` Layer 0 q1: what does this do for town #2?). This derives the gate from the source,
 * so a new check is tiered the moment it lands, by nobody.
 *
 * THE TIERS
 *   safe          — reads repo files. No outbound call, no write. Runs in `npm test`.
 *   local-effect  — writes to disk. Runs under `npm run test:all`, never in CI.
 *   live          — ⛔ Never in a default run. Opt-in only. TWO reason classes, and the report
 *                   must keep them apart, because the tier name overstates the second:
 *                     outbound   — a demonstrated call out (fetch, curl, a Supabase client).
 *                     unreadable — runs code this parser cannot read (a computed `import()`, an
 *                                  exec whose command is not a literal). It may contact nothing.
 *                                  It is excluded because it cannot be SHOWN to contact nothing,
 *                                  and that is the whole posture (Layer 0 q2).
 *
 * ⭐ THE BIAS IS DELIBERATE AND IT IS THE WHOLE POINT (`CLAUDE.md` Layer 0 q2 — NO FALLBACKS).
 *    Undecidable ⇒ `live`, never `safe`. A mis-tier in that direction costs a check that did not
 *    run, and says so loudly. A mis-tier the other way costs another anonymous user on production.
 *    ⛔ So: do not "improve" this by resolving ambiguity in favour of safe.
 *
 * HOW IT READS (and why it is not grep). Bare `https://` is NOT a signal — it appears in comments,
 * in SVG namespaces (`claims-deadend-look`, `claims-protopolygon`), in origin-matching fixtures
 * (`claims-twilio-webhook-guard` tests a string against `evil.example.com`, contacting nothing) and
 * in file paths containing `supabase/`. Grepping for it mis-tiers 12 of 16 hits. The signal is a
 * CALL: comments are stripped, then outbound call sites and write syscalls are looked for in what
 * is left — and for `child_process`, the command literal itself is read.
 *
 * ▶ node checks/tier.mjs            # print the census
 * ▶ node checks/tier.mjs --json     # regenerate checks/TIERS.json
 * ⛔ Read-only unless --json. Imports nothing it classifies.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Where checks live. `checks/` is the promoted home; `scratch/` is where the unpromoted remain. */
const DIRS = ['checks', 'scratch']

/**
 * Strip comments, keep string literals.
 * The string bodies must SURVIVE — `execSync('git ls-files')` is classified by reading its
 * argument — while comment bodies must NOT, because a doc-comment showing `fetch(url)` is prose
 * (grep would call it live).
 */
export function stripComments(src, shell = false) {
  if (shell) return src.replace(/^\s*#.*$/gm, '')
  let out = '', i = 0, q = null
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (q) {
      if (c === '\\') { out += c + (n ?? ''); i += 2; continue }
      if (c === q) q = null
      out += c; i++; continue
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    out += c; i++
  }
  return out
}

/** Commands that reach the network, or that can run anything (so: undecidable ⇒ live). */
const NET_CMD = /\b(curl|wget|nc|ssh|scp|supabase|psql|npx|npm\s+(i|install|publish)|pip|gh\s)\b/
/** Local, read-only commands. Anything outside this list is not shown to be local. */
const LOCAL_CMD = /^\s*(git\s+(ls-files|show|rev-parse|log|diff|cat-file|status|grep|merge-base)|grep|rg|ls|cat|find|wc|sed|awk|sort|uniq|head|tail|node\s+-[ev]|true)\b/

const SIGNALS = {
  // Outbound calls. `fetch(` after comment-stripping is a call, not prose.
  live: [
    [/\bfetch\s*\(/, 'calls fetch()'],
    [/\bXMLHttpRequest\b/, 'uses XMLHttpRequest'],
    [/\bWebSocket\s*\(/, 'opens a WebSocket'],
    [/from\s*['"]node:(https?|net|dgram|dns|tls)['"]/, 'imports a network module'],
    [/require\s*\(\s*['"](node:)?(https?|net|dgram|dns|tls)['"]/, 'imports a network module'],
    [/\bcreateClient\s*\(/, 'constructs a Supabase/DB client'],
    // ⭐ The other ways to start code that is not this file (Boz, 2026-10-12): a worker or a forked cluster member runs a
    //    module named at run time, and native code reaches anything. None is read — naming the module is enough.
    [/['"](?:node:)?(?:worker_threads|cluster)['"]/, 'imports worker_threads/cluster — starts code it cannot read'],
    [/\bprocess\.(?:dlopen|binding)\s*\(/, 'loads native code (process.dlopen/binding)'],
    // ⭐ A PACKAGE MEASURED TO REACH OUT. Bare packages are not read from source (the no-network guard is their proof);
    //    one the guard has CAUGHT is declared here so it never enters the safe run again. vite: its server resolves
    //    localhost over DNS on start (getLocalhostAddressIfDiffersFromDNS) — the guard fired on
    //    claims-every-ground-surface-takes-the-lamp and claims-the-slab-addresses-files-by-where-it-was-fetched, 2026-10-12.
    [/(?:from|import\s*\(|require\s*\()\s*['"]vite['"]/, 'imports vite — its server resolves localhost over DNS (caught by the no-network guard)'],
  ],
  // Writes to disk.
  write: [
    [/\bwriteFileSync\s*\(/, 'writeFileSync'],
    [/\bappendFileSync\s*\(/, 'appendFileSync'],
    [/\bmkdirSync\s*\(/, 'mkdirSync'],
    [/\bcreateWriteStream\s*\(/, 'createWriteStream'],
    [/\b(rmSync|unlinkSync|rmdirSync)\s*\(/, 'deletes files'],
    [/\b(cpSync|copyFileSync|renameSync)\s*\(/, 'copies/renames files'],
    [/\bfs\.promises\.(writeFile|mkdir|rm|appendFile)\b/, 'async fs write'],
    [/\bwriteFile\s*\(/, 'writeFile'],
  ],
}

/**
 * ⭐ A SELF-RE-INVOCATION IS READ, NOT GUESSED (Boz's ruling, 2026-10-12). `spawnSync` / `execFileSync` whose command
 * is `process.execPath` and whose first script argument is the running file itself — `process.argv[1]`, or
 * `fileURLToPath(import.meta.url)` — runs the SAME source again, so it has the same tier as the file, and the file is
 * still classified on its own content. Recognised by this shape, never by a helper's name (`_scenes.mjs#eachTown`
 * re-runs the check that imported it this way). ⛔ Narrowly: any other script argument (another file, `-e`, argv[2])
 * is a non-literal command and stays unreadable/live. ▶ `execSelfTest` below, run before every classification.
 */
const SELF_RERUN = /\b(?:spawnSync|execFileSync)\s*\(\s*process\.execPath\s*,\s*\[\s*(?:\.\.\.process\.execArgv\s*,\s*)?(?:process\.argv\[1\]|fileURLToPath\(\s*import\.meta\.url\s*\))\s*[,\]]/g

/** Pull out every string literal handed to a child_process call, so the command can be read. */
// ⛔ child_process is reachable only through an import of it (static, dynamic or require). A file that never names the
//    module cannot spawn, so `/re/.exec(s)` (RegExp.prototype.exec) there is a regex, not a command. A file that DOES
//    name it has every exec/spawn-shaped call read as before, `.exec(` included (`cp.exec(cmd)`).
const IMPORTS_CHILD_PROCESS = /['"](?:node:)?child_process['"]/

function execCommands(code) {
  if (!IMPORTS_CHILD_PROCESS.test(code)) return { cmds: [], selfRuns: 0, opaque: false }
  const cmds = []
  for (const m of code.matchAll(/\b(execSync|execFileSync|exec|execFile|spawnSync|spawn)\s*\(\s*(['"`])([\s\S]*?)\2/g)) cmds.push(m[3])
  const selfRuns = [...code.matchAll(SELF_RERUN)].length
  // a child_process call whose command is not a literal cannot be read at all — unless it re-runs this same file
  const calls = [...code.matchAll(/\b(execSync|execFileSync|exec|execFile|spawnSync|spawn)\s*\(/g)].length
  return { cmds, selfRuns, opaque: calls - selfRuns > cmds.length }
}

/** The ruling, run on planted sources: the two self shapes are read; another file stays unreadable (the mutation). */
export function execSelfTest() {
  const cases = [
    ['spawnSync(process.execPath, [...process.execArgv, process.argv[1], t, ...flags], { stdio: "inherit" })', false],
    ['execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--quiet"])', false],
    ['spawnSync(process.execPath, [join(ROOT, "cartograph/skeleton.js"), "--scene=x"])', true],
    ['execFileSync(process.execPath, ["--input-type=module", "-e", probe])', true],
    ['spawnSync(process.execPath, [process.argv[2]])', true],
    ['spawn(process.execPath, [process.argv[1]])', true],
  ]
  for (const c of cases) c[0] = `import { spawn, spawnSync, execFileSync } from 'node:child_process'\n${c[0]}`
  cases.push(
    ['const m = /^--scene=(.+)$/.exec(a)', false],                                              // a regex, no child_process
    ["import * as cp from 'node:child_process'\ncp.exec(cmd)", true],                          // the namespace form is read
    ["const { exec } = require('child_process')\nexec(cmd)", true],
  )
  for (const [src, wantOpaque] of cases) {
    if (execCommands(src).opaque !== wantOpaque) throw new Error(`[tier] ⛔ self-test: \`${src}\` read as ${wantOpaque ? 'readable' : 'unreadable'} — the self-re-invocation rule is broken`)
  }
  // ⭐ ACROSS THE IMPORT GRAPH: each file is gated on its OWN imports, so a check that never names child_process is
  //    still read through a helper that does.
  const check = "import { run } from './_helper.mjs'\nrun()"
  const graph = [
    ["import { spawnSync } from 'node:child_process'\nexport const run = () => spawnSync(cmd, [])", 'live'],
    ["export const run = () => /^--scene=(.+)$/.exec(process.argv[2])", 'safe'],
    ["import { Worker } from 'node:worker_threads'\nexport const run = () => new Worker(file)", 'live'],
    ["import cluster from 'cluster'\nexport const run = () => cluster.fork()", 'live'],
    ["export const run = () => process.dlopen(module, path)", 'live'],
    ["export const run = () => process.binding('spawn_sync')", 'live'],
    ["import { createServer } from 'vite'\nexport const run = () => createServer({})", 'live'],
    ["export const run = async () => (await import('vite')).build({})", 'live'],
  ]
  for (const [helper, want] of graph) {
    const got = classifyVirtual({ 'checks/claims-planted.mjs': check, 'checks/_helper.mjs': helper }, 'checks/claims-planted.mjs').tier
    if (got !== want) throw new Error(`[tier] ⛔ self-test: a check importing a helper \`${helper.split('\n').pop()}\` read as ${got}, want ${want} — the gate does not hold across the import graph`)
  }
}

/** The text between the parenthesis at `open` and its partner, strings respected. null if it never closes. */
function balancedArg(code, open) {
  let depth = 0, q = null
  for (let i = open; i < code.length; i++) {
    const c = code[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return code.slice(open + 1, i)
  }
  return null
}

/**
 * The same text, same length, with every string and regex literal's body blanked — so `import()` written in a message
 * is not read as a call. A regex literal is blanked too, because its quotes (`/from '([^']+)'/`) would otherwise open a
 * "string" that swallows the real calls after it — measured: three checks went safe that way.
 * ⛔ So it is never trusted alone: `inStringHere` must agree before a call is exempted (see the loop in `classify`).
 */
function blankStrings(code) {
  let out = '', q = null, prev = ''
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (q) {
      if (c === '\\') { out += '  '; i++; continue }
      if (c === q) { q = null; out += c; prev = c; continue }
      out += c === '\n' ? '\n' : ' '; continue
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; prev = c; continue }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(?:return|typeof|case|in|of)\s*$/.test(code.slice(Math.max(0, i - 8), i)))) {
      let j = i + 1, cls = false
      for (; j < code.length && code[j] !== '\n'; j++) {
        if (code[j] === '\\') { j++; continue }
        if (code[j] === '[') cls = true
        else if (code[j] === ']') cls = false
        else if (code[j] === '/' && !cls) break
      }
      if (j < code.length && code[j] === '/') { out += '/' + ' '.repeat(j - i - 1) + '/'; i = j; prev = '/'; continue }
    }
    out += c
    if (!/\s/.test(c)) prev = c
  }
  return out
}

/** A second, independent opinion: an odd count of one quote kind before `at` on its own line. */
function inStringHere(code, at) {
  const line = code.slice(code.lastIndexOf('\n', at - 1) + 1, at).replace(/\\./g, '')
  return ['"', "'", '`'].some(q => line.split(q).length % 2 === 0)
}

/** `s` split at each top-level `sep` (outside brackets and strings). */
function splitTop(s, sep) {
  const parts = []; let depth = 0, q = null, start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (depth === 0 && s.startsWith(sep, i)) { parts.push(s.slice(start, i)); start = i + sep.length; i += sep.length - 1 }
  }
  parts.push(s.slice(start))
  return parts.map(p => p.trim())
}

/** `name(args)` covering the whole expression → { name, args }, else null. */
function callOf(expr) {
  const m = expr.match(/^([A-Za-z_$][\w$.]*)\s*\(/)
  if (!m) return null
  const args = balancedArg(expr, m[0].length - 1)
  if (args === null || m[0].length + args.length + 1 !== expr.length) return null
  return { name: m[1], args }
}

/**
 * ⭐ READ A COMPUTED IMPORT'S PATH, DON'T GUESS IT (Boz's ruling, 2026-10-13). Resolves an expression made ONLY of
 * string literals, `join`/`resolve`/`dirname`, `pathToFileURL(…)(.href)`, `fileURLToPath(import.meta.url)`,
 * `new URL(lit, import.meta.url)`, and `const` bindings of those — a `ROOT` imported from another module is read in
 * THAT module. Returns { paths: [absolute] } · { arg: true } when an argument or the environment can supply any part
 * (`a || b` included: ⛔ an arg-supplied path is arbitrary however literal its fallback) · { opaque: true } otherwise
 * — a loop variable, a `let`, a call it does not know. Only `paths` is readable; the other two keep the file live.
 * ▶ `importSelfTest`, run before every classification.
 */
const ARG_SOURCE = /\bprocess\s*\.\s*(?:env|argv)\b/
function readImportPath(expr, file, code, depth = 0) {
  expr = expr.trim()
  if (depth > 8) return { opaque: true }
  if (ARG_SOURCE.test(expr)) return { arg: true }
  const here = () => resolve(ROOT, file)
  const lit = expr.match(/^(['"])([^'"\\]*)\1$/) || expr.match(/^`([^`$\\]*)`$/)
  if (lit) {
    const v = lit[2] ?? lit[1]
    return v.startsWith('.') ? { paths: [resolve(dirname(here()), v)] } : { segment: v }
  }
  const alts = splitTop(expr, '||').length > 1 ? splitTop(expr, '||') : splitTop(expr, '??')
  if (alts.length > 1) {
    const rs = alts.map(a => readImportPath(a, file, code, depth + 1))
    if (rs.some(r => r.arg)) return { arg: true }
    if (rs.some(r => !r.paths)) return { opaque: true }
    return { paths: rs.flatMap(r => r.paths) }
  }
  if (expr.endsWith('.href')) return readImportPath(expr.slice(0, -5), file, code, depth + 1)
  if (/^import\.meta\.dirname$/.test(expr)) return { paths: [dirname(here())] }
  const nu = expr.match(/^new\s+URL\s*\(/)
  if (nu) {
    const a = balancedArg(expr, nu[0].length - 1), parts = a === null ? [] : splitTop(a, ',')
    if (parts.length !== 2 || parts[1] !== 'import.meta.url') return { opaque: true }
    const r = readImportPath(parts[0], file, code, depth + 1)
    return r.segment !== undefined ? { paths: [resolve(dirname(here()), r.segment)] } : r.paths ? r : r.arg ? r : { opaque: true }
  }
  const call = callOf(expr)
  if (call) {
    const fn = call.name.replace(/^(?:path|url)\./, '')
    const args = splitTop(call.args, ',')
    if (fn === 'fileURLToPath' && args[0] === 'import.meta.url') return { paths: [here()] }
    if ((fn === 'pathToFileURL' || fn === 'fileURLToPath' || fn === 'dirname') && args.length === 1) {
      const r = readImportPath(args[0], file, code, depth + 1)
      if (!r.paths || r.paths.length !== 1) return r.arg ? r : { opaque: true }
      return fn === 'dirname' ? { paths: [dirname(r.paths[0])] } : r
    }
    if (fn === 'join' || fn === 'resolve') {
      const segs = []
      for (const a of args) {
        const l = a.match(/^(['"])([^'"\\]*)\1$/)
        if (l) { segs.push(l[2]); continue }                                   // inside a join a literal is a segment, never file-relative
        const r = readImportPath(a, file, code, depth + 1)
        if (r.arg) return r
        if (r.segment !== undefined) segs.push(r.segment)
        else if (r.paths?.length === 1) segs.push(r.paths[0])
        else return { opaque: true }
      }
      if (!segs.length || !segs[0].startsWith('/')) return { opaque: true }
      return { paths: [(fn === 'join' ? join : resolve)(...segs)] }
    }
    // An unknown helper: arbitrary if its own definition reads an argument or the environment, unreadable otherwise.
    const def = code.match(new RegExp(`\\b(?:const|let|var|function)\\s+${call.name.replace(/[.$]/g, '\\$&')}\\b[^\\n]*`))
    return def && ARG_SOURCE.test(def[0]) ? { arg: true } : { opaque: true }
  }
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    // A `const` bound once in this file — followed. ⛔ A `let`/`var`, or more than one binding, can be reassigned: unreadable.
    const decls = [...code.matchAll(new RegExp(`\\b(const|let|var)\\s+${expr.replace(/\$/g, '\\$')}\\s*=`, 'g'))]
    if (decls.length === 1 && decls[0][1] === 'const') {
      const start = decls[0].index + decls[0][0].length
      const rest = code.slice(start).split('\n')[0]
      return readImportPath(splitTop(rest, ',')[0].replace(/;\s*$/, ''), file, code, depth + 1)
    }
    if (decls.length) return { opaque: true }
    // Imported by name from a relative module: read the binding THERE, in that module's own frame.
    const imp = code.match(new RegExp(`import\\s*\\{[^}]*\\b${expr.replace(/\$/g, '\\$')}\\b[^}]*\\}\\s*from\\s*['"](\\.[^'"]+)['"]`))
    if (imp) {
      const dep = relative(ROOT, resolve(dirname(here()), imp[1]))
      const src = onDisk(dep) ? readCheckSource(dep) : null
      if (src === null) return { opaque: true }
      const depCode = stripComments(src)
      const ex = depCode.match(new RegExp(`export\\s+const\\s+${expr.replace(/\$/g, '\\$')}\\s*=([^\\n]*)`))
      return ex ? readImportPath(ex[1].replace(/;\s*$/, ''), dep, depCode, depth + 1) : { opaque: true }
    }
  }
  return { opaque: true }
}

/** Every path this file's write calls can be read to target (the destination: 2nd argument of a copy or rename). */
function writtenPaths(code, file) {
  const out = new Set()
  for (const m of code.matchAll(/\b(writeFileSync|writeFile|appendFileSync|copyFileSync|cpSync|renameSync)\s*\(/g)) {
    const args = splitTop(balancedArg(code, m.index + m[0].length - 1) ?? '', ',')
    const r = readImportPath(args[/^(copyFileSync|cpSync|renameSync)$/.test(m[1]) ? 1 : 0] ?? '', file, code)
    for (const p of r.paths ?? []) out.add(p)
  }
  return out
}

/** The ruling, run on planted sources: a path of literals and repo-rooted bindings is read; an argument, the
 *  environment, a loop variable or a `let` keeps the file LIVE (the mutations). */
export function importSelfTest() {
  const root = "import { join, dirname } from 'node:path'\nimport { fileURLToPath, pathToFileURL } from 'node:url'\nconst ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')\n"
  const argFn = "const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)\n"
  const cases = [
    [root + "await import(join(ROOT, 'cartograph', 'x.mjs'))", 'safe'],
    [root + "await import(pathToFileURL(join(ROOT, 'cartograph/x.mjs')).href)", 'safe'],
    ["import { ROOT } from './_scenes.mjs'\nimport { join } from 'node:path'\nawait import(join(ROOT, 'cartograph/x.mjs'))", 'safe'],
    ["const MOD = '../cartograph/x.mjs'\nawait import(MOD)", 'safe'],
    ["console.log(`load it with import() behind a guard; import(s) of one town`)", 'safe'],
    [root + "await import(join(ROOT, 'cartograph/net.mjs'))", 'live'],                        // read, and what it reads reaches out
    ["const MOD = process.env.SRC || '../cartograph/x.mjs'\nawait import(MOD)", 'live'],       // the environment
    [root + argFn + "await import(pathToFileURL(arg('x') || join(ROOT, 'cartograph/x.mjs')).href)", 'live'], // an argument
    [root + "for (const n of names) await import(join(ROOT, 'src/instances', n))", 'live'],  // a loop variable
    ["let MOD = '../cartograph/x.mjs'\nawait import(MOD)", 'live'],                            // reassignable
    [root + "await import(join(ROOT, 'cartograph/x.mjs') + '?v=1')", 'live'],                 // not a path expression
    [root + "await import(join(ROOT, 'cartograph/missing.mjs'))", 'live'],                     // not on disk
    [root + "const k = /from '([^']+)'/g\nconst f = process.argv[2]\nawait import(f)", 'live'],  // a quote in a regex hides no call
    [root + "if (a) g(); else /'/.test(s)\nconst f = process.argv[2]\nawait import(f)", 'live'], // nor one the blanker mis-reads
    [root + "const f = join(ROOT, 'cartograph/x.mjs')\nwriteFileSync(f, src)\nawait import(f)", 'live'], // a module it writes itself
  ]
  const disk = {
    'checks/_scenes.mjs': "import { join, dirname } from 'node:path'\nimport { fileURLToPath } from 'node:url'\nexport const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')",
    'cartograph/x.mjs': 'export const x = 1',
    'cartograph/net.mjs': "export const x = await fetch('https://example.com')",
  }
  for (const [src, want] of cases) {
    const got = classifyVirtual({ ...disk, 'checks/claims-planted.mjs': src }, 'checks/claims-planted.mjs').tier
    if (got !== want) throw new Error(`[tier] ⛔ self-test: \`${src.split('\n').pop()}\` read as ${got}, want ${want} — the computed-import reader is broken`)
  }
}

/**
 * Every relative specifier a file imports, static or dynamic.
 * ⛔ A check that imports nothing itself is not thereby safe: importing a repo module RUNS that
 *    module's top level. So the scan follows relative imports all the way down. Bare package
 *    specifiers (`three`, `sharp`) cannot be resolved from source and are recorded as unread —
 *    the network-off run in `npm test` is what actually proves them, not this parse.
 */
function relativeImports(code, fromFile) {
  const out = []
  for (const m of code.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g)) {
    const spec = m[1]
    for (const cand of [spec, spec + '.js', spec + '.mjs']) {
      const p = resolve(ROOT, dirname(fromFile), cand)
      if (!p.endsWith('/') && onDisk(relative(ROOT, p))) { out.push(relative(ROOT, p)); break }
    }
  }
  return out
}

/**
 * Read a check's source, tolerating ONLY the one race this suite actually hits:
 * a file listed by `readdirSync` and gone before it is read — someone reverting a
 * commit, switching a branch, or landing a rename while the suite enumerates.
 *
 * ⛔⛔ THIS COST A BASELINE ON 2026-09-20. The read was unguarded, an agent reverted
 * two commits mid-enumeration, and `classifyAll` threw ENOENT before a SINGLE check
 * had run. A ten-minute suite died on a file that was never going to be executed —
 * and the run that was lost was the pre-rename baseline, i.e. exactly the run whose
 * absence makes a 297-substitution sweep unverifiable.
 *
 * ⛔ ENOENT ONLY. A permission error, a directory where a file should be, an I/O
 * fault — those are real and must still throw. Swallowing every error here would
 * turn a broken checkout into a silently smaller suite, which is the failure this
 * whole corpus exists to prevent (`CLAUDE.md` Layer 0 q2).
 */
function readCheckSource(file) {
  if (_virtual) return _virtual.get(file) ?? null
  try { return readFileSync(join(ROOT, file), 'utf8') }
  catch (err) { if (err.code === 'ENOENT') return null; throw err }
}

// The self-test's planted sources: classify reads these instead of the disk while it runs (classifyVirtual).
let _virtual = null
const onDisk = (rel) => (_virtual ? _virtual.has(rel) : existsSync(join(ROOT, rel)))
/** Classify `entry` against planted sources { relPath: source } — the same classify, reading nothing from disk. */
export function classifyVirtual(files, entry) {
  _virtual = new Map(Object.entries(files))
  try { return classify(entry) } finally { _virtual = null }
}

export function classify(file, seen = new Set(), depth = 0) {
  if (seen.has(file)) return { file, tier: 'safe', why: [] }
  seen.add(file)
  const src = readCheckSource(file)
  // Not runnable, and not classifiable. Tiered as `vanished` so it matches no run
  // tier and is excluded by the runner's own filter — reported by classifyAll, never
  // quietly dropped.
  if (src === null) return { file, tier: 'vanished', why: ['disappeared between enumeration and read'] }
  const shell = file.endsWith('.sh')
  const code = stripComments(src, shell)
  const why = []
  let tier = 'safe'
  const bump = (t) => { if (t === 'live' || (t === 'local-effect' && tier === 'safe')) tier = t }

  if (shell) {
    // A shell check has no module boundary to reason about: read the command lines directly.
    if (NET_CMD.test(code)) { tier = 'live'; why.push(`shell: runs ${(code.match(NET_CMD) || [])[0]}`) }
    for (const [re, label] of [[/>\s*\S|>>\s*\S/, 'redirects to a file'], [/\bmkdir\b|\brm\b|\bcp\b|\bmv\b|\btee\b/, 'writes/removes files']])
      if (re.test(code)) { bump('local-effect'); why.push(`shell: ${label}`) }
    if (tier === 'safe') { tier = 'live'; why.push('shell: cannot be shown not to reach out') }
    return { file, tier, why, reasonClass: tier === 'live' ? (NET_CMD.test(code) ? 'outbound' : 'unreadable') : undefined }
  }

  for (const [re, label] of SIGNALS.live) if (re.test(code)) { bump('live'); why.push(label) }
  for (const [re, label] of SIGNALS.write) if (re.test(code)) { bump('local-effect'); why.push(label) }

  // ⛔ A COMPUTED `import()` IS ARBITRARY MODULE EXECUTION — the same hazard as an unreadable
  //    exec, and the one that nearly shipped: `claims-doc-pointers-resolve.mjs --run` imports and
  //    RUNS every check the docs cite, live tier included. It scans as "reads repo files only".
  //    Three cases, and only the third is undecidable:
  //      data:   — a self-contained module, resolves to nothing on disk or the network (hermetic)
  //      a path built only of literals and repo-rooted bindings — READ IT (`readImportPath`), as a static import is read
  //      anything else — an argument, the environment, a loop variable — cannot be read ⇒ live
  //    `import()` written in a message is prose — but only when BOTH readers say it sits in a string: a mis-read
  //    literal would otherwise hide a real call, which mis-tiers toward safe (the forbidden direction).
  const blank = blankStrings(code)
  for (const m of code.matchAll(/\bimport\s*\(/g)) {
    if (blank.slice(m.index, m.index + 6) !== 'import' && inStringHere(code, m.index)) continue
    const arg = balancedArg(code, m.index + m[0].length - 1)?.trim()
    if (arg === '') continue                                                 // `import()` with nothing in it does not parse: not a call
    if (arg && /^['"`]/.test(arg) && !/[+`$]/.test(arg.slice(1))) continue  // a plain literal: handled elsewhere
    if (arg && /^['"`]data:/.test(arg)) { why.push('computed import of a data: module — hermetic'); continue }
    const r = arg ? readImportPath(arg, file, code) : { opaque: true }
    if (r.arg) { bump('live'); why.push('computed import() of a path an argument or the environment can supply — arbitrary'); continue }
    if (!r.paths) { bump('live'); why.push('computed import() with no readable target — runs arbitrary modules'); continue }
    for (const p of r.paths) {
      const hit = relative(ROOT, p)
      // ⛔ A module this file WRITES is made at run time: what is on disk now is a previous run's copy, not what runs.
      if (writtenPaths(code, file).has(p)) { bump('live'); why.push(`computed import of ${hit}, a module it writes itself — made at run time, cannot be read`); continue }
      if (hit.startsWith('..') || !onDisk(hit)) { bump('live'); why.push(`computed import of ${hit} — not a repo file, cannot be read`); continue }
      const sub = classify(hit, seen, depth + 1)
      if (sub.tier !== 'safe') { bump(sub.tier); why.push(`imports ${hit}, which can: ${sub.why.join(', ')}`) }
      else why.push(`computed import of ${hit} — read, safe`)
    }
  }

  const { cmds, selfRuns, opaque } = execCommands(code)
  for (const c of cmds) {
    if (NET_CMD.test(c)) { bump('live'); why.push(`runs \`${c.slice(0, 40)}\` — reaches out`) }
    else if (!LOCAL_CMD.test(c)) { bump('live'); why.push(`runs \`${c.slice(0, 40)}\` — not a known-local command`) }
    else why.push(`runs \`${c.slice(0, 30)}\` — local, read-only`)
  }
  if (selfRuns) why.push('re-runs its own file (process.execPath + its own path) — the same tier as itself')
  if (opaque) { bump('live'); why.push('child_process with a non-literal command — cannot be read') }

  // ⛔ Reading a hosted-service credential is only meaningful alongside a call. On its own it is a
  //    check READING config off disk, which is the safe case and the common one.
  if (tier === 'live' && /SUPABASE|TWILIO|SENDGRID|STRIPE|CHECKR/.test(code)) why.push('references a hosted-service credential')

  // Follow what it pulls in — an imported module's top level runs too.
  for (const dep of relativeImports(code, file)) {
    if (!onDisk(dep)) continue
    const sub = classify(dep, seen, depth + 1)
    if (sub.tier !== 'safe') { bump(sub.tier); why.push(`imports ${dep}, which can: ${sub.why.join(', ')}`) }
  }
  const bare = [...code.matchAll(/from\s*['"]([^.'"][^'"]*)['"]/g)].map(m => m[1]).filter(s2 => !s2.startsWith('node:') && !builtinModules.includes(s2))
  const pkgs = [...new Set(bare.filter(b => /^[@a-z]/.test(b) && !/\s/.test(b) && b.length < 40))]
  if (pkgs.length && depth === 0) why.push(`imports package(s) ${pkgs.join(', ')} — not read from source`)

  if (!why.length) why.push('reads repo files only')
  const outbound = /fetch\(|curl|WebSocket|XMLHttpRequest|Supabase\/DB client|network module|reaches out/.test(why.join(' '))
  return { file, tier, why, reasonClass: tier === 'live' ? (outbound ? 'outbound' : 'unreadable') : undefined }
}

/**
 * ⛔ A CHECK THAT CANNOT RUN WITHOUT AN ARGUMENT IS NOT A FINDING — IT IS MIS-WIRED.
 *
 * `run.mjs` spawns every check with NO arguments. A check that requires `--scene`, or that has
 * voided itself, is therefore red on every run forever: it reports nothing about the product,
 * only that it was put in a tier that cannot satisfy it. Measured 2026-09-13: 5 of 45 reds.
 *
 * ⛔ The answer is NOT to drop them from the run. A check excluded quietly makes the suite greener
 *    by looking at less, which is the vacuous-green failure this repo has now hit twice in one day.
 *    They are reported LOUDLY and counted, as wiring debt, every run — see `run.mjs`.
 *
 * ⛔⛔ AND IT MUST BE DECIDED FROM THE ACTUAL FAILURE, NEVER FROM THE SOURCE. `claims-browse-frame`
 *    contains the string "NO DEFAULT" and PASSES with no arguments. Marking it blocked from a static
 *    grep would have dropped a working check from the run — the very failure this comment warns
 *    about, committed by the guard against it. So: `blockedReason` is applied by `run.mjs` to the
 *    OUTPUT OF A CHECK THAT ACTUALLY FAILED, and to nothing else.
 */
const BLOCKED = [
  [/\bVOID probe\b/,            'declares itself a VOID probe and refuses to produce numbers'],
  [/Refusing to produce/,        'refuses to produce numbers'],
]
// ⭐ A REQUIRED ARGUMENT IS DECLARED, NOT INFERRED (Boz's ruling, 2026-10-12). A check that needs one says so in its
// header — `// @args --source=pour|bundle` (each value), `// @args --scene=<town>` (each town on the roster, so the
// check runs on every town, never on the one somebody typed), or `// @args --ribbons=<path>` (unbounded: no value
// to enumerate, so BLOCKED by declaration and not spawned). The runner runs a declared check once per value, each
// its own named row — every value, so no default is chosen. ⛔ A check that refuses for an argument it did NOT
// declare is RED: an undeclared requirement is a finding, never quietly blocked.
const ARGS_LINE = /^\s*(?:\/\/|\*)\s*@args\s+(--[\w-]+)=(\S+)/m
export function declaredArgs(src) {
  const m = src == null ? null : src.match(ARGS_LINE)
  if (!m) return null
  const [, flag, spec] = m
  if (spec === '<town>') return { flag, enumerate: 'town' }
  if (/^<.*>$/.test(spec)) return { flag, unbounded: spec }
  const values = spec.split('|').filter(Boolean)
  if (!values.length) throw new Error(`[tier] @args ${flag}=${spec}: no values`)
  return { flag, values }
}
/** The runs a check makes: one plain run, or one per declared value (`towns` is the roster, for `<town>`), or none
 *  (unbounded — BLOCKED by declaration). Each run carries `argv` and a `label` naming its value. */
export function runsFor(r, towns) {
  const a = r.args
  if (!a) return [{ ...r, argv: [], label: r.file }]
  if (a.unbounded) return []
  const values = a.enumerate === 'town' ? towns : a.values
  if (!values?.length) throw new Error(`[tier] ${r.file}: @args ${a.flag} has nothing to enumerate${a.enumerate ? ' (the town roster is empty)' : ''}`)
  return values.map(v => ({ ...r, argv: [`${a.flag}=${v}`], label: `${r.file} ${a.flag}=${v}` }))
}

export function blockedReason(file) {
  const src = readCheckSource(file)
  if (src === null) return 'the file disappeared while the suite was reading it'
  for (const [re, why] of BLOCKED) if (re.test(src)) return why
  return null
}

/**
 * WHICH BUCKET A FINISHED CHECK GOES IN — the one decision, used by `run.mjs` and self-tested here.
 * `out` is the check's whole output; `sourceBlocked` is `!!blockedReason(file)` (the source and the failure must both say so).
 *   green · timedOut (killed: measured nothing) · blocked (wiring debt) · notChecked (exit 2 AND said it did not
 *   measure) · red (the claim is false — the board).
 */
export const SAID_NOT_MEASURED = /NOT MEASURED|NOT CHECKED|not measured|nothing measured|nothing to check|could not run|Nothing was measured|Refusing to print/
const SELF_VOIDED = /VOID probe|Refusing to produce/
const ARG_REFUSAL = /NO DEFAULT|^\s*usage:/m
export function bucketOf({ code, timedOut, out }, sourceBlocked) {
  if (code === 0 && !timedOut) return 'green'
  if (timedOut) return 'timedOut'
  // ⛔ Refusals are judged BEFORE "not checked": an incidental census note printed ahead of a refusal must never
  //    launder it into "the data is absent" (the 2026-10-12 misfile). A self-voided probe is wiring debt (blocked);
  //    an argument refusal reaching here was NOT declared (a declared one is run per value), so it is a finding.
  if (sourceBlocked && SELF_VOIDED.test(out)) return 'blocked'
  if (ARG_REFUSAL.test(out)) return 'red'
  if (code === 2 && SAID_NOT_MEASURED.test(out)) return 'notChecked'
  return 'red'
}

/** The buckets, on the outputs that have been misfiled. Throws on a wrong bucket; run first in every classifyAll(). */
export function bucketSelfTest() {
  const cases = [
    // ⛔ The misfile of 2026-10-12: the town census's incidental note printed BEFORE the check refused its missing
    //    argument, so "data absent" won and a wiring refusal hid in NOT CHECKED.
    [{ code: 2, out: '   ⚠️ NOT CHECKED (no ribbons): kit-default\n⛔ LOUD FAIL — no --source given, and there is deliberately NO DEFAULT.' }, false, 'red'],
    [{ code: 2, out: '⛔ NOT CHECKED — x\n   usage: node checks/x.mjs --scene=<town>' }, false, 'red'],
    [{ code: 2, out: '⛔ NOT MEASURED — this pour carries no land evidence' }, false, 'notChecked'],
    [{ code: 2, out: '⛔ 3 failures' }, false, 'red'],                       // exit 2 that never SAID it did not measure
    [{ code: 1, out: '⛔ FAIL — NO DEFAULT in the prose of a finding' }, false, 'red'],   // a refusal word, but the source declares nothing
    [{ code: 1, out: '⛔ VOID probe — see the header. Refusing to produce numbers.' }, true, 'blocked'],
    [{ code: 0, out: '' }, false, 'green'],
    [{ code: 124, timedOut: true, out: 'NOT CHECKED' }, true, 'timedOut'],
  ]
  for (const [r, sb, want] of cases) {
    const got = bucketOf(r, sb)
    if (got !== want) throw new Error(`[tier] bucketSelfTest: ${JSON.stringify(r.out.slice(0, 60))} (exit ${r.code}${sb ? ', source declares a refusal' : ''}) → ${got}, wants ${want}`)
  }
  // The declaration and its runs.
  const towns = ['t1', 't2', 't3']
  const runs = (src) => runsFor({ file: 'checks/x.mjs', args: declaredArgs(src) }, towns).map(x => x.label)
  const expect = [
    ['// @args --source=pour|bundle', ['checks/x.mjs --source=pour', 'checks/x.mjs --source=bundle']],
    [' * @args --scene=<town>', towns.map(t => `checks/x.mjs --scene=${t}`)],   // every town on the roster, never one
    ['// @args --ribbons=<path>', []],                                          // unbounded: blocked by declaration
    ['// usage: --source=pour|bundle (prose, no @args)', ['checks/x.mjs']],
  ]
  for (const [src, w] of expect) {
    const got = runs(src)
    if (JSON.stringify(got) !== JSON.stringify(w)) throw new Error(`[tier] bucketSelfTest: ${JSON.stringify(src)} → ${JSON.stringify(got)}, wants ${JSON.stringify(w)}`)
  }
  let threw = false
  try { runsFor({ file: 'checks/x.mjs', args: declaredArgs('// @args --scene=<town>') }, []) } catch { threw = true }
  if (!threw) throw new Error('[tier] bucketSelfTest: an empty town roster expanded to no runs, silently — it must throw')
}

export function classifyAll() {
  execSelfTest()
  importSelfTest()
  bucketSelfTest()
  const files = []
  for (const d of DIRS) {
    if (!existsSync(join(ROOT, d))) continue
    for (const f of readdirSync(join(ROOT, d)).sort()) if (/^claims-.*\.(mjs|js|sh)$/.test(f)) files.push(`${d}/${f}`)
  }
  const classified = files.map(f => {
    const r = classify(f), args = declaredArgs(readCheckSource(f))
    if (!args) return r
    return { ...r, args, why: [...r.why, `declares @args ${args.flag}=${args.values ? args.values.join('|') : args.enumerate ? '<town>' : args.unbounded}`] }
  })
  // ⛔ LOUD, NEVER SILENT. A check that vanishes is excluded from the run because it
  // cannot be run — but a suite that quietly got smaller is worse than one that died,
  // and this is the only place that knows it happened.
  const gone = classified.filter(r => r.tier === 'vanished')
  if (gone.length) {
    console.error(`\n⚠️  ${gone.length} check(s) DISAPPEARED while the suite was enumerating —`)
    console.error(`    listed by the directory read, absent by the time they were opened.`)
    for (const r of gone) console.error(`      ${r.file}`)
    console.error(`    ⛔ They were NOT run and are NOT counted. If the tree was changing under this`)
    console.error(`       run (a revert, a branch switch, a rename landing), the result is not a`)
    console.error(`       baseline — re-run it against a still tree.\n`)
  }
  return classified.filter(r => r.tier !== 'vanished')
}

/** The claim each check falsifies, taken from its own header — ⛔ never typed into a doc. */
export function claimOf(file) {
  const src = readCheckSource(file)
  if (src === null) return null
  for (const line of src.split('\n').slice(0, 12)) {
    const t = line.replace(/^#!.*/, '').replace(/^\s*(\/\/|\*|#|\/\*\*?)\s?/, '').trim()
    if (!t || /^(import|const|set -|cd |@|⛔|▶)/.test(t)) continue
    return t.replace(/^claims-[a-z0-9-]+\s*[—–-]\s*/i, '').trim()
  }
  return ''
}

/** The generated index. ⛔ Never hand-edited — `npm run test:tiers` rewrites it from the sources. */
function writeIndex(all) {
  const by = (t) => all.filter(r => r.tier === t)
  const row = (r) => `| \`${r.file}\` | ${(claimOf(r.file) || '—').replace(/\|/g, '\\|').slice(0, 150)} |`
  const liveRow = (r) => `| \`${r.file}\` | ${r.reasonClass} | ${r.why.join(' · ').replace(/\|/g, '\\|')} |`
  const md = `# The check suite

⛔ **GENERATED — \`npm run test:tiers\`. Do not hand-edit; your edit is the next run's casualty.**

One check per bug-class, each stating a claim that can be **shown false**. The tier is **derived
from each script's source** (\`checks/tier.mjs\`), never from a list — so a check added tomorrow is
gated without anyone remembering to gate it, which is what makes this work on town #2.

| gesture | tier(s) | contacts |
|---|---|---|
| \`npm test\` | safe | nothing — enforced per-run by \`checks/_no-network.mjs\` |
| \`npm run test:all\` | safe + local-effect | nothing; ⛔ writes to disk, so not CI |
| \`npm run test:live\` | live | ⛔ **production.** Needs \`CHECKS_LIVE=i-mean-it\` |
| \`npm test -- --list\` | — | prints what would run |

A non-zero exit is a **finding for the board**, not a runner fault. The suite reports; it does not fix.

## ⛔ live — ${by('live').length}. Never in a default run.

Two reason classes, and they are not the same thing. **outbound** — a demonstrated call out.
**unreadable** — runs code the parser cannot read, so it *may* contact nothing but cannot be shown
to. Both are excluded, because "cannot be shown safe" is the only honest gate (\`CLAUDE.md\` Layer 0 q2).

⛔ \`scratch/claims-onboarding-guard.sh\` POSTs \`/auth/v1/signup\` at the live Supabase project **with no
teardown** — every invocation leaves another anonymous user behind. That is a recorded incident
(\`SECURITY.md\`, the 2026-08-31 audit disclosure), not a hypothetical.

| check | why | what it reaches |
|---|---|---|
${by('live').map(liveRow).join('\n')}

## local-effect — ${by('local-effect').length}. \`npm run test:all\`, never CI.

Writes into the repo or a scratch dir.

| check | the claim it falsifies |
|---|---|
${by('local-effect').map(row).join('\n')}

## safe — ${by('safe').length}. This is \`npm test\`.

| check | the claim it falsifies |
|---|---|
${by('safe').map(row).join('\n')}
`
  writeFileSync(join(ROOT, 'checks/README.md'), md)
}

if (process.argv[1] && process.argv[1].endsWith('tier.mjs')) {
  const all = classifyAll()
  const by = (t) => all.filter(r => r.tier === t)
  if (process.argv.includes('--json')) {
    const out = { generated_by: 'node checks/tier.mjs --json', total: all.length,
      counts: Object.fromEntries(['safe', 'local-effect', 'live'].map(t => [t, by(t).length])),
      checks: all.map(r => ({ file: r.file, tier: r.tier, ...(r.reasonClass ? { reasonClass: r.reasonClass } : {}), why: r.why })) }
    writeFileSync(join(ROOT, 'checks/TIERS.json'), JSON.stringify(out, null, 2) + '\n')
    writeIndex(all)
    console.log(`wrote checks/TIERS.json + checks/README.md — ${all.length} checks`)
  }
  for (const t of ['live', 'local-effect', 'safe']) {
    console.log(`\n${t.toUpperCase()} — ${by(t).length}`)
    for (const r of by(t)) console.log(`  ${r.file}${r.reasonClass ? `  [${r.reasonClass}]` : ''}\n      ${r.why.join(' · ')}`)
  }
  console.log(`\n${all.length} total · safe ${by('safe').length} · local-effect ${by('local-effect').length} · live ${by('live').length}`)
}
