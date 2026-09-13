#!/usr/bin/env node
/**
 * claims-the-slab-envs-do-not-collide — STAGING AND PRODUCTION MUST NOT SERVE THE SAME SLAB.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR (2026-09-03). Both workflows resolved the SAME
 * `vars.VITE_ASSET_BASE`, and the uploader wrote one un-prefixed key space. So a pour went
 * live on lafayette-square.com the instant it uploaded — no push, no gate, no preview, no
 * way back except re-baking a slab that might no longer exist. Code had a staging loop;
 * DATA had none, and nothing said so. (Jacob: "the bigger issue is there's no way to
 * preview it before it goes live.")
 *
 * ⭐ EVERY FACT BELOW IS READ OUT OF THE WORKFLOWS AND THE UPLOADER, never restated here,
 * so this cannot go green off a rule that has since moved. It is the same shape as
 * claims-the-publish-gate-pushes-where-staging-deploys — and that guard exists because the
 * publish branch drifted for four weeks with nobody noticing.
 *
 * ⛔ WHAT IT CANNOT SEE: the VALUES of the GitHub repo variables live in GitHub, not here.
 * This proves the two environments read DIFFERENT variables and write DIFFERENT prefixes.
 * It cannot prove VITE_ASSET_BASE_STAGING is set, or that it points at the staging prefix.
 * That is stated, not silently assumed — an instrument that implies coverage it lacks is
 * worse than no instrument.
 *
 *   node scratch/claims-the-slab-envs-do-not-collide.mjs
 *   exit 0 = the environments are separated · exit 2 = they collide
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
let failed = 0
const fail = (m) => { console.log(`  ⛔ ${m}`); failed++ }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('Staging and production must not serve the same slab\n')

// ① the two workflows must read DIFFERENT variables
const varOf = (yml) => (read(yml).match(/VITE_ASSET_BASE:\s*\$\{\{\s*vars\.([A-Z_]+)/) || [])[1] || null
const stagingVar = varOf('.github/workflows/staging.yml')
const prodVar = varOf('.github/workflows/deploy.yml')
if (!stagingVar || !prodVar) fail(`could not read VITE_ASSET_BASE out of both workflows (staging=${stagingVar}, prod=${prodVar})`)
else if (stagingVar === prodVar) fail(`both workflows read vars.${stagingVar} — staging serves PRODUCTION's slab, which is the whole defect`)
else ok(`staging reads vars.${stagingVar}, prod reads vars.${prodVar} — different variables`)

// ② staging must not FALL BACK to the production variable
const stagingLine = (read('.github/workflows/staging.yml').match(/^\s*VITE_ASSET_BASE:.*/m) || [''])[0]
// ⛔ WORD BOUNDARY, NOT SUBSTRING. `VITE_ASSET_BASE_STAGING` CONTAINS `VITE_ASSET_BASE`, so a
// naive .includes() reports the correct wiring as a collision — this check's own first run
// failed exactly that way. A guard that cries wolf on the fixed state gets switched off.
const usesProdVar = prodVar && new RegExp(`vars\\.${prodVar}(?![A-Z0-9_])`).test(stagingLine)
if (usesProdVar) {
  fail(`staging's VITE_ASSET_BASE falls back to vars.${prodVar} — an unset staging variable would `
    + `silently restore the bug while looking healthy. Let it break visibly instead.`)
} else ok('staging does not fall back to the production base')

