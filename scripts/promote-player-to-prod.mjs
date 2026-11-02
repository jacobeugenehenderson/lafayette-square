#!/usr/bin/env node
/**
 * promote-player-to-prod.mjs — pin THE player that was checked on staging to one town's production.
 *
 *   node scripts/promote-player-to-prod.mjs --map=<map> --look=<look>
 *   node scripts/promote-player-to-prod.mjs --map=<map> --look=<look> --dry-run
 *   node scripts/promote-player-to-prod.mjs --map=<map> --card-only [--dry-run]   (the share card alone: sites/<map>/towns.json)
 *
 * ⭐⭐ WHICH PLAYER IS THE TOWN'S STAGING RECORD (BRIEF-ls-onto-the-ward Phase 2): the one the
 * staging Worker serves it by, `staging/sites/<map>/player.json` (`scripts/set-staging-player.mjs`), read through
 * src/lib/stagingPlayer.js. ⛔ No record, or anything but "ward" (the retired "legacy" player included), refuses by name
 * before a byte moves — never a default player. The last line of stdout is the JSON Promote writes the host record from.
 *
 *   ward → the Ward build `staging/ward/current.json` names → `ward/<sha>/`, and the kit bundle
 *          that build pins → `kit/<kit>/` — each verified against its own sha256 list (the Ward's
 *          `build.json`, the bundle's `manifest.json`), the list written LAST.
 *          ⛔⛔ WRITE-ONCE. These keys are per COMMIT, shared by every town that pins that commit.
 *          A key already in production is verified against the list and skipped, NEVER
 *          overwritten; a mismatch refuses by name. That is what makes "promoting one town changes
 *          no other town's bytes" true rather than probable. ⛔ And nothing may delete a
 *          `ward/<sha>/` or `kit/<sha>/` that any `hosts/*.json` still names.
 *          The town's share card (its own record, `staging/sites/<map>/towns.json`, written by its Publish) is pinned at
 *          `sites/<map>/towns.json` (src/lib/townsRecordKeys.js).
 *
 * ⭐⭐ COPY, NOT REBUILD (Jacob, 2026-09-26). Production gets the exact bytes that staging served, each checked before
 * it is written. ⛔ A rebuild here would ship a player nobody had looked at.
 *
 * The legacy kit player (`staging/player/` → `player/<map>/`) was retired 2026-11-01. Caller: `cartograph/serve.js`
 * POST /looks/<id>/promote. ⛔ Like its siblings, it holds no list of towns.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { typeFor } from '../src/lib/slabWire.js'
import { freshUrl } from '../src/lib/freshUrl.js'
import { stagingTownsKey, townsKey } from '../src/lib/townsRecordKeys.js'
import { stagingPlayerOf } from '../src/lib/stagingPlayer.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const CONC = Number(process.env.SITE_UPLOAD_CONC) || 8
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || null
const map = arg('map'), look = arg('look')
const dryRun = process.argv.includes('--dry-run')
// ⭐ --card-only: pin this town's share card and NOTHING else (no player, no host record): a card or icon fix never waits on a
// Ward release (Boz, 2026-11-01). Needs --map only.
const cardOnly = process.argv.includes('--card-only')
const MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const SHA = /^[0-9a-f]{40}$/
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// The content type: src/lib/slabWire.js. ⛔ A player file is copied as its bytes, never encoded — it is not slab.
// Same rule as the staging publish: hashed assets are immutable, HTML never cached.
const cacheOf = (rel) => /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\./.test(rel) ? 'public, max-age=31536000, immutable'
  : rel.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'

// Connections to the asset host are refused, reset or time out intermittently (measured 2026-09-27, from a plain
// shell: one in several runs died on its first GET). Those, and only those, are retried. An HTTP status is an answer
// and is never retried; nor is a byte mismatch (checked by the caller).
const TRANSIENT = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'])
const TRIES = 5

async function getBytes(key, { missingOk = false } = {}) {
  for (let i = 1; ; i++) {
    let r
    try {
      r = await fetch(freshUrl(PUBLIC_BASE + key))
      if (missingOk && r.status === 404) return null
      if (!r.ok) throw new Error(`${key} → HTTP ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    } catch (e) {
      const code = e.cause?.code
      if (r?.ok === false || !TRANSIENT.has(code)) throw e
      if (i === TRIES) throw new Error(`${PUBLIC_BASE + key}: ${code} on all ${TRIES} tries — the asset host would not connect`)
      await new Promise((ok) => setTimeout(ok, 500 * 2 ** (i - 1)))
    }
  }
}

function putBytes(key, buf, rel, cache = cacheOf(rel)) {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--pipe', '--remote',
      '--content-type', typeFor(rel), '--cache-control', cache], { cwd: REPO_ROOT })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`put ${key} exited ${code}: ${err.trim()}`)))
    p.stdin.end(buf)
  })
}
async function put(key, buf, rel, cache) {
  let last
  for (let i = 0; i < 3; i++) {
    try { return await putBytes(key, buf, rel, cache) } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)) }
  }
  throw new Error(`put failed after 3 attempts: ${key}\n${last?.message}`)
}

/**
 * ⭐ THE TOWN'S SHARE CARD, verified and pinned: the ONE path both a full Ward promote and `--card-only` take (Boz,
 * 2026-11-01). The town's own staging record (src/lib/townsRecordKeys.js#stagingTownsKey, written by its Publish), which
 * must parse and carry this town. ⛔ No record, no promote. A single object put is whole or absent, so no list guards it
 * (Zob, 2026-11-01); the all-towns record and its list were retired with the legacy player.
 */
