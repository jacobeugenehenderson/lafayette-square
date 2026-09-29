#!/usr/bin/env node
/**
 * "DOES EVERY STAGING TOWN SERVE THE PLAYER ITS RECORD NAMES — AND A TOWN THAT NAMES NONE, NONE?"
 *
 * WHY (BRIEF-ward-on-staging, 2026-09-28). The staging Worker serves each town the player its R2
 * record (`staging/sites/<map>/player.json`) names: `ward` or `legacy`. ⛔ A town with no record must
 * 404 and say so — a default player would serve a town the wrong app with nothing on the page to
 * tell (`CLAUDE.md` Layer 0 q2). And a "ward" town's page must name the kit bundle its build pins in
 * `<meta name="ward-kit-base">`, because the renderer's `kitUrl()` reads that and nothing else.
 *
 * ⭐ BEHAVIOUR, NOT SHAPE: the Worker's own source, bundled, runs in Miniflare against an in-memory R2
 *    seeded with towns whose names are minted here, so a Worker that knew any town by name could not
 *    pass. The source is read too, for the two things behaviour cannot see: no town id written into
 *    the Worker, and no renderer file reading a kit asset through `BASE_URL`.
 * ⛔ Mutation-tested 2026-09-28: `player` defaulted to "legacy" → the no-record town serves 200 and
 *    this goes red.
 *
 * ⛔ LOCAL ONLY — no network, no R2. Usage: node checks/claims-a-staging-town-names-its-player.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = new URL('..', import.meta.url).pathname
const WORKER = join(ROOT, 'workers/staging-sites/src/index.js')
const fails = []

// ── Shape ────────────────────────────────────────────────────────────────────
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const workerCode = code(readFileSync(WORKER, 'utf8'))
const ids = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks.map((l) => l.id)
for (const id of ids) {
  if (new RegExp(`['"\`/]${id}['"\`/]`).test(workerCode)) fails.push(`the Worker's code names the town "${id}" — it may hold no list of towns`)
}
if (/BASE_URL/.test(code(readFileSync(join(ROOT, 'src/lib/kitUrl.js'), 'utf8')))) fails.push('src/lib/kitUrl.js reads BASE_URL — it must read only <meta name="ward-kit-base">')
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p, out) : /\.(jsx?|mjs)$/.test(e) && out.push(p) } return out }
for (const f of walk(join(ROOT, 'src'))) {
  const m = readFileSync(f, 'utf8').match(/BASE_URL[^`'"\n]*\}?(basis\/|clouds\/|models\/lamp-posts\/|textures\/(moon|milky_way|buildings)|weather-icons\/)/)
  if (m) fails.push(`${f.slice(ROOT.length)} fetches the renderer's own "${m[1]}" through BASE_URL — use kitUrl()`)
}

// ── Behaviour ────────────────────────────────────────────────────────────────
function loadMiniflare() {
  const tries = ['miniflare']
  try { tries.push(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'wrangler/node_modules/miniflare')) } catch { /* reported below */ }
  return (async () => {
    for (const t of tries) {
      try { return (await import(t.startsWith('/') ? pathToFileURL(join(t, JSON.parse(readFileSync(join(t, 'package.json'), 'utf8')).main)).href : t)).Miniflare } catch { /* next */ }
    }
    console.error(`⛔ Miniflare not found (tried ${tries.join(', ')}) — install wrangler; this check never passes unrun.`)
    process.exit(2)
  })()
}
const Miniflare = await loadMiniflare()
const bundled = await build({ entryPoints: [WORKER], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' })
const SLAB_BASE = 'https://assets.example/staging/'
const mf = new Miniflare({
  modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-01', r2Buckets: ['ASSETS'],
  bindings: { SITE_PREFIX: 'staging/sites/', PLAYER_PREFIX: 'staging/player/', WARD_PREFIX: 'staging/ward/', SLAB_BASE, OPERATIONS_URL: 'http://ops.invalid' },
})
const r2 = await mf.getR2Bucket('ASSETS')
const mint = (tag) => `t${Math.random().toString(36).slice(2, 8)}-${tag}`
const hex = () => Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
const [none, legacy, ward, bogus, bare] = ['none', 'legacy', 'ward', 'bogus', 'bare'].map(mint)
const WARD_SHA = hex(), KIT_SHA = hex()
for (const t of [none, legacy, ward, bogus]) await r2.put(`staging/baked/${t}/manifest.json`, '{}')
await r2.put(`staging/sites/${legacy}/player.json`, JSON.stringify({ player: 'legacy' }))
await r2.put(`staging/sites/${ward}/player.json`, JSON.stringify({ player: 'ward' }))
await r2.put(`staging/sites/${bogus}/player.json`, JSON.stringify({ player: 'sometimes' }))
await r2.put('staging/player/index.html', '<!doctype html><html><head><meta name="ward-kit-base" content="/_player/" /><title>x</title></head><body>LEGACY</body></html>')
await r2.put('staging/ward/current.json', JSON.stringify({ sha: WARD_SHA, kit: KIT_SHA }))
await r2.put(`staging/ward/${WARD_SHA}/index.html`, `<!doctype html><html><head>\n<meta name="ward-build" content="${WARD_SHA}"><title>x</title></head><body>WARD</body></html>`)
await r2.put(`staging/ward/${WARD_SHA}/build.json`, JSON.stringify({ ward: WARD_SHA, kit: KIT_SHA }), { httpMetadata: { contentType: 'application/json', cacheControl: 'no-cache' } })

const get = async (p) => { const r = await mf.dispatchFetch(`https://staging.example${p}`); return { status: r.status, body: await r.text(), cache: r.headers.get('cache-control') } }
const expect = (what, ok, got) => { if (!ok) fails.push(`${what} — got ${got.status}: ${got.body.slice(0, 160).replace(/\n/g, ' ')}`) }
const kitTags = (b) => b.match(/<meta name="ward-kit-base" content="([^"]*)"/g) || []

let r = await get(`/${none}/`)
expect('a town with no record must 404 naming the town and its record', r.status === 404 && r.body.includes(none) && r.body.includes('player.json'), r)
r = await get(`/${bare}/`)
expect('a town with no slab keeps its slab 404', r.status === 404 && r.body.includes(bare) && r.body.includes('slab'), r)
r = await get(`/${bogus}/`)
expect('an unknown player must be refused', r.status === 500 && r.body.includes('sometimes'), r)
r = await get(`/${legacy}/deep/route`)
expect('a "legacy" town serves the kit player, with its own kit base and no second one', r.status === 200 && r.body.includes('LEGACY') && kitTags(r.body).length === 1 && r.body.includes('ward-asset-base'), r)
// Before the kit bundle exists, a "ward" town must refuse rather than draw without the renderer's files.
r = await get(`/${ward}/`)
expect('a "ward" town whose kit bundle is unpublished must 404 naming the kit sha', r.status === 404 && r.body.includes(KIT_SHA), r)
await r2.put(`staging/kit/${KIT_SHA}/manifest.json`, '{}')
r = await get(`/${ward}/`)
expect('a "ward" town serves the Ward build current.json names', r.status === 200 && r.body.includes('WARD') && r.body.includes(`content="${WARD_SHA}"`), r)
const tags = kitTags(r.body)
expect(`a "ward" town's page carries exactly one ward-kit-base, ${SLAB_BASE}kit/<kit>/`, tags.length === 1 && tags[0].includes(`"${SLAB_BASE}kit/${KIT_SHA}/"`), { status: tags.length, body: tags.join(' ') })
r = await get(`/_ward/${WARD_SHA}/build.json`)
expect('/_ward/<sha>/build.json is that build, with the cache policy the publish set', r.status === 200 && r.body.includes(WARD_SHA) && r.cache === 'no-cache', r)
r = await get(`/_ward/${hex()}/index.html`)
expect('another sha under /_ward/ must 404, never fall through', r.status === 404, r)
r = await get(`/${ward}/nothing.png`)
expect('a missing town file names itself', r.status === 404 && r.body.includes('nothing.png'), r)
await mf.dispose()

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ every staging town serves the player its record names; no record, no player, and a Ward page names its kit bundle')
