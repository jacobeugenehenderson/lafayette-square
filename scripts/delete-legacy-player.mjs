#!/usr/bin/env node
/**
 * delete-legacy-player.mjs — remove the retired legacy kit player's objects from the bucket. JACOB'S PRESS, LAST in the
 * LS bleed (b)'s order: after both Workers are deployed and a verification read shows every town served by the Ward.
 *
 *   node scripts/delete-legacy-player.mjs            (DRY RUN: lists what it would delete, per prefix, and deletes nothing)
 *   node scripts/delete-legacy-player.mjs --yes      (deletes)
 *
 * What it deletes, and nothing else:
 *   · staging/player/**          — the legacy player staging served at /_player/ (public, LS's files among them);
 *   · player/<map>/**            — a town's pinned legacy copy in production, for each <map> whose host record no longer
 *                                  names it (every town plays the Ward), listed from the bucket, never a table;
 *   · staging/towns.json, staging/towns.list.json — the all-towns share-card record, retired for the per-town one.
 * ⛔ It refuses to run when the census fails (scripts/legacy-player-census.mjs): any host or staging record still naming
 * the legacy player keeps everything. ⛔ It never touches ward/<sha>/ or kit/<sha>/ (promote-player-to-prod: nothing may
 * delete a build a hosts record names), baked/, sites/, hosts/ or staging/ward|kit|sites|baked/.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { r2, REPO_ROOT } from './_r2api.mjs'

const yes = process.argv.includes('--yes')
const SINGLES = ['staging/towns.json', 'staging/towns.list.json']

;(async () => {
  const census = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/legacy-player-census.mjs')], { stdio: 'inherit' })
  if (census.status !== 0) throw new Error('the census did not pass (above): a record still names the legacy player, or it could not be read. Nothing deleted.')
  const b = await r2()
  const staged = await b.list('staging/player/')
  const pinned = (await b.list('player/')).filter((k) => /^player\/[^/]+\//.test(k))
  const singles = []
  for (const k of SINGLES) if ((await b.list(k)).includes(k)) singles.push(k)
  const byPrefix = {}
  for (const k of [...staged, ...pinned]) { const p = k.split('/').slice(0, 2).join('/') + '/'; byPrefix[p] = (byPrefix[p] || 0) + 1 }
  console.log('\nwould delete:')
  for (const [p, n] of Object.entries(byPrefix)) console.log(`  ${p.padEnd(32)} ${n} object(s)`)
  for (const k of singles) console.log(`  ${k}`)
  const all = [...staged, ...pinned, ...singles]
  if (!yes) { console.log(`\n--dry-run (the default): ${all.length} object(s), nothing deleted. ▶ add --yes to delete.`); return }
  let done = 0
  for (const k of all) { await b.remove(k); if (++done % 50 === 0) console.log(`  ${done}/${all.length}`) }
  console.log(`\n✅ deleted ${done} object(s)`)
})().catch((e) => { console.error(`⛔ delete-legacy-player: ${e.message}`); process.exit(1) })
