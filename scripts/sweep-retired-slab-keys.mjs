#!/usr/bin/env node
/**
 * sweep-retired-slab-keys.mjs — delete a town's slab objects that no recent manifest names.
 *
 *   node scripts/sweep-retired-slab-keys.mjs --env=staging --look=huron              # dry-run (default)
 *   node scripts/sweep-retired-slab-keys.mjs --env=staging --look=huron --keep=3
 *   node scripts/sweep-retired-slab-keys.mjs --env=prod --look=provincetown --apply
 *   node scripts/sweep-retired-slab-keys.mjs --env=prod --look=provincetown --retire-plain \
 *        --hosts=https://provincetown.online --apply
 *
 * WHY (BRIEF-slab-loading §3 step 3). A content-named upload (`upload-baked-to-r2.mjs
 * --names=sha256-16`) never overwrites a file: a new bake is new names. Old names are kept so a
 * visitor holding an older manifest never 404s — until they are old enough to retire. This is
 * that retirement, and it is DESTRUCTIVE: dry-run unless `--apply`.
 *
 * WHAT IT READS — nothing but the town's own published record: `manifests/index.json` (written by
 * the uploader, newest last) and each manifest copy it lists. No bucket listing, so an object no
 * manifest ever named is never touched (an orphan costs storage, never a page).
 *   KEEP    the last K manifests (K ≥ 2 — the one a visitor may still hold, and the live one);
 *   RETIRE  every content name the OLDER manifests use and no kept one does, and the older copies;
 *   NEVER   manifest.json, the index, or anything outside `baked/<look>/`.
 * The index is rewritten to the kept entries FIRST, then the objects go: a failure mid-sweep leaves
 * orphans, never an index naming a deleted copy.
 *
 * `--retire-plain` also deletes the PLAIN keys (the dual-write for pre-resolver players). ⛔ It
 * requires `--hosts=` — every site whose player reads this slab — and REFUSES unless each one's
 * player carries the resolver (its bundle names the "sha256-16" scheme). A pinned player that still
 * asks for `ground.json` would lose its town.
 *
 * ⛔ Loud: a missing kept manifest, an unreadable index, a failed delete — each exits non-zero.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HASHED, CACHE, contentName } from '../src/lib/slabNames.js'

const execFileAsync = promisify(execFile)
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUCKET = process.env.R2_BUCKET || 'theward-assets'
const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
// ⛔ Keep in step with upload-baked-to-r2.mjs#ENV_PREFIX (checks/claims-the-slab-envs-do-not-collide.mjs).
const ENV_PREFIX = { prod: '', staging: 'staging/' }

/** Every content name a manifest uses (files, content, photos), relative to `base`. */
function namesOf(manifest, base) {
  const out = new Set()
  for (const [rel, f] of Object.entries(manifest.files || {})) if (f) out.add(base + contentName(rel, f.sha256))
  for (const [name, c] of Object.entries(manifest.content || {})) if (c) out.add(base + contentName('content/' + name, c.sha256))
  for (const p of Object.values(manifest.photos || {})) if (p) out.add(base + contentName(p.path, p.sha256))
  return out
}
const plainOf = (manifest, base) => new Set([
  ...Object.keys(manifest.files || {}).map((r) => base + r),
  ...Object.entries(manifest.content || {}).filter(([, c]) => c).map(([n]) => base + 'content/' + n),
  ...Object.values(manifest.photos || {}).filter(Boolean).map((p) => base + p.path),
])

/**
 * Pure: what to delete and the index to write. `manifests` maps each index key → its parsed copy.
 */
export function retirePlan({ base, index, manifests, keep = 2, retirePlain = false }) {
  if (!Number.isInteger(keep) || keep < 2) throw new Error(`--keep=${keep}: at least 2 — the live manifest and the one a visitor may still hold`)
  const all = index?.manifests || []
  const kept = all.slice(-keep), older = all.slice(0, Math.max(0, all.length - keep))
  const live = new Set(kept.map((e) => e.key))
  for (const e of kept) {
    const m = manifests[e.key]
    if (!m) throw new Error(`kept manifest ${e.key} could not be read — refusing to decide what it still names`)
    if (m.names !== HASHED) throw new Error(`kept manifest ${e.key} is not content-named (names=${m.names})`)
    for (const k of namesOf(m, base)) live.add(k)
  }
  const retire = new Set()
  for (const e of older) {
    retire.add(e.key)
    const m = manifests[e.key]
    if (m) for (const k of namesOf(m, base)) if (!live.has(k)) retire.add(k)
  }
  if (retirePlain) for (const e of all) { const m = manifests[e.key]; if (m) for (const k of plainOf(m, base)) retire.add(k) }
  for (const k of retire) {
    if (!k.startsWith(base) || k === base + 'manifest.json' || k === base + 'manifests/index.json') {
      throw new Error(`refusing to retire ${k} — outside the town, or the switch itself`)
    }
  }
  return { retire: [...retire], index: { ...index, manifests: kept } }
}

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`${url} → ${r.status}`)
  return r.json()
}

