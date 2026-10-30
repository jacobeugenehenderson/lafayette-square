#!/usr/bin/env node
/**
 * claims-research-is-keyed-to-the-place-it-describes — every research record's
 * `_match_name` is the name of the listing it is keyed to.
 *
 * ⛔⛔ A MIS-KEYED RECORD PUTS ONE BUSINESS'S FACTS ON ANOTHER BUSINESS'S CARD, and the
 * result looks complete. Measured 2026-09-22: `scratch/huron-research/civic.json` keyed
 * BGSU Firelands **Library** under `huro-lst-0195`, which is *Bowling Green State
 * University, Firelands College* — a real, separate, occupied listing. The college shipped
 * with the library's website, description and hours, so it had no description of ITSELF,
 * and the library — huron's **rank-1** listing — got nothing.
 *
 * ⭐⭐ THE DEFECT IS INVISIBLE TO EVERY CHECK WE HAD. "Is the field empty?" passes: the
 * field is full. The orphan check passes: the building is real. The duplicate check
 * passes: nothing collides. Only the NAME disagreed — and it disagreed the whole time.
 *
 * ⛔ IT WAS SEEN AND NOT ACTED ON. The first merge reported "5 name mismatches in the
 * first three beats" and moved on, treating a firing detector as a statistic. That is the
 * lesson this file exists to hold: a mismatch is a QUESTION about which place a fact
 * belongs to, and it is never answered by counting.
 *
 * ⭐ IT DOES NOT TRY TO CLASSIFY. Four of those five were one place written two ways
 * ("Marconis Italian Restaurant" vs "Marconi's Italian Restaurant - Huron, OH") and the
 * fifth was a different institution. No string metric separates them — "BGSU Firelands
 * Library" and "Bowling Green State University, Firelands College" are genuinely related,
 * which is exactly why it slipped through. So every mismatch is reported for a human, and
 * a record that has been deliberately re-keyed says so in `_rekeyed`.
 *
 * ⛔ A run with no research directory, or none of its files, is NOT CHECKED, exit 2 (the research blanked is shown so every run).
 *
 * ⭐ RESEARCH KEYED TO AN ABSORBED LISTING belongs to its survivor (Boz, 2026-10-30): an authored `places.merge` absorbs a
 * listing, its display id leaves listings.json and stays reserved, and the research filed under it resolves through
 * listing-places.js#survivorOf, the ONE resolver the bake's patch join uses too. Never a hand re-keying.
 * Planted every run: a record keyed to an absorbed id reaches its survivor in this check's join, and an absorbed patch reaches
 * its survivor in the bake's (bake-content.js#applyListingOverrides: the same value → nothing · the survivor empty → filled ·
 * different → refused). MUTANT: the resolver bypassed (identity), on _importSource's copies of both → each RED.
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { survivorOf } from '../cartograph/listing-places.js'
import { applyListingOverrides } from '../cartograph/bake-content.js'
import { importSource } from './_importSource.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIR = path.join(ROOT, 'scratch/huron-research')

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nResearch is keyed to the place it describes')

// ⛔ A run that reads NO research record is NOT CHECKED (exit 2), never a pass → why it judged nothing, or null
const judgedNothing = (dir) => !existsSync(dir) ? `no research directory at ${path.relative(ROOT, dir) || dir}: judged nothing`
  : !readdirSync(dir).some(x => x.endsWith('.json')) ? `no research file (*.json) in ${path.relative(ROOT, dir) || dir}: judged nothing` : null
{ const blank = mkdtempSync(path.join(os.tmpdir(), 'research-'))
  if (judgedNothing(blank) && judgedNothing(path.join(blank, 'absent'))) ok('mutant: the research blanked (an empty directory, and none) → NOT CHECKED, as it must be')
  else bad('mutant: the research blanked reads green — judging nothing passes')
  const why = judgedNothing(DIR); if (why) { console.log(failed ? `\n⛔ ${failed} failed, and NOT CHECKED: ${why}\n` : `\n⛔ NOT CHECKED — ${why}. This is a failure to check, not a pass.\n`); process.exit(failed ? 1 : 2) } }

// ⭐ THE PLANTED MERGE: listing k-1 (t-1, "Harbor") absorbed k-2 (t-2). → per join: [check's verdict, bake's verdict]
const joinOf = (survive, k, byId) => byId.get(survive.id(k))
const planted = (survivorOfFn, applyFn) => {
  const places = { merge: { 'k-1': ['k-2'] } }, ids = { 'k-1': 't-1', 'k-2': 't-2' }
  const l = joinOf(survivorOfFn(places, ids), 't-2', new Map([['t-1', { id: 't-1', name: 'Harbor' }]]))
  const check = l?.name === 'Harbor'
  const base = [{ _key: 'k-1', name: 'Harbor', phone: '1', description: 'kept', amenities: { a: 1, b: 2 } }, { _key: 'k-2', name: 'Harbor', phone: '1' }]
  const { listings, report } = applyFn(base, { places, patches: { 'k-2': { phone: '1', amenities: { b: 2, a: 1 }, hours: { monday: '9-5' }, description: 'absorbed', _source: 's' } } }, { buildingGrid: null, bakedIds: new Set(), parcels: [], parcelByAddr: new Map() })
  const s = listings.find(x => x._key === 'k-1')
  const bake = s.hours?.monday === '9-5' && s.description === 'kept' && report.absorbed_conflicts.length === 1 && /description/.test(report.absorbed_conflicts[0])
  return { check, bake, l, s, report }
}
{ const v = planted(survivorOf, applyListingOverrides)
  if (v.check) ok('planted: a record keyed to the absorbed t-2 reaches its survivor t-1 "Harbor" (the check\'s join)')
  else bad(`planted: a record keyed to the absorbed t-2 reaches ${v.l ? `"${v.l.name}"` : 'no listing'} (the check's join)`)
  if (v.bake) ok('planted: the absorbed patch reaches its survivor (the bake\'s join): the same phone, and the same amenities written in another key order → nothing · the empty hours → filled · the different description → refused by name')
  else bad(`planted: the bake's join — survivor hours ${JSON.stringify(v.s.hours)}, description "${v.s.description}", conflicts ${JSON.stringify(v.report.absorbed_conflicts)}`) }
{ const bypass = (t) => t.replace('export function survivorOf(places = {}, ids = {}) {', 'export function survivorOf() { return { ref: (r) => r, id: (d) => d }\n}\nfunction _bypassed(places = {}, ids = {}) {')
  const LP = await importSource('cartograph/listing-places.js', { transform: (t) => { if (!t.includes('export function survivorOf(places = {}, ids = {}) {')) throw new Error('the resolver moved'); return bypass(t) } })
  const BC = await importSource('cartograph/bake-content.js', { span: { functions: ['applyListingOverrides', 'stripMeta'] },
    prefix: "import { survivorOf, absorbedResearch, normName } from './listing-places.js'", suffix: 'export { applyListingOverrides }',
    transform: (t) => { if (!t.includes('survivorOf(overrides.places)')) throw new Error('the bake no longer calls the resolver'); return t.replace('survivorOf(overrides.places)', '({ ref: (r) => r, id: (d) => d })') } })
  const m = planted(LP.survivorOf, BC.applyListingOverrides)
  if (!m.check && !m.bake) ok('mutant: the resolver bypassed → the check\'s join and the bake\'s each lose the absorbed research, RED as they must be')
  else bad(`mutant: the resolver bypassed → check ${m.check ? 'still resolves' : 'RED'}, bake ${m.bake ? 'still resolves' : 'RED'} — a row cannot see it`) }

// The listings the research is keyed against, per scene. Research dirs are named
// `<scene>-research`, so the scene is read from the path rather than hardcoded.
const scene = path.basename(DIR).replace(/-research$/, '')
const lp = path.join(ROOT, 'cartograph/data', scene, 'content/listings.json')
if (!existsSync(lp)) { bad(`no listings.json for scene "${scene}" — cannot check the keys`); process.exit(1) }
const raw = JSON.parse(readFileSync(lp, 'utf8'))
const arr = Array.isArray(raw) ? raw : (raw.listings || [])
const byId = new Map(arr.map(l => [l.id, l]))
const op = path.join(ROOT, 'cartograph/data', scene, 'content/listings.overrides.json'), ip = path.join(ROOT, 'cartograph/data', scene, 'content/listing-identity.json')
const survive = survivorOf(existsSync(op) ? JSON.parse(readFileSync(op, 'utf8')).places : {}, existsSync(ip) ? JSON.parse(readFileSync(ip, 'utf8')).ids || {} : {})
let followed = 0

let records = 0, mismatches = 0, unknown = 0, rekeyed = 0
for (const f of readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'))
  for (const [k, r] of Object.entries(d)) {
    if (k.startsWith('_') || !r || typeof r !== 'object') continue
    // an events file is keyed by event id, not listing id — skip anything with no _match_name
    if (!r._match_name) continue
    records++
    const l = joinOf(survive, k, byId); if (survive.id(k) !== k) followed++
    if (!l) { unknown++; bad(`${f} · ${k} "${r._match_name}" is keyed to no listing in ${scene}`); continue }
    if (r._match_name === l.name) continue
    if (r._rekeyed) { rekeyed++; continue }
    mismatches++
    bad(`${f} · ${k} — the record and the listing name different places, and the merge would put one's facts on the other:\n` +
        `       researched: ${JSON.stringify(r._match_name)}\n` +
        `       listing is: ${JSON.stringify(l.name)}\n` +
        `     ▶ Decide which listing this research describes. Re-key it, or if the key is right and the\n` +
        `       name merely reads differently, set \`_match_name\` to the listing's name verbatim.`)
  }
}
if (!records) { bad('no research records carried a `_match_name` — the parse is wrong, not the data'); process.exit(1) }
if (!mismatches && !unknown) ok(`${records} research record(s) across ${scene}, every \`_match_name\` matching its listing`)
if (followed) ok(`${followed} record(s) keyed to an absorbed listing, each resolved to its survivor by the scene's places.merge`)
if (rekeyed) ok(`${rekeyed} record(s) deliberately re-keyed, each carrying \`_rekeyed\` with the reason`)

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
