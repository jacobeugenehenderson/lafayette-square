#!/usr/bin/env node
/**
 * claims-a-published-edit-reaches-the-map — a Host's published correction is what the map shows.
 *
 * Operations publishes a town's Host and staff edits as a small layer (`live/<look>/listings.json`
 * beside the slab); the player lays it over its listings after the Apps Script sheet
 * (`src/lib/publishedLayer.js`, called from `useInit#runInit`). Two halves:
 *   · the MERGE, on fixtures — an edit replaces the field, a closed listing leaves, an unknown id is
 *     ignored, nothing is mutated;
 *   · the WIRING, from source — runInit applies the layer on BOTH paths (sheet answered / sheet
 *     failed), and applies it AFTER the sheet merge, so a stale sheet copy cannot beat a correction.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const { applyPublishedLayer } = await import(path.join(ROOT, 'src/lib/publishedLayerApply.js'))

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)
console.log('\nA published edit reaches the map')

const base = [{ id: 'a', name: 'A', phone: '1' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C', _bare: true }]
const frozen = JSON.stringify(base)
const out = applyPublishedLayer(base, { listings: { a: { phone: '2', hours: { monday: { open: '09:00', close: '17:00' } } }, b: { closed: true }, zz: { name: 'gone' } } })
if (out.find(l => l.id === 'a')?.phone === '2' && out.find(l => l.id === 'a')?.hours?.monday) ok('an edited field replaces the listing\'s own') ; else bad('an edit did not reach the listing')
if (!out.some(l => l.id === 'b')) ok('a listing published as closed leaves the map'); else bad('a closed listing is still shown')
if (!out.some(l => l.id === 'zz')) ok('an entry for an id the town does not have is ignored'); else bad('the layer invented a listing')
if (out.some(l => l.id === 'c')) ok('listings the layer does not name are untouched'); else bad('a listing the layer never named went missing')
if (JSON.stringify(base) === frozen) ok('the merge mutates nothing'); else bad('applyPublishedLayer mutated its input')
if (applyPublishedLayer(base, null) === base) ok('no layer, no change'); else bad('a missing layer changed the listings')

const init = readFileSync(path.join(ROOT, 'src/hooks/useInit.js'), 'utf8')
const calls = [...init.matchAll(/await applyPublished\(\)/g)].map(m => m.index)
const merge = init.indexOf('const merged = apiListings.map(')
const catchAt = init.indexOf('} catch (err) {', merge)
if (calls.length >= 2) ok('runInit applies the layer on both paths'); else bad(`runInit applies the layer ${calls.length} time(s) — it must run whether or not the sheet answers`)
if (calls.some(i => i > merge && i < catchAt)) ok('the layer goes on AFTER the sheet merge'); else bad('the layer is not applied after the sheet merge — a stale sheet copy would beat a published correction')
if (calls.some(i => i > catchAt)) ok('and still goes on when the sheet fails'); else bad('the layer is skipped when the sheet fails')

console.log(failed ? `\n${failed} FAILED` : '\nall held')
process.exit(failed ? 1 : 0)
