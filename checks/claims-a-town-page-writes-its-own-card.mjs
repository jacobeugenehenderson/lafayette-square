#!/usr/bin/env node
/**
 * claims-a-town-page-writes-its-own-card — a town's served page carries its whole share card, whichever player
 * document is served, on both sites.
 *
 * ⛔ THE DEFECT (2026-10-26). Both Workers wrote the card by REWRITING `meta[property="og:title"]` and the like,
 * which only touches tags already in the document. The kit's index.html carried placeholders; the Ward's carries
 * none, so every Ward town (Promote serves the Ward, 30bcd111) served no og:/twitter: tags at all and its links
 * previewed as bare URLs. Nothing inspected the served head, so nothing went red.
 *
 * Drives each Worker's real `fetch` in Miniflare (the real HTMLRewriter) against an in-memory R2, and reads the
 * served `<head>`:
 *   1. a Ward-shaped document with NO og tags → every tag in `shareCard.js#CARD_TAGS` (read, never restated) is
 *      there exactly once, with the town's own title, description, picture and url; header `complete`.
 *   2. a kit-shaped document WITH placeholder tags → the same, exactly once each (the placeholders are removed).
 *   3. a town whose slab has no share image → served (200), the image tags absent, and the header names them.
 * Mutants, run every time, must turn it RED: (a) the old rewrite-only selectors; (b) a missing value dropped
 * silently (no header).
 *   node checks/claims-a-town-page-writes-its-own-card.mjs
 */
import { join } from 'node:path'
import { workerInMiniflare, mint, hex } from './_miniflare.mjs'
import { CARD_TAGS, CARD_HEADER, SHARE_IMAGE_RELS } from '../src/lib/shareCard.js'
import { HASHED, contentName } from '../src/lib/slabNames.js'

const ROOT = new URL('..', import.meta.url).pathname
const SHARE = join(ROOT, 'src/lib/shareCard.js')
const WORKERS = { production: join(ROOT, 'workers/production-sites/src/index.js'), staging: join(ROOT, 'workers/staging-sites/src/index.js') }

const GEO = { lat: 42.05, lon: -70.19, timezone: 'America/New_York' }   // any real place; the slot is not under test
const sha = () => hex() + hex().slice(0, 24)
const manifest = (map, withShare) => {
  const files = {}
  if (withShare) for (const rel of SHARE_IMAGE_RELS) files[rel] = { sha256: sha() }
  return { town: map, names: HASHED, identity: { geography: GEO }, files }
}
const WARD_DOC = (w) => `<!doctype html><html><head>\n<meta charset="UTF-8" />\n<meta name="ward-build" content="${w}">\n<title>The Ward</title>\n<script type="module" src="/_ward/${w}/assets/index.js"></script></head><body>WARD</body></html>`
const KIT_DOC = '<!doctype html><html><head><meta charset="UTF-8" /><title>Lafayette Square</title>\n'
  + '<meta property="og:title" content="Lafayette Square" /><meta property="og:image" content="" /><meta property="og:type" content="website" />'
  + '<meta property="og:url" content="https://lafayette-square.com/" /><meta name="twitter:card" content="summary_large_image" />'
  + '<meta name="twitter:title" content="Lafayette Square" /><meta name="twitter:image" content="" /></head><body>LEGACY</body></html>'

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
function headTags(body) {
  const head = (body.match(/<head>([\s\S]*?)<\/head>/) || [])[1] || ''
  const tags = {}
  for (const m of head.matchAll(/<meta (property|name)="((?:og|twitter):[^"]+)" content="([^"]*)"/g)) (tags[m[2]] ||= []).push(unesc(m[3]))
  return tags
}

