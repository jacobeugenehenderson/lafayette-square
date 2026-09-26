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
 * ⛔⛔ STAGING NO LONGER GOES THROUGH A BRANCH AT ALL (2026-09-21). Ruled: one site per
 * Map at `staging.theward.online/<map>/`, served by `workers/staging-sites` out of R2, and
 * the Publish button uploads there directly instead of pushing a trunk that rebuilt ONE
 * GitHub Pages site for every town. `staging.yml` is retired.
 * ⭐ SO THE CHECK KEPT ITS JOB AND CHANGED ITS SUBJECT. The defect it was written for —
 * a publish path that reports success and reaches nothing — is exactly what reintroducing
 * the branch push would recreate, so the STAGING half is now the inverse assertion: the
 * publish endpoint must NOT push to a staging branch. The PROD half is unchanged and still
 * derived from the workflow that actually runs.
 * ⛔⛔ AND NEITHER DOES PRODUCTION (2026-09-26, BRIEF-production-sites). Promote used to push
 * the branch to `main`, which deployed ONE site for every town. It now pins each town's player
 * and switches that town's host record in R2. So the PROD half is the same inverse assertion:
 * no endpoint in `serve.js` runs `git push` at all. The `main` → `deploy.yml` path survives only
 * for Lafayette Square's legacy site, and nothing in the panel reaches it.
 *
 *   node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

const serve = read('cartograph/serve.js')
// Executable lines only: the endpoints' own comments NAME the retired pushes, on purpose.
const code = serve.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')

let failed = 0
console.log('The publish gate must not push a branch — both targets upload to R2\n')
{
  const pushesStaging = /git push origin \$\{branch\}:\$\{STAGING_BRANCH\}/.test(code)
  if (pushesStaging) {
    failed++
    console.error("  ⛔ staging  cartograph/serve.js still pushes a STAGING BRANCH. Staging is now a direct")
    console.error("             upload to R2 (staging.theward.online/<map>/, workers/staging-sites); a branch")
    console.error("             push rebuilds ONE site for every town, which is the defect the per-Map ruling")
    console.error("             removed — and with `staging.yml` retired it now reaches nothing at all.")
  } else {
    console.log("  ✅ staging  no branch push — publish uploads to R2 directly (staging.theward.online/<map>/)")
  }
}
{
  const pushes = code.match(/git push[^`'"]*/g) || []
  if (pushes.length) {
    failed++
    console.error(`  ⛔ prod     cartograph/serve.js runs \`${pushes[0]}\`. Production is per-town now`)
    console.error("             (workers/production-sites, hosts/<domain>.json); a branch push ships ONE site")
    console.error("             for every town and, on 2026-09-26, 648 commits of unreviewed trunk to main.")
  } else {
    console.log("  ✅ prod     no branch push — promote pins the town's player and switches its host record")
  }
}
process.exit(failed ? 2 : 0)
