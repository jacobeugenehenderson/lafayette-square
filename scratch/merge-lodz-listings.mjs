#!/usr/bin/env node
/**
 * merge-lodz-listings.mjs — apply listings.overrides.json onto content/listings.json
 * for an OVERTURE-derived pour (Łódź / ksi-y-m-yn).
 *
 * ⚠️ WHY THIS EXISTS — do not replace it with `bake-content.js --scene ksi-y-m-yn`.
 * bake-content rebuilds the BASE from OSM POIs + parcels + NR survey. Łódź's base
 * came from OVERTURE PLACES (see HANDOFF-lodz-ksiezy-mlyn.md), which bake-content
 * has no knowledge of. Verified by dry-run 2026-07-19:
 *     base listings (OSM): 0 · 0 patches applied · 2 adds DROPPED (famuły, park-źródliska)
 * i.e. running it would collapse 87 listings → 6 and silently lose two landmark cards.
 * Until the Overture base is a first-class bake-content source, this is the merge.
 *
 * IDEMPOTENT: patches overwrite fields by key; adds replace-by-id. Re-running on an
 * already-merged listings.json is a no-op diff, so it is safe to run repeatedly.
 *
 *   node scratch/merge-lodz-listings.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'fs'

const DIR = 'cartograph/data/ksi-y-m-yn/content/'
const dry = process.argv.includes('--dry-run')

const doc = JSON.parse(readFileSync(DIR + 'listings.json', 'utf8'))
const ov = JSON.parse(readFileSync(DIR + 'listings.overrides.json', 'utf8'))
const byId = new Map(doc.listings.map(l => [l.id, l]))

let patched = 0, missing = []
for (const [id, patch] of Object.entries(ov.patches || {})) {
  const tgt = byId.get(id)
  if (!tgt) { missing.push(id); continue }
  Object.assign(tgt, patch)            // hand-authored fields WIN over the generated base
  patched++
}

// DROPS — records that must not render: permanently-closed venues and duplicate
// POIs (the same business landing twice, e.g. under its sole-proprietorship legal
// name). Recorded in the overrides SSOT, not deleted by hand, so a re-merge can't
// silently resurrect a dead business from the Overture base.
let dropped = 0
for (const id of Object.keys(ov.drops || {})) {
  if (!byId.has(id)) continue
  doc.listings.splice(doc.listings.indexOf(byId.get(id)), 1)
  byId.delete(id); dropped++
}

let added = 0, replaced = 0
for (const add of ov.adds || []) {
  if (byId.has(add.id)) { Object.assign(byId.get(add.id), add); replaced++ }
  else { doc.listings.push(add); byId.set(add.id, add); added++ }
}

doc.meta.count = doc.listings.length
doc.meta.note = `Merged (Overture base + overrides: ${patched} patches, ${added + replaced} adds). ` +
  `Merge tool = scratch/merge-lodz-listings.mjs (NOT bake-content — see header).`

console.log(`[merge] ${patched} patches · ${dropped} drops · ${added} adds · ${replaced} adds-replacing-existing · ${doc.listings.length} listings`)
if (missing.length) console.log(`  ⚠️ patch id not in base (typo or dropped listing): ${missing.join(', ')}`)

// An ELABORATED card's null logo means "searched, no real mark exists" — a finding.
// A base listing's null means "never searched". Same value, different meaning: don't
// conflate them in the count, or unsearched debt reads as completed work.
const elaborated = new Set([...Object.keys(ov.patches || {}), ...(ov.adds || []).map(a => a.id)])
const withLogo = doc.listings.filter(l => l.logo).length
const nullSearched = doc.listings.filter(l => elaborated.has(l.id) && !l.logo).length
const nullUnsearched = doc.listings.filter(l => !elaborated.has(l.id) && !l.logo).length
const withPhoto = doc.listings.filter(l => l.photos?.length).length
console.log(`  assets: ${withLogo} logos · ${nullSearched} null (searched, none exists) · ${nullUnsearched} null (not yet searched) · ${withPhoto} with photos`)

if (dry) { console.log('[merge] dry-run — nothing written'); process.exit(0) }
// Match the file's existing on-disk format (Python json.dump indent=0, no trailing
// newline) so the diff shows CONTENT, not a reformat. JS `indent 0` means "no newlines
// at all", unlike Python's, so emit indent-1 and strip the leading spaces — safe
// because JSON escapes newlines inside strings, so leading space is only ever indent.
const out = JSON.stringify(doc, null, 1).replace(/^ +/gm, '')
writeFileSync(DIR + 'listings.json', out)
console.log('[merge] wrote listings.json')
