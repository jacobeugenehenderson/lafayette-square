#!/usr/bin/env node
/**
 * bind-production-domain.mjs — put a town's domain, and its www., on the production Worker.
 *
 *   node scripts/bind-production-domain.mjs --domain=provincetown.online
 *   node scripts/bind-production-domain.mjs --domain=provincetown.online --dry-run
 *
 * ⭐ PROMOTE DOES THIS ITSELF (Jacob, 2026-09-27): a town's first promote must need nothing but the
 * button. Before this, binding was a dashboard step per town, and the dashboard offered to BUY
 * `www.provincetown.online` rather than bind it. Caller: `cartograph/serve.js` POST /looks/<id>/promote.
 *
 * What it does, with the Cloudflare sign-in Wrangler already holds on this machine (the same one the
 * R2 uploads use; nothing new to create):
 *   1. finds the domain's zone — ⛔ refuses unless it is ACTIVE (a site cannot be served from a zone
 *      whose nameservers are not yet Cloudflare's);
 *   2. reads what the production Worker is already bound to;
 *   3. for `<domain>` and `www.<domain>`: already bound here → nothing to do; bound to ANOTHER Worker →
 *      ⛔ refuses by name (it never takes a hostname from something else); unbound → binds it with
 *      `PUT /workers/domains`, which adds that ONE hostname and leaves every other binding alone;
 *   4. reads the bindings back and fails unless both names are on this Worker.
 * ⛔ It never removes a binding, and it holds no list of towns: the Worker's name is read from
 * `workers/production-sites/wrangler.jsonc`, the domain comes from the caller (who got it from
 * Operations). The last line printed is JSON for the caller.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import dns from 'node:dns/promises'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CF = 'https://api.cloudflare.com/client/v4'
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || null
const dryRun = process.argv.includes('--dry-run')
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

// The Worker's name, READ from its config rather than restated here.
const SERVICE = (readFileSync(join(REPO_ROOT, 'workers/production-sites/wrangler.jsonc'), 'utf8')
  .match(/^\s*"name"\s*:\s*"([^"]+)"/m) || [])[1]

// ⛔ `node --watch` (the dev server) hands its child these two, and a node grandchild that inherits them reports its
// modules to a watch channel that isn't its own and dies with EBADF — which read as "not signed in" (2026-09-27).
const WATCH_ONLY = ['WATCH_REPORT_DEPENDENCIES', 'NODE_CHANNEL_FD']

function token() {
  const env = { ...process.env }
  for (const k of WATCH_ONLY) delete env[k]
  let t = ''
  try {
    t = execFileSync('npx', ['wrangler', 'auth', 'token'], { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .trim().split('\n').pop().trim()
  } catch (e) {
    const said = String(e.stderr || e.message).trim().split('\n').slice(-3).join(' · ')
    throw new Error(`\`npx wrangler auth token\` failed (exit ${e.status ?? '?'}): ${said} — if it says you are not logged in, run \`npx wrangler login\`, then promote again.`)
  }
  if (!t) throw new Error('`npx wrangler auth token` printed no token — run `npx wrangler login`, then promote again.')
  return t
}

/** A / AAAA / CNAME for `host`, asked of the given nameservers directly. ⛔ No nameserver → refuse. */
async function answersAt(nameServers, host) {
  if (!nameServers.length) throw new Error(`Cloudflare gave no nameservers for ${host}'s zone, so it cannot be checked.`)
  const ips = (await Promise.all(nameServers.map((n) => dns.resolve4(n).catch(() => [])))).flat()
  if (!ips.length) throw new Error(`could not reach ${nameServers.join(' / ')} to check ${host}.`)
  const r = new dns.Resolver(); r.setServers(ips)
  const out = []
  for (const [type, fn] of [['CNAME', 'resolveCname'], ['A', 'resolve4'], ['AAAA', 'resolve6']]) {
    try { out.push(...(await r[fn](host)).map((v) => `${type} ${v}`)) } catch (e) {
      if (!['ENODATA', 'ENOTFOUND'].includes(e.code)) throw new Error(`could not check ${host} (${type}): ${e.code || e.message}`)
    }
  }
  return out
}

