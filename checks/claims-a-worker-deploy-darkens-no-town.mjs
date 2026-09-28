#!/usr/bin/env node
/**
 * "WOULD DEPLOYING THIS WORKER TAKE A LIVE TOWN DARK?"
 *
 * WHY (2026-09-28, Warden). Both Workers decide a town is live by HEADing its `manifest.json`
 * (9f4966ee, `claims-a-town-is-live-by-its-manifest`). A town published before it had a manifest
 * has `scene.json` in R2 and no `manifest.json`: the Worker in the repo 404s it; the one deployed
 * today serves it. Deploying first darkens it, and nothing else would say so.
 *
 * For each env, for every registered town the Worker SERVES, its `manifest.json` must answer. Served:
 * staging — the town's slab is published there (`scene.json` answers); production — the town also has a
 * pinned player (`player/<map>/index.html`, written by Promote), because the production Worker serves only
 * promoted towns (legacy prod keys read by lafayette-square.com's Pages site are not its concern). Names every town that would go dark. Read-only HEADs through the
 * public bucket origin.
 *
 * ⭐ IT RUNS BEFORE EVERY `wrangler deploy` of either Worker (each wrangler.jsonc's build.command), so
 * the deploy itself refuses. ▶ The cure is the order in PUBLISH.md §0.5: (a) publish every town with
 * its manifest, THEN (b) deploy.
 *
 * Usage: node checks/claims-a-worker-deploy-darkens-no-town.mjs [--env=staging|prod]   (default: both)
 */
import { registeredMaps } from '../src/instances/registry.js'

const BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const ENVS = { staging: 'staging/', prod: '' }
const want = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1]
if (want && !(want in ENVS)) { console.error(`⛔ --env=${want}: staging | prod`); process.exit(2) }

const head = async (key) => {
  for (let i = 0; i < 3; i++) {
    try { return (await fetch(BASE + key, { method: 'HEAD', cache: 'no-store' })).status } catch { /* retry */ }
  }
  return 'unreachable'
}

let dark = 0, uncertain = 0
for (const env of want ? [want] : Object.keys(ENVS)) {
  const pre = ENVS[env]
  for (const town of registeredMaps()) {
    const [scene, manifest, player] = await Promise.all([head(`${pre}baked/${town}/scene.json`), head(`${pre}baked/${town}/manifest.json`),
      env === 'prod' ? head(`player/${town}/index.html`) : 200])
    if (scene === 'unreachable' || manifest === 'unreachable' || player === 'unreachable') { uncertain++; console.error(`  ⛔ ${env.padEnd(8)}${town.padEnd(26)} could not be read — refusing to say it is safe`); continue }
    if ((scene !== 200 && manifest !== 200) || player !== 200) continue  // not served by this env's Worker
    if (manifest === 200) { console.log(`  ✅ ${env.padEnd(8)}${town.padEnd(26)} manifest.json present`); continue }
    dark++
    console.error(`  ⛔ ${env.padEnd(8)}${town.padEnd(26)} published (scene.json ${scene}) with NO manifest.json — this Worker would 404 it`)
  }
}
if (dark || uncertain) {
  console.error(`\n⛔ ${dark} town(s) would go dark${uncertain ? `, ${uncertain} unreadable` : ''}. Publish each with its manifest first `
    + '(node cartograph/bake-manifest.mjs --town=<t>, then upload), then deploy. PUBLISH.md §0.5.')
  process.exit(1)
}
console.log('\n✅ every published town has its manifest.json — deploying the Workers darkens none')
