#!/usr/bin/env node
/**
 * Every COMMON a scene routes must resolve to a COMPOSED species.
 *
 * ⛔⛔ THE LIST THIS CHECKS AGAINST IS `index.json.variants` — NOT the 65-name species
 * list at the top of the same file. Those are different sets and confusing them is the
 * error this check exists to catch: an agent authoring huron's mix on 2026-09-20 read the
 * species list, and its two largest routes pointed at ids nothing answers to. A species
 * NAME in the library is not a tree you can plant; a published Salon COMPOSITION is.
 *
 * ⭐ WHAT A FAILURE MEANS, because the fix is never "add the id": a dangling route bakes
 * IDENTICALLY to no route at all — both fall through to `pickVariant`'s CATEGORY_FALLBACK,
 * which is sanctioned. The difference is legibility. An UNMAPPED name reads as 🔴 gap in
 * CoverageView (the shopping list); a route to a dead id reads as ⚠ dangling and hides the
 * demand. ⇒ Fix by DELETING the route, or by composing the species — never by inventing an id.
 *
 * ⚠️ MOST SCENES FAIL THIS TODAY and that is the correct reading, not a broken check:
 * the `procedural_*` ids their maps point at were excluded from the runtime pool by the
 * NO-FILLER gate (`ARCHITECTURE.md` — Two-tier substitution) and never cleaned up.
 * ⛔ THERE IS DELIBERATELY NO SKIP LIST. A first draft of this check carried a
 * `KNOWN_DEBT` set exempting Lafayette Square, which is an enumerated per-town exception
 * table — the exact thing `CLAUDE.md` Layer 0 q1 forbids, and it would have made the check
 * green on the town with the most debt while staying loud on a fresh pour. Every scene is
 * judged by one rule. A red run is the honest state of the corpus; fix it by deleting
 * routes, not by exempting towns.
 * ⛔ And do not quote a count from this header — run the check; the numbers move.
 *
 * ▶ node checks/claims-species-map-routes-are-composed.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const idx = JSON.parse(readFileSync(join(ROOT, 'public', 'trees', 'index.json'), 'utf8'))
const composed = new Set((idx.variants || []).map(v => v.species))
if (!composed.size) { console.error('⛔ index.json has no variants — cannot judge. Bake the Grove.'); process.exit(2) }

const dataDir = join(ROOT, 'cartograph', 'data')
let failures = 0, checked = 0, totalBad = 0, totalRoutes = 0
for (const scene of readdirSync(dataDir).sort()) {
  const mapPath = join(dataDir, scene, 'tree-species-map.json')
  if (!existsSync(mapPath)) continue
  const map = JSON.parse(readFileSync(mapPath, 'utf8')).map || {}
  const bad = []
  for (const [common, ids] of Object.entries(map)) {
    for (const id of (Array.isArray(ids) ? ids : [ids])) {
      if (!composed.has(id)) bad.push(`${common} → ${id}`)
    }
  }
  checked++
  const total = Object.keys(map).length
  totalRoutes += total; totalBad += bad.length
  if (!bad.length) { console.log(`✅ ${scene}: ${total}/${total} routes composed`); continue }
  console.log(`⛔ DANGLING ${scene}: ${bad.length} of ${total} routes point at a species with no published composition`)
  for (const b of bad.slice(0, 8)) console.log(`      ${b}`)
  if (bad.length > 8) console.log(`      … and ${bad.length - 8} more`)
  failures++
}

console.log(`\n${checked} scene(s) with a species map · ${failures} failing · ${totalBad}/${totalRoutes} routes dangling`)
if (failures) {
  console.error('⛔ Delete the route or compose the species. ⛔ Never invent an id to satisfy this check.')
  process.exit(1)
}
