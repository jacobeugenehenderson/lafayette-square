#!/usr/bin/env node
/**
 * bake-manifest — write a town's manifest: the one small file a player fetches first.
 *
 * WHY (2026-09-27). The Ward's bundle carries no town (theward README §7). It learns which town it
 * is, and everything about it, from `baked/<town>/manifest.json`. This is VERSION 0 of that file,
 * written so the Ward can be built against a real shape now: docs/briefs/BRIEF-slab-loading.md §2
 * ("one manifest per town; everything else immutable").
 *
 * WHAT v0 CARRIES
 *   identity  — the town's fixed identity, read from its module in src/instances/ (the single source
 *               today): name, geography, branding, legal, commerce, profile, modules, set-piece,
 *               contact. Not `lookId`, `domain` or `contentRoot` (see the destructure below).
 *   taxonomy  — the town's categories and types. No town authors its own yet, so this writes the
 *               KIT's list (ids and labels from src/tokens/categories.js) with `authored: false`, and
 *               drops the subtitles, which carry one town's wording. The player shows `authored:
 *               false` as visibly unauthored. Each category carries its colour in two forms, `neon` and
 *               `detail`, with `colorAuthored` (src/lib/categoryColor.js).
 *   look      — how the town looks: mark (also what its places are rated in), markStyle (regular | engraved | colored, the header ◉'s town mark),
 *               accent, litTint, locals ({ one, many }: what the town calls its locals), each with `<channel>Authored`
 *               (src/lib/townIdentity.js). From the baked scene.json's `identity`, i.e. the Look's
 *               design.json; an unchosen channel is the kit's neutral value, never another town's.
 *   content   — the town's content, PUBLISHED beside the slab into baked/<town>/content/: the derived
 *               roster (one record per baked building — bare-building cards read it) and listings
 *               (bake-content.js), and the hand-authored profile, menus and events. Each is named
 *               with its size and sha256, or `null` when the town has none — absent is said, never
 *               guessed. The source stays
 *               cartograph/data/<town>/content/; this is its publication,
 *               like the slab's. The override sidecars are inputs to bake-content, not payload.
 *   board     — the town's bulletin groups and sections. None authored yet: the kit's list, `authored:
 *               false`, generic labels, ids kept stable; Cary's group only where delivery is on.
 *   photos    — every photo a published listing names, copied beside the content, indexed by the
 *               listing's own url (null when the file is missing). Credit/licence ride on the listing.
 *   tide      — tidal towns only (terrain.json `water.tidal`): the station's harmonic constituents, MSL above MLLW and
 *               its datums, from raw/tide.json (fetch-water-datums --tide-only). The player times
 *               the tide from them (cartograph/tide.mjs); the levels stay the town's own. Kept whole, unrounded
 *               (Jacob: "keep the data"). A tidal town without them exits 2; a non-tidal town has no key at all.
 *   deployment — what each surface ships (src/lib/deployment.js): the town's cartograph/data/<town>/deployment.json,
 *               authored in Preview per surface, checked by readDeployment; `{ authored: false }` when the town has none
 *               (every surface then ships everything — said, never guessed). The only input of the manifest that a
 *               policy edit changes, so a policy change costs this step and nothing geometric.
 *   files     — every PUBLISHED file of the slab with its size and sha256 (scripts/slab-publish-rule.mjs). ⚠️ v0 LISTS the existing names; it
 *               does not yet rename files by content. That, and the Worker and R2 side of it, is
 *               BRIEF-slab-loading §3 step 3.
 *
 * ⛔ No fallbacks: an unregistered town, or a town with no slab on disk, exits 2. It never writes a
 * manifest for one town out of another's data.
 *
 * Usage: node cartograph/bake-manifest.mjs --town=<map id>     (e.g. --town=provincetown)
 */

import { categoryNeon, categoryDetail, isAuthoredCategory } from '../src/lib/categoryColor.js'
import { readDeployment } from '../src/lib/deployment.js'
import { resolveIdentity } from '../src/lib/townIdentity.js'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { instanceForMap, registeredMaps } from '../src/instances/registry.js'
import CATEGORIES from '../src/tokens/categories.js'
import { notPublished } from '../scripts/slab-publish-rule.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv.find(a => a.startsWith('--town='))
const town = arg && arg.slice('--town='.length)
if (!town) { console.error('⛔ --town=<map id> is required. Registered: ' + registeredMaps().join(', ')); process.exit(2) }

let inst
try { inst = instanceForMap(town) } catch (e) { inst = null }
if (!inst) { console.error(`⛔ "${town}" is not a registered town. Registered: ${registeredMaps().join(', ')}`); process.exit(2) }

const slabDir = resolve(ROOT, 'public/baked', town)
if (!existsSync(slabDir)) { console.error(`⛔ no slab on disk for "${town}" (${relative(ROOT, slabDir)}) — pour and bake it first`); process.exit(2) }

