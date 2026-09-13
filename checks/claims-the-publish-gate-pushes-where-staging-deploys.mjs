/**
 * THE PUBLISH GATE MUST PUSH WHERE THE DEPLOY ACTUALLY LISTENS.
 *
 * ⛔ THE DEFECT (found 2026-08-28). Preview's Publish panel pushed `HEAD:curb-offset-draw`
 * — a branch whose last commit was 2026-08-02 and which NO workflow deploys. Staging had
 * moved to `land-use-derivation` weeks earlier. The button ran, the push succeeded, the
 * panel reported success, and staging never changed. ⭐ A silent no-op at the publish
 * gate is the worst place for one: the operator's whole verdict surface says "shipped".
 *
 * ⭐ WHY IT IS A CHECK AND NOT A COMMENT. Both halves are DERIVED from source — the
 * constants out of `cartograph/serve.js`, the branch out of the GitHub workflow that
 * actually runs — so the pair cannot drift again without this failing. `deploy-branch-topology`
 * has warned twice that the trunk moves and must never be quoted from memory; this is that
 * warning made executable.
 *
 *   node scratch/claims-the-publish-gate-pushes-where-staging-deploys.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

const serve = read('cartograph/serve.js')
const grab = (name) => {
  const m = serve.match(new RegExp(`const ${name} = '([^']+)'`))
  if (!m) { console.error(`⛔ PIN DRIFT — cartograph/serve.js no longer declares ${name}. Update this check.`); process.exit(2) }
  return m[1]
}
const STAGING = grab('STAGING_BRANCH')
const PROD = grab('PROD_BRANCH')

// What each workflow actually deploys from.
const wfDir = 'github-workflows-placeholder'
const deploysFrom = {}
for (const f of readdirSync(path.join(ROOT, '.github/workflows'))) {
  if (!/\.ya?ml$/.test(f)) continue
  const y = read(path.join('.github/workflows', f))
  const name = (y.match(/^name:\s*(.+)$/m) || [, f])[1].trim()
  const br = y.match(/branches:\s*\[([^\]]+)\]/)
  if (br) deploysFrom[f] = { name, branches: br[1].split(',').map(s => s.trim().replace(/['"]/g, '')) }
}
void wfDir

let failed = 0
console.log('The publish gate must push where the deploy listens\n')
for (const [role, branch] of [['staging', STAGING], ['prod', PROD]]) {
  const hit = Object.entries(deploysFrom).find(([, w]) => w.branches.includes(branch))
  if (hit) {
    console.log(`  ✅ ${role.padEnd(8)} serve.js pushes to '${branch}' → deployed by ${hit[0]} ("${hit[1].name}")`)
  } else {
    failed++
    console.error(`  ⛔ ${role.padEnd(8)} serve.js pushes to '${branch}' — NO workflow deploys that branch.`)
    console.error(`       A publish will report success and change nothing. Workflows deploy from:`)
    for (const [f, w] of Object.entries(deploysFrom)) console.error(`         ${f}: ${w.branches.join(', ')}`)
  }
}
process.exit(failed ? 2 : 0)
