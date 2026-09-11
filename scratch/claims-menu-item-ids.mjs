#!/usr/bin/env node
/**
 * Does every orderable menu item have a STABLE identity?
 *
 * Runs the real `ensureMenuIds`/`auditMenuIds` from src/lib/menuIdentity.js over
 * every menu payload the app actually loads — it does not restate the rule, it
 * executes it, so it cannot drift from what the browser does at ingest.
 *
 * The three things that must hold, and why each is fatal:
 *   1. COVERAGE  — every item resolves to an id, or a cart cannot address it.
 *   2. UNIQUE    — no two items share an id, or a cart line, an order line and
 *                  a POS ref can all name the wrong food while every number
 *                  downstream still looks plausible.
 *   3. STABLE    — reordering a section must not change any id. This is the
 *                  whole point: the positional key it replaced failed exactly
 *                  here, silently, under a live cart.
 *
 *   node scratch/claims-menu-item-ids.mjs
 */
import { readFileSync } from 'node:fs'
import { ensureMenuIds, auditMenuIds, indexMenuItems } from '../src/lib/menuIdentity.js'

// The payloads src/data/loadInstanceData.js actually maps to `menus`.
const PAYLOADS = [
  ['lafayette-square', 'src/data/lafayette-square/menus.json'],
  ['hipointe-demun', 'cartograph/data/hipointe-demun/content/menus.json'],
]

const read = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'))
let failures = 0

for (const [look, rel] of PAYLOADS) {
  let raw
  try { raw = read(rel) } catch (e) { console.log(`\n${look}: UNREADABLE (${rel}) — ${e.message}`); failures++; continue }

  let items = 0, derived = 0, minted = 0, unstable = 0
  const problems = []

  for (const [listingId, menu] of Object.entries(raw)) {
    // Non-menu payloads exist in the tree (retired scenes carry a different
    // shape). Skip what isn't a menu rather than crashing on it.
    if (!menu || typeof menu !== 'object' || !Array.isArray(menu.sections)) continue

    const withIds = ensureMenuIds(menu)
    const a = auditMenuIds(withIds)
    items += a.items; derived += a.derived; minted += a.minted
    for (const p of a.problems) problems.push({ listingId, ...p })

    // 3. STABILITY — reverse every section's items and re-derive from scratch.
    // A positional key fails this by construction; an identity key must not.
    const shuffled = ensureMenuIds({
      ...menu,
      sections: menu.sections.map(sec => ({ ...sec, items: [...(sec.items || [])].reverse() })),
    })
    const before = new Set(indexMenuItems(withIds).keys())
    const after = indexMenuItems(shuffled)
    for (const id of after.keys()) if (!before.has(id)) { unstable++; problems.push({ listingId, kind: 'unstable-under-reorder', id }) }
  }

  const ok = problems.length === 0
  if (!ok) failures++
  console.log(`\n${look}  (${rel})`)
  console.log(`  items ${items} · derived ${derived} · minted ${minted} · unstable-under-reorder ${unstable}`)
  console.log(`  ${ok ? 'PASS — every item addressable, unique, and stable under reorder' : `FAIL — ${problems.length} problem(s)`}`)
  for (const p of problems.slice(0, 10)) console.log(`    ${p.kind}: ${p.listingId} ${p.id || ''} ${p.item || ''}`)
  if (problems.length > 10) console.log(`    … and ${problems.length - 10} more`)
}

console.log(`\n${failures === 0 ? 'ALL PAYLOADS PASS' : `${failures} PAYLOAD(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
