#!/usr/bin/env node
/**
 * claims-a-place-link-sends-its-own-card — a shared `/place/<id>/<name>` link previews as that place, on both sites;
 * a place the town doesn't know previews as the town, and the response says so by name.
 *
 * BRIEF-share-image-by-time-of-day §7 (part 2; Jacob: "not today but soon", drafted 2026-10-30 at Boz's word after
 * the PTown stability sweep: every place link previewed as the town's front page, og:url the town's root).
 *
 * Drives each Worker's real `fetch` in Miniflare against an in-memory R2 holding a town with listings, a taxonomy and
 * photos, and reads the served `<head>` and the `ward-share-card` header:
 *   1. a place whose photo is public domain → its name, "<type> · <address>", its own address, ITS photo; no note.
 *   2. a place whose photo is CC BY-SA → its name and address, the TOWN's picture; the header names the licence.
 *   3. a place with no photo → its name, the town's picture; no note.
 *   4. a place id the listings lack → the town's card; the header names the place and "no such place".
 *   5. a town that publishes no listings → the town's card; the header says so.
 *   6. the town's front page → the town's card, unchanged, header exactly `complete`.
 * Which licences may stand in a preview is read from `shareCard.js#PREVIEW_LICENCES`, never restated.
 * Mutants, run every time, each must turn it RED: (a) cardFor ignores the path; (b) the licence gate removed;
 * (c) the fallback said nowhere; (d) staging hands cardFor its whole path (`/<town>/place/…`).
 *   node checks/claims-a-place-link-sends-its-own-card.mjs
 */
import { join } from 'node:path'
import { workerInMiniflare, mint, hex } from './_miniflare.mjs'
import { CARD_HEADER, SHARE_IMAGE_RELS, PREVIEW_LICENCES } from '../src/lib/shareCard.js'
import { HASHED, contentName } from '../src/lib/slabNames.js'

const ROOT = new URL('..', import.meta.url).pathname
const SHARE = join(ROOT, 'src/lib/shareCard.js')
const WORKERS = { production: join(ROOT, 'workers/production-sites/src/index.js'), staging: join(ROOT, 'workers/staging-sites/src/index.js') }
const GEO = { lat: 42.05, lon: -70.19, timezone: 'America/New_York' }
const sha = () => hex() + hex().slice(0, 24)
if (!PREVIEW_LICENCES.includes('Public domain')) throw new Error('PREVIEW_LICENCES no longer names "Public domain" — re-aim case 1')

