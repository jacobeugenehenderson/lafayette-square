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
 * ▶ npm run test:all          — `safe` + `local-effect`. Writes to disk; ⛔ not for CI.
 * ▶ npm run test:live         — the `live` tier. ⛔ HITS PRODUCTION. Requires CHECKS_LIVE=i-mean-it.
 * ▶ npm test -- --list        — print what would run, run nothing.
 *
 * A non-zero exit from a check is a FINDING, not a runner bug. The suite reports; it does not fix.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { classifyAll, claimOf, ROOT } from './tier.mjs'

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

const t0 = Date.now()
const results = []
for (const r of run) {
  const sh = r.file.endsWith('.sh')
  const guard = want === 'live' ? [] : ['--import', GUARD]
  const p = sh
    ? spawnSync('bash', [r.file], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 })
    : spawnSync(process.execPath, [...guard, r.file], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 })
  const code = p.status === null ? 124 : p.status          // 124 = timed out / killed
  results.push({ ...r, code, out: (p.stdout || '') + (p.stderr || '') })
  process.stdout.write(code === 0 ? '.' : 'F')
}
console.log(`\n\n${'─'.repeat(72)}`)

const red = results.filter(r => r.code !== 0)
for (const r of red) {
  console.log(`\n⛔ ${r.file}  → exit ${r.code}`)
  console.log(`   claim: ${claimOf(r.file) || '(no header claim)'}`)
  console.log(r.out.trim().split('\n').slice(-14).map(l => `   │ ${l}`).join('\n'))
}
console.log(`\n${'─'.repeat(72)}`)
console.log(`${results.length - red.length}/${results.length} green · ${((Date.now() - t0) / 1000).toFixed(0)}s`)
if (red.length) {
  console.log(`\n⛔ ${red.length} RED. Each is a FINDING for the board, not a runner fault:`)
  for (const r of red) console.log(`   ${r.file} (exit ${r.code})`)
}
process.exit(red.length ? 1 : 0)
