/**
 * REFERENCE PLATES — resolve real, displayable image URLs for the Salon's reference pane.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR. Every referenceImages[].url in the repo is a wiki PAGE
 * ("/wiki/Acer_rubrum"), which serves text/html. SalonWorkstage renders <img src={p.url}>
 * with onError hiding the element, so all 28 plates fail and vanish. The pane has never
 * displayed a photograph, and it reads as "no references for this species" rather than
 * "these URLs are wrong." A silent substitution in the one panel whose job is ground truth.
 *
 * TWO MODES, and the difference is whether a human already chose the photo:
 *   REPAIR  — the entry names an exact file ("/wiki/File:X"). Somebody picked that photo
 *             and wrote a caption for it. Resolve X to its direct URL; the caption stays
 *             true and the plate stays confirmed.
 *   PROPOSE — the entry names a CATEGORY, or there is no entry at all. No photo was ever
 *             chosen, so a caption cannot be inherited. ⛔ Attaching a hand-written caption
 *             to a machine-picked image would be a lie. These are written confirmed:false
 *             with a caption derived from the file's own title, for a human to approve.
 *
 * Attribution is captured per plate (artist + licence + source page), which is what the
 * inputs acknowledgements need. ⛔ Nothing is mirrored: we store URLs and credit.
 *
 *   node arborist/fetch-reference-images.mjs             # dry run
 *   node arborist/fetch-reference-images.mjs --write
 *   node arborist/fetch-reference-images.mjs --only acer_rubrum
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const WRITE = process.argv.includes('--write')
const onlyIx = process.argv.indexOf('--only')
const ONLY = onlyIx >= 0 ? process.argv[onlyIx + 1] : null
const root = path.join(import.meta.dirname, '..')
const dDir = path.join(root, 'arborist/dossiers')

// Wikimedia asks for a descriptive User-Agent that identifies the tool and a contact.
const UA = 'lafayette-square-arborist/1.0 (https://theward.online; jacob@jacobhenderson.studio)'
const api = async (params) => {
  const url = 'https://commons.wikimedia.org/w/api.php?format=json&origin=*&' +
    new URLSearchParams(params).toString()
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// The API appends analytics params to thumburl; they are not part of the image address.
const cleanUrl = (u) => String(u).split('?')[0]
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

// ⛔ `gcmtype=file` means every media file, not every photograph. Commons categories hold
// audio and video: `De Ginkgo.ogg` -- a spoken-word recording -- was picked as Ginkgo's
// SUMMER plate. Restrict to still-image extensions.
const IMAGE_EXT = /\.(jpe?g|png|gif|tiff?|webp)$/i

// A season word in the title that contradicts the slot. Cheap, and it caught
// "Baldcypress winter jcwf" being proposed as the SUMMER plate.
const SEASON_WORDS = { summer: /\b(winter|autumn|fall|snow|bare)\b/i, fall: /\b(winter|snow|spring)\b/i }
const seasonContradicts = (file, state) => SEASON_WORDS[state]?.test(String(file)) || false

const plateFrom = (page) => {
  const i = (page.imageinfo || [])[0]
  if (!i?.thumburl) return null
  if (!IMAGE_EXT.test(String(page.title))) return null
  const e = i.extmetadata || {}
  return {
    url: cleanUrl(i.thumburl),
    sourceUrl: i.descriptionurl,
    credit: `${stripTags(e.Artist?.value) || 'unknown'} — ${e.LicenseShortName?.value || 'see source'} (Wikimedia Commons)`,
    licence: e.LicenseShortName?.value || null,
    artist: stripTags(e.Artist?.value) || null,
    file: page.title,
  }
}

/** REPAIR: one exact file title → its direct URL. */
async function resolveFile(title) {
  const j = await api({ action: 'query', titles: title, prop: 'imageinfo',
    iiprop: 'url|extmetadata', iiurlwidth: '960' })
  const page = Object.values(j.query?.pages || {})[0]
  if (!page || page.missing !== undefined) return null
  return plateFrom(page)
}

