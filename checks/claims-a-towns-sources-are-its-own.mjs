#!/usr/bin/env node
/**
 * claims-a-towns-sources-are-its-own.mjs — DOES SOURCES NAME THIS TOWN'S SOURCE, OR ANOTHER COUNTRY'S?
 *
 * ⛔ Found 2026-09-28: the Sources panel showed each row's FIRST source, from one fixed list, so Lafayette Square's
 *    Historic designation read "NID rejestr zabytków" — Poland's register — left over from a Łódź pour. Every row whose
 *    sources are national (canopy, parcels, footprints, elevation, species) had the same shape: in a town nobody had
 *    looked at, the panel named another country's source as if it were this town's.
 * ⭐ THE RULE: every source declares what it `covers` ('global', or ISO 3166-1 codes / a named group); a town's country
 *    is its own intake fact (cartograph/data/<town>/jurisdiction.json, cartograph/fetch-jurisdiction.mjs); the panel
 *    shows what src/cartograph/sourcesCatalogue.js's `resolveRow` returns — a source covering the town, else a global
 *    one, else "none known" (owed). Asserts, reading the catalogue and the towns, never restating them:
 *   · every source declares `covers`, and every code in it is a known country or group;
 *   · every scene with a geography.json has a jurisdiction.json naming its country — absent is a FAILURE, never a guess;
 *   · for every town × row, the source shown covers the town's country or is global, and "none known" is returned only
 *     when no source covers it.
 * ⭐ MUTATION-TESTED EVERY RUN: the old behaviour (show sources[0]) must fail on at least one town.
 *
 *   node checks/claims-a-towns-sources-are-its-own.mjs
 * Read-only. Exit 1 on a failure.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const cat = await import(join(ROOT, 'src/cartograph/sourcesCatalogue.js'))
const fails = []
if (typeof cat.resolveRow !== 'function') fails.push('src/cartograph/sourcesCatalogue.js exports no resolveRow — the panel has no per-town choice (it shows sources[0])')
if (typeof cat.coversCountry !== 'function') fails.push('src/cartograph/sourcesCatalogue.js exports no coversCountry')
const rows = cat.GROUPS.flatMap((g) => g.rows)

// 1. Every source says what it covers.
for (const r of rows) for (const s of r.sources) {
  if (s.covers === 'global') continue
  if (!Array.isArray(s.covers) || !s.covers.length) { fails.push(`"${r.name}" › "${s.name}" declares no covers ('global' or country codes)`); continue }
  for (const c of s.covers) if (!/^[A-Z]{2}$/.test(c) && !(cat.COUNTRY_GROUPS && c in cat.COUNTRY_GROUPS)) fails.push(`"${r.name}" › "${s.name}" covers unknown code "${c}"`)
}

// 2. Every scene knows its country.
const towns = []
for (const d of readdirSync(join(ROOT, 'cartograph/data'), { withFileTypes: true })) {
  if (!d.isDirectory() || !existsSync(join(ROOT, 'cartograph/data', d.name, 'geography.json'))) continue
  const p = join(ROOT, 'cartograph/data', d.name, 'jurisdiction.json')
  if (!existsSync(p)) { fails.push(`${d.name} has no jurisdiction.json — its country is unknown (node cartograph/fetch-jurisdiction.mjs --town=${d.name})`); continue }
  const j = JSON.parse(readFileSync(p, 'utf8'))
  if (!/^[A-Z]{2}$/.test(j.country || '')) { fails.push(`${d.name}/jurisdiction.json country ${JSON.stringify(j.country)} is not an ISO 3166-1 code`); continue }
  towns.push({ town: d.name, jurisdiction: j })
}

// 3. What each town is shown covers it.
const audit = (resolve) => {
  const out = []
  for (const { town, jurisdiction } of towns) for (const r of rows) {
    const got = resolve(r, jurisdiction)
    const anyCovers = r.sources.some((s) => cat.coversCountry(s, jurisdiction.country))
    if (!got.shown) { if (anyCovers) out.push(`${town} › "${r.name}": "none known", but a source covers ${jurisdiction.country}`); continue }
    if (!cat.coversCountry(got.shown, jurisdiction.country)) out.push(`${town} › "${r.name}" shows "${got.shown.name}", which does not cover ${jurisdiction.country}`)
  }
  return out
}
if (typeof cat.resolveRow === 'function' && typeof cat.coversCountry === 'function') {
  fails.push(...audit(cat.resolveRow))
  const oldWay = audit((r) => ({ shown: r.sources[0] }))
  console.log(`   mutation (show sources[0], the old panel) ${oldWay.length ? `caught ✓ — ${oldWay.length} wrong, e.g. ${oldWay[0]}` : 'NOT caught'}`)
  if (!oldWay.length) fails.push('MUTATION NOT CAUGHT: the old sources[0] behaviour passes — the check is blind (or no town is outside the first source\'s country)')
}

console.log(`rows ${rows.length} · sources ${rows.reduce((n, r) => n + r.sources.length, 0)} · towns with a country: ${towns.map((t) => `${t.town} ${t.jurisdiction.country}${t.jurisdiction.subdivision ? '-' + t.jurisdiction.subdivision : ''}`).join(', ') || 'none'}`)
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? `\n⛔ FAIL — ${fails.length}` : '\n✅ PASS — every town is shown its own sources, or told none is known')
process.exit(fails.length ? 1 : 0)
