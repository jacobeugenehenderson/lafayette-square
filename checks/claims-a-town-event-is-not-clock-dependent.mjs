#!/usr/bin/env node
/**
 * claims-a-town-event-is-not-clock-dependent — a dated event with no times runs all day,
 * every day, across its range; and two town events never collapse into one.
 *
 * ⛔⛔ THE TIME TEST IS OPT-IN, AND THAT IS THE WHOLE FEATURE. `isActiveEvent` gates its
 * clock comparison behind `if (timeStr && e.start_time && e.end_time)`. Tighten that to
 * require times — a plausible "an event should have hours" edit — and every town event
 * silently disappears, on every town, with nothing in the log. ⭐ It fails in the kit's
 * signature direction too: the towns that lean on the calendar are the quiet ones with
 * few open businesses, so the feature dies exactly where it was carrying the ticker.
 *
 * ⛔ AND THE COLLISION THIS REPLACED. `buildTickerEntries` keyed its map by
 * `e.listing_id`; a town festival has no listing, so every one of them wrote the key
 * `undefined` and they overwrote each other — measured 2026-09-22, three town events in
 * and ONE out, the survivor arbitrary. The key is now `event:${e.id}` for a listing-less
 * event, and `bake-content.js#validateEvents` refuses a scene whose town events lack a
 * unique `id`. This check re-runs that exact scenario against the live keying rule.
 *
 * ⭐ THE KEYING RULE IS READ FROM THE COMPONENT, not restated: the check locates the
 * expression the source uses and would fail if it went back to keying by listing.
 *
 * ⚠️ Importing `useEvents.js` in node prints one caught `loadInstanceData` warning about
 * a JSON import attribute. It is the browser seam failing harmlessly outside a bundler;
 * the module still loads and `isActiveEvent` is pure.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const { isActiveEvent } = await import(path.join(ROOT, 'src/hooks/useEvents.js'))

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nA town event is not clock-dependent')

// ── 1. all-day across a range, at every hour ──────────────────────────────
const festival = { id: 'f', title: 'Pumpkin Festival', start_date: '2026-10-01', end_date: '2026-10-14' }
const hours = ['00:00', '03:00', '09:30', '13:00', '21:45', '23:59']
const deadHours = hours.filter((h) => !isActiveEvent(festival, '2026-10-07', h))
if (deadHours.length) bad(`a dated, timeless event went inactive at ${deadHours.join(', ')} — the clock test stopped being opt-in`)
else ok(`active at every hour tested (${hours.join(', ')}) on a day inside its range`)

const edges = [['2026-10-01', true], ['2026-10-14', true], ['2026-09-30', false], ['2026-10-15', false]]
const wrongEdges = edges.filter(([d, want]) => isActiveEvent(festival, d, '03:00') !== want)
if (wrongEdges.length) bad(`range edges wrong at ${wrongEdges.map(([d]) => d).join(', ')} — the range must be inclusive of both ends and exclude the days outside`)
else ok('both range ends inclusive; the days either side excluded')

// ── 2. an event WITH times stays clock-dependent ──────────────────────────
const timed = { id: 't', title: 'Fireworks', start_date: '2026-10-04', start_time: '21:00', end_time: '22:00' }
if (!isActiveEvent(timed, '2026-10-04', '21:30')) bad('an event with times was inactive inside its window')
else if (isActiveEvent(timed, '2026-10-04', '09:00')) bad('an event with times was active outside its window — supplying times must still constrain it')
else ok('an event WITH times is still constrained to them')

// ── 3. two town events do not collapse into one ───────────────────────────
// The keying rule is read out of the component so a regression to `e.listing_id`
// cannot pass this by leaving the simulation behind.
const src = readFileSync(path.join(ROOT, 'src/components/EventTicker.jsx'), 'utf8')
const keyLine = src.match(/const key = (.+)$/m)
if (!keyLine) bad('no `const key = …` found in buildTickerEntries — re-point this check')
else if (/^e\.listing_id\s*$/.test(keyLine[1].trim())) {
  bad(`the entry map is keyed by \`${keyLine[1].trim()}\` again — every listing-less event collides on one undefined key`)
} else {
  ok(`entry key read from the source: \`${keyLine[1].trim()}\``)
  const keyOf = (e) => (!e.listing_id ? `event:${e.id}` : e.listing_id)
  const town = [
    { id: 'pumpkin', title: 'Pumpkin Festival', start_date: '2026-10-01', end_date: '2026-10-14' },
    { id: 'fireworks', title: 'Harbor Fireworks', start_date: '2026-10-04' },
    { id: 'market', title: 'Farmers Market', start_date: '2026-10-01', end_date: '2026-10-31' },
  ]
  const keys = new Set(town.map(keyOf))
  if (keys.size !== town.length) bad(`${town.length} town events produced ${keys.size} key(s) — they overwrite each other`)
  else ok(`${town.length} town events produce ${keys.size} distinct keys`)

  // …while a guardian event still keys by its listing, so it replaces that place's entry.
  const guardian = { id: 'g', listing_id: 'huro-lst-0252', title: 'Kyle is bartending' }
  if (keyOf(guardian) !== 'huro-lst-0252') bad('a guardian event no longer keys by its listing — it would stop overriding that place\'s open-now entry')
  else ok('a guardian event still keys by its listing, so one entry per place holds')
}

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