/** PROPOSE: pick candidate files out of a Commons category. */
async function fromCategory(cat, limit = 6) {
  const j = await api({ action: 'query', generator: 'categorymembers',
    gcmtitle: `Category:${cat}`, gcmtype: 'file', gcmlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960' })
  return Object.values(j.query?.pages || {}).map(plateFrom).filter(Boolean)
}

// A caption a machine may honestly write: the file's own title, cleaned. It describes
// the photograph rather than asserting a botanical claim we have not verified.
const captionFromTitle = (t) => stripTags(t)
  .replace(/^File:/, '').replace(/\.(jpe?g|png|tiff?|webp)$/i, '')
  .replace(/[_-]+/g, ' ').replace(/\s*\(\d{6,}\)\s*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

// Which Commons categories tend to hold which plate. Tried in order; the first that
// yields anything wins that slot.
// A taxon can name a category several ways, and hybrids and cultivars rarely match the
// literal string. "Acer ×freemanii" found nothing at all on the first run.
const taxonVariants = (t) => {
  const v = new Set([t])
  v.add(t.replace(/×\s*/g, '× '))       // Acer × freemanii
  v.add(t.replace(/×\s*/g, ''))          // Acer freemanii
  const cultivar = /^(.*?)\s*'([^']+)'/.exec(t)
  if (cultivar) { v.add(cultivar[1].trim()); v.add(`${cultivar[1].trim()} '${cultivar[2]}'`) }
  // ⛔⛔ NO GENUS FALLBACK. It was here, and it is the exact shape this kit refuses: a
  // fallback that turns "no match" into a plausible-looking wrong answer. `Category:Acer`
  // returned Acer capillipes -- a snakebark maple -- as the BARK plate for Freeman maple,
  // and `Category:Taxodium` returned a photograph of a Prothonotary Warbler. Both loaded
  // fine, so nothing looked broken. A species with no confident match now gets NO PLATE.
  return [...v].filter(Boolean)
}

// A machine-chosen category must name the species, not just the genus. An author-chosen
// one is trusted as-is -- a human already decided it was the right place to look.
// ⭐⭐ CATEGORY MEMBERSHIP IS NOT ABOUTNESS. A Prothonotary Warbler photographed in bald
// cypress foliage is legitimately filed under `Taxodium distichum (leaves)` -- and it is
// not a reference plate for the tree. The file's own TITLE has to be about the subject.
// ⛔ No fallback: if nothing in the category names the tree, the slot stays EMPTY. A
// warbler badged UNREVIEWED is still a warbler in the ground-truth pane.
const titleTokens = (taxon, dossier) => {
  const t = new Set()
  for (const w of taxon.replace(/×/g, ' ').split(/\s+/)) if (w.length > 3) t.add(w.toLowerCase())
  for (const n of [dossier.key, ...(dossier.inventoryNames || [])]) {
    for (const w of String(n || '').split(/[^A-Za-z]+/)) if (w.length > 3) t.add(w.toLowerCase())
  }
  return [...t]
}
const titleIsAbout = (file, tokens) => {
  const f = String(file).toLowerCase()
  return tokens.some(tok => f.includes(tok))
}

const namesSpecies = (cat, taxon) => {
  const epithet = taxon.replace(/×\s*/g, '').split(/\s+/)[1]
  if (!epithet) return false                       // cultivar with no epithet: genus-only, refuse
  return cat.toLowerCase().includes(epithet.toLowerCase())
}

const STATE_CATS = (taxon) => ({
  bark:   [`${taxon} - bark`, `${taxon} (bark)`, `${taxon} bark`],
  leaves: [`${taxon} (leaves)`, `${taxon} - leaves`, `${taxon} leaves`],
  fall:   [`${taxon} in autumn`, `${taxon} in fall`, `${taxon} - autumn`],
  summer: [taxon],
})

const files = readdirSync(dDir).filter(f => f.endsWith('.json'))
  .filter(f => !ONLY || f === `${ONLY}.json` || f === ONLY)

const report = []
for (const f of files) {
  const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
  const taxon = d.scientific
  if (!taxon) { report.push({ f, skip: 'no scientific name' }); continue }

  const out = []
  const repaired = [], proposed = []

  // Already-resolved plates pass straight through. `file` is stamped by plateFrom(), so
  // its presence is the marker that this entry has been through the resolver before.
  const resolved = (d.referenceImages || []).filter(r => r.file && r.url && /upload\.wikimedia\.org/.test(r.url))
  out.push(...resolved)
  const resolvedFiles = new Set(resolved.map(r => r.file))

  // ⛔ Citation-only entries carry no file and no url BY DESIGN -- that is what makes them
  // un-embeddable. The pass-through above filtered on exactly those two fields, so the
  // second run silently ate the Missouri Botanical Garden and Chicago Botanic citations.
  // Twice now the same mistake: the licence-restricted entries are the fragile ones.
  out.push(...(d.referenceImages || []).filter(r => r.citationOnly))

  // A CATEGORY entry names no photo, but it does record which category the author
  // considered right and what they were looking for. ⛔ Dropping it discards that; the
  // first cut silently lost betula's "Yellow autumn foliage on the airy crown". Pick from
  // THEIR category, keep THEIR words as authorNote, and write an honest machine caption.
  const catEntries = []
  for (const r of (d.referenceImages || [])) {
    const c = /\/wiki\/Category:([^#?]+)/.exec(r.url || '')
    if (c) catEntries.push({ r, cat: decodeURIComponent(c[1]).replace(/_/g, ' ') })
  }

  // ⛔ NON-COMMONS SOURCES ARE CITATIONS, NOT PLATES. malus_prairifire cited Missouri
  // Botanical Garden and Chicago Botanic Garden. MOBOT is schema-shape-only for us --
  // non-commercial, no download -- so we must never hotlink or <img> their photographs.
  // Preserve them as a credited LINK with url:null so the pane cannot try to render one.
  // The first cut dropped both, taking 3 plates to 1 and losing the citations entirely.
  for (const r of (d.referenceImages || [])) {
    const u = r.url || ''
    // ⛔⛔ IDEMPOTENCE. This test used to be `/commons\.wikimedia\.org/`, but a RESOLVED
    // plate lives on upload.wikimedia.org -- so a second run reclassified all 73 of its
    // own plates as foreign citations and wiped them. A script that destroys its own
    // output on the second run is worse than one that fails, because the first run looked
    // perfect. Anything already resolved is left exactly alone.
    if (!u || /wikimedia\.org/.test(u)) continue
    let host = 'external source'
    try { host = new URL(u).hostname.replace(/^www\./, '') } catch {}
    out.push({
      state: r.state, caption: r.caption || null, url: null, sourceUrl: u,
      credit: r.credit || host, citationOnly: true,
      reason: 'non-Commons source — cited, never embedded (licence)',
    })
  }

  for (const r of (d.referenceImages || [])) {
    const m = /\/wiki\/(File:[^#?]+)/.exec(r.url || '')
    if (!m) continue                                   // category/bare → handled above
    const title = decodeURIComponent(m[1]).replace(/_/g, ' ')
    if (resolvedFiles.has(title)) continue
    const plate = await resolveFile(title).catch(() => null)
    await sleep(120)
    if (!plate) { report.push({ f, warn: `could not resolve ${title}` }); continue }
    out.push({ ...r, ...plate, confirmed: true })      // ⭐ human's caption + state preserved
    repaired.push(r.state || '?')
  }

  for (const { r, cat } of catEntries) {
    if (out.some(p => p.state === r.state)) continue
    const hits = await fromCategory(cat, 12).catch(() => [])
    await sleep(120)
    const about = hits.filter(h => titleIsAbout(h.file, titleTokens(taxon, d)) && !seasonContradicts(h.file, r.state))
    if (!about.length) { report.push({ f, warn: `nothing in Category:${cat} names the tree` }); continue }
    out.push({
      state: r.state, caption: captionFromTitle(about[0].file), ...about[0],
      confirmed: false,
      authorNote: r.caption || null,
      fromCategory: cat,
    })
    proposed.push(`${r.state}*`)
  }

  const haveStates = new Set(out.map(p => p.state))
  for (const [state, cats] of Object.entries(STATE_CATS(taxon))) {
    if (haveStates.has(state)) continue
    let plate = null, usedCat = null
    const expanded = cats.flatMap(c => taxonVariants(taxon).map(v => c.replace(taxon, v)))
      .filter(c => namesSpecies(c, taxon))
    const tokens = titleTokens(taxon, d)
    for (const c of [...new Set(expanded)]) {
      const hits = await fromCategory(c, 12).catch(() => [])
      await sleep(120)
      const about = hits.filter(h => titleIsAbout(h.file, tokens) && !seasonContradicts(h.file, state))
      if (about.length) { plate = about[0]; usedCat = c; break }
    }
    if (!plate) continue
    // ⭐ Always record WHICH category a pick came from. Without it there is no way to tell
    // a species-specific pick from a genus-fallback one after the fact, and the junk the
    // fallback produced could not be found and purged.
    out.push({ state, caption: captionFromTitle(plate.file), ...plate, confirmed: false, fromCategory: usedCat })
    proposed.push(state)
  }

  const cites = out.filter(p => p.citationOnly).length
  report.push({ f, taxon, before: (d.referenceImages || []).length, after: out.length, repaired, proposed, cites })
  if (WRITE && out.length) {
    d.referenceImages = out
    writeFileSync(path.join(dDir, f), JSON.stringify(d, null, 2) + '\n')
  }
}

let rep = 0, prop = 0
for (const r of report) {
  if (r.skip || r.warn) { console.log(`  ⚠️ ${r.f}  ${r.skip || r.warn}`); continue }
  rep += r.repaired.length; prop += r.proposed.length
  console.log(`  ${r.f.replace('.json', '').padEnd(26)} ${String(r.before).padStart(2)} → ${String(r.after).padStart(2)} plates` +
    (r.repaired.length ? `   repaired: ${r.repaired.join(',')}` : '') +
    (r.proposed.length ? `   ⚠️ proposed: ${r.proposed.join(',')}` : '') +
    (r.cites ? `   📎 ${r.cites} citation-only` : ''))
}
console.log(`\n  * = picked from the category the author named; their caption kept as authorNote`)
console.log(`\n${rep} repaired (human's caption kept, confirmed)   ${prop} proposed (confirmed:false — needs your eye)`)
if (!WRITE) console.log('\nDRY RUN — re-run with --write.')