// ── identity ──────────────────────────────────────────────────────────────────
// Not baked: `lookId` (a look is not the town), `domain` (Operations owns it, src/lib/townOrigin.js), `contentRoot` (the
// kit app's own content URL prefix — machinery; a player reads `content` below). ▶ checks/claims-the-ward-reads-what-the-manifest-bakes.mjs
const { lookId, domain, contentRoot, ...identity } = inst

// ── taxonomy: the kit's list, marked unauthored ───────────────────────────────
// Each category's colour is the town's (its Look's neon, baked into scene.json), else the kit's neutral default —
// `colorAuthored` says which — in its two forms: `neon` (the map's tubes) and `detail` (the pastel for chips, dots and
// accents), both from src/lib/categoryColor.js, one source. A category is never dropped for having no colour of its own.
const bakedScene = JSON.parse(readFileSync(resolve(slabDir, 'scene.json'), 'utf8'))
if (!Array.isArray(bakedScene.neonAuthored)) { console.error(`⛔ "${town}"'s scene.json predates the town-palette bake (no neonAuthored) — re-bake its scene first, or the manifest would publish another town's colours`); process.exit(2) }
const categories = Object.entries(CATEGORIES).map(([id, c]) => ({
  id,
  label: c.label,
  neon: categoryNeon(id, bakedScene),
  detail: categoryDetail(id, bakedScene),
  colorAuthored: isAuthoredCategory(id, bakedScene),
  types: Object.entries(c.subcategories || {}).map(([tid, t]) => ({ id: tid, label: t.label })),
}))

// ── look: how the town looks (src/lib/townIdentity.js) — each channel the Look authored, else the kit's neutral value,
// with `<channel>Authored` so the Ward can say which. From the baked scene, the same one the map reads.
if (!bakedScene.identity || typeof bakedScene.identity !== 'object') { console.error(`⛔ "${town}"'s scene.json predates the identity block — re-bake its scene first`); process.exit(2) }
const look = resolveIdentity(bakedScene.identity)

// ── content: publish the payload the player reads ─────────────────────────────
// The player's content payload, by name. Declared once, here: these are what a player reads.
const CONTENT_PAYLOAD = ['roster.json', 'listings.json', 'profile.json', 'menus.json', 'events.json']
const contentSrc = resolve(ROOT, 'cartograph/data', town, 'content')
const contentOut = resolve(slabDir, 'content')
const content = {}
for (const name of CONTENT_PAYLOAD) {
  const src = resolve(contentSrc, name)
  if (!existsSync(src)) { content[name] = null; continue }
  const buf = readFileSync(src)
  try { JSON.parse(buf.toString('utf8')) } catch (e) { console.error(`⛔ ${relative(ROOT, src)} is not valid JSON: ${e.message}`); process.exit(2) }
  mkdirSync(contentOut, { recursive: true })
  writeFileSync(resolve(contentOut, name), buf)
  content[name] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
}

// ── photos: every photo a published listing names, published beside the content ──
// Listings name photos three ways today: '/photos/<slug>/NN.jpg' and '/photos/<town>/<id>/NN.jpg' (files in
// the kit's public/photos/), and 'photos/<slug>/NN.jpg' (files in the town's own content/photos/). Each is
// resolved to its file and copied to baked/<town>/content/photos/<same tail>, and the manifest's
// `photos` index maps the listing's own url → { path, bytes, sha256 }, or null when the file is missing —
// said, never skipped. Credit and licence travel on the listing record; the player must show them.
// ⚠️ Photos living in the app's public/photos/ are town data outside the town's folder (BRIEF-slab-loading ③);
// the manifest reports how many, so the move is visible.
const photos = {}
let photosOutsideTown = 0
const listingsFile = resolve(contentSrc, 'listings.json')
if (existsSync(listingsFile)) {
  const raw = JSON.parse(readFileSync(listingsFile, 'utf8'))
  const list = Array.isArray(raw) ? raw : (raw.listings || [])
  for (const l of list) {
    for (const ph of (l && l.photos) || []) {
      const url = typeof ph === 'string' ? ph : ph && ph.url
      if (!url || url in photos) continue
      const tail = url.replace(/^\/?photos\//, '')
      const src = url.startsWith('/') ? resolve(ROOT, 'public', url.slice(1)) : resolve(contentSrc, url)
      if (!existsSync(src)) { photos[url] = null; continue }
      if (url.startsWith('/')) photosOutsideTown++
      const buf = readFileSync(src)
      const out = resolve(contentOut, 'photos', tail)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, buf)
      photos[url] = { path: 'content/photos/' + tail, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
    }
  }
}

// ── board: the town's bulletin sections ───────────────────────────────────────
// No town authors its own yet, so this is the KIT's list, marked unauthored. Ids are kept stable so
// posts already filed under them still sort; labels are generic ("Notes", not one town's place name).
// Cary's group appears only where the town runs delivery (identity.modules.delivery.enabled).
const BOARD_DEFAULT = [
  { id: 'marketplace', label: 'Marketplace', sections: [
    { id: 'buy-nothing', label: 'Buy Nothing' }, { id: 'for-sale', label: 'For Sale' } ] },
  { id: 'services', label: 'Services', sections: [
    { id: 'professional-services', label: 'Professional' }, { id: 'domestic-services', label: 'Domestic' },
    { id: 'concierge', label: 'Concierge' } ] },
  { id: 'neighbors', label: 'Neighbors', sections: [
    { id: 'square-notes', label: 'Notes', anonymousByDefault: true },
    { id: 'missed-connections', label: 'Missed Connections', anonymousByDefault: true },
    { id: 'emergency-supplies', label: 'Emergency', anonymousByDefault: true } ] },
  { id: 'cary', label: 'Cary', requiresModule: 'delivery', sections: [
    { id: 'courier-board', label: 'Courier Board' }, { id: 'delivery-errands', label: 'Delivery & Errands' } ] },
]
const deliveryOn = !!(identity.modules && identity.modules.delivery && identity.modules.delivery.enabled)
const boardGroups = BOARD_DEFAULT
  .filter(g => g.requiresModule !== 'delivery' || deliveryOn)
  .map(({ requiresModule, ...g }) => g)

// ── files ─────────────────────────────────────────────────────────────────────
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}
// ⛔ Only what is PUBLISHED (scripts/slab-publish-rule.mjs, the uploader's own rule): a name here that R2 never holds is
// a file the manifest promises and no player can fetch. The rest are listed by count in the log line, never silently.
const files = {}
const notPublishedWhy = notPublished(slabDir, town)
const unlisted = {}
for (const p of walk(slabDir)) {
  const rel = relative(slabDir, p).split(sep).join('/')
  if (rel === 'manifest.json' || rel.startsWith('content/')) continue
  const no = notPublishedWhy(rel)
  if (no) { unlisted[no] = (unlisted[no] || 0) + 1; continue }
  const buf = readFileSync(p)
  files[rel] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
}

