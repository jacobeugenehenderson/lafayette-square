/**
 * The acknowledgements for the Salon's reference plates — GENERATED from the dossiers,
 * never hand-maintained. Every plate stores its artist and licence at fetch time, so the
 * credit list reads the source and cannot go stale.
 *
 * Also the standing count of the rubric's axes, for the same reason: a number written into
 * a doc is wrong the moment the rubric changes, and NEIGHBORHOOD-INPUTS said "19 botanical
 * axes" for a day after the cutover made it 31.
 *
 *   node scratch/claims-reference-credits.mjs
 *   node scratch/claims-reference-credits.mjs --markdown   # paste-ready
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const MD = process.argv.includes('--markdown')
const root = path.join(import.meta.dirname, '..')
const dDir = path.join(root, 'arborist/dossiers')

const rubric = JSON.parse(readFileSync(path.join(root, 'arborist/rubric.json'), 'utf8'))

const byLicence = new Map()
const artists = new Map()
let plates = 0, cites = 0, confirmed = 0, unreviewed = 0, species = 0, withPlates = 0
const citedHosts = new Map()

for (const f of readdirSync(dDir).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
  species++
  const refs = d.referenceImages || []
  if (refs.length) withPlates++
  for (const r of refs) {
    if (r.citationOnly || !r.url) {
      cites++
      let h = 'unknown'
      try { h = new URL(r.sourceUrl).hostname.replace(/^www\./, '') } catch {}
      citedHosts.set(h, (citedHosts.get(h) || 0) + 1)
      continue
    }
    plates++
    if (r.confirmed) confirmed++; else unreviewed++
    const lic = r.licence || 'see source'
    byLicence.set(lic, (byLicence.get(lic) || 0) + 1)
    if (r.artist) artists.set(r.artist, (artists.get(r.artist) || 0) + 1)
  }
}

const axes = (rubric.axes || []).length

if (MD) {
  console.log(`| Reference plates | ${plates} photographs across ${withPlates}/${species} species | Wikimedia Commons (per-plate artist + licence stored in the dossier) | \`arborist/dossiers/*.referenceImages\` | ① | automated fetch, operator-reviewed |`)
  console.log('')
  console.log(`**Reference plate credits.** ${plates} photographs from Wikimedia Commons, ` +
    `${[...byLicence].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', ')}. ` +
    `Contributed by ${artists.size} photographers. Nothing is mirrored — the dossier stores the URL and the credit. ` +
    (cites ? `A further ${cites} source(s) are cited as links only (${[...citedHosts.keys()].join(', ')}) because their licence forbids embedding. ` : '') +
    `▶ regenerate: \`node scratch/claims-reference-credits.mjs --markdown\``)
  process.exit(0)
}

console.log(`\nrubric axes            : ${axes}`)
console.log(`species with dossiers  : ${species}   with reference plates: ${withPlates}`)
console.log(`displayable plates     : ${plates}   (${confirmed} human-confirmed, ${unreviewed} UNREVIEWED)`)
console.log(`citation-only sources  : ${cites}${cites ? `  (${[...citedHosts].map(([h, n]) => `${h} ×${n}`).join(', ')})` : ''}`)
console.log(`\nlicences:`)
for (const [l, n] of [...byLicence].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${l}`)
console.log(`\nphotographers: ${artists.size}`)
for (const [a, n] of [...artists].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(3)}  ${a}`)
if (artists.size > 8) console.log(`       …and ${artists.size - 8} more`)
console.log(`\n⚠️ ${unreviewed} plate(s) are machine-picked and unreviewed — they render badged in the Salon.`)