// ③ the uploader must require an explicit env and give the two DIFFERENT prefixes
const up = read('scripts/upload-baked-to-r2.mjs')
const prefixes = (up.match(/const ENV_PREFIX = \{([^}]*)\}/) || [])[1]
if (!prefixes) fail('upload-baked-to-r2.mjs no longer declares ENV_PREFIX — this check is blind; re-anchor it')
else {
  const map = Object.fromEntries([...prefixes.matchAll(/(\w+):\s*'([^']*)'/g)].map(m => [m[1], m[2]]))
  if (map.prod === map.staging) fail(`ENV_PREFIX maps prod and staging to the same prefix "${map.prod}" — they collide`)
  else ok(`ENV_PREFIX separates them: prod="${map.prod || '(none)'}" staging="${map.staging}"`)
  if (map.prod !== '') fail(`prod prefix is "${map.prod}", not "" — that MOVES the objects the live site already reads`)
}
if (!/--env is REQUIRED and has no default/.test(up)) {
  fail('upload-baked-to-r2.mjs no longer refuses a missing --env — a default is how a slab reaches prod unasked')
} else ok('--env is required, with no default')

// ④ the bake may only ever write staging
// ⛔⛔ MATCH THE INVOCATION, NOT THE FILENAME (hardened 2026-09-04).
// This read `carto.match(/upload-baked-to-r2\.mjs[^`]*/)` — the FIRST textual occurrence
// anywhere in the file, comments included, stopping at a backtick. A comment added that
// day mentioning `scripts/upload-baked-to-r2.mjs` inside backticks matched first and
// truncated to the bare filename, so the check reported a COLLISION over a code change
// that was correct. ⭐ A guard that a passing comment can flip is worse than a loud one:
// the next person's fix is to reword the prose until it goes green, which disarms it.
// Anchor on `node scripts/…` — an actual command, which prose does not contain.
//
// ⭐ AND THE PREMISE MOVED: THERE ARE TWO INVOCATIONS NOW. Promotion ships the slab
// (2026-09-04), so `--env=prod` appearing in serve.js is no longer proof of a collision —
// it is required. What must hold is that each gesture uploads to ITS OWN environment: the
// BAKE may only ever write staging, and only the PROMOTE may write prod. Asserting "no
// prod anywhere" would now be false, and asserting only the first call would be blind to
// the second.
const carto = read('cartograph/serve.js')
const calls = [...carto.matchAll(/node scripts\/upload-baked-to-r2\.mjs[^`'"]*/g)]
if (!calls.length) fail('cartograph/serve.js no longer invokes the uploader — re-anchor this check')
else {
  const envOf = (s) => (s.match(/--env=(\w+)/) || [])[1] || null
  const bakeAt = carto.search(/POST \/looks\/[^\n]*\/bake\b|\/bake\$\//)
  const promoteAt = carto.search(/\/promote\$\//)
  const naked = calls.filter((c) => !envOf(c[0]))
  if (naked.length) fail(`${naked.length} uploader call(s) in serve.js pass no --env — a pour can reach production without a decision`)
  else {
    // Attribute each call to the handler it sits in, by position: the bake handler
    // precedes the promote handler in the file, so a call after `promoteAt` is the
    // promotion's and anything before it belongs to the bake.
    const bad = calls
      .map((c) => ({ env: envOf(c[0]), gesture: promoteAt > 0 && c.index > promoteAt ? 'promote' : 'bake' }))
      .filter((c) => (c.gesture === 'bake' ? c.env !== 'staging' : c.env !== 'prod'))
    if (bad.length) fail(`each gesture must upload to its own environment — found ${bad.map((b) => `${b.gesture}→--env=${b.env}`).join(', ')}`)
    else ok(`each gesture uploads to its own environment (${calls.length} call${calls.length === 1 ? '' : 's'}: bake→staging, promote→prod)`)
  }
  if (bakeAt < 0 || promoteAt < 0) fail('could not locate the bake/promote handlers — re-anchor this check before trusting it')
}

console.log()
if (failed) {
  console.log(`⛔ ${failed} collision(s). A pour can reach production without a decision.`)
  console.log('⚠️ NOT CHECKED (it lives in GitHub, not here): whether VITE_ASSET_BASE_STAGING is SET,')
  console.log('   and whether it points at the staging/ prefix. Verify that in repo settings.')
  process.exit(2)
}
console.log('✅ staging and production are separated in the wiring.')
console.log('⚠️ NOT CHECKED (it lives in GitHub, not here): whether VITE_ASSET_BASE_STAGING is SET,')
console.log('   and whether it points at the staging/ prefix. Verify that in repo settings.')
