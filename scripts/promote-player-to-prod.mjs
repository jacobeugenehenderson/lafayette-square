#!/usr/bin/env node
/**
 * promote-player-to-prod.mjs — pin THE player that was checked on staging to one town's production.
 *
 *   node scripts/promote-player-to-prod.mjs --map=<map> --look=<look>
 *   node scripts/promote-player-to-prod.mjs --map=<map> --look=<look> --dry-run
 *
 * ⭐⭐ WHICH PLAYER IS THE TOWN'S STAGING RECORD (BRIEF-ls-onto-the-ward Phase 2): the one the
 * staging Worker serves it by, `staging/sites/<map>/player.json` (`scripts/set-staging-player.mjs`).
 * ⛔ No record, or anything but "ward" | "legacy", refuses by name before a byte moves — never a
 * default player. The last line of stdout is the JSON Promote writes the host record from.
 *
 *   legacy → the kit's player, below: `staging/player/` → `player/<map>/`.
 *   ward   → the Ward build `staging/ward/current.json` names → `ward/<sha>/`, and the kit bundle
 *            that build pins → `kit/<kit>/` — each verified against its own sha256 list (the Ward's
 *            `build.json`, the bundle's `manifest.json`), the list written LAST.
 *            ⛔⛔ WRITE-ONCE. These keys are per COMMIT, shared by every town that pins that commit.
 *            A key already in production is verified against the list and skipped, NEVER
 *            overwritten; a mismatch refuses by name. That is what makes "promoting one town changes
 *            no other town's bytes" true rather than probable. ⛔ And nothing may delete a
 *            `ward/<sha>/` or `kit/<sha>/` that any `hosts/*.json` still names (the old player's
 *            removal, Phase 4, must honour it).
 *            The town's share card (`towns.json`, beside the kit's player) is pinned at
 *            `player/<map>/towns.json` too, as staging reads it for both players.
 *
 * ⭐⭐ COPY, NOT REBUILD (Jacob, 2026-09-26). Production gets the exact bytes that staging served:
 * the build named by `staging/player/build.json`, file by file from its `manifest.json`, each one
 * checked against the manifest's MD5 before it is written. ⛔ A rebuild here would ship a player
 * nobody had looked at.
 *
 * ⭐ EACH TOWN PINS ITS OWN COPY, at `player/<map>/`, so promoting Provincetown changes no byte any
 * other town serves. The player is still ONE product — the copies are the same build, pinned at
 * different moments.
 *
 * ⛔ REFUSES, BY NAME: a staged player not built for a runtime slab base (it would read STAGING's
 * slab on a town's domain) · a manifest that does not match its stamp · a build that does not
 * carry this look · any byte that does not match the manifest.
 *
 * Sibling: `publish-player-to-staging.mjs` writes what this reads. Caller: `cartograph/serve.js`
 * POST /looks/<id>/promote. ⛔ Like its siblings, it holds no list of towns.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const STAGED = 'staging/player/'
const CONC = Number(process.env.SITE_UPLOAD_CONC) || 8
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || null
const map = arg('map'), look = arg('look')
const dryRun = process.argv.includes('--dry-run')
const MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const SHA = /^[0-9a-f]{40}$/
const md5 = (buf) => createHash('md5').update(buf).digest('hex')
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff',
  ttf: 'font/ttf', glb: 'model/gltf-binary', ktx2: 'image/ktx2', bin: 'application/octet-stream',
  wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', map: 'application/json',
}
const typeOf = (rel) => MIME[(rel.split('.').pop() || '').toLowerCase()] || 'application/octet-stream'
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
      r = await fetch(PUBLIC_BASE + key, { cache: 'no-store' })
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
      '--content-type', typeOf(rel), '--cache-control', cache], { cwd: REPO_ROOT })
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
  // The share card, byte-checked against the kit player's own manifest (the file staging reads).
  const stagedMan = JSON.parse(await getBytes(`${STAGED}manifest.json`))
  const towns = stagedMan.files.find((f) => f.rel === 'towns.json')
  if (!towns) throw new Error(`${STAGED}manifest.json lists no towns.json — the share card has no source. Publish to Staging again.`)

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
  const townsBuf = await getBytes(`${STAGED}towns.json`)
  if (md5(townsBuf) !== towns.md5) throw new Error(`${STAGED}towns.json does not match its manifest — promote again.`)
  await put(`player/${map}/towns.json`, townsBuf, 'towns.json')

  console.log(`\n✅ Ward ${cur.sha.slice(0, 12)} + kit ${cur.kit.slice(0, 12)} pinned for ${map}`)
  console.log(JSON.stringify({ ok: true, map, look, player: 'ward', ward: cur.sha, kit: cur.kit, builtAt: build.builtAt ?? null, copied: toCopy.length }))
}

;(async () => {
  if (!MAP_ID.test(map || '') || !MAP_ID.test(look || '')) throw new Error('--map=<map> and --look=<look> are both required')

  // ── 0. WHICH player — the town's staging record, and nothing else.
  const recKey = `staging/sites/${map}/player.json`
  const recBuf = await getBytes(recKey, { missingOk: true })
  if (!recBuf) throw new Error(`"${map}" names no player on staging — nothing at ${recKey}. There is no default player. `
    + `▶ node scripts/set-staging-player.mjs --map=${map} --player=ward|legacy, check it on staging, then promote.`)
  let app
  try { app = JSON.parse(recBuf).player } catch { app = undefined }
  if (app === 'ward') return promoteWard()
  if (app !== 'legacy') throw new Error(`${recKey} names player ${JSON.stringify(app)}; a town plays "ward" or "legacy".`)

  const dest = `player/${map}/`

  // ── 1. WHICH build. The stamp names it; the manifest must be the stamp's.
  const stampBuf = await getBytes(`${STAGED}build.json`)
  const stamp = JSON.parse(stampBuf)
  if (stamp.assetBase !== 'runtime') {
    throw new Error(`the staged player (built ${stamp.builtAt ?? '?'}) has its slab address compiled in — it would read `
      + 'STAGING\'s slab on a town\'s domain. Publish to Staging again so it is rebuilt for a runtime base.')
  }
  const manBuf = await getBytes(`${STAGED}manifest.json`)
  if (md5(manBuf) !== stamp.manifestMd5) {
    throw new Error('staging/player/manifest.json is not the one build.json names — a publish is mid-flight or '
      + 'failed. Publish to Staging again, then promote.')
  }
  const manifest = JSON.parse(manBuf)
  const rels = new Set(manifest.files.map((f) => f.rel))
  for (const need of ['index.html', `looks/${look}/design.json`]) {
    if (!rels.has(need)) throw new Error(`the staged player has no "${need}" — it cannot serve look "${look}". Publish it to staging first.`)
  }
  console.log(`build    ${stamp.builtAt} · ${manifest.files.length} files → ${BUCKET}/${dest}`)

  // ── 2. WHAT is already pinned. ⛔ Every uncertain answer copies (same rule as the uploaders).
  const pending = []
  const queue = [...manifest.files]
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      try {
        const r = await fetch(PUBLIC_BASE + dest + f.rel, { method: 'HEAD', cache: 'no-store' })
        if (r.ok && (r.headers.get('etag') || '').replace(/"/g, '') === f.md5) continue
      } catch { /* copy it */ }
      pending.push(f)
    }
  }))
  console.log(`copy     ${pending.length} files (${manifest.files.length - pending.length} already pinned)`)
  if (dryRun) { console.log('\n--dry-run: nothing copied.'); return }

  // ── 3. COPY, each byte checked against the manifest before it is written.
  let done = 0
  const work = [...pending]
  await Promise.all(Array.from({ length: CONC }, async () => {
    for (let f = work.pop(); f; f = work.pop()) {
      const buf = await getBytes(STAGED + f.rel)
      if (md5(buf) !== f.md5) {
        throw new Error(`staging/player/${f.rel} does not match the manifest — the staged build changed under this `
          + 'promote. Nothing is switched; promote again.')
      }
      await put(dest + f.rel, buf, f.rel)
      if (++done % 25 === 0) console.log(`         ${done}/${pending.length}`)
    }
  }))

  // ── 4. The pinned copy's own manifest and stamp, LAST: they say "this copy is complete".
  await put(`${dest}manifest.json`, manBuf, 'manifest.json')
  await put(`${dest}build.json`, stampBuf, 'build.json')
  console.log(`\n✅ player ${stamp.builtAt} pinned for ${map}`)
  console.log(JSON.stringify({ ok: true, map, look, player: 'legacy', builtAt: stamp.builtAt, copied: pending.length }))
})().catch((e) => { console.error('\n⛔ promote-player FAILED:', e.message, e.cause?.code ? `(${e.cause.code})` : ''); process.exit(1) })
