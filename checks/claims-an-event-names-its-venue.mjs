#!/usr/bin/env node
/**
 * "DOES EVERY EVENT NAME WHERE IT HAPPENS, AND OPEN THERE?" (r-an-event-has-a-host-and-a-venue-and-opens-at-the-venue;
 * Jacob, 2026-10-31: "It's always the venue" · "Only inside the radius"; keys agreed with Ward.)
 *
 *   1. the bake's rules (cartograph/bake-content.js#eventProblems), on planted rows: a town event without an id or a venue,
 *      a venue or host that resolves to nothing, a building with no name and no address, a point not { lat, lon }, a point
 *      outside the town's radius (Provincetown's own disc, read through townRadius), a venue of two forms, a place's own
 *      event naming another venue, `links_to`, a duplicate id on ANY row, a scene venue that is not `true`: each REFUSED
 *      by name; and the good forms (listing, building, spot inside the radius, scene, a place's own event, host as a
 *      listing or a name) pass; and Provincetown's real calendar validates;
 *   2. the ticker (src/components/EventTicker.jsx): an entry opens its venue; one with nowhere to open (a scene show, a spot
 *      not yet framable) is NOT a button; `links_to` is never read;
 *   3. the guardian write path: apps-script/Code.js#postEvent takes a fixed set of fields, and a `venue` among them must
 *      come with a refusal of the scene (a guardian may never name it). ⚠️ This reads the REPO's Code.js: the deployed
 *      script has been patched outside the repo before (theward/backend/apps-script-2026-10-07.patch), so it proves the
 *      repo copy, not the live one (Zob, 2026-10-31).
 *
 * Usage: node checks/claims-an-event-names-its-venue.mjs [--mutants]
 */
