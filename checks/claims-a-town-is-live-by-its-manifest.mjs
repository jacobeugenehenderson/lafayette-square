#!/usr/bin/env node
/**
 * "DOES EACH WORKER DECIDE A TOWN IS LIVE BY THE ONE FILE WHOSE NAME NEVER CHANGES?"
 *
 * WHY (BRIEF-slab-loading §3 step 3, 2026-09-28). Both Workers answer 404 for a town with no
 * published slab, and they asked by HEADing `scene.json`. Under content names `scene.json` is
 * served as `scene.<sha16>.json`, and once the retirement sweep removes the plain keys the probe
 * would 404 a live town. The one file published at a fixed name is `manifest.json` — the switch
 * (`src/lib/slabNames.js#manifestPath`). So the probe HEADs that.
 *
 * Asserts, reading each Worker's source: the key passed to `env.ASSETS.head(…)` in the live test
 * is `<prefix>baked/<town>/manifest.json`, and no Worker HEADs `scene.json` anywhere.
 * ⚠️ DEPLOY ORDER: a Worker built from this code 404s every town published before its first
 * content-named upload that has no manifest.json in R2 — deploy it only after every town it serves
 * has one. That is Jacob's go, not this check's.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-a-town-is-live-by-its-manifest.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const WORKERS = {
  'workers/production-sites/src/index.js': /^baked\/\$\{rec\.look\}\/manifest\.json$/,
  'workers/staging-sites/src/index.js': /^staging\/baked\/\$\{map\}\/manifest\.json$/,
}

/** The template literal the live probe HEADs, or null. */
export function probeKey(src) {
  const m = src.match(/const\s+(\w+)\s*=\s*`([^`]+)`\s*\n\s*if\s*\(!\(await\s+env\.ASSETS\.head\(\1\)\)\)/)
  return m ? m[2] : null
}

const fails = []
const fixture = "const slab = `baked/${rec.look}/scene.json`\n    if (!(await env.ASSETS.head(slab))) {"
if (probeKey(fixture) !== 'baked/${rec.look}/scene.json') { console.error('⛔ SELF-TEST — probeKey cannot read the probe'); process.exit(2) }

for (const [file, want] of Object.entries(WORKERS)) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const key = probeKey(src)
  if (!key) fails.push(`${file}: no live probe (\`const k = \`…\`; if (!(await env.ASSETS.head(k))))\`) found`)
  else if (!want.test(key)) fails.push(`${file}: the live probe HEADs \`${key}\` — it must be the town's manifest.json`)
  if (/head\([^)]*scene\.json/.test(src) || /`[^`]*\/scene\.json`/.test(src)) fails.push(`${file}: still names scene.json`)
}

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ both Workers decide a town is live by its manifest.json')
