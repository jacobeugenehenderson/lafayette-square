#!/usr/bin/env node
/**
 * claims-open-now-has-one-home-and-handles-midnight — one predicate, and it survives a
 * close that falls after midnight.
 *
 * ⛔⛔ THE PRODUCT DISAGREED WITH ITSELF ABOUT ONE BUSINESS AT ONE INSTANT. "Is this place
 * open now?" was implemented four times: `EventTicker`, `SidePanel` and `SceneNeon` were
 * byte-identical (`mins >= open && mins < close`) and `PlaceCard` had its own, which
 * handled the wrap. So the card read "Open · Closes 2:30 AM" while the ticker, the side
 * panel and the NEON SIGN all said closed. ⭐⭐ The three that AGREED were the wrong ones
 * — the repo's own zoning-table lesson: four agreeing copies are not evidence, they are
 * copies of each other.
 *
 * ⛔ AND IT WAS NOT "WRONG AFTER MIDNIGHT". With `10:00 → 02:30`, `mins >= 600 && mins <
 * 150` is false at EVERY minute, so the bar was never open at any hour and its neon never
 * lit. Measured 2026-09-22 on Knucklehead Saloon, Huron's only late venue.
 *
 * ⭐ A WHOLE CLASS, NOT A TAIL CASE: Ohio's statutory last call is 2:30, so every late bar
 * in every Ohio town lands on this value. LS has no listing that closes after midnight,
 * which is exactly why nobody saw it — invisible on town #1.
 *
 * ⭐ WHAT THIS CHECKS. (1) The behaviour, against the live module. (2) That no component
 * has grown a private copy again — it greps for the comparison's SHAPE rather than for a
 * function name, so a copy under any name is caught. ⛔ `PlaceCard` is exempt and named
 * here deliberately: it computes a label and a next-open day, not a boolean, and its own
 * wrap handling is asserted separately below rather than trusted.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const { isOpenAt, openSlotAt } = await import(path.join(ROOT, 'src/lib/openNow.js'))

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)
const at = (dow, hh, mm = 0) => new Date(2026, 8, 20 + dow, hh, mm) // 2026-09-20 is a Sunday
// The dates above are built on this machine's clock, so they are read in its zone — the town-zone reading itself is
// claims-a-town-keeps-its-own-clock's.
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

console.log('\nOpen-now has one home and handles midnight')

// ── behaviour: a window that wraps past midnight ──────────────────────────
const bar = {}
for (const d of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']) bar[d] = { open: '10:00', close: '02:30' }
const wrapCases = [[11, true], [18, true], [23, true], [0, true], [1, true], [2, true], [3, false], [9, false]]
const wrong = wrapCases.filter(([h, want]) => isOpenAt(bar, at(1, h), TZ) !== want)
if (wrong.length) bad(`a 10:00→02:30 window answered wrongly at ${wrong.map(([h]) => `${h}:00`).join(', ')} — this is the shape that read CLOSED all day`)
else ok('10:00→02:30 is open 10:00 through 02:29 and closed either side')

if (isOpenAt(bar, at(1, 2, 29), TZ) !== true || isOpenAt(bar, at(1, 2, 30), TZ) !== false) bad('the close minute is not exclusive at the wrap boundary')
else ok('02:29 open, 02:30 closed — the boundary is exclusive')

// ── behaviour: an ordinary window is unchanged, and may NOT spill ─────────
const shop = { monday: { open: '09:00', close: '17:00' } }
if (isOpenAt(shop, at(1, 12), TZ) !== true) bad('an ordinary window stopped working')
else if (isOpenAt(shop, at(2, 3), TZ) === true) bad('a NON-wrapping window spilled into the next morning — a shop that shuts at 17:00 would read open at 03:00')
else ok('an ordinary window is unchanged and does not spill')

// ── behaviour: yesterday's wrap covers this morning ───────────────────────
const monOnly = { monday: { open: '20:00', close: '01:00' } }
if (isOpenAt(monOnly, at(2, 0, 30), TZ) !== true) bad("a window opened Monday 20:00 and closing 01:00 did not cover Tuesday 00:30 — yesterday's spill is not consulted")
else ok("yesterday's wrapping window covers this morning")

// ── the slot and the boolean must come from ONE resolution ────────────────
const slot = openSlotAt(monOnly, at(2, 0, 30), TZ)
if (!slot || slot.close !== '01:00') bad('openSlotAt did not return the slot that is actually covering the instant — a caller labelling the window would read undefined.close and crash')
else ok('openSlotAt returns the covering slot, so the label cannot disagree with the test')
if (openSlotAt(shop, at(2, 3), TZ) !== null) bad('openSlotAt returned a slot while isOpenAt says closed')
else ok('openSlotAt and isOpenAt agree when closed')

// ── no component has a private copy again ─────────────────────────────────
// The SHAPE of the comparison, not a function name: a copy under any name is caught.
const SHAPE = /mins?\s*>=\s*\w+\s*\*\s*60\s*\+\s*\w+\s*&&\s*\w+\s*<\s*\w+\s*\*\s*60\s*\+\s*\w+/
const dir = path.join(ROOT, 'src/components')
const copies = readdirSync(dir).filter((f) => f.endsWith('.jsx'))
  .filter((f) => SHAPE.test(readFileSync(path.join(dir, f), 'utf8')))
if (copies.length) bad(`a private open-now comparison is back in: ${copies.join(', ')} — it will disagree with src/lib/openNow.js the first time a window wraps`)
else ok('no component reimplements the comparison')

// ── PlaceCard, once the exemption, now asks the one home (2026-09-29, the town-clock fix) ─────────────
const pc = readFileSync(path.join(dir, 'PlaceCard.jsx'), 'utf8')
if (!/openSlotAt\(hours, now\)/.test(pc)) bad('PlaceCard does not resolve open/closed through openSlotAt — a card and the neon can disagree again')
else ok('PlaceCard resolves open/closed through openSlotAt, like every other surface')

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
