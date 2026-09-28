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
 *               contact. Not `lookId` or `domain` — a look is not the town, and the domain lives in
 *               Operations (src/lib/townOrigin.js).
 *   taxonomy  — the town's categories and types. No town authors its own yet, so this writes the
 *               KIT's list (ids and labels from src/tokens/categories.js) with `authored: false`, and
 *               drops the subtitles, which carry one town's wording. The player shows `authored:
 *               false` as visibly unauthored. Colours are not here: that is BRIEF-town-palette.
 *   content   — the town's content, PUBLISHED beside the slab into baked/<town>/content/: the derived
 *               roster (one record per baked building — bare-building cards read it) and listings
 *               (bake-content.js), and the hand-authored profile, menus and events. Each is named
 *               with its size and sha256, or `null` when the town has none — absent is said, never
 *               guessed. The source stays cartograph/data/<town>/content/; this is its publication,
 *               like the slab's. The override sidecars are inputs to bake-content, not payload.
 *   board     — the town's bulletin groups and sections. None authored yet: the kit's list, `authored:
 *               false`, generic labels, ids kept stable; Cary's group only where delivery is on.
 *   photos    — every photo a published listing names, copied beside the content, indexed by the
 *               listing's own url (null when the file is missing). Credit/licence ride on the listing.
 *   files     — every file of the slab with its size and sha256. ⚠️ v0 LISTS the existing names; it
 *               does not yet rename files by content. That, and the Worker and R2 side of it, is
 *               BRIEF-slab-loading §3 step 3.
 *
 * ⛔ No fallbacks: an unregistered town, or a town with no slab on disk, exits 2. It never writes a
 * manifest for one town out of another's data.
 *
 * Usage: node cartograph/bake-manifest.mjs --town=<map id>     (e.g. --town=provincetown)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { instanceForMap, registeredMaps } from '../src/instances/registry.js'
import CATEGORIES from '../src/tokens/categories.js'

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
const { lookId, domain, ...identity } = inst

// ── taxonomy: the kit's list, marked unauthored ───────────────────────────────
const categories = Object.entries(CATEGORIES).map(([id, c]) => ({
  id,
  label: c.label,
  types: Object.entries(c.subcategories || {}).map(([tid, t]) => ({ id: tid, label: t.label })),
}))

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
const files = {}
for (const p of walk(slabDir)) {
  const rel = relative(slabDir, p).split(sep).join('/')
  if (rel === 'manifest.json' || rel.startsWith('content/')) continue
  const buf = readFileSync(p)
  files[rel] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
}

const manifest = {
  version: 0,
  town,
  writtenAt: new Date().toISOString(),
  identity,
  taxonomy: { authored: false, categories },
  board: { authored: false, groups: boardGroups },
  content,
  photos,
  files,
}
writeFileSync(resolve(slabDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const total = Object.values(files).reduce((s, f) => s + f.bytes, 0)
const missingPhotos = Object.entries(photos).filter(([, v]) => !v).map(([k]) => k)
if (missingPhotos.length) console.error(`⚠️ ${missingPhotos.length} photo(s) named by listings are missing on disk: ${missingPhotos.slice(0, 5).join(', ')}${missingPhotos.length > 5 ? ' …' : ''}`)
const have = Object.entries(content).filter(([, v]) => v).map(([k]) => k.replace('.json', ''))
console.log(`✅ ${relative(ROOT, resolve(slabDir, 'manifest.json'))} — ${Object.keys(files).length} slab files, ${(total / 1e6).toFixed(1)} MB · content: ${have.join(', ') || 'none'} · photos ${Object.values(photos).filter(Boolean).length}/${Object.keys(photos).length}${photosOutsideTown ? ` (${photosOutsideTown} from the app's public/photos/)` : ''} · ${categories.length} categories (unauthored)`)
