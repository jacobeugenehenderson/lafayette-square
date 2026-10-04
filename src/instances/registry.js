/**
 * THE MAP REGISTRY — the town modules, keyed by MAP id, and nothing else.
 *
 * ⭐ WHY THIS IS A SEPARATE FILE FROM `src/instance.js`, AND IT IS NOT TIDINESS:
 * `instance.js` statically imports `public/looks/index.json` (it must — see the
 * comment there). That file is WRITTEN AT RUNTIME by the dev server: every bake
 * stamps `bakedAt` into it, and every look create / rename / delete rewrites it.
 * Anything that imports `instance.js` therefore has a mutable data file in its
 * static module graph — and `node --watch` watches a module graph.
 *
 * ⛔ SO A NODE SERVER THAT IMPORTS `instance.js` RESTARTS ITSELF WHENEVER IT SAVES
 * THE LOOKS INDEX. Measured 2026-09-21: `cartograph/config.js` imported
 * `instance.js`, so `cartograph/serve.js` (and `arborist/serve.js`, which imports
 * config.js) were both killed mid-request by their own watcher. The bake's last
 * act is to stamp the index and then upload the slab to R2 — the SIGTERM landed
 * during the upload, the socket closed with nothing written, and the Stage showed
 * a 500 on a pour that had actually succeeded. The orphaned upload ran on
 * parentless and never finished, so staging kept serving the previous slab with
 * nothing said. That is the plausible-looking success `CLAUDE.md` Layer 0 q2 names
 * as the worst available outcome, produced by the dev loop rather than by the code.
 *
 * ⭐ THE RULE THIS FILE EXISTS TO MAKE KEEPABLE: a Node-side importer wants the
 * TOWN, not the look→map table. It imports THIS. `instance.js` — the browser's
 * `?look=` boot — imports this too, and adds the look resolution on top.
 * ▶ node checks/claims-the-dev-servers-do-not-import-the-looks-index.mjs
 *
 * ⭐⭐ KEYED BY THE **MAP**, NOT BY THE LOOK. (Jacob, 2026-09-19: "Looks are always
 * superficial 'looks' … for now it is only cosmetic things.") A map can carry MANY
 * Looks — seasonal, sponsor — and every one of them is the same town: same
 * geography, same legal jurisdiction, same tax rate, same phone number. Keying this
 * registry by LOOK meant a winter Lafayette Square needed a second file repeating
 * all of it, to drift from the first.
 *
 * ⛔ AND THAT DUPLICATION WOULD HAVE HIDDEN THE FAILURE `instance.js` announces,
 * because a winter LS Look with no module falls back to LS and looks PERFECT —
 * right answer, wrong reason. A winter Huron Look renders St. Louis. The failure is
 * invisible on exactly the case anyone would test first.
 *
 * ⭐ There is deliberately no per-LOOK module to go with this one: a Look is
 * cosmetic, and cosmetics already travel through `design.json` → the slab
 * (`project_slab_is_the_instance_identity`). A look module would have nothing to
 * hold. What lives HERE is the fixed truth the slab does not carry.
 */
import lafayetteSquare from './lafayette-square.js'
import hipointeDemun from './hipointe-demun.js'
import huron from './huron.js'
import provincetown from './provincetown.js'

const INSTANCES = {
  'lafayette-square': lafayetteSquare,
  'hipointe-demun': hipointeDemun,
  huron,
  'provincetown': provincetown,
}

/**
 * ⛔ The registry's fallback town, and it is a DEPLOYMENT fact, not a default in
 * the ordinary sense: Lafayette Square is installation #1 and owns the bare domain.
 * It is NOT `looksIndex.default` — that is the authoring 0-state (`kit-default`), an
 * empty Look bound to no map with nothing baked.
 */
export const DEFAULT_MAP = 'lafayette-square'

/**
 * The town module for a map id, or `undefined` when the map is not registered.
 *
 * ⛔ NO FALLBACK HERE, deliberately. An unregistered map is a question the caller
 * has to answer out loud: the browser falls back LOUDLY and says whose identity the
 * page is now wearing (`instance.js#resolveInstance`); a bake-time caller has no
 * business falling back at all and must refuse. A silent `|| lafayetteSquare` in
 * this function would take that choice away from both of them.
 */
export function instanceForMap(mapId) {
  return INSTANCES[mapId]
}

/** Registered map ids — for callers that need to report what exists. */
export function registeredMaps() {
  return Object.keys(INSTANCES)
}
