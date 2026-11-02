#!/usr/bin/env node
/**
 * publish-towns-record.mjs — put ONE town's share-card record (title, description, icon) on staging.
 *
 *   node scripts/publish-towns-record.mjs --map=<map> [--dry-run]
 *
 * → R2 `staging/sites/<map>/towns.json` (src/lib/townsRecordKeys.js#stagingTownsKey): `{ [map]: { … } }`, one entry. The
 * staging Worker reads it; Promote verifies it carries the town and pins it at `sites/<map>/towns.json` for production.
 * ⭐ Run by the town's Publish (cartograph/serve.js POST /looks/<id>/publish), AFTER its slab is proven in the bucket, so a
 * card never describes a slab that is not there (Zob, 2026-11-01). One button: a card change ships with the town's Publish.
 * ⭐ Built by scripts/towns-record.mjs#townRecordOf from the town's instance and its OWN baked Look: another town's stale
 * bake never reads into, refuses or rewrites it (Boz's ruling C). A stale bake of THIS town refuses, by name.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { townRecordOf } from './towns-record.mjs'
import { stagingTownsKey } from '../src/lib/townsRecordKeys.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const dryRun = process.argv.includes('--dry-run')
const argMap = (process.argv.find((a) => a.startsWith('--map=')) || '').slice(6) || null

function putOnce(key, buf) {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--pipe', '--remote',
      '--content-type', 'application/json; charset=utf-8', '--cache-control', 'no-cache'], { cwd: REPO_ROOT })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`put ${key} exited ${code}: ${err.trim()}`)))
    p.stdin.end(buf)
  })
}
async function put(key, buf) {
  let last
  for (let i = 0; i < 3; i++) {
    try { return await putOnce(key, buf) } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)) }
  }
  throw new Error(`put failed after 3 attempts: ${key}\n${last?.message}`)   // ⛔ fatal, by key: the list is never written
}

/** Build and publish one town's record; → the record. */
export async function publishTownRecord(map, { repoRoot = REPO_ROOT, dry = dryRun, log = console.log } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(map || '')) throw new Error('--map=<map> is required: a town publishes its own card')
  const rec = townRecordOf(repoRoot, map)
  log(`icon     ${map.padEnd(18)} ${rec[map].iconFrom}`)
  const buf = Buffer.from(JSON.stringify(rec, null, 2))
  if (dry) { log(`towns    --dry-run: ${stagingTownsKey(map)} not written (${buf.length} bytes)`); return rec }
  await put(stagingTownsKey(map), buf)
  log(`towns    ${stagingTownsKey(map)}`)
  return rec
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  publishTownRecord(argMap).catch((e) => { console.error(`⛔ publish-towns-record: ${e.message}`); process.exit(1) })
}
