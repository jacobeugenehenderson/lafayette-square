#!/usr/bin/env node
/**
 * claims-a-towns-listings-reach-its-surfaces.mjs
 *
 * ⛔ THE CLASS: a town's listings are baked, committed and correct — and reach NOTHING the visitor sees,
 * with no error anywhere. Provincetown, 2026-09-25: 445 listings on disk, 0 in the staging player,
 * because `loadInstanceData.js#MANIFESTS` had no `provincetown` entry. The Society Pages, the ticker
 * and the neon all read the same `landmarks` entry through `useListings`, so one missing line blanked
 * all three, and a missing entry only `console.warn`s. The bake cannot see it; only the player can.
 *
 * Asserts, per town that has `content/listings.json` (and each line names the town and the count):
 *   wired      the town's look has a `landmarks` entry in MANIFESTS.
 *   society    > 0 listings file under a Society Pages section (`CATEGORY_LIST` — the accordion counts
 *              by `subcategory`), AND every listing does. A subcategory with no section is left off
 *              the pages silently (ROADMAP H-22 ②), so each one is NAMED — it is a failure, not a note.
 *   ticker     > 0 listings the ticker can speak for: hours + a tagline or description, and not in
 *              `TICKER_EXCLUDED` (read out of EventTicker.jsx, ROADMAP H-30). Excluded ones are counted.
 *   neon       > 0 listings with hours whose `building_id` is a building in the town's OWN slab
 *              (`public/baked/<scene>/buildings.json`) — the neon lights a building, not a listing.
 *
 * Reads every rule from its source: CATEGORY_LIST is imported, TICKER_EXCLUDED and MANIFESTS are parsed.
 *
 *     node checks/claims-a-towns-listings-reach-its-surfaces.mjs [scene…] [--self-test]
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { scenes } from './_scenes.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const readJson = (rel) => JSON.parse(read(rel))
const { CATEGORY_LIST } = await import(join(ROOT, 'src/tokens/categories.js'))

function loadSources() {
  return {
    manifest: read('src/data/loadInstanceData.js'),
    ticker: read('src/components/EventTicker.jsx'),
    sections: new Set(CATEGORY_LIST.flatMap(c => c.sections.map(s => s.id))),
  }
}

// The keys of MANIFESTS that carry a `landmarks:` loader. Parsed, not copied.
function wiredLooks(src) {
  const body = /const MANIFESTS = \{([\s\S]*?)\n\}/.exec(src)?.[1] || ''
  const out = new Set()
  const re = /\n  '?([a-z0-9-]+)'?:\s*\{([\s\S]*?)\n  \}/g
  for (let m; (m = re.exec(body));) if (/\blandmarks\s*:/.test(m[2])) out.add(m[1])
  return out
}

function tickerExcluded(src) {
  const m = /TICKER_EXCLUDED = new Set\(\[([^\]]*)\]\)/.exec(src)
  if (!m) return null
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
}

const firstSentence = (d) => (d || '').split(/(?<=[.!?])\s/)[0]

function measure(S, town) {
  const L = town.listings
  const unfiled = L.filter(l => !S.sections.has(l.subcategory))
  const EX = tickerExcluded(S.ticker)
  const speakable = L.filter(l => l.hours && (l.tagline || firstSentence(l.description)))
  const ticker = EX ? speakable.filter(l => !EX.has(l.category)) : []
  const neon = L.filter(l => l.hours && town.slabIds.has(l.building_id))
  return {
    wired: wiredLooks(S.manifest).has(town.lookId),
    society: L.length - unfiled.length, unfiled,
    ticker: ticker.length, tickerExcludedBy: speakable.length - ticker.length, tickerRuleFound: !!EX,
    neon: neon.length, withHours: L.filter(l => l.hours).length,
  }
}

function run(S, towns) {
  const out = []
  const assert = (name, ok, detail) => out.push({ name, ok: !!ok, detail })
  for (const t of towns) {
    const m = measure(S, t)
    const n = t.listings.length
    assert(`${t.scene}/wired`, m.wired, `${n} listings, and look '${t.lookId}' has no \`landmarks\` entry in loadInstanceData.js MANIFESTS — the player shows none of them`)
    assert(`${t.scene}/society`, m.society > 0 && m.unfiled.length === 0,
      `${m.society} of ${n} file under a Society Pages section; ${m.unfiled.length} do not: ` +
      Object.entries(m.unfiled.reduce((a, l) => ((a[`${l.category}/${l.subcategory}`] ||= []).push(l.name), a), {}))
        .map(([k, v]) => `${k} (${v.length}): ${v.join(', ')}`).join(' · '))
    assert(`${t.scene}/ticker`, m.tickerRuleFound && m.ticker > 0,
      m.tickerRuleFound ? `0 listings can reach the ticker (${m.withHours} have hours; ${m.tickerExcludedBy} dropped by TICKER_EXCLUDED)`
        : 'TICKER_EXCLUDED not found in EventTicker.jsx — the rule moved; this check must follow it')
    assert(`${t.scene}/neon`, m.neon > 0, `0 of ${m.withHours} listings with hours sit on a building in ${t.scene}'s own slab`)
    out.push({ info: `${t.scene}: listings ${n} · society ${m.society} · ticker ${m.ticker} (TICKER_EXCLUDED drops ${m.tickerExcludedBy}) · neon ${m.neon}` })
  }
  return out
}

function loadTowns(argv) {
  const looks = readJson('public/looks/index.json').looks
  const towns = []
  for (const scene of scenes('cartograph/data/<scene>/content/listings.json', argv)) {
    const j = readJson(`cartograph/data/${scene}/content/listings.json`)
    const look = looks.find(l => l.scene === scene)
    const slab = `public/baked/${scene}/buildings.json`
    const b = existsSync(join(ROOT, slab)) ? readJson(slab) : null
    towns.push({
      scene, lookId: look?.id ?? scene,
      listings: j.listings ?? j.landmarks ?? [],
      slabIds: new Set(((b && (b.buildings ?? b)) || []).map(x => x.id)),
      hasSlab: !!b,
    })
  }
  return towns
}

const argv = process.argv.slice(2)
const towns = loadTowns(argv.filter(a => a !== '--self-test'))
for (const t of towns) if (!t.hasSlab) console.log(`  ⚠ ${t.scene}: no public/baked/${t.scene}/buildings.json — neon measured against an empty slab`)
const S = loadSources()

const MUTATIONS = [
  { name: 'wired', apply: (S) => ({ ...S, manifest: S.manifest.replace(/(\n  '?[a-z0-9-]+'?:\s*\{[\s\S]*?)\blandmarks\s*:/g, '$1_landmarks:') }) },
  { name: 'society', apply: (S) => ({ ...S, sections: new Set([...S.sections].slice(1)) }) },
  { name: 'ticker', apply: (S) => ({ ...S, ticker: S.ticker.replace(/TICKER_EXCLUDED = new Set\(\[[^\]]*\]\)/, `TICKER_EXCLUDED = new Set([${CATEGORY_LIST.map(c => `'${c.id}'`).join(', ')}])`) }) },
]
const NEON_MUTATION = (ts) => ts.map(t => ({ ...t, slabIds: new Set() }))

if (argv.includes('--self-test')) {
  let bad = 0
  const probe = (label, results, suffix) => {
    const hit = results.filter(r => r.name?.endsWith(`/${suffix}`))
    if (!hit.length || hit.every(r => r.ok)) { console.log(`  ⛔ ${label} — defect planted and the check STAYED GREEN`); bad++ } else console.log(`  ✓ ${label} — went red`)
  }
  for (const m of MUTATIONS) probe(m.name, run(m.apply(S), towns), m.name)
  probe('neon', run(S, NEON_MUTATION(towns)), 'neon')
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not fail.` : '\n✅ every mutation produced its named failure.')
  process.exit(bad ? 1 : 0)
}

const res = run(S, towns)
for (const r of res) {
  if (r.info) { console.log(`    ${r.info}`); continue }
  console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
}
const checks = res.filter(r => !r.info), failed = checks.filter(r => !r.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} green`)
process.exit(failed.length ? 1 : 0)