/** Every failure, for one Worker, optionally a mutant. */
async function run(site, mutate) {
  const fails = []
  const W = hex(), K = hex()
  const [ward, legacy, bare] = ['ward', 'legacy', 'bare'].map(mint)
  const towns = {
    [ward]: { title: 'Ward "Town" & Co', description: 'A town on the Ward.' },
    [legacy]: { title: 'Kit Town' },
    [bare]: { title: 'No Picture Town', description: 'Published before its capture.' },
  }
  const mans = { [ward]: manifest(ward, true), [legacy]: manifest(legacy, true), [bare]: manifest(bare, false) }
  const SLAB_BASE = 'https://assets.example/staging/'
  const bindings = site === 'staging'
    ? { SITE_PREFIX: 'staging/sites/', PLAYER_PREFIX: 'staging/player/', WARD_PREFIX: 'staging/ward/', SLAB_BASE, OPERATIONS_URL: 'http://ops.invalid' }
    : {}
  const { mf, r2, get } = await workerInMiniflare(WORKERS[site], bindings, { mutate: mutate ? { [SHARE]: mutate } : null })
  const page = {}
  if (site === 'staging') {
    await r2.put('staging/player/towns.json', JSON.stringify(towns))
    await r2.put('staging/player/index.html', KIT_DOC)
    await r2.put('staging/ward/current.json', JSON.stringify({ sha: W, kit: K }))
    await r2.put(`staging/ward/${W}/index.html`, WARD_DOC(W))
    await r2.put(`staging/kit/${K}/manifest.json`, '{}')
    for (const t of [ward, legacy, bare]) {
      await r2.put(`staging/baked/${t}/manifest.json`, JSON.stringify(mans[t]))
      await r2.put(`staging/sites/${t}/player.json`, JSON.stringify({ player: t === legacy ? 'legacy' : 'ward' }))
      page[t] = { url: `https://staging.example/${t}/`, ogUrl: `https://staging.example/${t}/`, slab: `${SLAB_BASE}baked/${t}/` }
    }
  } else {
    await r2.put(`ward/${W}/index.html`, WARD_DOC(W))
    await r2.put(`kit/${K}/manifest.json`, '{}')
    for (const t of [ward, legacy, bare]) {
      const domain = `${t}.example`
      const rec = t === legacy ? { v: 2, app: 'legacy', map: t, look: t, domain } : { v: 2, app: 'ward', map: t, look: t, ward: W, kit: K, domain }
      await r2.put(`hosts/${domain}.json`, JSON.stringify(rec))
      await r2.put(`baked/${t}/manifest.json`, JSON.stringify(mans[t]))
      await r2.put(`player/${t}/towns.json`, JSON.stringify(towns))
      if (t === legacy) await r2.put(`player/${t}/index.html`, KIT_DOC)
      page[t] = { url: `https://${domain}/`, ogUrl: `https://${domain}/`, slab: `https://${domain}/baked/${t}/` }
    }
  }

  for (const [t, label] of [[ward, 'a Ward document with no og tags'], [legacy, 'a kit document with placeholder tags'], [bare, 'a town with no share image']]) {
    const r = await get(page[t].url)
    const tags = headTags(r.body)
    const say = (m) => fails.push(`${site} · ${label}: ${m}`)
    if (r.status !== 200) { say(`served ${r.status}, not the page`); continue }
    const images = new Set(SHARE_IMAGE_RELS.map((rel) => page[t].slab + contentName(rel, mans[t].files[rel]?.sha256 || '0'.repeat(64))))
    const want = (tag) => {
      if (tag.fixed) return tag.fixed
      if (tag.from === 'title') return towns[t].title
      if (tag.from === 'description') return towns[t].description ?? null
      if (tag.from === 'url') return page[t].ogUrl
      if (tag.from === 'image') return t === bare ? null : 'one of the town\'s share images'
      throw new Error(`CARD_TAGS names "${tag.from}", which this check does not know — teach it`)
    }
    const absent = []
    for (const tag of CARD_TAGS) {
      const got = tags[tag.key] || [], w = want(tag)
      if (w == null) { if (got.length) say(`${tag.key} is served (${got[0]}) though the card has no value`); if (!tag.optional) absent.push(tag.key); continue }
      if (got.length !== 1) { say(`${tag.key} appears ${got.length} times, not once`); continue }
      const okv = tag.from === 'image' ? images.has(got[0]) : got[0] === w
      if (!okv) say(`${tag.key} = ${JSON.stringify(got[0])}, want ${tag.from === 'image' ? `one of ${[...images][0]} …` : JSON.stringify(w)}`)
    }
    if (tags['og:image']?.[0] !== tags['twitter:image']?.[0]) say('og:image and twitter:image differ')
    const h = r.headers.get(CARD_HEADER) || ''
    if (absent.length) {
      if (!h.startsWith('incomplete') || absent.some((k) => !h.includes(k))) say(`missing ${absent.join(' ')}, but ${CARD_HEADER} says ${JSON.stringify(h)} — a silent drop`)
    } else if (h !== 'complete') say(`${CARD_HEADER} says ${JSON.stringify(h)}, want "complete"`)
  }
  await mf.dispose()
  return fails
}

// (a) The pre-2026-10-26 writer: rewrite whatever tags the document has, drop a tag whose value is empty.
const OLD = (s) => s.replace(/\.on\('meta\[property\^="og:"\]', drop\)[\s\S]*?\n    \} \}\)\n(?=    \.on\('title')/, () =>
  `.on('head', { element(el) { if (card.description) el.append(\`<meta property="og:description" content="\${escAttr(card.description)}" />\`, { html: true }) } })
    .on('meta[property="og:title"]', { element(el) { card.title ? el.setAttribute('content', card.title) : el.remove() } })
    .on('meta[name="twitter:title"]', { element(el) { card.title ? el.setAttribute('content', card.title) : el.remove() } })
    .on('meta[property="og:image"]', { element(el) { card.image ? el.setAttribute('content', card.image) : el.remove() } })
    .on('meta[name="twitter:image"]', { element(el) { card.image ? el.setAttribute('content', card.image) : el.remove() } })
    .on('meta[property="og:url"]', { element(el) { card.url ? el.setAttribute('content', card.url) : el.remove() } })
`)
// (b) A missing value dropped without a word.
const SILENT = (s) => s.replace(/const why = missing\.length \?[^\n]*/, "const why = ''")

let failed = 0
for (const site of Object.keys(WORKERS)) {
  const real = await run(site)
  if (real.length) { failed += real.length; for (const f of real) console.log(`  ⛔ ${f}`) }
  else console.log(`  ✅ ${site}: a Ward page and a kit page each carry the town's whole card, once; a town with no picture is served and says what is missing`)
  for (const [name, m] of [['the old rewrite-only selectors', OLD], ['a silently dropped tag', SILENT]]) {
    const mut = await run(site, m)
    if (mut.length) console.log(`  ✅ mutation (${name}) is caught on ${site}: ${mut.length} failure(s), e.g. ${mut[0]}`)
    else { failed++; console.log(`  ⛔ mutation (${name}) PASSED on ${site} — the check cannot see it`) }
  }
}
console.log(failed ? `\n⛔ ${failed} failure(s)` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
