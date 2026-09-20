#!/usr/bin/env node
/**
 * CLAIM: `cartograph/overture-licence.mjs`'s DATASET_LICENCES still says what
 *        Overture's own attribution page says — read from the bytes, today.
 *
 * ⛔ WHY THIS IS A CHECK AND NOT A SENTENCE IN A DOC. `CLAUDE.md`: "if it can be
 * checked by running something, it is a CHECK — not prose", and "a check must
 * READ the source, never restate it." A licence transcribed into a table is
 * stale the moment upstream edits it, and the repo has already paid for that
 * once: Microsoft's footprints were recorded here as ODbL for months and are
 * CDLA Permissive 2.0. Nobody noticed because nothing re-read the bytes.
 *
 * ⛔ THIS IS A `live` CHECK BY CONSTRUCTION. It calls fetch, so `checks/tier.mjs`
 * tiers it `live` by reading its source and it stays out of `npm test`. That is
 * correct: it asks a question only the network can answer.
 *   ▶ node checks/claims-overture-licence-table-is-current.mjs
 *
 * ⭐ WHAT IT IS REALLY DEFENDING. Not spelling. Overture PLACES has no theme
 * licence — obligations are per contributing dataset — so this table is the only
 * thing standing between a town's places and a guessed licence on a public
 * attribution surface. If Overture adds a contributor, or moves one from CDLA to
 * something else, every town poured after that moment credits it wrongly.
 */
import { DATASET_LICENCES } from '../cartograph/overture-licence.mjs'

const STAC = 'https://stac.overturemaps.org/catalog.json'
const fail = []
const note = []

const getJson = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`)
  return r.json()
}

// ── 1. The collection still declares that it has no single licence ──────────
const root = await getJson(STAC)
const relLink = root.links.find(l => l.rel === 'child' && /latest/i.test(l.title || '')) || root.links.find(l => l.rel === 'child')
const relCat = await getJson(relLink.href)
const placesCat = await getJson(relCat.links.find(l => l.rel === 'child' && l.title === 'places').href)
const coll = await getJson(placesCat.links.find(l => l.rel === 'child').href)
const release = relLink.href.split('/').slice(-2)[0]

if (coll.license !== 'other') {
  // ⭐ NOT automatically a failure — it could mean Overture ADOPTED a theme
  // licence, which would be good news and a real change to how this kit
  // credits places. Either way nobody may find out by accident.
  fail.push(`the places collection now declares license="${coll.license}" (was "other").\n` +
            `   ⇒ Overture may have adopted a theme-level licence. Re-read cartograph/overture-licence.mjs's\n` +
            `     header premise before trusting the per-dataset derivation.`)
}
const licenceLink = coll.links.find(l => l.rel === 'license')?.href
if (!licenceLink) fail.push('the places collection no longer carries a rel="license" link — the table has no source to check against.')

// ── 2. The attribution page's Places section, parsed from its own markup ────
const html = await (await fetch(licenceLink)).text()
const anchor = html.indexOf('Data from')
const end = html.indexOf('</ul>', html.lastIndexOf('AllThePlaces') >= 0 ? html.lastIndexOf('AllThePlaces') : anchor)
const start = html.lastIndexOf('<ul', html.lastIndexOf('AllThePlaces'))
const section = start >= 0 && end > start ? html.slice(start, end) : ''

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'").trim()
const found = new Map()
for (const li of section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
  const text = strip(li[1])
  const m = /^Data from ([^.]+)\./.exec(text)
  if (!m) continue
  // ⚠️ The sentence ENDS in a decimal point — "Available under CDLA Permissive 2.0."
  // A naive `[^.]+` stops at the "2." and reports every row as drifted, which is a
  // check that cries wolf and therefore a check nobody will keep. Lazy up to a dot
  // followed by whitespace-or-end instead.
  const licence = /Available under (.+?)\.(?:\s|$)/.exec(text)?.[1] || null
  found.set(m[1].trim().toLowerCase(), { display: m[1].trim(), licence, text })
}

// ⛔ ZERO PARSED IS A FAILURE, NOT A PASS. This is the silent-substitution class
// the whole repo is organised against: a page redesign that breaks this parser
// would otherwise report "no drift" forever, which is the most dangerous green
// there is. A source we cannot read is reported as unreadable.
if (!found.size) {
  fail.push(`parsed 0 dataset entries from ${licenceLink}.\n` +
            `   ⛔ That is a BROKEN PARSER, not an empty list — this check cannot see the page any more,\n` +
            `     so it can no longer tell you whether the table is current. Fix the parse; do not ignore it.`)
}

// ── 3. Compare, in both directions ──────────────────────────────────────────
if (found.size) {
  for (const [key, got] of found) {
    const have = DATASET_LICENCES[key]
    if (!have) {
      // A new contributor. Every town poured from here on carries records we
      // cannot licence until someone adds it.
      fail.push(`NEW CONTRIBUTOR on the attribution page: "${got.display}" (${got.licence || 'licence unparsed'}).\n` +
                `   ⇒ Add it to DATASET_LICENCES in cartograph/overture-licence.mjs, with its \`requires\`.`)
      continue
    }
    if (got.licence && have.name && !got.licence.toLowerCase().startsWith(have.name.toLowerCase())) {
      fail.push(`LICENCE CHANGED for "${got.display}": table says "${have.name}", the page says "${got.licence}".\n` +
                `   ⛔ This is the MSBF failure repeating. Re-read the terms and update \`name\`, \`url\` AND \`requires\`.`)
    }
  }
  for (const key of Object.keys(DATASET_LICENCES)) {
    if (!found.has(key)) {
      // ⚠️ Not a hard failure: a contributor can be dropped from the page while
      // records sourced from it still sit in towns already poured. But the table
      // must not quietly outlive its source.
      note.push(`"${DATASET_LICENCES[key].source}" is in the table but no longer on the page — ` +
                `kept, because already-poured towns may still carry its records. Confirm before removing.`)
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`[claims-overture-licence-table-is-current] release ${release} · ${found.size} datasets on the page · ${Object.keys(DATASET_LICENCES).length} in the table`)
for (const n of note) console.log(`  ⚠️  ${n}`)
if (fail.length) {
  console.error(`\n⛔ FAIL — ${fail.length} drift(s) between the table and the source:\n`)
  for (const f of fail) console.error(`  • ${f}\n`)
  console.error(`  ▶ the source of truth is ${licenceLink} — read it, do not search for it.\n`)
  process.exit(1)
}
console.log('  ✓ every dataset on the page is in the table, with the licence the page states.')
