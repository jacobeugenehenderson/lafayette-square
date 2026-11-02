/**
 * _r2api.mjs — the bucket through Cloudflare's API, for the two scripts that need what `wrangler r2 object` cannot do:
 * LIST a prefix (scripts/legacy-player-census.mjs) and delete by key (scripts/delete-legacy-player.mjs).
 * The token is the operator's own `npx wrangler auth token` (the same as scripts/bind-production-domain.mjs); the
 * bucket is READ from the Workers' config, never restated. ⛔ The account: CLOUDFLARE_ACCOUNT_ID, else the one account the
 * token sees; several and none named refuses, naming them.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CF = 'https://api.cloudflare.com/client/v4'
// ⛔ `node --watch` hands its child these two; a node grandchild that inherits them dies with EBADF (bind-production-domain).
const WATCH_ONLY = ['WATCH_REPORT_DEPENDENCIES', 'NODE_CHANNEL_FD']

export const BUCKET = (readFileSync(join(REPO_ROOT, 'workers/production-sites/wrangler.jsonc'), 'utf8')
  .match(/"bucket_name"\s*:\s*"([^"]+)"/) || [])[1]

function token() {
  const env = { ...process.env }
  for (const k of WATCH_ONLY) delete env[k]
  let t = ''
  try {
    t = execFileSync('npx', ['wrangler', 'auth', 'token'], { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop().trim()
  } catch (e) { throw new Error(`\`npx wrangler auth token\` failed: ${String(e.stderr || e.message).trim().split('\n').slice(-2).join(' · ')} — run \`npx wrangler login\`.`) }
  if (!t) throw new Error('`npx wrangler auth token` printed no token — run `npx wrangler login`.')
  return t
}

async function cf(tok, method, path) {
  const res = await fetch(CF + path, { method, headers: { authorization: `Bearer ${tok}` } })
  let j = null
  try { j = await res.json() } catch { /* below */ }
  if (!res.ok || !j?.success) {
    const why = (j?.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`
    throw new Error(`Cloudflare refused ${method} ${path.split('?')[0]} — ${why}`)
  }
  return j
}

/** → { list(prefix) → [key], remove(key) } on the bucket. */
export async function r2() {
  if (!BUCKET) throw new Error('could not read the bucket from workers/production-sites/wrangler.jsonc')
  const tok = token()
  let account = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!account) {
    const all = (await cf(tok, 'GET', '/accounts?per_page=50')).result || []
    if (all.length !== 1) throw new Error(`the token sees ${all.length} accounts (${all.map((a) => `${a.name} ${a.id}`).join(', ')}) — set CLOUDFLARE_ACCOUNT_ID`)
    account = all[0].id
  }
  const base = `/accounts/${account}/r2/buckets/${BUCKET}/objects`
  return {
    async list(prefix) {
      const keys = []
      let cursor = ''
      do {
        const j = await cf(tok, 'GET', `${base}?prefix=${encodeURIComponent(prefix)}&per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
        for (const o of j.result || []) keys.push(o.key)
        cursor = j.result_info?.is_truncated ? j.result_info.cursor : ''
      } while (cursor)
      return keys
    },
    async remove(key) { await cf(tok, 'DELETE', `${base}/${key.split('/').map(encodeURIComponent).join('/')}`) },
  }
}
