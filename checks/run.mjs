#!/usr/bin/env node
/**
 * THE CHECK SUITE RUNNER — `npm test`.
 *
 * ⛔ THE TIER IS DERIVED AT RUN TIME, NOT READ FROM `TIERS.json`.
 *    `TIERS.json` is a generated artifact for humans and for diffing; if the runner trusted it, a
 *    stale manifest could admit a `live` check into the default run, which is the exact incident
 *    this suite exists to prevent (`claims-onboarding-guard.sh` signing up anonymous users on the
 *    production Supabase project, no teardown — `SECURITY.md`, 2026-08-31). A manifest cannot go
 *    stale if nothing depends on it.
 *
 * ▶ npm test                  — the `safe` tier. Contacts nothing, writes nothing.
 * ▶ CHECKS_TIMEOUT_MS=900000 npm test   — per-check kill deadline (default 600s).
 * ▶ CHECKS_JOBS=1 npm test              — run serially (default: one per CPU for the safe tier).
 * ▶ npm run test:all          — `safe` + `local-effect`. Writes to disk; ⛔ not for CI.
 * ▶ npm run test:live         — the `live` tier. ⛔ HITS PRODUCTION. Requires CHECKS_LIVE=i-mean-it.
 * ▶ npm test -- --list        — print what would run, run nothing.
 *
 * EXIT CODES A CHECK MAY USE — the corpus's own convention, now honoured:
 *   0  the claim held.
 *   2  COULD NOT MEASURE (the data is absent). Must also SAY so in its output — code alone is not
 *      trusted, because one check exits 2 on a real failure and laundering that into "not checked"
 *      would be the silent substitution this suite exists to refuse.
 *   1 (or anything else)  the claim is false. A FINDING, not a runner bug.
 * The suite reports; it does not fix.
 */
import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { classifyAll, claimOf, blockedReason, ROOT } from './tier.mjs'

/**
 * ⭐ ACCEPTANCE IS ENFORCED, NOT ASSERTED. Every check in a default run is spawned with the network
 *    guard preloaded, so "npm test contacts nothing" is a property of the runner rather than a
 *    thing someone once checked by eye — which is precisely the confidence that produced the
 *    anonymous-user incident. ⛔ The `live` tier runs WITHOUT it, by definition.
 */
const GUARD = fileURLToPath(new URL('./_no-network.mjs', import.meta.url))

const argv = process.argv.slice(2)
const want = argv.includes('--live') ? 'live' : argv.includes('--all') ? 'all' : 'safe'
const LIST = argv.includes('--list')

const all = classifyAll()
const tiers = want === 'all' ? ['safe', 'local-effect'] : [want]
const run = all.filter(r => tiers.includes(r.tier))

if (want === 'live' && process.env.CHECKS_LIVE !== 'i-mean-it') {
  console.error('⛔ The `live` tier reaches production. Each of these contacts something real:\n')
  for (const r of run) console.error(`   ${r.file}\n       ${r.why.join(' · ')}`)
  console.error('\n⛔ `claims-onboarding-guard.sh` POSTs /auth/v1/signup with NO TEARDOWN — every run')
  console.error('   leaves another anonymous user on the live project (SECURITY.md, 2026-08-31).')
  console.error('\n   Re-run with CHECKS_LIVE=i-mean-it if that is genuinely what you want.')
  process.exit(2)
}

console.log(`${run.length} check(s) in tier(s): ${tiers.join(' + ')}   ` +
  `[corpus ${all.length} · safe ${all.filter(r => r.tier === 'safe').length} · ` +
  `local-effect ${all.filter(r => r.tier === 'local-effect').length} · ` +
  `live ${all.filter(r => r.tier === 'live').length} — excluded from this run]`)

if (LIST) { for (const r of run) console.log(`  ${r.file}  — ${claimOf(r.file) || '(no header claim)'}`); process.exit(0) }

const TIMEOUT_MS = Number(process.env.CHECKS_TIMEOUT_MS || 600_000)
const t0 = Date.now()

// ⭐⭐ PARALLEL, AND THE TIER IS WHAT MAKES IT SAFE. `safe` means "no network, no writes" — that is
//    not a description, it is what `tier.mjs` verifies per run, so these processes cannot interfere
//    with each other or with the tree. The suite is embarrassingly parallel for free.
//    ⛔ `--all` includes `local-effect`, which DOES write; those run one at a time.
//    Why it matters: checks used to default to one town. They now run every town that has the data,
//    and towns differ by an order of magnitude — Altadena is 694 tiles to LS's 101, so a check that
//    took 4s takes 31s. Serially the suite went from ~8 minutes to over an hour, and an hour-long
//    check suite is one nobody runs. Coverage was never the thing to give back.
const JOBS = Math.max(1, Number(process.env.CHECKS_JOBS || (want === 'safe' ? cpus().length : 1)))

const runOne = (r) => new Promise((resolve) => {
  const sh = r.file.endsWith('.sh')
  const guard = want === 'live' ? [] : ['--import', GUARD]
  const child = sh
    ? spawn('bash', [r.file], { cwd: ROOT })
    : spawn(process.execPath, [...guard, r.file], { cwd: ROOT })
  let out = ''
  child.stdout.on('data', d => { out += d })
  child.stderr.on('data', d => { out += d })
  const kill = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, TIMEOUT_MS)
  let timedOut = false
  child.on('close', (code) => {
    clearTimeout(kill)
    // ⛔ A TIMEOUT IS "NOT CHECKED", NOT "FAILED". A killed check measured nothing; filing it as a
    //    failure invents a result, and filing it as a pass would be worse (Layer 0 q2).
    process.stdout.write(timedOut ? 'T' : code === 0 ? '.' : 'F')
    resolve({ ...r, code: timedOut ? 124 : code, timedOut, out })
  })
})