async function cf(tok, method, path, body) {
  const res = await fetch(CF + path, { method, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined })
  let j = null
  try { j = await res.json() } catch { /* below */ }
  if (!res.ok || !j?.success) {
    const why = (j?.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`
    throw new Error(`Cloudflare refused ${method} ${path.split('?')[0]} — ${why}`.split(tok).join('[token]'))
  }
  return j.result
}

;(async () => {
  const domain = String(arg('domain') || '').toLowerCase()
  if (!DOMAIN.test(domain)) throw new Error(`--domain=<town>.online is required — got ${JSON.stringify(arg('domain'))}`)
  if (!SERVICE) throw new Error('could not read the production Worker\'s name from workers/production-sites/wrangler.jsonc')
  const tok = token()

  const zones = await cf(tok, 'GET', `/zones?name=${encodeURIComponent(domain)}`)
  const zone = zones.find((z) => z.name === domain)
  if (!zone) throw new Error(`Cloudflare has no zone for ${domain} in this account — add it (Operations → Domains) before promoting.`)
  if (zone.paused || zone.status !== 'active') {
    throw new Error(`${domain}'s zone is "${zone.paused ? 'paused' : zone.status}" — it must be active before the town can be served there.`)
  }
  const account = zone.account?.id
  if (!account) throw new Error(`Cloudflare did not say which account ${domain}'s zone belongs to.`)

  const bound = async () => {
    const all = await cf(tok, 'GET', `/accounts/${account}/workers/domains?zone_id=${zone.id}`)
    return new Map(all.map((d) => [d.hostname, d]))
  }
  const before = await bound()
  const wanted = [domain, `www.${domain}`]
  const plan = []
  for (const h of wanted) {
    const b = before.get(h)
    if (b?.service === SERVICE) { plan.push({ hostname: h, action: 'already' }); continue }
    if (b) throw new Error(`${h} is bound to the Worker "${b.service}", not "${SERVICE}" — it is not taken over. Unbind it there first.`)
    // ⛔ A name with DNS records of its own is being served by something else (a Pages site, a parked
    // page, another host). Binding would take that address away from it, so refuse by name rather than
    // lean on whatever Cloudflare's API decides to do about the existing records.
    // Asked of the ZONE'S OWN nameservers, so the answer is authoritative and uncached. (Wrangler's
    // sign-in may not read DNS records through the API; the nameservers answer the same question.)
    const records = await answersAt(zone.name_servers || [], h)
    if (records.length) {
      throw new Error(`${h} already answers (${records.join(', ')}) — something else serves it. Nothing was bound; `
        + 'remove its DNS records in Cloudflare first if this town should take the address.')
    }
    plan.push({ hostname: h, action: 'bind' })
  }
  for (const p of plan) console.log(`${p.action === 'bind' ? (dryRun ? 'would bind' : 'bind    ') : 'already '} ${p.hostname} → ${SERVICE}`)
  if (dryRun) { console.log(JSON.stringify({ ok: true, dryRun: true, domain, plan })); return }

  for (const p of plan.filter((x) => x.action === 'bind')) {
    await cf(tok, 'PUT', `/accounts/${account}/workers/domains`,
      { hostname: p.hostname, service: SERVICE, zone_id: zone.id, environment: 'production' })
  }
  // ⛔ Read back: a PUT that answered success is not proof the hostname is where we want it.
  const after = await bound()
  const missing = wanted.filter((h) => after.get(h)?.service !== SERVICE)
  if (missing.length) throw new Error(`after binding, ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} still not on ${SERVICE}`)
  console.log(JSON.stringify({ ok: true, domain, service: SERVICE, bound: plan.filter((x) => x.action === 'bind').map((x) => x.hostname) }))
})().catch((e) => { console.error(`⛔ bind-production-domain FAILED: ${e.message}`); process.exit(1) })