async function verifiedTownsRecord() {
  const key = stagingTownsKey(map)
  const townsBuf = await getBytes(key, { missingOk: true })
  if (!townsBuf) throw new Error(`no ${key} — "${map}"'s share card has not been published. Publish the town to staging, then promote.`)
  let rec
  try { rec = JSON.parse(townsBuf) } catch { throw new Error(`${key} is not JSON — Publish the town to staging again, then promote.`) }
  if (!rec?.[map]) throw new Error(`${key} has no entry for "${map}" — its card would be absent. Publish the town to staging again.`)
  return townsBuf
}
const pinTownsRecord = (townsBuf) => put(townsKey(map), townsBuf, 'towns.json', 'no-cache')

/**
 * The Ward build staging serves, and the kit bundle it pins, → production, write-once (header).
 * ⛔ Every byte copied is checked against its list; every byte already there is checked and kept.
 */
async function promoteWard() {
  const cur = JSON.parse(await getBytes('staging/ward/current.json', { missingOk: true }) || 'null')
  if (!cur) throw new Error('"ward" is this town\'s staging player, but the Ward is not published to staging (no staging/ward/current.json).')
  if (!SHA.test(cur.sha || '') || !SHA.test(cur.kit || '')) throw new Error(`staging/ward/current.json must name "sha" and "kit" commits; it says ${JSON.stringify(cur)}`)

  const buildBuf = await getBytes(`staging/ward/${cur.sha}/build.json`)
  const build = JSON.parse(buildBuf)
  if (build.ward !== cur.sha || build.kit !== cur.kit) {
    throw new Error(`staging/ward/${cur.sha}/build.json says Ward ${build.ward} on kit ${build.kit}, not current.json's ${cur.sha} on ${cur.kit} — a publish is mid-flight. Promote again.`)
  }
  const kitBuf = await getBytes(`staging/kit/${cur.kit}/manifest.json`, { missingOk: true })
  if (!kitBuf) throw new Error(`the kit bundle for ${cur.kit} is not on staging (no staging/kit/${cur.kit}/manifest.json). ▶ node scripts/publish-kit-bundle.mjs --sha=${cur.kit}`)
  const kitMan = JSON.parse(kitBuf)
  if (kitMan.kit !== cur.kit) throw new Error(`staging/kit/${cur.kit}/manifest.json names kit ${kitMan.kit}`)
  const WARD_CACHE = (rel) => (rel === 'index.html' || rel === 'build.json') ? 'no-cache' : 'public, max-age=31536000, immutable'
  const KIT_CACHE = () => 'public, max-age=31536000, immutable'
  const sets = [
    { from: `staging/ward/${cur.sha}/`, to: `ward/${cur.sha}/`, files: build.files || {}, list: ['build.json', buildBuf], cache: WARD_CACHE },
    { from: `staging/kit/${cur.kit}/`, to: `kit/${cur.kit}/`, files: kitMan.files || {}, list: ['manifest.json', kitBuf], cache: KIT_CACHE },
  ]
  const townsBuf = await verifiedTownsRecord()

  // ── Plan: what each key needs. ⛔ Existing bytes are READ and compared, never assumed.
  const toCopy = [], problems = []
  let kept = 0
  for (const set of sets) {
    const entries = Object.entries(set.files).map(([rel, want]) => ({ rel, want }))
    const queue = [...entries]
    await Promise.all(Array.from({ length: 16 }, async () => {
      for (let f = queue.pop(); f; f = queue.pop()) {
        const have = await getBytes(set.to + f.rel, { missingOk: true })
        if (!have) { toCopy.push({ set, ...f }); continue }
        if (sha256(have) === f.want) { kept++; continue }
        problems.push(`${set.to}${f.rel} is already in production with different bytes — it is write-once; nothing was changed`)
      }
    }))
    const listHave = await getBytes(set.to + set.list[0], { missingOk: true })
    if (listHave && sha256(listHave) !== sha256(set.list[1])) problems.push(`${set.to}${set.list[0]} is already in production and differs from staging's — write-once; nothing was changed`)
    set.listPresent = !!listHave
  }
  if (problems.length) throw new Error(`the Ward build or kit bundle cannot be pinned:\n  ${problems.join('\n  ')}`)
  console.log(`ward     ${cur.sha} on kit ${cur.kit} → ${BUCKET}/ward/${cur.sha}/ + kit/${cur.kit}/`)
  console.log(`copy     ${toCopy.length} files (${kept} already in production, verified)`)
  if (dryRun) { console.log('\n--dry-run: nothing copied.'); console.log(JSON.stringify({ ok: true, dryRun: true, map, look, player: 'ward', ward: cur.sha, kit: cur.kit, builtAt: build.builtAt ?? null, copied: 0 })); return }

  // ── Copy, each byte checked against its list before it is written.
  const work = [...toCopy]
  await Promise.all(Array.from({ length: CONC }, async () => {
    for (let f = work.pop(); f; f = work.pop()) {
      const buf = await getBytes(f.set.from + f.rel)
      if (sha256(buf) !== f.want) throw new Error(`${f.set.from}${f.rel} does not match its list — staging changed under this promote. Nothing is switched; promote again.`)
      await put(f.set.to + f.rel, buf, f.rel, f.set.cache(f.rel))
    }
  }))
  // The lists LAST: they say "this commit is complete in production".
  for (const set of sets) if (!set.listPresent) await put(set.to + set.list[0], set.list[1], set.list[0], set.cache(set.list[0]))
  await pinTownsRecord(townsBuf)

  console.log(`\n✅ Ward ${cur.sha.slice(0, 12)} + kit ${cur.kit.slice(0, 12)} pinned for ${map}`)
  console.log(JSON.stringify({ ok: true, map, look, player: 'ward', ward: cur.sha, kit: cur.kit, builtAt: build.builtAt ?? null, copied: toCopy.length }))
}

