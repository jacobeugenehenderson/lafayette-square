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
 * ⭐ EVERY FACT BELOW IS READ OUT OF THE TWO WORKERS, deploy.yml AND THE UPLOADER, never restated here,
 * so this cannot go green off a rule that has since moved. It is the same shape as
 * claims-the-publish-gate-pushes-where-staging-deploys — and that guard exists because the
 * publish branch drifted for four weeks with nobody noticing.
 *
 * ⛔ WHAT IT CANNOT SEE: what is DEPLOYED. It reads each Worker's wrangler.jsonc and src, not the Workers
 * running on Cloudflare, and vars.VITE_ASSET_BASE's value lives in GitHub. That is stated, not silently
 * assumed — an instrument that implies coverage it lacks is worse than no instrument.
 *
 *   node checks/claims-the-slab-envs-do-not-collide.mjs
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

// ①② WHERE EACH ENVIRONMENT IS TOLD ITS SLAB LIVES. Until 2026-09-21 that was two workflows' VITE_ASSET_BASE;
// `staging.yml` was retired (883dbfbc) when staging became a button. The published player is now built with
// `VITE_ASSET_BASE=runtime` and reads `<meta name="ward-asset-base">` from the site serving it (src/lib/bakedUrl.js):
// the staging-sites Worker stamps `SLAB_BASE`, a town's production-sites Worker stamps its own origin and reads
// `baked/<look>` from R2. lafayette-square.com is still deploy.yml's build. Each side is read from its source, and
// the prefixes from the uploader's ENV_PREFIX, so a moved prefix moves the expectation with it.
const ENV = Object.fromEntries([...((read('scripts/upload-baked-to-r2.mjs').match(/const ENV_PREFIX = \{([^}]*)\}/) || [])[1] || '')
  .matchAll(/(\w+):\s*'([^']*)'/g)].map(m => [m[1], m[2]]))
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** Staging: the Worker's SLAB_BASE ends in the staging prefix, and the Worker refuses one that does not. */
function stagingSide(wrangler, worker, stagingPrefix) {
  const out = []
  const base = (wrangler.match(/"SLAB_BASE":\s*"([^"]*)"/) || [])[1]
  if (!base) out.push('workers/staging-sites/wrangler.jsonc declares no SLAB_BASE — a staged player has no slab address')
  else if (!stagingPrefix || !base.endsWith(`/${stagingPrefix}`)) out.push(`staging's SLAB_BASE "${base}" does not end in the uploader's staging prefix "${stagingPrefix}" — a staged town reads another environment's slab`)
  if (!stagingPrefix || !new RegExp(esc(`/${stagingPrefix}$`)).test(code(worker).match(/if \(!(\/[^\n]*?\/)\.test\(env\.SLAB_BASE/)?.[1].replace(/\\\//g, '/').slice(1, -1) || ''))
    out.push('workers/staging-sites/src/index.js no longer refuses a SLAB_BASE outside the staging prefix')
  return out
}
/** Production: a town's Worker names its own origin and reads the slab at the prod prefix; the LS build reads no staging variable. */
function prodSide(worker, deployYml, prodPrefix) {
  const out = []
  const c = code(worker)
  if (!/<meta name="ward-asset-base" content="\$\{esc\(url\.origin\)\}\/"/.test(c)) out.push('production-sites no longer stamps its own origin as ward-asset-base')
  const slab = (c.match(/const slab = `([^`$]*)baked\//) || [])
  if (!slab.length) out.push('production-sites: cannot find the slab key (`const slab = `…baked/``) — re-anchor this check')
  else if (slab[1] !== prodPrefix) out.push(`production-sites reads its slab under "${slab[1]}baked/", not the prod prefix "${prodPrefix}baked/"`)
  if (ENV.staging && (c.includes(`'${ENV.staging}`) || c.includes(`\`${ENV.staging}`))) out.push(`production-sites names the staging prefix "${ENV.staging}" in code`)
  const v = (deployYml.match(/VITE_ASSET_BASE:\s*\$\{\{\s*vars\.([A-Z_]+)/) || [])[1]
  if (!v) out.push('deploy.yml no longer reads VITE_ASSET_BASE from a repo variable — re-anchor this check')
  else if (/STAGING/.test(v)) out.push(`deploy.yml (lafayette-square.com) reads vars.${v} — production serving the staging slab`)
  return out
}

const W = { sw: read('workers/staging-sites/wrangler.jsonc'), si: read('workers/staging-sites/src/index.js'),
  pi: read('workers/production-sites/src/index.js'), dy: read('.github/workflows/deploy.yml') }
const sOut = stagingSide(W.sw, W.si, ENV.staging), pOut = prodSide(W.pi, W.dy, ENV.prod ?? null)
for (const m of [...sOut, ...pOut]) fail(m)
if (!sOut.length) ok(`staging's Worker tells the page its slab is under "${ENV.staging}", and refuses any other`)
if (!pOut.length) ok(`production's Worker serves its own origin's "${ENV.prod}baked/", and deploy.yml reads no staging variable`)
// ⭐ MUTATIONS, every run: each must fail.
for (const [what, out] of [
  ['staging SLAB_BASE pointed at the prod prefix', stagingSide(W.sw.replace(/("SLAB_BASE":\s*"[^"]*?)staging\/"/, '$1"'), W.si, ENV.staging)],
  ['the staging Worker\'s refusal removed', stagingSide(W.sw, W.si.replace(/if \(!\/[^\n]*?\/\.test\(env\.SLAB_BASE/, 'if (!/x/.test(""'), ENV.staging)],
  ['production reading the staging slab', prodSide(W.pi.replace(/const slab = `baked\//, `const slab = \`${ENV.staging}baked/`), W.dy, ENV.prod ?? null)],
]) { if (out.length) console.log(`  mutation (${what}) caught ✓`); else fail(`MUTATION NOT CAUGHT: ${what}`) }

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

const NOT_CHECKED = '⚠️ NOT CHECKED: the DEPLOYED Workers\' vars (this reads wrangler.jsonc) and vars.VITE_ASSET_BASE\'s value (GitHub).'
console.log()
if (failed) {
  console.log(`⛔ ${failed} collision(s). A pour can reach production without a decision.`)
  console.log(NOT_CHECKED)
  process.exit(2)
}
console.log('✅ staging and production are separated in the wiring.')
console.log(NOT_CHECKED)
