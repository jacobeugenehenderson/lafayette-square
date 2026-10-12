#!/usr/bin/env node
/**
 * claims-vacant-is-said-only-by-a-well.mjs — DOES `vacant: false` EVER MEAN "NOBODY SAID"?
 *
 * ⛔ Found 2026-10-11 (Cairn, retiring `in_historic_district: false` the same way): the roster wrote
 *    `vacant: par ? par.vacant : false`, so every building with no parcel was "not vacant", and derive.js wrote
 *    `p.vacant || false` into map.json's parcel layer, so every parcel of a well that has no vacant column
 *    (Ohio, MassGIS, NYC PLUTO — each declares it absent) was "not vacant" too. `false` and `null` are different
 *    claims (fetch-parcels.mjs, `extract`); only a well can say false.
 * ⭐ THE RULE, read from each town's sources.json and its artifacts, never restated here:
 *   · a roster building with no parcel writes `vacant: null`;
 *   · a roster building whose parcel came from a well that does not provide `vacant` writes `null`;
 *   · in a town where no parcel well provides `vacant`, map.json's parcel layer writes `null` on every parcel.
 * ⭐ MUTATION-TESTED EVERY RUN: a parcel-less `false`, a `false` from a well without the column, and a map parcel
 *    `false` in a town with no vacant well must each fail.
 *
 *   node checks/claims-vacant-is-said-only-by-a-well.mjs                  # every town with a roster
 *   node checks/claims-vacant-is-said-only-by-a-well.mjs huron
 * Read-only. Exit 1 on a failure, 2 if not measured.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, eachTown } from './_scenes.mjs'

const scene = eachTown('cartograph/data/<scene>/content/roster.json')
process.env.CARTOGRAPH_SCENE = scene   // sources.js reaches config.js, which wants a named scene
const { readSources } = await import(join(ROOT, 'cartograph/sources.js'))
const dir = join(ROOT, 'cartograph/data', scene)

const src = readSources(scene)
const wells = src.declared ? src.parcels : []
// A jurisdiction speaks for `vacant` if any well of that jurisdiction provides the column.
const speaks = new Map()
for (const w of wells) speaks.set(w.jurisdiction, (speaks.get(w.jurisdiction) || false) || (w.provides || []).includes('vacant'))
const anyWell = [...speaks.values()].some(Boolean)

const said = (v) => v !== null && v !== undefined

function auditRoster(rows, speaks) {
  let noParcel = 0, noColumn = 0
  for (const b of rows) {
    if (!said(b.vacant)) continue
    if (!b.jurisdiction) noParcel++
    else if (!speaks.get(b.jurisdiction)) noColumn++
  }
  const out = []
  if (noParcel) out.push(`roster: ${noParcel} building(s) with no parcel write vacant ${'non-null'} — no well spoke, must be null`)
  if (noColumn) out.push(`roster: ${noColumn} building(s) write vacant from a well whose declaration does not provide it — must be null`)
  return out
}
function auditMap(parcels, anyWell) {
  if (anyWell) return []
  const n = parcels.filter(p => said(p.vacant)).length
  return n ? [`map.json: ${n} parcel(s) write vacant non-null, but no parcel well of this town provides it — must be null`] : []
}

const fails = []
const roster = JSON.parse(readFileSync(join(dir, 'content/roster.json'), 'utf8'))
const rows = Array.isArray(roster) ? roster : (roster.buildings || [])
if (!rows.length) { console.error(`⛔ NOT MEASURED — ${scene}'s roster has no buildings.`); process.exit(2) }
fails.push(...auditRoster(rows, speaks))

const mapPath = join(dir, 'clean/map.json')
let mapNote = 'map.json NOT MEASURED (none on disk)'
if (existsSync(mapPath)) {
  const m = JSON.parse(readFileSync(mapPath, 'utf8'))
  const parcels = (m.layers || m).parcel || []
  fails.push(...auditMap(parcels, anyWell))
  mapNote = `map.json ${parcels.length} parcels`
}
console.log(`   ${scene}: ${rows.length} buildings · ${mapNote} · wells providing vacant: ${[...speaks].filter(([, v]) => v).map(([j]) => j).join(', ') || '(none)'}`)

// ── Mutations: each must fail ──
const anyJur = wells[0] ? wells[0].jurisdiction : 'city'
const mut = [
  ['a parcel-less building written false', auditRoster([{ jurisdiction: null, vacant: false }], speaks)],
  ['false from a well without the column', auditRoster([{ jurisdiction: anyJur, vacant: false }], new Map([[anyJur, false]]))],
  ['a map parcel false in a town with no vacant well', auditMap([{ vacant: false }], false)],
]
for (const [what, out] of mut) {
  console.log(`   mutation (${what}) ${out.length ? 'caught ✓' : 'NOT caught'}`)
  if (!out.length) fails.push(`MUTATION NOT CAUGHT: ${what}`)
}

if (fails.length) { for (const f of fails) console.log(`   ⛔ ${f}`); process.exit(1) }
console.log(`   ✅ vacant is said only where a well said it`)
