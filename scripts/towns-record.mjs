// towns-record.mjs — what `towns.json` says about each town: its share card's title, description and ICON.
//
// ⭐ PER TOWN (Boz's ruling C, 2026-11-01): a town's Publish writes ITS record (scripts/publish-towns-record.mjs --map),
// read by the staging Worker; Promote pins it at `sites/<map>/towns.json` for production (src/lib/townsRecordKeys.js).
// ⛔ It reads only that town's instance and baked manifest: another town's stale bake can never refuse this town's card.
//
// ⭐⭐ THE ICON IS THE TOWN'S BAKED LOOK (BRIEF-a-town-has-one-icon; Jacob, 2026-10-31: "Get rid of the arch" · "All
// kit now"). Read from `public/baked/<map>/manifest.json`'s `look` block (the resolved identity the bake published, the
// same mark the Ward wears), drawn by src/lib/townIdentity.js#townIcon as a data: URI. Not the Look's design.json: that
// is AUTHORING, and an un-baked mark would reach crawlers before the town shows it (Zob, 2026-10-31). Not the instance
// module: its old-player branding (faviconUrl · markSvg · mark) is deleted, and with it the .com arch.
// ⛔ THE INITIAL MEANS ONE THING (Zob, 2026-10-31, Layer 0 q2): a baked Look that authors no mark, the kit's neutral.
// A town with NO baked manifest has no slab to draw, so it has no icon: `icon: null`, `iconFrom` says so, and its card
// names the missing icon. A manifest that PREDATES the identity block is a stale bake: the publish REFUSES, by name.
// Never a URL, never another town's mark. ⚠️ A copy taken at publish: a re-bake with a new mark shows on the card after
// the town's next Publish (and, in production, the next Promote).
//   ▶ node checks/claims-a-town-has-one-icon.mjs --mutants
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { townIcon } from '../src/lib/townIdentity.js'
import { registeredMaps, instanceForMap } from '../src/instances/registry.js'
import { titleOf } from '../src/lib/townRecord.js'

/**
 * A map's baked manifest (parsed, or null when there is none) → { baked: false } or { baked: true, look }.
 * ⛔ Throws on a manifest with no `look` block: a stale bake is refused, never drawn as the neutral initial.
 */
export function lookFromManifest(map, manifest) {
  if (manifest == null) return { baked: false }
  if (!manifest.look) throw new Error(`towns.json: public/baked/${map}/manifest.json predates the identity block — run the Foundry on ${map}, then publish`)
  return { baked: true, look: manifest.look }
}

export function bakedLookOf(repoRoot, map) {
  const at = join(repoRoot, 'public', 'baked', map, 'manifest.json')
  return lookFromManifest(map, existsSync(at) ? JSON.parse(readFileSync(at, 'utf8')) : null)
}

/** → { [map]: { title, description, icon, iconFrom } }: ONE town's record, from its instance and its own baked manifest. */
export function townRecordOf(repoRoot, map) {
  if (!registeredMaps().includes(map)) throw new Error(`towns.json: "${map}" is not a registered town (src/instances/registry.js)`)
  const t = instanceForMap(map), title = titleOf(t)
  const b = bakedLookOf(repoRoot, map)
  const { icon, from } = b.baked ? townIcon({ look: b.look, title })
    : { icon: null, from: `not baked: no public/baked/${map}/manifest.json` }
  return { [map]: { title, description: t.profile?.tagline || null, icon, iconFrom: from } }
}
