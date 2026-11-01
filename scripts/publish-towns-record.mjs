#!/usr/bin/env node
/**
 * publish-towns-record.mjs — put the towns record (every town's share card: title, description, icon) on staging.
 *
 *   node scripts/publish-towns-record.mjs [--dry-run]
 *
 * → R2 `staging/towns.json`, then `staging/towns.list.json` ({ sha256, bytes, builtAt }) LAST, so a list never names a record
 * the bucket does not hold (src/lib/townsRecordKeys.js). The staging Worker reads the record; Promote verifies it against the
 * list and pins a town's copy at `sites/<map>/towns.json`, which the production Worker reads.
 * ⭐ Built by scripts/towns-record.mjs#buildTownsRecord from the instance registry and each town's BAKED Look. ⛔ It holds no
 * list of towns, and a stale bake refuses there, by name.
 * ⭐ Its own publish (Boz, Zob, 2026-11-01): the record was written beside the legacy kit player, which is retired.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildTownsRecord } from './towns-record.mjs'
import { STAGING_TOWNS, STAGING_TOWNS_LIST } from '../src/lib/townsRecordKeys.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const dryRun = process.argv.includes('--dry-run')

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

/** Build and publish; → { towns, list }. Exported so the player publish runs this same step while it lives. */
export async function publishTownsRecord({ repoRoot = REPO_ROOT, dry = dryRun, log = console.log } = {}) {
  const towns = await buildTownsRecord(repoRoot)
  for (const [m, t] of Object.entries(towns)) log(`icon     ${m.padEnd(18)} ${t.iconFrom}`)
  const buf = Buffer.from(JSON.stringify(towns, null, 2))
  const list = { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length, builtAt: new Date().toISOString() }
  if (dry) { log(`towns    --dry-run: ${STAGING_TOWNS} not written (${Object.keys(towns).length} towns, ${buf.length} bytes)`); return { towns, list } }
  await put(STAGING_TOWNS, buf)
  await put(STAGING_TOWNS_LIST, Buffer.from(JSON.stringify(list)))
  log(`towns    ${STAGING_TOWNS} · ${Object.keys(towns).join(', ')} · sha256 ${list.sha256.slice(0, 12)}`)
  return { towns, list }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  publishTownsRecord().catch((e) => { console.error(`⛔ publish-towns-record: ${e.message}`); process.exit(1) })
}