/** A host's player carries the resolver iff one of its page's modules (entry or modulepreload) names the scheme. */
async function hostResolves(origin) {
  const html = await fetch(origin, { cache: 'no-store' }).then((r) => r.text())
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"|<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)]
    .map((m) => new URL(m[1] || m[2], origin).href)
  if (!scripts.length) throw new Error(`${origin} serves no <script src> — cannot tell what its player reads`)
  for (const s of scripts) if ((await fetch(s).then((r) => r.text())).includes(HASHED)) return true
  return false
}

const wrangler = (args) => execFileAsync('npx', ['wrangler', 'r2', 'object', ...args, '--remote'], { cwd: REPO_ROOT, maxBuffer: 1 << 24 })

async function main() {
  const argv = process.argv.slice(2)
  const arg = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
  const env = arg('env'), look = arg('look')
  if (!(env in ENV_PREFIX)) throw new Error(`--env is REQUIRED: ${Object.keys(ENV_PREFIX).join(' | ')}`)
  if (!look) throw new Error('--look is REQUIRED — the sweep retires one town at a time')
  const keep = Number(arg('keep') ?? 2)
  const apply = argv.includes('--apply')
  const retirePlain = argv.includes('--retire-plain')
  const base = `${ENV_PREFIX[env]}baked/${look}/`

  const index = await getJSON(PUBLIC_BASE + base + 'manifests/index.json')
  if (!index) throw new Error(`${base}manifests/index.json does not exist — "${look}" has had no content-named upload; nothing to sweep`)
  const manifests = {}
  for (const e of index.manifests) { const m = await getJSON(PUBLIC_BASE + e.key); if (m) manifests[e.key] = m }

  if (retirePlain) {
    const hosts = (arg('hosts') || '').split(',').filter(Boolean)
    if (!hosts.length) throw new Error('--retire-plain needs --hosts=<every origin whose player reads this slab>')
    for (const h of hosts) if (!(await hostResolves(h))) throw new Error(`${h}'s player does not carry the resolver — it still asks for plain names. Promote a resolver build first.`)
  }

  const { retire, index: next } = retirePlan({ base, index, manifests, keep, retirePlain })
  console.log(`env      ${env}${env === 'prod' ? ' — LIVE keys' : ''}`)
  console.log(`town     ${look}  (${index.manifests.length} manifests published, keeping the last ${Math.min(keep, index.manifests.length)})`)
  console.log(`retire   ${retire.length} objects${retirePlain ? ' (including plain keys)' : ''}`)
  for (const k of retire.slice(0, 10)) console.log(`           ${k}`)
  if (retire.length > 10) console.log(`           …and ${retire.length - 10} more`)
  if (!apply) { console.log('\ndry-run (the default): nothing deleted. --apply to delete.'); return }
  if (!retire.length) { console.log('\n✅ nothing to retire'); return }

  const tmp = join(mkdtempSync(join(tmpdir(), 'slab-sweep-')), 'index.json')
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n')
  await wrangler(['put', `${BUCKET}/${base}manifests/index.json`, '--file', tmp, '--content-type', 'application/json', '--cache-control', CACHE.manifest])
  const failed = []
  for (const k of retire) { try { await wrangler(['delete', `${BUCKET}/${k}`]) } catch (e) { failed.push(`${k}: ${String(e.stderr || e.message).split('\n')[0]}`) } }
  if (failed.length) { console.error(`⛔ ${failed.length} delete(s) failed (orphans, not holes):\n   ${failed.join('\n   ')}`); process.exit(1) }
  console.log(`\n✅ retired ${retire.length} objects; index keeps ${next.manifests.length}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error(`⛔ ${err.message}`); process.exit(1) })
}
