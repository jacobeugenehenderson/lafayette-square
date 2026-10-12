#!/usr/bin/env node
/**
 * claims-a-chain-id-is-one-chain.mjs — DOES EVERY CHAIN ID NAME EXACTLY ONE CHAIN?
 *
 * ⛔ Found 2026-10-12 (Swale's measurement, Cairn's fix): skeleton.js grouped streets by RAW name and minted
 *    ids from the SLUG, so Provincetown's "Head of the Meadow Road" and "Head Of The Meadow Road" were two groups
 *    that both minted `head-of-the-meadow-road`. derive.js keys its geometry maps by that id, a Map keeps the last,
 *    and ribbons.json gave the long chain the short chain's points. Nothing said so.
 * ⭐ THE RULE, read from each town's artifacts, never restated here:
 *   · skeleton.json: every id across streets[] and paths[] is unique (derive and the overlay key both by it);
 *   · ribbons.json: every streets[].skelId is unique;
 *   · skeleton.js groups by the slug and refuses to write a duplicate; derive.js refuses to read one.
 * ⭐ MUTATION-TESTED EVERY RUN: a duplicated skeleton id and a duplicated ribbons skelId must each fail.
 *
 *   node checks/claims-a-chain-id-is-one-chain.mjs                  # every town with a skeleton
 *   node checks/claims-a-chain-id-is-one-chain.mjs provincetown
 * Read-only. Exit 1 on a failure, 2 if not measured.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, eachTown } from './_scenes.mjs'

const scene = eachTown('cartograph/data/<scene>/clean/skeleton.json')
const dir = join(ROOT, 'cartograph/data', scene, 'clean')

/** Ids that name more than one row, each with the names that share it. */
function duplicates(rows, keyOf) {
  const by = new Map()
  for (const r of rows) { const k = keyOf(r); if (!by.has(k)) by.set(k, []); by.get(k).push(r) }
  return [...by].filter(([, rs]) => rs.length > 1)
    .map(([k, rs]) => `"${k}" × ${rs.length} (${rs.map(r => `"${r.name}" ${r.points?.length ?? 0} pts`).join(' · ')})`)
}

const fails = []
const sk = JSON.parse(readFileSync(join(dir, 'skeleton.json'), 'utf8'))
const skRows = [...(sk.streets || []), ...(sk.paths || [])]
if (!skRows.length) { console.error(`⛔ NOT MEASURED — ${scene}'s skeleton.json has no chains.`); process.exit(2) }
for (const d of duplicates(skRows, r => r.id)) fails.push(`skeleton.json: duplicate id ${d}`)

let ribNote = 'ribbons.json NOT MEASURED (none on disk)'
const ribPath = join(dir, 'ribbons.json')
let ribStreets = []
if (existsSync(ribPath)) {
  ribStreets = JSON.parse(readFileSync(ribPath, 'utf8')).streets || []
  for (const d of duplicates(ribStreets, r => r.skelId)) fails.push(`ribbons.json: duplicate skelId ${d}`)
  ribNote = `ribbons.json ${ribStreets.length} streets`
}
console.log(`   ${scene}: skeleton.json ${skRows.length} chains · ${ribNote}`)

// The producer and the consumer each refuse a duplicate — read from their source.
const skSrc = readFileSync(join(ROOT, 'cartograph/skeleton.js'), 'utf8')
const dvSrc = readFileSync(join(ROOT, 'cartograph/derive.js'), 'utf8')
if (!/const slug = slugify\(name\)[\s\S]{0,200}bySlug\.set\(slug/.test(skSrc)) fails.push('skeleton.js: groupByName no longer groups by the slug the id is minted from')
if (!/duplicate chain id[\s\S]{0,300}Refusing to write skeleton\.json/.test(skSrc)) fails.push('skeleton.js: no longer refuses to write a duplicate chain id')
if (!/skeleton\.json has duplicate chain id/.test(dvSrc)) fails.push('derive.js: no longer refuses to read a duplicate chain id')

// ── Mutations: each must fail ──
const first = skRows[0]
const mut = [
  ['a duplicated skeleton id', duplicates([...skRows, { ...first, name: `${first.name} (copy)` }], r => r.id)],
  ['a duplicated ribbons skelId', duplicates([...ribStreets, { skelId: first.id, name: 'a', points: [] }, { skelId: first.id, name: 'b', points: [] }], r => r.skelId)],
]
for (const [what, out] of mut) {
  console.log(`   mutation (${what}) ${out.length ? 'caught ✓' : 'NOT caught'}`)
  if (!out.length) fails.push(`MUTATION NOT CAUGHT: ${what}`)
}

if (fails.length) { for (const f of fails) console.log(`   ⛔ ${f}`); process.exit(1) }
console.log(`   ✅ every chain id names one chain`)