const TAXONOMY = { categories: [{ id: 'hospitality', label: 'Hospitality', types: [{ id: 'hotels', label: 'Hotels' }] }, { id: 'arts', label: 'Arts', types: [{ id: 'museum', label: 'Museums' }] }] }
const LISTINGS = [
  { id: 'p-free', name: 'The "Free" Inn & Co', category: 'hospitality', subcategory: 'hotels', address: '1 Front Street', photos: [{ url: 'photos/free/01.jpg', license: 'Public domain' }] },
  { id: 'p-bysa', name: 'Credit Museum', category: 'arts', subcategory: 'museum', address: '2 High Street', photos: [{ url: 'photos/bysa/01.jpg', license: 'CC BY-SA 3.0' }] },
  { id: 'p-none', name: 'Plain Place', category: 'arts', subcategory: 'museum', address: '3 Low Street' },
]
const PHOTOS = { 'photos/free/01.jpg': { path: 'content/photos/free/01.jpg' }, 'photos/bysa/01.jpg': { path: 'content/photos/bysa/01.jpg' } }
const manifest = (map, withListings) => {
  const files = {}
  for (const rel of SHARE_IMAGE_RELS) files[rel] = { sha256: sha() }
  return { town: map, names: HASHED, identity: { geography: GEO }, files, taxonomy: TAXONOMY, photos: PHOTOS,
    content: withListings ? { 'listings.json': { bytes: 1, sha256: sha() } } : { 'listings.json': null } }
}
const WARD_DOC = (w) => `<!doctype html><html><head><meta charset="UTF-8" /><title>The Ward</title><script type="module" src="/_ward/${w}/assets/index.js"></script></head><body>WARD</body></html>`
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
const tag = (body, key) => unesc((body.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`)) || [])[1] ?? '') || null

async function run(site, mutate) {
  const fails = []
  const W = hex(), K = hex()
  const [town, bare] = ['place', 'nolist'].map(mint)
  const towns = { [town]: { title: 'Card Town', description: 'A town.', mark: '🦞' }, [bare]: { title: 'Bare Town', mark: '🦞' } }
  const mans = { [town]: manifest(town, true), [bare]: manifest(bare, false) }
  const SLAB_BASE = 'https://assets.example/staging/'
  const bindings = site === 'staging' ? { SITE_PREFIX: 'staging/sites/', PLAYER_PREFIX: 'staging/player/', WARD_PREFIX: 'staging/ward/', SLAB_BASE, OPERATIONS_URL: 'http://ops.invalid' } : {}
  const { mf, r2, get } = await workerInMiniflare(WORKERS[site], bindings, { mutate })
  const at = {}
  if (site === 'staging') {
    await r2.put('staging/player/towns.json', JSON.stringify(towns))
    await r2.put('staging/ward/current.json', JSON.stringify({ sha: W, kit: K }))
    await r2.put(`staging/ward/${W}/index.html`, WARD_DOC(W))
    await r2.put(`staging/kit/${K}/manifest.json`, '{}')
    for (const t of [town, bare]) {
      await r2.put(`staging/baked/${t}/manifest.json`, JSON.stringify(mans[t]))
      await r2.put(`staging/sites/${t}/player.json`, JSON.stringify({ player: 'ward' }))
      at[t] = { root: `https://staging.example/${t}/`, slab: `${SLAB_BASE}baked/${t}/` }
    }
    await r2.put(`staging/baked/${town}/content/listings.json`, JSON.stringify({ meta: {}, listings: LISTINGS }))
  } else {
    await r2.put(`ward/${W}/index.html`, WARD_DOC(W))
    await r2.put(`kit/${K}/manifest.json`, '{}')
    for (const t of [town, bare]) {
      const domain = `${t}.example`
      await r2.put(`hosts/${domain}.json`, JSON.stringify({ v: 2, app: 'ward', map: t, look: t, ward: W, kit: K, domain }))
      await r2.put(`baked/${t}/manifest.json`, JSON.stringify(mans[t]))
      await r2.put(`player/${t}/towns.json`, JSON.stringify(towns))
      at[t] = { root: `https://${domain}/`, slab: `https://${domain}/baked/${t}/` }
    }
    await r2.put(`baked/${town}/content/listings.json`, JSON.stringify({ meta: {}, listings: LISTINGS }))
  }
  const townImages = (t) => new Set(SHARE_IMAGE_RELS.map((rel) => at[t].slab + contentName(rel, mans[t].files[rel].sha256)))
  const cases = [
    [town, 'place/p-free/the-free-inn', 'a place with a public-domain photo', { title: LISTINGS[0].name, description: 'Hotels · 1 Front Street', image: `${at[town].slab}content/photos/free/01.jpg`, note: null }],
    [town, 'place/p-bysa/credit-museum', 'a place with a CC BY-SA photo', { title: LISTINGS[1].name, description: 'Museums · 2 High Street', image: 'town', note: /CC BY-SA 3\.0/ }],
    [town, 'place/p-none/plain-place', 'a place with no photo', { title: LISTINGS[2].name, description: 'Museums · 3 Low Street', image: 'town', note: null }],
    [town, 'place/p-gone/somewhere', 'a place the listings lack', { title: 'Card Town', url: at[town].root, image: 'town', note: /"p-gone".*no such place/ }],
    [bare, 'place/p-free/the-free-inn', 'a town that publishes no listings', { title: 'Bare Town', url: at[bare].root, image: 'town', note: /publishes no listings/ }],
    [town, '', 'the town\'s front page', { title: 'Card Town', description: 'A town.', url: at[town].root, image: 'town', note: null }],
  ]
  for (const [t, rest, label, want] of cases) {
    const r = await get(at[t].root + rest)
    const say = (m) => fails.push(`${site} · ${label}: ${m}`)
    if (r.status !== 200) { say(`served ${r.status}`); continue }
    const got = { title: tag(r.body, 'og:title'), description: tag(r.body, 'og:description'), url: tag(r.body, 'og:url'), image: tag(r.body, 'og:image') }
    if (got.title !== want.title) say(`og:title ${JSON.stringify(got.title)}, want ${JSON.stringify(want.title)}`)
    if ('description' in want && got.description !== want.description) say(`og:description ${JSON.stringify(got.description)}, want ${JSON.stringify(want.description)}`)
    const wantUrl = want.url ?? at[t].root + rest
    if (got.url !== wantUrl) say(`og:url ${JSON.stringify(got.url)}, want ${JSON.stringify(wantUrl)}`)
    if (want.image === 'town' ? !townImages(t).has(got.image) : got.image !== want.image) say(`og:image ${JSON.stringify(got.image)}, want ${want.image === 'town' ? 'one of the town\'s share images' : JSON.stringify(want.image)}`)
    const h = r.headers.get(CARD_HEADER) || ''
    if (want.note == null ? h !== 'complete' : !(h.startsWith('complete; ') && want.note.test(h))) say(`${CARD_HEADER} ${JSON.stringify(h)}, want ${want.note == null ? '"complete"' : `"complete; …" matching ${want.note}`}`)
  }
  await mf.dispose()
  return fails
}

const MUTANTS = [
  ['cardFor ignores the path', { [SHARE]: (s) => s.replace('const id = placeIdOf(path)', 'const id = null') }, ['production', 'staging']],
  ['the licence gate removed', { [SHARE]: (s) => s.replace('if (photo && PREVIEW_LICENCES.includes(photo.license))', 'if (photo)') }, ['production', 'staging']],
  ['the fallback said nowhere', { [SHARE]: (s) => s.replace("${card.note ? `; ${card.note}` : ''}", '') }, ['production', 'staging']],
  ['staging hands cardFor its whole path', { [WORKERS.staging]: (s) => s.replace("url.pathname.slice(`/${map}`.length) || '/'", 'url.pathname') }, ['staging']],
]
let failed = 0
for (const site of Object.keys(WORKERS)) {
  const real = await run(site)
  if (real.length) { failed += real.length; for (const f of real) console.log(`  ⛔ ${f}`) }
  else console.log(`  ✅ ${site}: a place link sends the place's card; a credited photo and an unknown place fall to the town's, by name`)
  for (const [name, m, sites] of MUTANTS) {
    if (!sites.includes(site)) continue
    const mut = await run(site, m)
    if (mut.length) console.log(`  ✅ mutation (${name}) is caught on ${site}: ${mut.length} failure(s), e.g. ${mut[0]}`)
    else { failed++; console.log(`  ⛔ mutation (${name}) PASSED on ${site} — the check cannot see it`) }
  }
}
console.log(failed ? `\n⛔ ${failed} failure(s)` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
