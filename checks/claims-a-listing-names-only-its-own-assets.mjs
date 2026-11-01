// claims-a-listing-names-only-its-own-assets.mjs — every file a listing names (its photos and its logo) is published in its
// own town's bake, indexed where the Ward reads it, and lives inside that town.
//
// ⭐ THE CLAIM, for every registered town (src/instances/registry.js, never a list here):
//   ① the bake's indexer (cartograph/listing-assets.mjs#indexListingAssets), DRIVEN: a logo is indexed under the listing's own
//      string exactly as a photo is; a missing file is indexed null (said, never skipped); a root path is counted. And the bake
//      routes through it and publishes the index as `manifest.photos`, the key the Ward reads (theward
//      src/content/photos.js#placeLogo: `manifest.photos[listing.logo]`).
//   ② the census: each url a town's listings name has a `photos` entry in public/baked/<look>/manifest.json whose file is in
//      the bake. A town with no bake on disk FAILS by name; it is never skipped.
//   ③ no listing names a ROOT path ('/photos/…', '/logos/…'): town data in the kit's shared public/, which every town's
//      build carries and no town's bake owns; nor another host's URL, which no bake publishes (the Ward never shows it).
//
// ⛔ Why: until 2026-11-01 the bake indexed `l.photos` only, so no town's logo ever reached the Ward (LS's 14, HPDM's 8: every
// card fell back to initials), and LS's logos lived at the kit's root /logos/, published only by the retired legacy player.
// ⏳ ③ is RED BY RULING (Boz, 2026-11-01): the photos LS and Huron still name under /photos/ (the kit's public/photos) move into
// their towns' content in a separate data move; this check names them until then and never skips them.
//
// Usage: node checks/claims-a-listing-names-only-its-own-assets.mjs [--mutants] [-v]
//   --mutants: the logo is not read · a missing file is skipped · the bake walks listings itself · the bake's index leaves
//   `photos` · a root /logos/ path returns · an indexed file is missing from the bake. A data mutant is killed only by a
//   failure the unmutated run does not have, so a town with no bake on disk cannot kill it for the wrong reason.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { importSource, sourceOf } from './_importSource.mjs'

const VERBOSE = process.argv.includes('-v')
const { registeredMaps, instanceForMap } = await import(pathToFileURL(join(ROOT, 'src/instances/registry.js')))
const listingsOf = (raw) => Array.isArray(raw) ? raw : (raw?.listings || [])