import { readdirSync, existsSync } from 'node:fs'
import { importSource, sourceOf } from './_importSource.mjs'

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
const listings = [{ id: 'L1' }], roster = [{ id: 'B1', name: 'Town Hall' }, { id: 'B2', name: null, address: null }, { id: 'B3', address: '1 Main St' }]
const D = { title: 't', start_date: '2026-11-11' }
const MONUMENT = { lat: 42.0525, lon: -70.1889 }, BOSTON = { lat: 42.3601, lon: -71.0589 }
const REFUSED = [
  ['a town event with no venue', [{ ...D, id: 'a' }], /no `venue`/],
  ['a town event with no id', [{ ...D, venue: { scene: true } }], /needs a unique `id`/],
  ['a venue listing that resolves to nothing', [{ ...D, id: 'a', venue: { listing: 'nope' } }], /venue\.listing "nope" resolves to no listing/],
  ['a venue building that resolves to nothing', [{ ...D, id: 'a', venue: { building: 'nope' } }], /venue\.building "nope" resolves to no building/],
  ['a building with no name and no address', [{ ...D, id: 'a', venue: { building: 'B2' } }], /no name and no address/],
  ['a point as a bare pair', [{ ...D, id: 'a', venue: { name: 'x', point: [42.05, -70.19] } }], /is not \{ lat, lon \}/],
  ['a point outside the town\'s radius', [{ ...D, id: 'a', venue: { name: 'Boston', point: BOSTON } }], /outside the town's radius/],
  ['a venue of two forms', [{ ...D, id: 'a', venue: { listing: 'L1', building: 'B1' } }], /is not exactly one of/],
  ['a place\'s own event naming another venue', [{ ...D, listing_id: 'L1', venue: { building: 'B1' } }], /happens at the place/],
  ['links_to', [{ ...D, id: 'a', venue: { scene: true }, links_to: 'L1' }], /`links_to` is retired/],
  ['a links_to present but null (the Ward\u2019s player refuses it too)', [{ ...D, id: 'a', venue: { scene: true }, links_to: null }], /`links_to` is retired/],
  ['a duplicate id across a listing row', [{ ...D, id: 'x', venue: { scene: true } }, { ...D, id: 'x', listing_id: 'L1' }], /duplicate `id` "x"/],
  ['a scene venue not `true`', [{ ...D, id: 'a', venue: { scene: 'yes' } }], /venue\.scene/],
  ['a host listing that resolves to nothing', [{ ...D, id: 'a', venue: { scene: true }, host: { listing: 'nope' } }], /host\.listing "nope"/],
  ['a host of two forms', [{ ...D, id: 'a', venue: { scene: true }, host: { listing: 'L1', name: 'Chase' } }], /host .* is not exactly one of/],
]
const PASSES = [
  { ...D, id: 'p1', venue: { listing: 'L1' } }, { ...D, id: 'p2', venue: { building: 'B1' } }, { ...D, id: 'p3', venue: { building: 'B3' } },
  { ...D, id: 'p4', venue: { name: 'the Monument lawn', point: MONUMENT } }, { ...D, id: 'p5', venue: { scene: true }, host: { name: 'Chase' } },
  { ...D, listing_id: 'L1' }, { ...D, listing_id: 'L1', venue: { listing: 'L1' }, host: { listing: 'L1' } },
]

async function verdict({ bake, ticker, guardian, plant, pick = (ts) => ts } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const B = await importSource('cartograph/bake-content.js', bake ? { transform: bake } : {})
  const ctx = { listings, roster, inRadius: () => B.townRadius('provincetown') }
  for (const [what, rows, named] of REFUSED) {
    const { errs } = B.eventProblems(rows, ctx)
    F(errs.some(e => named.test(e)), `the bake let through ${what}${errs.length ? ` (said: ${errs.join(' · ')})` : ''}`)
  }
  const ok = B.eventProblems(PASSES, ctx)
  F(!ok.errs.length, `good rows refused: ${ok.errs.join(' · ')}`)
  // every town that keeps a calendar, read from the data dir (never a list): its own rows against its own listings, roster and radius
  const towns = readdirSync('cartograph/data').filter(t => existsSync(`cartograph/data/${t}/content/events.json`))
  F(towns.length >= 2, `only ${towns.length} town(s) keep a calendar: the real-data clause would pass on almost nothing`)
  for (const t of pick(towns)) {
    const real = JSON.parse(sourceOf(`cartograph/data/${t}/content/events.json`))
    const rows = [...(Array.isArray(real) ? real : real.events), ...(plant?.town === t ? [plant.row] : [])]
    if (!rows.length) continue
    // ⛔ never an empty stand-in for a missing file: a town with rows and no roster/listings is said, by name (Zob)
    const missing = ['listings.json', 'roster.json'].filter(f => !existsSync(`cartograph/data/${t}/content/${f}`))
    if (missing.length) { fails.push(`${t} keeps a calendar with ${rows.length} rows but has no content/${missing.join(' or content/')}`); continue }
    const L = JSON.parse(sourceOf(`cartograph/data/${t}/content/listings.json`)).listings
    const Rb = JSON.parse(sourceOf(`cartograph/data/${t}/content/roster.json`)).buildings
    const R = B.eventProblems(rows, { listings: L, roster: Rb, inRadius: () => B.townRadius(t) })
    F(!R.errs.length, `${t}'s own calendar does not validate: ${R.errs.join(' · ')}`)
  }
  // 2. the ticker
  const t = code(ticker ? ticker(sourceOf('src/components/EventTicker.jsx')) : sourceOf('src/components/EventTicker.jsx'))
  F(/function TickerEntry\(\{ opens, empty, onClick, className, children \}\) \{\s*if \(opens\) return <button/.test(t) && /return <div className=\{className\}/.test(t), 'the ticker draws an entry with nowhere to open as a button')
  F(/_opens: linkId \? 'listing' : e\.venue\?\.building \? 'building' : null/.test(t), 'the ticker does not open an event at its venue (listing or building), with a scene show opening nothing')
  F(!/links_to/.test(t), 'the ticker still reads `links_to`')
  // 3. the guardian write path (the repo's copy)
  const g = code(guardian ? guardian(sourceOf('apps-script/Code.js')) : sourceOf('apps-script/Code.js'))
  const body = g.slice(g.indexOf('function postEvent('), g.indexOf('\nfunction ', g.indexOf('function postEvent(') + 1))
  const fields = body.match(/const \{([^}]*)\} = body/)?.[1]?.split(',').map(s => s.trim()) || []
  F(fields.length > 0, 'apps-script/Code.js#postEvent: no destructured fields found to read')
  F(!fields.includes('venue') || /scene/.test(body) && /errorResponse\([^)]*scene/i.test(body), 'the guardian event path takes a `venue` without refusing the scene')
  return fails
}

// ⭐ The loop is proven to reach EVERY town (Zob): a bad row planted IN MEMORY into each town's calendar, one at a time,
// must turn the check red naming THAT town: its own calendar refused, or (no roster/listings) the refusal of the missing
// file, which this also proves can fail.
const PLANT = { id: 'planted', title: 't', start_date: '2026-11-11', venue: { name: 'Boston', point: { lat: 42.3601, lon: -71.0589 } } }
async function full(m = {}) {
  const f = await verdict(m)
  for (const t of readdirSync('cartograph/data').filter(t => existsSync(`cartograph/data/${t}/content/events.json`))) {
    const planted = await verdict({ ...m, plant: { town: t, row: PLANT } })
    if (!planted.some(x => x.startsWith(`${t}'s own calendar`) || x.startsWith(`${t} keeps a calendar`))) f.push(`a bad row planted in ${t}'s calendar did not turn the check red: the loop does not reach ${t}`)
  }
  return f
}
const fails = await full()
if (fails.length) { console.log('⛔ an event does not name its venue:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log(`✅ every event names where it happens: ${REFUSED.length} wrong rows refused by name, ${PASSES.length} good forms pass, every town's own calendar validates; the ticker opens the venue and draws a scene show as text; the guardian path (repo copy) cannot name the scene`)

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the loop reading only the first town', { pick: (ts) => ts.slice(0, 1) }],
    ['the loop skipping Provincetown', { pick: (ts) => ts.filter(t => t !== 'provincetown') }],
    ['links_to accepted', { bake: (s) => s.replace("if ('links_to' in e) err(", "if (false) err(") }],
    ['a null links_to passing', { bake: (s) => s.replace("if ('links_to' in e) err(", "if (e.links_to) err(") }],
    ['the venue not required', { bake: (s) => s.replace("if (!e.venue) err('no `venue`", "if (false) err('no `venue`") }],
    ['a nameless, addressless building passes', { bake: (s) => s.replace('if (!b.name && !b.address) return', 'if (false) return') }],
    ['the radius not asked', { bake: (s) => s.replace('if (!(inRadius ??= radiusOf())(pt.lat, pt.lon))', 'if (false)') }],
    ['a place\'s own event may name another venue', { bake: (s) => s.replace("if (e.venue && !(formOf(e.venue, VENUE_FORMS).join() === 'listing' && e.venue.listing === e.listing_id))", 'if (false)') }],
    ['duplicate ids checked on town rows only', { bake: (s) => s.replace('if (e.id) { if (seen.has(e.id))', 'if (e.id && !e.listing_id) { if (seen.has(e.id))') }],
    ['a host listing left unresolved', { bake: (s) => s.replace("else if (f[0] === 'listing' && !listingIds.has(e.host.listing))", 'else if (false)') }],
    ['a scene show drawn as a button', { ticker: (s) => s.replace('if (opens) return <button', 'if (true) return <button') }],
    ['links_to read again by the ticker', { ticker: (s) => s.replace('const linkId = e.listing_id || e.venue?.listing || null', 'const linkId = e.listing_id || e.venue?.listing || e.links_to || null') }],
    ['the guardian path taking a venue', { guardian: (s) => s.replace('const { device_hash, listing_id, title, description, start_date, end_date, type } = body', 'const { device_hash, listing_id, title, description, start_date, end_date, type, venue } = body') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await full(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