console.log(`   (${JOBS} in parallel)`)
const results = []
const queue = [...run]
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) results.push(await runOne(queue.shift()))
}))

console.log(`\n\n${'─'.repeat(72)}`)

// ⛔ A check that FAILED because it was spawned without an argument it requires is not a finding
//    about the product — it is wiring debt in this suite. Decided from the failure, never from a
//    grep of the source (see tier.mjs): a check is only "blocked" if it actually failed AND says so.
//    ⛔ Never hidden: counted and printed every run, because a suite that gets greener by looking at
//    less is the failure mode this repo has hit twice today.
const failed   = results.filter(r => r.code !== 0)
// ⛔ THREE KINDS OF NON-ZERO, AND THEY MAY NOT SHARE A BUCKET.
//    timedOut — killed by the runner. Measured NOTHING: neither a pass nor a finding.
//    blocked  — cannot run without an argument, and says so. Wiring debt, not a product finding.
//    red      — the check ran and the claim is false. THIS is the board.
// ⭐⭐ "COULD NOT MEASURE" IS NOT A FAILURE, AND THE CORPUS ALREADY SAID SO — 88 checks call
//    `process.exit(2)` and the sites read "NOT MEASURED", "nothing to check", "could not run";
//    `claims-onboarding-guard.sh` documents it outright: "Exit 2 = could not run." The runner was
//    filing every one of them as RED. That is what made a fresh clone read 36/126 green with 89
//    red: `public/baked/` is gitignored, so most checks had no artifact and said so, and the
//    runner reported their honesty as failure.
//    ⛔ THE EXIT CODE ALONE IS NOT ENOUGH. At least one check (claims-cards-light-from-the-scene-key)
//    exits 2 on a REAL failure, so trusting the number would silently launder a finding into
//    "not checked" — the exact substitution this suite exists to refuse. So it is code AND
//    evidence, the same shape as `blocked`: the check must SAY it did not measure. One that exits
//    2 without saying so stays RED, which is the safe direction.
const SAID_NOT_MEASURED = /NOT MEASURED|NOT CHECKED|not measured|nothing measured|nothing to check|could not run|Nothing was measured|Refusing to print/
const notChecked = failed.filter(r => !r.timedOut && r.code === 2 && SAID_NOT_MEASURED.test(r.out))
const timedOutR = failed.filter(r => r.timedOut)
const blocked   = failed.filter(r => !r.timedOut && !notChecked.includes(r) && blockedReason(r.file) && /NO DEFAULT|VOID probe|Refusing to produce|usage:/.test(r.out))
const red       = failed.filter(r => !r.timedOut && !notChecked.includes(r) && !blocked.includes(r))
for (const r of red) {
  console.log(`\n⛔ ${r.file}  → exit ${r.code}`)
  console.log(`   claim: ${claimOf(r.file) || '(no header claim)'}`)
  console.log(r.out.trim().split('\n').slice(-14).map(l => `   │ ${l}`).join('\n'))
}
console.log(`\n${'─'.repeat(72)}`)
console.log(`${results.length - failed.length}/${results.length} green · ${red.length} red · ${notChecked.length} not checked · ` +
  `${blocked.length} blocked · ${timedOutR.length} timed out · ${((Date.now() - t0) / 1000).toFixed(0)}s`)
if (notChecked.length) {
  // ⛔ PRINTED EVERY RUN, NEVER FOLDED INTO THE GREEN COUNT. The number that matters in CI is not
  //    "did it pass" but "how much did it actually check", and this is that number.
  console.log(`\n⚠️ ${notChecked.length} NOT CHECKED — the data they measure is absent, and they said so.`)
  console.log(`   Not a pass and not a finding. In CI this is usually \`public/baked/\` (gitignored).`)
  for (const r of notChecked) console.log(`   ${r.file}`)
}
if (timedOutR.length) {
  console.log(`\n⚠️ ${timedOutR.length} NOT CHECKED — killed at ${TIMEOUT_MS / 1000}s. These measured NOTHING;`)
  console.log(`   they are neither a pass nor a finding. Raise CHECKS_TIMEOUT_MS, or make them cheaper:`)
  for (const r of timedOutR) console.log(`   ${r.file}`)
}
if (blocked.length) {
  console.log(`\n⛔ ${blocked.length} BLOCKED — these cannot run in a no-argument tier and say so themselves.`)
  console.log(`   They report NOTHING about the product. This is wiring debt, not a green light:`)
  for (const r of blocked) console.log(`   ${r.file} — ${blockedReason(r.file)}`)
}
if (red.length) {
  console.log(`\n⛔ ${red.length} RED. Each is a FINDING for the board, not a runner fault:`)
  for (const r of red) console.log(`   ${r.file} (exit ${r.code})`)
}
// ⛔ A timeout fails the run too — "we could not check" must never exit 0.
// ⛔ `notChecked` does NOT fail the run — that is the whole point — but it is never silent:
//    the summary line states it and the list is printed above, so a run that checked almost
//    nothing cannot read as a run that checked everything.
process.exit(red.length || blocked.length || timedOutR.length ? 1 : 0)
