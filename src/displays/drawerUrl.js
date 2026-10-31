/**
 * Where a display's DRAWER is read from: ONE function, its `source` NAMED BY THE APP, never inferred from the
 * environment (Boz's ruling, 2026-10-31; Zob: inferred, a dev build of Preview would silently read authoring).
 *   'authoring'  Stage and the dev harnesses: the town's own drawer under its contentRoot (cartograph/data/<town>/content,
 *                served live in dev), so a look made by make-looks.mjs shows without a bake.
 *   'published'  Preview and the player: the copy bake-manifest published beside the slab (manifest.displays[id]), read
 *                through the slab resolver (src/lib/slabUrl.js: content names remotely, plain paths on disk). A manifest
 *                with no drawer for the display REFUSES by name: re-run bake-manifest.
 * → { drawer: url, frame: (rel) => url }, `rel` a frame path as looks.json names it (relative to the drawer).
 * ▶ node checks/claims-the-bake-carries-its-displays.mjs
 */
import { slabManifest, slabReady, slabUrl } from '../lib/slabUrl.js'

export async function drawerUrls(source, { lookId, display, contentRoot, where }) {
  const dir = display.drawer.slice(0, display.drawer.lastIndexOf('/') + 1)
  if (source === 'authoring') {
    if (contentRoot == null) throw new Error(`[displays] ⛔ ${where}: the town declares no contentRoot, so its authoring drawer has no home`)
    const base = `${import.meta.env.BASE_URL}${contentRoot}`
    return { drawer: base + display.drawer, frame: (rel) => base + dir + rel }
  }
  if (source === 'published') {
    const m = await slabManifest(lookId)
    const block = m?.displays?.[display.id]
    if (!block?.drawer) throw new Error(`[displays] ⛔ ${where}: the town's published manifest carries no drawer for display "${display.id}" — re-run node cartograph/bake-manifest.mjs --town=${lookId}`)
    await slabReady(lookId)
    return { drawer: slabUrl(lookId, block.drawer), frame: (rel) => slabUrl(lookId, 'content/' + dir + rel) }
  }
  throw new Error(`[displays] ⛔ ${where}: the app names no drawer source ("${source}"): 'authoring' (Stage) or 'published' (Preview, the player)`)
}
