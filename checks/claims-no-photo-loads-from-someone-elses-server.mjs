#!/usr/bin/env node
/**
 * claims-no-photo-loads-from-someone-elses-server — every listing photograph is ours, and
 * every one says where it came from.
 *
 * ⛔⛔ HOTLINKING MAKES A LOCAL RESOURCE DEPEND ON THE PLATFORMS IT EXISTS TO REPLACE.
 * Ruled by Jacob, 2026-09-22. Measured on huron before the fix: of 63 images, **20 loaded
 * from a platform CDN** — 13 Wix, 6 Shopify, 1 Squarespace — each request carrying a
 * `Referer` that tells that platform which card on the town's map a visitor is reading.
 *
 * ⛔⛔ AND THE SHARPER REASON THIS TOWN SUPPLIED: A HOTLINKED IMAGE ON A LAPSED DOMAIN IS
 * AN INJECTION VECTOR. Huron gave us three local domains that lapsed and were re-registered
 * by squatters serving offshore casinos. Had one carried an image we hotlinked, the
 * squatter would control what renders on the town's map — under a credit line still naming
 * the business. A wrong LINK is visible in the data; a wrong IMAGE only appears on screen,
 * which is why this needs a check and not a habit.
 *
 * ⭐ CREDIT IS CHECKED HERE TOO, AND THAT IS NOT A SEPARATE CONCERN. Hosting a copy asserts
 * a right; the credit and the link back are most of what makes that defensible. An
 * uncredited photograph is tolerable on a hotlink and is not tolerable on a copy.
 *
 * ⭐ AND `source_url` IS LOAD-BEARING ONCE THE FILE IS OURS — it becomes the only surviving
 * record of where the picture came from. Losing it turns a sourced photograph into an
 * anonymous one with no way back.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nNo photo loads from someone else\'s server')

let scenes = 0
for (const scene of readdirSync(path.join(ROOT, 'cartograph/data'))) {
  const lp = path.join(ROOT, 'cartograph/data', scene, 'content/listings.json')
  if (!existsSync(lp)) continue
  const raw = JSON.parse(readFileSync(lp, 'utf8'))
  const arr = Array.isArray(raw) ? raw : (raw.listings || [])
  const photos = []
  for (const l of arr) for (const p of (l.photos || [])) photos.push([l, typeof p === 'string' ? { url: p } : p])
  if (!photos.length) continue
  scenes++

  // ⛔ CROSS-ORIGIN MEANS IT NAMES A HOST, not "lacks a leading slash". hipointe-demun
  // writes `photos/cheshire/01.jpg` without one — relative, and entirely ours. The first
  // version of this check called 20 of its own files foreign.
  const isRemote = (u) => /^(https?:)?\/\//i.test(u || '')
  const remote = photos.filter(([, p]) => isRemote(p.url))
  for (const [l, p] of remote.slice(0, 6)) {
    let host = p.url; try { host = new URL(p.url).hostname } catch {}
    bad(`${scene}: "${l.name}" loads a photo from ${host}\n` +
        `       ${p.url}\n` +
        `     ▶ node cartograph/fetch-photos.mjs --scene=${scene} brings it onto our own server and rewrites the URL.`)
  }
  if (remote.length > 6) bad(`${scene}: …and ${remote.length - 6} more cross-origin photo(s)`)
  if (!remote.length) ok(`${scene}: all ${photos.length} photo(s) served from our own paths`)

  // ⭐ CREDIT IS OWED ON WHAT WE COPIED FROM SOMEONE, not on what was shot for the project.
  // A photograph with no `source_url` predates this tooling and may well be the project's
  // own — hipointe-demun's twenty are exactly that, and failing them would be demanding a
  // credit for an image we already own.
  const copied = photos.filter(([, p]) => p.source_url)
  const noCredit = copied.filter(([, p]) => !p.credit)
  if (noCredit.length) bad(`${scene}: ${noCredit.length} COPIED photo(s) with no \`credit\` — hosting a copy asserts a right, and the credit is most of what makes that defensible:\n       ${noCredit.slice(0, 3).map(([l, p]) => `${l.name} — ${p.source_url}`).join('\n       ')}`)
  else if (copied.length) ok(`${scene}: every copied photo carries a credit`)
  const unsourced = photos.filter(([, p]) => !p.source_url && !p.credit).length
  if (unsourced) console.log(`  ⚠️  ${scene}: ${unsourced} photo(s) carry neither a source nor a credit — presumed shot for the project, but the schema cannot tell that from "we forgot".`)
  const orphaned = photos.filter(([, p]) => p.url?.startsWith(`/photos/${scene}/`) && !p.source_url)
  if (orphaned.length) bad(`${scene}: ${orphaned.length} photo(s) under /photos/${scene}/ have no \`source_url\` — once a file is ours that field is the only surviving record of where it came from`)
  else if (copied.length) ok(`${scene}: every copied photo keeps its \`source_url\``)

  // ⛔ ONLY A NAMED FORMAL LICENCE OWES A LINK. `license` is carrying two different things:
  // a licence ("CC BY-SA 3.0") and a statement that there is none ("NOT STATED — the
  // business's own published image of itself"). The first version demanded a URL for both
  // and so failed the records where a researcher had been most careful. ⚠️ That the same
  // field holds a licence and the absence of one is a schema smell worth fixing later; the
  // check works around it rather than pretending it is clean.
  const FORMAL = /^\s*(cc[ -]|creative commons|gfdl|ogl\b|mit\b|apache)/i
  const licensed = photos.filter(([, p]) => p.license && FORMAL.test(p.license))
  const unlinked = licensed.filter(([, p]) => !p.license_url)
  if (unlinked.length) bad(`${scene}: ${unlinked.length} photo(s) name a licence with no \`license_url\` — the obligation is to point at the licence, not merely to name it`)
  else if (licensed.length) ok(`${scene}: ${licensed.length} licensed photo(s), each linking its licence`)
}
if (!scenes) { console.log('  · no scene carries photos yet\n'); process.exit(0) }

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
