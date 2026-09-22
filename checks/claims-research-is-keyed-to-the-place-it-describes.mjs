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
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIR = path.join(ROOT, 'scratch/huron-research')

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nResearch is keyed to the place it describes')

if (!existsSync(DIR)) { console.log('  · no research directory — nothing to check\n'); process.exit(0) }

// The listings the research is keyed against, per scene. Research dirs are named
// `<scene>-research`, so the scene is read from the path rather than hardcoded.
const scene = path.basename(DIR).replace(/-research$/, '')
const lp = path.join(ROOT, 'cartograph/data', scene, 'content/listings.json')
if (!existsSync(lp)) { bad(`no listings.json for scene "${scene}" — cannot check the keys`); process.exit(1) }
const raw = JSON.parse(readFileSync(lp, 'utf8'))
const arr = Array.isArray(raw) ? raw : (raw.listings || [])
const byId = new Map(arr.map(l => [l.id, l]))

let records = 0, mismatches = 0, unknown = 0, rekeyed = 0
for (const f of readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'))
  for (const [k, r] of Object.entries(d)) {
    if (k.startsWith('_') || !r || typeof r !== 'object') continue
    // an events file is keyed by event id, not listing id — skip anything with no _match_name
    if (!r._match_name) continue
    records++
    const l = byId.get(k)
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
if (rekeyed) ok(`${rekeyed} record(s) deliberately re-keyed, each carrying \`_rekeyed\` with the reason`)

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