async function verdict(m = {}) {
  const fails = [], counts = []
  const LA = await importSource('cartograph/listing-assets.mjs', { transform: m.assets })

  // ── ① the indexer, driven ──────────────────────────────────────────────────────────────────────────────────────────
  const have = new Set(['/T/content/logos/a.png', '/T/content/photos/p/01.jpg', '/K/public/photos/q/01.jpg'])
  const ROOTS = new Set(['/T/content/logos', '/T/content/photos', '/K/public/photos'])
  const { index, outsideTown } = LA.indexListingAssets(
    [{ logo: 'logos/a.png', photos: ['photos/p/01.jpg', { url: '/photos/q/01.jpg' }] }, { logo: 'logos/gone.png' }],
    { resolveSrc: (u) => u.startsWith('/') ? '/K/public' + u : '/T/content/' + u, exists: (p) => have.has(p) || ROOTS.has(p),
      rootOf: (u) => u.startsWith('/') ? '/K/public/' + u.split('/')[1] : '/T/content/' + u.split('/')[0],
      publish: (src, tail) => ({ path: 'content/' + tail, bytes: 1, sha256: 'x' }) })
  if (index['logos/a.png']?.path !== 'content/logos/a.png') fails.push("① a listing's logo is not indexed under its own string (the Ward reads manifest.photos[listing.logo])")
  if (index['photos/p/01.jpg']?.path !== 'content/photos/p/01.jpg') fails.push('① a town-relative photo is not indexed at its own tail')
  if (index['/photos/q/01.jpg']?.path !== 'content/photos/q/01.jpg') fails.push('① a root photo is not published at its tail')
  if (!('logos/gone.png' in index) || index['logos/gone.png'] !== null) fails.push('① a missing file is not indexed null: skipped, so never said')
  if (outsideTown !== 1) fails.push(`① the root path is not counted outside the town (counted ${outsideTown})`)
  try {
    LA.indexListingAssets([{ photos: ['/photos/q/01.jpg', '/photos/q/02.jpg'] }], { resolveSrc: (u) => '/K/public' + u, exists: () => false,
      rootOf: () => '/K/public/photos', publish: () => ({}) })
    fails.push('① a whole asset root absent did not refuse: it would bake as a success line with nearly every file null')
  } catch { /* refused */ }
  const bakeRoots = m.bake ? m.bake(sourceOf('cartograph/bake-manifest.mjs')) : sourceOf('cartograph/bake-manifest.mjs')
  if (!/rootOf: \(url\) =>/.test(bakeRoots)) fails.push("① the bake gives the indexer no rootOf, so a missing asset root cannot refuse")

  const bake = m.bake ? m.bake(sourceOf('cartograph/bake-manifest.mjs')) : sourceOf('cartograph/bake-manifest.mjs')
  if (!/const \{ index: photos, outsideTown: photosOutsideTown \} = indexListingAssets\(/.test(bake)) fails.push('① the bake does not index listing assets through cartograph/listing-assets.mjs#indexListingAssets')
  if (!/\n  photos,\n/.test(bake)) fails.push("① the bake's manifest does not carry the index as `photos`, the key the Ward reads")

  // ── ② the census and ③ root paths, every registered town ─────────────────────────────────────────────────────────
  const exists = m.exists ? m.exists(existsSync) : existsSync
  for (const map of registeredMaps()) {
    const look = instanceForMap(map)?.lookId || map
    const at = join(ROOT, 'cartograph/data', map, 'content/listings.json')
    if (!existsSync(at)) { counts.push(`${map}: no listings`); continue }
    const text = m.listings ? m.listings(map, readFileSync(at, 'utf8')) : readFileSync(at, 'utf8')
    const urls = [...new Set(listingsOf(JSON.parse(text)).flatMap((l) => LA.listingAssetUrls(l)))]
    const root = urls.filter((u) => u.startsWith('/'))
    if (root.length) fails.push(`③ ${map}: ${root.length} listing path(s) at the kit's root, outside the town (e.g. ${root[0]})`)
    const offsite = urls.filter((u) => /^[a-z]+:/i.test(u))
    if (offsite.length) fails.push(`③ ${map}: ${offsite.length} listing path(s) on another host, which no bake publishes (e.g. ${offsite[0]})`)
    const logos = urls.filter((u) => listingsOf(JSON.parse(text)).some((l) => l.logo === u)).length
    if (!urls.length) { counts.push(`${map}: names no files`); continue }
    const manAt = join(ROOT, 'public/baked', look, 'manifest.json')
    if (!existsSync(manAt)) { fails.push(`② ${map}: no bake at public/baked/${look}/manifest.json, so its ${urls.length} files are unmeasured`); continue }
    const photos = JSON.parse(readFileSync(manAt, 'utf8')).photos || {}
    let indexed = 0, present = 0
    const unindexed = [], atSource = [], missing = []
    for (const u of urls) {
      if (offsite.includes(u)) continue   // ③ names it; no bake can
      const e = photos[u]
      if (e === null) { atSource.push(u); continue }
      if (!e) { unindexed.push(u); continue }
      indexed++
      if (exists(join(ROOT, 'public/baked', look, e.path))) present++; else missing.push(e.path)
    }
    counts.push(`${map}: ${urls.length} named (${logos} logos) · ${indexed} indexed · ${present} present`)
    if (unindexed.length) fails.push(`② ${map}: ${unindexed.length} file(s) a listing names are not in manifest.photos (e.g. ${unindexed[0]}): re-bake its manifest`)
    if (atSource.length) fails.push(`② ${map}: ${atSource.length} file(s) a listing names were missing when it baked (indexed null; e.g. ${atSource[0]})`)
    if (missing.length) fails.push(`② ${map}: ${missing.length} indexed file(s) are not in the bake (e.g. ${missing[0]})`)
  }
  return { fails, counts }
}

const { fails, counts } = await verdict()
console.log('listing assets, by town:\n  ' + counts.join('\n  '))
if (fails.length) { console.log('⛔ a listing names a file its town does not publish:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ every file a listing names is published in its own town, indexed where the Ward reads it')

if (process.argv.includes('--mutants')) {
  const must = (from, to) => (s) => { if (!s.includes(from)) throw new Error(`[listing-assets check] ⛔ mutant anchor gone: ${from.slice(0, 80)}`); return s.replace(from, to) }
  const base = new Set(fails)
  const mutants = [
    ['the logo is not read', { assets: must("  if (l && typeof l.logo === 'string' && l.logo) out.push(l.logo)\n", '') }],
    ['a missing file is skipped', { assets: must('if (!exists(src)) { index[url] = null; continue }', 'if (!exists(src)) continue') }],
    ['a missing asset root bakes as a success', { assets: must('  if (goneRoots.size) throw', '  if (false) throw') }],
    ['the bake walks listings itself', { bake: must('= indexListingAssets(', '= ((list, o) => ({ index: {}, outsideTown: 0 }))(') }],
    ["the bake's index leaves `photos`", { bake: must('\n  photos,\n', '\n  assets: photos,\n') }],
    ['a root /logos/ path returns', { listings: (map, t) => map === 'lafayettesquare' ? must('"logo": "logos/', '"logo": "/logos/')(t) : t }],
    ['an indexed file is missing from the bake', { exists: (real) => { let first = true; return (p) => (p.includes('/content/') && first) ? (first = false) : real(p) } }],
  ]
  let bad = 0
  for (const [name, m] of mutants) {
    const { fails: f } = await verdict(m)
    const fresh = f.filter((x) => !base.has(x))
    console.log(`${fresh.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${VERBOSE && fresh.length ? ` (${fresh[0]})` : ''}`)
    if (!fresh.length) bad++
  }
  if (bad) process.exitCode = 1
}
