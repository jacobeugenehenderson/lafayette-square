// towns-record.mjs — what `towns.json` says about each town: its share card's title, description and ICON.
//
// ⭐ Written by publish-player-to-staging.mjs beside the player; both site Workers read it for the card
// (src/lib/shareCard.js#cardFor), production from the copy Promote pins at `player/<map>/towns.json`.
// ⛔ Generated from the instance REGISTRY, never a list here.
//
// ⭐⭐ THE ICON IS THE TOWN'S BAKED LOOK (BRIEF-a-town-has-one-icon; Jacob, 2026-10-31: "Get rid of the arch" · "All
// kit now"). Read from `public/baked/<map>/manifest.json`'s `look` block (the resolved identity the bake published, the
// same mark the Ward wears), drawn by src/lib/townIdentity.js#townIcon as a data: URI. Not the Look's design.json: that
// is AUTHORING, and an un-baked mark would reach crawlers before the town shows it (Zob, 2026-10-31). Not the instance
// module: its old-player branding (faviconUrl · markSvg · mark) is deleted, and with it the .com arch.
// ⛔ A town with no baked manifest, or a baked Look with no mark, gets its INITIAL, and `iconFrom` says why. Never a
// URL, never another town's mark. ⚠️ A copy taken at publish: a re-bake with a new mark shows on the card after the
// next player publish (and, in production, the next Promote).
//   ▶ node checks/claims-a-town-has-one-icon.mjs --mutants
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { townIcon } from '../src/lib/townIdentity.js'
import { registeredMaps, instanceForMap } from '../src/instances/registry.js'
import { titleOf } from '../src/lib/townRecord.js'

/** The baked manifest's `look` block for a map → { look, why }: `look` null with the reason it is missing. */
export function bakedLookOf(repoRoot, map) {
  const at = join(repoRoot, 'public', 'baked', map, 'manifest.json')
  if (!existsSync(at)) return { look: null, why: `no baked manifest at public/baked/${map}/manifest.json` }
  const look = JSON.parse(readFileSync(at, 'utf8')).look
  if (!look) return { look: null, why: `public/baked/${map}/manifest.json predates the identity block (re-bake it)` }
  return { look, why: 'its baked Look authors no mark' }
}

/** → { [map]: { title, description, icon, iconFrom } } for every registered town. */
export function buildTownsRecord(repoRoot) {
  const towns = {}
  for (const m of registeredMaps()) {
    const t = instanceForMap(m), title = titleOf(t)
    const { look, why } = bakedLookOf(repoRoot, m)
    const { icon, from } = townIcon({ look, title, why })
    towns[m] = { title, description: t.profile?.tagline || null, icon, iconFrom: from }
  }
  return towns
}
