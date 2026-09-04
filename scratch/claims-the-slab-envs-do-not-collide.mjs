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
const carto = read('cartograph/serve.js')
const call = (carto.match(/upload-baked-to-r2\.mjs[^`]*/) || [''])[0]
if (!call) fail('cartograph/serve.js no longer invokes the uploader — re-anchor this check')
else if (!call.includes('--env=staging')) fail(`the bake invokes the uploader as "${call.trim()}" — it must pass --env=staging; promotion is a separate gesture`)
else ok('the Cartograph bake uploads to staging only')

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