;(async () => {
  if (cardOnly) {
    if (!MAP_ID.test(map || '')) throw new Error('--card-only needs --map=<map>')
    const townsBuf = await verifiedTownsRecord()
    console.log(`card     ${stagingTownsKey(map)} verified for "${map}" → ${BUCKET}/${townsKey(map)}`)
    if (dryRun) { console.log('\n--dry-run: nothing copied.'); console.log(JSON.stringify({ ok: true, dryRun: true, map, cardOnly: true, copied: 0 })); return }
    await pinTownsRecord(townsBuf)
    console.log(JSON.stringify({ ok: true, map, cardOnly: true, copied: 1 }))
    return
  }
  if (!MAP_ID.test(map || '') || !MAP_ID.test(look || '')) throw new Error('--map=<map> and --look=<look> are both required')

  // ── 0. WHICH player — the town's staging record, and nothing else: src/lib/stagingPlayer.js, the same answer Preview's
  // status and the staging Worker give. ⛔ No record, a record naming the retired `legacy` player, no Ward, no bundle:
  // each refuses by name before a byte moves.
  const io = {
    json: async (key) => { const b = await getBytes(key, { missingOk: true }); if (!b) return null; try { return JSON.parse(b) } catch { return {} } },
    exists: async (key) => !!(await getBytes(key, { missingOk: true })),
  }
  const p = await stagingPlayerOf(map, io)
  if (!p.current) throw new Error(`${p.why} Check it on staging, then promote.`)
  return promoteWard()
})().catch((e) => { console.error('\n⛔ promote-player FAILED:', e.message, e.cause?.code ? `(${e.cause.code})` : ''); process.exit(1) })
