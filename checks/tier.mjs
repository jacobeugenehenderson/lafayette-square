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
 * (`claims-the-slab-freshness-key-is-not-stale.mjs:8` is exactly that, and grep calls it live).
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

/** Pull out every string literal handed to a child_process call, so the command can be read. */
function execCommands(code) {
  const cmds = []
  for (const m of code.matchAll(/\b(execSync|execFileSync|exec|execFile|spawnSync|spawn)\s*\(\s*(['"`])([\s\S]*?)\2/g)) cmds.push(m[3])
  // a child_process call whose command is not a literal cannot be read at all
  const calls = [...code.matchAll(/\b(execSync|execFileSync|exec|execFile|spawnSync|spawn)\s*\(/g)].length
  return { cmds, opaque: calls > cmds.length }
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
      if (existsSync(p) && !p.endsWith('/')) { out.push(relative(ROOT, p)); break }
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
  try { return readFileSync(join(ROOT, file), 'utf8') }
  catch (err) { if (err.code === 'ENOENT') return null; throw err }
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
  //      a repo path literal inside the expression — READ IT, exactly as a static import is read
  //      neither — cannot be read ⇒ live
  for (const m of code.matchAll(/\bimport\s*\(([^)]*)\)/g)) {
    const arg = m[1].trim()
    if (/^['"`]/.test(arg) && !/[+`$]/.test(arg.slice(1))) continue          // a plain literal: handled elsewhere
    if (/^['"`]data:/.test(arg)) { why.push('computed import of a data: module — hermetic'); continue }
    // The path literal is often bound to a const above (`const TG = join(ROOT, 'src/lib/tileGround.js')`).
    // Follow the binding — that is still reading the source, not guessing at it.
    let expr = arg
    const ident = arg.match(/^[A-Za-z_$][\w$]*$/)
    if (ident) {
      const b = code.match(new RegExp(`\\b(?:const|let|var)\\s+${arg}\\s*=([^\n]*)`))
      if (b) expr = b[1]
    }
    const lits = [...expr.matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]).filter(x => /\.(m?js|ts)$/.test(x))
    const hit = lits.map(l => l.replace(/^\.?\//, '')).find(l => existsSync(join(ROOT, l)))
    if (hit) {
      const sub = classify(hit, seen, depth + 1)
      if (sub.tier !== 'safe') { bump(sub.tier); why.push(`imports ${hit}, which can: ${sub.why.join(', ')}`) }
      else why.push(`computed import of ${hit} — read, safe`)
    } else { bump('live'); why.push('computed import() with no readable target — runs arbitrary modules') }
  }

  const { cmds, opaque } = execCommands(code)
  for (const c of cmds) {
    if (NET_CMD.test(c)) { bump('live'); why.push(`runs \`${c.slice(0, 40)}\` — reaches out`) }
    else if (!LOCAL_CMD.test(c)) { bump('live'); why.push(`runs \`${c.slice(0, 40)}\` — not a known-local command`) }
    else why.push(`runs \`${c.slice(0, 30)}\` — local, read-only`)
  }
  if (opaque) { bump('live'); why.push('child_process with a non-literal command — cannot be read') }

  // ⛔ Reading a hosted-service credential is only meaningful alongside a call. On its own it is a
  //    check READING config off disk, which is the safe case and the common one.
  if (tier === 'live' && /SUPABASE|TWILIO|SENDGRID|STRIPE|CHECKR/.test(code)) why.push('references a hosted-service credential')

  // Follow what it pulls in — an imported module's top level runs too.
  for (const dep of relativeImports(code, file)) {
    if (!existsSync(join(ROOT, dep))) continue
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
  [/\bNO DEFAULT\b/,            'declares NO DEFAULT — requires an explicit --scene'],
  [/\bVOID probe\b/,            'declares itself a VOID probe and refuses to produce numbers'],
  [/Refusing to produce/,        'refuses to produce numbers'],
  [/^\s*usage:/m,                'prints a usage line — takes a required argument'],
]

export function blockedReason(file) {
  const src = readCheckSource(file)
  if (src === null) return 'the file disappeared while the suite was reading it'
  for (const [re, why] of BLOCKED) if (re.test(src)) return why
  return null
}

export function classifyAll() {
  const files = []
  for (const d of DIRS) {
    if (!existsSync(join(ROOT, d))) continue
    for (const f of readdirSync(join(ROOT, d)).sort()) if (/^claims-.*\.(mjs|js|sh)$/.test(f)) files.push(`${d}/${f}`)
  }
  const classified = files.map(f => classify(f))
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
