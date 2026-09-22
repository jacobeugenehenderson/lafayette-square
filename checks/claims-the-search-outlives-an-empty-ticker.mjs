#!/usr/bin/env node
/**
 * claims-the-search-outlives-an-empty-ticker — the header's chrome may not be gated on
 * how many ticker entries a town happens to have right now.
 *
 * ⛔⛔ `EventTicker` RENDERS MORE THAN THE TICKER. Inside its one return sit the two glass
 * zones the whole top bar is made of, the bottom edge highlight, and `SearchDrawer` — the
 * ONLY pulldown search in the player. So `if (tickerItems.length === 0) return null`
 * removed the town's search, not just its headline, and an empty ticker was
 * indistinguishable from an unwired one.
 *
 * ⭐ IT IS A TIME-OF-DAY HOLE, WHICH IS WHY IT LIVED SO LONG. Entries are built by
 * `_isOpenNow`, so the bar disappeared every night and came back by morning — nobody
 * looking in daylight at a well-stocked town could see it. Measured on huron 2026-09-22:
 * the eligible listings are open 07:00–21:00, so the search was gone for ten hours a day,
 * and on a Monday for twenty. ⚠️ Worse the thinner the directory — the kit's signature
 * shape, invisible on town #1.
 *
 * ⭐ WHAT THIS CHECKS, AND WHY IT IS NOT A RESTATEMENT. It parses the component's early
 * returns out of the source and asserts none of them mentions the entry list. It does not
 * carry a copy of the allowed guards: rename `tickerItems` and the check follows, because
 * it finds the array from the `useState` that declares it. ⛔ The deliberate suppressions
 * (planetarium, an open card, a full panel) are untouched — those hide the chrome ON
 * PURPOSE, and this check must not freeze them either way.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const FILE = 'src/components/EventTicker.jsx'
const src = readFileSync(path.join(ROOT, FILE), 'utf8')

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe search outlives an empty ticker')

// Find the entry-list state variable rather than hardcoding its name, so a rename
// cannot quietly retire this check.
const decl = src.match(/const\s*\[\s*(\w+)\s*,\s*set\w+\s*\]\s*=\s*useState\(\[\]\)/)
if (!decl) { bad(`no \`useState([])\` entry list found in ${FILE} — cannot locate what to guard`); process.exit(1) }
const ENTRIES = decl[1]
ok(`entry list read from the source: \`${ENTRIES}\``)

// SearchDrawer must actually be rendered by this component, or the premise is stale
// and the check would pass for the wrong reason.
if (!/<SearchDrawer\s*\/>/.test(src)) {
  bad('`<SearchDrawer />` is no longer rendered here — re-point this check at wherever the search now lives')
} else {
  ok('`<SearchDrawer />` is rendered inside this component')
}

// Every `if (...) return null` in the component body.
const guards = [...src.matchAll(/^\s*if\s*\((.+?)\)\s*return null/gm)].map((m) => m[1].trim())
if (!guards.length) { bad('no early returns found — the parse is wrong, not the code'); process.exit(1) }
ok(`${guards.length} early return${guards.length === 1 ? '' : 's'} parsed`)

const entryGated = guards.filter((g) => new RegExp(`\\b${ENTRIES}\\b`).test(g))
for (const g of entryGated) {
  bad(`an early return is gated on the entry list — \`if (${g}) return null\`\n` +
      `     This takes the search, both glass zones and the edge highlight down with the\n` +
      `     headline. Render the bar and leave the ticker text empty instead.`)
}
if (!entryGated.length) ok(`no early return mentions \`${ENTRIES}\` — the chrome survives a town with nothing open`)

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
