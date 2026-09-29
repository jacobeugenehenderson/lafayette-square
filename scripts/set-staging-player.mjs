#!/usr/bin/env node
/**
 * set-staging-player.mjs — say which player a town's staging site serves.
 *
 *   node scripts/set-staging-player.mjs --map=<map> --player=ward|legacy [--dry-run]
 *
 * Writes `staging/sites/<map>/player.json` = `{ player, setAt }`, the record the staging Worker
 * (`workers/staging-sites/src/index.js`) reads for every request under `/<map>/`. ⛔ A town with no
 * record is a 404 that names it — there is no default player, so this is the one way a town gets one.
 *
 * It refuses, by name:
 *   · a map with no staging slab (`staging/baked/<map>/manifest.json`) — nothing to serve;
 *   · a player that is not `ward` or `legacy`;
 *   · `ward` while the Ward is not servable: no `staging/ward/current.json`, no document for the build
 *     it names, or no kit bundle (`staging/kit/<kit>/manifest.json`) for the kit that build pins.
 *     The Worker refuses those too; refusing here means the switch never points a town at a 404.
 *
 * ⛔ One town per run, and no list of towns: Jacob's go is per town (Ward OPERATIONS, "Publishing to
 * staging"). A sweep, if one is ever wanted, enumerates `public/looks/index.json` as `checks/_scenes.mjs` does.
 * Reads go through the public asset host; the write is `wrangler r2 object put --remote`.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const PLAYERS = ['ward', 'legacy']
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const dryRun = process.argv.includes('--dry-run')
const fail = (why) => { console.error(`⛔ set-staging-player: ${why}`); process.exit(1) }

const map = arg('map')
const player = arg('player')
if (!map || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(map)) fail(`--map=<map> is required and must be a map id; got ${JSON.stringify(map)}`)
if (!PLAYERS.includes(player)) fail(`--player must be one of ${PLAYERS.join(' | ')}; got ${JSON.stringify(player)}`)

async function read(key) {
  let last
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(PUBLIC_BASE + key, { cache: 'no-store' })
      if (r.status === 404) return null
      if (r.ok) return await r.text()
      last = `HTTP ${r.status}`
    } catch (e) { last = e.message }
  }
  fail(`could not read ${PUBLIC_BASE}${key} (${last}) — refusing to decide without it`)
}

const recordKey = `staging/sites/${map}/player.json`
const slabKey = `staging/baked/${map}/manifest.json`
if ((await read(slabKey)) === null) fail(`"${map}" has no staging slab (nothing at ${slabKey}). Bake it and Publish to Staging first.`)

if (player === 'ward') {
  const cur = await read('staging/ward/current.json')
  if (cur === null) fail('the Ward is not published to staging (no staging/ward/current.json). ▶ theward: npm run publish:staging')
  let c; try { c = JSON.parse(cur) } catch { fail(`staging/ward/current.json is not JSON: ${cur.slice(0, 120)}`) }
  const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)
  if (!isSha(c.sha) || !isSha(c.kit)) fail(`staging/ward/current.json must name "sha" and "kit" commits; it says ${cur}`)
  if ((await read(`staging/ward/${c.sha}/index.html`)) === null) fail(`the Ward build ${c.sha} has no index.html`)
  if ((await read(`staging/kit/${c.kit}/manifest.json`)) === null) {
    fail(`the kit bundle for ${c.kit} (the kit the Ward build ${c.sha.slice(0, 12)} pins) is not published. ▶ node scripts/publish-kit-bundle.mjs --sha=${c.kit}`)
  }
  console.log(`ward     build ${c.sha.slice(0, 12)} · kit ${c.kit.slice(0, 12)} · bundle present`)
}

const before = await read(recordKey)
const record = JSON.stringify({ player, setAt: new Date().toISOString() })
console.log(`record   ${BUCKET}/${recordKey}`)
console.log(`  was    ${before ?? '(none — the town 404s today)'}`)
console.log(`  now    ${record}`)
if (dryRun) { console.log('dry run: nothing written'); process.exit(0) }

const dir = mkdtempSync(join(tmpdir(), 'staging-player-'))
try {
  const file = join(dir, 'player.json')
  writeFileSync(file, record)
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${recordKey}`, '--file', file, '--remote',
    '--content-type', 'application/json; charset=utf-8', '--cache-control', 'no-cache'], { stdio: ['ignore', 'ignore', 'inherit'] })
} finally { rmSync(dir, { recursive: true, force: true }) }

// A write the host doesn't read back is not done.
const after = await read(recordKey)
if (after === null || JSON.parse(after).player !== player) fail(`wrote ${recordKey}, but the asset host answers ${after ?? '404'}`)
console.log(`✅ "${map}"'s staging record says ${player} (written and read back). The staging Worker serves it by this record `
  + `once it is deployed with the switch — ▶ curl -s https://staging.theward.online/${map}/ | grep -E 'ward-build|ward-kit-base'`)