// ── tide: the station's clock, for a tidal town only ─────────────────────────
// Whether the town is tidal is the SLAB's answer (terrain.json `water.tidal`), never re-decided here.
let tide = null
const terrainP = resolve(slabDir, 'terrain.json')
const water = existsSync(terrainP) ? JSON.parse(readFileSync(terrainP, 'utf8')).water ?? null : null
if (water?.tidal === true) {
  const rawP = resolve(ROOT, 'cartograph/data', town, 'raw/tide.json')
  const t = existsSync(rawP) ? JSON.parse(readFileSync(rawP, 'utf8')) : null
  if (!t?.constituents?.length || !Number.isFinite(t.mslAboveDatumM)) {
    console.error(`⛔ "${town}" is tidal but has no tide clock in ${relative(ROOT, rawP)} — ▶ node cartograph/fetch-water-datums.mjs --scene=${town} --tide-only`)
    process.exit(2)
  }
  if (t.station !== water.station?.id) {
    console.error(`⛔ "${town}": the tide clock is station ${t.station} but the slab's water names ${water.station?.id} — re-acquire`)
    process.exit(2)
  }
  const { noaaHilo, ...clock } = t          // NOAA's own predictions are the check's fixture, not the player's
  tide = clock
}

// ── deployment: what each surface ships ─────────────────────────────────────
const deploymentP = resolve(ROOT, 'cartograph/data', town, 'deployment.json')
let deployment = { authored: false }
if (existsSync(deploymentP)) {
  try { deployment = readDeployment(JSON.parse(readFileSync(deploymentP, 'utf8')), relative(ROOT, deploymentP)) }
  catch (e) { console.error(`⛔ ${e.message}`); process.exit(2) }
}

const manifest = {
  version: 0,
  town,
  writtenAt: new Date().toISOString(),
  identity,
  look,
  taxonomy: { authored: false, categories },
  board: { authored: false, groups: boardGroups },
  content,
  photos,
  ...(tide ? { tide } : {}),
  deployment,
  files,
}
writeFileSync(resolve(slabDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const total = Object.values(files).reduce((s, f) => s + f.bytes, 0)
const missingPhotos = Object.entries(photos).filter(([, v]) => !v).map(([k]) => k)
if (missingPhotos.length) console.error(`⚠️ ${missingPhotos.length} photo(s) named by listings are missing on disk: ${missingPhotos.slice(0, 5).join(', ')}${missingPhotos.length > 5 ? ' …' : ''}`)
const have = Object.entries(content).filter(([, v]) => v).map(([k]) => k.replace('.json', ''))
console.log(`✅ ${relative(ROOT, resolve(slabDir, 'manifest.json'))} — ${Object.keys(files).length} slab files, ${(total / 1e6).toFixed(1)} MB · content: ${have.join(', ') || 'none'} · photos ${Object.values(photos).filter(Boolean).length}/${Object.keys(photos).length}${photosOutsideTown ? ` (${photosOutsideTown} from the app's public/photos/)` : ''} · ${categories.length} categories (unauthored)${tide ? ` · tide: ${tide.constituents.length} constituents, station ${tide.station}` : ''} · deployment ${deployment.authored ? 'authored' : 'none authored'}${Object.keys(unlisted).length ? ` · not published, so not listed: ${Object.entries(unlisted).map(([w, n]) => `${n} × ${w}`).join('; ')}` : ''}`)
